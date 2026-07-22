import { afterEach, describe, expect, it, vi } from 'vitest';
import { PcmMicrophone } from '../src/realtime/audio';

class FakeNode {
  connectedTo: unknown;
  connect(target: unknown) { this.connectedTo = target; return target; }
  disconnect() { this.connectedTo = undefined; }
}

class FakeAudioContext {
  static last?: FakeAudioContext;
  destination = new FakeNode();
  source = new FakeNode();
  gain = Object.assign(new FakeNode(), { gain: { value: 1 } });
  audioWorklet = { addModule: vi.fn(async () => undefined) };
  sampleRate = 48_000;
  constructor() { FakeAudioContext.last = this; }
  resume = vi.fn(async () => undefined);
  close = vi.fn(async () => undefined);
  createMediaStreamSource() { return this.source; }
  createGain() { return this.gain; }
}

class FakeAudioWorkletNode extends FakeNode {
  static last?: FakeAudioWorkletNode;
  port = { onmessage: null as ((event: { data: Float32Array }) => void) | null };
  constructor() { super(); FakeAudioWorkletNode.last = this; }
}

describe('PcmMicrophone', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('requests configurable browser 3A and keeps capture on a zero-gain output', async () => {
    const stop = vi.fn(); const getUserMedia = vi.fn(async () => { const track = { stop, readyState: 'live', getSettings: () => ({ echoCancellation: true, noiseSuppression: false, autoGainControl: true, sampleRate: 48_000, channelCount: 1 }) }; return { getTracks: () => [track], getAudioTracks: () => [track] }; });
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
    vi.stubGlobal('AudioContext', FakeAudioContext);
    vi.stubGlobal('AudioWorkletNode', FakeAudioWorkletNode);
    const microphone = new PcmMicrophone(vi.fn(), vi.fn());
    const requested = { echoCancellation: true, noiseSuppression: false, autoGainControl: true }; const settings = await microphone.prepare(requested); await microphone.start();
    expect(getUserMedia).toHaveBeenCalledWith({ audio: { channelCount: 1, ...requested } }); expect(settings).toMatchObject(requested);
    const context = FakeAudioContext.last!;
    expect(context.audioWorklet.addModule).toHaveBeenCalledWith('/audio-capture-worklet.js'); expect(context.source.connectedTo).toBe(FakeAudioWorkletNode.last);
    expect(FakeAudioWorkletNode.last!.connectedTo).toBe(context.gain);
    expect(context.gain.gain.value).toBe(0);
    expect(context.gain.connectedTo).toBe(context.destination);
    await microphone.stop(); expect(stop).toHaveBeenCalledOnce();
  });

  it('pauses Push to Talk without releasing the media track and records whether PCM was sent', async () => {
    const stop = vi.fn(); const track = { stop, readyState: 'live', getSettings: () => ({}) };
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn(async () => ({ getTracks: () => [track], getAudioTracks: () => [track] })) } });
    vi.stubGlobal('AudioContext', FakeAudioContext);
    vi.stubGlobal('AudioWorkletNode', FakeAudioWorkletNode);
    const send = vi.fn(); const microphone = new PcmMicrophone(send, vi.fn()); const options = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
    await microphone.prepare(options); await microphone.start(); FakeAudioWorkletNode.last!.port.onmessage!({ data: new Float32Array(8192).fill(.03) });
    expect(send).toHaveBeenCalled(); expect(microphone.capturedAudio).toBe(true); microphone.pause(); expect(microphone.isActive).toBe(false); expect(stop).not.toHaveBeenCalled();
    await microphone.stop(); expect(stop).toHaveBeenCalledOnce();
  });
});
