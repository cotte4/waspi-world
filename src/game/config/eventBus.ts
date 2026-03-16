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
  UI_NOTICE: 'ui:notice',
  SAFE_RESET_TO_PLAZA: 'scene:safe-reset-to-plaza',
  STATS_ZOMBIE_KILL: 'stats:zombie:kill',
  STATS_PVP_RESULT: 'stats:pvp:result',
  STATS_BASKET_GAME: 'stats:basket:game',
  DARTS_SCORE: 'darts:score',
  DARTS_BULLSEYE: 'darts:bullseye',
  OPEN_STATS: 'stats:open',
} as const;
