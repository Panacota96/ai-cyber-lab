import { getSession, getTimeline, listCredentials, listFindings, listFlagSubmissions, listSessionTargets, getWriteup } from '@/lib/db';
import { listArtifacts } from '@/lib/artifact-repository';
import { compareSessionFindings } from '@/lib/report-comparison';

function diffSets(beforeValues = [], afterValues = []) {
  const beforeSet = new Set(beforeValues.filter(Boolean));
  const afterSet = new Set(afterValues.filter(Boolean));
  return {
    before: [...beforeSet],
    after: [...afterSet],
    added: [...afterSet].filter((value) => !beforeSet.has(value)),
    removed: [...beforeSet].filter((value) => !afterSet.has(value)),
    shared: [...afterSet].filter((value) => beforeSet.has(value)),
  };
}

function uniqueSorted(values = []) {
  return [...new Set(values.filter(Boolean))].sort((left, right) => String(left).localeCompare(String(right)));
}

function normalizeCredentialKey(credential) {
  return [
    credential?.host || '',
    credential?.port || '',
    credential?.service || '',
    credential?.username || '',
    credential?.hash || '',
    credential?.label || '',
  ].join('|').toLowerCase();
}

function normalizeArtifactKey(artifact) {
  return [
    artifact?.sha256 || '',
    artifact?.filename || '',
    artifact?.kind || '',
  ].join('|').toLowerCase();
}

function countBy(entries = [], getKey) {
  return (Array.isArray(entries) ? entries : []).reduce((acc, entry) => {
    const key = String(getKey(entry) || '').trim();
    if (!key) return acc;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

export function compareSessions({ beforeSessionId, afterSessionId } = {}) {
  const beforeSession = getSession(beforeSessionId);
  const afterSession = getSession(afterSessionId);
  if (!beforeSession || !afterSession) return null;

  const beforeTargets = listSessionTargets(beforeSessionId);
  const afterTargets = listSessionTargets(afterSessionId);
  const beforeTimeline = getTimeline(beforeSessionId);
  const afterTimeline = getTimeline(afterSessionId);
  const beforeFindings = listFindings(beforeSessionId);
  const afterFindings = listFindings(afterSessionId);
  const beforeCredentials = listCredentials(beforeSessionId);
  const afterCredentials = listCredentials(afterSessionId);
  const beforeFlags = listFlagSubmissions(beforeSessionId);
  const afterFlags = listFlagSubmissions(afterSessionId);
  const beforeArtifacts = listArtifacts(beforeSessionId);
  const afterArtifacts = listArtifacts(afterSessionId);
  const beforeWriteup = getWriteup(beforeSessionId);
  const afterWriteup = getWriteup(afterSessionId);
  const findingComparison = compareSessionFindings(beforeFindings, afterFindings, {});

  const targetDiff = diffSets(
    beforeTargets.map((target) => target.target || target.label || ''),
    afterTargets.map((target) => target.target || target.label || '')
  );
  const commandDiff = diffSets(
    beforeTimeline.filter((event) => event.type === 'command').map((event) => event.command || ''),
    afterTimeline.filter((event) => event.type === 'command').map((event) => event.command || '')
  );
  const credentialDiff = diffSets(
    beforeCredentials.map(normalizeCredentialKey),
    afterCredentials.map(normalizeCredentialKey)
  );
  const flagDiff = diffSets(
    beforeFlags.map((flag) => flag.value || ''),
    afterFlags.map((flag) => flag.value || '')
  );
  const artifactDiff = diffSets(
    beforeArtifacts.map(normalizeArtifactKey),
    afterArtifacts.map(normalizeArtifactKey)
  );

  return {
    beforeSession,
    afterSession,
    summary: {
      targetDelta: targetDiff.added.length - targetDiff.removed.length,
      timelineDelta: afterTimeline.length - beforeTimeline.length,
      findingDelta: findingComparison.afterFindings.length - findingComparison.beforeFindings.length,
      credentialDelta: afterCredentials.length - beforeCredentials.length,
      flagDelta: afterFlags.length - beforeFlags.length,
      artifactDelta: afterArtifacts.length - beforeArtifacts.length,
      writeupDelta: (afterWriteup?.content || '').length - (beforeWriteup?.content || '').length,
    },
    targets: targetDiff,
    timeline: {
      beforeCount: beforeTimeline.length,
      afterCount: afterTimeline.length,
      eventTypeCounts: {
        before: countBy(beforeTimeline, (event) => event.type || 'unknown'),
        after: countBy(afterTimeline, (event) => event.type || 'unknown'),
      },
      commandDiff,
    },
    findings: {
      ...findingComparison,
      summary: {
        beforeCount: findingComparison.beforeFindings.length,
        afterCount: findingComparison.afterFindings.length,
        newCount: findingComparison.newFindings.length,
        remediatedCount: findingComparison.remediatedFindings.length,
        changedCount: findingComparison.changedFindings.length,
        persistedCount: findingComparison.persistedFindings.length,
      },
    },
    credentials: {
      beforeCount: beforeCredentials.length,
      afterCount: afterCredentials.length,
      ...credentialDiff,
    },
    flags: {
      beforeCount: beforeFlags.length,
      afterCount: afterFlags.length,
      ...flagDiff,
      statusCounts: {
        before: countBy(beforeFlags, (flag) => flag.status || 'captured'),
        after: countBy(afterFlags, (flag) => flag.status || 'captured'),
      },
    },
    artifacts: {
      beforeCount: beforeArtifacts.length,
      afterCount: afterArtifacts.length,
      ...artifactDiff,
      kindCounts: {
        before: countBy(beforeArtifacts, (artifact) => artifact.kind || 'upload'),
        after: countBy(afterArtifacts, (artifact) => artifact.kind || 'upload'),
      },
    },
    writeup: {
      beforeLength: (beforeWriteup?.content || '').length,
      afterLength: (afterWriteup?.content || '').length,
      delta: (afterWriteup?.content || '').length - (beforeWriteup?.content || '').length,
    },
    tags: {
      before: uniqueSorted(beforeSession?.metadata?.tags || []),
      after: uniqueSorted(afterSession?.metadata?.tags || []),
    },
  };
}
