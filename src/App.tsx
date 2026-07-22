import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Bot, Box, ChevronRight, CircleStop, Code2, Expand, Map, MessageSquareText, Mic, MicOff, PanelRight, Radar, RotateCcw, Send, Settings2, Unplug, Wifi, X } from 'lucide-react';
import { Map2D } from './components/Map2D';
import { useWorld } from './hooks/useWorld';
import { StardustRealtimeClient } from './realtime/client';
import type { AppEvent, ChatMessage, ConnectionStatus, RuntimeConfig } from './types';
import { SimulationEngine } from './world/engine';

const Scene3D = lazy(() => import('./components/Scene3D').then((module) => ({ default: module.Scene3D })));

export const DEFAULT_SESSION: Record<string, unknown> = {
  model: { provider: 'tiwater', name: 'stardust-8.0', ext_config: { v8: { enabled: true, max_plan_steps: 4, max_retry_count: 1, enable_companion_narration: true } }, modalities: ['text', 'audio'], instructions: '你是一个人形机器人助手。请根据用户请求调用合适的机器人技能。', tools: [], tool_choice: 'auto', temperature: 0.8, max_response_output_tokens: 4096 },
  speech: { voice: 'verse', output_audio_format: 'pcm16' },
  hearing: { input_audio_format: 'pcm16', input_audio_transcription: { model: 'whisper-1' }, turn_detection: { type: 'server_vad', threshold: .5, prefix_padding_ms: 300, silence_duration_ms: 200 } },
};

function relativeTime(timestamp: number) { return new Date(timestamp).toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }); }

