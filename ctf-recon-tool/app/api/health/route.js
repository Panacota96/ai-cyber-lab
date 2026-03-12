import { NextResponse } from 'next/server';
import { getDbStats } from '@/lib/db';
import fs from 'fs';
import path from 'path';
import pkg from '../../../package.json';
import { config } from '@/lib/config';
import { getOfflineProviderStatus } from '@/lib/ai-provider-runtime';
import { getPlatformCapabilities } from '@/lib/platform-adapters';
import {
  isAdminApiEnabled,
  isAdversarialChallengeModeEnabled,
  isAutoWriteupSuggestionsEnabled,
  isCommandExecutionEnabled,
  isExperimentalAiEnabled,
  isOfflineAiEnabled,
  isShellHubEnabled,
} from '@/lib/security';

export async function GET() {
  const result = {
    status: 'ok',
    version: pkg.version,
    timestamp: new Date().toISOString(),
    db: { status: 'ok', stats: null },
    ai: {
      anthropic: !!config.anthropicApiKey,
      google: !!config.geminiApiKey,
      openai: !!config.openaiApiKey,
      offline: getOfflineProviderStatus(),
    },
    platforms: getPlatformCapabilities(),
    disk: {
      dataDir: fs.existsSync(path.join(process.cwd(), 'data')) ? 'ok' : 'missing',
    },
    features: {
      commandExecutionEnabled: isCommandExecutionEnabled(),
      shellHubEnabled: isShellHubEnabled(),
      adminApiEnabled: isAdminApiEnabled(),
      experimentalAiEnabled: isExperimentalAiEnabled(),
      offlineAiEnabled: isOfflineAiEnabled(),
      autoWriteupSuggestionsEnabled: isAutoWriteupSuggestionsEnabled(),
      adversarialChallengeModeEnabled: isAdversarialChallengeModeEnabled(),
      apiTokenRequired: Boolean(process.env.APP_API_TOKEN || process.env.APP_API_TOKEN_2),
    },
  };

  try {
    result.db.stats = getDbStats();
  } catch (err) {
    result.db.status = 'error';
    result.db.error = err.message;
    result.status = 'degraded';
  }

  if (result.disk.dataDir !== 'ok') {
    result.status = 'degraded';
  }

  return NextResponse.json(result);
}
