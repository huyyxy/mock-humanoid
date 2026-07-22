function int16ToBase64(samples: Int16Array) {
  const bytes = new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength);
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(binary);
}

export function base64ToInt16(value: string) {
  const binary = atob(value); const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Int16Array(bytes.buffer);
}

export class PcmMicrophone {
  private context?: AudioContext;
  private stream?: MediaStream;
  private source?: MediaStreamAudioSourceNode;
  private processor?: ScriptProcessorNode;
  private mute?: GainNode;
  private pending: number[] = [];
  private active = false;

  constructor(private send: (base64: string) => void, private onLevel: (level: number) => void) {}

  async start() {
    if (this.active) return;
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    this.context = new AudioContext(); await this.context.resume(); this.source = this.context.createMediaStreamSource(this.stream);
    this.processor = this.context.createScriptProcessor(4096, 1, 1);
    this.processor.onaudioprocess = (event) => {
      const input = event.inputBuffer.getChannelData(0); const ratio = this.context!.sampleRate / 24000; const outputLength = Math.floor(input.length / ratio);
      let sum = 0;
      for (let i = 0; i < outputLength; i++) { const value = input[Math.min(input.length - 1, Math.floor(i * ratio))]; this.pending.push(Math.max(-1, Math.min(1, value))); sum += value * value; }
      this.onLevel(Math.sqrt(sum / Math.max(1, outputLength)));
      while (this.pending.length >= 2400) { const chunk = this.pending.splice(0, 2400); const pcm = new Int16Array(chunk.length); for (let i = 0; i < chunk.length; i++) pcm[i] = chunk[i] < 0 ? chunk[i] * 0x8000 : chunk[i] * 0x7fff; this.send(int16ToBase64(pcm)); }
    };
    this.mute = this.context.createGain(); this.mute.gain.value = 0;
    this.source.connect(this.processor); this.processor.connect(this.mute); this.mute.connect(this.context.destination); this.active = true;
  }

  async stop() {
    this.active = false; this.pending = []; this.onLevel(0); this.processor?.disconnect(); this.mute?.disconnect(); this.source?.disconnect(); this.stream?.getTracks().forEach((track) => track.stop()); await this.context?.close();
    this.processor = undefined; this.mute = undefined; this.source = undefined; this.stream = undefined; this.context = undefined;
  }

  get isActive() { return this.active; }
}

export class PcmPlayer {
  private context?: AudioContext;
  private nextStart = 0;
  private sources = new Set<AudioBufferSourceNode>();
  constructor(private onLevel: (level: number) => void) {}

  async add(base64: string) {
    this.context ||= new AudioContext({ sampleRate: 24000 }); await this.context.resume(); const pcm = base64ToInt16(base64); const buffer = this.context.createBuffer(1, pcm.length, 24000); const channel = buffer.getChannelData(0); let sum = 0;
    for (let i = 0; i < pcm.length; i++) { channel[i] = pcm[i] / 32768; sum += channel[i] * channel[i]; }
    this.onLevel(Math.sqrt(sum / Math.max(1, pcm.length))); const source = this.context.createBufferSource(); source.buffer = buffer; source.connect(this.context.destination); const start = Math.max(this.context.currentTime + 0.02, this.nextStart); source.start(start); this.nextStart = start + buffer.duration; this.sources.add(source); source.onended = () => { this.sources.delete(source); if (!this.sources.size) this.onLevel(0); };
  }

  stop() { for (const source of this.sources) { try { source.stop(); } catch { /* already stopped */ } } this.sources.clear(); this.nextStart = 0; this.onLevel(0); }
  async close() { this.stop(); await this.context?.close(); this.context = undefined; }
}
