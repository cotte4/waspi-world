import Phaser from 'phaser';
import { AvatarRenderer, AvatarConfig, loadStoredAvatarConfig } from '../systems/AvatarRenderer';
import { BUILDINGS, COLORS, WORLD, ZONES } from '../config/constants';
import { CATALOG } from '../config/catalog';
import { announceScene, createBackButton, transitionToScene } from '../systems/SceneUi';
import { eventBus, EVENTS } from '../config/eventBus';
import { DialogSystem } from '../systems/DialogSystem';
import { supabase, isConfigured } from '../../lib/supabase';

type StoreRemotePlayer = {
  avatar: AvatarRenderer;
  nameplate: Phaser.GameObjects.Text;
  username: string;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  moveDx: number;
  isMoving: boolean;
  avatarConfig: AvatarConfig;
};

export class StoreInterior extends Phaser.Scene {
  private static readonly RETURN_X = BUILDINGS.STORE.x + BUILDINGS.STORE.w / 2;
  private static readonly RETURN_Y = ZONES.SOUTH_SIDEWALK_Y + 26;
  private player!: AvatarRenderer;
  private keyEsc!: Phaser.Input.Keyboard.Key;
  private keySpace!: Phaser.Input.Keyboard.Key;
  private inTransition = false;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keyW!: Phaser.Input.Keyboard.Key;
  private keyA!: Phaser.Input.Keyboard.Key;
  private keyS!: Phaser.Input.Keyboard.Key;
  private keyD!: Phaser.Input.Keyboard.Key;
  private px = 0;
  private py = 0;
  private selectedItemId = '';
  private dialog!: DialogSystem;
  private vendorX = 0;
  private vendorY = 0;
  private shopOverlayOpen = false;
  private cleanupFns: Array<() => void> = [];
  private playerId = '';
  private playerUsername = '';
  private localNameplate?: Phaser.GameObjects.Text;
  private remotePlayers = new Map<string, StoreRemotePlayer>();
  private channel: ReturnType<NonNullable<typeof supabase>['channel']> | null = null;
  private lastPosSent = 0;
  private lastMoveDx = 0;
  private lastIsMoving = false;

  constructor() {
    super({ key: 'StoreInterior' });
  }

