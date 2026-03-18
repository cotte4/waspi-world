// MasterySystem.ts
// Client-side singleton that tracks mastery points and unlocked mastery nodes
// for each of the 6 skills. Syncs with /api/mastery endpoints.
// All API failures are caught silently so the game never crashes.

import type { SkillId } from './SkillSystem';
import { MASTERY_TREES } from '../config/masteryTrees';

export type MasteryNodeEffect = {
  stat: string;
  value: number;
  mode: 'percent' | 'flat';
};

export type MasteryNodeDef = {
  id: string;
  skill_id: SkillId;
  tier: 1 | 2 | 3;
  name: string;
  description: string;
  mp_cost: number;
  requires: string[];   // node IDs that must be unlocked first
  effect: MasteryNodeEffect;
};

export type MasteryTree = {
  skill_id: SkillId;
  nodes: MasteryNodeDef[];
};

// ---------------------------------------------------------------------------
// Internal state type
// ---------------------------------------------------------------------------

type MasterySkillData = {
  skill_id: SkillId;
  mp: number;
  unlocked: Set<string>;
};

// ---------------------------------------------------------------------------
// API response shapes
// ---------------------------------------------------------------------------

type ApiMasterySkill = {
  skill_id: string;
  mp: number;
  unlocked: string[];
};

type EarnMpResponse = {
  awarded: boolean;
  new_mp: number;
};

type UnlockNodeResponse = {
  success: boolean;
  new_mp?: number;
  error?: string;
};

// ---------------------------------------------------------------------------
// Ordered list of all skill IDs
// ---------------------------------------------------------------------------

const ALL_SKILL_IDS: SkillId[] = [
  'mining',
  'fishing',
  'gardening',
  'cooking',
  'gym',
  'weed',
];

// ---------------------------------------------------------------------------
// MasterySystem class
// ---------------------------------------------------------------------------

export class MasterySystem {
  private data: Map<SkillId, MasterySkillData> = new Map();
  private loaded = false;

  // -------------------------------------------------------------------------
  // loadMastery — GET /api/mastery
  // -------------------------------------------------------------------------

  async loadMastery(): Promise<void> {
    try {
      const res = await fetch('/api/mastery');
      if (!res.ok) {
        this.applyDefaults();
        return;
      }
      const body = (await res.json()) as { mastery?: ApiMasterySkill[] };
      const list = Array.isArray(body?.mastery) ? body.mastery : [];
      this.applyList(list);
    } catch {
      this.applyDefaults();
    }
  }

  // -------------------------------------------------------------------------
  // getMp — Mastery Points available for a skill
  // -------------------------------------------------------------------------

  getMp(skillId: SkillId): number {
    return this.getOrDefault(skillId).mp;
  }

  // -------------------------------------------------------------------------
  // getUnlocked — Set of unlocked node IDs for a skill
  // -------------------------------------------------------------------------

  getUnlocked(skillId: SkillId): Set<string> {
    return this.getOrDefault(skillId).unlocked;
  }

  // -------------------------------------------------------------------------
  // hasNode — true if a given node ID is unlocked (across all skills)
  // -------------------------------------------------------------------------

  hasNode(nodeId: string): boolean {
    for (const entry of this.data.values()) {
      if (entry.unlocked.has(nodeId)) return true;
    }
    return false;
  }

  // -------------------------------------------------------------------------
  // isLoaded
  // -------------------------------------------------------------------------

  isLoaded(): boolean {
    return this.loaded;
  }

  // -------------------------------------------------------------------------
  // earnMp — POST /api/mastery/earn { skill_id }
  // Fire-and-forget friendly — silent catch.
  // Updates local mp if awarded=true.
  // -------------------------------------------------------------------------

  async earnMp(skillId: SkillId): Promise<{ awarded: boolean; new_mp: number }> {
    const fallback = { awarded: false, new_mp: this.getMp(skillId) };
    try {
      const res = await fetch('/api/mastery/earn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skill_id: skillId }),
      });
      if (!res.ok) return fallback;

      const data = (await res.json()) as EarnMpResponse;
      if (typeof data?.awarded !== 'boolean' || typeof data?.new_mp !== 'number') {
        return fallback;
      }

      if (data.awarded) {
        const entry = this.getOrDefault(skillId);
        entry.mp = Math.max(0, data.new_mp);
        this.data.set(skillId, entry);
      }

      return { awarded: data.awarded, new_mp: data.new_mp };
    } catch {
      return fallback;
    }
  }

  // -------------------------------------------------------------------------
  // unlockNode — POST /api/mastery/unlock { skill_id, node_id }
  // If success: updates unlocked set and deducts MP locally.
  // -------------------------------------------------------------------------

  async unlockNode(
    skillId: SkillId,
    nodeId: string,
  ): Promise<{ success: boolean; new_mp?: number; error?: string }> {
    try {
      const res = await fetch('/api/mastery/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skill_id: skillId, node_id: nodeId }),
      });
      const data = (await res.json()) as UnlockNodeResponse;

      if (res.ok && data.success) {
        const entry = this.getOrDefault(skillId);
        entry.unlocked.add(nodeId);
        if (typeof data.new_mp === 'number') {
          entry.mp = Math.max(0, data.new_mp);
        }
        this.data.set(skillId, entry);
        return { success: true, new_mp: data.new_mp };
      }

      return { success: false, error: data.error ?? 'Error al desbloquear nodo.' };
    } catch {
      return { success: false, error: 'Error de red.' };
    }
  }

  // -------------------------------------------------------------------------
  // getMasteryBuffTotal — sums all buff values from unlocked nodes for a stat
  // 'percent' and 'flat' values are both accumulated numerically.
  // The caller is responsible for knowing the mode by context.
  // -------------------------------------------------------------------------

  getMasteryBuffTotal(stat: string): number {
    let total = 0;
    for (const tree of MASTERY_TREES) {
      const unlocked = this.getUnlocked(tree.skillId);
      for (const node of tree.nodes) {
        if (unlocked.has(node.id) && node.effect.stat === stat) {
          total += node.effect.value;
        }
      }
    }
    return total;
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private getOrDefault(skillId: SkillId): MasterySkillData {
    if (!this.data.has(skillId)) {
      this.data.set(skillId, { skill_id: skillId, mp: 0, unlocked: new Set() });
    }
    return this.data.get(skillId) as MasterySkillData;
  }

  private applyList(list: ApiMasterySkill[]): void {
    this.applyDefaults();
    for (const raw of list) {
      const skillId = raw.skill_id as SkillId;
      if (!ALL_SKILL_IDS.includes(skillId)) continue;
      const mp = typeof raw.mp === 'number' && raw.mp >= 0 ? Math.floor(raw.mp) : 0;
      const unlocked = new Set<string>(
        Array.isArray(raw.unlocked) ? raw.unlocked.filter((v) => typeof v === 'string') : [],
      );
      this.data.set(skillId, { skill_id: skillId, mp, unlocked });
    }
    this.loaded = true;
  }

  private applyDefaults(): void {
    for (const skillId of ALL_SKILL_IDS) {
      if (!this.data.has(skillId)) {
        this.data.set(skillId, { skill_id: skillId, mp: 0, unlocked: new Set() });
      }
    }
    this.loaded = true;
  }
}

// ---------------------------------------------------------------------------
// Singleton exports
// ---------------------------------------------------------------------------

let _instance: MasterySystem | null = null;

export function getMasterySystem(): MasterySystem {
  if (!_instance) _instance = new MasterySystem();
  return _instance;
}

export function initMasterySystem(): Promise<void> {
  return getMasterySystem().loadMastery();
}