export default function App() {
  const [events, setEvents] = useState<AppEvent[]>([]); const [messages, setMessages] = useState<ChatMessage[]>([]); const [runtime, setRuntime] = useState<RuntimeConfig>(); const [status, setStatus] = useState<ConnectionStatus>('idle'); const [connectionError, setConnectionError] = useState('');
  const [viewMode, setViewMode] = useState<'2d' | '3d' | 'both'>('both'); const [settingsOpen, setSettingsOpen] = useState(false); const [panel, setPanel] = useState<'chat' | 'events'>('chat'); const [session, setSession] = useState<Record<string, unknown>>(structuredClone(DEFAULT_SESSION)); const [input, setInput] = useState(''); const [micOn, setMicOn] = useState(false); const [levels, setLevels] = useState({ input: 0, output: 0 });
  const clientRef = useRef<StardustRealtimeClient | undefined>(undefined);
  const addEvent = useCallback((value: Omit<AppEvent, 'id' | 'timestamp'>) => setEvents((items) => [...items, { ...value, id: crypto.randomUUID(), timestamp: Date.now() }].slice(-200)), []);
  const upsertMessage = useCallback((message: ChatMessage) => setMessages((items) => { const index = items.findIndex((item) => item.id === message.id); if (index < 0) return [...items, message]; const next = [...items]; next[index] = { ...next[index], ...message }; return next; }), []);
  const engineRef = useRef<SimulationEngine | undefined>(undefined);
  if (!engineRef.current) engineRef.current = new SimulationEngine(addEvent, (event) => { clientRef.current?.sendTaskEvent(event); addEvent({ level: event.status === 'failed' ? 'error' : 'warning', type: 'task_event', summary: event.message, detail: event, jobId: event.job_id }); });
  const engine = engineRef.current; const world = useWorld(engine);

  useEffect(() => { fetch('/api/runtime-config', { cache: 'no-store' }).then((response) => response.json()).then(setRuntime).catch((error) => { setConnectionError(String(error)); setStatus('error'); }); return () => engine.destroy(); }, [engine]);
  useEffect(() => {
    if (!runtime) return;
    const client = new StardustRealtimeClient(runtime, {
      onStatus: (next, error) => { setStatus(next); setConnectionError(error || ''); if (next !== 'connected') setMicOn(false); },
      onEvent: addEvent,
      onMessage: upsertMessage,
      onTool: (name, args, callId) => engine.invokeTool(name, args, callId),
      onAudioLevel: (kind, level) => setLevels((value) => ({ ...value, [kind]: level })),
    }); clientRef.current = client; return () => client.disconnect();
  }, [runtime, addEvent, upsertMessage, engine]);

  const connect = async () => {
    if (!clientRef.current || runtime?.missingRequired.length) return;
    try { await clientRef.current.connect(session); try { await clientRef.current.microphone.start(); setMicOn(true); } catch (error) { addEvent({ level: 'warning', type: 'microphone_denied', summary: '麦克风不可用，仍可使用文本和机器人技能', detail: String(error) }); } } catch { /* status set by client */ }
  };
  const disconnect = () => clientRef.current?.disconnect();
  const toggleMic = async () => { const microphone = clientRef.current?.microphone; if (!microphone) return; if (microphone.isActive) { await microphone.stop(); setMicOn(false); } else { try { await microphone.start(); setMicOn(true); } catch (error) { addEvent({ level: 'error', type: 'microphone_error', summary: '无法启用麦克风', detail: String(error) }); } } };
  const sendText = () => { if (!input.trim() || status !== 'connected') return; clientRef.current?.sendText(input); setInput(''); };
  const handover = world.jobs.find((job) => job.status === 'awaiting_confirmation');
  const currentJob = world.jobs.find((job) => job.resources.includes('locomotion') || job.resources.includes('manipulator')) || world.jobs[0];

  return <div className="app-shell">
    <header className="topbar">
      <div className="brand"><div className="brand-mark"><Bot size={21} /></div><div><strong>mock-humanoid</strong><span>STARDUST · G1 SIMULATOR</span></div></div>
      <div className="top-status">
        <div className={`status-pill ${status}`}><span className="status-beacon" />{status === 'connected' ? 'Realtime 已连接' : status === 'connecting' || status === 'validating' ? '正在连接' : status === 'error' ? '连接错误' : 'Realtime 未连接'}</div>
        <div className="pose-readout"><span>G1</span><b>{world.robot.pose.x.toFixed(2)}</b><i>x</i><b>{world.robot.pose.y.toFixed(2)}</b><i>y</i><b>{(world.robot.pose.theta * 180 / Math.PI).toFixed(0)}°</b></div>
      </div>
      <div className="top-actions"><button className="icon-button" onClick={() => setSettingsOpen(true)} aria-label="设置"><Settings2 size={18} /></button>{status === 'connected' ? <button className="primary-button disconnect" onClick={disconnect}><Unplug size={16} />断开</button> : <button className="primary-button" disabled={!runtime || !!runtime.missingRequired.length || status === 'connecting'} onClick={connect}><Wifi size={16} />{status === 'error' ? '重新连接' : '连接'}</button>}</div>
    </header>
    {runtime?.missingRequired.length ? <div className="config-alert"><Code2 size={16} />缺少环境变量：{runtime.missingRequired.join('、')}。模拟器仍可本地查看，Realtime 连接已禁用。</div> : connectionError ? <div className="config-alert error"><Unplug size={16} />{connectionError}</div> : null}
    <main className="workspace">
      <section className="sim-column">
        <div className="section-head"><div><span className="eyebrow">LIVE DIGITAL TWIN</span><h1>室内自主任务场景</h1></div><div className="segmented"><button className={viewMode === '2d' ? 'active' : ''} onClick={() => setViewMode('2d')}><Map size={14} />2D</button><button className={viewMode === '3d' ? 'active' : ''} onClick={() => setViewMode('3d')}><Box size={14} />3D</button><button className={viewMode === 'both' ? 'active' : ''} onClick={() => setViewMode('both')}><Expand size={14} />双视图</button></div></div>
        <div className={`views ${viewMode}`}>
          {viewMode !== '3d' && <Map2D world={world} />}
          {viewMode !== '2d' && <Suspense fallback={<div className="viewport-panel scene-panel scene-loading"><div className="viewport-label"><span className="live-dot cyan" />3D POINT CLOUD</div><div className="model-status">正在加载 3D 引擎…</div></div>}><Scene3D world={world} /></Suspense>}
        </div>
        <div className="task-strip">
          <div className="task-icon"><Radar size={19} /></div>
          <div className="task-copy">{currentJob ? <><span>{currentJob.tool}</span><strong>{currentJob.label}</strong><small>{currentJob.stage}</small></> : <><span>ROBOT READY</span><strong>等待任务</strong><small>可通过 Stardust 调用 8 个本地技能</small></>}</div>
          {currentJob?.progress != null && <div className="task-progress"><div><span style={{ width: `${Math.round(currentJob.progress * 100)}%` }} /></div><b>{Math.round(currentJob.progress * 100)}%</b></div>}
          <div className="task-controls"><button disabled={!currentJob} onClick={() => engine.stopCurrent()}><CircleStop size={15} />停止任务</button><button onClick={() => { if (confirm('确定重置模拟世界？Realtime 连接将保持。')) engine.reset(); }}><RotateCcw size={15} />重置世界</button></div>
        </div>
      </section>
      <aside className="side-column">
        <div className="side-tabs"><button className={panel === 'chat' ? 'active' : ''} onClick={() => setPanel('chat')}><MessageSquareText size={15} />对话</button><button className={panel === 'events' ? 'active' : ''} onClick={() => setPanel('events')}><PanelRight size={15} />任务与事件<span className="count">{events.length}</span></button></div>
        {panel === 'chat' ? <>
          <div className="messages">{messages.length ? messages.map((message) => <div key={message.id} className={`message ${message.role}`}><div className="message-meta"><span>{message.role === 'user' ? 'YOU' : message.role === 'assistant' ? 'STARDUST' : message.role === 'tool' ? 'FUNCTION' : 'SYSTEM'}</span><time>{relativeTime(message.timestamp)}</time></div><p>{message.text}{message.streaming && <span className="typing-caret" />}</p></div>) : <div className="empty-state"><div><MessageSquareText size={26} /></div><h3>开始与 G1 对话</h3><p>连接 Stardust 后，使用语音或文本下达导航、搜索和操作任务。</p><div className="suggestions"><span>“去厨房看看”</span><span>“把杯子放到餐桌”</span><span>“开心一点”</span></div></div>}</div>
          <div className="composer"><textarea value={input} disabled={status !== 'connected'} placeholder={status === 'connected' ? '给机器人发送消息…' : '连接 Stardust 后可输入'} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendText(); } }} /><div className="composer-actions"><button className={`mic-button ${micOn ? 'active' : ''}`} disabled={status !== 'connected'} onClick={toggleMic}>{micOn ? <Mic size={17} /> : <MicOff size={17} />}<span className="level"><i style={{ transform: `scaleX(${Math.min(1, levels.input * 8)})` }} /></span></button><button className="send-button" disabled={status !== 'connected' || !input.trim()} onClick={sendText}><Send size={17} /></button></div></div>
        </> : <div className="events">{events.length ? [...events].reverse().map((event) => <div className={`event ${event.level}`} key={event.id}><span className="event-line" /><div><div className="event-meta"><time>{relativeTime(event.timestamp)}</time><code>{event.type}</code></div><p>{event.summary}</p>{event.jobId && <small>{event.jobId}</small>}</div><ChevronRight size={14} /></div>) : <div className="empty-state compact"><Radar size={25} /><h3>暂无事件</h3><p>连接和机器人任务事件会显示在这里。</p></div>}</div>}
      </aside>
    </main>
    {settingsOpen && <SettingsDrawer runtime={runtime} session={session} onClose={() => setSettingsOpen(false)} onApply={async (next) => { try { if (status === 'connected') { if (!clientRef.current) throw new Error('Realtime 客户端不可用'); await clientRef.current.updateSession(next); } else clientRef.current?.prepareSession(next); setSession(next); addEvent({ level: 'success', type: status === 'connected' ? 'session_updated' : 'session_applied', summary: status === 'connected' ? 'Stardust 已确认 session.updated' : 'session 配置将在下次连接时使用' }); setSettingsOpen(false); } catch (error) { addEvent({ level: 'error', type: 'session_update_failed', summary: error instanceof Error ? error.message : String(error), detail: error }); throw error; } }} />}
    {handover && <div className="modal-backdrop"><div className="handover-modal"><button className="modal-x" onClick={() => engine.confirmHandover(handover.id, false)}><X size={18} /></button><div className="handover-visual"><Bot size={38} /><ChevronRight size={24} /><div className="object-token"><Box size={24} /></div></div><span className="eyebrow">HANDOVER CONFIRMATION</span><h2>是否已完成物品交接？</h2><p>{handover.label}</p><div className="modal-actions"><button onClick={() => engine.confirmHandover(handover.id, false)}>取消交接</button><button className="primary-button" onClick={() => engine.confirmHandover(handover.id, true)}>确认已接收</button></div></div></div>}
  </div>;
}

