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
  processor = Object.assign(new FakeNode(), { onaudioprocess: null as ((event: any) => void) | null });
  gain = Object.assign(new FakeNode(), { gain: { value: 1 } });
  sampleRate = 48_000;
  constructor() { FakeAudioContext.last = this; }
  resume = vi.fn(async () => undefined);
  close = vi.fn(async () => undefined);
  createMediaStreamSource() { return this.source; }
  createScriptProcessor() { return this.processor; }
  createGain() { return this.gain; }
}

describe('PcmMicrophone', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('keeps ScriptProcessor active through a zero-gain output without monitoring the microphone', async () => {
    const stop = vi.fn();
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop }] })) } });
    vi.stubGlobal('AudioContext', FakeAudioContext);
    const microphone = new PcmMicrophone(vi.fn(), vi.fn());
    await microphone.start();
    const context = FakeAudioContext.last!;
    expect(context.source.connectedTo).toBe(context.processor);
    expect(context.processor.connectedTo).toBe(context.gain);
    expect(context.gain.gain.value).toBe(0);
    expect(context.gain.connectedTo).toBe(context.destination);
    await microphone.stop(); expect(stop).toHaveBeenCalledOnce();
  });
});
