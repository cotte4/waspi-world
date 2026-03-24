'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { eventBus, EVENTS } from '@/src/game/config/eventBus';

// ── types ─────────────────────────────────────────────────────────────────────
type AvatarKind    = 'procedural' | 'gengar' | 'buho' | 'piplup' | 'chacha' | 'trap_a' | 'trap_b' | 'trap_c' | 'trap_d';
type HairStyle     = 'SPI' | 'FLA' | 'MOH' | 'MCH' | 'X' | 'CRL' | 'BUN';
type HatStyle      = 'none' | 'snapback' | 'beanie' | 'bucket' | 'headband';
type MouthStyle    = 'neutral' | 'smile' | 'serious' | 'grin';
type GlassesStyle  = 'none' | 'round' | 'shades' | 'visor';
type ChainStyle    = 'none' | 'thin' | 'chunky';
type ShoeStyle     = 'low' | 'high' | 'slides';
type AuraEffect    = 'none' | 'smoke' | 'sparkle' | 'cash' | 'stars';
type SlotId        = 'character' | 'face' | 'hair' | 'hat' | 'outfit' | 'shoes' | 'chain' | 'glasses' | 'aura';

interface AvatarCfg {
  avatarKind:   AvatarKind;
  bodyColor:    number;
  eyeColor:     number;
  hairColor:    number;
  hairStyle:    HairStyle;
  topColor:     number;
  bottomColor:  number;
  pp:           number;
  tt:           number;
  smoke:        boolean;
  hatStyle:     HatStyle;
  hatColor:     number;
  mouthStyle:   MouthStyle;
  glassesStyle: GlassesStyle;
  glassesColor: number;
  chainStyle:   ChainStyle;
  chainColor:   number;
  shoeStyle:    ShoeStyle;
  shoeColor:    number;
  auraColor:    number;
  auraEffect:   AuraEffect;
  bodyWidth:    number;
  bodyHeight:   number;
}

// ── palettes ──────────────────────────────────────────────────────────────────
const BODY_COLORS    = [0xFFE0C0, 0xF5D5A4, 0xE6B98A, 0xD89B73, 0xBF7B4E, 0x9B5A3A, 0x7A412A, 0x4A2510];
const EYE_COLORS     = [0x222222, 0x3B82F6, 0x22C55E, 0xA855F7, 0xDC2626, 0xFACC15, 0xFF6B6B, 0x06B6D4];
const HAIR_COLORS    = [0x1F130A, 0x8B5A2B, 0xF97316, 0xEF4444, 0xFFFFFF, 0xEC4899, 0xA855F7, 0xFACC15, 0x3B82F6, 0x22C55E];
const HAT_COLORS     = [0x111111, 0xFFFFFF, 0xF5C842, 0xDC2626, 0x3B82F6, 0x22C55E, 0xA855F7, 0xFF6B6B];
const TOP_COLORS     = [0x111827, 0xFFFFFF, 0xDC2626, 0x3B82F6, 0x22C55E, 0xF97316, 0xA855F7, 0xF5C842, 0xEC4899, 0x06B6D4];
const BOTTOM_COLORS  = [0x111827, 0x374151, 0x6B7280, 0xDC2626, 0x3B82F6, 0xF5C842, 0xA855F7, 0xFFFFFF];
const SHOE_COLORS    = [0xFFFFFF, 0x111111, 0xDC2626, 0x3B82F6, 0xF5C842, 0x22C55E, 0xA855F7, 0xF97316];
const GLASSES_COLORS = [0x111111, 0x1F2937, 0xDC2626, 0x3B82F6, 0xF5C842, 0xEC4899];
const AURA_COLORS    = [0xF5C842, 0x39FF14, 0xFF006E, 0x46B3FF, 0xA855F7, 0xFF6B6B, 0xFFFFFF, 0xF97316];

const CHAIN_METALS = [
  { color: 0xF5C842, label: 'GOLD' },
  { color: 0xC0C0C0, label: 'SLVR' },
  { color: 0xB9F2FF, label: 'DIAM' },
];

const SEEDS = [
  { id: 'procedural' as AvatarKind, label: 'PROC', dot: '#888888' },
  { id: 'gengar'     as AvatarKind, label: 'GEN',  dot: '#A855F7' },
  { id: 'buho'       as AvatarKind, label: 'BUHO', dot: '#22C55E' },
  { id: 'piplup'     as AvatarKind, label: 'PIP',  dot: '#3B82F6' },
  { id: 'chacha'     as AvatarKind, label: 'CHA',  dot: '#EC4899' },
  { id: 'trap_a'     as AvatarKind, label: 'TRA',  dot: '#F5C842' },
  { id: 'trap_b'     as AvatarKind, label: 'TRB',  dot: '#F5C842' },
  { id: 'trap_c'     as AvatarKind, label: 'TRC',  dot: '#F5C842' },
  { id: 'trap_d'     as AvatarKind, label: 'TRD',  dot: '#F5C842' },
];

