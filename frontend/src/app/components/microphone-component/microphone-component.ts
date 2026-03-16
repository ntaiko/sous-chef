import { Component, signal, output, input, OnDestroy } from '@angular/core';

export type MicState = 'idle' | 'requesting' | 'listening' | 'denied' | 'error';

@Component({
  selector: 'app-microphone-component',
  templateUrl: './microphone-component.html',
  styleUrl: './microphone-component.css',
})
export class MicrophoneComponent implements OnDestroy {
  /** Assistant name shown next to the mic (e.g. "Sous Chef"). */
  readonly assistantName = input<string>('Sous Chef');

  /** Emitted when the user grants access; passes the MediaStream (for parent to use with audio context, etc.). */
  readonly streamReady = output<MediaStream>();
  /** Emitted when the mic is turned off (stream stopped). */
  readonly streamEnded = output<void>();
  /** Emitted when state changes (idle, requesting, listening, denied, error). */
  readonly stateChange = output<MicState>();

  readonly state = signal<MicState>('idle');
  readonly level = signal(0);

  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private animationFrameId: number | null = null;

  async toggle(): Promise<void> {
    const current = this.state();
    if (current === 'requesting') return;

    if (current === 'listening') {
      this.stop();
      return;
    }

    await this.requestAndStart();
  }

  /** Start listening programmatically (e.g. when wake word "Hey, [name]" is detected). No-op if already listening or requesting. */
  async startListening(): Promise<void> {
    const current = this.state();
    if (current === 'listening' || current === 'requesting') return;
    await this.requestAndStart();
  }

  private async requestAndStart(): Promise<void> {
    this.setState('requesting');

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      this.setState('listening');
      this.streamReady.emit(this.stream);

      this.setupAnalyser();
      this.startLevelLoop();
    } catch (err) {
      const isDenied =
        err instanceof DOMException &&
        (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError');
      this.setState(isDenied ? 'denied' : 'error');
    }
  }

  private setupAnalyser(): void {
    if (!this.stream) return;
    try {
      this.audioContext = new AudioContext();
      const source = this.audioContext.createMediaStreamSource(this.stream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.8;
      source.connect(this.analyser);
    } catch {
      // Analyser is optional; mic still works
    }
  }

  private startLevelLoop(): void {
    if (!this.analyser) return;

    const data = new Uint8Array(this.analyser.frequencyBinCount);

    const loop = (): void => {
      if (this.state() !== 'listening') return;
      this.analyser!.getByteFrequencyData(data);
      const sum = data.reduce((a, b) => a + b, 0);
      const avg = data.length > 0 ? sum / data.length : 0;
      this.level.set(Math.min(100, (avg / 255) * 150));
      this.animationFrameId = requestAnimationFrame(loop);
    };
    loop();
  }

  private stop(): void {
    this.animationFrameId != null && cancelAnimationFrame(this.animationFrameId);
    this.animationFrameId = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.audioContext?.close();
    this.audioContext = null;
    this.analyser = null;
    this.level.set(0);
    this.setState('idle');
    this.streamEnded.emit();
  }

  private setState(s: MicState): void {
    this.state.set(s);
    this.stateChange.emit(s);
  }

  ngOnDestroy(): void {
    this.stop();
  }

  get statusLabel(): string {
    const name = this.assistantName() || 'Sous Chef';
    switch (this.state()) {
      case 'idle':
        return `Click the microphone to start talking with ${name}!`;
      case 'requesting':
        return 'Requesting access...';
      case 'listening':
        return `${name} is listening...`;
      case 'denied':
        return 'Microphone access denied';
      case 'error':
        return 'Could not access microphone';
      default:
        return '';
    }
  }
}
