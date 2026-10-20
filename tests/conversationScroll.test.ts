import { describe, expect, it } from 'vitest';
import { CONVERSATION_BOTTOM_THRESHOLD, isConversationNearBottom, scrollConversationToLatest } from '../src/components/conversationScroll';

describe('conversation scrolling', () => {
  it('follows new content while the user remains near the bottom', () => {
    expect(isConversationNearBottom({ scrollHeight: 1000, scrollTop: 540, clientHeight: 400 })).toBe(true);
    expect(isConversationNearBottom({ scrollHeight: 1000, scrollTop: 500, clientHeight: 400 })).toBe(false);
    expect(CONVERSATION_BOTTOM_THRESHOLD).toBe(64);
  });

  it('moves the scroll container to the latest message', () => {
    const element = { scrollHeight: 1200, scrollTop: 100, clientHeight: 400 };
    scrollConversationToLatest(element);
    expect(element.scrollTop).toBe(1200);
  });
});
