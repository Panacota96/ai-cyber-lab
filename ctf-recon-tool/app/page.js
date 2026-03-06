"use client";

import { useState, useEffect, useRef } from 'react';

const SUGGESTIONS = [
  {
    category: 'Network Recon',
    items: [
      { label: 'Nmap Fast', command: 'nmap -F {target}' },
      { label: 'Nmap Full Aggressive', command: 'nmap -A -p- -T4 {target}' },
      { label: 'UDP Scan', command: 'nmap -sU -T4 {target}' },
      { label: 'Whois Lookup', command: 'whois {target}' },
      { label: 'DNS Dig', command: 'dig {target} ANY' },
      { label: 'Ping Loop', command: 'ping -c 4 {target}' }
    ]
  },
  {
    category: 'Web Enumeration',
    items: [
      { label: 'WhatWeb', command: 'whatweb {target}' },
      { label: 'Nikto Scan', command: 'nikto -h http://{target}/' },
      { label: 'Gobuster Dir', command: 'gobuster dir -u http://{target} -w /usr/share/wordlists/dirb/common.txt' },
      { label: 'FFUF Fuzz', command: 'ffuf -u http://{target}/FUZZ -w /usr/share/wordlists/dirb/common.txt' },
      { label: 'Curl Headers', command: 'curl -I http://{target}/' }
    ]
  },
  {
    category: 'Services / AD',
    items: [
      { label: 'Enum4Linux', command: 'enum4linux -a {target}' },
      { label: 'SMB Client List', command: 'smbclient -L //{target}/' },
      { label: 'LDAP Search', command: 'ldapsearch -x -H ldap://{target} -b "dc=example,dc=com"' }
    ]
  }
];

