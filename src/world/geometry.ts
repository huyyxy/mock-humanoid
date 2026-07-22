import { MAP, OBSTACLES, type Obstacle } from '../data/scene';
import type { Pose2D } from '../types';

const directions = [[1, 0, 1], [0, 1, 1], [-1, 0, 1], [0, -1, 1], [1, 1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2], [1, -1, Math.SQRT2]] as const;
const width = Math.round(MAP.width / MAP.resolution) + 1;
const height = Math.round(MAP.height / MAP.resolution) + 1;
const idx = (x: number, y: number) => y * width + x;
const cell = (value: number) => Math.round(value / MAP.resolution);
const world = (value: number) => value * MAP.resolution;

export class PlanningTimeoutError extends Error {
  constructor() { super('路径规划超过 2 秒'); this.name = 'PlanningTimeoutError'; }
}

interface PlannerOptions { timeoutMs?: number; now?: () => number }

export function pointBlocked(x: number, y: number, inflation = MAP.inflation) {
  if (x < inflation || y < inflation || x > MAP.width - inflation || y > MAP.height - inflation) return true;
  return OBSTACLES.some((o) => x >= o.minX - inflation && x <= o.maxX + inflation && y >= o.minY - inflation && y <= o.maxY + inflation);
}

export function planPath(start: Pose2D, goal: Pose2D, options: PlannerOptions = {}): Pose2D[] {
  const timeoutMs = options.timeoutMs ?? 2_000; const now = options.now ?? (() => performance.now()); const started = now();
  const sx = cell(start.x), sy = cell(start.y), gx = cell(goal.x), gy = cell(goal.y);
  if (pointBlocked(start.x, start.y) || pointBlocked(goal.x, goal.y)) throw new Error('unreachable');
  const startId = idx(sx, sy), goalId = idx(gx, gy);
  const gScore = new Float64Array(width * height); gScore.fill(Infinity); gScore[startId] = 0;
  const parent = new Int32Array(width * height); parent.fill(-1);
  const closed = new Uint8Array(width * height);
  const heap: Array<{ id: number; x: number; y: number; f: number }> = [];
  const push = (entry: { id: number; x: number; y: number; f: number }) => { heap.push(entry); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p].f <= entry.f) break; heap[i] = heap[p]; i = p; } heap[i] = entry; };
  const pop = () => { const root = heap[0]; const tail = heap.pop()!; if (heap.length) { let i = 0; while (true) { let c = i * 2 + 1; if (c >= heap.length) break; if (c + 1 < heap.length && heap[c + 1].f < heap[c].f) c++; if (heap[c].f >= tail.f) break; heap[i] = heap[c]; i = c; } heap[i] = tail; } return root; };
  push({ id: startId, x: sx, y: sy, f: 0 });
  let found = false;
  let iterations = 0;
  while (heap.length) {
    if ((iterations++ & 63) === 0 && now() - started > timeoutMs) throw new PlanningTimeoutError();
    const current = pop(); if (closed[current.id]) continue; closed[current.id] = 1;
    if (current.id === goalId) { found = true; break; }
    for (const [dx, dy, cost] of directions) {
      const nx = current.x + dx, ny = current.y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const wx = world(nx), wy = world(ny), nid = idx(nx, ny);
      if (closed[nid] || pointBlocked(wx, wy)) continue;
      if (dx && dy && (pointBlocked(world(current.x + dx), world(current.y)) || pointBlocked(world(current.x), world(current.y + dy)))) continue;
      const tentative = gScore[current.id] + cost;
      if (tentative >= gScore[nid]) continue;
      gScore[nid] = tentative; parent[nid] = current.id;
      push({ id: nid, x: nx, y: ny, f: tentative + Math.hypot(gx - nx, gy - ny) });
    }
  }
  if (!found) throw new Error('unreachable');
  const cells: Array<[number, number]> = [];
  for (let current = goalId; current !== -1; current = parent[current]) { cells.push([current % width, Math.floor(current / width)]); if (current === startId) break; }
  cells.reverse();
  const compressed: Array<[number, number]> = [];
  for (let i = 0; i < cells.length; i++) {
    const prev = cells[i - 1], cur = cells[i], next = cells[i + 1];
    if (!prev || !next || (cur[0] - prev[0]) * (next[1] - cur[1]) !== (cur[1] - prev[1]) * (next[0] - cur[0])) compressed.push(cur);
  }
  return compressed.map(([x, y], index) => ({ x: index === compressed.length - 1 ? goal.x : world(x), y: index === compressed.length - 1 ? goal.y : world(y), theta: index === compressed.length - 1 ? goal.theta : 0 }));
}

function segmentIntersectsRect(a: Pose2D, b: Pose2D, rect: Obstacle) {
  const inside = (x: number, y: number) => x >= rect.minX && x <= rect.maxX && y >= rect.minY && y <= rect.maxY;
  if (inside(a.x, a.y) || inside(b.x, b.y)) return true;
  const edges = [[[rect.minX, rect.minY], [rect.maxX, rect.minY]], [[rect.maxX, rect.minY], [rect.maxX, rect.maxY]], [[rect.maxX, rect.maxY], [rect.minX, rect.maxY]], [[rect.minX, rect.maxY], [rect.minX, rect.minY]]] as const;
  const cross = (p: readonly number[], q: readonly number[], r: readonly number[]) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const onSegment = (p: readonly number[], q: readonly number[], r: readonly number[]) => q[0] >= Math.min(p[0], r[0]) && q[0] <= Math.max(p[0], r[0]) && q[1] >= Math.min(p[1], r[1]) && q[1] <= Math.max(p[1], r[1]);
  return edges.some(([c, d]) => {
    const p = [a.x, a.y], q = [b.x, b.y]; const o1 = cross(p, q, c), o2 = cross(p, q, d), o3 = cross(c, d, p), o4 = cross(c, d, q); const epsilon = 1e-9;
    if (((o1 > epsilon && o2 < -epsilon) || (o1 < -epsilon && o2 > epsilon)) && ((o3 > epsilon && o4 < -epsilon) || (o3 < -epsilon && o4 > epsilon))) return true;
    return (Math.abs(o1) <= epsilon && onSegment(p, c, q)) || (Math.abs(o2) <= epsilon && onSegment(p, d, q)) || (Math.abs(o3) <= epsilon && onSegment(c, p, d)) || (Math.abs(o4) <= epsilon && onSegment(c, q, d));
  });
}

export function isVisible(a: Pose2D, b: Pose2D) {
  return Math.hypot(a.x - b.x, a.y - b.y) <= 8 && !OBSTACLES.some((obstacle) => segmentIntersectsRect(a, b, obstacle));
}
