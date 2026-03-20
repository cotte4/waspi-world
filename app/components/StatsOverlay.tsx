'use client';

import type { PlayerStats } from '@/src/game/systems/StatsSystem';

export interface StatsOverlayProps {
  isMobile: boolean;
  statsLoading: boolean;
  statsData: PlayerStats | null;
  isAuthenticated: boolean;
  onClose: () => void;
}

// ── micro components ───────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  accentColor,
  bgAlpha = 0.08,
  borderAlpha = 0.18,
}: {
  label: string;
  value: string | number;
  accentColor: string;
  bgAlpha?: number;
  borderAlpha?: number;
}) {
  // Parse hex color to extract rgb components for rgba()
  const hex = accentColor.replace('#', '');
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);

  return (
    <div
      style={{
        background: `rgba(${r},${g},${b},${bgAlpha})`,
        border: `1px solid rgba(${r},${g},${b},${borderAlpha})`,
        borderLeft: `3px solid rgba(${r},${g},${b},0.6)`,
        padding: '8px 10px',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}
    >
      <div
        style={{
          fontFamily: '"Silkscreen", monospace',
          fontSize: 10,
          color: 'rgba(255,255,255,0.45)',
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: '"Silkscreen", monospace',
          fontSize: 18,
          color: accentColor,
          lineHeight: 1.1,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function SectionHeader({
  icon,
  label,
  color,
}: {
  icon: string;
  label: string;
  color: string;
}) {
  const hex = color.replace('#', '');
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);

  return (
    <div
      style={{
        fontFamily: '"Press Start 2P", monospace',
        fontSize: 7,
        color,
        marginBottom: 10,
        letterSpacing: '0.08em',
        textShadow: `0 0 8px rgba(${r},${g},${b},0.7)`,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
      }}
    >
      <span>{icon}</span>
      <span>{label}</span>
    </div>
  );
}

// ── main component ─────────────────────────────────────────────────────────────

export default function StatsOverlay({
  isMobile,
  statsLoading,
  statsData,
  isAuthenticated,
  onClose,
}: StatsOverlayProps) {
  function handleBackdropClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <div
      className="ww-overlay absolute inset-0 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.6)', zIndex: 20 }}
      onClick={handleBackdropClick}
    >
      {/* CRT scanlines */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage:
            'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.08) 3px, rgba(0,0,0,0.08) 4px)',
          pointerEvents: 'none',
        }}
      />

      {/* Panel */}
      <div
        style={{
          position: 'relative',
          width: isMobile ? '94%' : 560,
          maxHeight: isMobile ? '88vh' : 520,
          background: 'rgba(10,10,18,0.97)',
          border: '1px solid rgba(70,179,255,0.35)',
          boxShadow:
            '0 0 28px rgba(70,179,255,0.08), 0 10px 40px rgba(0,0,0,0.6)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* L-shaped corner decorations — blue neon accent */}
        {(['tl', 'tr', 'bl', 'br'] as const).map((c) => (
          <div
            key={c}
            style={{
              position: 'absolute',
              width: 8,
              height: 8,
              top: c.startsWith('t') ? 6 : undefined,
              bottom: c.startsWith('b') ? 6 : undefined,
              left: c.endsWith('l') ? 6 : undefined,
              right: c.endsWith('r') ? 6 : undefined,
              borderTop: c.startsWith('t')
                ? '1px solid rgba(70,179,255,0.5)'
                : undefined,
              borderBottom: c.startsWith('b')
                ? '1px solid rgba(70,179,255,0.5)'
                : undefined,
              borderLeft: c.endsWith('l')
                ? '1px solid rgba(70,179,255,0.5)'
                : undefined,
              borderRight: c.endsWith('r')
                ? '1px solid rgba(70,179,255,0.5)'
                : undefined,
            }}
          />
        ))}

        {/* ── HEADER ── */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 16px 10px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontFamily: '"Press Start 2P", monospace',
              fontSize: 10,
              color: '#46B3FF',
              letterSpacing: '0.06em',
              textShadow: '0 0 10px rgba(70,179,255,0.5)',
            }}
          >
            ESTADÍSTICAS
          </span>
          <button
            onClick={onClose}
            style={{
              fontFamily: '"Press Start 2P", monospace',
              fontSize: 8,
              color: 'rgba(255,255,255,0.35)',
              background: 'none',
              border: '1px solid rgba(255,255,255,0.1)',
              padding: '5px 9px',
              cursor: 'pointer',
              letterSpacing: '0.06em',
            }}
          >
            ESC
          </button>
        </div>

        {/* ── BODY ── */}
        <div
          style={{
            overflowY: 'auto',
            padding: '14px 16px 18px',
            flex: 1,
          }}
        >
          {statsLoading ? (
            <LoadingState />
          ) : !statsData ? (
            <EmptyState isAuthenticated={isAuthenticated} />
          ) : (
            <StatsGrid stats={statsData} />
          )}
        </div>
      </div>
    </div>
  );
}

// ── loading state ──────────────────────────────────────────────────────────────

function LoadingState() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: 40,
        gap: 12,
      }}
    >
      <div
        style={{
          fontFamily: '"Press Start 2P", monospace',
          fontSize: 9,
          color: '#46B3FF',
          letterSpacing: '0.12em',
          animation: 'pulse 1.2s ease-in-out infinite',
          textShadow: '0 0 10px rgba(70,179,255,0.6)',
        }}
      >
        CARGANDO...
      </div>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>
    </div>
  );
}

