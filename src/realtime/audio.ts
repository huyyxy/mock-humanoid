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

export interface AudioCaptureOptions {
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoGainControl: boolean;
}

export interface AudioCaptureSettings {
  echoCancellation?: boolean;
  noiseSuppression?: boolean;
  autoGainControl?: boolean;
  sampleRate?: number;
  channelCount?: number;
}

export class PcmMicrophone {
  private context?: AudioContext;
  private stream?: MediaStream;
  private source?: MediaStreamAudioSourceNode;
  private processor?: AudioWorkletNode;
  private mute?: GainNode;
  private pending: number[] = [];
  private active = false;
  private hasAudio = false;

  constructor(private send: (base64: string) => void, private onLevel: (level: number) => void) {}

  async prepare(options: AudioCaptureOptions): Promise<AudioCaptureSettings> {
    if (this.stream && this.context) return this.settings;
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('当前浏览器不支持麦克风采集');
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, ...options } });
    const track = this.stream.getAudioTracks()[0];
    if (!track || track.readyState !== 'live') { this.stream.getTracks().forEach((item) => item.stop()); this.stream = undefined; throw new Error('媒体流中没有可用的麦克风轨道'); }
    try {
      this.context = new AudioContext(); await this.context.audioWorklet.addModule('/audio-capture-worklet.js'); await this.context.resume(); this.source = this.context.createMediaStreamSource(this.stream);
      this.processor = new AudioWorkletNode(this.context, 'pcm-capture-processor'); this.processor.port.onmessage = (event: MessageEvent<Float32Array>) => this.processInput(event.data);
      this.mute = this.context.createGain(); this.mute.gain.value = 0;
      return this.settings;
    } catch (error) { await this.stop(); throw error; }
  }

  async start(options?: AudioCaptureOptions) {
    if (this.active) return;
    if (!this.stream || !this.context) {
      if (!options) throw new Error('麦克风尚未准备');
      await this.prepare(options);
    }
    await this.context!.resume(); this.pending = []; this.hasAudio = false;
    try { this.source!.connect(this.processor!); this.processor!.connect(this.mute!); this.mute!.connect(this.context!.destination); this.active = true; } catch (error) { this.pause(); throw error; }
  }

  pause() {
    this.active = false; this.pending = []; this.onLevel(0); this.source?.disconnect(); this.processor?.disconnect(); this.mute?.disconnect();
  }

  async stop() {
    this.pause(); this.hasAudio = false; this.stream?.getTracks().forEach((track) => track.stop()); await this.context?.close();
    if (this.processor) this.processor.port.onmessage = null;
    this.processor = undefined; this.mute = undefined; this.source = undefined; this.stream = undefined; this.context = undefined;
  }

  get isActive() { return this.active; }
  get capturedAudio() { return this.hasAudio; }
  get settings(): AudioCaptureSettings { const value = this.stream?.getAudioTracks()[0]?.getSettings?.() || {}; return { echoCancellation: value.echoCancellation, noiseSuppression: value.noiseSuppression, autoGainControl: value.autoGainControl, sampleRate: value.sampleRate, channelCount: value.channelCount }; }

  private processInput(input: Float32Array) {
    if (!this.active || !this.context) return;
    const ratio = this.context.sampleRate / 24000; const outputLength = Math.floor(input.length / ratio); let sum = 0;
    for (let i = 0; i < outputLength; i++) { const value = input[Math.min(input.length - 1, Math.floor(i * ratio))]; this.pending.push(Math.max(-1, Math.min(1, value))); sum += value * value; }
    this.onLevel(Math.sqrt(sum / Math.max(1, outputLength)));
    while (this.pending.length >= 2400) { const chunk = this.pending.splice(0, 2400); const pcm = new Int16Array(chunk.length); for (let i = 0; i < chunk.length; i++) pcm[i] = chunk[i] < 0 ? chunk[i] * 0x8000 : chunk[i] * 0x7fff; this.send(int16ToBase64(pcm)); this.hasAudio = true; }
  }
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
