'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { eventBus, EVENTS } from '@/src/game/config/eventBus';

// ── types (local — avoids importing Phaser-dependent AvatarRenderer) ──────────
type HairStyle = 'SPI' | 'FLA' | 'MOH' | 'X';
type AvatarKind =
  | 'procedural' | 'gengar' | 'buho' | 'piplup' | 'chacha'
  | 'trap_a' | 'trap_b' | 'trap_c' | 'trap_d';

interface AvatarCfg {
  avatarKind: AvatarKind;
  bodyColor:  number;
  eyeColor:   number;
  hairColor:  number;
  hairStyle:  HairStyle;
  pp: number;
  tt: number;
}

// ── constants ─────────────────────────────────────────────────────────────────
const BODY_COLORS = [0xF5D5A4, 0xE6B98A, 0xD89B73, 0xBF7B4E, 0x9B5A3A, 0x7A412A];
const EYE_COLORS  = [0x222222, 0x3B82F6, 0x22C55E, 0xA855F7, 0xDC2626, 0xFACC15];
const HAIR_COLORS = [0x1F130A, 0x8B5A2B, 0xF97316, 0xEF4444, 0xFFFFFF, 0xEC4899];
const HAIR_STYLES: HairStyle[] = ['SPI', 'FLA', 'MOH', 'X'];

const SEEDS: Array<{ id: AvatarKind; label: string; dot: string }> = [
  { id: 'procedural', label: 'PROC', dot: '#888888' },
  { id: 'gengar',     label: 'GEN',  dot: '#A855F7' },
  { id: 'buho',       label: 'BUHO', dot: '#22C55E' },
  { id: 'piplup',     label: 'PIP',  dot: '#3B82F6' },
  { id: 'chacha',     label: 'CHA',  dot: '#EC4899' },
  { id: 'trap_a',     label: 'TRA',  dot: '#F5C842' },
  { id: 'trap_b',     label: 'TRB',  dot: '#F5C842' },
  { id: 'trap_c',     label: 'TRC',  dot: '#F5C842' },
  { id: 'trap_d',     label: 'TRD',  dot: '#F5C842' },
];

const USERNAME_KEY = 'waspi_username';
const AVATAR_KEY   = 'waspi_avatar_config';

const DEFAULT_CFG: AvatarCfg = {
  avatarKind: 'procedural',
  bodyColor:  0xF5D5A4,
  eyeColor:   0x2244CC,
  hairColor:  0x8B5A2B,
  hairStyle:  'SPI',
  pp: 2, tt: 2,
};

// ── helpers ───────────────────────────────────────────────────────────────────
const toHex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

function loadInitialCfg(): AvatarCfg {
  if (typeof window === 'undefined') return DEFAULT_CFG;
  try {
    const raw = window.localStorage.getItem(AVATAR_KEY);
    if (raw) return { ...DEFAULT_CFG, ...JSON.parse(raw) } as AvatarCfg;
  } catch { /* ignore */ }
  return DEFAULT_CFG;
}

function getInitialUsername(): string {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem(USERNAME_KEY) ?? `WASPI_${Math.floor(Math.random() * 999)}`;
}

function randomCfg(): AvatarCfg {
  const kinds: AvatarKind[] = SEEDS.map(s => s.id);
  return {
    avatarKind: kinds[Math.floor(Math.random() * kinds.length)],
    bodyColor:  BODY_COLORS[Math.floor(Math.random() * BODY_COLORS.length)],
    eyeColor:   EYE_COLORS[Math.floor(Math.random() * EYE_COLORS.length)],
    hairColor:  HAIR_COLORS[Math.floor(Math.random() * HAIR_COLORS.length)],
    hairStyle:  HAIR_STYLES[Math.floor(Math.random() * HAIR_STYLES.length)],
    pp: Math.floor(Math.random() * 11),
    tt: Math.floor(Math.random() * 11),
  };
}

// ── micro components ──────────────────────────────────────────────────────────

