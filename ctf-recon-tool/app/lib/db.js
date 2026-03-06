import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const SESSIONS_DIR = path.join(DATA_DIR, 'sessions');

// Initialize directories
if (!fs.existsSync(SESSIONS_DIR)) {
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
}

function getSessionPath(sessionId) {
  const sessionPath = path.join(SESSIONS_DIR, sessionId);
  const timelinePath = path.join(sessionPath, 'timeline.json');
  const screenshotsPath = path.join(sessionPath, 'screenshots');

  if (!fs.existsSync(sessionPath)) {
    fs.mkdirSync(sessionPath, { recursive: true });
  }
  if (!fs.existsSync(screenshotsPath)) {
    fs.mkdirSync(screenshotsPath, { recursive: true });
  }
  if (!fs.existsSync(timelinePath)) {
    fs.writeFileSync(timelinePath, JSON.stringify([]));
  }

  return { sessionPath, timelinePath, screenshotsPath };
}

export function listSessions() {
  try {
    const dirs = fs.readdirSync(SESSIONS_DIR, { withFileTypes: true });
    return dirs
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);
  } catch (error) {
    console.error('Error listing sessions:', error);
    return [];
  }
}

export function getTimeline(sessionId = 'default') {
  try {
    const { timelinePath } = getSessionPath(sessionId);
    const data = fs.readFileSync(timelinePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error(`Error reading timeline for session ${sessionId}:`, error);
    return [];
  }
}

export function addTimelineEvent(sessionId = 'default', event) {
  try {
    const { timelinePath } = getSessionPath(sessionId);
    const timeline = getTimeline(sessionId);
    const newEvent = {
        ...event,
        id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
        timestamp: new Date().toISOString()
    };
    timeline.push(newEvent);
    fs.writeFileSync(timelinePath, JSON.stringify(timeline, null, 2));
    return newEvent;
  } catch (error) {
    console.error(`Error saving timeline event for session ${sessionId}:`, error);
    return null;
  }
}

export function updateTimelineEvent(sessionId = 'default', id, updates) {
    try {
        const { timelinePath } = getSessionPath(sessionId);
        const timeline = getTimeline(sessionId);
        const index = timeline.findIndex(e => e.id === id);
        if (index === -1) return null;

        timeline[index] = { ...timeline[index], ...updates };
        fs.writeFileSync(timelinePath, JSON.stringify(timeline, null, 2));
        return timeline[index];
    } catch (error) {
        console.error(`Error updating timeline event for session ${sessionId}:`, error);
        return null;
    }
}

export function getScreenshotDir(sessionId) {
  return getSessionPath(sessionId).screenshotsPath;
}

