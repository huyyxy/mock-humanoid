import { describe, expect, it } from 'vitest';
import { LOCATIONS, MAP, OBSTACLES, PATROL_ROUTE } from '../src/data/scene';
import { isVisible, planPath, PlanningTimeoutError, pointBlocked } from '../src/world/geometry';

describe('scene navigation contract', () => {
  it('keeps the complete patrol loop reachable with the documented grid and inflation', () => {
    expect(MAP.resolution).toBe(.05); expect(MAP.inflation).toBe(.4);
    const route = PATROL_ROUTE.map((id) => LOCATIONS.find((location) => location.id === id)!);
    for (let i = 0; i < route.length; i++) expect(planPath(route[i], route[(i + 1) % route.length]).length).toBeGreaterThan(1);
  });

  it('rejects inflated obstacles and uses raw obstacles for visibility', () => {
    expect(pointBlocked(5.5, 3)).toBe(true);
    expect(isVisible({ x: 4.8, y: 3, theta: 0 }, { x: 7.2, y: 3, theta: 0 })).toBe(false);
    expect(OBSTACLES.length).toBe(6);
  });

  it('does not treat a disjoint collinear obstacle edge as occlusion', () => {
    expect(isVisible({ x: 1.7, y: 2, theta: 0 }, { x: 2.7, y: 2, theta: 0 })).toBe(true);
  });

  it('checks the planning deadline from inside the A* loop', () => {
    let checks = 0;
    expect(() => planPath(LOCATIONS[0], LOCATIONS[1], { timeoutMs: 2_000, now: () => checks++ ? 2_001 : 0 })).toThrow(PlanningTimeoutError);
  });
});
