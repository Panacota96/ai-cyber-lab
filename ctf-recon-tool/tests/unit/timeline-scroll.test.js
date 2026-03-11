import { getTimelineScrollState, shouldFollowTimeline } from '@/lib/timeline-scroll';

describe('timeline scroll helpers', () => {
  it('detects when the feed is near the bottom', () => {
    const state = getTimelineScrollState({ scrollTop: 952, scrollHeight: 1200, clientHeight: 200 });
    expect(state.nearBottom).toBe(true);
  });

  it('keeps auto-follow disabled when user is scrolled up', () => {
    expect(shouldFollowTimeline({ followEnabled: false, nearBottom: false })).toBe(false);
  });
});