// ── empty state ────────────────────────────────────────────────────────────────

function EmptyState({ isAuthenticated }: { isAuthenticated: boolean }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: 40,
        gap: 10,
      }}
    >
      <span style={{ fontSize: 28, lineHeight: 1 }}>☠</span>
      <div
        style={{
          fontFamily: '"Silkscreen", monospace',
          fontSize: 12,
          color: 'rgba(255,255,255,0.4)',
          textAlign: 'center',
          maxWidth: 280,
          lineHeight: 1.6,
        }}
      >
        {isAuthenticated
          ? 'No se pudieron cargar tus stats históricas.'
          : 'Iniciá sesión para guardar y ver tus stats históricas.'}
      </div>
    </div>
  );
}

// ── stats grid ─────────────────────────────────────────────────────────────────

function StatsGrid({ stats: s }: { stats: PlayerStats }) {
  const kd =
    s.deaths > 0
      ? (s.zombie_kills / s.deaths).toFixed(2)
      : s.zombie_kills.toString();
  const basketPct =
    s.basket_shots > 0
      ? Math.round((s.basket_makes / s.basket_shots) * 100)
      : 0;
  const hrsPlayed = (s.time_played_seconds / 3600).toFixed(1);
  const kmWalked = (s.distance_walked / 50000).toFixed(2);

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      {/* COMBATE */}
      <div>
        <SectionHeader icon="⚔" label="COMBATE" color="#FF6B6B" />
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: 8,
          }}
        >
          <StatCard label="Zombies eliminados" value={s.zombie_kills} accentColor="#FF6B6B" />
          <StatCard label="Muertes" value={s.deaths} accentColor="#FF6B6B" />
          <StatCard label="Mejor racha" value={s.kill_streak_best} accentColor="#FF6B6B" />
          <StatCard label="K/D ratio" value={kd} accentColor="#FF6B6B" />
        </div>
      </div>

      {/* ECONOMÍA */}
      <div>
        <SectionHeader icon="◆" label="ECONOMÍA" color="#F5C842" />
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 8,
          }}
        >
          <StatCard label="TENKS ganados" value={s.tenks_earned} accentColor="#F5C842" />
          <StatCard label="TENKS gastados" value={s.tenks_spent} accentColor="#F5C842" />
          <StatCard
            label="Balance"
            value={s.tenks_earned - s.tenks_spent}
            accentColor="#F5C842"
          />
        </div>
      </div>

      {/* EXPLORACIÓN */}
      <div>
        <SectionHeader icon="◉" label="EXPLORACIÓN" color="#39FF14" />
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: 8,
          }}
        >
          <StatCard label="Horas jugadas" value={hrsPlayed} accentColor="#39FF14" />
          <StatCard label="KM caminados" value={kmWalked} accentColor="#39FF14" />
          <StatCard label="NPCs hablados" value={s.npcs_talked_to} accentColor="#39FF14" />
          <StatCard label="Zonas visitadas" value={s.zones_visited.length} accentColor="#39FF14" />
        </div>
      </div>

      {/* MINIJUEGOS */}
      <div>
        <SectionHeader icon="🎮" label="MINIJUEGOS" color="#9B59F5" />
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: 8,
          }}
        >
          <StatCard
            label="Basket — mejor score"
            value={s.basket_best_score}
            accentColor="#9B59F5"
          />
          <StatCard
            label={`Basket — encestes ${basketPct}%`}
            value={`${s.basket_makes}/${s.basket_shots}`}
            accentColor="#9B59F5"
          />
          <StatCard label="Penalty — goles" value={s.penalty_goals} accentColor="#9B59F5" />
          <StatCard
            label="Penales W/L"
            value={`${s.penalty_wins}/${s.penalty_losses}`}
            accentColor="#9B59F5"
          />
        </div>
      </div>
    </div>
  );
}
