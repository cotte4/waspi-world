type Callback = (...args: unknown[]) => void;

class EventBus {
  private events = new Map<string, Callback[]>();

  on(event: string, cb: Callback): () => void {
    if (!this.events.has(event)) this.events.set(event, []);
    this.events.get(event)!.push(cb);
    return () => this.off(event, cb);
  }

  off(event: string, cb: Callback) {
    const list = this.events.get(event) ?? [];
    this.events.set(event, list.filter(fn => fn !== cb));
  }

  emit(event: string, ...args: unknown[]) {
    (this.events.get(event) ?? []).forEach(cb => cb(...args));
  }
}

export const eventBus = new EventBus();

export const EVENTS = {
  CHAT_SEND: 'chat:send',
  CHAT_RECEIVED: 'chat:received',
  CHAT_INPUT_FOCUS: 'chat:input:focus',
  CHAT_INPUT_BLUR: 'chat:input:blur',
  SCENE_CHANGED: 'scene:changed',
  PLAYER_READY: 'player:ready',
  PLAYER_INFO: 'player:info',
  PLAYER_PRESENCE: 'player:presence',
  PLAYER_COMBAT_STATS: 'player:combat:stats',
  PLAYER_PROGRESSION: 'player:progression',
  PLAYER_STATE_APPLY: 'player:state:apply',
  TENKS_CHANGED: 'tenks:changed',
  INVENTORY_TOGGLE: 'inventory:toggle',
  INVENTORY_CHANGED: 'inventory:changed',
  AVATAR_SET: 'avatar:set',
  OPEN_CREATOR: 'creator:open',
  SHOP_OPEN: 'shop:open',
  SHOP_CLOSE: 'shop:close',
  AUDIO_SETTINGS_CHANGED: 'audio:settings:changed',
  HUD_SETTINGS_CHANGED: 'hud:settings:changed',
  CONTROL_SETTINGS_CHANGED: 'control:settings:changed',
  PENALTY_RESULT: 'penalty:result',
  PLAYER_ACTIONS_OPEN: 'player:actions:open',
  PLAYER_ACTION_MUTE: 'player:action:mute',
  PLAYER_ACTION_REPORT: 'player:action:report',
  REMOTE_AVATAR_UPDATE: 'remote:avatar:update',
  PARCEL_BUY_REQUEST: 'parcel:buy:request',
  PARCEL_BUILD_REQUEST: 'parcel:build:request',
  PARCEL_STATE_CHANGED: 'parcel:state:changed',
  VECINDAD_SHARED_STATE_CHANGED: 'vecindad:shared:state:changed',
  VECINDAD_UPDATE_REQUEST: 'vecindad:update:request',
  FARM_ACTION_REQUEST: 'farm:action:request',
  FARM_UNLOCKED: 'farm:unlocked',
  FARM_PLANTED: 'farm:planted',
  FARM_WATERED: 'farm:watered',
  FARM_HARVESTED: 'farm:harvested',
  WEAPON_CHANGED: 'weapon:changed',
  UI_NOTICE: 'ui:notice',
  SAFE_RESET_TO_PLAZA: 'scene:safe-reset-to-plaza',
  STATS_ZOMBIE_KILL: 'stats:zombie:kill',
  STATS_PVP_RESULT: 'stats:pvp:result',
  STATS_BASKET_GAME: 'stats:basket:game',
  DARTS_SCORE: 'darts:score',
  DARTS_BULLSEYE: 'darts:bullseye',
  OPEN_STATS: 'stats:open',
  VOICE_MIC_CHANGED: 'voice:mic:changed',
  /** Dispositivo de salida Web Audio (Chrome/Edge). Payload: deviceId string (vacío = default). */
  AUDIO_OUTPUT_SINK_CHANGED: 'audio:output:sink:changed',
  VOICE_DISABLE: 'voice:disable',
  VOICE_ENABLE: 'voice:enable',
  VOICE_STATUS_CHANGED: 'voice:status:changed',
  SKILL_MILESTONE_UNLOCKED: 'skill:milestone:unlocked',
  ACTIVITY_STARTED: 'activity:started',
  ACTIVITY_STOPPED: 'activity:stopped',
  JUKEBOX_OPEN: 'jukebox:open',
  JUKEBOX_CLOSE: 'jukebox:close',
  JUKEBOX_ADD_SONG: 'jukebox:add:song',
  JUKEBOX_TENKS_DEDUCTED: 'jukebox:tenks:deducted',
  JUKEBOX_SKIP_REQUESTED: 'jukebox:skip:requested',
  JUKEBOX_REACTION_SENT: 'jukebox:reaction:sent',
  JUKEBOX_STATE_UPDATED: 'jukebox:state:updated',
  JUKEBOX_AUDIO_UNLOCK_REQUIRED: 'jukebox:audio:unlock-required',
  JUKEBOX_AUDIO_UNLOCKED: 'jukebox:audio:unlocked',
  /** Player HP changed. Payload: { hp: number; maxHp: number } */
  PLAYER_HP_CHANGED: 'player:hp:changed',
  /** Creator overlay → Phaser: config patch. Payload: Partial<AvatarConfig> */
  CREATOR_CONFIG_CHANGED: 'creator:config:changed',
  /** Creator overlay → Phaser: save & enter world. Payload: { username: string } */
  CREATOR_COMMIT: 'creator:commit',
  /** Phaser → Creator overlay: initial config. Payload: { config: Required<AvatarConfig> } */
  CREATOR_READY: 'creator:ready',
  /** Phaser → QuestTracker: a quest was completed or progress changed, force re-fetch. */
  QUEST_TRACKER_REFRESH: 'quest:tracker:refresh',
  /** Open the Leaderboard overlay. No payload required. */
  LEADERBOARD_OPEN: 'leaderboard:open',
  /** Open the Skill Tree overlay. No payload required. */
  SKILL_TREE_OPEN: 'skill:tree:open',
  /** Open the Casino overlay. Payload: { game: 'slots' | 'roulette' | 'blackjack' | 'poker' } */
  CASINO_OPEN: 'casino:open',
  /** Close the Casino overlay. No payload required. */
  CASINO_CLOSE: 'casino:close',
  /** Zombies HUD state update. Payload: ZombiesHudPayload */
  ZOMBIES_HUD_UPDATE: 'zombies:hud_update',
  /** Zombies wave countdown. Payload: { count: 3|2|1|0 } (0 = GO!) */
  ZOMBIES_COUNTDOWN: 'zombies:countdown',
  /** Zombies game over. Payload: { score: number; kills: number; wave: number } */
  ZOMBIES_GAME_OVER: 'zombies:game_over',
  /** Zombies scene active/inactive. Payload: boolean */
  ZOMBIES_SCENE_ACTIVE: 'zombies:active',
  /** Open the Gun Shop overlay. No payload required. */
  GUN_SHOP_OPEN: 'gunshop:open',
  /** Close the Gun Shop overlay. No payload required. */
  GUN_SHOP_CLOSE: 'gunshop:close',
  /** VecindadScene HUD data update. Payload: VecindadHudPayload */
  VECINDAD_HUD_UPDATE: 'vecindad:hud_update',
  /** VecindadScene active/inactive. Payload: boolean */
  VECINDAD_SCENE_ACTIVE: 'vecindad:active',
  /** Basket HUD update. Payload: { score, streak, shot, totalShots } */
  BASKET_HUD_UPDATE: 'basket:hud_update',
  /** Basket scene active/inactive. Payload: boolean */
  BASKET_SCENE_ACTIVE: 'basket:active',
  /** Basket final result. Payload: { score, made, attempts } */
  BASKET_RESULT: 'basket:result',
  /** Penalty HUD update. Payload: { goals, shotsLeft, shotsTaken, maxShots } */
  PENALTY_HUD_UPDATE: 'penalty:hud_update',
  /** Penalty scene active/inactive. Payload: boolean */
  PENALTY_SCENE_ACTIVE: 'penalty:active',
  /** Darts HUD update. Payload: { score, turn, round, dartsInRound, bullseyes } */
  DARTS_HUD_UPDATE: 'darts:hud_update',
  /** Darts scene active/inactive. Payload: boolean */
  DARTS_SCENE_ACTIVE: 'darts:active',
  /** Darts final result. Payload: { score, bullseyes, tenksEarned } */
  DARTS_RESULT: 'darts:result',
  /** Flappy Waspi HUD update. Payload: { score: number; highScore: number } */
  FLAPPY_HUD_UPDATE: 'flappy:hud_update',
  /** Flappy Waspi scene active/inactive. Payload: boolean */
  FLAPPY_SCENE_ACTIVE: 'flappy:active',
  /** Flappy Waspi game over. Payload: { score: number; highScore: number } */
  FLAPPY_GAME_OVER: 'flappy:game_over',
  /** DinoRun HUD update. Payload: { score: number; highScore: number } */
  DINO_HUD_UPDATE: 'dino:hud_update',
  /** DinoRun scene active/inactive. Payload: boolean */
  DINO_SCENE_ACTIVE: 'dino:active',
  /** DinoRun game over. Payload: { score: number } */
  DINO_GAME_OVER: 'dino:game_over',
  /** BosqueMaterialesScene HUD data update. Payload: BosqueHudPayload */
  BOSQUE_HUD_UPDATE: 'bosque:hud_update',
  /** BosqueMaterialesScene active/inactive. Payload: boolean */
  BOSQUE_SCENE_ACTIVE: 'bosque:active',
  /** GymInterior HUD state update. Payload: GymHudPayload */
  GYM_HUD_UPDATE: 'gym:hud_update',
  /** GymInterior scene active/inactive. Payload: boolean */
  GYM_SCENE_ACTIVE: 'gym:active',
  /** ArcadeInterior HUD state update. Payload: ArcadeHudPayload */
  ARCADE_HUD_UPDATE: 'arcade:hud_update',
  /** ArcadeInterior scene active/inactive. Payload: boolean */
  ARCADE_SCENE_ACTIVE: 'arcade:active',
  /** WorldScene interaction prompt. Payload: { text: string; visible: boolean; color: string } */
  WORLD_INTERACTION_PROMPT: 'world:interaction_prompt',
  /** PvpArenaScene HUD state update. Payload: PvpHudPayload */
  PVP_HUD_UPDATE: 'pvp:hud_update',
  /** PvpArenaScene active/inactive. Payload: boolean */
  PVP_SCENE_ACTIVE: 'pvp:active',
  /** Open the Patch Notes overlay. No payload required. */
  PATCH_NOTES_OPEN: 'patch:notes:open',
} as const;