const SLOTS: Array<{ id: SlotId; label: string; icon: string }> = [
  { id: 'character', label: 'CHARACTER', icon: '◈' },
  { id: 'face',      label: 'FACE',      icon: '◉' },
  { id: 'hair',      label: 'HAIR',      icon: '≋' },
  { id: 'hat',       label: 'HAT',       icon: '▲' },
  { id: 'outfit',    label: 'OUTFIT',    icon: '▣' },
  { id: 'shoes',     label: 'SHOES',     icon: '◆' },
  { id: 'chain',     label: 'CHAIN',     icon: '◎' },
  { id: 'glasses',   label: 'GLASSES',   icon: '⊡' },
  { id: 'aura',      label: 'AURA',      icon: '✦' },
];

// ── constants ─────────────────────────────────────────────────────────────────
const USERNAME_KEY = 'waspi_username';
const AVATAR_KEY   = 'waspi_avatar_config';

const DEFAULT_CFG: AvatarCfg = {
  avatarKind:   'procedural',
  bodyColor:    0xF5D5A4,
  eyeColor:     0x2244CC,
  hairColor:    0x8B5A2B,
  hairStyle:    'SPI',
  topColor:     0x3B82F6,
  bottomColor:  0x111827,
  pp: 2, tt: 2,
  smoke:        false,
  hatStyle:     'none',
  hatColor:     0x111111,
  mouthStyle:   'neutral',
  glassesStyle: 'none',
  glassesColor: 0x111111,
  chainStyle:   'none',
  chainColor:   0xF5C842,
  shoeStyle:    'low',
  shoeColor:    0xEEEEEE,
  auraColor:    0xF5C842,
  auraEffect:   'none',
  bodyWidth:    1.0,
  bodyHeight:   1.0,
};

// ── DRIP SCORE ────────────────────────────────────────────────────────────────
function calcDripScore(cfg: AvatarCfg): number {
  let s = 8;
  if (cfg.hatStyle     !== 'none')    s += 12;
  if (cfg.glassesStyle !== 'none')    s += 10;
  if (cfg.chainStyle   !== 'none')    s += 12;
  if (cfg.auraEffect   !== 'none')    s += 15;
  if (cfg.mouthStyle   !== 'neutral') s +=  6;
  if (cfg.shoeStyle    !== 'low')     s +=  8;
  if (cfg.smoke)                      s +=  5;
  if (cfg.bodyColor    !== DEFAULT_CFG.bodyColor)   s += 4;
  if (cfg.hairColor    !== DEFAULT_CFG.hairColor)   s += 4;
  if (cfg.eyeColor     !== DEFAULT_CFG.eyeColor)    s += 4;
  if (cfg.topColor     !== DEFAULT_CFG.topColor)    s += 4;
  if (cfg.bottomColor  !== DEFAULT_CFG.bottomColor) s += 4;
  if (cfg.shoeColor    !== DEFAULT_CFG.shoeColor)   s += 4;
  if (cfg.pp > 5 || cfg.pp < 2)  s += 3;
  if (cfg.tt > 5 || cfg.tt < 2)  s += 3;
  if (cfg.bodyWidth  !== 1.0)     s += 3;
  if (cfg.bodyHeight !== 1.0)     s += 3;
  return Math.min(100, s);
}

function dripRank(score: number): { rank: string; color: string } {
  if (score >= 95) return { rank: 'SSS', color: '#FF006E' };
  if (score >= 85) return { rank: 'SS',  color: '#F5C842' };
  if (score >= 75) return { rank: 'S',   color: '#39FF14' };
  if (score >= 60) return { rank: 'A',   color: '#46B3FF' };
  if (score >= 45) return { rank: 'B',   color: '#A855F7' };
  if (score >= 30) return { rank: 'C',   color: '#888888' };
  return               { rank: 'D',   color: '#555555' };
}

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
  function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
  const rnd01 = () => parseFloat((Math.random() * 0.7 + 0.7).toFixed(2)); // 0.7..1.4
  return {
    avatarKind:   pick(SEEDS).id,
    bodyColor:    pick(BODY_COLORS),
    eyeColor:     pick(EYE_COLORS),
    hairColor:    pick(HAIR_COLORS),
    hairStyle:    pick(['SPI','FLA','MOH','MCH','X','CRL','BUN'] as HairStyle[]),
    topColor:     pick(TOP_COLORS),
    bottomColor:  pick(BOTTOM_COLORS),
    pp:           Math.floor(Math.random() * 11),
    tt:           Math.floor(Math.random() * 11),
    smoke:        Math.random() < 0.25,
    hatStyle:     pick(['none','none','none','snapback','beanie','bucket','headband'] as HatStyle[]),
    hatColor:     pick(HAT_COLORS),
    mouthStyle:   pick(['neutral','smile','serious','grin'] as MouthStyle[]),
    glassesStyle: pick(['none','none','round','shades','visor'] as GlassesStyle[]),
    glassesColor: pick(GLASSES_COLORS),
    chainStyle:   pick(['none','none','thin','chunky'] as ChainStyle[]),
    chainColor:   pick(CHAIN_METALS).color,
    shoeStyle:    pick(['low','high','slides'] as ShoeStyle[]),
    shoeColor:    pick(SHOE_COLORS),
    auraColor:    pick(AURA_COLORS),
    auraEffect:   pick(['none','none','smoke','sparkle','cash','stars'] as AuraEffect[]),
    bodyWidth:    rnd01(),
    bodyHeight:   rnd01(),
  };
}

