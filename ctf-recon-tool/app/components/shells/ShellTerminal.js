'use client';

import { useEffect, useRef, useState } from 'react';

function renderTranscript(chunks = []) {
  return (Array.isArray(chunks) ? chunks : []).map((chunk) => {
    if (chunk.direction === 'input') {
      return `$ ${chunk.content}`;
    }
    return chunk.content;
  }).join('\r\n');
}

export default function ShellTerminal({
  chunks = [],
  shellSessionId = '',
  onResize,
  registerTerminalApi,
}) {
  const hostRef = useRef(null);
  const terminalRef = useRef(null);
  const fitAddonRef = useRef(null);
  const resizeObserverRef = useRef(null);
  const transcriptRef = useRef('');
  const [fallbackText, setFallbackText] = useState('');

  useEffect(() => {
    let disposed = false;
    let windowResizeHandler = null;

    async function initTerminal() {
      if (!hostRef.current) return;
      try {
        const [{ Terminal }, { FitAddon }] = await Promise.all([
          import('@xterm/xterm'),
          import('@xterm/addon-fit'),
        ]);
        if (disposed || !hostRef.current) return;

        const terminal = new Terminal({
          allowTransparency: true,
          convertEol: true,
          cursorBlink: true,
          disableStdin: true,
          fontFamily: 'var(--font-mono)',
          fontSize: 13,
          lineHeight: 1.25,
          theme: {
            background: '#08111d',
            foreground: '#d7e8ef',
            cursor: '#58a6ff',
            black: '#08111d',
            green: '#39d353',
            blue: '#58a6ff',
            yellow: '#d29922',
            red: '#f85149',
          },
        });
        const fitAddon = new FitAddon();
        terminal.loadAddon(fitAddon);
        terminal.open(hostRef.current);
        fitAddon.fit();
        terminalRef.current = terminal;
        fitAddonRef.current = fitAddon;

        const notifyResize = () => {
          fitAddon.fit();
          onResize?.({
            cols: terminal.cols,
            rows: terminal.rows,
          });
        };

        if (typeof ResizeObserver !== 'undefined') {
          resizeObserverRef.current = new ResizeObserver(() => {
            notifyResize();
          });
          resizeObserverRef.current.observe(hostRef.current);
        } else {
          windowResizeHandler = notifyResize;
          window.addEventListener('resize', windowResizeHandler);
        }

        registerTerminalApi?.({
          getSelection: () => terminal.getSelection() || '',
          getTranscript: () => transcriptRef.current,
        });
        notifyResize();
      } catch {
        setFallbackText(transcriptRef.current);
      }
    }

    void initTerminal();

    return () => {
      disposed = true;
      registerTerminalApi?.(null);
      resizeObserverRef.current?.disconnect?.();
      resizeObserverRef.current = null;
      if (windowResizeHandler) {
        window.removeEventListener('resize', windowResizeHandler);
      }
      fitAddonRef.current = null;
      if (terminalRef.current) {
        terminalRef.current.dispose();
        terminalRef.current = null;
      }
    };
  }, [onResize, registerTerminalApi, shellSessionId]);

  useEffect(() => {
    const nextTranscript = renderTranscript(chunks);
    transcriptRef.current = nextTranscript;
    if (!terminalRef.current) {
      setFallbackText(nextTranscript);
      return;
    }
    terminalRef.current.reset();
    terminalRef.current.write(nextTranscript);
    registerTerminalApi?.({
      getSelection: () => terminalRef.current?.getSelection?.() || '',
      getTranscript: () => nextTranscript,
    });
  }, [chunks, registerTerminalApi]);

  return (
    <div style={{ position: 'relative', flex: 1, minHeight: 320, border: '1px solid rgba(88,166,255,0.18)', borderRadius: '10px', background: 'linear-gradient(180deg, rgba(8,17,29,0.96), rgba(5,10,17,0.98))', overflow: 'hidden' }}>
      <div ref={hostRef} style={{ width: '100%', height: '100%', padding: '0.35rem' }} />
      {!terminalRef.current && (
        <pre className="mono" style={{ position: 'absolute', inset: 0, margin: 0, padding: '0.85rem', overflow: 'auto', fontSize: '0.8rem', color: 'var(--text-main)', background: 'rgba(8,17,29,0.96)' }}>
          {fallbackText || 'No transcript yet.'}
        </pre>
      )}
    </div>
  );
}
