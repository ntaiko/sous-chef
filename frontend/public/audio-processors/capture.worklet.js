class CaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bufferSize = 1024;
    this.buffer = new Float32Array(this.bufferSize);
    this.index = 0;
  }

  process(inputs, _outputs, _parameters) {
    const channel0 = inputs[0]?.[0];
    if (!channel0 || channel0.length === 0) return true;
    // If stereo, use only left channel (channel 0) so output is mono
    for (let i = 0; i < channel0.length; i++) {
      this.buffer[this.index++] = channel0[i];
      if (this.index >= this.bufferSize) {
        this.port.postMessage({ type: 'audio', data: this.buffer.slice(0) });
        this.index = 0;
      }
    }
    return true;
  }
}

registerProcessor('live-capture-processor', CaptureProcessor);
