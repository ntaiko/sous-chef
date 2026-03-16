const INPUT_SAMPLE_RATE = 16000;
const OUTPUT_SAMPLE_RATE = 24000;

/** Convert float [-1,1] to 16-bit PCM little-endian bytes (s16le). */
function floatTo16BitPcmLe(float32: Float32Array): Uint8Array {
  const out = new Uint8Array(float32.length * 2);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    const sample = s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff);
    const u16 = sample & 0xffff;
    out[i * 2] = u16 & 0xff;
    out[i * 2 + 1] = (u16 >> 8) & 0xff;
  }
  return out;
}

/** Resample to exactly targetLength samples (for consistent chunk size at 16 kHz). */
function resampleToLength(
  input: Float32Array,
  fromRate: number,
  toRate: number,
  targetLength: number,
): Float32Array {
  if (fromRate === toRate && input.length === targetLength) return input;
  const output = new Float32Array(targetLength);
  const ratio = (input.length - 1) / Math.max(1, targetLength - 1);
  for (let i = 0; i < targetLength; i++) {
    const srcIndex = i * ratio;
    const srcIndexFloor = Math.floor(srcIndex);
    const frac = srcIndex - srcIndexFloor;
    const next = srcIndexFloor + 1 < input.length ? input[srcIndexFloor + 1] : input[srcIndexFloor];
    output[i] = input[srcIndexFloor] * (1 - frac) + next * frac;
  }
  return output;
}

export interface LiveAudioCaptureOptions {
  stream: MediaStream;
  onChunk: (pcmBase64: string) => void;
  onStopped?: () => void;
}

const CAPTURE_WORKLET_URL = '/audio-processors/capture.worklet.js';

/** Base64-encode Uint8Array without hitting apply() argument limit. */
function toBase64(u8: Uint8Array): string {
  const chunkSize = 8192;
  let binary = '';
  for (let i = 0; i < u8.length; i += chunkSize) {
    const chunk = u8.subarray(i, Math.min(i + chunkSize, u8.length));
    binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
  }
  return btoa(binary);
}

/** Capture microphone and call onChunk with base64-encoded 16 kHz 16-bit PCM mono, s16le. Uses AudioWorklet. */
export async function startLiveAudioCapture(options: LiveAudioCaptureOptions): Promise<() => void> {
  const { stream, onChunk, onStopped } = options;
  const ctx = new AudioContext();
  if (ctx.state === 'suspended') {
    await ctx.resume();
  }
  const rate = ctx.sampleRate;

  const workletUrl = new URL(CAPTURE_WORKLET_URL, location.origin).href;
  await ctx.audioWorklet.addModule(workletUrl);

  const worklet = new AudioWorkletNode(ctx, 'live-capture-processor', { numberOfOutputs: 1 });
  const source = ctx.createMediaStreamSource(stream);
  const silent = ctx.createGain();
  silent.gain.value = 0;

  let floatBuffer: number[] = [];
  const samplesPerChunk = Math.floor(INPUT_SAMPLE_RATE * 0.03); // 30 ms at 16k (within 20–40 ms guidance)

  worklet.port.onmessage = (e: MessageEvent<{ type: string; data: Float32Array }>) => {
    if (e.data?.type !== 'audio' || !(e.data.data instanceof Float32Array)) return;
    const arr = e.data.data;
    for (let i = 0; i < arr.length; i++) floatBuffer.push(arr[i]);
    const needed = Math.ceil((samplesPerChunk / INPUT_SAMPLE_RATE) * rate);
    while (floatBuffer.length >= needed) {
      const slice = floatBuffer.splice(0, needed);
      const float32 = new Float32Array(slice);
      const resampled = resampleToLength(float32, rate, INPUT_SAMPLE_RATE, samplesPerChunk);
      const u8 = floatTo16BitPcmLe(resampled);
      onChunk(toBase64(u8));
    }
  };

  source.connect(worklet);
  worklet.connect(silent);
  silent.connect(ctx.destination);

  return () => {
    worklet.disconnect();
    source.disconnect();
    ctx.close();
    onStopped?.();
  };
}

export interface LiveAudioPlaybackOptions {
  onInterrupt?: () => void;
  /** Called with normalized level (0–1) for each playback chunk. */
  onLevel?: (level: number) => void;
}

/** Play 24 kHz 16-bit PCM chunks (base64) with minimal buffering. */
export class LiveAudioPlayback {
  private ctx: AudioContext | null = null;
  private nextStartTime = 0;
  private readonly activeSources: AudioBufferSourceNode[] = [];
  private onInterrupt?: () => void;
  private onLevel?: (level: number) => void;

  constructor(options: LiveAudioPlaybackOptions = {}) {
    this.onInterrupt = options.onInterrupt;
    this.onLevel = options.onLevel;
  }

  play(pcmBase64: string): void {
    const bytes = Uint8Array.from(atob(pcmBase64), (c) => c.charCodeAt(0));
    const pcm = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.length / 2);
    if (!this.ctx) this.ctx = new AudioContext({ sampleRate: OUTPUT_SAMPLE_RATE });
    const numChannels = 1;
    const frameCount = pcm.length;
    const buffer = this.ctx.createBuffer(numChannels, frameCount, OUTPUT_SAMPLE_RATE);
    const channel = buffer.getChannelData(0);
    let sumSq = 0;
    for (let i = 0; i < frameCount; i++) {
      const v = pcm[i] / (pcm[i] < 0 ? 0x8000 : 0x7fff);
      channel[i] = v;
      sumSq += v * v;
    }
    if (this.onLevel && frameCount > 0) {
      const rms = Math.sqrt(sumSq / frameCount);
      const level = Math.min(1, rms * 3);
      this.onLevel(level);
    }
    const now = this.ctx.currentTime;
    if (this.nextStartTime < now) this.nextStartTime = now;
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.ctx.destination);
    this.activeSources.push(source);
    source.onended = () => {
      const i = this.activeSources.indexOf(source);
      if (i !== -1) this.activeSources.splice(i, 1);
    };
    source.start(this.nextStartTime);
    this.nextStartTime += buffer.duration;
  }

  /** On server "interrupted": stop all scheduled playback so agent stops talking over the user (best practice: flush buffer). */
  interrupt(): void {
    const now = this.ctx?.currentTime ?? 0;
    for (const source of this.activeSources) {
      try {
        source.onended = null;
        source.stop(now);
      } catch {
        // already stopped
      }
    }
    this.activeSources.length = 0;
    if (this.ctx) this.nextStartTime = now;
    this.onInterrupt?.();
  }

  dispose(): void {
    this.interrupt();
    this.ctx?.close();
    this.ctx = null;
  }
}
