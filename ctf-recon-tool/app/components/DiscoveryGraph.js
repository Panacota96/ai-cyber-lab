'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import {
  NODE_COLORS,
  NODE_ICONS,
  NODE_PHASE,
  PHASE_ORDER,
  layoutGraphNodes,
  mergeGraphState,
  normalizeGraphState,
} from '@/lib/graph-derive';

const ALL_PHASES = ['All', ...PHASE_ORDER];

function isHighSignalEdge(edge = {}) {
  return [
    'vulnerable',
    'credential',
    'hash',
    'flag',
    'exploit',
    'api',
    'finding',
    'database',
    'directory',
    'username',
  ].includes(String(edge.label || '').trim().toLowerCase());
}

function DiscoveryNode({ data, selected }) {
  const {
    nodeType = 'host',
    label = '',
    phase = '',
    color = '#58a6ff',
    isHighlighted = false,
    isDimmed = false,
    degree = 0,
    nodeSize = 1,
  } = data;
  const [editing, setEditing] = useState(false);
  const [editLabel, setEditLabel] = useState(label);

  useEffect(() => {
    setEditLabel(label);
  }, [label]);

  const minWidth = Math.round(120 + ((nodeSize - 1) * 54));
  const maxWidth = Math.round(220 + ((nodeSize - 1) * 36));
  const borderColor = isHighlighted ? '#ffffff' : color;
  const opacity = isDimmed ? 0.28 : 1;

  const commitEdit = () => {
    setEditing(false);
    const nextLabel = editLabel.trim();
    if (nextLabel && data.onLabelChange) {
      data.onLabelChange(nextLabel);
      return;
    }
    setEditLabel(label);
  };

  return (
    <div
      onDoubleClick={(event) => {
        event.stopPropagation();
        setEditing(true);
        setEditLabel(label);
      }}
      style={{
        minWidth: `${minWidth}px`,
        maxWidth: `${maxWidth}px`,
        background: 'rgba(13,17,23,0.94)',
        border: `2px solid ${borderColor}`,
        borderRadius: '10px',
        padding: `${8 + (nodeSize - 1) * 6}px ${10 + (nodeSize - 1) * 6}px`,
        cursor: 'grab',
        boxShadow: isHighlighted
          ? `0 0 0 2px rgba(255,255,255,0.15), 0 0 18px ${color}aa`
          : `0 0 8px ${color}55`,
        transition: 'box-shadow 0.2s ease, opacity 0.2s ease, transform 0.2s ease',
        userSelect: 'none',
        opacity,
        transform: selected ? 'scale(1.02)' : 'scale(1)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '4px' }}>
        <span style={{
          fontSize: '0.62rem',
          fontWeight: 700,
          letterSpacing: '0.5px',
          textTransform: 'uppercase',
          color,
          fontFamily: 'var(--font-mono, monospace)',
        }}>
          {NODE_ICONS[nodeType] || 'NODE'}
        </span>
        <span style={{ fontSize: '0.6rem', color: '#8b949e', fontFamily: 'var(--font-mono, monospace)' }}>
          d={degree}
        </span>
      </div>
      {editing ? (
        <input
          autoFocus
          value={editLabel}
          onChange={(event) => setEditLabel(event.target.value)}
          onBlur={commitEdit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commitEdit();
            if (event.key === 'Escape') {
              setEditing(false);
              setEditLabel(label);
            }
          }}
          style={{
            width: '100%',
            background: 'transparent',
            border: 'none',
            borderBottom: `1px solid ${color}`,
            color: '#c9d1d9',
            fontFamily: 'var(--font-mono, monospace)',
            fontSize: '0.78rem',
            outline: 'none',
            padding: '2px 0',
          }}
          onClick={(event) => event.stopPropagation()}
        />
      ) : (
        <div style={{
          fontSize: `${0.76 + ((nodeSize - 1) * 0.05)}rem`,
          color: '#c9d1d9',
          fontFamily: 'var(--font-mono, monospace)',
          wordBreak: 'break-word',
          lineHeight: 1.35,
        }}>
          {label}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px', marginTop: '6px' }}>
        <span style={{ fontSize: '0.6rem', color: '#8b949e', fontFamily: 'var(--font-mono, monospace)' }}>{phase}</span>
        <span style={{
          fontSize: '0.58rem',
          color: data.origin === 'manual' ? '#79c0ff' : '#39d353',
          fontFamily: 'var(--font-mono, monospace)',
          textTransform: 'uppercase',
        }}>
          {data.origin || 'auto'}
        </span>
      </div>
    </div>
  );
}

const NODE_TYPES = { discovery: DiscoveryNode };

function buildManualNode(type, label) {
  const normalized = String(label || '').trim();
  const id = `manual::${type}::${normalized.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'node'}-${Date.now()}`;
  return {
    id,
    type: 'discovery',
    position: { x: 80 + Math.random() * 280, y: 80 + Math.random() * 280 },
    data: {
      nodeType: type,
      label: normalized,
      phase: NODE_PHASE[type] || 'Any',
      color: NODE_COLORS[type] || '#58a6ff',
      origin: 'manual',
    },
  };
}

async function renderGraphPng(reactFlowInstance) {
  const svgElement = reactFlowInstance?.toSVGElement?.();
  if (!svgElement) {
    throw new Error('Graph export is unavailable because no SVG viewport is mounted.');
  }

  const svgMarkup = new XMLSerializer().serializeToString(svgElement);
  const blob = new Blob([svgMarkup], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);

  try {
    const image = await new Promise((resolve, reject) => {
      const img = new window.Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Failed to load graph SVG for PNG export.'));
      img.src = url;
    });

    const canvas = document.createElement('canvas');
    const scale = 2;
    canvas.width = Math.max(1, image.width * scale);
    canvas.height = Math.max(1, image.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('PNG export failed because the canvas context is unavailable.');
    }
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.scale(scale, scale);
    ctx.drawImage(image, 0, 0);
    return canvas.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function DiscoveryGraph({ sessionId, timeline = [], onAddToReport, apiFetch }) {
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [addNodeType, setAddNodeType] = useState('host');
  const [addNodeLabel, setAddNodeLabel] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [phaseFilter, setPhaseFilter] = useState('All');
  const [saveStatus, setSaveStatus] = useState('');
  const [graphError, setGraphError] = useState('');
  const [reactFlowInstance, setReactFlowInstance] = useState(null);
  const saveTimer = useRef(null);
  const loadedSessionRef = useRef(null);
  const latestSuccessSignatureRef = useRef('');
  const nodesRef = useRef([]);
  const edgesRef = useRef([]);

  useEffect(() => {
    nodesRef.current = nodes;
    edgesRef.current = edges;
  }, [edges, nodes]);

  const loadGraphState = useCallback(async ({ preserveLocalManual = false } = {}) => {
    if (!sessionId) return;
    try {
      setGraphError('');
      const response = await apiFetch(`/api/graph?sessionId=${encodeURIComponent(sessionId)}`);
      const payload = response.ok ? await response.json() : { nodes: [], edges: [] };
      const serverState = normalizeGraphState(payload.nodes || [], payload.edges || []);
      const nextState = preserveLocalManual
        ? mergeGraphState({ nodes: nodesRef.current, edges: edgesRef.current }, serverState, { preserveLocalManual: true })
        : serverState;
      setNodes(layoutGraphNodes(nextState.nodes, { preserveExisting: true }));
      setEdges(nextState.edges);
    } catch (error) {
      setGraphError(error?.message || 'Failed to load discovery graph.');
    }
  }, [apiFetch, sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    loadedSessionRef.current = sessionId;
    latestSuccessSignatureRef.current = '';
    setNodes([]);
    setEdges([]);
    setSearchTerm('');
    setPhaseFilter('All');
    void loadGraphState({ preserveLocalManual: false });
  }, [loadGraphState, sessionId]);

  useEffect(() => {
    if (!sessionId || loadedSessionRef.current !== sessionId) return;
    const successSignature = timeline
      .filter((event) => event?.type === 'command' && event?.status === 'success')
      .map((event) => `${event.id}:${event.timestamp || ''}`)
      .join('|');

    if (!successSignature) {
      latestSuccessSignatureRef.current = '';
      return;
    }

    if (!latestSuccessSignatureRef.current) {
      latestSuccessSignatureRef.current = successSignature;
      return;
    }

    if (latestSuccessSignatureRef.current !== successSignature) {
      latestSuccessSignatureRef.current = successSignature;
      void loadGraphState({ preserveLocalManual: true });
    }
  }, [loadGraphState, sessionId, timeline]);

  const scheduleSave = useCallback((currentNodes, currentEdges) => {
    if (!sessionId) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        const normalized = normalizeGraphState(currentNodes, currentEdges);
        const response = await apiFetch('/api/graph', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, nodes: normalized.nodes, edges: normalized.edges }),
        });
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.error || 'Failed to save discovery graph.');
        }
        setSaveStatus('Saved');
        setTimeout(() => setSaveStatus(''), 1800);
      } catch (error) {
        setGraphError(error?.message || 'Failed to save discovery graph.');
      }
    }, 900);
  }, [apiFetch, sessionId]);

  useEffect(() => () => clearTimeout(saveTimer.current), []);

  const onNodesChange = useCallback((changes) => {
    setNodes((prev) => {
      const next = applyNodeChanges(changes, prev);
      scheduleSave(next, edges);
      return next;
    });
  }, [edges, scheduleSave]);

  const onEdgesChange = useCallback((changes) => {
    setEdges((prev) => {
      const next = applyEdgeChanges(changes, prev);
      scheduleSave(nodes, next);
      return next;
    });
  }, [nodes, scheduleSave]);

  const onConnect = useCallback((params) => {
    setEdges((prev) => {
      const label = String(params.label || '').trim();
      const next = addEdge({
        ...params,
        label,
        animated: isHighSignalEdge({ label }),
        style: { stroke: '#30363d' },
        markerEnd: { type: 'arrowclosed', color: '#30363d' },
      }, prev);
      scheduleSave(nodes, next);
      return next;
    });
  }, [nodes, scheduleSave]);

  const handleAddNode = useCallback(() => {
    const label = addNodeLabel.trim();
    if (!label) return;
    const newNode = buildManualNode(addNodeType, label);
    setNodes((prev) => {
      const next = [...prev, newNode];
      scheduleSave(next, edges);
      return next;
    });
    setAddNodeLabel('');
  }, [addNodeLabel, addNodeType, edges, scheduleSave]);

  const handleAutoLayout = useCallback(() => {
    setNodes((prev) => {
      const laidOut = layoutGraphNodes(prev, { preserveExisting: false });
      scheduleSave(laidOut, edges);
      return laidOut;
    });
  }, [edges, scheduleSave]);

  const handleResetAutoDerived = useCallback(() => {
    setNodes((prevNodes) => {
      const manualNodes = prevNodes.filter((node) => node?.data?.origin !== 'auto' && !node?.data?.sourceEventId && !node?.data?.sourceFindingId);
      const keepIds = new Set(manualNodes.map((node) => node.id));
      setEdges((prevEdges) => {
        const manualEdges = prevEdges.filter((edge) => keepIds.has(edge.source) && keepIds.has(edge.target));
        scheduleSave(manualNodes, manualEdges);
        return manualEdges;
      });
      return manualNodes;
    });
  }, [scheduleSave]);

  const handleDownloadPng = useCallback(async () => {
    try {
      setGraphError('');
      const dataUrl = await renderGraphPng(reactFlowInstance);
      const anchor = document.createElement('a');
      anchor.href = dataUrl;
      anchor.download = `${sessionId || 'session'}-discovery-graph.png`;
      anchor.click();
    } catch (error) {
      setGraphError(error?.message || 'Failed to export discovery graph as PNG.');
    }
  }, [reactFlowInstance, sessionId]);

  const handleAddToReport = useCallback(async () => {
    if (!onAddToReport) return;
    try {
      setGraphError('');
      const dataUrl = await renderGraphPng(reactFlowInstance);
      onAddToReport(dataUrl);
    } catch (error) {
      setGraphError(error?.message || 'Failed to add discovery graph to the report.');
      onAddToReport(null);
    }
  }, [onAddToReport, reactFlowInstance]);

  const degreeMap = useMemo(() => {
    const counts = new Map();
    for (const node of nodes) counts.set(node.id, 0);
    for (const edge of edges) {
      counts.set(edge.source, (counts.get(edge.source) || 0) + 1);
      counts.set(edge.target, (counts.get(edge.target) || 0) + 1);
    }
    return counts;
  }, [edges, nodes]);

  const decoratedNodes = useMemo(() => {
    const needle = searchTerm.trim().toLowerCase();
    return nodes.map((node) => {
      const degree = degreeMap.get(node.id) || 0;
      const haystack = `${node.data?.label || ''} ${node.data?.nodeType || ''} ${node.data?.phase || ''}`.toLowerCase();
      const isHighlighted = needle ? haystack.includes(needle) : false;
      const isDimmed = Boolean(needle) && !isHighlighted;
      const nodeSize = Math.min(2.2, Math.max(1, 1 + (degree * 0.14)));
      return {
        ...node,
        data: {
          ...node.data,
          degree,
          nodeSize,
          isHighlighted,
          isDimmed,
          onLabelChange: (nextLabel) => {
            setNodes((prev) => {
              const next = prev.map((item) => (
                item.id === node.id
                  ? { ...item, data: { ...item.data, label: nextLabel } }
                  : item
              ));
              scheduleSave(next, edges);
              return next;
            });
          },
        },
      };
    });
  }, [degreeMap, edges, nodes, scheduleSave, searchTerm]);

  const visibleNodeIds = useMemo(() => {
    const phase = phaseFilter === 'All' ? null : phaseFilter;
    return new Set(decoratedNodes
      .filter((node) => !phase || (node.data?.phase || 'Any') === phase)
      .map((node) => node.id));
  }, [decoratedNodes, phaseFilter]);

  const visibleNodes = useMemo(() => decoratedNodes.filter((node) => visibleNodeIds.has(node.id)), [decoratedNodes, visibleNodeIds]);
  const visibleEdges = useMemo(() => edges
    .filter((edge) => visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target))
    .map((edge) => ({
      ...edge,
      animated: edge.animated || isHighSignalEdge(edge),
      markerEnd: edge.markerEnd || { type: 'arrowclosed', color: edge?.style?.stroke || '#30363d' },
    })), [edges, visibleNodeIds]);

  const stats = useMemo(() => {
    const byType = new Map();
    for (const node of visibleNodes) {
      const type = node.data?.nodeType || 'unknown';
      byType.set(type, (byType.get(type) || 0) + 1);
    }
    const densityBase = visibleNodes.length > 1 ? (visibleNodes.length * (visibleNodes.length - 1)) : 1;
    return {
      byType: [...byType.entries()].sort((a, b) => b[1] - a[1]),
      edgeCount: visibleEdges.length,
      nodeCount: visibleNodes.length,
      density: visibleEdges.length > 0 ? (visibleEdges.length / densityBase).toFixed(3) : '0.000',
    };
  }, [visibleEdges.length, visibleNodes]);

  const phaseOptions = useMemo(() => {
    const found = new Set(nodes.map((node) => node.data?.phase || 'Any'));
    return ALL_PHASES.filter((phase) => phase === 'All' || found.has(phase));
  }, [nodes]);

  const legendItems = useMemo(() => Object.entries(NODE_COLORS).map(([type, color]) => (
    <div key={type} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
      <div style={{ width: '11px', height: '11px', borderRadius: '3px', background: color, flexShrink: 0 }} />
      <span style={{ fontSize: '0.65rem', color: '#8b949e', fontFamily: 'var(--font-mono, monospace)' }}>
        {type}
      </span>
    </div>
  )), []);

  return (
    <div style={{ width: '100%', height: '100%', background: '#0d1117', position: 'relative' }}>
      <ReactFlow
        nodes={visibleNodes}
        edges={visibleEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onInit={setReactFlowInstance}
        nodeTypes={NODE_TYPES}
        deleteKeyCode={['Backspace', 'Delete']}
        fitView
        fitViewOptions={{ padding: 0.18 }}
        style={{ background: '#0d1117' }}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant="dots" color="#30363d" gap={20} size={1} />
        <Controls style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: '6px' }} />
        <MiniMap
          nodeColor={(node) => node.data?.color || '#58a6ff'}
          style={{ background: '#0d1117', border: '1px solid #30363d', borderRadius: '6px' }}
        />

        <Panel position="top-left" style={{ background: 'rgba(13,17,23,0.9)', border: '1px solid #30363d', borderRadius: '8px', padding: '10px 12px', backdropFilter: 'blur(6px)', maxWidth: '240px' }}>
          <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#58a6ff', marginBottom: '6px', fontFamily: 'var(--font-mono, monospace)', letterSpacing: '0.5px' }}>
            DISCOVERY LEGEND
          </div>
          {legendItems}
          <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #30363d' }}>
            <div style={{ fontSize: '0.65rem', color: '#c9d1d9', fontFamily: 'var(--font-mono, monospace)', marginBottom: '4px' }}>
              Nodes: {stats.nodeCount} | Edges: {stats.edgeCount}
            </div>
            <div style={{ fontSize: '0.65rem', color: '#8b949e', fontFamily: 'var(--font-mono, monospace)', marginBottom: '6px' }}>
              Density: {stats.density}
            </div>
            {stats.byType.slice(0, 6).map(([type, count]) => (
              <div key={type} style={{ display: 'flex', justifyContent: 'space-between', gap: '6px', fontSize: '0.62rem', color: '#8b949e', fontFamily: 'var(--font-mono, monospace)' }}>
                <span>{type}</span>
                <span>{count}</span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel position="top-right" style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '280px', maxWidth: '320px' }}>
          <div style={{ background: 'rgba(13,17,23,0.92)', border: '1px solid #30363d', borderRadius: '8px', padding: '10px', backdropFilter: 'blur(6px)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#58a6ff', fontFamily: 'var(--font-mono, monospace)', letterSpacing: '0.5px' }}>GRAPH TOOLS</div>
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search nodes..."
              style={{ fontSize: '0.72rem', padding: '5px 8px', background: '#161b22', border: '1px solid #30363d', color: '#c9d1d9', borderRadius: '4px', outline: 'none', fontFamily: 'var(--font-mono, monospace)' }}
            />
            <select
              value={phaseFilter}
              onChange={(event) => setPhaseFilter(event.target.value)}
              style={{ fontSize: '0.72rem', padding: '5px 8px', background: '#161b22', border: '1px solid #30363d', color: '#c9d1d9', borderRadius: '4px', outline: 'none', fontFamily: 'var(--font-mono, monospace)' }}
            >
              {phaseOptions.map((phase) => <option key={phase} value={phase}>{phase}</option>)}
            </select>
          </div>

          <div style={{ background: 'rgba(13,17,23,0.92)', border: '1px solid #30363d', borderRadius: '8px', padding: '10px', backdropFilter: 'blur(6px)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#58a6ff', fontFamily: 'var(--font-mono, monospace)', letterSpacing: '0.5px' }}>ADD MANUAL NODE</div>
            <select
              value={addNodeType}
              onChange={(event) => setAddNodeType(event.target.value)}
              style={{ fontSize: '0.72rem', padding: '5px 8px', background: '#161b22', border: '1px solid #30363d', color: '#c9d1d9', borderRadius: '4px', outline: 'none', fontFamily: 'var(--font-mono, monospace)' }}
            >
              {Object.keys(NODE_COLORS).map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
            <input
              value={addNodeLabel}
              onChange={(event) => setAddNodeLabel(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter') handleAddNode(); }}
              placeholder="Label..."
              style={{ fontSize: '0.72rem', padding: '5px 8px', background: '#161b22', border: '1px solid #30363d', color: '#c9d1d9', borderRadius: '4px', outline: 'none', fontFamily: 'var(--font-mono, monospace)' }}
            />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '6px' }}>
              <button onClick={handleAddNode} style={{ fontSize: '0.72rem', padding: '5px 8px', background: 'rgba(88,166,255,0.15)', border: '1px solid rgba(88,166,255,0.4)', color: '#58a6ff', borderRadius: '4px', cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}>+ Add</button>
              <button onClick={handleAutoLayout} style={{ fontSize: '0.72rem', padding: '5px 8px', background: 'rgba(13,17,23,0.9)', border: '1px solid #30363d', color: '#8b949e', borderRadius: '4px', cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}>Auto-layout</button>
              <button onClick={handleResetAutoDerived} style={{ fontSize: '0.72rem', padding: '5px 8px', background: 'rgba(248,81,73,0.12)', border: '1px solid rgba(248,81,73,0.35)', color: '#f85149', borderRadius: '4px', cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}>Reset Auto</button>
              <button onClick={() => void loadGraphState({ preserveLocalManual: true })} style={{ fontSize: '0.72rem', padding: '5px 8px', background: 'rgba(57,211,83,0.12)', border: '1px solid rgba(57,211,83,0.35)', color: '#39d353', borderRadius: '4px', cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}>Refresh</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: onAddToReport ? 'repeat(2, minmax(0, 1fr))' : '1fr', gap: '6px' }}>
              <button onClick={handleDownloadPng} style={{ fontSize: '0.72rem', padding: '5px 8px', background: 'rgba(255,215,0,0.12)', border: '1px solid rgba(255,215,0,0.35)', color: '#ffd700', borderRadius: '4px', cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}>Download PNG</button>
              {onAddToReport && (
                <button onClick={handleAddToReport} style={{ fontSize: '0.72rem', padding: '5px 8px', background: 'rgba(88,166,255,0.15)', border: '1px solid rgba(88,166,255,0.4)', color: '#58a6ff', borderRadius: '4px', cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}>Add to Report</button>
              )}
            </div>
            {saveStatus && (
              <div style={{ fontSize: '0.65rem', color: '#39d353', textAlign: 'center', fontFamily: 'var(--font-mono, monospace)' }}>
                ✓ {saveStatus}
              </div>
            )}
            {graphError && (
              <div style={{ fontSize: '0.65rem', color: '#f85149', fontFamily: 'var(--font-mono, monospace)', lineHeight: 1.35 }}>
                {graphError}
              </div>
            )}
          </div>
        </Panel>
      </ReactFlow>

      {nodes.length === 0 && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>MAP</div>
          <p style={{ color: '#8b949e', fontFamily: 'var(--font-mono, monospace)', fontSize: '0.8rem', textAlign: 'center', maxWidth: '320px', lineHeight: 1.5 }}>
            Discovery map is empty.<br />
            Successful commands now persist graph evidence automatically.
          </p>
        </div>
      )}
    </div>
  );
}