function Swatch({ color, selected, onSelect }: { color: number; selected: boolean; onSelect: () => void }) {
  const css = toHex(color);
  return (
    <button
      onClick={onSelect}
      title={css}
      style={{
        width: 22, height: 22, borderRadius: '50%',
        background: css,
        border: selected ? '2px solid #fff' : '2px solid rgba(255,255,255,0.1)',
        boxShadow: selected ? `0 0 8px ${css}, 0 0 18px ${css}55` : 'none',
        cursor: 'pointer', outline: 'none', flexShrink: 0,
        transition: 'box-shadow .14s, border-color .14s',
      }}
    />
  );
}

function Slider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const pct = value / 10;

  const handleTrack = useCallback((e: React.MouseEvent) => {
    if (!trackRef.current) return;
    const r = trackRef.current.getBoundingClientRect();
    onChange(Math.round(Math.min(10, Math.max(0, ((e.clientX - r.left) / r.width) * 10))));
  }, [onChange]);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontFamily: 'Silkscreen, monospace', fontSize: 8, color: 'rgba(57,255,20,0.65)', width: 22, flexShrink: 0 }}>
        {label}
      </span>
      <button onClick={() => onChange(Math.max(0, value - 1))} style={sliderBtnStyle}>−</button>
      <div
        ref={trackRef}
        onClick={handleTrack}
        style={{ flex: 1, height: 5, background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(57,255,20,0.18)', position: 'relative', cursor: 'pointer' }}
      >
        <div style={{ width: `${pct * 100}%`, height: '100%', background: '#F5C842', boxShadow: '0 0 5px rgba(245,200,66,.6)', transition: 'width .1s' }} />
        <div style={{
          position: 'absolute', left: `${pct * 100}%`, top: '50%',
          transform: 'translate(-50%,-50%)',
          width: 11, height: 11, borderRadius: '50%',
          background: '#F5C842', boxShadow: '0 0 7px #F5C842',
          border: '2px solid #111',
        }} />
      </div>
      <button onClick={() => onChange(Math.min(10, value + 1))} style={sliderBtnStyle}>+</button>
      <span style={{ fontFamily: '"Press Start 2P", monospace', fontSize: 7, color: '#F5C842', minWidth: 14, textAlign: 'right' }}>{value}</span>
    </div>
  );
}

const sliderBtnStyle: React.CSSProperties = {
  width: 18, height: 18,
  background: 'rgba(0,0,0,0.55)',
  border: '1px solid rgba(57,255,20,0.22)',
  color: '#39FF14', cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontFamily: '"Press Start 2P", monospace', fontSize: 9,
  flexShrink: 0, outline: 'none',
};

function SLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontFamily: 'Silkscreen, monospace', fontSize: 8, color: 'rgba(57,255,20,0.6)', letterSpacing: '0.1em', marginBottom: 5 }}>
      {children}
    </div>
  );
}

function Divider() {
  return <div style={{ height: 1, background: 'linear-gradient(90deg,transparent,rgba(57,255,20,.14),transparent)', margin: '6px 0' }} />;
}

function Panel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: 'rgba(7,7,13,0.94)',
      border: '1px solid rgba(57,255,20,0.28)',
      boxShadow: '0 0 20px rgba(57,255,20,0.07), inset 0 0 24px rgba(0,0,0,0.55)',
      backgroundImage: 'repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,0.09) 3px,rgba(0,0,0,0.09) 4px)',
      ...style,
    }}>
      {children}
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────────
interface Props { isMobile?: boolean }

