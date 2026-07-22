import { BufferGeometry, Group, Line, LineBasicMaterial, LineDashedMaterial, Vector3 } from 'three';
import type { JobState, Pose2D } from '../types';
import { worldToScene } from '../world/coordinates';

const PLANNED_PATH_HEIGHT = 0.045;
const TRACE_HEIGHT = 0.06;

function geometryFor(points: Pose2D[], height: number) {
  return new BufferGeometry().setFromPoints(points.map((point) => {
    const scenePoint = worldToScene(point.x, point.y, height);
    return new Vector3(scenePoint.x, scenePoint.y, scenePoint.z);
  }));
}

function clearOverlay(group: Group) {
  for (const child of [...group.children]) {
    group.remove(child);
    const line = child as Line;
    line.geometry?.dispose();
    if (Array.isArray(line.material)) line.material.forEach((material) => material.dispose());
    else line.material?.dispose();
  }
}

/** Rebuilds the 3D ground overlay from the same job path and trace arrays used by Map2D. */
export function rebuildNavigationOverlay(group: Group, jobs: JobState[]) {
  clearOverlay(group);
  for (const job of jobs) {
    if (job.path.length < 2) continue;

    const pathMaterial = new LineDashedMaterial({
      color: job.status === 'awaiting_confirmation' ? '#f59e0b' : '#27d7c6',
      dashSize: 0.18,
      gapSize: 0.12,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    });
    const pathLine = new Line(geometryFor(job.path, PLANNED_PATH_HEIGHT), pathMaterial);
    pathLine.name = `planned-path:${job.id}`;
    pathLine.computeLineDistances();
    group.add(pathLine);

    if (job.trace.length > 1) {
      const traceLine = new Line(
        geometryFor(job.trace, TRACE_HEIGHT),
        new LineBasicMaterial({ color: '#27d7c6', transparent: true, opacity: 0.4, depthWrite: false }),
      );
      traceLine.name = `travelled-trace:${job.id}`;
      group.add(traceLine);
    }
  }
}
