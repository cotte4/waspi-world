// SkillSystem.ts
// Client-side singleton that tracks the player's six skill trees,
// syncs with the /api/skills endpoint, and exposes passive buff totals
// to scenes. All API failures are caught silently so the game never crashes.

import type { QualityTier } from '../config/qualityTiers';
import type { SpecId } from '../config/specializations';
import type { MilestoneDef } from '../config/skillTrees';
import { SYNERGY_DEFS, type SynergyDef, type SynergyId } from '../config/synergies';
import { getAuthHeaders } from './authHelper';
import { fetchWithTimeout } from '../../lib/fetchWithTimeout';
import { eventBus, EVENTS } from '../config/eventBus';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type SkillId = 'mining' | 'fishing' | 'gardening' | 'cooking' | 'gym' | 'weed';

export type QualityRollResult = {
  quality: QualityTier;
  label: string;
  color: string;
  xp_bonus: number;
  value_mult: number;
};

export type SkillState = {
  skill_id: SkillId;
  xp: number;
  level: number; // 0-5
  action_count: number; // total actions performed for this skill
};

export type SkillBuff = {
  stat: 'maxHp' | 'speed' | 'damage' | 'extractSpeed' | 'cropSpeed' | 'fishingLuck';
  value: number;
  mode: 'percent' | 'flat';
};

// ---------------------------------------------------------------------------
// Internal config types
// ---------------------------------------------------------------------------

type BuffEntry = SkillBuff;

type LevelBuffTable = {
  [level: number]: BuffEntry[];
};

type SkillBuffTable = {
  [K in SkillId]?: LevelBuffTable;
};

type TitleTable = {
  [K in SkillId]: string[];
};

// ---------------------------------------------------------------------------
// Hardcoded buff table — mirrors skillTrees.ts
// Key: skill → { level: buffs[] }
// Only levels that actually grant a buff are listed.
// ---------------------------------------------------------------------------

const SKILL_BUFF_TABLE: SkillBuffTable = {
  mining: {
    2: [{ stat: 'extractSpeed', value: 20, mode: 'percent' }],
  },
  fishing: {
    2: [{ stat: 'fishingLuck', value: 25, mode: 'percent' }],
  },
  gardening: {
    2: [{ stat: 'cropSpeed', value: 30, mode: 'percent' }],
  },
  cooking: {
    1: [{ stat: 'maxHp', value: 5, mode: 'flat' }],
    2: [{ stat: 'speed', value: 15, mode: 'percent' }],
  },
  gym: {
    1: [{ stat: 'maxHp', value: 5, mode: 'percent' }],
    2: [{ stat: 'speed', value: 10, mode: 'percent' }],
    3: [{ stat: 'damage', value: 15, mode: 'percent' }],
    5: [
      { stat: 'maxHp', value: 10, mode: 'percent' },
      { stat: 'speed', value: 5, mode: 'percent' },
    ],
  },
};

// ---------------------------------------------------------------------------
// Level title table — one entry per level 0-5 for each skill
// ---------------------------------------------------------------------------

const SKILL_TITLES: TitleTable = {
  mining:    ['Rookie',     'Digger',     'Extractor', 'Blaster',    'Foreman',    'Legend'],
  fishing:   ['Rookie',     'Angler',     'Catcher',   'Harpooner',  'Trawler',    'Legend'],
  gardening: ['Rookie',     'Sprout',     'Grower',    'Cultivator', 'Botanist',   'Legend'],
  cooking:   ['Rookie',     'Prep Cook',  'Chef',      'Sous Chef',  'Head Chef',  'Legend'],
  gym:       ['Rookie',     'Trainee',    'Athlete',   'Lifter',     'Ironclad',   'Legend'],
  weed:      ['Rookie',     'Trimmer',    'Curer',     'Blender',    'Cultivar',   'Legend'],
};

// ---------------------------------------------------------------------------
// Ordered list of all skills — used for default state generation
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
// API response shapes
// ---------------------------------------------------------------------------

type ApiSkillState = {
  skill_id: SkillId;
  xp: number;
  level: number;
  action_count?: number;
};