export default function Home() {
  const [timeline, setTimeline] = useState([]);
  const [inputVal, setInputVal] = useState('');
  const [inputType, setInputType] = useState('command'); // 'command' or 'note'
  const [isLoading, setIsLoading] = useState(false);
  const [sessions, setSessions] = useState(['default']);
  const [currentSession, setCurrentSession] = useState('default');
  const [showNewSessionModal, setShowNewSessionModal] = useState(false);
  const [newSessionName, setNewSessionName] = useState('');
  const [expandedCats, setExpandedCats] = useState(['Network Recon', 'Web Enumeration']);
  
  const bottomRef = useRef(null);
  const fileInputRef = useRef(null);

  const fetchSessions = async () => {
    try {
      const res = await fetch('/api/sessions');
      const data = await res.json();
      if (data.length > 0) setSessions(data);
    } catch (e) { console.error('Failed to fetch sessions', e); }
  };

  const fetchTimeline = async () => {
    try {
      const res = await fetch(`/api/timeline?sessionId=${currentSession}`);
      const data = await res.json();
      setTimeline(data);
    } catch (e) { console.error('Failed to fetch timeline', e); }
  };

  useEffect(() => {
    fetchSessions();
  }, []);

  useEffect(() => {
    fetchTimeline();
    const interval = setInterval(fetchTimeline, 3000);
    return () => clearInterval(interval);
  }, [currentSession]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [timeline]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!inputVal.trim()) return;

    setIsLoading(true);
    const val = inputVal;
    setInputVal('');

    try {
      if (inputType === 'command') {
        const res = await fetch('/api/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command: val, sessionId: currentSession })
        });
        const newEvent = await res.json();
        setTimeline(prev => [...prev, newEvent]);
      } else {
        const res = await fetch('/api/timeline', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'note', content: val, sessionId: currentSession })
        });
        const newEvent = await res.json();
        setTimeline(prev => [...prev, newEvent]);
      }
    } catch (error) { console.error('Submission failed', error);
    } finally { setIsLoading(false); }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('sessionId', currentSession);
    formData.append('name', file.name);

    try {
      setIsLoading(true);
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });
      const newEvent = await res.json();
      setTimeline(prev => [...prev, newEvent]);
    } catch (error) { console.error('Upload failed', error); }
    finally { setIsLoading(false); if(fileInputRef.current) fileInputRef.current.value = ''; }
  };

  const createSession = () => {
    if (!newSessionName.trim()) return;
    const name = newSessionName.trim().replace(/\s+/g, '-');
    if (!sessions.includes(name)) {
      setSessions(prev => [...prev, name]);
    }
    setCurrentSession(name);
    setNewSessionName('');
    setShowNewSessionModal(false);
  };

  const toggleCategory = (cat) => {
    setExpandedCats(prev => 
      prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
    );
  };

  return (
    <main className="container">
      <header className="header glass-panel">
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <h1>CTF Assistant</h1>
          <div className="session-badge mono">{currentSession}</div>
        </div>
        
        <div className="session-selector">
          <select 
            value={currentSession} 
            onChange={(e) => setCurrentSession(e.target.value)}
            style={{ minWidth: '150px' }}
          >
            {sessions.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <button className="btn-secondary" onClick={() => setShowNewSessionModal(true)}>+ New Session</button>
        </div>
      </header>

      {showNewSessionModal && (
        <div className="overlay">
          <div className="modal glass-panel">
            <h3>Start New Session</h3>
            <p className="mono" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Challenge Name</p>
            <input 
              type="text" 
              value={newSessionName} 
              onChange={(e) => setNewSessionName(e.target.value)}
              placeholder="e.g. Mangler-HTB"
              autoFocus
            />
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button className="btn-secondary" onClick={() => setShowNewSessionModal(false)}>Cancel</button>
              <button className="btn-primary" onClick={createSession}>Start</button>
            </div>
          </div>
        </div>
      )}

      <div className="layout">
        <aside className="sidebar glass-panel">
          <h3>Toolbox</h3>
          <div className="suggestion-groups">
            {SUGGESTIONS.map((group, i) => (
              <div key={i} className="group-container">
                <div className="group-header mono" onClick={() => toggleCategory(group.category)}>
                  {expandedCats.includes(group.category) ? '▼' : '▶'} {group.category}
                </div>
                {expandedCats.includes(group.category) && (
                  <ul className="suggestion-list">
                    {group.items.map((item, j) => (
                      <li key={j}>
                        <button className="btn-suggestion" onClick={() => { setInputType('command'); setInputVal(item.command); }}>
                          {item.label}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </aside>

        <section className="timeline-container glass-panel">
          <div className="timeline-feed">
            {timeline.length === 0 && (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: '2rem' }}>
                <p>Session "{currentSession}" is empty. Start your recon!</p>
              </div>
            )}
            
            {timeline.map((event) => (
              <div key={event.id} className="timeline-event">
                <div className="event-header">
                  <span className="mono" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {new Date(event.timestamp).toLocaleTimeString()}
                  </span>
                  <span className={`badge badge-${event.type === 'note' ? 'note' : (event.type === 'screenshot' ? 'screenshot' : event.status)}`}>
                    {(event.type || 'EVENT').toUpperCase()}
                  </span>
                </div>

                {event.type === 'command' && (
                  <>
                    <div className="event-command"><span style={{color: 'var(--accent-primary)'}}>$</span> {event.command}</div>
                    {event.status !== 'running' && event.status !== 'queued' && (
                      <pre className="event-output mono">{event.output || 'No output.'}</pre>
                    )}
                    {(event.status === 'running' || event.status === 'queued') && (
                       <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent-warning)', fontSize: '0.85rem' }}>
                          <span className="loader"></span> Processing...
                       </div>
                    )}
                  </>
                )}

                {event.type === 'note' && <div className="event-note">{event.content}</div>}

                {event.type === 'screenshot' && (
                  <div className="event-screenshot">
                    <img 
                      src={`/api/media/${currentSession}/${event.filename}`} 
                      alt={event.name} 
                      onClick={() => window.open(`/api/media/${currentSession}/${event.filename}`, '_blank')}
                    />
                    <div className="screenshot-info mono">
                      <span>{event.name}</span>
                      {event.tag && <span style={{ color: 'var(--accent-primary)' }}>#{event.tag}</span>}
                    </div>
                  </div>
                )}
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          <form className="input-area" onSubmit={handleSubmit}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
               <select value={inputType} onChange={(e) => setInputType(e.target.value)} style={{ width: '120px' }}>
                 <option value="command">Command</option>
                 <option value="note">Note</option>
               </select>
               <div style={{ display: 'flex', gap: '0.5rem' }}>
                 <input type="file" ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileUpload} accept="image/*" />
                 <button type="button" className="upload-btn mono" onClick={() => fileInputRef.current?.click()}>
                   [+] Attach Screenshot
                 </button>
               </div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                type="text"
                className="mono flex-grow"
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                placeholder={inputType === 'command' ? '$ Enter command...' : 'Type a note...'}
                disabled={isLoading}
              />
              <button type="submit" className="btn-primary" disabled={isLoading || !inputVal.trim()}>
                {isLoading ? '...' : (inputType === 'command' ? 'Execute' : 'Add Note')}
              </button>
            </div>
          </form>
        </section>
      </div>

      <style jsx>{`
        .container { max-width: 1400px; margin: 0 auto; padding: 1.5rem 1rem; height: 100vh; display: flex; flex-direction: column; gap: 1.5rem; }
        .header { padding: 1rem 2rem; display: flex; justify-content: space-between; align-items: center; }
        .header h1 { font-size: 1.5rem; letter-spacing: -0.5px; text-transform: uppercase; }
        .layout { display: flex; flex-grow: 1; gap: 1.5rem; min-height: 0; }
        .sidebar { width: 280px; padding: 1.5rem; display: flex; flex-direction: column; overflow-y: auto; }
        .group-container { margin-bottom: 1rem; }
        .group-header { background: rgba(48, 54, 61, 0.4); padding: 0.5rem; border-radius: 4px; cursor: pointer; font-size: 0.85rem; font-weight: bold; color: var(--accent-secondary); margin-bottom: 0.5rem; transition: background 0.2s; }
        .group-header:hover { background: rgba(48, 54, 61, 0.7); }
        .suggestion-list { list-style: none; padding-left: 0.5rem; }
        .btn-suggestion { width: 100%; text-align: left; background: transparent; color: var(--text-muted); font-size: 0.8rem; padding: 0.4rem 0.5rem; border-radius: 4px; border: 1px solid transparent; transition: all 0.2s; }
        .btn-suggestion:hover { background: rgba(57, 211, 83, 0.05); border-color: rgba(57, 211, 83, 0.3); color: var(--accent-primary); }
        .timeline-container { flex-grow: 1; display: flex; flex-direction: column; padding: 1.5rem; position: relative; }
        .timeline-feed { flex-grow: 1; overflow-y: auto; padding-right: 1rem; margin-bottom: 1.5rem; display: flex; flex-direction: column; gap: 1rem; }
        .timeline-event { background: rgba(1, 4, 9, 0.4); border: 1px solid var(--border-color); border-radius: 8px; padding: 1rem; }
        .event-command { font-family: var(--font-mono); font-size: 1rem; margin-bottom: 0.5rem; color: #fff; }
        .event-output { background: rgba(1, 4, 9, 0.8); padding: 1rem; border-radius: 6px; font-size: 0.85rem; max-height: 400px; overflow-y: auto; border-left: 2px solid var(--accent-primary); }
        .event-note { font-size: 1.05rem; padding: 0.5rem 1rem; border-left: 3px solid var(--accent-secondary); background: rgba(88, 166, 255, 0.05); }
        .loader { width: 12px; height: 12px; border: 2px solid var(--accent-warning); border-bottom-color: transparent; border-radius: 50%; display: inline-block; animation: rotation 1s linear infinite; }
        @keyframes rotation { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        .input-area { background: rgba(1, 4, 9, 0.6); padding: 1rem; border-radius: 8px; border: 1px solid var(--border-color); }
        .flex-grow { flex-grow: 1; }
      `}</style>
    </main>
  );
}
