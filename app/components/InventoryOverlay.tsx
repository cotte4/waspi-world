'use client';

import { eventBus, EVENTS } from '@/src/game/config/eventBus';
import { getItem as getCatalogItem } from '@/src/game/config/catalog';
import type { CatalogItem } from '@/src/game/config/catalog';

const WEAPON_TO_ITEM_ID: Record<string, string> = {
  pistol:  'UTIL-GUN-01',
  shotgun: 'UTIL-GUN-SHOT-01',
  smg:     'UTIL-GUN-SMG-01',
  rifle:   'UTIL-GUN-RIFL-01',
  deagle:  'UTIL-GUN-DEAGLE-01',
  cannon:  'UTIL-GUN-CANNON-01',
  raygun:  'UTIL-GUN-GOLD-01',
};

const GUN_UTIL_IDS = Object.values(WEAPON_TO_ITEM_ID);

interface EquippedState {
  top?: string;
  bottom?: string;
  utility?: string[];
}

export interface InventoryOverlayProps {
  isMobile: boolean;
  owned: string[];
  equipped: EquippedState;
  smoking: boolean;
  onToggleSmoke: (next: boolean) => void;
  gunOn: boolean;
  ballOn: boolean;
  activeWeapon?: string;
  passiveUtilityItems: CatalogItem[];
  clothingCatalog: CatalogItem[];
  onEquip: (itemId: string) => void;
  onClose: () => void;
}

/* ── helpers ── */
function hexColor(color?: number) {
  return `#${((color ?? 0x777777) >>> 0).toString(16).padStart(6, '0')}`;
}

function SlotLabel({ slot }: { slot: string }) {
  const map: Record<string, string> = { top: 'TOP', bottom: 'BTM', utility: 'UTIL' };
  return (
    <span style={{
      fontFamily: '"Press Start 2P", monospace',
      fontSize: 6,
      color: 'rgba(255,255,255,0.35)',
      letterSpacing: '0.08em',
      border: '1px solid rgba(255,255,255,0.12)',
      padding: '2px 4px',
    }}>
      {map[slot] ?? slot.toUpperCase()}
    </span>
  );
}

function Badge({ label, color, bg }: { label: string; color: string; bg: string }) {
  return (
    <span style={{
      fontFamily: '"Press Start 2P", monospace',
      fontSize: 6,
      color,
      background: bg,
      border: `1px solid ${color}44`,
      padding: '2px 5px',
      letterSpacing: '0.06em',
    }}>
      {label}
    </span>
  );
}

function ToggleBtn({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        fontFamily: '"Press Start 2P", monospace',
        fontSize: 9,
        padding: '8px 12px',
        border: on ? 'none' : '1px solid rgba(255,255,255,0.15)',
        background: on ? '#39FF14' : 'rgba(255,255,255,0.06)',
        color: on ? '#0E0E14' : '#FFFFFF',
        cursor: 'pointer',
        flexShrink: 0,
        transition: 'background 0.15s',
      }}
    >
      {on ? 'ON' : 'OFF'}
    </button>
  );
}

/* ── section header ── */
function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontFamily: '"Press Start 2P", monospace',
      fontSize: 7,
      color: 'rgba(255,255,255,0.35)',
      letterSpacing: '0.1em',
      marginBottom: 8,
      paddingBottom: 4,
      borderBottom: '1px solid rgba(255,255,255,0.07)',
    }}>
      {children}
    </div>
  );
}

