import { Group, Line, LineBasicMaterial, LineDashedMaterial } from 'three';
import { describe, expect, it } from 'vitest';
import { disposeNavigationOverlay, syncNavigationOverlay } from '../src/components/navigationOverlay3d';
import type { JobState } from '../src/types';

function navigationJob(): JobState {
  return {
    id: 'job-route',
    tool: 'start_patrol',
    label: '执行路线',
    status: 'running',
    stage: '导航中',
    progress: null,
    resources: ['locomotion'],
    path: [
      { x: 1.5, y: 2, theta: 0 },
      { x: 4.5, y: 4, theta: 0 },
      { x: 7.7, y: 5.2, theta: 0 },
    ],
    trace: [
      { x: 1.5, y: 2, theta: 0 },
      { x: 2.2, y: 2.4, theta: 0 },
    ],
    createdAt: 1,
  };
}

describe('3D navigation overlay', () => {
  it('renders the planned path as a dashed line and the travelled trace as a solid line', () => {
    const group = new Group();
    syncNavigationOverlay(group, [navigationJob()]);

    expect(group.children).toHaveLength(2);
    const path = group.getObjectByName('planned-path:job-route') as Line;
    const trace = group.getObjectByName('travelled-trace:job-route') as Line;
    expect(path.material).toBeInstanceOf(LineDashedMaterial);
    expect(path.geometry.getAttribute('lineDistance')).toBeDefined();
    expect(trace.material).toBeInstanceOf(LineBasicMaterial);
    expect(path.geometry.drawRange.count).toBe(3);
    expect(trace.geometry.drawRange.count).toBe(2);
  });

  it('removes overlays when no active job has a planned path', () => {
    const group = new Group();
    syncNavigationOverlay(group, [navigationJob()]);
    syncNavigationOverlay(group, [{ ...navigationJob(), path: [] }]);
    expect(group.children).toHaveLength(0);
  });

  it('reuses GPU objects for progress-only revisions and in-place trace growth', () => {
    const group = new Group(), job = navigationJob();
    syncNavigationOverlay(group, [job]);
    const path = group.getObjectByName('planned-path:job-route') as Line;
    const trace = group.getObjectByName('travelled-trace:job-route') as Line;
    const pathGeometry = path.geometry, pathMaterial = path.material, traceGeometry = trace.geometry, traceMaterial = trace.material;

    syncNavigationOverlay(group, [{ ...job, progress: 0.5 }]);
    expect(group.getObjectByName(path.name)).toBe(path);
    expect(path.geometry).toBe(pathGeometry);
    expect(path.material).toBe(pathMaterial);
    expect(trace.geometry).toBe(traceGeometry);
    expect(trace.material).toBe(traceMaterial);

    const grownTrace = [...job.trace, { x: 3, y: 3, theta: 0 }];
    syncNavigationOverlay(group, [{ ...job, trace: grownTrace }]);
    expect(trace.geometry).toBe(traceGeometry);
    expect(trace.geometry.drawRange.count).toBe(3);
    expect(trace.material).toBe(traceMaterial);
    disposeNavigationOverlay(group);
    expect(group.children).toHaveLength(0);
  });

  it('keeps a bounded set of GPU objects across thousands of unrelated world revisions', () => {
    const group = new Group(), job = navigationJob();
    syncNavigationOverlay(group, [job]);
    const originalChildren = [...group.children];
    for (let revision = 1; revision <= 2_000; revision++) syncNavigationOverlay(group, [{ ...job, progress: revision / 2_000 }]);
    expect(group.children).toEqual(originalChildren);
    expect(group.children).toHaveLength(2);
  });
});
