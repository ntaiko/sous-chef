/**
 * Capture video at 1 FPS as JPEG 768x768 for Gemini Live API.
 * @see: https://docs.cloud.google.com/vertex-ai/generative-ai/docs/live-api/get-started-sdk
 */
const CAPTURE_WIDTH = 768;
const CAPTURE_HEIGHT = 768;
const CAPTURE_INTERVAL_MS = 1000;

export interface LiveVideoCaptureOptions {
  stream: MediaStream;
  onFrame: (jpegBase64: string) => void;
  onStopped?: () => void;
}

/** Start capturing video frames at 1 FPS, 768x768 JPEG. Returns stop function. */
export function startLiveVideoCapture(options: LiveVideoCaptureOptions): () => void {
  const { stream, onFrame, onStopped } = options;
  const videoTrack = stream.getVideoTracks()[0];
  if (!videoTrack) {
    stream.getTracks().forEach((t) => t.stop());
    onStopped?.();
    return () => {};
  }

  const video = document.createElement('video');
  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  video.setAttribute('playsinline', '');
  video.setAttribute('webkit-playsinline', '');

  const canvas = document.createElement('canvas');
  canvas.width = CAPTURE_WIDTH;
  canvas.height = CAPTURE_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    stream.getTracks().forEach((t) => t.stop());
    onStopped?.();
    return () => {};
  }

  let stopped = false;
  let intervalId: ReturnType<typeof setInterval> | null = null;

  const capture = () => {
    if (stopped || !intervalId) return;
    if (video.readyState < 2) return;
    try {
      ctx.drawImage(video, 0, 0, CAPTURE_WIDTH, CAPTURE_HEIGHT);
    } catch {
      return;
    }
    canvas.toBlob(
      (blob) => {
        if (!blob || stopped) return;
        const reader = new FileReader();
        reader.onloadend = () => {
          const dataUrl = reader.result as string;
          const base64 = dataUrl.split(',')[1];
          if (base64) onFrame(base64);
        };
        reader.readAsDataURL(blob);
      },
      'image/jpeg',
      0.85,
    );
  };

  const startCaptureLoop = () => {
    if (stopped) return;
    intervalId = setInterval(capture, CAPTURE_INTERVAL_MS);
  };

  video.onerror = () => {
    if (!stopped) {
      stopped = true;
      stream.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
      onStopped?.();
    }
  };
  video.onloadedmetadata = () => {
    if (stopped) return;
    video
      .play()
      .then(startCaptureLoop)
      .catch(() => {
        if (!stopped) onStopped?.();
      });
  };

  return () => {
    stopped = true;
    if (intervalId) clearInterval(intervalId);
    intervalId = null;
    stream.getTracks().forEach((t) => t.stop());
    video.srcObject = null;
    video.onerror = null;
    video.onloadedmetadata = null;
    onStopped?.();
  };
}
