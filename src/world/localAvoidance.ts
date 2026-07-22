import type { PersonState, Pose2D } from '../types';
import { pointBlocked } from './geometry';

export const PERSON_CLEARANCE = 0.65;
const DETOUR_OFFSET = 0.75;
const DETOUR_APPROACH = 0.55;

export interface PersonDetour {
  personId: string;
  side: -1 | 1;
  waypoints: Pose2D[];
}

function segmentClear(start: Pick<Pose2D, 'x' | 'y'>, goal: Pick<Pose2D, 'x' | 'y'>, blocked: (x: number, y: number) => boolean) {
  const length = Math.hypot(goal.x - start.x, goal.y - start.y);
  const samples = Math.max(1, Math.ceil(length / 0.05));
  for (let index = 1; index <= samples; index++) {
    const ratio = index / samples;
    if (blocked(start.x + (goal.x - start.x) * ratio, start.y + (goal.y - start.y) * ratio)) return false;
  }
  return true;
}

function sideOrder(personId: string, preferredSide?: -1 | 1): Array<-1 | 1> {
  if (preferredSide) return [preferredSide, preferredSide === 1 ? -1 : 1];
  const checksum = [...personId].reduce((sum, character) => sum + character.charCodeAt(0), 0);
  const first: -1 | 1 = checksum % 2 === 0 ? 1 : -1;
  return [first, first === 1 ? -1 : 1];
}

/**
 * Produces temporary waypoints around the nearest person intersecting the
 * current path segment. These points are execution-only and never enter job.path.
 */
export function planPersonDetour(
  start: Pose2D,
  goal: Pose2D,
  people: PersonState[],
  preferredSides: ReadonlyMap<string, -1 | 1> = new Map(),
  blocked: (x: number, y: number) => boolean = pointBlocked,
): PersonDetour | undefined {
  const dx = goal.x - start.x, dy = goal.y - start.y, length = Math.hypot(dx, dy);
  if (length < 1e-6) return undefined;
  const ux = dx / length, uy = dy / length;
  const blockers = people.map((person) => {
    const px = person.pose.x - start.x, py = person.pose.y - start.y;
    const projection = px * ux + py * uy;
    const lateral = Math.abs(px * uy - py * ux);
    return { person, projection, lateral };
  }).filter(({ projection, lateral }) => projection > 0.02 && projection < length && lateral < PERSON_CLEARANCE)
    .sort((a, b) => a.projection - b.projection);

  for (const { person } of blockers) {
    for (const side of sideOrder(person.id, preferredSides.get(person.id))) {
      const offsetX = -uy * side * DETOUR_OFFSET, offsetY = ux * side * DETOUR_OFFSET;
      const before: Pose2D = {
        x: person.pose.x - ux * DETOUR_APPROACH + offsetX,
        y: person.pose.y - uy * DETOUR_APPROACH + offsetY,
        theta: Math.atan2(uy, ux),
      };
      const after: Pose2D = {
        x: person.pose.x + ux * DETOUR_APPROACH + offsetX,
        y: person.pose.y + uy * DETOUR_APPROACH + offsetY,
        theta: Math.atan2(uy, ux),
      };
      if (segmentClear(start, before, blocked) && segmentClear(before, after, blocked) && segmentClear(after, goal, blocked)) return { personId: person.id, side, waypoints: [before, after] };
    }
  }
  return undefined;
}

export function distanceToClosestPerson(pose: Pick<Pose2D, 'x' | 'y'>, people: PersonState[]) {
  return people.reduce((minimum, person) => Math.min(minimum, Math.hypot(pose.x - person.pose.x, pose.y - person.pose.y)), Infinity);
}
