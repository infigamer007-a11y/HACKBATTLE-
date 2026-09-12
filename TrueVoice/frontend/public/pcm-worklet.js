class PcmWorklet extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.inSampleRate = options?.processorOptions?.sampleRate || 48000;
    this.targetSampleRate = 16000;
    this.inBuf = new Float32Array(0);
    this.outBuf = new Int16Array(0);
  }
  process(inputs) {
    const x = inputs[0]?.[0];
    if (!x) return true;

    const merged = new Float32Array(this.inBuf.length + x.length);
    merged.set(this.inBuf);
    merged.set(x, this.inBuf.length);

    const ratio = this.inSampleRate / this.targetSampleRate;
    const outLen = Math.floor(merged.length / ratio);
    if (outLen > 0) {
      const dec = new Int16Array(outLen);
      for (let i = 0; i < outLen; i++) {
        const idx = Math.floor(i * ratio);
        const a = merged[idx] || 0;
        dec[i] = Math.max(-1, Math.min(1, a)) * 0x7FFF;
      }
      const consumed = Math.floor(outLen * ratio);
      this.inBuf = merged.slice(consumed);

      const m2 = new Int16Array(this.outBuf.length + dec.length);
      m2.set(this.outBuf);
      m2.set(dec, this.outBuf.length);

      const FRAME = 640;
      let off = 0;
      while (m2.length - off >= FRAME) {
        const f = m2.slice(off, off + FRAME);
        this.port.postMessage(f.buffer, [f.buffer]);
        off += FRAME;
      }
      this.outBuf = m2.slice(off);
    } else {
      this.inBuf = merged;
    }
    return true;
  }
}
registerProcessor("pcm-worklet", PcmWorklet);
