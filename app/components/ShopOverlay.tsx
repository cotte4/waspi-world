'use client';

import React, { useState } from 'react';
import { getItem, getPhysicalCatalog, type CatalogItem } from '@/src/game/config/catalog';
import { TENKS_PACKS } from '@/src/lib/tenksPacks';

// ── types ─────────────────────────────────────────────────────────────────────
type ShopTab = 'tenks_virtual' | 'physical' | 'tenks_packs' | 'orders';

interface OrderRow {
  id: string;
  created_at: string;
  items: Array<{ product_id: string; size: string }>;
  total: number;
  currency: string;
  status: string;
  discount_code: string | null;
}

export interface ShopOverlayProps {
  isMobile: boolean;
  shopTab: ShopTab;
  onTabChange: (t: ShopTab) => void;
  onClose: () => void;
  clothingItems: CatalogItem[];
  owned: string[];
  equipped: { top?: string; bottom?: string };
  tenks: number | null;
  isAuthenticated: boolean;
  checkoutBusyId: string | null;
  checkoutRedirecting: boolean;
  selectedSize: string;
  onSizeChange: (s: string) => void;
  discountCode: string;
  onDiscountChange: (s: string) => void;
  shopStatus: string;
  orders: OrderRow[];
  ordersLoaded: boolean;
  ordersLoading: boolean;
  onLoadOrders: () => void;
  onBuyVirtual: (item: CatalogItem) => void;
  onEquip: (itemId: string, active: boolean) => void;
  onBuyPhysical: (item: CatalogItem) => void;
  onBuyPack: (packId: string) => void;
}

// ── helpers ───────────────────────────────────────────────────────────────────
const toHex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

const STATUS_COLOR: Record<string, string> = {
  paid: '#39FF14', shipped: '#46B3FF', delivered: '#F5C842',
};
const STATUS_LABEL: Record<string, string> = {
  paid: 'PAGADO', shipped: 'ENVIADO', delivered: 'ENTREGADO',
};

// ── micro components ──────────────────────────────────────────────────────────

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      fontFamily: '"Press Start 2P", monospace', fontSize: 6,
      padding: '2px 5px',
      color,
      border: `1px solid ${color}66`,
      background: `${color}14`,
      letterSpacing: '0.05em',
      whiteSpace: 'nowrap',
      flexShrink: 0,
    }}>
      {label}
    </span>
  );
}

function Tab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        padding: '8px 4px',
        fontFamily: '"Press Start 2P", monospace',
        fontSize: 7,
        color: active ? '#39FF14' : 'rgba(160,160,160,0.55)',
        background: 'transparent',
        border: 'none',
        borderBottom: `2px solid ${active ? '#39FF14' : 'transparent'}`,
        cursor: 'pointer',
        outline: 'none',
        letterSpacing: '0.04em',
        transition: 'color .14s, border-color .14s',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </button>
  );
}

function CoinPrice({ amount }: { amount: number }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#F5C842', fontFamily: '"Press Start 2P", monospace', fontSize: 8 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/assets/sprites/icon_coin_64.png" alt="" width={10} height={10} style={{ imageRendering: 'auto' }} />
      {amount.toLocaleString('es-AR')}
    </span>
  );
}

