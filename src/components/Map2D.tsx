import { useEffect, useRef, useState } from 'react';
import { Crosshair, LocateFixed } from 'lucide-react';
import { LOCATIONS, MAP, OBSTACLES } from '../data/scene';
import type { WorldState } from '../types';

export function Map2D({ world }: { world: WorldState }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current!; const context = canvas.getContext('2d')!;
    const draw = () => {
      const rect = canvas.getBoundingClientRect(); const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) { canvas.width = rect.width * dpr; canvas.height = rect.height * dpr; }
      context.setTransform(dpr, 0, 0, dpr, 0, 0); context.clearRect(0, 0, rect.width, rect.height);
      const padding = 30; const base = Math.min((rect.width - padding * 2) / MAP.width, (rect.height - padding * 2) / MAP.height); const scale = base * zoom;
      const originX = rect.width / 2 - MAP.width * scale / 2 + pan.x; const originY = rect.height / 2 + MAP.height * scale / 2 + pan.y;
      const xy = (x: number, y: number) => [originX + x * scale, originY - y * scale] as const;
      context.fillStyle = '#07111e'; context.fillRect(...xy(0, MAP.height), MAP.width * scale, MAP.height * scale);
      context.strokeStyle = 'rgba(118, 151, 177, .09)'; context.lineWidth = 1;
      for (let x = 0; x <= MAP.width; x++) { const [px, py] = xy(x, 0); context.beginPath(); context.moveTo(px, py); context.lineTo(px, py - MAP.height * scale); context.stroke(); }
      for (let y = 0; y <= MAP.height; y++) { const [px, py] = xy(0, y); context.beginPath(); context.moveTo(px, py); context.lineTo(px + MAP.width * scale, py); context.stroke(); }
      context.strokeStyle = '#36516a'; context.lineWidth = 2; context.strokeRect(...xy(0, MAP.height), MAP.width * scale, MAP.height * scale);
      for (const obstacle of OBSTACLES) {
        const [x, y] = xy(obstacle.minX, obstacle.maxY); const width = (obstacle.maxX - obstacle.minX) * scale, height = (obstacle.maxY - obstacle.minY) * scale;
        const gradient = context.createLinearGradient(x, y, x, y + height); gradient.addColorStop(0, '#26394a'); gradient.addColorStop(1, '#172636'); context.fillStyle = gradient; context.fillRect(x, y, width, height); context.strokeStyle = '#526f84'; context.strokeRect(x, y, width, height);
        if (scale > 35) { context.fillStyle = '#9ab1c3'; context.font = '10px system-ui'; context.fillText(obstacle.name, x + 5, y + 14); }
      }
      for (const location of LOCATIONS) {
        const [x, y] = xy(location.x, location.y); context.fillStyle = '#48b9ff'; context.beginPath(); context.arc(x, y, 4, 0, Math.PI * 2); context.fill();
        if (scale > 28) { context.fillStyle = '#b9dbf2'; context.font = '11px system-ui'; context.fillText(location.name, x + 7, y - 6); }
      }
      for (const job of world.jobs) {
        if (!job.path.length) continue; context.strokeStyle = job.status === 'awaiting_confirmation' ? '#f59e0b' : '#27d7c6'; context.lineWidth = 3; context.setLineDash([8, 5]); context.beginPath();
        job.path.forEach((p, i) => { const [x, y] = xy(p.x, p.y); if (!i) context.moveTo(x, y); else context.lineTo(x, y); }); context.stroke(); context.setLineDash([]);
        if (job.trace.length > 1) { context.strokeStyle = 'rgba(39, 215, 198, .35)'; context.lineWidth = 5; context.beginPath(); job.trace.forEach((p, i) => { const [x, y] = xy(p.x, p.y); if (!i) context.moveTo(x, y); else context.lineTo(x, y); }); context.stroke(); }
      }
      for (const object of world.objects.filter((item) => item.owner === 'world')) {
        const [x, y] = xy(object.pose.x, object.pose.y); const highlighted = object.highlightedUntil > Date.now(); context.fillStyle = object.graspable ? '#f5b84b' : '#8294a5'; context.beginPath(); context.arc(x, y, highlighted ? 8 : 5, 0, Math.PI * 2); context.fill(); if (highlighted) { context.strokeStyle = '#fff3b0'; context.lineWidth = 2; context.stroke(); }
      }
      for (const person of world.people) {
        const [x, y] = xy(person.pose.x, person.pose.y); context.fillStyle = '#a78bfa'; context.beginPath(); context.arc(x, y, 7, 0, Math.PI * 2); context.fill(); context.fillStyle = '#e7dcff'; context.font = '11px system-ui'; context.fillText(person.name, x + 10, y + 4);
      }
      const robot = world.robot.pose; const [rx, ry] = xy(robot.x, robot.y); context.save(); context.translate(rx, ry); context.rotate(-robot.theta); context.fillStyle = world.robot.faceLight.color; context.shadowColor = world.robot.faceLight.color; context.shadowBlur = 12 * world.robot.faceLight.current_intensity; context.beginPath(); context.moveTo(12, 0); context.lineTo(-8, -8); context.lineTo(-5, 0); context.lineTo(-8, 8); context.closePath(); context.fill(); context.restore();
      context.fillStyle = '#8ea6b9'; context.font = '10px ui-monospace, monospace'; context.fillText(`x ${robot.x.toFixed(2)}  y ${robot.y.toFixed(2)}  θ ${robot.theta.toFixed(2)}`, 12, rect.height - 12);
    };
    draw(); const observer = new ResizeObserver(draw); observer.observe(canvas); return () => observer.disconnect();
  }, [world, zoom, pan]);

  return <div className="viewport-panel map-panel">
    <div className="viewport-label"><span className="live-dot" />2D NAVIGATION</div>
    <canvas ref={canvasRef} onWheel={(event) => { event.preventDefault(); setZoom((value) => Math.max(.7, Math.min(3, value * (event.deltaY > 0 ? .9 : 1.1)))); }} onPointerDown={(event) => { drag.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y }; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={(event) => { if (drag.current) setPan({ x: drag.current.panX + event.clientX - drag.current.x, y: drag.current.panY + event.clientY - drag.current.y }); }} onPointerUp={() => { drag.current = null; }} />
    <div className="viewport-tools"><button aria-label="聚焦机器人" onClick={() => { setPan({ x: 0, y: 0 }); setZoom(1); }}><LocateFixed size={15} /></button><span><Crosshair size={12} /> 0.05m GRID</span></div>
  </div>;
}
