import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/scene';
import { distanceToClosestPerson, PERSON_CLEARANCE, planPersonDetour } from '../src/world/localAvoidance';

describe('person local avoidance', () => {
  it('creates execution-only waypoints around a person blocking a path segment', () => {
    const world = createInitialWorld();
    const detour = planPersonDetour(world.robot.pose, { x: 4, y: 2, theta: 0 }, world.people);
    expect(detour?.personId).toBe('person-li');
    expect(detour?.waypoints).toHaveLength(2);
    for (const waypoint of detour!.waypoints) expect(distanceToClosestPerson(waypoint, world.people)).toBeGreaterThan(PERSON_CLEARANCE);
  });

  it('does not create a detour when people do not intersect the segment corridor', () => {
    const world = createInitialWorld();
    expect(planPersonDetour(world.robot.pose, { x: 1.5, y: 5, theta: 0 }, world.people)).toBeUndefined();
  });

  it('rejects a detour side whose execution segments cross a fixed obstacle', () => {
    const world = createInitialWorld();
    const detour = planPersonDetour(world.robot.pose, { x: 4, y: 2, theta: 0 }, world.people, new Map(), (_x, y) => y < 1.5);
    expect(detour?.waypoints.every((point) => point.y >= 1.5)).toBe(true);
  });
});
