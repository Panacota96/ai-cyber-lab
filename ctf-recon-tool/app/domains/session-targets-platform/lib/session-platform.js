export const PLATFORM_OPTIONS = [
  { value: 'htb', label: 'Hack The Box' },
  { value: 'thm', label: 'TryHackMe' },
  { value: 'ctfd', label: 'CTFd' },
];

export function formatPlatformTypeLabel(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'htb') return 'Hack The Box';
  if (normalized === 'thm') return 'TryHackMe';
  if (normalized === 'ctfd') return 'CTFd';
  return normalized ? normalized.toUpperCase() : 'Platform';
}

export function getPlatformRemoteIdPlaceholder(platformType) {
  if (platformType === 'htb') return 'HTB Event ID';
  if (platformType === 'thm') return 'THM Room Code';
  return 'CTFd Challenge ID';
}

export function derivePlatformDraftState(linkedPlatform) {
  if (!linkedPlatform) {
    return {
      platformTypeDraft: 'htb',
      platformRemoteIdDraft: '',
      platformLabelDraft: '',
      platformChallengeIdDraft: '',
    };
  }

  if (linkedPlatform.type === 'htb') {
    return {
      platformTypeDraft: linkedPlatform.type || 'htb',
      platformRemoteIdDraft: linkedPlatform.remoteContext?.eventId || linkedPlatform.remoteId || '',
      platformLabelDraft: linkedPlatform.label || '',
      platformChallengeIdDraft: linkedPlatform.remoteContext?.challengeId || '',
    };
  }

  if (linkedPlatform.type === 'ctfd') {
    return {
      platformTypeDraft: linkedPlatform.type || 'ctfd',
      platformRemoteIdDraft: linkedPlatform.remoteContext?.challengeId || linkedPlatform.remoteId || '',
      platformLabelDraft: linkedPlatform.label || '',
      platformChallengeIdDraft: '',
    };
  }

  return {
    platformTypeDraft: linkedPlatform.type || 'thm',
    platformRemoteIdDraft: linkedPlatform.remoteContext?.roomCode || linkedPlatform.remoteId || '',
    platformLabelDraft: linkedPlatform.label || '',
    platformChallengeIdDraft: '',
  };
}
