'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { getAuthHeaders } from '@/src/game/systems/authHelper';
import {
  ALL_SKILL_IDS,
  getSkillDef,
  SKILL_XP_THRESHOLDS,
} from '@/src/game/config/skillTrees';
import type { SkillId, SkillTreeDef, MilestoneDef } from '@/src/game/config/skillTrees';

/* ─── Types ────────────────────────────────────────────────────────────────── */

interface SkillPublic {
  skill_id: SkillId;
  xp: number;
  level: number;
  action_count: number;
}

export interface SkillTreeOverlayProps {
  onClose: () => void;
  isMobile: boolean;
  isAuthenticated: boolean;
}

/* ─── Constants ────────────────────────────────────────────────────────────── */

const STYLES = {
  fontHeader: '"Press Start 2P", monospace',
  fontBody: '"Silkscreen", monospace',
  green: '#39FF14',
  gold: '#F5C842',
  blue: '#46B3FF',
  pink: '#FF006E',
  white: '#FFFFFF',
  muted: 'rgba(255,255,255,0.4)',
  bg: 'rgba(14,14,20,0.97)',
  borderColor: '#39FF14',
};

const XP_THRESHOLDS: number[] = [0, 100, 300, 700, 1500];

/** Cumulative XP needed for a given level (1-indexed). Level 1 = 0 XP. */
function xpForLevel(level: number): number {
  return XP_THRESHOLDS[Math.max(0, level - 1)] ?? 1500;
}

/** Progress fraction (0–1) within current level tier. */
function xpProgress(xp: number, currentLevel: number): number {
  if (currentLevel >= 5) return 1;
  const start = xpForLevel(currentLevel);
  const end = xpForLevel(currentLevel + 1);
  if (end <= start) return 1;
  return Math.min((xp - start) / (end - start), 1);
}

const MILESTONE_COLORS: Record<MilestoneDef['rewardType'], string> = {
  title: STYLES.gold,
  stat: STYLES.green,
  cosmetic: STYLES.blue,
};

/* ─── Sub-components ───────────────────────────────────────────────────────── */

function LevelRow({
  level,
  name,
  description,
  type,
  currentLevel,
}: {
  level: number;
  name: string;
  description: string;
  type: 'passive' | 'active';
  currentLevel: number;
}) {
  const unlocked = currentLevel >= level;
  const isNext = currentLevel + 1 === level;

  const borderColor = unlocked
    ? `${STYLES.green}66`
    : isNext
    ? `${STYLES.gold}55`
    : 'rgba(255,255,255,0.08)';

  const iconColor = unlocked ? STYLES.green : isNext ? STYLES.gold : STYLES.muted;

  return (
    <div
      style={{
        display: 'flex',
        gap: 10,
        padding: '8px 10px',
        border: `1px solid ${borderColor}`,
        borderRadius: 3,
        background: unlocked
          ? `rgba(57,255,20,0.04)`
          : isNext
          ? `rgba(245,200,66,0.04)`
          : 'transparent',
        opacity: unlocked ? 1 : isNext ? 0.85 : 0.45,
      }}
    >
      {/* Level number / icon */}
      <div
        style={{
          width: 22,
          height: 22,
          borderRadius: '50%',
          border: `1px solid ${iconColor}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          fontFamily: STYLES.fontHeader,
          fontSize: 7,
          color: iconColor,
          boxShadow: unlocked ? `0 0 6px ${STYLES.green}66` : 'none',
        }}
      >
        {unlocked ? '✓' : level}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: STYLES.fontHeader,
            fontSize: 7,
            color: unlocked ? STYLES.white : isNext ? STYLES.gold : STYLES.muted,
            marginBottom: 3,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          {name}
          <span
            style={{
              fontFamily: STYLES.fontBody,
              fontSize: 9,
              color: type === 'active' ? STYLES.blue : STYLES.green,
              opacity: 0.75,
            }}
          >
            {type === 'active' ? '[A]' : '[P]'}
          </span>
        </div>
        <div
          style={{
            fontFamily: STYLES.fontBody,
            fontSize: 10,
            color: unlocked ? 'rgba(255,255,255,0.65)' : STYLES.muted,
            lineHeight: '1.4',
          }}
        >
          {description}
        </div>
      </div>
    </div>
  );
}

function MilestoneBadge({
  milestone,
  reached,
  actionCount,
}: {
  milestone: MilestoneDef;
  reached: boolean;
  actionCount: number;
}) {
  const color = MILESTONE_COLORS[milestone.rewardType];
  const progress = Math.min(actionCount / milestone.count, 1);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        flex: 1,
        minWidth: 0,
        opacity: reached ? 1 : 0.55,
      }}
    >
      {/* Badge circle */}
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: '50%',
          border: `2px solid ${reached ? color : 'rgba(255,255,255,0.2)'}`,
          background: reached ? `${color}22` : 'transparent',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: STYLES.fontHeader,
          fontSize: 8,
          color: reached ? color : STYLES.muted,
          boxShadow: reached ? `0 0 8px ${color}66` : 'none',
          flexShrink: 0,
        }}
      >
        {reached ? '★' : `${actionCount}/${milestone.count}`}
      </div>

      {/* Mini progress arc (just a thin bar) */}
      {!reached && (
        <div
          style={{
            width: '80%',
            height: 2,
            background: 'rgba(255,255,255,0.1)',
            borderRadius: 1,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${progress * 100}%`,
              height: '100%',
              background: color,
              transition: 'width 0.4s ease',
            }}
          />
        </div>
      )}

      {/* Name */}
      <span
        style={{
          fontFamily: STYLES.fontBody,
          fontSize: 9,
          color: reached ? color : STYLES.muted,
          textAlign: 'center',
          lineHeight: '1.2',
          maxWidth: 70,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
        title={milestone.reward}
      >
        {milestone.name}
      </span>
    </div>
  );
}

