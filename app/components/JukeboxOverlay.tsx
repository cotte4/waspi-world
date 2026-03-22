'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { eventBus, EVENTS } from '@/src/game/config/eventBus';
import { JukeboxSystem, type JukeboxState, type JukeboxSong } from '@/src/game/systems/JukeboxSystem';
import { getTenksBalance } from '@/src/game/systems/TenksSystem';
import { getDefaultJukeboxFallbackTrack } from '@/src/game/systems/jukeboxLibrary';
import { supabase } from '@/src/lib/supabase';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface JukeboxOverlayProps {
  onClose: () => void;
  isMobile: boolean;
}

type SearchResult = {
  videoId: string;
  title: string;
  artist: string;
  thumbnail: string;
};

type CatalogSong = {
  videoId: string;
  title: string;
  artist: string;
};

type SearchTab = 'catalog' | 'open';

const CATALOG_CATEGORIES = [
  { id: 'trap',        label: '🏙️ Trap / Drill' },
  { id: 'lofi',        label: '🎧 Lo-fi / Chill' },
  { id: 'retro',       label: '🕹️ Retro / Synth' },
  { id: 'urbano_arg',  label: '🇦🇷 Urbano ARG' },
  { id: 'hype',        label: '🔥 Hype' },
] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PRESS_START = '"Press Start 2P", monospace';
const SILKSCREEN   = '"Silkscreen", monospace';
const GOLD         = '#F5C842';
const BG           = '#0E0E14';

function px(n: number): string { return `${n}px`; }

async function getAuthToken(): Promise<string | null> {
  if (!supabase) return null;
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  } catch { return null; }
}

// ---------------------------------------------------------------------------
// Sub-component: NowPlayingBar
// ---------------------------------------------------------------------------

