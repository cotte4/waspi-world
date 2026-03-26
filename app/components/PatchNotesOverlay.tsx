'use client';

import { useEffect, useState, useCallback } from 'react';

interface PatchEntry {
  date: string;
  commits: string[];
}

const SEEN_KEY = 'waspi_pnotes_seen';

function getSeenDate(): string {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem(SEEN_KEY) ?? '';
}

function setSeenDate(date: string) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(SEEN_KEY, date);
}

export default function PatchNotesOverlay() {
  const [entries, setEntries] = useState<PatchEntry[]>([]);
  const [open, setOpen] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch('/api/patch-notes')
      .then(r => r.json())
      .then((data: unknown) => {
        const list = Array.isArray(data) ? (data as PatchEntry[]) : [];
        setEntries(list);
        if (list.length > 0) {
          setHasUnread(getSeenDate() < list[0].date);
        }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  const handleOpen = useCallback(() => {
    setOpen(true);
    setEntries(prev => {
      if (prev.length > 0) {
        setSeenDate(prev[0].date);
        setHasUnread(false);
      }
      return prev;
    });
  }, []);

  const handleClose = useCallback(() => setOpen(false), []);

  if (!loaded) return null;

  return (
    <>
      {/* ── Floating button — bottom left ── */}
      <button
        onClick={handleOpen}
        className="absolute pointer-events-auto"
        style={{
          bottom: 8,
          left: 8,
          zIndex: 55,
          background: hasUnread ? 'rgba(245,200,66,0.10)' : 'rgba(8,8,14,0.88)',
          border: `1px solid ${hasUnread ? 'rgba(245,200,66,0.55)' : 'rgba(255,255,255,0.09)'}`,
          boxShadow: hasUnread ? '0 0 14px rgba(245,200,66,0.3)' : 'none',
          padding: '5px 9px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          animation: hasUnread ? 'pn-pulse 2.2s ease-in-out infinite' : undefined,
        }}
        title="Notas de parche"
      >
        <span style={{ fontSize: 10, lineHeight: 1 }}>📋</span>
        <span
          style={{
            fontFamily: '"Press Start 2P", monospace',
            fontSize: 6,
            color: hasUnread ? '#F5C842' : 'rgba(255,255,255,0.35)',
            letterSpacing: '0.04em',
          }}
        >
          PATCH
        </span>
        {hasUnread && (
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: '#F5C842',
              boxShadow: '0 0 7px rgba(245,200,66,0.9)',
              flexShrink: 0,
            }}
          />
        )}
        <style>{`
          @keyframes pn-pulse {
            0%,100% { box-shadow: 0 0 14px rgba(245,200,66,0.3); }
            50%      { box-shadow: 0 0 24px rgba(245,200,66,0.6), 0 0 8px rgba(245,200,66,0.3); }
          }
        `}</style>
      </button>

      {/* ── Modal ── */}
      {open && (
        <div
          className="absolute inset-0 flex items-center justify-center pointer-events-auto"
          style={{ background: 'rgba(0,0,0,0.72)', zIndex: 80 }}
          onClick={handleClose}
        >
          <div
            style={{
              background: 'rgba(8,8,14,0.98)',
              border: '1px solid rgba(245,200,66,0.3)',
              boxShadow:
                '0 0 40px rgba(245,200,66,0.12), inset 0 0 24px rgba(0,0,0,0.7)',
              backgroundImage:
                'repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,0.08) 3px,rgba(0,0,0,0.08) 4px)',
              width: 480,
              maxWidth: '94vw',
              maxHeight: '76vh',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div
              style={{
                padding: '12px 16px 10px',
                borderBottom: '1px solid rgba(245,200,66,0.18)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12 }}>📋</span>
                <span
                  style={{
                    fontFamily: '"Press Start 2P", monospace',
                    fontSize: 9,
                    color: '#F5C842',
                    textShadow: '0 0 10px rgba(245,200,66,0.45)',
                    letterSpacing: '0.05em',
                  }}
                >
                  NOTAS DE PARCHE
                </span>
              </div>
              <button
                onClick={handleClose}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'rgba(255,255,255,0.3)',
                  fontFamily: '"Press Start 2P", monospace',
                  fontSize: 8,
                  padding: '2px 4px',
                  lineHeight: 1,
                }}
              >
                ✕
              </button>
            </div>

            {/* Entries */}
            <div
              style={{
                overflowY: 'auto',
                padding: '14px 18px 18px',
                flex: 1,
                scrollbarWidth: 'thin',
                scrollbarColor: 'rgba(245,200,66,0.2) transparent',
              }}
            >
              {entries.length === 0 ? (
                <span
                  style={{
                    fontFamily: '"Press Start 2P", monospace',
                    fontSize: 7,
                    color: 'rgba(255,255,255,0.25)',
                  }}
                >
                  Sin notas disponibles.
                </span>
              ) : (
                entries.map((entry, i) => (
                  <div
                    key={entry.date}
                    style={{ marginBottom: i < entries.length - 1 ? 18 : 0 }}
                  >
                    {/* Date header */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        marginBottom: 7,
                      }}
                    >
                      <span
                        style={{
                          fontFamily: '"Press Start 2P", monospace',
                          fontSize: 7,
                          color: i === 0 ? '#F5C842' : 'rgba(245,200,66,0.45)',
                          letterSpacing: '0.05em',
                        }}
                      >
                        {entry.date}
                      </span>
                      {i === 0 && (
                        <span
                          style={{
                            fontFamily: '"Press Start 2P", monospace',
                            fontSize: 5,
                            color: '#39FF14',
                            textShadow: '0 0 6px rgba(57,255,20,0.7)',
                            letterSpacing: '0.04em',
                          }}
                        >
                          ● NUEVO
                        </span>
                      )}
                    </div>

                    {/* Commits */}
                    {entry.commits.map((c, j) => (
                      <div
                        key={j}
                        style={{
                          fontFamily: 'Silkscreen, "Courier New", monospace',
                          fontSize: 9,
                          color: 'rgba(210,215,235,0.78)',
                          paddingLeft: 10,
                          borderLeft: `2px solid ${i === 0 ? 'rgba(245,200,66,0.35)' : 'rgba(255,255,255,0.08)'}`,
                          marginBottom: 5,
                          lineHeight: 1.55,
                        }}
                      >
                        — {c}
                      </div>
                    ))}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
