import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve('public/assets/robots/unitree-g1');

describe('Unitree G1 asset contract', () => {
  it('ships a verifiable manifest and every referenced file', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'asset-manifest.json'), 'utf8'));
    expect(manifest.robot).toBe('Unitree G1 29-DOF'); expect(manifest.license.spdx).toBe('BSD-3-Clause');
    for (const file of manifest.files) { const target = path.join(root, file.path); expect(fs.existsSync(target), file.path).toBe(true); expect(crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex')).toBe(file.sha256); }
  });

  it('resolves every URDF mesh and semantic target', () => {
    const urdf = fs.readFileSync(path.join(root, 'g1.urdf'), 'utf8');
    for (const match of urdf.matchAll(/filename="(meshes\/[^"]+)"/g)) expect(fs.existsSync(path.join(root, match[1]))).toBe(true);
    const semantic = JSON.parse(fs.readFileSync(path.join(root, 'semantic-map.json'), 'utf8'));
    for (const name of [semantic.left_hand_link, semantic.right_hand_link, semantic.face_light_target.link]) expect(urdf).toContain(`name="${name}"`);
  });
});
