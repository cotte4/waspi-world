// QuestSystem.ts
// Client-side singleton for daily quests. Loads from /api/quests/daily,
// tracks player actions fire-and-forget. Mirrors ContractSystem patterns.

import { eventBus, EVENTS } from '../config/eventBus';
import { initTenks } from './TenksSystem';
import { getAuthHeaders } from './authHelper';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type DailyQuest = {
  id: string;
  skill_id: string;
  action_type: string;
  target: number;
  reward_xp: number;
  reward_tenks: number;
  label: string;
  icon: string;
  progress: number;
  completed: boolean;
  completed_at: string | null;
};

// ---------------------------------------------------------------------------
// QuestSystem
// ---------------------------------------------------------------------------

class QuestSystem {
  private quests: DailyQuest[] = [];
  private loaded = false;
  private lastPollAt = 0;
  private static readonly POLL_INTERVAL_MS = 120_000; // poll every 2 min max

  // -------------------------------------------------------------------------
  // load — fetches /api/quests/daily, stores quests
  // -------------------------------------------------------------------------

  async load(): Promise<void> {
    try {
      const authH = await getAuthHeaders();
      const res = await fetch('/api/quests/daily', { headers: authH });
      if (!res.ok) return;
      const data = await res.json() as { quests?: DailyQuest[] };
      if (Array.isArray(data.quests)) {
        this.quests = data.quests;
        this.loaded = true;
      }
      this.lastPollAt = Date.now();
    } catch { /* silent */ }
  }

  // -------------------------------------------------------------------------
  // trackAction — fire-and-forget from scenes
  // Called every time a relevant action is performed.
  // -------------------------------------------------------------------------

  async trackAction(actionType: string, skillId: string): Promise<void> {
    if (!this.loaded) return;

    // Find active quests matching this action + skill
    const matches = this.quests.filter(
      (q) =>
        !q.completed &&
        q.action_type === actionType &&
        q.skill_id === skillId,
    );

    for (const quest of matches) {
      try {
        const authH = await getAuthHeaders();
        const res = await fetch('/api/quests/daily/progress', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authH },
          body: JSON.stringify({
            quest_id: quest.id,
            action_type: actionType,
            skill_id: skillId,
          }),
        });

        if (!res.ok) continue;

        const data = await res.json() as {
          progress?: number;
          completed?: boolean;
          reward_granted?: boolean;
          reward_tenks?: number;
          reward_xp?: number;
          new_balance?: number;
        };

        // Update local state
        if (typeof data.progress === 'number') {
          quest.progress = data.progress;
        }

        if (data.completed === true) {
          quest.completed = true;
          quest.completed_at = new Date().toISOString();
        }

        if (data.reward_granted === true) {
          // Sync TENKS balance (server-authoritative)
          if (typeof data.new_balance === 'number') {
            initTenks(data.new_balance, { preferStored: false });
          }

          const xpPart = data.reward_xp ? ` +${data.reward_xp}XP` : '';
          const tenksPart = data.reward_tenks ? ` +${data.reward_tenks.toLocaleString('es-AR')}T` : '';
          const notice = `QUEST COMPLETADA: ${quest.icon}${tenksPart}${xpPart}`;
          eventBus.emit(EVENTS.UI_NOTICE, { message: notice, color: '#F5C842' });

          // Check if all quests are now done for the bonus banner
          this.checkAllCompleted();
        }
      } catch { /* fail silently — never crash */ }
    }
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  getQuests(): DailyQuest[] {
    return this.quests;
  }

  getPendingCount(): number {
    return this.quests.filter((q) => !q.completed).length;
  }

  isLoaded(): boolean {
    return this.loaded;
  }

  pollIfStale(): void {
    if (Date.now() - this.lastPollAt > QuestSystem.POLL_INTERVAL_MS) {
      void this.load();
    }
  }

  // -------------------------------------------------------------------------
  // checkAllCompleted — emits a bonus notice when all 3 quests are done
  // -------------------------------------------------------------------------

  private checkAllCompleted(): void {
    if (this.quests.length === 0) return;
    const allDone = this.quests.every((q) => q.completed);
    if (allDone) {
      eventBus.emit(EVENTS.UI_NOTICE, {
        message: 'TODAS LAS QUESTS COMPLETADAS! 🏆 +50T BONUS',
        color: '#F5C842',
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton exports
// ---------------------------------------------------------------------------

let _instance: QuestSystem | null = null;

export function getQuestSystem(): QuestSystem {
  if (!_instance) _instance = new QuestSystem();
  return _instance;
}

export function initQuestSystem(): Promise<void> {
  return getQuestSystem().load();
}
