const DEFAULT_MAX_CONCURRENT = 2;
const MAX_CONCURRENT_UPPER_BOUND = 16;

const queueState = globalThis.__helmsExecuteQueueState || (globalThis.__helmsExecuteQueueState = {
  activeEventIds: new Set(),
  pendingJobs: [],
});

export function resolveMaxConcurrentCommands(rawValue = process.env.MAX_CONCURRENT_COMMANDS) {
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed)) return DEFAULT_MAX_CONCURRENT;
  return Math.max(1, Math.min(MAX_CONCURRENT_UPPER_BOUND, Math.floor(parsed)));
}

export function getMaxConcurrentCommands() {
  return resolveMaxConcurrentCommands(process.env.MAX_CONCURRENT_COMMANDS);
}

function canStartMore() {
  return queueState.activeEventIds.size < getMaxConcurrentCommands();
}

function startJob(job) {
  queueState.activeEventIds.add(job.eventId);
  try {
    job.start();
  } catch (error) {
    queueState.activeEventIds.delete(job.eventId);
    if (typeof job.onStartError === 'function') {
      job.onStartError(error);
    }
    drainExecutionQueue();
  }
}

export function enqueueExecutionJob(job) {
  if (!job?.eventId || typeof job.start !== 'function') {
    throw new Error('Invalid execution job');
  }

  if (canStartMore()) {
    startJob(job);
    return 'started';
  }

  queueState.pendingJobs.push(job);
  return 'queued';
}

export function drainExecutionQueue() {
  while (queueState.pendingJobs.length > 0 && canStartMore()) {
    const nextJob = queueState.pendingJobs.shift();
    startJob(nextJob);
  }
}

export function markExecutionSettled(eventId) {
  if (!eventId) return;
  queueState.activeEventIds.delete(eventId);
  drainExecutionQueue();
}

export function removeQueuedExecutionJob(eventId, sessionId = null) {
  const index = queueState.pendingJobs.findIndex((job) => (
    job.eventId === eventId && (sessionId ? job.sessionId === sessionId : true)
  ));
  if (index < 0) return null;
  const [job] = queueState.pendingJobs.splice(index, 1);
  return job || null;
}

export function getExecutionQueueSnapshot() {
  return {
    maxConcurrent: getMaxConcurrentCommands(),
    activeCount: queueState.activeEventIds.size,
    queuedCount: queueState.pendingJobs.length,
    activeEventIds: Array.from(queueState.activeEventIds),
    queuedEventIds: queueState.pendingJobs.map((job) => job.eventId),
  };
}

export function clearExecutionQueueForTests() {
  queueState.activeEventIds.clear();
  queueState.pendingJobs = [];
}
