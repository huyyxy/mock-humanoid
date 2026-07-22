import { Group, Line, LineBasicMaterial, LineDashedMaterial } from 'three';
import { describe, expect, it } from 'vitest';
import { rebuildNavigationOverlay } from '../src/components/navigationOverlay3d';
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
    rebuildNavigationOverlay(group, [navigationJob()]);

    expect(group.children).toHaveLength(2);
    const path = group.getObjectByName('planned-path:job-route') as Line;
    const trace = group.getObjectByName('travelled-trace:job-route') as Line;
    expect(path.material).toBeInstanceOf(LineDashedMaterial);
    expect(path.geometry.getAttribute('lineDistance')).toBeDefined();
    expect(trace.material).toBeInstanceOf(LineBasicMaterial);
    expect(path.geometry.getAttribute('position').count).toBe(3);
    expect(trace.geometry.getAttribute('position').count).toBe(2);
  });

  it('removes overlays when no active job has a planned path', () => {
    const group = new Group();
    rebuildNavigationOverlay(group, [navigationJob()]);
    rebuildNavigationOverlay(group, [{ ...navigationJob(), path: [] }]);
    expect(group.children).toHaveLength(0);
  });
});