// ── micro-components ──────────────────────────────────────────────────────────
function Swatch({ color, selected, onSelect }: { color: number; selected: boolean; onSelect: () => void }) {
  const css = toHex(color);
  return (
    <button
      onClick={onSelect}
      title={css}
      style={{
        width: 20, height: 20, borderRadius: '50%',
        background: css,
        border: selected ? '2px solid #fff' : '2px solid rgba(255,255,255,0.08)',
        boxShadow: selected ? `0 0 8px ${css}, 0 0 16px ${css}44` : 'none',
        cursor: 'pointer', outline: 'none', flexShrink: 0,
        transition: 'box-shadow .12s, border-color .12s',
      }}
    />
  );
}

function StyleBtn({ label, active, onClick, wide }: { label: string; active: boolean; onClick: () => void; wide?: boolean }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: wide ? 'none' : 1,
        padding: wide ? '5px 8px' : '5px 3px',
        background: active ? 'rgba(245,200,66,0.14)' : 'rgba(0,0,0,0.5)',
        border: `1px solid ${active ? '#F5C842' : 'rgba(57,255,20,0.14)'}`,
        color: active ? '#F5C842' : 'rgba(170,170,170,0.55)',
        fontFamily: '"Press Start 2P", monospace', fontSize: 6,
        cursor: 'pointer', outline: 'none',
        transition: 'all .12s', whiteSpace: 'nowrap',
      }}
    >
      {label}
    </button>
  );
}

function SliderRow({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const pct = value / 10;
  const handleTrack = useCallback((e: React.MouseEvent) => {
    if (!trackRef.current) return;
    const r = trackRef.current.getBoundingClientRect();
    onChange(Math.round(Math.min(10, Math.max(0, ((e.clientX - r.left) / r.width) * 10))));
  }, [onChange]);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <span style={{ fontFamily: 'Silkscreen, monospace', fontSize: 7, color: 'rgba(57,255,20,0.6)', width: 24, flexShrink: 0 }}>{label}</span>
      <button onClick={() => onChange(Math.max(0, value - 1))} style={smallBtn}>−</button>
      <div ref={trackRef} onClick={handleTrack} style={{ flex: 1, height: 4, background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(57,255,20,0.15)', position: 'relative', cursor: 'pointer' }}>
        <div style={{ width: `${pct * 100}%`, height: '100%', background: '#F5C842', transition: 'width .1s' }} />
        <div style={{ position: 'absolute', left: `${pct * 100}%`, top: '50%', transform: 'translate(-50%,-50%)', width: 10, height: 10, borderRadius: '50%', background: '#F5C842', border: '2px solid #111' }} />
      </div>
      <button onClick={() => onChange(Math.min(10, value + 1))} style={smallBtn}>+</button>
      <span style={{ fontFamily: '"Press Start 2P", monospace', fontSize: 6, color: '#F5C842', minWidth: 12, textAlign: 'right' }}>{value}</span>
    </div>
  );
}

function ScaleSlider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const pct = (value - 0.7) / 0.7; // 0.7..1.4 mapped to 0..1
  const handleTrack = useCallback((e: React.MouseEvent) => {
    if (!trackRef.current) return;
    const r = trackRef.current.getBoundingClientRect();
    const raw = (e.clientX - r.left) / r.width;
    onChange(parseFloat((raw * 0.7 + 0.7).toFixed(2)));
  }, [onChange]);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <span style={{ fontFamily: 'Silkscreen, monospace', fontSize: 7, color: 'rgba(57,255,20,0.6)', width: 24, flexShrink: 0 }}>{label}</span>
      <button onClick={() => onChange(parseFloat(Math.max(0.7, value - 0.1).toFixed(2)))} style={smallBtn}>−</button>
      <div ref={trackRef} onClick={handleTrack} style={{ flex: 1, height: 4, background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(57,255,20,0.15)', position: 'relative', cursor: 'pointer' }}>
        <div style={{ width: `${pct * 100}%`, height: '100%', background: '#46B3FF', transition: 'width .1s' }} />
        <div style={{ position: 'absolute', left: `${pct * 100}%`, top: '50%', transform: 'translate(-50%,-50%)', width: 10, height: 10, borderRadius: '50%', background: '#46B3FF', border: '2px solid #111' }} />
      </div>
      <button onClick={() => onChange(parseFloat(Math.min(1.4, value + 0.1).toFixed(2)))} style={smallBtn}>+</button>
      <span style={{ fontFamily: '"Press Start 2P", monospace', fontSize: 6, color: '#46B3FF', minWidth: 22, textAlign: 'right' }}>{value.toFixed(1)}×</span>
    </div>
  );
}

function SLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ fontFamily: 'Silkscreen, monospace', fontSize: 7, color: 'rgba(57,255,20,0.55)', letterSpacing: '0.08em', marginBottom: 5 }}>{children}</div>;
}

