import { BufferGeometry, Float32BufferAttribute, Group, Line, LineBasicMaterial, LineDashedMaterial } from 'three';
import type { JobState, Pose2D } from '../types';
import { worldToScene } from '../world/coordinates';

const PLANNED_PATH_HEIGHT = 0.045;
const TRACE_HEIGHT = 0.06;

interface OverlayEntry {
  path: Line<BufferGeometry, LineDashedMaterial>;
  trace?: Line<BufferGeometry, LineBasicMaterial>;
  pathSource: Pose2D[];
  traceSource: Pose2D[];
}

const overlays = new WeakMap<Group, Map<string, OverlayEntry>>();

function writeGeometry(line: Line, points: Pose2D[], height: number, dashed = false) {
  const neededCapacity = dashed ? points.length : Math.max(64, 2 ** Math.ceil(Math.log2(Math.max(2, points.length))));
  let position = line.geometry.getAttribute('position') as Float32BufferAttribute | undefined;
  if (!position || position.count < neededCapacity || (dashed && position.count !== neededCapacity)) {
    line.geometry.dispose();
    line.geometry = new BufferGeometry();
    position = new Float32BufferAttribute(new Float32Array(neededCapacity * 3), 3);
    line.geometry.setAttribute('position', position);
  }
  points.forEach((point, index) => {
    const scenePoint = worldToScene(point.x, point.y, height);
    position.setXYZ(index, scenePoint.x, scenePoint.y, scenePoint.z);
  });
  position.needsUpdate = true;
  line.geometry.setDrawRange(0, points.length);
  line.geometry.computeBoundingSphere();
  if (dashed) line.computeLineDistances();
}

function disposeLine(line: Line) {
  line.removeFromParent();
  line.geometry.dispose();
  if (Array.isArray(line.material)) line.material.forEach((material) => material.dispose());
  else line.material.dispose();
}

function createPath(job: JobState) {
  const material = new LineDashedMaterial({
    color: job.status === 'awaiting_confirmation' ? '#f59e0b' : '#27d7c6',
    dashSize: 0.18,
    gapSize: 0.12,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
  });
  const line = new Line<BufferGeometry, LineDashedMaterial>(new BufferGeometry(), material);
  line.name = `planned-path:${job.id}`;
  writeGeometry(line, job.path, PLANNED_PATH_HEIGHT, true);
  return line;
}

function createTrace(job: JobState) {
  const line = new Line<BufferGeometry, LineBasicMaterial>(new BufferGeometry(), new LineBasicMaterial({ color: '#27d7c6', transparent: true, opacity: 0.4, depthWrite: false }));
  line.name = `travelled-trace:${job.id}`;
  writeGeometry(line, job.trace, TRACE_HEIGHT);
  return line;
}

function removeEntry(entries: Map<string, OverlayEntry>, id: string) {
  const entry = entries.get(id);
  if (!entry) return;
  disposeLine(entry.path);
  if (entry.trace) disposeLine(entry.trace);
  entries.delete(id);
}

export function disposeNavigationOverlay(group: Group) {
  const entries = overlays.get(group);
  if (entries) for (const id of [...entries.keys()]) removeEntry(entries, id);
  overlays.delete(group);
  for (const child of [...group.children]) {
    const line = child as Line;
    disposeLine(line);
  }
}

/** Incrementally syncs the same job path and trace arrays used by Map2D. */
export function syncNavigationOverlay(group: Group, jobs: JobState[]) {
  let entries = overlays.get(group);
  if (!entries) { entries = new Map(); overlays.set(group, entries); }
  const active = new Set(jobs.filter((job) => job.path.length >= 2).map((job) => job.id));
  for (const id of [...entries.keys()]) if (!active.has(id)) removeEntry(entries, id);

  for (const job of jobs) {
    if (job.path.length < 2) continue;
    let entry = entries.get(job.id);
    if (!entry) {
      const path = createPath(job);
      group.add(path);
      entry = { path, pathSource: job.path, traceSource: job.trace };
      entries.set(job.id, entry);
    } else if (entry.pathSource !== job.path) {
      writeGeometry(entry.path, job.path, PLANNED_PATH_HEIGHT, true);
      entry.pathSource = job.path;
    }
    entry.path.material.color.set(job.status === 'awaiting_confirmation' ? '#f59e0b' : '#27d7c6');

    if (job.trace.length > 1) {
      if (!entry.trace) { entry.trace = createTrace(job); group.add(entry.trace); }
      else if (entry.traceSource !== job.trace) writeGeometry(entry.trace, job.trace, TRACE_HEIGHT);
    } else if (entry.trace) {
      disposeLine(entry.trace); entry.trace = undefined;
    }
    entry.traceSource = job.trace;
  }
}
