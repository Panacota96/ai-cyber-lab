"use client";

import { useState, useEffect, useRef } from 'react';
import { CHEATSHEET } from '@/lib/cheatsheet';

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
      { label: 'Gobuster Dir', command: 'gobuster dir -u http://{target} -w /usr/share/wordlists/dirb/common.txt' },
      { label: 'FFUF Fuzz', command: 'ffuf -u http://{target}/FUZZ -w /usr/share/wordlists/dirb/common.txt' },
      { label: 'Curl Headers', command: 'curl -I http://{target}/' },
      { label: 'Curl Verbose', command: 'curl -v http://{target}/' },
      { label: 'Curl Pass Cookie', command: 'curl -b "session=123" http://{target}/' },
      { label: 'Curl Burp Proxy', command: 'curl -x http://localhost:8080 http://{target}/' }
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
  const [sessions, setSessions] = useState([{ id: 'default', name: 'Default Session' }]);
  const [currentSession, setCurrentSession] = useState('default');
  const [showNewSessionModal, setShowNewSessionModal] = useState(false);
  const [newSessionName, setNewSessionName] = useState('');
  const [expandedCats, setExpandedCats] = useState(['Network Recon', 'Web Enumeration']);
  const [showCheatSheet, setShowCheatSheet] = useState(false);
  const [reportDraft, setReportDraft] = useState('');
  const [showReportModal, setShowReportModal] = useState(false);
  
  const bottomRef = useRef(null);
  const fileInputRef = useRef(null);

  const fetchSessions = async () => {
    try {
      const res = await fetch('/api/sessions');
      const data = await res.json();
      if (data && data.length > 0) setSessions(data);
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

  const createSession = async () => {
    if (!newSessionName.trim()) return;
    const name = newSessionName.trim();
    const id = name.toLowerCase().replace(/\s+/g, '-');
    
    try {
      setIsLoading(true);
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name })
      });
      const newSess = await res.json();
      setSessions(prev => [newSess, ...prev]);
      setCurrentSession(newSess.id);
      setNewSessionName('');
      setShowNewSessionModal(false);
    } catch (error) { console.error('Failed to create session', error); }
    finally { setIsLoading(false); }
  };

  const generateReport = async () => {
    try {
      setIsLoading(true);
      const res = await fetch(`/api/report?sessionId=${currentSession}`);
      const data = await res.json();
      if (data.report) {
        setReportDraft(data.report);
        setShowReportModal(true);
      }
    } catch (error) { console.error('Report generation failed', error); }
    finally { setIsLoading(false); }
  };

  const saveReport = async () => {
    try {
      setIsLoading(true);
      await fetch('/api/writeup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: currentSession, content: reportDraft })
      });
      setShowReportModal(false);
      alert('Report saved successfully!');
    } catch (error) { console.error('Failed to save report', error); }
    finally { setIsLoading(false); }
  };

  const toggleCategory = (cat) => {
    setExpandedCats(prev => 
      prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
    );
  };

  const appendFlag = (flag) => {
    setInputType('command');
    setInputVal(prev => prev.includes(flag) ? prev : `${prev} ${flag}`.trim());
  };

  return (
    <main className="container">
      <header className="header glass-panel">
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <h1 className="dnd-title">Helm's Paladin</h1>
          <div className="session-badge mono">{sessions.find(s => s.id === currentSession)?.name || currentSession}</div>
        </div>
        
        <div className="session-selector">
          <select 
            value={currentSession} 
            onChange={(e) => setCurrentSession(e.target.value)}
            style={{ minWidth: '150px' }}
          >
            {sessions.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <button className="btn-secondary" onClick={() => setShowNewSessionModal(true)}>+ New Session</button>
          <button className="btn-primary" onClick={generateReport} style={{ background: 'var(--accent-secondary)', color: '#fff' }}>Generate Report</button>
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

      {showReportModal && (
        <div className="overlay">
          <div className="modal glass-panel" style={{ width: '80%', maxWidth: '900px', height: '80vh' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 className="dnd-title" style={{ fontSize: '1.2rem' }}>Paladin's Chronicle</h3>
              <button className="btn-secondary" onClick={() => setShowReportModal(false)}>Close</button>
            </div>
            <p className="mono" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Autogenerated Write-up - Edit and Save to Session</p>
            <textarea 
              value={reportDraft} 
              onChange={(e) => setReportDraft(e.target.value)}
              style={{ flexGrow: 1, padding: '1.5rem', fontSize: '0.95rem', lineHeight: '1.6', background: 'rgba(0,0,0,0.5)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-main)', outline: 'none' }}
              placeholder="The chronicle is empty..."
            />
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
              <button className="btn-primary" onClick={saveReport}>[ Save Write-up ]</button>
            </div>
          </div>
        </div>
      )}

      <div className="layout">
        <aside className="sidebar glass-panel">
          <h3>Toolbox</h3>
          <div className="tab-switcher mono" style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
            <span 
              style={{ cursor: 'pointer', color: !showCheatSheet ? 'var(--accent-primary)' : 'var(--text-muted)' }}
              onClick={() => setShowCheatSheet(false)}
            >
              [ TOOLS ]
            </span>
            <span 
              style={{ cursor: 'pointer', color: showCheatSheet ? 'var(--accent-primary)' : 'var(--text-muted)' }}
              onClick={() => setShowCheatSheet(true)}
            >
              [ FLAGS ]
            </span>
          </div>

          {!showCheatSheet ? (
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
          ) : (
            <div className="cheatsheet-area animate-fade">
              {CHEATSHEET.map((tool, i) => (
                <div key={i} style={{ marginBottom: '1.5rem' }}>
                   <div className="mono" style={{ color: 'var(--accent-secondary)', borderBottom: '1px solid rgba(88,166,255,0.2)', marginBottom: '0.5rem', fontSize: '0.85rem' }}>
                     {tool.tool}
                   </div>
                   {tool.categories.map((cat, j) => (
                     <div key={j} style={{ marginBottom: '0.8rem' }}>
                       <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>{cat.name}</div>
                       <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                         {cat.flags.map((f, k) => (
                           <button 
                             key={k} 
                             className="flag-btn mono" 
                             title={f.desc}
                             onClick={() => appendFlag(f.flag)}
                           >
                             {f.flag}
                           </button>
                         ))}
                       </div>
                     </div>
                   ))}
                </div>
              ))}
            </div>
          )}
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
        .tab-switcher span { font-size: 0.8rem; letter-spacing: 1px; transition: all 0.2s; }
        .tab-switcher span:hover { filter: brightness(1.2); }
        .flag-btn { border: 1px solid var(--border-color); background: rgba(1,4,9,0.3); color: var(--text-main); font-size: 0.75rem; padding: 0.2rem 0.4rem; border-radius: 4px; transition: all 0.2s; }
        .flag-btn:hover { background: var(--accent-secondary); color: #fff; border-color: var(--accent-secondary); box-shadow: 0 0 8px rgba(88,166,255,0.3); }
        .animate-fade { animation: fadeIn 0.3s ease-out; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </main>
  );
}
