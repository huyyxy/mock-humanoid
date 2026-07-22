import { ArrowDown, ArrowUp, MapPin, Navigation, Play, Plus, Route, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { WorldState } from '../types';
import type { SimulationEngine } from '../world/engine';

export function SceneControl({ world, engine }: { world: WorldState; engine: SimulationEngine }) {
  const [locationForm, setLocationForm] = useState({ name: '', x: '', y: '', theta: '0' });
  const [routeName, setRouteName] = useState(''); const [selectedLocation, setSelectedLocation] = useState(world.locations[0]?.id || ''); const [waypointIds, setWaypointIds] = useState<string[]>([]);
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string }>(); const [busyId, setBusyId] = useState('');
  useEffect(() => { if (!world.locations.some((item) => item.id === selectedLocation)) setSelectedLocation(world.locations[0]?.id || ''); }, [world.locations, selectedLocation]);
  const locationName = (id: string) => world.locations.find((item) => item.id === id)?.name || '已删除位置点';
  const report = (action: () => void) => { try { action(); setMessage({ kind: 'success', text: '设置已更新' }); } catch (error) { setMessage({ kind: 'error', text: error instanceof Error ? error.message : String(error) }); } };
  const run = async (id: string, action: () => Promise<{ message: string; status: string }>) => { setBusyId(id); try { const result = await action(); setMessage({ kind: result.status === 'failed' || result.status === 'cancelled' ? 'error' : 'success', text: result.message }); } finally { setBusyId(''); } };
  const moveWaypoint = (index: number, offset: number) => { const target = index + offset; if (target < 0 || target >= waypointIds.length) return; const next = [...waypointIds]; [next[index], next[target]] = [next[target], next[index]]; setWaypointIds(next); };

  return <div className="scene-control">
    {message && <div className={`control-message ${message.kind}`}><span>{message.text}</span><button aria-label="关闭提示" onClick={() => setMessage(undefined)}><X size={13} /></button></div>}
    <section className="control-section">
      <div className="control-title"><div><MapPin size={16} /><strong>位置点</strong></div><small>{world.locations.length} 个</small></div>
      <form className="location-form" onSubmit={(event) => { event.preventDefault(); report(() => { if (!locationForm.x.trim() || !locationForm.y.trim() || !locationForm.theta.trim()) throw new Error('请填写完整坐标和朝向'); engine.addLocation({ name: locationForm.name, x: Number(locationForm.x), y: Number(locationForm.y), theta: Number(locationForm.theta) }); setLocationForm({ name: '', x: '', y: '', theta: '0' }); }); }}>
        <label className="wide">名称<input value={locationForm.name} placeholder="例如：讲解点" onChange={(event) => setLocationForm({ ...locationForm, name: event.target.value })} /></label>
        <label>X / 米<input inputMode="decimal" value={locationForm.x} placeholder="3.20" onChange={(event) => setLocationForm({ ...locationForm, x: event.target.value })} /></label>
        <label>Y / 米<input inputMode="decimal" value={locationForm.y} placeholder="4.10" onChange={(event) => setLocationForm({ ...locationForm, y: event.target.value })} /></label>
        <label>θ / 弧度<input inputMode="decimal" value={locationForm.theta} onChange={(event) => setLocationForm({ ...locationForm, theta: event.target.value })} /></label>
        <button className="control-primary" type="submit"><Plus size={14} />新增位置点</button>
      </form>
      <div className="control-list location-list">{world.locations.map((location) => <div className="control-row" key={location.id}><span className={`point-dot ${location.builtin ? '' : 'custom'}`} /><div><strong>{location.name}</strong><small>{location.x.toFixed(2)}, {location.y.toFixed(2)} · θ {location.theta.toFixed(2)}</small></div>{location.builtin && <em>内置</em>}<button disabled={!!busyId} onClick={() => void run(`location:${location.id}`, () => engine.navigateToLocation(location.id))}>{busyId === `location:${location.id}` ? '执行中' : <><Navigation size={13} />前往</>}</button>{!location.builtin && <button className="danger-icon" aria-label={`删除位置点 ${location.name}`} onClick={() => report(() => engine.removeLocation(location.id))}><Trash2 size={14} /></button>}</div>)}</div>
    </section>

    <section className="control-section route-section">
      <div className="control-title"><div><Route size={16} /><strong>路线</strong></div><small>{world.routes.length} 条</small></div>
      <div className="route-form"><label>路线名称<input value={routeName} placeholder="例如：讲解路线" onChange={(event) => setRouteName(event.target.value)} /></label><div className="route-picker"><select value={selectedLocation} onChange={(event) => setSelectedLocation(event.target.value)}>{world.locations.map((location) => <option value={location.id} key={location.id}>{location.name}</option>)}</select><button onClick={() => selectedLocation && setWaypointIds((items) => [...items, selectedLocation])}><Plus size={14} />加入</button></div>
        <div className="route-draft">{waypointIds.length ? waypointIds.map((id, index) => <div key={`${id}-${index}`}><b>{index + 1}</b><span>{locationName(id)}</span><button aria-label="上移" disabled={!index} onClick={() => moveWaypoint(index, -1)}><ArrowUp size={13} /></button><button aria-label="下移" disabled={index === waypointIds.length - 1} onClick={() => moveWaypoint(index, 1)}><ArrowDown size={13} /></button><button aria-label="移除" onClick={() => setWaypointIds((items) => items.filter((_, itemIndex) => itemIndex !== index))}><X size={13} /></button></div>) : <p>依次加入至少两个位置点</p>}</div>
        <button className="control-primary" onClick={() => report(() => { engine.addRoute({ name: routeName, waypointIds }); setRouteName(''); setWaypointIds([]); })}><Route size={14} />保存路线</button>
      </div>
      <div className="control-list">{world.routes.map((route) => <div className="control-row route-row" key={route.id}><div><strong>{route.name}</strong><small>{route.waypointIds.map(locationName).join(' → ')}</small></div>{route.builtin && <em>内置</em>}<button disabled={!!busyId} onClick={() => void run(`route:${route.id}`, () => engine.executeRoute(route.id))}>{busyId === `route:${route.id}` ? '启动中' : <><Play size={13} />执行</>}</button>{!route.builtin && <button className="danger-icon" aria-label={`删除路线 ${route.name}`} onClick={() => report(() => engine.removeRoute(route.id))}><Trash2 size={14} /></button>}</div>)}</div>
    </section>
  </div>;
}
