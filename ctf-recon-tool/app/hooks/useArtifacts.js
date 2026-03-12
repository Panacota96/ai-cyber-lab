'use client';

import { useCallback, useEffect, useState } from 'react';

export function useArtifacts({ sessionId, targetId = null, apiFetch, enabled = true }) {
  const [artifacts, setArtifacts] = useState([]);
  const [selectedArtifactId, setSelectedArtifactId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const refreshArtifacts = useCallback(async () => {
    if (!enabled || !sessionId) return [];
    setLoading(true);
    try {
      const response = await apiFetch(`/api/artifacts?sessionId=${encodeURIComponent(sessionId)}`);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to load artifacts.');
      }
      const nextArtifacts = Array.isArray(payload?.artifacts) ? payload.artifacts : [];
      setArtifacts(nextArtifacts);
      setError('');
      return nextArtifacts;
    } catch (fetchError) {
      setArtifacts([]);
      setError(fetchError?.message || 'Failed to load artifacts.');
      return [];
    } finally {
      setLoading(false);
    }
  }, [apiFetch, enabled, sessionId]);

  const uploadArtifact = useCallback(async ({
    file,
    notes = '',
    shellSessionId = '',
    sourceTranscriptChunkId = '',
    linkedFindingIds = [],
    linkedTimelineEventIds = [],
  }) => {
    if (!enabled || !sessionId || !file) return null;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.set('sessionId', sessionId);
      if (targetId) formData.set('targetId', targetId);
      formData.set('file', file);
      if (notes) formData.set('notes', notes);
      if (shellSessionId) formData.set('shellSessionId', shellSessionId);
      if (sourceTranscriptChunkId) formData.set('sourceTranscriptChunkId', String(sourceTranscriptChunkId));
      if (linkedFindingIds.length > 0) formData.set('linkedFindingIds', linkedFindingIds.join(','));
      if (linkedTimelineEventIds.length > 0) formData.set('linkedTimelineEventIds', linkedTimelineEventIds.join(','));

      const response = await apiFetch('/api/artifacts', {
        method: 'POST',
        body: formData,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to upload artifact.');
      }
      const artifact = payload?.artifact || null;
      if (artifact?.id) {
        setArtifacts((prev) => [artifact, ...prev.filter((item) => item.id !== artifact.id)]);
        setSelectedArtifactId(artifact.id);
      }
      setError('');
      return artifact;
    } catch (uploadError) {
      setError(uploadError?.message || 'Failed to upload artifact.');
      return null;
    } finally {
      setUploading(false);
    }
  }, [apiFetch, enabled, sessionId, targetId]);

  const createArtifactFromTranscript = useCallback(async (payload) => {
    if (!enabled || !sessionId) return null;
    const response = await apiFetch('/api/artifacts/from-transcript', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, sessionId, targetId }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body?.error || 'Failed to save transcript artifact.');
    }
    const artifact = body?.artifact || null;
    if (artifact?.id) {
      setArtifacts((prev) => [artifact, ...prev.filter((item) => item.id !== artifact.id)]);
      setSelectedArtifactId(artifact.id);
    }
    return artifact;
  }, [apiFetch, enabled, sessionId, targetId]);

  const updateArtifact = useCallback(async (artifactId, updates) => {
    const response = await apiFetch('/api/artifacts', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, artifactId, targetId, ...updates }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.error || 'Failed to update artifact.');
    }
    const artifact = payload?.artifact || null;
    if (artifact?.id) {
      setArtifacts((prev) => prev.map((item) => item.id === artifact.id ? artifact : item));
    }
    return artifact;
  }, [apiFetch, sessionId, targetId]);

  const deleteArtifactById = useCallback(async (artifactId) => {
    const response = await apiFetch('/api/artifacts', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, artifactId }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.error || 'Failed to delete artifact.');
    }
    setArtifacts((prev) => prev.filter((item) => item.id !== artifactId));
    setSelectedArtifactId((prev) => prev === artifactId ? null : prev);
    return true;
  }, [apiFetch, sessionId]);

  useEffect(() => {
    setArtifacts([]);
    setSelectedArtifactId(null);
    setError('');
  }, [enabled, sessionId]);

  useEffect(() => {
    if (!enabled || !sessionId) return;
    void refreshArtifacts();
  }, [enabled, refreshArtifacts, sessionId]);

  const selectedArtifact = artifacts.find((artifact) => artifact.id === selectedArtifactId) || null;

  return {
    artifacts,
    selectedArtifactId,
    selectedArtifact,
    loading,
    uploading,
    error,
    refreshArtifacts,
    selectArtifact: setSelectedArtifactId,
    uploadArtifact,
    createArtifactFromTranscript,
    updateArtifact,
    deleteArtifact: deleteArtifactById,
  };
}