function Divider() {
  return <div style={{ height: 1, background: 'linear-gradient(90deg,transparent,rgba(57,255,20,.12),transparent)', margin: '7px 0' }} />;
}

function SwatchRow({ colors, value, onChange }: { colors: number[]; value: number; onChange: (c: number) => void }) {
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
      {colors.map(c => <Swatch key={c} color={c} selected={value === c} onSelect={() => onChange(c)} />)}
    </div>
  );
}

// ── slot editor: per-slot content ─────────────────────────────────────────────
function SlotEditor({ slot, cfg, update }: { slot: SlotId; cfg: AvatarCfg; update: (p: Partial<AvatarCfg>) => void }) {
  switch (slot) {

    case 'character':
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <SLabel>PERSONAJE</SLabel>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 4 }}>
            {SEEDS.map(s => {
              const active = cfg.avatarKind === s.id;
              return (
                <button key={s.id} onClick={() => update({ avatarKind: s.id })} style={{
                  padding: '7px 3px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                  background: active ? 'rgba(245,200,66,0.1)' : 'rgba(0,0,0,0.45)',
                  border: `1px solid ${active ? '#F5C842' : 'rgba(57,255,20,0.12)'}`,
                  boxShadow: active ? '0 0 10px rgba(245,200,66,0.2)' : 'none',
                  cursor: 'pointer', outline: 'none', transition: 'all .12s',
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.dot, boxShadow: `0 0 4px ${s.dot}` }} />
                  <span style={{ fontFamily: '"Press Start 2P", monospace', fontSize: 6, color: active ? '#F5C842' : 'rgba(160,160,160,0.5)' }}>{s.label}</span>
                </button>
              );
            })}
          </div>
          <Divider />
          <SLabel>PIEL</SLabel>
          <SwatchRow colors={BODY_COLORS} value={cfg.bodyColor} onChange={c => update({ bodyColor: c })} />
          <Divider />
          <SLabel>PROPORCIONES</SLabel>
          <SliderRow label="PP" value={cfg.pp} onChange={v => update({ pp: v })} />
          <SliderRow label="TT" value={cfg.tt} onChange={v => update({ tt: v })} />
          <ScaleSlider label="W" value={cfg.bodyWidth}  onChange={v => update({ bodyWidth: v })} />
          <ScaleSlider label="H" value={cfg.bodyHeight} onChange={v => update({ bodyHeight: v })} />
        </div>
      );

    case 'face':
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <SLabel>OJOS</SLabel>
          <SwatchRow colors={EYE_COLORS} value={cfg.eyeColor} onChange={c => update({ eyeColor: c })} />
          <Divider />
          <SLabel>BOCA</SLabel>
          <div style={{ display: 'flex', gap: 4 }}>
            {(['neutral','smile','serious','grin'] as MouthStyle[]).map(s => (
              <StyleBtn key={s} label={s.toUpperCase().slice(0,4)} active={cfg.mouthStyle === s} onClick={() => update({ mouthStyle: s })} />
            ))}
          </div>
          <Divider />
          <SLabel>HUMO</SLabel>
          <button
            onClick={() => update({ smoke: !cfg.smoke })}
            style={{ ...ghostBtn(cfg.smoke ? '#39FF14' : '#444455'), width: '100%', padding: '8px' }}
          >
            {cfg.smoke ? '● ENCENDIDO' : '○ APAGADO'}
          </button>
        </div>
      );

    case 'hair':
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <SLabel>ESTILO</SLabel>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {(['SPI','FLA','MOH','MCH','CRL','BUN','X'] as HairStyle[]).map(s => (
              <StyleBtn key={s} label={s} active={cfg.hairStyle === s} onClick={() => update({ hairStyle: s })} wide />
            ))}
          </div>
          <Divider />
          <SLabel>COLOR</SLabel>
          <SwatchRow colors={HAIR_COLORS} value={cfg.hairColor} onChange={c => update({ hairColor: c })} />
        </div>
      );

    case 'hat':
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <SLabel>TIPO</SLabel>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {(['none','snapback','beanie','bucket','headband'] as HatStyle[]).map(s => (
              <StyleBtn key={s} label={s === 'none' ? 'NONE' : s.toUpperCase().slice(0,4)} active={cfg.hatStyle === s} onClick={() => update({ hatStyle: s })} wide />
            ))}
          </div>
          <Divider />
          <SLabel>COLOR</SLabel>
          <SwatchRow colors={HAT_COLORS} value={cfg.hatColor} onChange={c => update({ hatColor: c })} />
        </div>
      );

    case 'outfit':
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <SLabel>TOP / CAMISA</SLabel>
          <SwatchRow colors={TOP_COLORS} value={cfg.topColor} onChange={c => update({ topColor: c })} />
          <Divider />
          <SLabel>BOTTOM / PANTALON</SLabel>
          <SwatchRow colors={BOTTOM_COLORS} value={cfg.bottomColor} onChange={c => update({ bottomColor: c })} />
        </div>
      );

    case 'shoes':
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <SLabel>ESTILO</SLabel>
          <div style={{ display: 'flex', gap: 4 }}>
            {(['low','high','slides'] as ShoeStyle[]).map(s => (
              <StyleBtn key={s} label={s.toUpperCase()} active={cfg.shoeStyle === s} onClick={() => update({ shoeStyle: s })} />
            ))}
          </div>
          <Divider />
          <SLabel>COLOR</SLabel>
          <SwatchRow colors={SHOE_COLORS} value={cfg.shoeColor} onChange={c => update({ shoeColor: c })} />
        </div>
      );

    case 'chain':
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <SLabel>ESTILO</SLabel>
          <div style={{ display: 'flex', gap: 4 }}>
            {(['none','thin','chunky'] as ChainStyle[]).map(s => (
              <StyleBtn key={s} label={s.toUpperCase()} active={cfg.chainStyle === s} onClick={() => update({ chainStyle: s })} />
            ))}
          </div>
          <Divider />
          <SLabel>METAL</SLabel>
          <div style={{ display: 'flex', gap: 6 }}>
            {CHAIN_METALS.map(m => (
              <button key={m.label} onClick={() => update({ chainColor: m.color })} style={{
                flex: 1, padding: '7px 4px',
                background: cfg.chainColor === m.color ? 'rgba(245,200,66,0.12)' : 'rgba(0,0,0,0.5)',
                border: `1px solid ${cfg.chainColor === m.color ? '#F5C842' : 'rgba(57,255,20,0.12)'}`,
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                cursor: 'pointer', outline: 'none',
              }}>
                <span style={{ width: 12, height: 12, borderRadius: '50%', background: toHex(m.color), display: 'block', boxShadow: `0 0 6px ${toHex(m.color)}` }} />
                <span style={{ fontFamily: '"Press Start 2P", monospace', fontSize: 6, color: cfg.chainColor === m.color ? '#F5C842' : '#666' }}>{m.label}</span>
              </button>
            ))}
          </div>
        </div>
      );

    case 'glasses':
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <SLabel>TIPO</SLabel>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {(['none','round','shades','visor'] as GlassesStyle[]).map(s => (
              <StyleBtn key={s} label={s.toUpperCase().slice(0,5)} active={cfg.glassesStyle === s} onClick={() => update({ glassesStyle: s })} wide />
            ))}
          </div>
          <Divider />
          <SLabel>COLOR</SLabel>
          <SwatchRow colors={GLASSES_COLORS} value={cfg.glassesColor} onChange={c => update({ glassesColor: c })} />
        </div>
      );

    case 'aura':
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <SLabel>EFECTO</SLabel>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {(['none','smoke','sparkle','cash','stars'] as AuraEffect[]).map(s => (
              <StyleBtn key={s} label={s.toUpperCase().slice(0,5)} active={cfg.auraEffect === s} onClick={() => update({ auraEffect: s })} wide />
            ))}
          </div>
          <Divider />
          <SLabel>COLOR</SLabel>
          <SwatchRow colors={AURA_COLORS} value={cfg.auraColor} onChange={c => update({ auraColor: c })} />
        </div>
      );

    default: return null;
  }
}

