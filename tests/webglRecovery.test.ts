import { describe, expect, it, vi } from 'vitest';
import { bindWebGLRecovery } from '../src/components/webglRecovery';

describe('WebGL context recovery lifecycle', () => {
  it('prevents permanent context loss and reports loss and restoration', () => {
    const canvas = new EventTarget() as HTMLCanvasElement;
    const onLost = vi.fn(), onRestored = vi.fn();
    const unbind = bindWebGLRecovery(canvas, { onLost, onRestored });
    const lost = new Event('webglcontextlost', { cancelable: true });

    canvas.dispatchEvent(lost);
    expect(lost.defaultPrevented).toBe(true);
    expect(onLost).toHaveBeenCalledOnce();
    canvas.dispatchEvent(new Event('webglcontextrestored'));
    expect(onRestored).toHaveBeenCalledOnce();

    unbind();
    canvas.dispatchEvent(new Event('webglcontextrestored'));
    expect(onRestored).toHaveBeenCalledOnce();
  });
});