export default function CharacterCreatorOverlay({ isMobile = false }: Props) {
  const [cfg, setCfg]           = useState<AvatarCfg>(loadInitialCfg);
  const [username, setUsername] = useState<string>(getInitialUsername);
  const [saving, setSaving]     = useState(false);
  const [tab, setTab]           = useState<'tipo' | 'color' | 'estilo'>('tipo');
  const prevCfgRef              = useRef<AvatarCfg>(cfg);

  // Emit config change whenever it differs from last emit
  useEffect(() => {
    if (cfg === prevCfgRef.current) return;
    prevCfgRef.current = cfg;
    eventBus.emit(EVENTS.CREATOR_CONFIG_CHANGED, cfg);
  }, [cfg]);

  // Receive initial config from Phaser on scene load
  useEffect(() => {
    const unsub = eventBus.on(EVENTS.CREATOR_READY, (payload: unknown) => {
      const p = payload as { config: AvatarCfg };
      setCfg(p.config);
      prevCfgRef.current = p.config;
    });
    return () => unsub();
  }, []);

  const updateCfg = useCallback((patch: Partial<AvatarCfg>) => {
    setCfg(prev => ({ ...prev, ...patch }));
  }, []);

  const handleUsername = (e: React.ChangeEvent<HTMLInputElement>) => {
    const cleaned = e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '').slice(0, 18);
    setUsername(cleaned);
    if (typeof window !== 'undefined') window.localStorage.setItem(USERNAME_KEY, cleaned);
  };

  const handleRandom = () => {
    const r = randomCfg();
    setCfg(r);
    prevCfgRef.current = r;
    eventBus.emit(EVENTS.CREATOR_CONFIG_CHANGED, r);
  };

  const handleReset = () => {
    const stored = loadInitialCfg();
    setCfg(stored);
    prevCfgRef.current = stored;
    eventBus.emit(EVENTS.CREATOR_CONFIG_CHANGED, stored);
  };

  const handleSave = () => {
    if (saving) return;
    setSaving(true);
    if (typeof window !== 'undefined') window.localStorage.setItem(USERNAME_KEY, username);
    eventBus.emit(EVENTS.CREATOR_COMMIT, { username });
  };

  const seedLabel = SEEDS.find(s => s.id === cfg.avatarKind)?.label ?? 'PROC';

  // ── shared panels ──────────────────────────────────────────────────────────
  const seedGrid = (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 5 }}>
      {SEEDS.map(s => {
        const active = cfg.avatarKind === s.id;
        return (
          <button
            key={s.id}
            onClick={() => updateCfg({ avatarKind: s.id })}
            style={{
              padding: '7px 3px',
              background: active ? 'rgba(245,200,66,0.1)' : 'rgba(0,0,0,0.45)',
              border: `1px solid ${active ? '#F5C842' : 'rgba(57,255,20,0.13)'}`,
              boxShadow: active ? '0 0 10px rgba(245,200,66,0.22)' : 'none',
              cursor: 'pointer', display: 'flex', flexDirection: 'column',
              alignItems: 'center', gap: 4, outline: 'none',
              transition: 'border-color .14s, box-shadow .14s, background .14s',
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.dot, boxShadow: `0 0 5px ${s.dot}` }} />
            <span style={{ fontFamily: '"Press Start 2P", monospace', fontSize: 6, color: active ? '#F5C842' : 'rgba(180,180,180,0.55)' }}>
              {s.label}
            </span>
          </button>
        );
      })}
    </div>
  );

  const colorPanel = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div>
        <SLabel>CUERPO</SLabel>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {BODY_COLORS.map(c => <Swatch key={c} color={c} selected={cfg.bodyColor === c} onSelect={() => updateCfg({ bodyColor: c })} />)}
        </div>
      </div>
      <div>
        <SLabel>OJOS</SLabel>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {EYE_COLORS.map(c => <Swatch key={c} color={c} selected={cfg.eyeColor === c} onSelect={() => updateCfg({ eyeColor: c })} />)}
        </div>
      </div>
      <div>
        <SLabel>PELO</SLabel>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {HAIR_COLORS.map(c => <Swatch key={c} color={c} selected={cfg.hairColor === c} onSelect={() => updateCfg({ hairColor: c })} />)}
        </div>
      </div>
    </div>
  );

  const stylePanel = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
      <div>
        <SLabel>ESTILO PELO</SLabel>
        <div style={{ display: 'flex', gap: 4 }}>
          {HAIR_STYLES.map(s => {
            const active = cfg.hairStyle === s;
            return (
              <button
                key={s}
                onClick={() => updateCfg({ hairStyle: s })}
                style={{
                  flex: 1, padding: '5px 3px',
                  background: active ? 'rgba(245,200,66,0.12)' : 'rgba(0,0,0,0.5)',
                  border: `1px solid ${active ? '#F5C842' : 'rgba(57,255,20,0.14)'}`,
                  color: active ? '#F5C842' : 'rgba(180,180,180,0.55)',
                  fontFamily: '"Press Start 2P", monospace', fontSize: 7,
                  cursor: 'pointer', outline: 'none', transition: 'all .14s',
                }}
              >
                {s}
              </button>
            );
          })}
        </div>
      </div>
      <Slider label="PP" value={cfg.pp} onChange={v => updateCfg({ pp: v })} />
      <Slider label="TT" value={cfg.tt} onChange={v => updateCfg({ tt: v })} />
    </div>
  );

  // ── bottom bar (shared) ────────────────────────────────────────────────────
  const bottomBar = (
    <Panel style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
      {/* Username */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, flex: 1, minWidth: 0 }}>
        <span style={{ fontFamily: 'Silkscreen, monospace', fontSize: 8, color: 'rgba(57,255,20,0.5)', whiteSpace: 'nowrap' }}>
          ID
        </span>
        <input
          value={username}
          onChange={handleUsername}
          placeholder="TU_NOMBRE"
          maxLength={18}
          spellCheck={false}
          style={{
            flex: 1, minWidth: 0,
            background: 'rgba(0,0,0,0.7)',
            border: 'none', borderBottom: '2px solid rgba(245,200,66,0.42)',
            color: '#fff', fontFamily: 'Silkscreen, monospace',
            fontSize: 12, padding: '3px 6px',
            outline: 'none', letterSpacing: '2px',
          }}
        />
      </div>

      {/* Action buttons */}
      <button onClick={handleRandom} style={ghostBtn('#39FF14')}>RANDOM</button>
      <button onClick={handleReset}  style={ghostBtn('#46B3FF')}>RESET</button>

      {/* CTA */}
      <button
        onClick={handleSave}
        disabled={saving}
        style={{
          padding: '9px 16px',
          background: saving ? 'rgba(245,200,66,0.25)' : '#F5C842',
          border: 'none', cursor: saving ? 'default' : 'pointer',
          color: '#0a0a0a',
          fontFamily: '"Press Start 2P", monospace', fontSize: 8,
          boxShadow: saving ? 'none' : '0 0 18px rgba(245,200,66,0.38)',
          transition: 'box-shadow .2s, background .2s',
          whiteSpace: 'nowrap', flexShrink: 0,
          letterSpacing: '0.04em',
        }}
      >
        {saving ? '...' : 'ENTRAR  ►'}
      </button>
    </Panel>
  );

  // ── MOBILE layout ──────────────────────────────────────────────────────────
  if (isMobile) {
    const tabs: Array<{ id: typeof tab; label: string }> = [
      { id: 'tipo',   label: 'TIPO'   },
      { id: 'color',  label: 'COLOR'  },
      { id: 'estilo', label: 'ESTILO' },
    ];
    return (
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', zIndex: 60, pointerEvents: 'none' }}>
        {/* Header */}
        <Panel style={{ padding: '5px 12px', display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'auto' }}>
          <span style={{ fontFamily: '"Press Start 2P", monospace', fontSize: 8, color: '#F5C842', letterSpacing: '0.06em' }}>
            CHARACTER SELECT
          </span>
        </Panel>

        {/* Tabs */}
        <div style={{ display: 'flex', pointerEvents: 'auto' }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              flex: 1, padding: '7px 4px',
              background: tab === t.id ? 'rgba(57,255,20,0.1)' : 'rgba(7,7,13,0.9)',
              border: `1px solid ${tab === t.id ? 'rgba(57,255,20,0.45)' : 'rgba(57,255,20,0.1)'}`,
              color: tab === t.id ? '#39FF14' : 'rgba(140,140,140,0.6)',
              fontFamily: '"Press Start 2P", monospace', fontSize: 7,
              cursor: 'pointer', outline: 'none',
            }}>{t.label}</button>
          ))}
        </div>

        {/* Transparent preview area */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: 8, pointerEvents: 'none' }}>
          <div style={{ fontFamily: '"Press Start 2P", monospace', fontSize: 6, color: '#0a0a0a', background: '#F5C842', padding: '3px 8px' }}>
            ● {seedLabel}
          </div>
        </div>

        {/* Options */}
        <Panel style={{ padding: 10, pointerEvents: 'auto', maxHeight: '44%', overflowY: 'auto' }}>
          {tab === 'tipo'   && seedGrid}
          {tab === 'color'  && colorPanel}
          {tab === 'estilo' && stylePanel}
        </Panel>

        {/* Bottom */}
        <div style={{ pointerEvents: 'auto' }}>{bottomBar}</div>
      </div>
    );
  }

  // ── DESKTOP layout (800×600) ───────────────────────────────────────────────
  return (
    <div style={{
      position: 'absolute', inset: 0,
      display: 'grid',
      gridTemplateColumns: '188px 1fr 188px',
      gridTemplateRows: '1fr 56px',
      zIndex: 60,
      pointerEvents: 'none',
    }}>

      {/* ── Left panel ──────────────────────────────────────────────────── */}
      <Panel style={{
        gridRow: '1', gridColumn: '1',
        padding: '10px 10px 12px',
        display: 'flex', flexDirection: 'column', gap: 9,
        pointerEvents: 'auto',
      }}>
        {/* Branding */}
        <div style={{ textAlign: 'center' }}>
          <div style={{
            fontFamily: '"Press Start 2P", monospace', fontSize: 7,
            color: '#F5C842', letterSpacing: '0.08em',
            textShadow: '0 0 12px rgba(245,200,66,0.45)',
          }}>
            WASPI WORLD
          </div>
          <div style={{ fontFamily: 'Silkscreen, monospace', fontSize: 9, color: 'rgba(57,255,20,0.55)', letterSpacing: '0.12em', marginTop: 3 }}>
            CHARACTER SELECT
          </div>
          <Divider />
        </div>

        <SLabel>◈ PERSONAJE</SLabel>
        {seedGrid}
      </Panel>

      {/* ── Center: transparent — Phaser avatar shows through ───────────── */}
      <div style={{
        gridRow: '1', gridColumn: '2',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        paddingBottom: 16,
        pointerEvents: 'none',
      }}>
        {/* Seed name pill anchored to bottom of preview area */}
        <div style={{
          fontFamily: '"Press Start 2P", monospace', fontSize: 7,
          color: '#0a0a0a', background: '#F5C842',
          padding: '4px 10px',
          boxShadow: '0 0 14px rgba(245,200,66,0.3)',
          letterSpacing: '0.05em',
        }}>
          ● {seedLabel}
        </div>
      </div>

      {/* ── Right panel ─────────────────────────────────────────────────── */}
      <Panel style={{
        gridRow: '1', gridColumn: '3',
        padding: '10px 10px 12px',
        display: 'flex', flexDirection: 'column', gap: 10,
        pointerEvents: 'auto',
        overflowY: 'auto',
      }}>
        <SLabel>◈ CUSTOM</SLabel>
        {colorPanel}
        <Divider />
        {stylePanel}
      </Panel>

      {/* ── Bottom bar: full width ───────────────────────────────────────── */}
      <div style={{ gridRow: '2', gridColumn: '1 / span 3', pointerEvents: 'auto' }}>
        {bottomBar}
      </div>
    </div>
  );
}

// ── style helpers ─────────────────────────────────────────────────────────────
const ghostBtn = (color: string): React.CSSProperties => ({
  padding: '6px 9px',
  background: 'rgba(0,0,0,0.55)',
  border: `1px solid ${color}55`,
  color,
  fontFamily: '"Press Start 2P", monospace', fontSize: 7,
  cursor: 'pointer', outline: 'none',
  boxShadow: `0 0 8px ${color}18`,
  transition: 'border-color .14s, box-shadow .14s',
  whiteSpace: 'nowrap', flexShrink: 0,
});
