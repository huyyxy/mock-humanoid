export const CONVERSATION_BOTTOM_THRESHOLD = 64;

export interface ScrollMetrics {
  scrollHeight: number;
  scrollTop: number;
  clientHeight: number;
}

export function isConversationNearBottom(metrics: ScrollMetrics) {
  return metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight <= CONVERSATION_BOTTOM_THRESHOLD;
}

export function scrollConversationToLatest(element: ScrollMetrics) {
  element.scrollTop = element.scrollHeight;
}
