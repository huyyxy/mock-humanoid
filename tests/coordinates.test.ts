import { describe, expect, it } from 'vitest';
import { LOCATIONS, MAP } from '../src/data/scene';
import { worldThetaToSceneYaw, worldToScene, worldYBoundsToSceneZ } from '../src/world/coordinates';

describe('2D/3D coordinate adapter', () => {
  it('keeps +x right and maps world +y toward the north side of the default 3D view', () => {
    expect(worldToScene(0, 0)).toEqual({ x: 0, y: 0, z: MAP.height });
    expect(worldToScene(MAP.width, MAP.height)).toEqual({ x: MAP.width, y: 0, z: 0 });
    expect(worldToScene(3, 4, 1.2)).toEqual({ x: 3, y: 1.2, z: 4 });
  });

  it('mirrors obstacle Y bounds without changing their size', () => {
    const range = worldYBoundsToSceneZ(2, 5.4);
    expect(range.minZ).toBeCloseTo(2.6); expect(range.maxZ).toBe(6);
    expect(range.maxZ - range.minZ).toBeCloseTo(3.4);
  });

  it('preserves location ordering and reflects yaw consistently', () => {
    const frontDesk = LOCATIONS.find((item) => item.id === 'front-desk')!;
    const meetingRoom = LOCATIONS.find((item) => item.id === 'meeting-room')!;
    expect(worldToScene(meetingRoom.x, meetingRoom.y).z).toBeLessThan(worldToScene(frontDesk.x, frontDesk.y).z);
    expect(worldThetaToSceneYaw(Math.PI / 2)).toBe(Math.PI / 2);
  });
});
