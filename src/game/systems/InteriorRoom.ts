import Phaser from 'phaser';
import { AvatarRenderer, type AvatarConfig } from './AvatarRenderer';
import { ChatSystem } from './ChatSystem';
import { eventBus, EVENTS } from '../config/eventBus';
import { supabase, isConfigured } from '../../lib/supabase';

type InteriorRemotePlayer = {
  avatar: AvatarRenderer;
  nameplate: Phaser.GameObjects.Text;
  username: string;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  moveDx: number;
  moveDy: number;
  isMoving: boolean;
  avatarConfig: AvatarConfig;
};

type RoomStatePayload = {
  player_id: string;
  username: string;
  x: number;
  y: number;
  dir?: number | null;
  dy?: number | null;
  moving?: boolean | null;
  avatar?: AvatarConfig;
};

type InteriorRoomOptions = {
  roomKey: string;
  getPosition: () => { x: number; y: number };
  getMovement: () => { dx: number; dy: number; isMoving: boolean };
  getAvatarConfig: () => AvatarConfig;
  onRemoteClick?: (playerId: string, username: string) => void;
  localColor?: string;
  remoteColor?: string;
  depthBase?: number;
  nameplateOffsetY?: number;
};

export class InteriorRoom {
  private channel: ReturnType<NonNullable<typeof supabase>['channel']> | null = null;
  private remotePlayers = new Map<string, InteriorRemotePlayer>();
  private localNameplate?: Phaser.GameObjects.Text;
  private chatSystem?: ChatSystem;
  private playerId = '';
  private username = '';
  private lastPosSent = 0;
  private cleanupFns: Array<() => void> = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly options: InteriorRoomOptions,
  ) {}

  start() {
    this.playerId = this.getOrCreatePlayerId();
    this.username = this.getOrCreateUsername();
    this.chatSystem = new ChatSystem(this.scene);

    const { x, y } = this.options.getPosition();
    this.localNameplate = this.scene.add.text(x, y - (this.options.nameplateOffsetY ?? 44), this.username, {
      fontSize: '8px',
      fontFamily: '"Press Start 2P", monospace',
      color: this.options.localColor ?? '#F5C842',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5, 1).setDepth((this.options.depthBase ?? 20) + 10);

    this.cleanupFns.push(eventBus.on(EVENTS.CHAT_RECEIVED, (payload: unknown) => {
      if (!payload || typeof payload !== 'object') return;
      const playerId = this.readStringField(payload, 'playerId', 'player_id');
      const message = this.readStringField(payload, 'message');
      if (!playerId || !message) return;
      if (playerId === this.playerId) {
        const position = this.options.getPosition();
        this.chatSystem?.showBubble('__player__', message, position.x, position.y, true);
        return;
      }
      const remote = this.remotePlayers.get(playerId);
      if (!remote) return;
      this.chatSystem?.showBubble(playerId, message, remote.x, remote.y, false);
    }));

    if (!supabase || !isConfigured) return;

    this.channel = supabase.channel(this.options.roomKey, {
      config: { broadcast: { self: false } },
    });

    this.channel
      .on('broadcast', { event: 'player:move' }, ({ payload }) => {
        this.handleRemoteMove(payload);
      })
      .on('broadcast', { event: 'player:join' }, ({ payload }) => {
        this.handleRemoteJoin(payload);
      })
      .on('broadcast', { event: 'player:leave' }, ({ payload }) => {
        this.handleRemoteLeave(payload);
      })
      .subscribe(() => {
        this.broadcastSelfState('player:join');
      });
  }

  update() {
    const { x, y } = this.options.getPosition();
    if (this.localNameplate?.active) {
      this.localNameplate.setPosition(x, y - (this.options.nameplateOffsetY ?? 44));
    }
    this.chatSystem?.updatePosition('__player__', x, y);
    this.syncPosition();
    this.chatSystem?.update();

    for (const [playerId, remote] of this.remotePlayers.entries()) {
      if (!remote.avatar || !remote.avatar.scene || !remote.avatar.active || !remote.nameplate?.active) {
        this.chatSystem?.clearBubble(playerId);
        this.remotePlayers.delete(playerId);
        continue;
      }
      remote.x = Phaser.Math.Linear(remote.x, remote.targetX, 0.18);
      remote.y = Phaser.Math.Linear(remote.y, remote.targetY, 0.18);
      remote.avatar.update(remote.isMoving, remote.moveDx, remote.moveDy);
      remote.avatar.setPosition(remote.x, remote.y);
      remote.avatar.setDepth((this.options.depthBase ?? 10) + Math.floor(remote.y / 10));
      remote.nameplate.setPosition(remote.x, remote.y - (this.options.nameplateOffsetY ?? 44));
      this.chatSystem?.updatePosition(playerId, remote.x, remote.y);
    }
  }

  shutdown() {
    if (this.channel) {
      this.channel.send({
        type: 'broadcast',
        event: 'player:leave',
        payload: { player_id: this.playerId },
      });
      this.channel.unsubscribe();
      this.channel = null;
    }
    this.localNameplate?.destroy();
    this.localNameplate = undefined;
    this.remotePlayers.forEach((player) => {
      player.avatar.destroy();
      player.nameplate.destroy();
    });
    this.remotePlayers.clear();
    this.chatSystem?.destroy();
    this.chatSystem = undefined;
    this.cleanupFns.forEach((cleanup) => cleanup());
    this.cleanupFns = [];
  }

  private syncPosition() {
    if (!this.channel) return;
    const now = Date.now();
    if (now - this.lastPosSent < 66) return;
    this.lastPosSent = now;
    this.broadcastSelfState('player:move');
  }

  private broadcastSelfState(event: 'player:join' | 'player:move') {
    if (!this.channel) return;
    const { x, y } = this.options.getPosition();
    const movement = this.options.getMovement();
    this.channel.send({
      type: 'broadcast',
      event,
      payload: {
        player_id: this.playerId,
        username: this.username,
        x: Math.round(x),
        y: Math.round(y),
        dir: movement.dx,
        dy: movement.dy,
        moving: movement.isMoving,
        avatar: this.options.getAvatarConfig(),
      },
    });
  }

  private handleRemoteJoin(payload: unknown) {
    const next = this.parseRemoteState(payload);
    if (!next || next.player_id === this.playerId) return;
    if (!this.remotePlayers.has(next.player_id)) {
      this.spawnRemotePlayer(next.player_id, next.username, next.x, next.y, next.avatar ?? {});
      return;
    }
    const remote = this.remotePlayers.get(next.player_id)!;
    remote.targetX = next.x;
    remote.targetY = next.y;
    remote.username = next.username;
    if (remote.nameplate?.active) {
      remote.nameplate.setText(next.username);
    }
  }

  private handleRemoteMove(payload: unknown) {
    const next = this.parseRemoteState(payload);
    if (!next || next.player_id === this.playerId) return;
    if (!this.remotePlayers.has(next.player_id)) {
      this.spawnRemotePlayer(next.player_id, next.username, next.x, next.y, next.avatar ?? {});
    }
    const remote = this.remotePlayers.get(next.player_id)!;
    remote.targetX = next.x;
    remote.targetY = next.y;
    remote.moveDx = next.dir ?? 0;
    remote.moveDy = next.dy ?? 0;
    remote.isMoving = next.moving ?? false;
    remote.username = next.username;
    if (remote.nameplate?.active) {
      remote.nameplate.setText(next.username);
    }
  }

  private handleRemoteLeave(payload: unknown) {
    const playerId = this.readStringField(payload, 'player_id', 'playerId');
    if (!playerId) return;
    const remote = this.remotePlayers.get(playerId);
    if (!remote) return;
    remote.avatar.destroy();
    remote.nameplate.destroy();
    this.remotePlayers.delete(playerId);
    this.chatSystem?.clearBubble(playerId);
  }

  private spawnRemotePlayer(playerId: string, username: string, x: number, y: number, avatarConfig: AvatarConfig) {
    const avatar = new AvatarRenderer(this.scene, x, y, avatarConfig);
    avatar.setDepth((this.options.depthBase ?? 10) + Math.floor(y / 10));
    const nameplate = this.scene.add.text(x, y - (this.options.nameplateOffsetY ?? 44), username, {
      fontSize: '8px',
      fontFamily: '"Press Start 2P", monospace',
      color: this.options.remoteColor ?? '#88AAFF',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5, 1).setDepth((this.options.depthBase ?? 20) + 10);

    if (this.options.onRemoteClick) {
      nameplate.setInteractive({ useHandCursor: true });
      nameplate.on('pointerdown', () => {
        this.options.onRemoteClick?.(playerId, username);
      });
    }

    this.remotePlayers.set(playerId, {
      avatar,
      nameplate,
      username,
      x,
      y,
      targetX: x,
      targetY: y,
      moveDx: 0,
      moveDy: 0,
      isMoving: false,
      avatarConfig,
    });
  }

  private getOrCreatePlayerId() {
    if (typeof window === 'undefined') return crypto.randomUUID();
    const key = 'waspi_session_id';
    const stored = window.sessionStorage.getItem(key);
    if (stored) return stored;
    const id = crypto.randomUUID();
    window.sessionStorage.setItem(key, id);
    return id;
  }

  private getOrCreateUsername() {
    if (typeof window === 'undefined') return 'waspi_guest';
    const stored = window.localStorage.getItem('waspi_username');
    if (stored) return stored;
    return 'waspi_guest';
  }

  private readStringField(payload: unknown, ...keys: string[]) {
    if (!payload || typeof payload !== 'object') return null;
    for (const key of keys) {
      const value = (payload as Record<string, unknown>)[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return null;
  }

  private readNumberField(payload: unknown, ...keys: string[]) {
    if (!payload || typeof payload !== 'object') return null;
    for (const key of keys) {
      const value = (payload as Record<string, unknown>)[key];
      if (typeof value === 'number' && Number.isFinite(value)) return value;
    }
    return null;
  }

  private readBooleanField(payload: unknown, ...keys: string[]) {
    if (!payload || typeof payload !== 'object') return null;
    for (const key of keys) {
      const value = (payload as Record<string, unknown>)[key];
      if (typeof value === 'boolean') return value;
    }
    return null;
  }

  private parseRemoteState(payload: unknown): RoomStatePayload | null {
    const playerId = this.readStringField(payload, 'player_id', 'playerId');
    const username = this.readStringField(payload, 'username') ?? 'waspi_guest';
    const x = this.readNumberField(payload, 'x');
    const y = this.readNumberField(payload, 'y');
    if (!playerId || x === null || y === null) return null;
    const avatar = payload && typeof payload === 'object' && 'avatar' in payload && payload.avatar && typeof payload.avatar === 'object'
      ? payload.avatar as AvatarConfig
      : undefined;
    return {
      player_id: playerId,
      username,
      x,
      y,
      dir: this.readNumberField(payload, 'dir', 'dx'),
      dy: this.readNumberField(payload, 'dy'),
      moving: this.readBooleanField(payload, 'moving', 'isMoving'),
      avatar,
    };
  }
}
