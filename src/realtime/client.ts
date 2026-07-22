import { BUILTIN_TOOL_NAMES, mergeBuiltinTools } from '../data/tools';
import type { AppEvent, ChatMessage, RuntimeConfig, ToolName, ToolOutput } from '../types';
import { PcmMicrophone, PcmPlayer } from './audio';

interface Callbacks {
  onStatus: (status: 'idle' | 'validating' | 'connecting' | 'connected' | 'error', error?: string) => void;
  onEvent: (event: Omit<AppEvent, 'id' | 'timestamp'>) => void;
  onMessage: (message: ChatMessage) => void;
  onTool: (name: ToolName, args: unknown, callId?: string) => Promise<ToolOutput>;
  onAudioLevel: (kind: 'input' | 'output', level: number) => void;
}

function eventType(event: Record<string, unknown>) { return String(event.type || '').replace(/^server\./, ''); }
function decodeContent(item: any) { return item?.content?.map((part: any) => part?.text || part?.transcript || '').join('') || item?.formatted?.text || item?.formatted?.transcript || ''; }

export class StardustRealtimeClient {
  private static readonly MAX_PROCESSED_CALLS = 1_024;
  private socket?: WebSocket;
  private session: Record<string, unknown> = {};
  private pendingUpdate?: { resolve: () => void; reject: (error: Error) => void; timeout: ReturnType<typeof setTimeout> };
  private intentionalClose = false;
  private processedCalls = new Set<string>();
  private textBuffers = new Map<string, string>();
  private player: PcmPlayer;
  readonly microphone: PcmMicrophone;

  constructor(private config: RuntimeConfig, private callbacks: Callbacks) {
    this.player = new PcmPlayer((level) => callbacks.onAudioLevel('output', level));
    this.microphone = new PcmMicrophone((audio) => this.send('input_audio_buffer.append', { audio }), (level) => callbacks.onAudioLevel('input', level));
  }

  private buildUrl() {
    const url = new URL(this.config.baseUrl);
    const path = url.pathname.replace(/\/$/, ''); if (!path.endsWith('/realtime')) url.pathname = `${path}/realtime`;
    url.searchParams.set('terminal_secret', 'X-Tiwater-Debug'); url.searchParams.set('group_id', this.config.groupId); url.searchParams.set('robot_id', this.config.robotId); return url.toString();
  }

  prepareSession(value: Record<string, unknown>) {
    const warnings: string[] = [];
    const runtime = mergeBuiltinTools(value, (name) => { warnings.push(name); this.callbacks.onEvent({ level: 'warning', type: 'builtin_tool_replaced', summary: `用户 tool「${name}」已替换为内置定义` }); });
    return { runtime, warnings };
  }

  async connect(value: Record<string, unknown>) {
    if (this.socket) this.disconnect();
    this.callbacks.onStatus('validating');
    let runtime: Record<string, unknown>;
    try { runtime = this.prepareSession(value).runtime; } catch (error) { this.callbacks.onStatus('error', this.errorMessage(error)); throw error; }
    this.callbacks.onStatus('connecting'); this.intentionalClose = false;
    await new Promise<void>((resolve, reject) => {
      let settled = false; const socket = new WebSocket(this.buildUrl()); this.socket = socket;
      const timeout = globalThis.setTimeout(() => { if (!settled) { settled = true; this.intentionalClose = true; socket.close(); reject(new Error('等待 session.updated 超时')); } }, 12_000);
      socket.onopen = () => this.send('session.update', { session: runtime });
      socket.onmessage = (message) => { let event: Record<string, unknown>; try { event = JSON.parse(String(message.data)); } catch { return; } const type = eventType(event); this.handleEvent(event); if (type === 'error' && !settled) { settled = true; clearTimeout(timeout); reject(new Error(this.errorMessage(event))); } else if (type === 'session.updated' && !settled) { settled = true; clearTimeout(timeout); this.callbacks.onStatus('connected'); resolve(); } };
      socket.onerror = () => { if (!settled) { settled = true; clearTimeout(timeout); reject(new Error('WebSocket 连接失败，请检查 WSS 与 Origin 配置')); } };
      socket.onclose = (event) => { if (this.socket === socket) this.socket = undefined; void this.microphone.stop(); void this.player.close(); this.rejectPendingUpdate(new Error('Realtime 连接已关闭，session.update 未确认')); if (!settled) { settled = true; clearTimeout(timeout); reject(new Error('Realtime 在握手完成前关闭')); } else if (this.intentionalClose) this.callbacks.onStatus('idle'); else this.callbacks.onStatus('error', `Realtime 连接意外断开${event.code ? `（${event.code}${event.reason ? `: ${event.reason}` : ''}）` : ''}，请重新连接`); };
    }).then(() => { this.session = runtime; }).catch((error) => { this.callbacks.onStatus('error', this.errorMessage(error)); throw error; });
  }