/* ── loadout slot placeholder ── */
function LoadoutSlot({
  label,
  item,
  color,
  active = true,
  icon,
}: {
  label: string;
  item?: CatalogItem;
  color?: number;
  /** When false, item is shown as inactive (owned but toggled off) */
  active?: boolean;
  /** Optional emoji icon override instead of color swatch */
  icon?: string;
}) {
  const filled = !!item;
  const borderColor = filled
    ? active
      ? 'rgba(57,255,20,0.3)'
      : 'rgba(255,255,255,0.18)'
    : 'rgba(255,255,255,0.12)';
  const bgColor = filled
    ? active
      ? 'rgba(57,255,20,0.05)'
      : 'rgba(255,255,255,0.03)'
    : 'rgba(255,255,255,0.02)';

  return (
    <div style={{
      flex: 1,
      padding: '10px 8px',
      border: filled ? `1px solid ${borderColor}` : `1px dashed ${borderColor}`,
      background: bgColor,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 5,
      minHeight: 60,
      opacity: filled && !active ? 0.6 : 1,
      position: 'relative',
    }}>
      <div style={{
        fontFamily: '"Press Start 2P", monospace',
        fontSize: 6,
        color: 'rgba(255,255,255,0.3)',
        letterSpacing: '0.08em',
      }}>
        {label}
      </div>
      {item ? (
        <>
          {icon ? (
            <div style={{ fontSize: 18, lineHeight: 1 }}>{icon}</div>
          ) : (
            <div style={{
              width: 20,
              height: 20,
              background: hexColor(color ?? item.color),
              border: '1px solid rgba(0,0,0,0.4)',
              flexShrink: 0,
            }} />
          )}
          <div style={{
            fontFamily: '"Silkscreen", monospace',
            fontSize: 10,
            color: '#FFFFFF',
            textAlign: 'center',
            lineHeight: 1.3,
          }}>
            {item.name}
          </div>
          {!active && (
            <div style={{
              fontFamily: '"Press Start 2P", monospace',
              fontSize: 5,
              color: 'rgba(255,100,100,0.8)',
              background: 'rgba(255,0,0,0.1)',
              border: '1px solid rgba(255,100,100,0.3)',
              padding: '1px 4px',
              letterSpacing: '0.06em',
            }}>
              OFF
            </div>
          )}
        </>
      ) : (
        <div style={{ fontFamily: '"Silkscreen", monospace', fontSize: 11, color: 'rgba(255,255,255,0.18)' }}>
          vacío
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════ */
export default function InventoryOverlay({
  isMobile,
  owned,
  equipped,
  smoking,
  onToggleSmoke,
  gunOn,
  ballOn,
  activeWeapon = 'pistol',
  passiveUtilityItems,
  clothingCatalog,
  onEquip,
  onClose,
}: InventoryOverlayProps) {
  const ownedClothing = owned
    .map((id) => clothingCatalog.find((i) => i.id === id))
    .filter((item): item is CatalogItem => !!item && item.slot !== 'utility');

  const equippedTop = ownedClothing.find((i) => i.id === equipped.top && i.slot === 'top');
  const equippedBottom = ownedClothing.find((i) => i.id === equipped.bottom && i.slot === 'bottom');

  const cigOwned = owned.includes('UTIL-CIG-01');
  const gunOwned = GUN_UTIL_IDS.some(id => owned.includes(id));
  const ballOwned = owned.includes('UTIL-BALL-01');

  // Active weapon's catalog item (for loadout slot)
  const activeGunItemId = WEAPON_TO_ITEM_ID[activeWeapon] ?? 'UTIL-GUN-01';
  const resolvedGunId = gunOwned && owned.includes(activeGunItemId)
    ? activeGunItemId
    : GUN_UTIL_IDS.find(id => owned.includes(id));
  const activeGunCatalogItem = resolvedGunId ? (getCatalogItem(resolvedGunId) ?? undefined) : undefined;

  return (
    <div
      className="ww-overlay absolute inset-0 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.6)', zIndex: 50 }}
    >
      {/* scanlines overlay */}
      <div style={{
        position: 'absolute',
        inset: 0,
        backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.08) 3px, rgba(0,0,0,0.08) 4px)',
        pointerEvents: 'none',
      }} />

      <div
        style={{
          position: 'relative',
          width: isMobile ? '94%' : 460,
          maxHeight: isMobile ? '92vh' : 560,
          overflowY: 'auto',
          background: 'rgba(10,10,20,0.97)',
          border: '1px solid rgba(57,255,20,0.25)',
          boxShadow: '0 0 32px rgba(57,255,20,0.08), 0 16px 48px rgba(0,0,0,0.7)',
          padding: isMobile ? '16px 12px' : '20px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        {/* corner decorations */}
        {(['tl','tr','bl','br'] as const).map((c) => (
          <div key={c} style={{
            position: 'absolute',
            width: 8, height: 8,
            top: c.startsWith('t') ? 6 : undefined,
            bottom: c.startsWith('b') ? 6 : undefined,
            left: c.endsWith('l') ? 6 : undefined,
            right: c.endsWith('r') ? 6 : undefined,
            borderTop: c.startsWith('t') ? '1px solid rgba(57,255,20,0.5)' : undefined,
            borderBottom: c.startsWith('b') ? '1px solid rgba(57,255,20,0.5)' : undefined,
            borderLeft: c.endsWith('l') ? '1px solid rgba(57,255,20,0.5)' : undefined,
            borderRight: c.endsWith('r') ? '1px solid rgba(57,255,20,0.5)' : undefined,
          }} />
        ))}

        {/* ── HEADER ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              fontFamily: '"Press Start 2P", monospace',
              fontSize: 10,
              color: '#39FF14',
              letterSpacing: '0.06em',
            }}>
              INVENTARIO
            </div>
            <div style={{
              fontFamily: '"Silkscreen", monospace',
              fontSize: 13,
              color: 'rgba(255,255,255,0.35)',
            }}>
              {owned.length} items
            </div>
          </div>
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

        {/* ── LOADOUT ── */}
        <div>
          <SectionHeader>LOADOUT</SectionHeader>
          <div style={{ display: 'flex', gap: 8 }}>
            <LoadoutSlot label="TOP" item={equippedTop} />
            <LoadoutSlot label="BOTTOM" item={equippedBottom} />
            <LoadoutSlot
              label="GUN"
              item={activeGunCatalogItem}
              active={gunOn}
              icon="🔫"
            />
          </div>
        </div>

        {/* ── ROPA ── */}
        <div>
          <SectionHeader>ROPA</SectionHeader>
          {ownedClothing.length === 0 ? (
            <div style={{ fontFamily: '"Silkscreen", monospace', fontSize: 12, color: 'rgba(255,255,255,0.3)', padding: '12px 0' }}>
              No tenés ropa todavía. Comprala en la tienda.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {ownedClothing.map((item) => {
                const isEquipped = item.slot === 'top'
                  ? equipped.top === item.id
                  : equipped.bottom === item.id;
                return (
                  <div
                    key={item.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 10,
                      padding: '8px 10px',
                      border: isEquipped ? '1px solid rgba(57,255,20,0.3)' : '1px solid rgba(255,255,255,0.07)',
                      background: isEquipped ? 'rgba(57,255,20,0.05)' : 'rgba(255,255,255,0.02)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                      <div style={{
                        width: 16, height: 16, flexShrink: 0,
                        background: hexColor(item.color),
                        border: '1px solid rgba(0,0,0,0.35)',
                      }} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <span style={{ fontFamily: '"Silkscreen", monospace', fontSize: 14, color: '#FFFFFF' }}>
                            {item.name}
                          </span>
                          <SlotLabel slot={item.slot} />
                          {item.isLimited && <Badge label="LIMITED" color="#F5C842" bg="rgba(245,200,66,0.08)" />}
                          {isEquipped && <Badge label="PUESTO" color="#39FF14" bg="rgba(57,255,20,0.08)" />}
                        </div>
                        {item.description && (
                          <div style={{ fontFamily: '"Silkscreen", monospace', fontSize: 11, color: 'rgba(255,255,255,0.38)', marginTop: 2 }}>
                            {item.description}
                          </div>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => onEquip(item.id)}
                      style={{
                        fontFamily: '"Press Start 2P", monospace',
                        fontSize: 7,
                        padding: '7px 10px',
                        border: isEquipped ? '1px solid rgba(255,100,100,0.4)' : '1px solid rgba(255,255,255,0.15)',
                        background: isEquipped ? 'rgba(255,60,60,0.15)' : 'rgba(255,255,255,0.06)',
                        color: isEquipped ? '#FF6B6B' : '#FFFFFF',
                        cursor: 'pointer',
                        letterSpacing: '0.04em',
                        flexShrink: 0,
                      }}
                    >
                      {isEquipped ? 'QUITAR' : 'EQUIPAR'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── UTILIDADES ── */}
        <div>
          <SectionHeader>UTILIDADES</SectionHeader>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {/* Smoke — only visible if owned */}
            {cigOwned && (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 10px',
                border: smoking ? '1px solid rgba(57,255,20,0.3)' : '1px solid rgba(255,255,255,0.07)',
                background: smoking ? 'rgba(57,255,20,0.05)' : 'rgba(255,255,255,0.02)',
              }}>
                <div>
                  <div style={{ fontFamily: '"Silkscreen", monospace', fontSize: 14, color: '#FFFFFF' }}>CIGARRILLO</div>
                  <div style={{ fontFamily: '"Silkscreen", monospace', fontSize: 11, color: 'rgba(255,255,255,0.38)', marginTop: 2 }}>
                    Efecto visual al estar idle
                  </div>
                </div>
                <ToggleBtn on={smoking} onClick={() => {
                  const next = !smoking;
                  onToggleSmoke(next);
                  eventBus.emit(EVENTS.AVATAR_SET, { smoke: next });
                }} />
              </div>
            )}

            {/* Gun */}
            {gunOwned && (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 10px',
                border: gunOn ? '1px solid rgba(57,255,20,0.3)' : '1px solid rgba(255,255,255,0.07)',
                background: gunOn ? 'rgba(57,255,20,0.05)' : 'rgba(255,255,255,0.02)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ fontSize: 22, lineHeight: 1, flexShrink: 0 }}>🔫</div>
                  <div>
                    <div style={{ fontFamily: '"Silkscreen", monospace', fontSize: 14, color: '#FFFFFF' }}>PISTOLA 9MM</div>
                    <div style={{ fontFamily: '"Silkscreen", monospace', fontSize: 11, color: 'rgba(255,255,255,0.38)', marginTop: 2 }}>
                      Equipa la pistola — click o F para disparar
                    </div>
                  </div>
                </div>
                <ToggleBtn on={gunOn} onClick={() => onEquip('UTIL-GUN-01')} />
              </div>
            )}

            {/* Ball */}
            {ballOwned && (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 10px',
                border: ballOn ? '1px solid rgba(57,255,20,0.3)' : '1px solid rgba(255,255,255,0.07)',
                background: ballOn ? 'rgba(57,255,20,0.05)' : 'rgba(255,255,255,0.02)',
              }}>
                <div>
                  <div style={{ fontFamily: '"Silkscreen", monospace', fontSize: 14, color: '#FFFFFF' }}>FOOTBALL</div>
                  <div style={{ fontFamily: '"Silkscreen", monospace', fontSize: 11, color: 'rgba(255,255,255,0.38)', marginTop: 2 }}>
                    Pelota activa en tus pies al caminar
                  </div>
                </div>
                <ToggleBtn on={ballOn} onClick={() => onEquip('UTIL-BALL-01')} />
              </div>
            )}

            {/* Passive utility (docs) */}
            {passiveUtilityItems.length > 0 && (
              <>
                <div style={{
                  fontFamily: '"Press Start 2P", monospace',
                  fontSize: 7,
                  color: 'rgba(255,255,255,0.25)',
                  letterSpacing: '0.08em',
                  marginTop: 4,
                }}>
                  DOCUMENTOS
                </div>
                {passiveUtilityItems.map((item) => (
                  <div key={item.id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '8px 10px',
                    border: '1px solid rgba(245,200,66,0.18)',
                    background: 'rgba(245,200,66,0.03)',
                  }}>
                    <div>
                      <div style={{ fontFamily: '"Silkscreen", monospace', fontSize: 13, color: '#FFFFFF' }}>{item.name}</div>
                      {item.description && (
                        <div style={{ fontFamily: '"Silkscreen", monospace', fontSize: 11, color: 'rgba(255,255,255,0.38)', marginTop: 2 }}>
                          {item.description}
                        </div>
                      )}
                    </div>
                    <Badge label="TUYO" color="#F5C842" bg="rgba(245,200,66,0.08)" />
                  </div>
                ))}
              </>
            )}
          </div>
        </div>

        {/* ── FOOTER BUTTONS ── */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => {
              onClose();
              eventBus.emit(EVENTS.OPEN_CREATOR);
            }}
            style={{
              flex: 1,
              fontFamily: '"Press Start 2P", monospace',
              fontSize: 7,
              padding: '12px 10px',
              background: 'rgba(57,255,20,0.12)',
              color: '#39FF14',
              border: '1px solid rgba(57,255,20,0.3)',
              cursor: 'pointer',
              letterSpacing: '0.04em',
            }}
            >
            EDITOR AVATAR
          </button>
          <button
            onClick={onClose}
            style={{
              flex: 1,
              fontFamily: '"Press Start 2P", monospace',
              fontSize: 8,
              padding: '12px 10px',
              background: 'rgba(255,255,255,0.06)',
              color: 'rgba(255,255,255,0.6)',
              border: '1px solid rgba(255,255,255,0.12)',
              cursor: 'pointer',
              letterSpacing: '0.04em',
            }}
          >
            CERRAR  (I)
          </button>
        </div>
      </div>
    </div>
  );
}
