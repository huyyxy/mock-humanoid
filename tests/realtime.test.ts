import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StardustRealtimeClient } from '../src/realtime/client';
import type { ConnectionStatus, RuntimeConfig, ToolOutput } from '../src/types';

class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 3;
  static instances: FakeWebSocket[] = [];
  readyState = FakeWebSocket.CONNECTING;
  sent: Record<string, any>[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
    queueMicrotask(() => { this.readyState = FakeWebSocket.OPEN; this.onopen?.(); });
  }

  send(value: string) { this.sent.push(JSON.parse(value)); }
  receive(event: Record<string, unknown>) { this.onmessage?.({ data: JSON.stringify(event) }); }
  close(code = 1000, reason = '') { this.readyState = FakeWebSocket.CLOSED; this.onclose?.({ code, reason }); }
  failClose(code = 1006, reason = 'network lost') { this.close(code, reason); }
}

const config: RuntimeConfig = { baseUrl: 'wss://example.test', groupId: 'group', robotId: 'robot', missingRequired: [] };

function createHarness() {
  const statuses: Array<{ status: ConnectionStatus; error?: string }> = [];
  const events: any[] = [];
  const onTool = vi.fn(async (name): Promise<ToolOutput> => ({ ok: true, status: 'succeeded', tool: name, job_id: 'job_test', error_code: null, message: 'done', data: {} }));
  const onMessage = vi.fn();
  const client = new StardustRealtimeClient(config, {
    onStatus: (status, error) => statuses.push({ status, error }),
    onEvent: (event) => events.push(event),
    onMessage,
    onTool,
    onAudioLevel: vi.fn(),
  });
  return { client, statuses, events, onTool, onMessage };
}

async function connect(client: StardustRealtimeClient) {
  const promise = client.connect({ model: { tools: [] } });
  await vi.waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
  const socket = FakeWebSocket.instances[0];
  await vi.waitFor(() => expect(socket.sent.some((event) => event.type === 'session.update')).toBe(true));
  socket.receive({ type: 'session.updated', session: {} });
  await promise;
  return socket;
}

describe('StardustRealtimeClient', () => {
  beforeEach(() => { FakeWebSocket.instances = []; vi.stubGlobal('WebSocket', FakeWebSocket); });
  afterEach(() => vi.unstubAllGlobals());

  it('uses validating and connecting before session.updated confirms the connection', async () => {
    const { client, statuses } = createHarness();
    await connect(client);
    expect(statuses.map((item) => item.status)).toEqual(['validating', 'connecting', 'connected']);
    client.disconnect();
  });

  it('keeps updateSession pending until session.updated and rejects Stardust errors', async () => {
    const { client } = createHarness(); const socket = await connect(client);
    let confirmed = false;
    const accepted = client.updateSession({ model: { name: 'accepted' } }).then(() => { confirmed = true; });
    await Promise.resolve(); expect(confirmed).toBe(false);
    socket.receive({ type: 'session.updated', session: {} }); await accepted; expect(confirmed).toBe(true);

    const rejected = client.updateSession({ model: { name: 'rejected' } });
    socket.receive({ type: 'error', error: { message: 'invalid model' } });
    await expect(rejected).rejects.toThrow('invalid model');
    client.disconnect();
  });

  it('reports unexpected closes as errors but user disconnects as idle', async () => {
    const unexpected = createHarness(); const socket = await connect(unexpected.client);
    socket.failClose();
    expect(unexpected.statuses.at(-1)).toEqual(expect.objectContaining({ status: 'error', error: expect.stringContaining('意外断开') }));

    FakeWebSocket.instances = [];
    const intentional = createHarness(); await connect(intentional.client); intentional.client.disconnect();
    expect(intentional.statuses.at(-1)).toEqual({ status: 'idle', error: undefined });
  });

  it('executes completed function calls once and ignores unknown tools', async () => {
    const { client, onTool } = createHarness(); const socket = await connect(client);
    const call = { type: 'response.output_item.done', response_id: 'response-1', item: { id: 'item-1', type: 'function_call', name: 'set_expression', call_id: 'call-1', arguments: '{"expression":"开心"}' } };
    socket.receive(call); socket.receive(call);
    socket.receive({ type: 'response.output_item.done', item: { id: 'item-2', type: 'function_call', name: 'custom_tool', call_id: 'call-2', arguments: '{}' } });
    await vi.waitFor(() => expect(socket.sent.filter((event) => event.item?.type === 'function_call_output')).toHaveLength(1));
    expect(onTool).toHaveBeenCalledTimes(1);
    client.disconnect();
  });

  it('commits Push to Talk exactly once and renders its transcript', async () => {
    const { client, onMessage } = createHarness();
    const promise = client.connect({ model: { tools: [] }, hearing: { input_audio_format: 'pcm16', turn_detection: null } });
    await vi.waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1)); const socket = FakeWebSocket.instances[0];
    await vi.waitFor(() => expect(socket.sent.some((event) => event.type === 'session.update')).toBe(true)); socket.receive({ type: 'session.updated', session: {} }); await promise;
    client.beginPushToTalk(); Object.defineProperty(client.microphone, 'capturedAudio', { value: true }); expect(client.finishPushToTalk()).toBe(true);
    expect(socket.sent.slice(-4).map((event) => event.type)).toEqual(['response.cancel', 'input_audio_buffer.clear', 'input_audio_buffer.commit', 'response.create']);
    socket.receive({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'voice-1', transcript: '你好机器人' });
    expect(onMessage).toHaveBeenCalledWith(expect.objectContaining({ id: 'voice-1', role: 'user', text: '你好机器人' }));
    client.disconnect();
  });

  it('bounds the processed call cache and evicts the oldest call id', async () => {
    const { client, onTool } = createHarness(); const socket = await connect(client);
    for (let index = 0; index < 1_025; index++) socket.receive({ type: 'response.output_item.done', item: { id: `item-${index}`, type: 'function_call', name: 'set_expression', call_id: `call-${index}`, arguments: '{"expression":"开心"}' } });
    await vi.waitFor(() => expect(onTool).toHaveBeenCalledTimes(1_025));
    socket.receive({ type: 'response.output_item.done', item: { id: 'item-replayed', type: 'function_call', name: 'set_expression', call_id: 'call-0', arguments: '{"expression":"开心"}' } });
    await vi.waitFor(() => expect(onTool).toHaveBeenCalledTimes(1_026));
    client.disconnect();
  });
});
