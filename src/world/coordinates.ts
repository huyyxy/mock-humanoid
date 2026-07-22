import { MAP } from '../data/scene';

/** Maps the navigation world's Z-up coordinates into Three.js Y-up coordinates. */
export function worldToScene(x: number, y: number, height = 0) {
  return { x, y: height, z: MAP.height - y };
}

export function worldYBoundsToSceneZ(minY: number, maxY: number) {
  return { minZ: MAP.height - maxY, maxZ: MAP.height - minY };
}

export function worldThetaToSceneYaw(theta: number) {
  return theta;
}
