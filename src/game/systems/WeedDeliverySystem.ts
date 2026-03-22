// WeedDeliverySystem.ts
// Manages the 3 daily Weed Delivery NPC orders.
// Cooldown per NPC stored in-memory (loaded from server on init).
// TENKS reward and cooldown enforcement are both server-side via /api/weed/deliver.

import { getAuthHeaders } from './authHelper';
import { fetchWithTimeout } from '../../lib/fetchWithTimeout';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type WeedStrainName = 'SATIVA VERDE' | 'INDICA OSCURA' | 'HIBRIDA DORADA';
export type WeedQualityTier = 'normal' | 'good' | 'excellent';

export type WeedOrder = {
  npcId: WeedNpcId;
  strainName: WeedStrainName;
  minQuality: WeedQualityTier;
  rewardBase: number;
};

export type WeedDeliverResult = {
  tenks_earned: number;
  xp_earned: number;
  notice: string;
};

export type WeedNpcId = 'dealer_1' | 'dealer_2' | 'dealer_3';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const VALID_NPC_IDS: WeedNpcId[] = ['dealer_1', 'dealer_2', 'dealer_3'];
const STRAINS: WeedStrainName[] = ['SATIVA VERDE', 'INDICA OSCURA', 'HIBRIDA DORADA'];
const QUALITIES: WeedQualityTier[] = ['normal', 'good', 'excellent'];
const QUALITY_REWARDS: Record<WeedQualityTier, number> = {
  normal: 200,
  good: 400,
  excellent: 800,
};
const COOLDOWN_MS = 24 * 60 * 60 * 1000;
const WEED_LEVEL_REQUIRED = 3;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns an integer in [0, max) seeded deterministically from (date string + npcId).
 * Deterministic per calendar day so all players see the same rotation.
 */
function seededIndex(seed: string, max: number): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return hash % max;
}

function todayDateString(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
}

// In-memory cooldown map: npcId → epoch ms of last delivery (loaded from server on init)
const cooldownMap = new Map<WeedNpcId, number>();

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let instance: WeedDeliverySystem | null = null;

export function getWeedDeliverySystem(): WeedDeliverySystem {
  if (!instance) instance = new WeedDeliverySystem();
  return instance;
}

// ---------------------------------------------------------------------------
// WeedDeliverySystem
// ---------------------------------------------------------------------------

export class WeedDeliverySystem {
  /**
   * Returns the daily order for the given NPC (deterministic by date + npcId).
   * Returns null if the NPC is on cooldown (already delivered today).
   */
  getOrder(npcId: WeedNpcId): WeedOrder | null {
    if (this.isOnCooldown(npcId)) return null;

    const dateStr = todayDateString();
    const strainIdx = seededIndex(`${dateStr}_${npcId}_strain`, STRAINS.length);
    const qualityIdx = seededIndex(`${dateStr}_${npcId}_quality`, QUALITIES.length);

    const strainName = STRAINS[strainIdx];
    const minQuality = QUALITIES[qualityIdx];

    return {
      npcId,
      strainName,
      minQuality,
      rewardBase: QUALITY_REWARDS[minQuality],
    };
  }

  isOnCooldown(npcId: WeedNpcId): boolean {
    const deliveredAt = cooldownMap.get(npcId);
    if (deliveredAt === undefined) return false;
    return Date.now() - deliveredAt < COOLDOWN_MS;
  }

  markDelivered(npcId: WeedNpcId): void {
    cooldownMap.set(npcId, Date.now());
  }

  /**
   * Load server-authoritative cooldowns into the in-memory map.
   * Call once when entering VecindadScene with an authenticated user.
   */
  async initCooldownsFromServer(): Promise<void> {
    try {
      const authH = await getAuthHeaders();
      if (!authH.Authorization) return;

      const res = await fetchWithTimeout('/api/weed/cooldowns', { headers: authH }, 6000);
      if (!res.ok) return;

      const json = await res.json() as { cooldowns?: Record<string, number> } | null;
      if (!json?.cooldowns) return;

      for (const npcId of VALID_NPC_IDS) {
        const ts = json.cooldowns[npcId];
        if (typeof ts === 'number' && ts > 0) {
          cooldownMap.set(npcId, ts);
        }
      }
    } catch {
      // Network error — cooldowns stay at current in-memory state (conservative: no block)
    }
  }

  /**
   * Returns true if the player has the required Weed level (Lv3+) to interact.
   */
  canInteract(playerWeedLevel: number): boolean {
    return playerWeedLevel >= WEED_LEVEL_REQUIRED;
  }

  /**
   * Calls the server-side delivery endpoint.
   * Returns the result or throws on network/auth failure.
   */
  async deliver(
    npcId: WeedNpcId,
    strainName: WeedStrainName,
    quality: WeedQualityTier,
  ): Promise<WeedDeliverResult> {
    const authH = await getAuthHeaders();
    const res = await fetchWithTimeout('/api/weed/deliver', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authH },
      body: JSON.stringify({ npc_id: npcId, strain_name: strainName, quality }),
    }, 8000);

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({ error: 'Error de red' })) as { error?: string };
      throw new Error(errBody.error ?? `HTTP ${res.status}`);
    }

    const json = await res.json() as WeedDeliverResult;
    return json;
  }

  /** Returns all valid NPC IDs. */
  getAllNpcIds(): WeedNpcId[] {
    return [...VALID_NPC_IDS];
  }

  /** Returns the minimum quality label for display. */
  qualityLabel(q: WeedQualityTier): string {
    const labels: Record<WeedQualityTier, string> = {
      normal: 'NORMAL',
      good: 'BUENA',
      excellent: 'EXCELENTE',
    };
    return labels[q];
  }
}
