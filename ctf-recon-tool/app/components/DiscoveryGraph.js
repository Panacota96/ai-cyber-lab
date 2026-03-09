'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Panel,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { NODE_COLORS, NODE_PHASE, deriveFromEvent } from '@/lib/graph-derive';

// ── Custom node renderer ──────────────────────────────────────────────────────

const ICONS = {
  host: '🖥',
  service: '⚙',
  vulnerability: '⚠',
  exploit: '💥',
  credential: '🔑',
  flag: '🚩',
  note: '📝',
};

function DiscoveryNode({ data, selected }) {
  const { nodeType = 'host', label = '', phase = '', color = '#58a6ff' } = data;
  const [editing, setEditing] = useState(false);
  const [editLabel, setEditLabel] = useState(label);

  const handleDoubleClick = (e) => {
    e.stopPropagation();
    setEditing(true);
    setEditLabel(label);
  };

  const commitEdit = () => {
    setEditing(false);
    if (data.onLabelChange) data.onLabelChange(editLabel);
  };

  return (
    <div
      onDoubleClick={handleDoubleClick}
      style={{
        minWidth: '120px',
        maxWidth: '200px',
        background: 'rgba(13,17,23,0.92)',
        border: `2px solid ${selected ? '#ffffff' : color}`,
        borderRadius: '8px',
        padding: '8px 12px',
        cursor: 'grab',
        boxShadow: selected ? `0 0 10px ${color}88` : `0 0 4px ${color}44`,
        transition: 'box-shadow 0.2s',
        userSelect: 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
        <span style={{ fontSize: '0.9rem' }}>{ICONS[nodeType] || '⬤'}</span>
        <span style={{
          fontSize: '0.62rem',
          fontWeight: 700,
          letterSpacing: '0.5px',
          textTransform: 'uppercase',
          color,
          fontFamily: 'var(--font-mono, monospace)',
        }}>
          {nodeType}
        </span>
      </div>
      {editing ? (
        <input
          autoFocus
          value={editLabel}
          onChange={e => setEditLabel(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditing(false); }}
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
          onClick={e => e.stopPropagation()}
        />
      ) : (
        <div style={{
          fontSize: '0.78rem',
          color: '#c9d1d9',
          fontFamily: 'var(--font-mono, monospace)',
          wordBreak: 'break-all',
          lineHeight: 1.3,
        }}>
          {label}
        </div>
      )}
      <div style={{ fontSize: '0.6rem', color: '#8b949e', marginTop: '4px', fontFamily: 'var(--font-mono, monospace)' }}>
        {phase}
      </div>
    </div>
  );
}

const NODE_TYPES = { discovery: DiscoveryNode };

// ── Phase-column auto-layout ──────────────────────────────────────────────────

const PHASE_ORDER = [
  'Information Gathering', 'Enumeration', 'Vulnerability Assessment',
  'Exploitation', 'Post-Exploitation', 'Proof-of-Concept', 'Any',
];

function autoLayout(nodes) {
  const cols = {};
  for (const n of nodes) {
    const phase = n.data?.phase || 'Any';
    if (!cols[phase]) cols[phase] = [];
    cols[phase].push(n.id);
  }

  const COLW = 220, ROWH = 100, PAD = 40;
  const phaseList = PHASE_ORDER.filter(p => cols[p]);
  const result = {};

  phaseList.forEach((phase, colIdx) => {
    (cols[phase] || []).forEach((id, rowIdx) => {
      result[id] = { x: PAD + colIdx * COLW, y: PAD + rowIdx * ROWH };
    });
  });

  return nodes.map(n => ({ ...n, position: result[n.id] || n.position }));
}

// ── Main DiscoveryGraph component ─────────────────────────────────────────────

export default function DiscoveryGraph({ sessionId, timeline = [], onAddToReport, apiFetch }) {
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [addNodeType, setAddNodeType] = useState('host');
  const [addNodeLabel, setAddNodeLabel] = useState('');
  const [saveStatus, setSaveStatus] = useState('');
  const [reactFlowInstance, setReactFlowInstance] = useState(null);
  const saveTimer = useRef(null);
  const processedEventIds = useRef(new Set());
  const initialLoadDone = useRef(false);

  // ── Load saved state once ─────────────────────────────────────────────────
  useEffect(() => {
    if (!sessionId || initialLoadDone.current) return;
    initialLoadDone.current = true;
    apiFetch(`/api/graph?sessionId=${sessionId}`)
      .then(r => r.ok ? r.json() : { nodes: [], edges: [] })
      .then(({ nodes: savedNodes, edges: savedEdges }) => {
        setNodes(savedNodes.length > 0 ? savedNodes : []);
        setEdges(savedEdges.length > 0 ? savedEdges : []);
        // Mark all IDs already known
        for (const n of savedNodes) processedEventIds.current.add(n.data?.sourceEventId);
      })
      .catch(() => {});
  }, [sessionId, apiFetch]);

  // ── Auto-derive from new timeline events ──────────────────────────────────
  useEffect(() => {
    if (!timeline || !initialLoadDone.current) return;
    let added = false;
    setNodes(prevNodes => {
      let allNodes = prevNodes;
      let allEdges;
      setEdges(prevEdges => {
        allEdges = prevEdges;
        for (const event of timeline) {
          if (processedEventIds.current.has(event.id)) continue;
          if (event.status === 'running') continue;
          processedEventIds.current.add(event.id);
          const { newNodes, newEdges } = deriveFromEvent(event, allNodes);
          if (newNodes.length > 0 || newEdges.length > 0) {
            allNodes = [...allNodes, ...newNodes];
            allEdges = [...allEdges, ...newEdges];
            added = true;
          }
        }
        return allEdges;
      });
      return allNodes;
    });
  }, [timeline]);

  // ── Debounced auto-save ───────────────────────────────────────────────────
  const scheduleSave = useCallback((currentNodes, currentEdges) => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await apiFetch('/api/graph', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, nodes: currentNodes, edges: currentEdges }),
        });
        setSaveStatus('Saved');
        setTimeout(() => setSaveStatus(''), 2000);
      } catch { /* silently ignore */ }
    }, 1200);
  }, [sessionId, apiFetch]);

  const onNodesChange = useCallback((changes) => {
    setNodes(prev => {
      const next = applyNodeChanges(changes, prev);
      scheduleSave(next, edges);
      return next;
    });
  }, [edges, scheduleSave]);

  const onEdgesChange = useCallback((changes) => {
    setEdges(prev => {
      const next = applyEdgeChanges(changes, prev);
      scheduleSave(nodes, next);
      return next;
    });
  }, [nodes, scheduleSave]);

  const onConnect = useCallback((params) => {
    setEdges(prev => {
      const next = addEdge({ ...params, animated: false, style: { stroke: '#30363d' } }, prev);
      scheduleSave(nodes, next);
      return next;
    });
  }, [nodes, scheduleSave]);

  // ── Add manual node ───────────────────────────────────────────────────────
  const handleAddNode = () => {
    const label = addNodeLabel.trim();
    if (!label) return;
    const id = `${addNodeType}::${label.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`;
    const newNode = {
      id,
      type: 'discovery',
      data: {
        nodeType: addNodeType,
        label,
        phase: NODE_PHASE[addNodeType] || 'Any',
        color: NODE_COLORS[addNodeType] || '#58a6ff',
      },
      position: { x: 80 + Math.random() * 300, y: 80 + Math.random() * 300 },
    };
    setNodes(prev => {
      const next = [...prev, newNode];
      scheduleSave(next, edges);
      return next;
    });
    setAddNodeLabel('');
  };

  // ── Auto-layout ───────────────────────────────────────────────────────────
  const handleAutoLayout = () => {
    setNodes(prev => {
      const laid = autoLayout(prev);
      scheduleSave(laid, edges);
      return laid;
    });
  };

  // ── Add to Report (export PNG) ────────────────────────────────────────────
  const handleAddToReport = async () => {
    if (!reactFlowInstance || !onAddToReport) return;
    try {
      const svgEl = reactFlowInstance.toSVGElement?.();
      if (!svgEl) return;
      const svgStr = new XMLSerializer().serializeToString(svgEl);
      const img = new window.Image();
      const blob = new Blob([svgStr], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const scale = 2; // 2x for retina
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#0d1117';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.scale(scale, scale);
        ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(url);
        onAddToReport(canvas.toDataURL('image/png'));
      };
      img.src = url;
    } catch (e) {
      // fallback: just notify
      onAddToReport(null);
    }
  };

  // ── Node label change handler (injected into node data) ───────────────────
  const nodesWithHandlers = nodes.map(n => ({
    ...n,
    data: {
      ...n.data,
      onLabelChange: (newLabel) => {
        setNodes(prev => {
          const next = prev.map(nd => nd.id === n.id ? { ...nd, data: { ...nd.data, label: newLabel } } : nd);
          scheduleSave(next, edges);
          return next;
        });
      },
    },
  }));

  // ── Legend ────────────────────────────────────────────────────────────────
  const legendItems = Object.entries(NODE_COLORS).map(([type, color]) => (
    <div key={type} style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '3px' }}>
      <div style={{ width: '10px', height: '10px', borderRadius: '2px', background: color, flexShrink: 0 }} />
      <span style={{ fontSize: '0.65rem', color: '#8b949e', fontFamily: 'var(--font-mono, monospace)', textTransform: 'capitalize' }}>
        {type}
      </span>
    </div>
  ));

  return (
    <div style={{ width: '100%', height: '100%', background: '#0d1117', position: 'relative' }}>
      <ReactFlow
        nodes={nodesWithHandlers}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onInit={setReactFlowInstance}
        nodeTypes={NODE_TYPES}
        deleteKeyCode={['Backspace', 'Delete']}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        style={{ background: '#0d1117' }}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant="dots" color="#30363d" gap={20} size={1} />
        <Controls
          style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: '6px' }}
        />
        <MiniMap
          nodeColor={n => n.data?.color || '#58a6ff'}
          style={{ background: '#0d1117', border: '1px solid #30363d', borderRadius: '6px' }}
        />

        {/* Legend */}
        <Panel position="top-left" style={{ background: 'rgba(13,17,23,0.85)', border: '1px solid #30363d', borderRadius: '6px', padding: '8px 10px', backdropFilter: 'blur(6px)' }}>
          <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#58a6ff', marginBottom: '6px', fontFamily: 'var(--font-mono, monospace)', letterSpacing: '0.5px' }}>
            NODE TYPES
          </div>
          {legendItems}
        </Panel>

        {/* Controls panel */}
        <Panel position="top-right" style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '200px' }}>
          {/* Add Node form */}
          <div style={{ background: 'rgba(13,17,23,0.9)', border: '1px solid #30363d', borderRadius: '6px', padding: '8px', backdropFilter: 'blur(6px)', display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#58a6ff', letterSpacing: '0.5px', fontFamily: 'var(--font-mono, monospace)' }}>ADD NODE</div>
            <select
              value={addNodeType}
              onChange={e => setAddNodeType(e.target.value)}
              style={{ fontSize: '0.72rem', padding: '3px 6px', background: '#161b22', border: '1px solid #30363d', color: '#c9d1d9', borderRadius: '4px', outline: 'none', fontFamily: 'var(--font-mono, monospace)' }}
            >
              {Object.keys(NODE_COLORS).map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <input
              value={addNodeLabel}
              onChange={e => setAddNodeLabel(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAddNode(); }}
              placeholder="Label..."
              style={{ fontSize: '0.72rem', padding: '3px 6px', background: '#161b22', border: '1px solid #30363d', color: '#c9d1d9', borderRadius: '4px', outline: 'none', fontFamily: 'var(--font-mono, monospace)' }}
            />
            <button
              onClick={handleAddNode}
              style={{ fontSize: '0.72rem', padding: '3px 8px', background: 'rgba(88,166,255,0.15)', border: '1px solid rgba(88,166,255,0.4)', color: '#58a6ff', borderRadius: '4px', cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}>
              + Add
            </button>
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <button
              onClick={handleAutoLayout}
              style={{ fontSize: '0.72rem', padding: '4px 8px', background: 'rgba(13,17,23,0.9)', border: '1px solid #30363d', color: '#8b949e', borderRadius: '4px', cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)', backdropFilter: 'blur(4px)' }}>
              ⟳ Auto-layout
            </button>
            <button
              onClick={handleAddToReport}
              disabled={!onAddToReport}
              style={{ fontSize: '0.72rem', padding: '4px 8px', background: 'rgba(57,211,83,0.12)', border: '1px solid rgba(57,211,83,0.35)', color: '#39d353', borderRadius: '4px', cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}>
              📋 Add to Report
            </button>
            {saveStatus && (
              <div style={{ fontSize: '0.65rem', color: '#39d353', textAlign: 'center', fontFamily: 'var(--font-mono, monospace)' }}>
                ✓ {saveStatus}
              </div>
            )}
          </div>
        </Panel>
      </ReactFlow>

      {/* Empty state */}
      {nodes.length === 0 && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🗺</div>
          <p style={{ color: '#8b949e', fontFamily: 'var(--font-mono, monospace)', fontSize: '0.8rem', textAlign: 'center', maxWidth: '260px', lineHeight: 1.5 }}>
            Discovery map is empty.<br />
            Run recon commands — hosts, ports and findings will appear automatically.
          </p>
        </div>
      )}
    </div>
  );
}