type AddXpResponse = {
  leveled_up: boolean;
  new_level: number;
  xp: number;
  skill_id: string;
  milestone_unlocked?: MilestoneDef;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function defaultState(skill_id: SkillId): SkillState {
  return { skill_id, xp: 0, level: 0, action_count: 0 };
}

function clampLevel(level: unknown): number {
  if (typeof level !== 'number' || !Number.isFinite(level)) return 0;
  return Math.max(0, Math.min(5, Math.floor(level)));
}

function clampXp(xp: unknown): number {
  if (typeof xp !== 'number' || !Number.isFinite(xp)) return 0;
  return Math.max(0, Math.floor(xp));
}

// ---------------------------------------------------------------------------
// API response shape for specializations
// ---------------------------------------------------------------------------

type SpecRow = { skill_id: string; spec_id: string };

// ---------------------------------------------------------------------------
// SkillSystem class
// ---------------------------------------------------------------------------

export class SkillSystem {
  private skills: Map<SkillId, SkillState> = new Map();
  private loaded = false;
  private purchasedItems: Set<string> = new Set();
  private specs: Map<string, SpecId> = new Map(); // skill_id → spec_id

  // -------------------------------------------------------------------------
  // loadSkills — called once at game start
  // -------------------------------------------------------------------------

  async loadSkills(): Promise<void> {
    try {
      const authH = await getAuthHeaders();
      const res = await fetch('/api/skills', { headers: authH });
      if (!res.ok) {
        // API returned an error — fall back to defaults silently
        this.applyDefaults();
        return;
      }
      const data = (await res.json()) as { skills?: ApiSkillState[] };
      const rawList = Array.isArray(data?.skills) ? data.skills : [];
      this.applyList(rawList);
    } catch {
      // Network error or JSON parse failure — fall back to defaults silently
      this.applyDefaults();
    }
  }

  // -------------------------------------------------------------------------
  // getSkills — returns all 6 SkillState objects
  // -------------------------------------------------------------------------

  getSkills(): SkillState[] {
    return ALL_SKILL_IDS.map((id) => this.getOrDefault(id));
  }

  // -------------------------------------------------------------------------
  // getLevel
  // -------------------------------------------------------------------------

  getLevel(skillId: SkillId): number {
    return this.getOrDefault(skillId).level;
  }

  // -------------------------------------------------------------------------
  // getXp
  // -------------------------------------------------------------------------

  getXp(skillId: SkillId): number {
    return this.getOrDefault(skillId).xp;
  }

  // -------------------------------------------------------------------------
  // getActionCount — total actions performed for a skill (from server)
  // -------------------------------------------------------------------------

  getActionCount(skillId: SkillId): number {
    return this.getOrDefault(skillId).action_count;
  }

  // -------------------------------------------------------------------------
  // addXp — fires POST /api/skills, updates internal state from response
  // -------------------------------------------------------------------------

  async addXp(
    skillId: SkillId,
    amount: number,
    source: string,
  ): Promise<{ leveled_up: boolean; new_level: number }> {
    const fallback = { leveled_up: false, new_level: this.getLevel(skillId) };

    try {
      const authH = await getAuthHeaders();
      const res = await fetchWithTimeout('/api/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authH },
        body: JSON.stringify({ skill_id: skillId, xp_gain: amount, source }),
      }, 6000);

      if (!res.ok) return fallback;

      const data = (await res.json()) as AddXpResponse;

      // Validate shape before trusting the response
      if (
        typeof data?.skill_id !== 'string' ||
        typeof data?.xp !== 'number' ||
        typeof data?.new_level !== 'number'
      ) {
        return fallback;
      }

      const updatedState: SkillState = {
        skill_id: skillId,
        xp: clampXp(data.xp),
        level: clampLevel(data.new_level),
        action_count: (this.getOrDefault(skillId).action_count ?? 0) + 1,
      };
      this.skills.set(skillId, updatedState);

      const leveled_up = typeof data.leveled_up === 'boolean' ? data.leveled_up : false;
      const new_level = clampLevel(data.new_level);

      if (data.milestone_unlocked && typeof data.milestone_unlocked.id === 'string') {
        eventBus.emit(EVENTS.SKILL_MILESTONE_UNLOCKED, data.milestone_unlocked);
        eventBus.emit(EVENTS.UI_NOTICE, {
          message: `🏆 LOGRO: ${data.milestone_unlocked.name}!`,
          color: '#F5C842',
        });
      }

      return { leveled_up, new_level };
    } catch {
      // Fail silently — never crash the game
      return fallback;
    }
  }

  // -------------------------------------------------------------------------
  // rollQuality — calls /api/skills/quality, returns quality tier for an action.
  // Falls back to { quality: 'normal', ... } on any error so the game never breaks.
  // -------------------------------------------------------------------------

  async rollQuality(
    skillId: SkillId,
    source: string,
    isAuto = false,
  ): Promise<QualityRollResult> {
    const fallback: QualityRollResult = {
      quality: 'normal',
      label: 'NORMAL',
      color: '#B0B0C0',
      xp_bonus: 0,
      value_mult: 1.5,
    };

    try {
      const authH = await getAuthHeaders();
      const res = await fetchWithTimeout('/api/skills/quality', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authH },
        body: JSON.stringify({ skill_id: skillId, source, is_auto: isAuto }),
      }, 6000);
      if (!res.ok) return fallback;

      const data = (await res.json()) as Partial<QualityRollResult>;
      if (typeof data?.quality !== 'string') return fallback;

      return {
        quality:    data.quality as QualityTier,
        label:      typeof data.label     === 'string' ? data.label     : fallback.label,
        color:      typeof data.color     === 'string' ? data.color     : fallback.color,
        xp_bonus:   typeof data.xp_bonus  === 'number' ? data.xp_bonus  : 0,
        value_mult: typeof data.value_mult === 'number' ? data.value_mult : fallback.value_mult,
      };
    } catch {
      return fallback;
    }
  }

  // -------------------------------------------------------------------------
  // getActiveSynergies — returns all synergies the player currently meets
  // Computed from loaded skill levels — no extra API call needed.
  // -------------------------------------------------------------------------

  getActiveSynergies(): SynergyDef[] {
    return SYNERGY_DEFS.filter((syn) =>
      syn.requires.every((req) => this.getLevel(req.skillId) >= req.minLevel),
    );
  }

  // -------------------------------------------------------------------------
  // hasSynergy — returns true if the given synergy is currently active
  // -------------------------------------------------------------------------

  hasSynergy(id: SynergyId): boolean {
    return this.getActiveSynergies().some((s) => s.id === id);
  }

  // -------------------------------------------------------------------------
  // getSynergyBuff — sums speed_bonus (or other stat bonuses) from all active
  // synergies. Returns percent value (e.g. 15 means +15%).
  // -------------------------------------------------------------------------

  getSynergyBuff(stat: string): number {
    return this.getActiveSynergies()
      .flatMap((syn) => syn.effects)
      .filter((fx) => fx.stat === stat)
      .reduce((sum, fx) => sum + fx.value, 0);
  }

  // -------------------------------------------------------------------------
  // getPassiveBuffTotal — sums all passive buffs across all skills for a stat
  // Buffs are additive within each mode. Percent values accumulate as integers
  // (e.g. 10 + 15 = 25, meaning 25% total bonus).
  // -------------------------------------------------------------------------

  getPassiveBuffTotal(stat: SkillBuff['stat']): number {
    let total = 0;

    for (const skillId of ALL_SKILL_IDS) {
      const currentLevel = this.getLevel(skillId);
      const levelTable = SKILL_BUFF_TABLE[skillId];
      if (!levelTable) continue;

      // Accumulate buffs for every level the player has reached
      for (let lvl = 1; lvl <= currentLevel; lvl += 1) {
        const buffsAtLevel = levelTable[lvl];
        if (!buffsAtLevel) continue;
        for (const buff of buffsAtLevel) {
          if (buff.stat === stat) {
            total += buff.value;
          }
        }
      }
    }

    return total;
  }

  // -------------------------------------------------------------------------
  // hasUnlocked — true if player is at or above minLevel for a skill
  // -------------------------------------------------------------------------

  hasUnlocked(skillId: SkillId, minLevel: number): boolean {
    return this.getLevel(skillId) >= minLevel;
  }

  // -------------------------------------------------------------------------
  // getTitle — returns the level title string for a skill
  // -------------------------------------------------------------------------

  getTitle(skillId: SkillId): string {
    const level = this.getLevel(skillId);
    return SKILL_TITLES[skillId][level] ?? SKILL_TITLES[skillId][0];
  }

  // -------------------------------------------------------------------------
  // loadPurchasedItems — fetches the player's purchased skill items from the API
  // -------------------------------------------------------------------------

  async loadPurchasedItems(): Promise<void> {
    try {
      const authH = await getAuthHeaders();
      const res = await fetch('/api/skills/purchase', { headers: authH });
      if (!res.ok) return;
      const data = await res.json() as { purchased?: string[] };
      if (Array.isArray(data?.purchased)) {
        this.purchasedItems = new Set(data.purchased);
      }
    } catch { /* silent */ }
  }

  // -------------------------------------------------------------------------
  // loadSpecs — fetches the player's chosen specializations from the API
  // -------------------------------------------------------------------------

  async loadSpecs(): Promise<void> {
    try {
      const authH = await getAuthHeaders();
      const res = await fetch('/api/skills/specialize', { headers: authH });
      if (!res.ok) return;
      const data = (await res.json()) as { specializations?: SpecRow[] };
      if (!Array.isArray(data?.specializations)) return;
      for (const row of data.specializations) {
        if (typeof row.skill_id === 'string' && typeof row.spec_id === 'string') {
          this.specs.set(row.skill_id, row.spec_id as SpecId);
        }
      }
    } catch { /* silent */ }
  }

  // -------------------------------------------------------------------------
  // getSpec — returns the chosen SpecId for a skill, or null if none chosen
  // -------------------------------------------------------------------------

  getSpec(skillId: string): SpecId | null {
    return this.specs.get(skillId) ?? null;
  }

  // -------------------------------------------------------------------------
  // hasSpec — true if the player has already chosen a spec for a skill
  // -------------------------------------------------------------------------

  hasSpec(skillId: string): boolean {
    return this.specs.has(skillId);
  }

  // -------------------------------------------------------------------------
  // chooseSpec — sends POST /api/skills/specialize to lock in a specialization
  // -------------------------------------------------------------------------

  async chooseSpec(
    skillId: string,
    specId: SpecId,
  ): Promise<{ success: boolean; notice?: string; error?: string }> {
    try {
      const authH = await getAuthHeaders();
      const res = await fetch('/api/skills/specialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authH },
        body: JSON.stringify({ skill_id: skillId, spec_id: specId }),
      });
      const data = (await res.json()) as { notice?: string; error?: string; spec_id?: string };
      if (res.ok && data.spec_id) {
        this.specs.set(skillId, data.spec_id as SpecId);
        return { success: true, notice: data.notice };
      }
      return { success: false, error: data.error ?? 'Error al especializar.' };
    } catch {
      return { success: false, error: 'Error de red.' };
    }
  }

  // -------------------------------------------------------------------------
  // hasPurchased — returns true if the player owns a given skill item
  // -------------------------------------------------------------------------

  hasPurchased(itemId: string): boolean {
    return this.purchasedItems.has(itemId);
  }

  // -------------------------------------------------------------------------
  // buyItem — purchases a skill item via POST /api/skills/purchase
  // -------------------------------------------------------------------------

  async buyItem(itemId: string): Promise<{ success: boolean; notice?: string; error?: string; new_balance?: number }> {
    try {
      const authH = await getAuthHeaders();
      const res = await fetch('/api/skills/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authH },
        body: JSON.stringify({ item_id: itemId }),
      });
      const data = await res.json() as { notice?: string; error?: string; new_balance?: number; already_owned?: boolean };
      if (res.ok) {
        this.purchasedItems.add(itemId);
        return { success: true, notice: data.notice, new_balance: data.new_balance };
      }
      return { success: false, error: data.error };
    } catch {
      return { success: false, error: 'Error de red.' };
    }
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private getOrDefault(skillId: SkillId): SkillState {
    return this.skills.get(skillId) ?? defaultState(skillId);
  }

  private applyList(list: ApiSkillState[]): void {
    this.applyDefaults();
    for (const raw of list) {
      if (!ALL_SKILL_IDS.includes(raw.skill_id)) continue;
      this.skills.set(raw.skill_id, {
        skill_id: raw.skill_id,
        xp: clampXp(raw.xp),
        level: clampLevel(raw.level),
        action_count: typeof raw.action_count === 'number' ? Math.max(0, raw.action_count) : 0,
      });
    }
    this.loaded = true;
  }

  private applyDefaults(): void {
    for (const id of ALL_SKILL_IDS) {
      if (!this.skills.has(id)) {
        this.skills.set(id, defaultState(id));
      }
    }
    this.loaded = true;
  }

  /** Exposed only for debugging in dev tools — do not use in game logic. */
  get isLoaded(): boolean {
    return this.loaded;
  }
}

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------

let _instance: SkillSystem | null = null;

export function getSkillSystem(): SkillSystem {
  if (!_instance) _instance = new SkillSystem();
  return _instance;
}

export function initSkillSystem(): Promise<void> {
  return getSkillSystem().loadSkills();
}
