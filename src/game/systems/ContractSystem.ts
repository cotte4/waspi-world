// ContractSystem.ts
// Client-side singleton for weekly contracts. Loads from /api/contracts,
// tracks player actions fire-and-forget, and exposes claim logic.

import type { SkillSystem } from './SkillSystem';
import { eventBus, EVENTS } from '../config/eventBus';
import { initTenks } from './TenksSystem';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type ContractObjective = {
  action: string;
  skill: string;
  quantity: number;
  min_quality?: string;
};

export type Contract = {
  id: string;
  guild_id: string;
  skill_id: string;
  type: string;
  title: string;
  description: string;
  objective: ContractObjective;
  reward_tenks: number;
  reward_xp: number;
  reward_rep: number;
  min_level: number;
  // Player progress
  progress: number;
  completed: boolean;
  reward_claimed: boolean;
};

// ---------------------------------------------------------------------------
// Quality hierarchy for min_quality comparisons
// ---------------------------------------------------------------------------

const QUALITY_HIERARCHY: string[] = ['basic', 'normal', 'good', 'excellent', 'legendary'];

function meetsMinQuality(quality: string, minQuality: string): boolean {
  const qualIdx = QUALITY_HIERARCHY.indexOf(quality);
  const minIdx  = QUALITY_HIERARCHY.indexOf(minQuality);
  if (qualIdx === -1 || minIdx === -1) return true; // unknown tiers: pass through
  return qualIdx >= minIdx;
}

// ---------------------------------------------------------------------------
// ContractSystem
// ---------------------------------------------------------------------------

class ContractSystem {
  private contracts: Contract[] = [];
  private weekId = '';
  private lastPollAt = 0;
  private static readonly POLL_INTERVAL_MS = 60_000;

  // -------------------------------------------------------------------------
  // loadContracts — fetches /api/contracts
  // -------------------------------------------------------------------------

  async loadContracts(): Promise<void> {
    try {
      const res = await fetch('/api/contracts');
      if (!res.ok) return;
      const data = await res.json() as { week_id?: string; contracts?: Contract[] };
      if (Array.isArray(data.contracts)) {
        this.contracts = data.contracts;
        this.weekId = data.week_id ?? '';
      }
      this.lastPollAt = Date.now();
    } catch { /* silent */ }
  }

  // -------------------------------------------------------------------------
  // getContracts — returns all loaded contracts (may be empty)
  // -------------------------------------------------------------------------

  getContracts(): Contract[] {
    return this.contracts;
  }

  // -------------------------------------------------------------------------
  // getWeekId — returns current week identifier
  // -------------------------------------------------------------------------

  getWeekId(): string {
    return this.weekId;
  }

  // -------------------------------------------------------------------------
  // getVisibleContracts — contracts the player can see (skill level >= min_level)
  // -------------------------------------------------------------------------

  getVisibleContracts(skillSystem: SkillSystem): Contract[] {
    return this.contracts.filter((c) => {
      const skillId = c.skill_id as Parameters<SkillSystem['getLevel']>[0];
      return skillSystem.getLevel(skillId) >= c.min_level;
    });
  }

  // -------------------------------------------------------------------------
  // trackAction — fire-and-forget from scenes
  // -------------------------------------------------------------------------

  async trackAction(action: string, skill: string, quality: string): Promise<void> {
    // Find active contracts that match this action + skill
    const matches = this.contracts.filter(
      (c) =>
        !c.completed &&
        c.objective.action === action &&
        c.objective.skill === skill,
    );

    for (const contract of matches) {
      // Check min_quality if specified
      const minQ = contract.objective.min_quality;
      if (minQ && !meetsMinQuality(quality, minQ)) continue;

      try {
        const res = await fetch('/api/contracts/progress', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contract_id: contract.id,
            action,
            skill,
            quality,
          }),
        });
        if (!res.ok) continue;

        const data = await res.json() as {
          completed?: boolean;
          progress?: number;
          notice?: string;
        };

        // Update local state
        if (typeof data.progress === 'number') {
          contract.progress = data.progress;
        }

        if (data.completed === true) {
          contract.completed = true;
          const notice = data.notice ?? `Contrato completado: ${contract.title}`;
          eventBus.emit(EVENTS.UI_NOTICE, { message: notice, color: '#F5C842' });
        }
      } catch { /* fail silently — never crash */ }
    }
  }

  // -------------------------------------------------------------------------
  // claimReward — claim a completed contract's reward
  // -------------------------------------------------------------------------

  async claimReward(
    contractId: string,
  ): Promise<{ success: boolean; reward_tenks?: number; notice?: string; error?: string }> {
    try {
      const res = await fetch('/api/contracts/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contract_id: contractId }),
      });
      const data = await res.json() as {
        reward_tenks?: number;
        notice?: string;
        error?: string;
      };

      if (res.ok) {
        // Update local state
        const contract = this.contracts.find((c) => c.id === contractId);
        if (contract) contract.reward_claimed = true;

        // Sync TENKS balance if the API returned a new value
        if (typeof data.reward_tenks === 'number') {
          initTenks(data.reward_tenks, { preferStored: false });
        }

        return { success: true, reward_tenks: data.reward_tenks, notice: data.notice };
      }

      return { success: false, error: data.error };
    } catch {
      return { success: false, error: 'Error de red.' };
    }
  }

  // -------------------------------------------------------------------------
  // pollIfStale — call from scene update(); polls at most once per interval
  // -------------------------------------------------------------------------

  pollIfStale(): void {
    if (Date.now() - this.lastPollAt > ContractSystem.POLL_INTERVAL_MS) {
      void this.loadContracts();
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton exports
// ---------------------------------------------------------------------------

let _instance: ContractSystem | null = null;

export function getContractSystem(): ContractSystem {
  if (!_instance) _instance = new ContractSystem();
  return _instance;
}

export function initContractSystem(): Promise<void> {
  return getContractSystem().loadContracts();
}
