'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { eventBus, EVENTS } from '@/src/game/config/eventBus';
import { CATALOG } from '@/src/game/config/catalog';
import { getTenksBalance, initTenks } from '@/src/game/systems/TenksSystem';
import { getInventory } from '@/src/game/systems/InventorySystem';
import { supabase, isConfigured } from '@/src/lib/supabase';
import type { PlayerState } from '@/src/lib/playerState';

const S = {
  bg: '#0E0E14',
  panel: '#090e1a',
  border: '#46B3FF',
  gold: '#F5C842',
  fontHud: '"Press Start 2P", monospace',
  fontSilk: '"Silkscreen", monospace',
  green: '#39FF14',
  red: '#FF5A5A',
  muted: '#6E7B95',
  text: '#9DBDFF',
} as const;

const GUN_ITEMS = CATALOG.filter((item) => item.id.startsWith('UTIL-GUN'));

async function getSessionToken(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token ?? null;
}

async function syncTenksFromServer(token: string): Promise<number | null> {
  const res = await fetch('/api/player/tenks', {
    headers: { Authorization: `Bearer ${token}` },
  }).catch(() => null);
  if (!res?.ok) return null;
  const json = await res.json().catch(() => null) as { balance?: number } | null;
  if (typeof json?.balance !== 'number') return null;
  initTenks(json.balance);
  return json.balance;
}

async function buyGunItem(
  itemId: string,
): Promise<{ success: boolean; message: string }> {
  const item = CATALOG.find((i) => i.id === itemId);
  if (item?.comingSoon) {
    return { success: false, message: 'Ese arma todavía no está implementada.' };
  }

  if (!supabase || !isConfigured) {
    return { success: false, message: 'Tenés que iniciar sesión para gastar TENKS.' };
  }

  const token = await getSessionToken();
  if (!token) {
    return { success: false, message: 'Tenés que estar logueado para comprar.' };
  }

  const res = await fetch('/api/shop/buy', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ itemId }),
  }).catch(() => null);

  if (!res?.ok) {
    const err = await res?.json().catch(() => null) as { error?: string } | null;
    await syncTenksFromServer(token);
    return { success: false, message: err?.error ?? 'Error al comprar. Intentá de nuevo.' };
  }

  const result = await res.json() as {
    player?: PlayerState;
    notice?: string;
  };

  if (result.player) {
    eventBus.emit(EVENTS.PLAYER_STATE_APPLY, result.player);
  } else {
    await syncTenksFromServer(token);
  }

  return { success: true, message: result.notice ?? 'Compra completada.' };
}

export interface GunShopOverlayProps {
  isMobile: boolean;
}

