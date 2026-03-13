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
   TENKS_CHANGED: 'tenks:changed',
  INVENTORY_TOGGLE: 'inventory:toggle',
  INVENTORY_CHANGED: 'inventory:changed',
  AVATAR_SET: 'avatar:set',
  OPEN_CREATOR: 'creator:open',
  SHOP_OPEN: 'shop:open',
  SHOP_CLOSE: 'shop:close',
  PENALTY_RESULT: 'penalty:result',
  PLAYER_ACTIONS_OPEN: 'player:actions:open',
  PLAYER_ACTION_MUTE: 'player:action:mute',
  PLAYER_ACTION_REPORT: 'player:action:report',
  REMOTE_AVATAR_UPDATE: 'remote:avatar:update',
} as const;
