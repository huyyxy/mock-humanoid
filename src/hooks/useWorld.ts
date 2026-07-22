import { useSyncExternalStore } from 'react';
import type { SimulationEngine } from '../world/engine';

export function useWorld(engine: SimulationEngine) {
  return useSyncExternalStore(engine.subscribe, engine.getSnapshot, engine.getSnapshot);
}