// ── DRIP score bar ────────────────────────────────────────────────────────────
function DripScoreBar({ cfg }: { cfg: AvatarCfg }) {
  const score = useMemo(() => calcDripScore(cfg), [cfg]);
  const { rank, color } = dripRank(score);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
      <span style={{ fontFamily: '"Press Start 2P", monospace', fontSize: 7, color: '#F5C842', whiteSpace: 'nowrap' }}>DRIP</span>
      <div style={{ flex: 1, height: 6, background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(245,200,66,0.2)', position: 'relative', overflow: 'hidden' }}>
        <div style={{ width: `${score}%`, height: '100%', background: `linear-gradient(90deg, #F5C842, ${color})`, transition: 'width .3s ease', boxShadow: `0 0 8px ${color}88` }} />
      </div>
      <span style={{ fontFamily: '"Press Start 2P", monospace', fontSize: 9, color, textShadow: `0 0 10px ${color}`, minWidth: 30, textAlign: 'right', transition: 'color .2s' }}>
        {rank}
      </span>
      <span style={{ fontFamily: 'Silkscreen, monospace', fontSize: 8, color: 'rgba(255,255,255,0.35)', minWidth: 26 }}>{score}</span>
    </div>
  );
}

// ── slot sidebar item ─────────────────────────────────────────────────────────
function SlotItem({ slot, active, cfg, onClick }: { slot: typeof SLOTS[0]; active: boolean; cfg: AvatarCfg; onClick: () => void }) {
  const badge = getSlotBadge(slot.id, cfg);
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 7, padding: '7px 8px',
      background: active ? 'rgba(245,200,66,0.08)' : 'transparent',
      borderLeft: `2px solid ${active ? '#F5C842' : 'transparent'}`,
      borderTop: 'none', borderRight: 'none', borderBottom: 'none',
      cursor: 'pointer', outline: 'none', width: '100%',
      transition: 'background .12s, border-color .12s',
    }}>
      <span style={{ fontFamily: '"Press Start 2P", monospace', fontSize: 8, color: active ? '#F5C842' : 'rgba(140,140,140,0.55)', width: 14, flexShrink: 0 }}>{slot.icon}</span>
      <span style={{ fontFamily: 'Silkscreen, monospace', fontSize: 9, color: active ? '#F5C842' : 'rgba(180,180,180,0.5)', flex: 1, textAlign: 'left' }}>{slot.label}</span>
      {badge && (
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: badge, flexShrink: 0, boxShadow: `0 0 5px ${badge}` }} />
      )}
    </button>
  );
}

