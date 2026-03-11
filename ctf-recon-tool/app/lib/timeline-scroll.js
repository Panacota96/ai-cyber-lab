export function getTimelineScrollState({ scrollTop = 0, scrollHeight = 0, clientHeight = 0 } = {}) {
  const nearTop = scrollTop <= 20;
  const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
  const nearBottom = distanceFromBottom <= 48;
  return { nearTop, nearBottom, distanceFromBottom };
}

export function shouldFollowTimeline({ followEnabled = true, nearBottom = false } = {}) {
  return Boolean(followEnabled || nearBottom);
}