// ── virtual item card ─────────────────────────────────────────────────────────
function VirtualCard({
  item, owned, equipped, checkoutBusyId, isAuthenticated, onBuy, onEquip,
}: {
  item: CatalogItem;
  owned: boolean;
  equipped: boolean;
  checkoutBusyId: string | null;
  isAuthenticated: boolean;
  onBuy: () => void;
  onEquip: (active: boolean) => void;
}) {
  const busy = checkoutBusyId === item.id;
  const canBuy = isAuthenticated && !owned && !busy && !item.comingSoon;
  const swatchColor = toHex(item.color ?? 0x555555);

  return (
    <div style={{
      display: 'flex', alignItems: 'stretch', gap: 0,
      background: equipped ? 'rgba(57,255,20,0.05)' : 'rgba(255,255,255,0.025)',
      border: `1px solid ${equipped ? 'rgba(57,255,20,0.35)' : 'rgba(255,255,255,0.07)'}`,
      transition: 'border-color .14s',
    }}>
      {/* Color swatch */}
      <div style={{
        width: 48, flexShrink: 0,
        background: swatchColor,
        boxShadow: `inset 0 0 0 1px rgba(0,0,0,0.25)`,
      }} />

      {/* Content */}
      <div style={{ flex: 1, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'Silkscreen, monospace', fontSize: 13, color: '#FFFFFF' }}>{item.name}</span>
          {item.isLimited && <Badge label="LIMITED" color="#FF006E" />}
          {item.comingSoon && <Badge label="SOON" color="#888" />}
          {equipped && <Badge label="PUESTO" color="#39FF14" />}
          {owned && !equipped && <Badge label="TUYO" color="#39FF14" />}
        </div>
        <div style={{ fontFamily: 'Silkscreen, monospace', fontSize: 11, color: 'rgba(255,255,255,0.45)', lineHeight: 1.4 }}>
          {item.description}
        </div>
        <CoinPrice amount={item.priceTenks} />
      </div>

      {/* CTA */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '0 12px', flexShrink: 0 }}>
        {item.comingSoon ? (
          <span style={{ fontFamily: '"Press Start 2P", monospace', fontSize: 6, color: '#555' }}>PRONTO</span>
        ) : owned ? (
          <button
            onClick={() => onEquip(equipped)}
            style={ctaStyle(equipped ? 'rgba(57,255,20,0.2)' : '#39FF14', equipped ? '#39FF14' : '#0a0a0a', false)}
          >
            {equipped ? 'SACARSE' : 'EQUIPAR'}
          </button>
        ) : (
          <button
            onClick={onBuy}
            disabled={!canBuy}
            style={ctaStyle('#F5C842', '#0a0a0a', !canBuy || busy)}
          >
            {busy ? '...' : !isAuthenticated ? 'LOGIN' : 'COMPRAR'}
          </button>
        )}
      </div>
    </div>
  );
}