export default function GunShopOverlay({ isMobile }: GunShopOverlayProps) {
  const [open, setOpen] = useState(false);
  const [balance, setBalance] = useState(0);
  const [owned, setOwned] = useState<string[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [resultMap, setResultMap] = useState<Record<string, 'ok' | 'err'>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimerRef = useRef<number | null>(null);

  const refreshState = useCallback(() => {
    setBalance(getTenksBalance());
    setOwned(getInventory().owned);
  }, []);

  useEffect(() => {
    const offOpen = eventBus.on(EVENTS.GUN_SHOP_OPEN, () => {
      refreshState();
      setResultMap({});
      setOpen(true);
    });
    const offClose = eventBus.on(EVENTS.GUN_SHOP_CLOSE, () => setOpen(false));
    return () => { offOpen(); offClose(); };
  }, [refreshState]);

  useEffect(() => {
    if (!open) return;
    const off = eventBus.on(EVENTS.TENKS_CHANGED, () => setBalance(getTenksBalance()));
    return off;
  }, [open]);

  const handleClose = useCallback(() => {
    setOpen(false);
    eventBus.emit(EVENTS.GUN_SHOP_CLOSE);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, handleClose]);

  useEffect(() => () => {
    if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
  }, []);

  const showNotice = useCallback((msg: string) => {
    setNotice(msg);
    if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = window.setTimeout(() => setNotice(null), 2800);
  }, []);

  const handleBuy = useCallback(async (itemId: string) => {
    setBusyId(itemId);
    const result = await buyGunItem(itemId);
    setBusyId(null);
    if (result.success) {
      setResultMap((prev) => ({ ...prev, [itemId]: 'ok' }));
      refreshState();
    } else {
      setResultMap((prev) => ({ ...prev, [itemId]: 'err' }));
      showNotice(result.message);
      window.setTimeout(() => {
        setResultMap((prev) => {
          const next = { ...prev };
          delete next[itemId];
          return next;
        });
      }, 1400);
    }
  }, [refreshState, showNotice]);

  if (!open) return null;

  const maxW = isMobile ? '100%' : 560;

  return (
    <div
      className="ww-overlay absolute inset-0 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.82)', zIndex: 800 }}
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      {notice && (
        <div style={{
          position: 'absolute',
          top: 24,
          left: '50%',
          transform: 'translateX(-50%)',
          fontFamily: S.fontHud,
          fontSize: 8,
          color: '#000',
          background: S.gold,
          padding: '6px 16px',
          zIndex: 810,
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
        }}>
          {notice}
        </div>
      )}

      <div style={{
        background: S.panel,
        border: `2px solid ${S.border}`,
        borderRadius: 12,
        width: maxW,
        maxWidth: '96vw',
        maxHeight: '88vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        position: 'relative',
      }}>
        {/* Corner accents */}
        {([
          { top: 0, left: 0, borderRight: 'none', borderBottom: 'none' },
          { top: 0, right: 0, borderLeft: 'none', borderBottom: 'none' },
          { bottom: 0, left: 0, borderRight: 'none', borderTop: 'none' },
          { bottom: 0, right: 0, borderLeft: 'none', borderTop: 'none' },
        ] as React.CSSProperties[]).map((style, i) => (
          <div key={i} style={{
            position: 'absolute',
            width: 14,
            height: 14,
            border: `2px solid #8ED8FF`,
            ...style,
          }} />
        ))}

        {/* Header */}
        <div style={{
          background: 'rgba(70,179,255,0.06)',
          borderBottom: `1px solid rgba(70,179,255,0.3)`,
          padding: '14px 20px 10px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div>
            <div style={{ fontFamily: S.fontHud, fontSize: 11, color: S.border, letterSpacing: 1 }}>
              ARMS DEALER
            </div>
            <div style={{ fontFamily: S.fontSilk, fontSize: 9, color: S.text, marginTop: 4 }}>
              UTILITIES • TENKS
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{
              fontFamily: S.fontSilk,
              fontSize: 11,
              color: S.gold,
              background: 'rgba(245,200,66,0.08)',
              border: `1px solid rgba(245,200,66,0.3)`,
              borderRadius: 6,
              padding: '4px 10px',
            }}>
              🪙 {balance.toLocaleString('es-AR')} T
            </div>
            <button
              onClick={handleClose}
              style={{
                fontFamily: S.fontHud,
                fontSize: 10,
                color: S.red,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '2px 6px',
                lineHeight: 1,
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Weapon list */}
        <div style={{ overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {GUN_ITEMS.map((item) => {
            const isOwned = owned.includes(item.id);
            const isBusy = busyId === item.id;
            const result = resultMap[item.id];
            const comingSoon = !!item.comingSoon;

            const borderColor = isOwned ? S.green : comingSoon ? '#2B4B7A' : S.border;
            const bgAlpha = isOwned ? 0.35 : comingSoon ? 0.15 : 0.6;

            return (
              <div key={item.id} style={{
                background: `rgba(18,26,45,${bgAlpha})`,
                border: `1px solid ${borderColor}`,
                borderRadius: 8,
                padding: '12px 14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                opacity: comingSoon ? 0.6 : 1,
              }}>
                {/* Left: name + desc */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontFamily: S.fontHud,
                    fontSize: isMobile ? 7 : 8,
                    color: comingSoon ? S.muted : item.isLimited ? S.gold : '#ffffff',
                    marginBottom: 5,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    flexWrap: 'wrap',
                  }}>
                    {item.name}
                    {item.isLimited && !comingSoon && (
                      <span style={{ color: S.gold, fontSize: 7 }}>★ LIMITED</span>
                    )}
                    {isOwned && (
                      <span style={{
                        fontFamily: S.fontHud,
                        fontSize: 5,
                        color: S.green,
                        background: '#001100',
                        border: `1px solid ${S.green}`,
                        borderRadius: 3,
                        padding: '1px 4px',
                      }}>OWNED</span>
                    )}
                  </div>
                  <div style={{
                    fontFamily: S.fontSilk,
                    fontSize: 9,
                    color: comingSoon ? '#5A6885' : '#8DA6D4',
                    lineHeight: 1.4,
                  }}>
                    {item.description ?? ''}
                  </div>
                </div>

                {/* Right: price + action */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                  {!isOwned && !comingSoon && (
                    <div style={{ fontFamily: S.fontSilk, fontSize: 10, color: S.gold }}>
                      {item.priceTenks.toLocaleString('es-AR')} T
                    </div>
                  )}

                  {comingSoon && (
                    <div style={{ fontFamily: S.fontHud, fontSize: 7, color: S.muted }}>SOON</div>
                  )}

                  {isOwned && (
                    <div style={{ fontFamily: S.fontHud, fontSize: 7, color: S.green }}>OWNED</div>
                  )}

                  {!isOwned && !comingSoon && (
                    <button
                      disabled={isBusy}
                      onClick={() => { void handleBuy(item.id); }}
                      style={{
                        fontFamily: S.fontHud,
                        fontSize: 7,
                        color: result === 'ok' ? S.green : result === 'err' ? S.red : S.border,
                        background: '#0A1428',
                        border: `1px solid ${result === 'ok' ? S.green : result === 'err' ? S.red : S.border}`,
                        borderRadius: 4,
                        padding: '5px 10px',
                        cursor: isBusy ? 'not-allowed' : 'pointer',
                        opacity: isBusy ? 0.7 : 1,
                        whiteSpace: 'nowrap',
                        minWidth: 80,
                        textAlign: 'center',
                      }}
                    >
                      {isBusy ? '...' : result === 'ok' ? '✓ LISTO' : result === 'err' ? 'ERROR' : 'COMPRAR'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{
          borderTop: `1px solid rgba(70,179,255,0.2)`,
          padding: '8px 16px',
          fontFamily: S.fontHud,
          fontSize: 6,
          color: '#4F6D9D',
          textAlign: 'center',
          flexShrink: 0,
        }}>
          ESC CIERRA  •  CUSTOM LOADOUTS • MODS • STREET-LEGAL? MAYBE.
        </div>
      </div>
    </div>
  );
}


