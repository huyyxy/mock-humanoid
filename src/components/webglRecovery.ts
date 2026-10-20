export interface WebGLRecoveryCallbacks {
  onLost: () => void;
  onRestored: () => void;
}

export function bindWebGLRecovery(canvas: HTMLCanvasElement, callbacks: WebGLRecoveryCallbacks) {
  const handleLost = (event: Event) => { event.preventDefault(); callbacks.onLost(); };
  const handleRestored = () => callbacks.onRestored();
  canvas.addEventListener('webglcontextlost', handleLost);
  canvas.addEventListener('webglcontextrestored', handleRestored);
  return () => {
    canvas.removeEventListener('webglcontextlost', handleLost);
    canvas.removeEventListener('webglcontextrestored', handleRestored);
  };
}