// ── physical item card ────────────────────────────────────────────────────────
function PhysicalCard({
  item, selectedSize, onSizeChange, discountCode, onDiscountChange,
  checkoutRedirecting, isAuthenticated, onBuy,
}: {
  item: CatalogItem;
  selectedSize: string;
  onSizeChange: (s: string) => void;
  discountCode: string;
  onDiscountChange: (s: string) => void;
  checkoutRedirecting: boolean;
  isAuthenticated: boolean;
  onBuy: () => void;
}) {
  const swatchColor = toHex(item.color ?? 0x555555);
  const [open, setOpen] = useState(false);
  const canBuy = isAuthenticated && !!selectedSize && !checkoutRedirecting;

  return (
    <div style={{
      background: 'rgba(255,255,255,0.025)',
      border: '1px solid rgba(255,255,255,0.07)',
    }}>
      {/* Top row — click to expand */}
      <div
        onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'stretch', cursor: 'pointer' }}
      >
        <div style={{ width: 48, flexShrink: 0, background: swatchColor }} />
        <div style={{ flex: 1, padding: '10px 12px', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 3 }}>
            <span style={{ fontFamily: 'Silkscreen, monospace', fontSize: 13, color: '#FFFFFF' }}>{item.name}</span>
            {item.isLimited && <Badge label="LIMITED" color="#FF006E" />}
          </div>
          <div style={{ fontFamily: 'Silkscreen, monospace', fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>
            {item.description}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', padding: '0 14px', gap: 8, flexShrink: 0 }}>
          <span style={{ fontFamily: '"Press Start 2P", monospace', fontSize: 9, color: '#F5C842' }}>
            ${(item.priceArs ?? 0).toLocaleString('es-AR')}
          </span>
          <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10 }}>{open ? '▲' : '▼'}</span>
        </div>
      </div>

      {/* Expanded: size + coupon + buy */}
      {open && (
        <div style={{ padding: '10px 14px 12px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Sizes */}
          {item.sizes && item.sizes.length > 0 && (
            <div>
              <div style={{ fontFamily: '"Press Start 2P", monospace', fontSize: 6, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.08em', marginBottom: 6 }}>
                TALLE
              </div>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                {item.sizes.map(s => (
                  <button
                    key={s}
                    onClick={() => onSizeChange(selectedSize === s ? '' : s)}
                    style={{
                      fontFamily: '"Press Start 2P", monospace', fontSize: 8,
                      padding: '6px 10px',
                      background: selectedSize === s ? '#F5C842' : 'rgba(255,255,255,0.06)',
                      color: selectedSize === s ? '#0a0a0a' : '#FFFFFF',
                      border: selectedSize === s ? 'none' : '1px solid rgba(255,255,255,0.12)',
                      cursor: 'pointer', outline: 'none',
                      transition: 'background .14s, color .14s',
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Coupon */}
          <div>
            <div style={{ fontFamily: '"Press Start 2P", monospace', fontSize: 6, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.08em', marginBottom: 5 }}>
              CUPÓN (OPCIONAL)
            </div>
            <input
              type="text"
              placeholder="WASPI2026"
              value={discountCode}
              onChange={e => onDiscountChange(e.target.value.toUpperCase())}
              style={{
                width: '100%', boxSizing: 'border-box',
                background: 'rgba(0,0,0,0.5)',
                border: '1px solid rgba(245,200,66,0.18)',
                color: '#F5C842',
                fontFamily: '"Press Start 2P", monospace', fontSize: 8,
                padding: '7px 9px', outline: 'none', letterSpacing: '0.08em',
              }}
            />
          </div>

          <button
            onClick={onBuy}
            disabled={!canBuy}
            style={{ ...ctaStyle('#F5C842', '#0a0a0a', !canBuy), width: '100%', textAlign: 'center' as const }}
          >
            {!isAuthenticated
              ? 'INICIÁ SESIÓN'
              : !selectedSize
                ? 'ELEGÍ UN TALLE'
                : `COMPRAR · $${(item.priceArs ?? 0).toLocaleString('es-AR')} ARS`}
          </button>
        </div>
      )}
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────────
export default function ShopOverlay({
  isMobile, shopTab, onTabChange, onClose,
  clothingItems, owned, equipped, tenks, isAuthenticated,
  checkoutBusyId, checkoutRedirecting,
  selectedSize, onSizeChange, discountCode, onDiscountChange,
  shopStatus, orders, ordersLoaded, ordersLoading, onLoadOrders,
  onBuyVirtual, onEquip, onBuyPhysical, onBuyPack,
}: ShopOverlayProps) {

  const handleTabChange = (t: ShopTab) => {
    onTabChange(t);
    if (t === 'orders' && !ordersLoaded) onLoadOrders();
  };

  return (
    <div
      className="ww-overlay absolute inset-0 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(2px)', zIndex: 70 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="ww-modal"
        style={{
          width: isMobile ? '96%' : 580,
          maxHeight: isMobile ? '90%' : 530,
          display: 'flex', flexDirection: 'column',
          background: 'rgba(7,7,14,0.97)',
          border: '1px solid rgba(245,200,66,0.3)',
          boxShadow: '0 0 40px rgba(0,0,0,0.8), 0 0 0 1px rgba(245,200,66,0.06)',
          backgroundImage: 'repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,0.08) 3px,rgba(0,0,0,0.08) 4px)',
        }}
      >
        {/* ── Header ───────────────────────────────────────────────── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '11px 14px 10px',
          borderBottom: '1px solid rgba(245,200,66,0.12)',
          flexShrink: 0,
        }}>
          <span style={{ fontFamily: '"Press Start 2P", monospace', fontSize: 10, color: '#F5C842', letterSpacing: '0.06em', textShadow: '0 0 12px rgba(245,200,66,0.4)' }}>
            WASPI SHOP
          </span>

          {/* TENKS balance */}
          {tenks !== null && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <CoinPrice amount={tenks} />
            </div>
          )}

          <button
            onClick={onClose}
            style={{
              fontFamily: '"Press Start 2P", monospace', fontSize: 8,
              color: 'rgba(150,150,150,0.6)', background: 'none', border: 'none',
              cursor: 'pointer', padding: '4px 8px',
              transition: 'color .14s',
            }}
          >
            ✕
          </button>
        </div>

        {/* ── Tabs ─────────────────────────────────────────────────── */}
        <div style={{
          display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.06)',
          flexShrink: 0,
        }}>
          <Tab label="VIRTUAL"  active={shopTab === 'tenks_virtual'} onClick={() => handleTabChange('tenks_virtual')} />
          <Tab label="FÍSICA"   active={shopTab === 'physical'}       onClick={() => handleTabChange('physical')} />
          <Tab label="+ TENKS"  active={shopTab === 'tenks_packs'}    onClick={() => handleTabChange('tenks_packs')} />
          <Tab label="ÓRDENES"  active={shopTab === 'orders'}         onClick={() => handleTabChange('orders')} />
        </div>

        {/* ── Content ──────────────────────────────────────────────── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px' }}>

          {/* Virtual clothes */}
          {shopTab === 'tenks_virtual' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontFamily: 'Silkscreen, monospace', fontSize: 11, color: 'rgba(255,255,255,0.38)', marginBottom: 4 }}>
                Comprá con TENKS · Se equipa al instante en tu avatar
              </div>
              {clothingItems.map(item => {
                const isOwned   = owned.includes(item.id);
                const isEquipped = item.slot === 'top' ? equipped.top === item.id : equipped.bottom === item.id;
                return (
                  <VirtualCard
                    key={item.id}
                    item={item}
                    owned={isOwned}
                    equipped={isEquipped}
                    checkoutBusyId={checkoutBusyId}
                    isAuthenticated={isAuthenticated}
                    onBuy={() => onBuyVirtual(item)}
                    onEquip={(active) => onEquip(item.id, active)}
                  />
                );
              })}
            </div>
          )}

          {/* Physical */}
          {shopTab === 'physical' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontFamily: 'Silkscreen, monospace', fontSize: 11, color: 'rgba(255,255,255,0.38)', marginBottom: 4 }}>
                Ropa física WASPI · Pago seguro via Stripe · Envío Argentina 3-5 días
              </div>
              {getPhysicalCatalog().map(item => (
                <PhysicalCard
                  key={item.id}
                  item={item}
                  selectedSize={selectedSize}
                  onSizeChange={onSizeChange}
                  discountCode={discountCode}
                  onDiscountChange={onDiscountChange}
                  checkoutRedirecting={checkoutRedirecting}
                  isAuthenticated={isAuthenticated}
                  onBuy={() => onBuyPhysical(item)}
                />
              ))}
            </div>
          )}

          {/* TENKS packs */}
          {shopTab === 'tenks_packs' && (
            <div>
              <div style={{ fontFamily: 'Silkscreen, monospace', fontSize: 11, color: 'rgba(255,255,255,0.38)', marginBottom: 12 }}>
                Comprá TENKS con ARS · Se acreditan al instante
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${TENKS_PACKS.length}, 1fr)`, gap: 8 }}>
                {TENKS_PACKS.map((pack, idx) => {
                  const popular = idx === 1;
                  return (
                    <div
                      key={pack.id}
                      style={{
                        position: 'relative',
                        padding: '20px 10px 14px',
                        background: popular ? 'rgba(245,200,66,0.07)' : 'rgba(255,255,255,0.03)',
                        border: `1px solid ${popular ? 'rgba(245,200,66,0.5)' : 'rgba(255,255,255,0.08)'}`,
                        boxShadow: popular ? '0 0 18px rgba(245,200,66,0.1)' : 'none',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 6,
                      }}
                    >
                      {popular && (
                        <div style={{
                          position: 'absolute', top: -9, left: '50%', transform: 'translateX(-50%)',
                          fontFamily: '"Press Start 2P", monospace', fontSize: 6,
                          background: '#F5C842', color: '#0a0a0a', padding: '3px 7px', whiteSpace: 'nowrap',
                        }}>
                          POPULAR
                        </div>
                      )}
                      <div style={{ fontFamily: '"Press Start 2P", monospace', fontSize: 12, color: '#F5C842', textShadow: '0 0 10px rgba(245,200,66,0.4)' }}>
                        {pack.tenks.toLocaleString('es-AR')}
                      </div>
                      <div style={{ fontFamily: '"Press Start 2P", monospace', fontSize: 6, color: 'rgba(245,200,66,0.5)', letterSpacing: '0.06em' }}>
                        TENKS
                      </div>
                      <div style={{ fontFamily: 'Silkscreen, monospace', fontSize: 11, color: 'rgba(255,255,255,0.4)', lineHeight: 1.5, flex: 1 }}>
                        {pack.description}
                      </div>
                      <div style={{ fontFamily: 'Silkscreen, monospace', fontSize: 14, color: '#fff', marginTop: 4 }}>
                        ${pack.priceArs.toLocaleString('es-AR')} ARS
                      </div>
                      <button
                        onClick={() => onBuyPack(pack.id)}
                        disabled={checkoutRedirecting || !isAuthenticated}
                        style={{
                          width: '100%',
                          fontFamily: '"Press Start 2P", monospace', fontSize: 7,
                          padding: '9px 4px',
                          background: popular ? '#F5C842' : 'rgba(245,200,66,0.12)',
                          color: popular ? '#0a0a0a' : '#F5C842',
                          border: popular ? 'none' : '1px solid rgba(245,200,66,0.25)',
                          cursor: checkoutRedirecting || !isAuthenticated ? 'default' : 'pointer',
                          opacity: checkoutRedirecting || !isAuthenticated ? 0.55 : 1,
                          letterSpacing: '0.04em', outline: 'none',
                        }}
                      >
                        {!isAuthenticated ? 'LOGIN' : 'COMPRAR'}
                      </button>
                    </div>
                  );
                })}
              </div>
              <div style={{ fontFamily: '"Press Start 2P", monospace', fontSize: 6, color: 'rgba(255,255,255,0.22)', marginTop: 14, lineHeight: 2, letterSpacing: '0.04em', textAlign: 'center' }}>
                TENKS se acreditan automáticamente · Pago seguro via Stripe
              </div>
            </div>
          )}

          {/* Orders */}
          {shopTab === 'orders' && (
            <div>
              {!isAuthenticated ? (
                <EmptyState icon="☠" msg={'Iniciá sesión para\nver tus pedidos.'} />
              ) : ordersLoading ? (
                <div style={{ textAlign: 'center', padding: '28px 0', fontFamily: '"Press Start 2P", monospace', fontSize: 8, color: 'rgba(255,255,255,0.28)', letterSpacing: '0.08em' }}>
                  CARGANDO...
                </div>
              ) : orders.length === 0 ? (
                <EmptyState icon="☠" msg={'Todavía no compraste\nnada físico.'} />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {orders.map(order => {
                    const item = order.items[0];
                    const catalogItem = item ? getItem(item.product_id) : null;
                    const d = new Date(order.created_at);
                    const dateStr = `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
                    const totalArs = Math.round(order.total / 100);
                    const sColor = STATUS_COLOR[order.status] ?? 'rgba(255,255,255,0.4)';
                    const sLabel = STATUS_LABEL[order.status] ?? order.status.toUpperCase();
                    return (
                      <div key={order.id} style={{
                        padding: '10px 12px',
                        background: 'rgba(255,255,255,0.025)',
                        border: '1px solid rgba(255,255,255,0.07)',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8,
                      }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontFamily: 'Silkscreen, monospace', fontSize: 13, color: '#fff', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {catalogItem?.name ?? item?.product_id}
                          </div>
                          <div style={{ fontFamily: '"Press Start 2P", monospace', fontSize: 6, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.04em' }}>
                            {item?.size ? `T.${item.size} · ` : ''}{dateStr}
                          </div>
                          {order.discount_code && (
                            <div style={{ fontFamily: 'Silkscreen, monospace', fontSize: 11, color: '#39FF14', marginTop: 3 }}>↳ {order.discount_code}</div>
                          )}
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ fontFamily: '"Press Start 2P", monospace', fontSize: 9, color: '#F5C842', marginBottom: 6 }}>
                            ${totalArs.toLocaleString('es-AR')}
                          </div>
                          <Badge label={sLabel} color={sColor} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Status bar ───────────────────────────────────────────── */}
        {shopStatus && (
          <div style={{
            padding: '8px 14px',
            borderTop: '1px solid rgba(255,255,255,0.06)',
            fontFamily: '"Press Start 2P", monospace', fontSize: 7,
            color: shopStatus.startsWith('¡') ? '#39FF14' : '#F5C842',
            background: shopStatus.startsWith('¡') ? 'rgba(57,255,20,0.06)' : 'rgba(245,200,66,0.06)',
            letterSpacing: '0.03em', lineHeight: 1.9,
            flexShrink: 0,
          }}>
            {shopStatus}
          </div>
        )}
      </div>
    </div>
  );
}

// ── helpers ───────────────────────────────────────────────────────────────────
function EmptyState({ icon, msg }: { icon: string; msg: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '28px 0' }}>
      <div style={{ fontSize: 28, marginBottom: 10 }}>{icon}</div>
      <div style={{ fontFamily: '"Press Start 2P", monospace', fontSize: 8, color: 'rgba(255,255,255,0.22)', lineHeight: 2.2, letterSpacing: '0.04em', whiteSpace: 'pre-line' }}>
        {msg}
      </div>
    </div>
  );
}

const ctaStyle = (bg: string, color: string, disabled: boolean): React.CSSProperties => ({
  fontFamily: '"Press Start 2P", monospace', fontSize: 7,
  padding: '8px 10px',
  background: disabled ? 'rgba(100,100,100,0.2)' : bg,
  color: disabled ? 'rgba(150,150,150,0.5)' : color,
  border: 'none',
  cursor: disabled ? 'default' : 'pointer',
  outline: 'none',
  letterSpacing: '0.04em',
  whiteSpace: 'nowrap' as const,
  transition: 'opacity .14s',
  opacity: disabled ? 0.6 : 1,
  boxShadow: disabled ? 'none' : `0 0 12px ${bg}44`,
});