function SkillPanel({
  def,
  data,
}: {
  def: SkillTreeDef;
  data: SkillPublic | null;
}) {
  const xp = data?.xp ?? 0;
  const level = data?.level ?? 0;
  const actionCount = data?.action_count ?? 0;
  const isMaxLevel = level >= 5;

  const xpStart = xpForLevel(level);
  const xpEnd = isMaxLevel ? 1500 : xpForLevel(level + 1);
  const pct = isMaxLevel ? 1 : xpProgress(xp, level);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        padding: '12px 14px',
        overflowY: 'auto',
        flex: 1,
      }}
    >
      {/* Skill header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          paddingBottom: 10,
          borderBottom: `1px solid rgba(57,255,20,0.12)`,
        }}
      >
        <span style={{ fontSize: 28, lineHeight: 1 }}>{def.emoji}</span>
        <div style={{ flex: 1 }}>
          <div
            style={{
              fontFamily: STYLES.fontHeader,
              fontSize: 9,
              color: STYLES.green,
              textShadow: `0 0 8px ${STYLES.green}`,
              marginBottom: 3,
            }}
          >
            {def.label.toUpperCase()}
          </div>
          <div
            style={{
              fontFamily: STYLES.fontBody,
              fontSize: 10,
              color: STYLES.muted,
              lineHeight: '1.3',
            }}
          >
            {def.description}
          </div>
        </div>
        {/* Level badge */}
        <div
          style={{
            fontFamily: STYLES.fontHeader,
            fontSize: 7,
            color: level > 0 ? STYLES.gold : STYLES.muted,
            border: `1px solid ${level > 0 ? STYLES.gold : 'rgba(255,255,255,0.15)'}`,
            padding: '4px 8px',
            borderRadius: 3,
            flexShrink: 0,
            boxShadow: level > 0 ? `0 0 8px ${STYLES.gold}44` : 'none',
          }}
        >
          {level === 0 ? 'LV —' : `LV ${level}`}
        </div>
      </div>

      {/* XP Bar */}
      <div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginBottom: 5,
          }}
        >
          <span
            style={{
              fontFamily: STYLES.fontHeader,
              fontSize: 6,
              color: STYLES.muted,
            }}
          >
            {isMaxLevel ? 'NIVEL MÁXIMO' : `XP AL SIGUIENTE NIVEL`}
          </span>
          <span
            style={{
              fontFamily: STYLES.fontHeader,
              fontSize: 6,
              color: isMaxLevel ? STYLES.green : STYLES.white,
            }}
          >
            {isMaxLevel ? `${xp} XP` : `${xp} / ${xpEnd} XP`}
          </span>
        </div>
        <div
          style={{
            height: 6,
            background: 'rgba(0,0,0,0.55)',
            border: `1px solid rgba(57,255,20,0.2)`,
            borderRadius: 3,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${pct * 100}%`,
              height: '100%',
              background: isMaxLevel
                ? `linear-gradient(90deg, ${STYLES.green}99, ${STYLES.green})`
                : STYLES.green,
              transition: 'width 0.5s ease',
              boxShadow: isMaxLevel ? `0 0 6px ${STYLES.green}` : 'none',
            }}
          />
        </div>
        {!isMaxLevel && (
          <div
            style={{
              fontFamily: STYLES.fontBody,
              fontSize: 9,
              color: STYLES.muted,
              marginTop: 3,
            }}
          >
            {xpEnd - xp > 0 ? `Faltan ${xpEnd - xp} XP` : 'Listo para subir'}
          </div>
        )}
      </div>

      {/* Levels */}
      <div>
        <div
          style={{
            fontFamily: STYLES.fontHeader,
            fontSize: 6,
            color: STYLES.muted,
            marginBottom: 8,
            letterSpacing: '0.08em',
          }}
        >
          NIVELES
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {def.levels.map(lvl => (
            <LevelRow
              key={lvl.level}
              level={lvl.level}
              name={lvl.name}
              description={lvl.description}
              type={lvl.type}
              currentLevel={level}
            />
          ))}
        </div>
      </div>

      {/* Milestones */}
      {def.milestones.length > 0 && (
        <div>
          <div
            style={{
              fontFamily: STYLES.fontHeader,
              fontSize: 6,
              color: STYLES.muted,
              marginBottom: 8,
              letterSpacing: '0.08em',
            }}
          >
            HITOS ({actionCount} acciones)
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'space-around' }}>
            {def.milestones.map(m => (
              <MilestoneBadge
                key={m.id}
                milestone={m}
                reached={actionCount >= m.count}
                actionCount={actionCount}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Main Component ───────────────────────────────────────────────────────── */

export default function SkillTreeOverlay({
  onClose,
  isMobile,
  isAuthenticated,
}: SkillTreeOverlayProps) {
  const [activeSkill, setActiveSkill] = useState<SkillId>('mining');
  const [skillData, setSkillData] = useState<SkillPublic[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const fetchingRef = useRef(false);

  const fetchSkills = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    setLoading(true);
    setError(false);
    try {
      const authH = await getAuthHeaders();
      const res = await fetch('/api/skills', { headers: authH });
      if (!res.ok) {
        if (res.status !== 401) setError(true);
        setSkillData([]);
      } else {
        const json = await res.json() as { skills?: SkillPublic[] };
        setSkillData(json.skills ?? []);
      }
    } catch {
      setError(true);
      setSkillData([]);
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  }, []);

  useEffect(() => {
    void fetchSkills();
  }, [fetchSkills]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const getSkillData = (id: SkillId): SkillPublic | null =>
    skillData.find(s => s.skill_id === id) ?? null;

  const panelWidth = isMobile ? '100%' : 700;
  const panelHeight = isMobile ? '100%' : 'min(560px, calc(100% - 60px))';

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 300,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          width: panelWidth,
          height: panelHeight,
          background: STYLES.bg,
          border: `1px solid ${STYLES.borderColor}44`,
          display: 'flex',
          flexDirection: 'column',
          boxShadow: `0 0 40px rgba(57,255,20,0.08), 0 20px 60px rgba(0,0,0,0.7)`,
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {/* Corner decorations */}
        {[
          { top: -1, left: -1 },
          { top: -1, right: -1 },
          { bottom: -1, left: -1 },
          { bottom: -1, right: -1 },
        ].map((pos, i) => (
          <span
            key={i}
            style={{
              position: 'absolute',
              width: 10,
              height: 10,
              borderTop: pos.top !== undefined ? `2px solid ${STYLES.green}` : undefined,
              borderBottom: pos.bottom !== undefined ? `2px solid ${STYLES.green}` : undefined,
              borderLeft: pos.left !== undefined ? `2px solid ${STYLES.green}` : undefined,
              borderRight: pos.right !== undefined ? `2px solid ${STYLES.green}` : undefined,
              ...pos,
              pointerEvents: 'none',
            }}
          />
        ))}

        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px 10px',
            borderBottom: `1px solid ${STYLES.borderColor}22`,
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontFamily: STYLES.fontHeader,
              fontSize: 9,
              color: STYLES.green,
              textShadow: `0 0 10px ${STYLES.green}`,
              letterSpacing: '0.06em',
            }}
          >
            ⚡ ÁRBOL DE HABILIDADES
          </span>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: `1px solid ${STYLES.green}44`,
              color: STYLES.green,
              fontFamily: STYLES.fontHeader,
              fontSize: 8,
              cursor: 'pointer',
              padding: '3px 8px',
              borderRadius: 2,
              lineHeight: 1,
            }}
            aria-label="Cerrar skill tree"
          >
            ✕
          </button>
        </div>

        {/* Auth notice */}
        {!isAuthenticated && (
          <div
            style={{
              fontFamily: STYLES.fontBody,
              fontSize: 9,
              color: STYLES.blue,
              padding: '5px 16px',
              borderBottom: `1px solid rgba(70,179,255,0.15)`,
              flexShrink: 0,
            }}
          >
            Iniciá sesión para guardar tu progresión
          </div>
        )}

        {/* Skill tabs */}
        <div
          style={{
            display: 'flex',
            borderBottom: `1px solid ${STYLES.borderColor}22`,
            flexShrink: 0,
            overflowX: 'auto',
          }}
        >
          {ALL_SKILL_IDS.map(id => {
            const def = getSkillDef(id);
            const data = getSkillData(id);
            const level = data?.level ?? 0;
            const isActive = id === activeSkill;

            return (
              <button
                key={id}
                onClick={() => setActiveSkill(id)}
                style={{
                  flex: 1,
                  minWidth: isMobile ? 44 : 80,
                  padding: isMobile ? '8px 4px' : '9px 8px',
                  background: isActive ? `rgba(57,255,20,0.08)` : 'transparent',
                  border: 'none',
                  borderBottom: isActive
                    ? `2px solid ${STYLES.green}`
                    : '2px solid transparent',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 3,
                  transition: 'background 0.15s',
                }}
              >
                <span style={{ fontSize: isMobile ? 16 : 18, lineHeight: 1 }}>{def.emoji}</span>
                {!isMobile && (
                  <span
                    style={{
                      fontFamily: STYLES.fontHeader,
                      fontSize: 6,
                      color: isActive ? STYLES.green : STYLES.muted,
                      letterSpacing: '0.04em',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {def.label.toUpperCase()}
                  </span>
                )}
                {level > 0 && (
                  <span
                    style={{
                      fontFamily: STYLES.fontHeader,
                      fontSize: 5,
                      color: STYLES.gold,
                      background: `${STYLES.gold}22`,
                      padding: '1px 4px',
                      borderRadius: 2,
                    }}
                  >
                    LV{level}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          {loading ? (
            <div
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: STYLES.fontBody,
                fontSize: 11,
                color: STYLES.muted,
              }}
            >
              Cargando...
            </div>
          ) : error ? (
            <div
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: STYLES.fontBody,
                fontSize: 11,
                color: STYLES.muted,
                padding: 20,
                textAlign: 'center',
              }}
            >
              No se pudo cargar el progreso de habilidades.
            </div>
          ) : (
            <SkillPanel
              def={getSkillDef(activeSkill)}
              data={getSkillData(activeSkill)}
            />
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '6px 16px',
            borderTop: `1px solid ${STYLES.borderColor}18`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontFamily: STYLES.fontHeader,
              fontSize: 5,
              color: STYLES.muted,
              letterSpacing: '0.06em',
            }}
          >
            [A] ACTIVO &nbsp; [P] PASIVO
          </span>
          <span
            style={{
              fontFamily: STYLES.fontHeader,
              fontSize: 5,
              color: STYLES.muted,
            }}
          >
            ESC CERRAR
          </span>
        </div>
      </div>
    </div>
  );
}