function SettingsDrawer({ runtime, session, onClose, onApply }: { runtime?: RuntimeConfig; session: Record<string, unknown>; onClose: () => void; onApply: (session: Record<string, unknown>) => Promise<void> }) {
  const [draft, setDraft] = useState(() => JSON.stringify(session, null, 2)); const [error, setError] = useState(''); const [applying, setApplying] = useState(false);
  useEffect(() => { const listener = (event: KeyboardEvent) => { if (event.key === 'Escape' && !applying) onClose(); }; window.addEventListener('keydown', listener); return () => window.removeEventListener('keydown', listener); }, [onClose, applying]);
  const parse = () => { try { const value = JSON.parse(draft); if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('顶层值必须是 JSON 对象'); setError(''); return value as Record<string, unknown>; } catch (value) { const message = value instanceof Error ? value.message : String(value); setError(message); throw value; } };
  return <div className="drawer-backdrop" onMouseDown={(event) => { if (!applying && event.target === event.currentTarget) onClose(); }}><section className="settings-drawer"><header><div><span className="eyebrow">RUNTIME & SESSION</span><h2>Realtime 设置</h2></div><button className="icon-button" disabled={applying} onClick={onClose}><X size={19} /></button></header><div className="runtime-grid"><label>STARDUST URL<strong>{runtime?.baseUrl || '—'}</strong></label><label>GROUP ID<strong>{runtime?.groupId || '未配置'}</strong></label><label>ROBOT ID<strong>{runtime?.robotId || '未配置'}</strong></label></div><div className="editor-head"><div><Code2 size={16} /><span>session.update JSON</span></div><small>仅校验 JSON 与顶层对象</small></div><textarea autoFocus disabled={applying} className={error ? 'invalid' : ''} spellCheck={false} value={draft} onChange={(event) => { setDraft(event.target.value); setError(''); }} />{error && <div className="json-error">{error}</div>}<footer><div><button disabled={applying} onClick={() => { try { setDraft(JSON.stringify(parse(), null, 2)); } catch { /* shown */ } }}>格式化</button><button disabled={applying} onClick={() => { setDraft(JSON.stringify(DEFAULT_SESSION, null, 2)); setError(''); }}>恢复本页初始值</button></div><div><button disabled={applying} onClick={onClose}>取消</button><button className="primary-button" disabled={applying} onClick={async () => { try { const next = parse(); setApplying(true); await onApply(next); } catch (value) { setError(value instanceof Error ? value.message : String(value)); setApplying(false); } }}>{applying ? '应用中…' : '应用'}</button></div></footer></section></div>;
}
