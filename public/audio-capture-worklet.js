class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Float32Array(2048);
    this.offset = 0;
  }

  process(inputs) {
    const input = inputs[0]?.[0];
    if (!input) return true;
    let readOffset = 0;
    while (readOffset < input.length) {
      const count = Math.min(input.length - readOffset, this.buffer.length - this.offset);
      this.buffer.set(input.subarray(readOffset, readOffset + count), this.offset);
      this.offset += count;
      readOffset += count;
      if (this.offset === this.buffer.length) {
        this.port.postMessage(this.buffer, [this.buffer.buffer]);
        this.buffer = new Float32Array(2048);
        this.offset = 0;
      }
    }
    return true;
  }
}

registerProcessor('pcm-capture-processor', PcmCaptureProcessor);