  create() {
    const { width, height } = this.scale;
    announceScene(this);
    this.input.enabled = true;
    this.playerId = this.getOrCreatePlayerId();
    this.playerUsername = this.getOrCreateUsername();
    this.dialog = new DialogSystem(this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleSceneShutdown, this);
    this.cleanupFns.push(eventBus.on(EVENTS.SHOP_OPEN, () => {
      this.shopOverlayOpen = true;
    }));
    this.cleanupFns.push(eventBus.on(EVENTS.SHOP_CLOSE, () => {
      this.shopOverlayOpen = false;
    }));

    const g = this.add.graphics();
    g.fillStyle(0x0c0c16);
    g.fillRect(0, 0, WORLD.WIDTH, WORLD.HEIGHT);

    const roomW = 640;
    const roomH = 400;
    const roomX = (width - roomW) / 2;
    const roomY = (height - roomH) / 2;

    g.fillStyle(0x141426);
    g.fillRect(roomX, roomY, roomW, roomH);
    g.lineStyle(3, COLORS.GOLD, 0.6);
    g.strokeRect(roomX, roomY, roomW, roomH);

    g.fillStyle(0x151520);
    g.fillRect(roomX + 40, roomY + 70, 120, 40);
    g.fillRect(roomX + roomW - 160, roomY + 70, 120, 40);
    g.fillRect(roomX + 40, roomY + 150, 120, 40);
    g.fillRect(roomX + roomW - 160, roomY + 150, 120, 40);

    const floor = this.add.rectangle(width / 2, roomY + roomH - 60, roomW - 40, 90, 0x111018, 0.9);
    floor.setStrokeStyle(2, 0x000000, 0.6);

    this.px = width / 2;
    this.py = roomY + roomH - 80;
    this.player = new AvatarRenderer(this, this.px, this.py, loadStoredAvatarConfig());
    this.player.setDepth(10);
    this.localNameplate = this.add.text(this.px, this.py - 44, this.playerUsername, {
      fontSize: '8px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#F5C842',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5, 1).setDepth(20);

    this.add.text(width / 2, roomY + 24, 'WASPI STORE', {
      fontSize: '16px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#F5C842',
    }).setOrigin(0.5);

    this.add.text(width / 2, roomY + 52, 'CLICK EN UNA PRENDA Y ABRI EL CHECKOUT', {
      fontSize: '8px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#888888',
    }).setOrigin(0.5);
    createBackButton(this, () => this.exitToWorld());

    const vendor = this.add.rectangle(width / 2, roomY + 120, 42, 56, 0x241a10, 1)
      .setStrokeStyle(2, COLORS.GOLD, 0.45);
    this.vendorX = vendor.x;
    this.vendorY = vendor.y;
    this.add.text(width / 2, roomY + 158, 'NPC VENDEDOR', {
      fontSize: '8px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#F5C842',
    }).setOrigin(0.5);
    vendor.setDepth(5);

    const listX = roomX + 210;
    let listY = roomY + 90;
    const items = CATALOG.filter((item) => typeof item.priceArs === 'number');

    items.forEach((item) => {
      const row = this.add.rectangle(listX, listY, 360, 30, 0x0b0b12, 1)
        .setStrokeStyle(1, 0x333333, 1)
        .setInteractive({ useHandCursor: true });
      const swatch = this.add.rectangle(listX - 165, listY, 18, 18, item.color ?? 0x111111, 1)
        .setStrokeStyle(1, 0x000000, 0.35)
        .setInteractive({ useHandCursor: true });
      const label = this.add.text(listX - 140, listY - 4, item.name, {
        fontSize: '8px',
        fontFamily: '"Silkscreen", monospace',
        color: '#FFFFFF',
      }).setOrigin(0, 0.5).setInteractive({ useHandCursor: true });
      this.add.text(listX - 140, listY + 8, `Talles: ${(item.sizes ?? []).join(' / ')}`, {
        fontSize: '7px',
        fontFamily: '"Silkscreen", monospace',
        color: '#7f7f92',
      }).setOrigin(0, 0.5);
      const price = this.add.text(listX + 165, listY, `ARS ${item.priceArs?.toLocaleString('es-AR')}`, {
        fontSize: '8px',
        fontFamily: '"Press Start 2P", monospace',
        color: '#F5C842',
      }).setOrigin(1, 0.5).setInteractive({ useHandCursor: true });

      const openShop = () => {
        if (this.shopOverlayOpen) return;
        this.selectedItemId = item.id;
        eventBus.emit(EVENTS.SHOP_OPEN, {
          tab: 'products',
          itemId: item.id,
          source: 'store_interior',
        });
        this.flashMessage(width / 2, roomY + roomH - 30, 'SHOP ABIERTO', '#39FF14');
      };

      row.on('pointerdown', openShop);
      swatch.on('pointerdown', openShop);
      label.on('pointerdown', openShop);
      price.on('pointerdown', openShop);

      listY += 34;
    });

    this.add.text(width / 2, roomY + roomH + 24, 'ACERCATE AL VENDEDOR Y APRETA SPACE', {
      fontSize: '8px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#666666',
    }).setOrigin(0.5);

    this.keyEsc = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    this.keySpace = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.keyW = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W);
    this.keyA = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.keyS = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S);
    this.keyD = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D);
    this.setupRealtime();

    this.cameras.main.resetFX();
    this.cameras.main.setAlpha(1);
    this.cameras.main.fadeIn(250, 0, 0, 0);
  }

  private flashMessage(x: number, y: number, msg: string, color: string) {
    const text = this.add.text(x, y, msg, {
      fontSize: '10px',
      fontFamily: '"Press Start 2P", monospace',
      color,
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(9999);
    this.tweens.add({
      targets: text,
      alpha: { from: 1, to: 0 },
      y: y - 10,
      duration: 700,
      ease: 'Sine.easeOut',
      onComplete: () => text.destroy(),
    });
  }

  update() {
    if (this.inTransition) return;
    this.syncPosition();
    this.updateRemotePlayers();

    if (this.shopOverlayOpen) {
      if (Phaser.Input.Keyboard.JustDown(this.keyEsc)) {
        this.shopOverlayOpen = false;
        eventBus.emit(EVENTS.SHOP_CLOSE);
      }
      return;
    }

    if (!this.dialog.isActive()) {
      this.handleMovement();
    }

    if (Phaser.Input.Keyboard.JustDown(this.keyEsc)) {
      if (this.dialog.isActive()) {
        this.dialog.clear();
        return;
      }
      this.exitToWorld();
      return;
    }

    if (Phaser.Input.Keyboard.JustDown(this.keySpace)) {
      if (this.dialog.isActive()) {
        this.dialog.advance();
      } else {
        this.tryStartVendorDialog();
      }
    }
  }

  private exitToWorld() {
    if (this.inTransition) return;
    this.dialog.clear();
    this.shopOverlayOpen = false;
    eventBus.emit(EVENTS.SHOP_CLOSE);
    this.inTransition = true;
    transitionToScene(this, 'WorldScene', {
      returnX: StoreInterior.RETURN_X,
      returnY: StoreInterior.RETURN_Y,
    });
  }

  private tryStartVendorDialog() {
    if (this.shopOverlayOpen) return;

    const dx = this.px - this.vendorX;
    const dy = this.py - this.vendorY;
    const distSq = dx * dx + dy * dy;
    if (distSq > 160 * 160) return;

    const lines = [
      'Vendedor: Bienvenido a WASPI STORE.',
      'Todo lo que compres aca llega a tu casa y a tu Waspi.',
      'Elegi una prenda y abrimos el checkout con Stripe.',
    ];

    this.dialog.start(lines, {}, () => {
      const first = CATALOG.find((item) => typeof item.priceArs === 'number');
      const itemId = first?.id ?? undefined;
      if (itemId) {
        this.selectedItemId = itemId;
      }
      eventBus.emit(EVENTS.SHOP_OPEN, {
        tab: 'products',
        itemId,
        source: 'store_interior',
      });
      this.flashMessage(this.scale.width / 2, this.scale.height - 40, 'SHOP ABIERTO', '#39FF14');
    });
  }

  private handleMovement() {
    const speed = 180 / 60;
    let dx = 0;
    let dy = 0;

    const left = this.cursors.left.isDown || this.keyA.isDown;
    const right = this.cursors.right.isDown || this.keyD.isDown;
    const up = this.cursors.up.isDown || this.keyW.isDown;
    const down = this.cursors.down.isDown || this.keyS.isDown;

    if (left) dx -= 1;
    if (right) dx += 1;
    if (up) dy -= 1;
    if (down) dy += 1;

    if (dx !== 0 && dy !== 0) {
      dx *= 0.707;
      dy *= 0.707;
    }

    const { width, height } = this.scale;
    const roomW = 640;
    const roomH = 400;
    const roomX = (width - roomW) / 2 + 20;
    const roomY = (height - roomH) / 2 + 20;

    this.px = Phaser.Math.Clamp(this.px + dx * speed * 16.6, roomX, roomX + roomW - 40);
    this.py = Phaser.Math.Clamp(this.py + dy * speed * 16.6, roomY + 40, roomY + roomH - 10);

    this.player.update(dx !== 0 || dy !== 0, dx);
    this.player.setPosition(this.px, this.py);
    this.player.setDepth(10 + Math.floor(this.py / 10));
    this.localNameplate?.setPosition(this.px, this.py - 44);
    this.lastMoveDx = dx;
    this.lastIsMoving = dx !== 0 || dy !== 0;
  }

  private handleSceneShutdown() {
    if (this.channel) {
      this.channel.send({
        type: 'broadcast',
        event: 'player:leave',
        payload: { player_id: this.playerId },
      });
      this.channel.unsubscribe();
      this.channel = null;
    }
    this.remotePlayers.forEach((player) => {
      player.avatar.destroy();
      player.nameplate.destroy();
    });
    this.remotePlayers.clear();
    eventBus.emit(EVENTS.SHOP_CLOSE);
    this.cleanupFns.forEach((cleanup) => cleanup());
    this.cleanupFns = [];
  }

  private setupRealtime() {
    if (!supabase || !isConfigured) return;

    this.channel = supabase.channel('waspi-room-store', {
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

  private broadcastSelfState(event: 'player:join' | 'player:move') {
    if (!this.channel) return;
    this.channel.send({
      type: 'broadcast',
      event,
      payload: {
        player_id: this.playerId,
        username: this.playerUsername,
        x: Math.round(this.px),
        y: Math.round(this.py),
        dir: this.lastMoveDx,
        moving: this.lastIsMoving,
        avatar: loadStoredAvatarConfig(),
      },
    });
  }

  private syncPosition() {
    if (!this.channel) return;
    const now = Date.now();
    if (now - this.lastPosSent < 66) return;
    this.lastPosSent = now;
    this.broadcastSelfState('player:move');
  }

  private updateRemotePlayers() {
    for (const remote of this.remotePlayers.values()) {
      remote.x = Phaser.Math.Linear(remote.x, remote.targetX, 0.18);
      remote.y = Phaser.Math.Linear(remote.y, remote.targetY, 0.18);
      remote.avatar.update(remote.isMoving, remote.moveDx);
      remote.avatar.setPosition(remote.x, remote.y);
      remote.avatar.setDepth(10 + Math.floor(remote.y / 10));
      remote.nameplate.setPosition(remote.x, remote.y - 44);
    }
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
    remote.nameplate.setText(next.username);
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
    remote.isMoving = next.moving ?? false;
    remote.username = next.username;
    remote.nameplate.setText(next.username);
  }

  private handleRemoteLeave(payload: unknown) {
    const playerId = this.readStringField(payload, 'player_id', 'playerId');
    if (!playerId) return;
    const remote = this.remotePlayers.get(playerId);
    if (!remote) return;
    remote.avatar.destroy();
    remote.nameplate.destroy();
    this.remotePlayers.delete(playerId);
  }

  private spawnRemotePlayer(playerId: string, username: string, x: number, y: number, avatarConfig: AvatarConfig) {
    const avatar = new AvatarRenderer(this, x, y, avatarConfig);
    avatar.setDepth(10 + Math.floor(y / 10));
    const nameplate = this.add.text(x, y - 44, username, {
      fontSize: '8px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#88AAFF',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5, 1).setDepth(20);

    this.remotePlayers.set(playerId, {
      avatar,
      nameplate,
      username,
      x,
      y,
      targetX: x,
      targetY: y,
      moveDx: 0,
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

  private parseRemoteState(payload: unknown) {
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
      moving: this.readBooleanField(payload, 'moving', 'isMoving'),
      avatar,
    };
  }
}
