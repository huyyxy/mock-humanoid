import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

describe('desktop viewport layout contract', () => {
  it('prevents side content from increasing the simulation canvas height', () => {
    expect(css).toMatch(/\.app-shell\s*\{[^}]*height:\s*100dvh;[^}]*overflow:\s*hidden;/s);
    expect(css).toMatch(/\.workspace\s*\{[^}]*height:\s*0;[^}]*overflow:\s*hidden;/s);
    expect(css).toMatch(/\.sim-column\s*\{[^}]*min-height:\s*0;[^}]*overflow:\s*hidden;/s);
    expect(css).toMatch(/\.side-column\s*\{[^}]*min-height:\s*0;[^}]*overflow:\s*hidden;/s);
  });

  it('keeps message history as an independent scroll container', () => {
    expect(css).toMatch(/\.messages,\s*\.events\s*\{[^}]*overflow:\s*hidden auto;[^}]*flex:\s*1 1 0;/s);
    expect(css).toMatch(/\.composer\s*\{[^}]*flex:\s*0 0 auto;/s);
  });
});