function getSlotBadge(slot: SlotId, cfg: AvatarCfg): string | null {
  switch (slot) {
    case 'character': return toHex(cfg.bodyColor);
    case 'face':      return toHex(cfg.eyeColor);
    case 'hair':      return cfg.hairStyle === 'X' ? null : toHex(cfg.hairColor);
    case 'hat':       return cfg.hatStyle     !== 'none' ? toHex(cfg.hatColor)     : null;
    case 'outfit':    return toHex(cfg.topColor);
    case 'shoes':     return toHex(cfg.shoeColor);
    case 'chain':     return cfg.chainStyle   !== 'none' ? toHex(cfg.chainColor)   : null;
    case 'glasses':   return cfg.glassesStyle !== 'none' ? toHex(cfg.glassesColor) : null;
    case 'aura':      return cfg.auraEffect   !== 'none' ? toHex(cfg.auraColor)    : null;
    default:          return null;
  }
}

// ── panel wrapper ─────────────────────────────────────────────────────────────
function Panel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: 'rgba(5,5,12,0.96)',
      border: '1px solid rgba(57,255,20,0.22)',
      boxShadow: '0 0 24px rgba(0,0,0,0.6), inset 0 0 20px rgba(0,0,0,0.4)',
      backgroundImage: 'repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,0.07) 3px,rgba(0,0,0,0.07) 4px)',
      ...style,
    }}>
      {children}
    </div>
  );
}

// ── style helpers ─────────────────────────────────────────────────────────────
const smallBtn: React.CSSProperties = {
  width: 16, height: 16, background: 'rgba(0,0,0,0.55)',
  border: '1px solid rgba(57,255,20,0.18)', color: '#39FF14',
  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontFamily: '"Press Start 2P", monospace', fontSize: 9, flexShrink: 0, outline: 'none', padding: 0,
};

const ghostBtn = (color: string): React.CSSProperties => ({
  padding: '6px 9px', background: 'rgba(0,0,0,0.55)',
  border: `1px solid ${color}55`, color,
  fontFamily: '"Press Start 2P", monospace', fontSize: 7,
  cursor: 'pointer', outline: 'none',
  boxShadow: `0 0 8px ${color}18`,
  transition: 'border-color .14s, box-shadow .14s',
  whiteSpace: 'nowrap', flexShrink: 0,
});