function NowPlayingBar({ song, skipVotes, onReact, onSkip, disabled, isFallback, fallbackTrackLabel }: {
  song: JukeboxSong | null;
  skipVotes: number;
  onReact: (e: '🔥' | '💩') => void;
  onSkip: () => void;
  disabled: boolean;
  isFallback: boolean;
  fallbackTrackLabel: string;
}) {
  const [fireCount, setFireCount] = useState(0);
  const [mehCount,  setMehCount]  = useState(0);

  useEffect(() => {
    setFireCount(0);
    setMehCount(0);
    if (!song) return;
    const off = eventBus.on(EVENTS.JUKEBOX_REACTION_SENT, (p: unknown) => {
      const payload = p as { emoji?: string } | null;
      if (payload?.emoji === '🔥') setFireCount((c) => c + 1);
      if (payload?.emoji === '💩') setMehCount((c) => c + 1);
    });
    return off;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [song?.videoId]);

  const btnBase: React.CSSProperties = {
    fontFamily: SILKSCREEN,
    fontSize: px(11),
    padding: '8px 14px',
    border: `1px solid ${GOLD}55`,
    background: 'rgba(245,200,66,0.08)',
    color: GOLD,
    cursor: 'pointer',
    minHeight: px(44),
    minWidth: px(80),
  };

  return (
    <div style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${GOLD}33`, padding: '10px 12px', marginBottom: 10 }}>
      {song ? (
        <>
          <div style={{ fontFamily: PRESS_START, fontSize: px(7), color: GOLD, marginBottom: 6 }}>▶ AHORA SUENA</div>
          <div style={{ fontFamily: SILKSCREEN, fontSize: px(13), color: '#fff', marginBottom: 2 }}>
            {song.title}
          </div>
          <div style={{ fontFamily: SILKSCREEN, fontSize: px(11), color: 'rgba(255,255,255,0.5)', marginBottom: 8 }}>
            {song.artist} · pedida por @{song.addedByName}
          </div>
          <div style={{ fontFamily: SILKSCREEN, fontSize: px(10), color: 'rgba(255,255,255,0.4)', marginBottom: 10 }}>
            🔥 {fireCount} · 💩 {mehCount} · ⏭ {skipVotes}/3 votos skip
          </div>
        </>
      ) : isFallback ? (
        <>
          <div style={{ fontFamily: PRESS_START, fontSize: px(7), color: GOLD, marginBottom: 6 }}>☕ AMBIENTE DEL CAFE</div>
          <div style={{ fontFamily: SILKSCREEN, fontSize: px(13), color: '#fff', marginBottom: 2 }}>
            {fallbackTrackLabel}
          </div>
          <div style={{ fontFamily: SILKSCREEN, fontSize: px(11), color: 'rgba(255,255,255,0.5)', marginBottom: 8 }}>
            Sonando en loop hasta que alguien ponga un tema en la cola.
          </div>
        </>
      ) : (
        <div style={{ fontFamily: PRESS_START, fontSize: px(7), color: 'rgba(255,255,255,0.3)', padding: '8px 0' }}>
          🎵 NO HAY NADA SONANDO TODAVIA
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button style={btnBase} onClick={() => onReact('🔥')} disabled={disabled}>🔥 Fuego</button>
        <button style={btnBase} onClick={() => onReact('💩')} disabled={disabled}>💩 Nah</button>
        <button
          style={{ ...btnBase, color: song ? '#FF4444' : 'rgba(255,255,255,0.2)', borderColor: song ? '#FF444455' : '#33333355', cursor: song ? 'pointer' : 'not-allowed' }}
          onClick={onSkip}
          disabled={disabled || !song}
        >
          ⏭ Skip 500⊤
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: QueueList
// ---------------------------------------------------------------------------

function QueueList({ queue, isFallback }: { queue: JukeboxSong[]; isFallback: boolean }) {
  if (queue.length === 0) {
    return (
      <div style={{ fontFamily: SILKSCREEN, fontSize: px(11), color: 'rgba(255,255,255,0.3)', padding: '8px 0', marginBottom: 10 }}>
        {isFallback ? 'No hay canciones pedidas. Está sonando el ambiente del café.' : 'La cola está vacía.'}
      </div>
    );
  }
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontFamily: PRESS_START, fontSize: px(7), color: GOLD, marginBottom: 6 }}>📋 EN COLA ({queue.length})</div>
      {queue.slice(0, 5).map((s, i) => (
        <div key={s.queueId ?? `${s.videoId}-${s.addedBy}-${s.addedAt}-${i}`} style={{ display: 'flex', justifyContent: 'space-between', fontFamily: SILKSCREEN, fontSize: px(11), color: 'rgba(255,255,255,0.7)', padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <span>{i + 1}. {s.title.slice(0, 28)}{s.title.length > 28 ? '…' : ''}</span>
          <span style={{ color: 'rgba(255,255,255,0.4)' }}>@{s.addedByName.slice(0, 12)}</span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function JukeboxOverlay({ onClose, isMobile }: JukeboxOverlayProps) {
  const fallbackTrack = getDefaultJukeboxFallbackTrack();
  const handleClose = useCallback(() => {
    eventBus.emit(EVENTS.JUKEBOX_CLOSE);
    onClose();
  }, [onClose]);
  const [state, setState]               = useState<JukeboxState>(() => JukeboxSystem.getInstance().getState());
  const [balance, setBalance]           = useState(() => getTenksBalance());
  const [searchTab, setSearchTab]       = useState<SearchTab>('open');
  const [searchQuery, setSearchQuery]   = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching]       = useState(false);
  const [searchError, setSearchError]   = useState('');
  const [catalogSongs, setCatalogSongs] = useState<CatalogSong[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState('');
  const [actionBusy, setActionBusy]     = useState(false);
  const [actionMsg, setActionMsg]       = useState('');
  const [audioUnlockNeeded, setAudioUnlockNeeded] = useState(false);
  const searchTimerRef                  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef                  = useRef<HTMLInputElement>(null);

  // --- Subscribe to jukebox state updates ---
  useEffect(() => {
    const off = eventBus.on(EVENTS.JUKEBOX_STATE_UPDATED, (p: unknown) => {
      if (p && typeof p === 'object' && 'queue' in p) {
        setState(p as JukeboxState);
      }
    });
    return off;
  }, []);

  useEffect(() => {
    const offNeed = eventBus.on(EVENTS.JUKEBOX_AUDIO_UNLOCK_REQUIRED, () => setAudioUnlockNeeded(true));
    const offOk = eventBus.on(EVENTS.JUKEBOX_AUDIO_UNLOCKED, () => setAudioUnlockNeeded(false));
    return () => {
      offNeed();
      offOk();
    };
  }, []);

  // --- Subscribe to TENKS balance changes ---
  useEffect(() => {
    const off = eventBus.on(EVENTS.TENKS_CHANGED, (p: unknown) => {
      const payload = p as { balance?: number } | null;
      if (typeof payload?.balance === 'number') setBalance(payload.balance);
    });
    return off;
  }, []);

  // --- Search (debounced, open tab only) ---
  const runSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) { setSearchResults([]); setSearchError(''); return; }
    setSearching(true);
    setSearchError('');
    try {
      const token = await getAuthToken();
      const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(`/api/jukebox/search?q=${encodeURIComponent(q.trim())}`, { headers });
      const data = await res.json() as { results?: SearchResult[]; error?: string };
      if (!res.ok) { setSearchError(data.error ?? 'Error al buscar.'); setSearchResults([]); }
      else { setSearchResults(data.results ?? []); }
    } catch {
      setSearchError('Error de red al buscar.');
    } finally {
      setSearching(false);
    }
  }, []);

  const handleQueryChange = useCallback((q: string) => {
    setSearchQuery(q);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => { void runSearch(q); }, 500);
  }, [runSearch]);

  useEffect(() => () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); }, []);

  const loadCatalog = useCallback(async () => {
    setCatalogLoading(true);
    setCatalogError('');
    setCatalogSongs([]);
    try {
      const token = await getAuthToken();
      const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch('/api/jukebox/catalog', { headers });
      const data = await res.json() as { songs?: CatalogSong[]; error?: string };
      if (!res.ok) {
        setCatalogError(data.error ?? 'Error al cargar el catálogo.');
        return;
      }
      setCatalogSongs(data.songs ?? []);
    } catch {
      setCatalogError('Error de red al cargar el catálogo.');
    } finally {
      setCatalogLoading(false);
    }
  }, []);

  useEffect(() => {
    if (searchTab !== 'catalog') return;
    void loadCatalog();
  }, [searchTab, loadCatalog]);

  // Foco en el buscador: si no, el canvas de Phaser suele quedarse con el foco y las teclas no entran al input.
  useEffect(() => {
    if (searchTab !== 'open') return;
    const t = window.setTimeout(() => searchInputRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [searchTab]);

  // --- Add song ---
  const handleAddSong = useCallback(async (result: SearchResult, cost: 0 | 150) => {
    if (actionBusy) return;
    if (balance < cost) { setActionMsg(`Necesitás ${cost} TENKS. Tenés ${balance}.`); return; }
    setActionBusy(true);
    setActionMsg('');
    const res = await JukeboxSystem.getInstance().addSong({ ...result, cost });
    setActionBusy(false);
    if (res.ok) {
      setActionMsg('✓ Canción agregada a la queue.');
      setSearchResults([]);
      setSearchQuery('');
    } else {
      setActionMsg(res.error ?? 'Error al agregar la canción.');
    }
  }, [actionBusy, balance]);

  // --- Skip ---
  const handleSkip = useCallback(async () => {
    if (actionBusy) return;
    setActionBusy(true);
    const res = await JukeboxSystem.getInstance().voteSkip();
    setActionBusy(false);
    setActionMsg(res.ok ? `Votaste skip (${res.skipped ? '¡skipped!' : 'voto registrado'})` : (res.error ?? 'Error.'));
  }, [actionBusy]);

  // --- React ---
  const handleReact = useCallback((emoji: '🔥' | '💩') => {
    JukeboxSystem.getInstance().react(emoji);
  }, []);

  // --- Dismiss action msg after 3s ---
  useEffect(() => {
    if (!actionMsg) return;
    const t = setTimeout(() => setActionMsg(''), 3000);
    return () => clearTimeout(t);
  }, [actionMsg]);

  // ---------------------------------------------------------------------------
  // Styles
  // ---------------------------------------------------------------------------

  const overlayStyle: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    background: 'rgba(0,0,0,0.65)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 6500,
  };

  const modalStyle: React.CSSProperties = {
    background: BG,
    border: `2px solid ${GOLD}`,
    boxShadow: `0 0 32px ${GOLD}44`,
    width: isMobile ? '96%' : 500,
    maxHeight: isMobile ? '90%' : 560,
    overflowY: 'auto',
    padding: '14px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 0,
  };

  const tabBtnStyle = (active: boolean): React.CSSProperties => ({
    fontFamily: PRESS_START,
    fontSize: px(7),
    padding: '8px 12px',
    border: `1px solid ${active ? GOLD : GOLD + '44'}`,
    background: active ? GOLD + '22' : 'transparent',
    color: active ? GOLD : GOLD + '88',
    cursor: 'pointer',
    minHeight: px(36),
  });

  const searchInputStyle: React.CSSProperties = {
    width: '100%',
    background: 'rgba(255,255,255,0.05)',
    border: `1px solid ${GOLD}44`,
    color: '#fff',
    fontFamily: SILKSCREEN,
    fontSize: px(12),
    padding: '8px 10px',
    outline: 'none',
    boxSizing: 'border-box',
  };

  const addBtnStyle: React.CSSProperties = {
    fontFamily: SILKSCREEN,
    fontSize: px(10),
    padding: '6px 10px',
    border: `1px solid ${GOLD}66`,
    background: GOLD + '18',
    color: GOLD,
    cursor: actionBusy ? 'not-allowed' : 'pointer',
    whiteSpace: 'nowrap',
    minHeight: px(36),
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div style={overlayStyle} onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}>
      <div style={modalStyle}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontFamily: PRESS_START, fontSize: px(8), color: GOLD }}>🎰 JUKEBOX DEL CAFÉ</span>
          <span style={{ fontFamily: SILKSCREEN, fontSize: px(12), color: GOLD }}>💰 {balance.toLocaleString('es-AR')} ⊤</span>
        </div>

        {/* Now Playing + reactions */}
        <NowPlayingBar
          song={state.nowPlaying}
          skipVotes={state.skipVotesForCurrent}
          onReact={handleReact}
          onSkip={handleSkip}
          disabled={actionBusy}
          isFallback={state.isFallback}
          fallbackTrackLabel={fallbackTrack?.title ?? 'Ambiente del café'}
        />

        {audioUnlockNeeded && (
          <div style={{ fontFamily: SILKSCREEN, fontSize: px(11), color: '#F5C842', background: 'rgba(245,200,66,0.08)', border: `1px solid ${GOLD}33`, padding: '8px 10px', marginBottom: 10 }}>
            Tu navegador frenó el audio automático.
            <br />
            Hacé click, tocá la pantalla o apretá una tecla para activarlo.
          </div>
        )}

        {/* Queue */}
        <QueueList queue={state.queue} isFallback={state.isFallback} />

        {/* Feedback message */}
        {actionMsg && (
          <div style={{ fontFamily: SILKSCREEN, fontSize: px(11), color: actionMsg.startsWith('✓') ? '#39FF14' : '#FF6B6B', marginBottom: 8, padding: '6px 0' }}>
            {actionMsg}
          </div>
        )}

        {/* Search tabs */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          <button style={tabBtnStyle(searchTab === 'open')}    onClick={() => setSearchTab('open')}>    🌐 ABIERTO (150⊤)</button>
          <button style={tabBtnStyle(searchTab === 'catalog')} onClick={() => setSearchTab('catalog')}>🏷️ CURADO (GRATIS)</button>
        </div>

        {/* Open search tab */}
        {searchTab === 'open' && (
          <div>
            <input
              ref={searchInputRef}
              style={searchInputStyle}
              placeholder="🔍 Buscar canción en YouTube..."
              value={searchQuery}
              onChange={(e) => handleQueryChange(e.target.value)}
              onKeyDown={(e) => { e.stopPropagation(); }}
              onKeyUp={(e) => { e.stopPropagation(); }}
              autoComplete="off"
              autoFocus
            />
            {searching && (
              <div style={{ fontFamily: SILKSCREEN, fontSize: px(11), color: 'rgba(255,255,255,0.4)', padding: '6px 0' }}>buscando...</div>
            )}
            {searchError && (
              <div style={{ fontFamily: SILKSCREEN, fontSize: px(11), color: '#FF6B6B', padding: '6px 0' }}>{searchError}</div>
            )}
            {searchResults.map((r, idx) => (
              <div
                key={r.videoId || `${r.title}-${r.artist}-${idx}`}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.06)', gap: 8 }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: SILKSCREEN, fontSize: px(12), color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.title}
                  </div>
                  <div style={{ fontFamily: SILKSCREEN, fontSize: px(10), color: 'rgba(255,255,255,0.45)' }}>{r.artist}</div>
                </div>
                <button style={addBtnStyle} disabled={actionBusy} onClick={() => void handleAddSong(r, 150)}>
                  +150⊤
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Catalog tab */}
        {searchTab === 'catalog' && (
          <div>
            <div style={{ display: 'none', fontFamily: SILKSCREEN, fontSize: px(11), color: 'rgba(255,255,255,0.5)', marginBottom: 10 }}>
              Elegí una categoría:
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {CATALOG_CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  style={{ ...tabBtnStyle(false), fontSize: px(9), padding: '8px 12px', minHeight: px(40), display: 'none' }}
                  onClick={() => void loadCatalog()}
                >
                  {cat.label}
                </button>
              ))}
            </div>
            <div style={{ fontFamily: SILKSCREEN, fontSize: px(10), color: 'rgba(255,255,255,0.3)', marginTop: 10, marginBottom: 8 }}>
              Tracks curados gratis para que el café tenga identidad sin depender siempre de búsqueda abierta.
            </div>
            {catalogLoading && (
              <div style={{ fontFamily: SILKSCREEN, fontSize: px(11), color: 'rgba(255,255,255,0.4)', padding: '6px 0' }}>
                cargando catálogo...
              </div>
            )}
            {catalogError && (
              <div style={{ fontFamily: SILKSCREEN, fontSize: px(11), color: '#FF6B6B', padding: '6px 0' }}>
                {catalogError}
              </div>
            )}
            {!catalogLoading && !catalogError && catalogSongs.length === 0 && (
              <div style={{ fontFamily: SILKSCREEN, fontSize: px(11), color: 'rgba(255,255,255,0.45)', padding: '8px 0' }}>
                No hay canciones curadas cargadas todavía.
              </div>
            )}
            {catalogSongs.map((song, idx) => (
              <div
                key={song.videoId || `${song.title}-${song.artist}-${idx}`}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.06)', gap: 8 }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: SILKSCREEN, fontSize: px(12), color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {song.title}
                  </div>
                  <div style={{ fontFamily: SILKSCREEN, fontSize: px(10), color: 'rgba(255,255,255,0.45)' }}>
                    {song.artist}
                  </div>
                </div>
                <button style={addBtnStyle} disabled={actionBusy} onClick={() => void handleAddSong({ ...song, thumbnail: '' }, 0)}>
                  GRATIS
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Close */}
        <div style={{ marginTop: 14, textAlign: 'center' }}>
          <button
            onClick={onClose}
            style={{ fontFamily: PRESS_START, fontSize: px(7), padding: '10px 20px', border: `1px solid rgba(255,255,255,0.2)`, background: 'transparent', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', minHeight: px(40) }}
          >
            ✕ CERRAR
          </button>
        </div>
      </div>
    </div>
  );
}
