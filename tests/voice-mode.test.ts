import { describe, expect, it } from 'vitest';
import { applyVoiceMode, DEFAULT_SESSION } from '../src/App';

describe('voice mode runtime contract', () => {
  it('forces server_vad while preserving configured thresholds', () => {
    const runtime = applyVoiceMode(DEFAULT_SESSION, 'server_vad') as any;
    expect(runtime.hearing.turn_detection).toEqual({ type: 'server_vad', threshold: .05, prefix_padding_ms: 300, silence_duration_ms: 200 });
  });

  it('uses null turn detection for Client VAD / Push to Talk without mutating the editor JSON', () => {
    const session = structuredClone(DEFAULT_SESSION); const runtime = applyVoiceMode(session, 'push_to_talk') as any;
    expect(runtime.hearing.turn_detection).toBeNull(); expect((session.hearing as any).turn_detection.type).toBe('server_vad');
  });
});