// ── main component ────────────────────────────────────────────────────────────
interface Props { isMobile?: boolean }

export default function CharacterCreatorOverlay({ isMobile = false }: Props) {
  const [cfg, setCfg]           = useState<AvatarCfg>(loadInitialCfg);
  const [username, setUsername] = useState<string>(getInitialUsername);
  const [saving, setSaving]     = useState(false);
  const [activeSlot, setActiveSlot] = useState<SlotId>('character');
  const debounceRef             = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      eventBus.emit(EVENTS.CREATOR_CONFIG_CHANGED, cfg);
    }, 150);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [cfg]);

  useEffect(() => {
    const unsub = eventBus.on(EVENTS.CREATOR_READY, (payload: unknown) => {
      const p = payload as { config: AvatarCfg };
      setCfg(p.config);
    });
    return () => unsub();
  }, []);

  const update = useCallback((patch: Partial<AvatarCfg>) => {
    setCfg(prev => ({ ...prev, ...patch }));
  }, []);

  const handleUsername = (e: React.ChangeEvent<HTMLInputElement>) => {
    const cleaned = e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '').slice(0, 18);
    setUsername(cleaned);
    if (typeof window !== 'undefined') window.localStorage.setItem(USERNAME_KEY, cleaned);
  };

  const handleRandom = () => setCfg(randomCfg());

  const handleReset = () => setCfg(loadInitialCfg());

  const handleSave = () => {
    if (saving) return;
    setSaving(true);
    if (typeof window !== 'undefined') window.localStorage.setItem(USERNAME_KEY, username);
    eventBus.emit(EVENTS.CREATOR_COMMIT, { username });
  };

  // ── bottom bar ──────────────────────────────────────────────────────────────
  const bottomBar = (
    <Panel style={{
      padding: isMobile ? '8px 10px' : '7px 12px',
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      flexWrap: isMobile ? 'wrap' : 'nowrap',
    }}>
      <DripScoreBar cfg={cfg} />
      <div style={{
        width: isMobile ? '100%' : 1,
        height: isMobile ? 1 : 28,
        background: 'rgba(57,255,20,0.12)',
      }} />
      <span style={{ fontFamily: 'Silkscreen, monospace', fontSize: 8, color: 'rgba(57,255,20,0.45)', whiteSpace: 'nowrap' }}>ID</span>
      <input
        value={username}
        onChange={handleUsername}
        placeholder="TU_NOMBRE"
        maxLength={18}
        spellCheck={false}
        style={{
          flex: isMobile ? '1 1 100%' : 1,
          minWidth: isMobile ? '100%' : 0,
          background: 'rgba(0,0,0,0.7)',
          border: 'none', borderBottom: '2px solid rgba(245,200,66,0.38)',
          color: '#fff', fontFamily: 'Silkscreen, monospace',
          fontSize: 11, padding: '3px 6px', outline: 'none', letterSpacing: '2px',
        }}
      />
      <button onClick={handleRandom} style={{ ...ghostBtn('#39FF14'), flex: isMobile ? 1 : undefined, textAlign: 'center' }}>RANDOM</button>
      <button onClick={handleReset}  style={{ ...ghostBtn('#46B3FF'), flex: isMobile ? 1 : undefined, textAlign: 'center' }}>RESET</button>
      <button
        onClick={handleSave}
        disabled={saving}
        style={{
          flex: isMobile ? '1 1 100%' : '0 0 auto',
          padding: '9px 14px',
          background: saving ? 'rgba(245,200,66,0.25)' : '#F5C842',
          border: 'none', cursor: saving ? 'default' : 'pointer',
          color: '#0a0a0a', fontFamily: '"Press Start 2P", monospace', fontSize: 8,
          boxShadow: saving ? 'none' : '0 0 18px rgba(245,200,66,0.4)',
          transition: 'box-shadow .2s, background .2s',
          whiteSpace: 'nowrap', flexShrink: 0, letterSpacing: '0.04em',
        }}
      >
        {saving ? '...' : 'ENTRAR ►'}
      </button>
    </Panel>
  );

  // ── MOBILE layout ───────────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <div style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        zIndex: 60,
        pointerEvents: 'auto',
        overflowY: 'auto',
        overflowX: 'hidden',
        WebkitOverflowScrolling: 'touch',
        overscrollBehaviorY: 'contain',
        touchAction: 'pan-y',
      }}>
        {/* Header */}
        <Panel style={{ padding: '5px 10px', display: 'flex', alignItems: 'center', gap: 8, pointerEvents: 'auto', flexShrink: 0 }}>
          <span style={{ fontFamily: '"Press Start 2P", monospace', fontSize: 7, color: '#F5C842', whiteSpace: 'nowrap' }}>DRIP STUDIO</span>
          <DripScoreBar cfg={cfg} />
        </Panel>

        {/* Slot tabs — horizontal scroll */}
        <div style={{
          display: 'flex',
          overflowX: 'auto',
          pointerEvents: 'auto',
          scrollbarWidth: 'none',
          flexShrink: 0,
          WebkitOverflowScrolling: 'touch',
          touchAction: 'pan-x',
        }}>
          {SLOTS.map(s => {
            const active = activeSlot === s.id;
            return (
              <button key={s.id} onClick={() => setActiveSlot(s.id)} style={{
                flexShrink: 0, padding: '6px 8px',
                background: active ? 'rgba(57,255,20,0.1)' : 'rgba(5,5,12,0.9)',
                border: `1px solid ${active ? 'rgba(57,255,20,0.4)' : 'rgba(57,255,20,0.08)'}`,
                color: active ? '#39FF14' : 'rgba(120,120,120,0.6)',
                fontFamily: '"Press Start 2P", monospace', fontSize: 6,
                cursor: 'pointer', outline: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
              }}>
                <span>{s.icon}</span>
              </button>
            );
          })}
        </div>

        {/* Transparent preview area */}
        <div style={{ flex: '0 0 min(28vh, 180px)', pointerEvents: 'none' }} />

        {/* Editor */}
        <Panel style={{
          padding: 10,
          pointerEvents: 'auto',
          flex: '0 0 auto',
          overflow: 'visible',
        }}>
          <SlotEditor slot={activeSlot} cfg={cfg} update={update} />
        </Panel>

        {/* Bottom */}
        <div style={{
          pointerEvents: 'auto',
          position: 'sticky',
          bottom: 0,
          flexShrink: 0,
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          background: 'linear-gradient(180deg, rgba(2,3,10,0) 0%, rgba(2,3,10,0.92) 18%, rgba(2,3,10,1) 100%)',
        }}>
          {bottomBar}
        </div>
      </div>
    );
  }

  // ── DESKTOP layout ──────────────────────────────────────────────────────────
  return (
    <div style={{
      position: 'absolute', inset: 0,
      display: 'grid',
      gridTemplateColumns: '152px 1fr 210px',
      gridTemplateRows: '1fr 54px',
      zIndex: 60,
      pointerEvents: 'none',
    }}>
      {/* ── Header strip (top of left + right panels only) */}

      {/* ── Left: slot list ─────────────────────────────────────────── */}
      <Panel style={{
        gridRow: '1', gridColumn: '1',
        display: 'flex', flexDirection: 'column',
        pointerEvents: 'auto', overflowY: 'auto',
      }}>
        {/* branding */}
        <div style={{ padding: '10px 10px 6px', borderBottom: '1px solid rgba(57,255,20,0.1)' }}>
          <div style={{ fontFamily: '"Press Start 2P", monospace', fontSize: 6, color: '#F5C842', letterSpacing: '0.06em', textShadow: '0 0 10px rgba(245,200,66,0.4)' }}>
            WASPI WORLD
          </div>
          <div style={{ fontFamily: 'Silkscreen, monospace', fontSize: 8, color: 'rgba(57,255,20,0.5)', letterSpacing: '0.1em', marginTop: 4 }}>
            DRIP STUDIO
          </div>
        </div>
        {/* slots */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', paddingTop: 4 }}>
          {SLOTS.map(s => (
            <SlotItem key={s.id} slot={s} active={activeSlot === s.id} cfg={cfg} onClick={() => setActiveSlot(s.id)} />
          ))}
        </div>
      </Panel>

      {/* ── Center: transparent — Phaser avatar shows through ───────── */}
      <div style={{ gridRow: '1', gridColumn: '2', pointerEvents: 'none' }} />

      {/* ── Right: slot editor ───────────────────────────────────────── */}
      <Panel style={{
        gridRow: '1', gridColumn: '3',
        padding: '10px 10px 12px',
        display: 'flex', flexDirection: 'column', gap: 0,
        pointerEvents: 'auto', overflowY: 'auto',
      }}>
        <div style={{ fontFamily: '"Press Start 2P", monospace', fontSize: 6, color: 'rgba(57,255,20,0.5)', letterSpacing: '0.08em', marginBottom: 10 }}>
          {SLOTS.find(s => s.id === activeSlot)?.icon} {SLOTS.find(s => s.id === activeSlot)?.label}
        </div>
        <SlotEditor slot={activeSlot} cfg={cfg} update={update} />
      </Panel>

      {/* ── Bottom bar ──────────────────────────────────────────────── */}
      <div style={{ gridRow: '2', gridColumn: '1 / span 3', pointerEvents: 'auto' }}>
        {bottomBar}
      </div>
    </div>
  );
}