  disconnect() { this.intentionalClose = true; this.rejectPendingUpdate(new Error('用户已断开连接，session.update 未确认')); void this.microphone.stop(); void this.player.close(); const socket = this.socket; this.socket = undefined; if (socket) { socket.onclose = null; socket.close(); } this.callbacks.onStatus('idle'); }

  async updateSession(value: Record<string, unknown>) {
    const { runtime } = this.prepareSession(value);
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) throw new Error('Realtime 未连接，无法应用 session.update');
    if (this.pendingUpdate) throw new Error('已有 session.update 正在等待确认');
    await new Promise<void>((resolve, reject) => {
      const timeout = globalThis.setTimeout(() => { this.pendingUpdate = undefined; reject(new Error('等待 session.updated 超时，上一份配置仍然有效')); }, 12_000);
      this.pendingUpdate = { resolve, reject, timeout };
      try { if (!this.send('session.update', { session: runtime })) throw new Error('Realtime 连接已关闭，session.update 未发送'); } catch (error) { this.pendingUpdate = undefined; clearTimeout(timeout); reject(error instanceof Error ? error : new Error(String(error))); }
    });
    this.session = runtime;
  }

  sendText(text: string) {
    const value = text.trim(); if (!value) return;
    this.callbacks.onMessage({ id: crypto.randomUUID(), role: 'user', text: value, timestamp: Date.now() });
    this.send('conversation.item.create', { item: { type: 'message', role: 'user', content: [{ type: 'input_text', text: value }] } }); this.send('response.create', {});
  }

  cancelResponse() { this.player.stop(); this.send('response.cancel', {}); }

  beginPushToTalk() { this.player.stop(); this.send('response.cancel', {}); return this.send('input_audio_buffer.clear', {}); }

  finishPushToTalk() {
    if (!this.microphone.capturedAudio) { this.callbacks.onEvent({ level: 'warning', type: 'push_to_talk_empty', summary: '未采集到语音，本次没有发送' }); return false; }
    this.send('input_audio_buffer.commit', {}); this.send('response.create', {}); return true;
  }

  sendTaskEvent(event: Record<string, unknown>) { this.send('conversation.item.create', { item: { type: 'message', role: 'system', content: [{ type: 'input_text', text: JSON.stringify(event) }] } }); }

  private send(type: string, payload: Record<string, unknown>) { if (this.socket?.readyState !== WebSocket.OPEN) return false; this.socket.send(JSON.stringify({ event_id: crypto.randomUUID(), type, ...payload })); return true; }

  private handleEvent(event: Record<string, unknown>) {
    const type = eventType(event); const noisy = type.includes('audio.delta');
    if (!noisy) this.callbacks.onEvent({ level: type === 'error' ? 'error' : 'info', type, summary: type, detail: event });
    if (type === 'session.updated' && this.pendingUpdate) { const pending = this.pendingUpdate; this.pendingUpdate = undefined; clearTimeout(pending.timeout); pending.resolve(); }
    if (type === 'error') { this.rejectPendingUpdate(new Error(this.errorMessage(event))); return; }
    const anyEvent = event as any;
    if ((type === 'response.audio.delta' || type === 'response.output_audio.delta') && typeof anyEvent.delta === 'string') void this.player.add(anyEvent.delta);
    if (type === 'input_audio_buffer.speech_started') { this.player.stop(); }
    if (type === 'response.output_item.done' && anyEvent.item?.type === 'function_call') void this.handleFunctionCall(anyEvent.item, anyEvent.response_id);
    if (type === 'conversation.item.created' && anyEvent.item?.type === 'message') {
      const text = decodeContent(anyEvent.item); if (text) this.callbacks.onMessage({ id: anyEvent.item.id || crypto.randomUUID(), role: anyEvent.item.role === 'user' ? 'user' : anyEvent.item.role === 'system' ? 'system' : 'assistant', text, timestamp: Date.now() });
    }
    if (type === 'conversation.item.input_audio_transcription.completed' && typeof anyEvent.transcript === 'string' && anyEvent.transcript.trim()) {
      this.callbacks.onMessage({ id: anyEvent.item_id || crypto.randomUUID(), role: 'user', text: anyEvent.transcript.trim(), timestamp: Date.now() });
    }
    if (['response.output_text.delta', 'response.text.delta', 'response.audio_transcript.delta'].includes(type) && typeof anyEvent.delta === 'string') {
      const id = anyEvent.item_id || anyEvent.response_id || 'assistant-stream'; const text = (this.textBuffers.get(id) || '') + anyEvent.delta; this.textBuffers.set(id, text); this.callbacks.onMessage({ id, role: 'assistant', text, timestamp: Date.now(), streaming: true });
    }
    if (['response.output_text.done', 'response.text.done', 'response.audio_transcript.done'].includes(type)) { const id = anyEvent.item_id || anyEvent.response_id || 'assistant-stream'; const text = anyEvent.text || anyEvent.transcript || this.textBuffers.get(id); if (text) this.callbacks.onMessage({ id, role: 'assistant', text, timestamp: Date.now() }); this.textBuffers.delete(id); }
  }

  private rejectPendingUpdate(error: Error) { if (!this.pendingUpdate) return; const pending = this.pendingUpdate; this.pendingUpdate = undefined; clearTimeout(pending.timeout); pending.reject(error); }

  private errorMessage(value: unknown) {
    if (value instanceof Error) return value.message;
    if (value && typeof value === 'object') { const record = value as Record<string, any>; return String(record.error?.message || record.error?.code || record.message || 'Stardust 拒绝了 session.update'); }
    return String(value || '未知 Realtime 错误');
  }

  private async handleFunctionCall(item: any, responseId?: string) {
    const name = String(item.name || ''); const callId = String(item.call_id || ''); const key = callId || `${responseId || 'response'}:${item.id || 'item'}:${name}`;
    if (this.processedCalls.has(key)) { this.callbacks.onEvent({ level: 'warning', type: 'ignored_duplicate_call', summary: `忽略重复调用 ${name}`, callId }); return; }
    this.processedCalls.add(key); if (this.processedCalls.size > StardustRealtimeClient.MAX_PROCESSED_CALLS) this.processedCalls.delete(this.processedCalls.values().next().value!);
    if (!BUILTIN_TOOL_NAMES.has(name as ToolName)) { this.callbacks.onEvent({ level: 'warning', type: 'ignored_unknown_tool', summary: `忽略非内置工具 ${name}`, callId }); return; }
    let args: unknown; try { args = JSON.parse(item.arguments || '{}'); } catch (error) { args = null; }
    let output: ToolOutput;
    try { output = await this.callbacks.onTool(name as ToolName, args, callId); } catch (error) { output = { ok: false, status: 'failed', tool: name as ToolName, job_id: `job_${Date.now().toString(36)}`, error_code: 'execution_failed', message: error instanceof Error ? error.message : '本地执行失败', data: {} }; }
    this.callbacks.onMessage({ id: `tool-${key}`, role: 'tool', text: `${name}: ${output.message}`, timestamp: Date.now() });
    this.send('conversation.item.create', { item: { type: 'function_call_output', call_id: callId, output: JSON.stringify(output) } }); this.send('response.create', {});
  }
}
