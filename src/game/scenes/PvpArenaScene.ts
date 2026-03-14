import Phaser from 'phaser';
import { AvatarRenderer, type AvatarConfig, loadStoredAvatarConfig } from '../systems/AvatarRenderer';
import { COLORS } from '../config/constants';
import { getTenksBalance, initTenks } from '../systems/TenksSystem';
import { announceScene, createBackButton } from '../systems/SceneUi';
import { supabase, isConfigured } from '../../lib/supabase';

type ArenaRemotePlayer = {
  avatar: AvatarRenderer;
  nameplate: Phaser.GameObjects.Text;
  username: string;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  moveDx: number;
  isMoving: boolean;
  ready: boolean;
  bet: number;
  inMatch: boolean;
  lives: number;
  hp: number;
  alive: boolean;
  slot: 0 | 1 | null;
  matchId: string;
};

type ArenaStatePayload = {
  player_id: string;
  username: string;
  x: number;
  y: number;
  dir?: number | null;
  moving?: boolean | null;
  avatar?: AvatarConfig;
  ready?: boolean | null;
  bet?: number | null;
  in_match?: boolean | null;
  lives?: number | null;
  hp?: number | null;
  alive?: boolean | null;
  slot?: number | null;
  match_id?: string | null;
};

type MatchStartPayload = {
  match_id: string;
  bet: number;
  players: string[];
  leader_id: string;
};

type HitPayload = {
  match_id: string;
  source_id: string;
  target_id: string;
  dmg: number;
  knockback_x: number;
  knockback_y: number;
};

type MatchEndPayload = {
  match_id: string;
  winner_id: string;
  loser_id: string;
  pot: number;
  reason?: string;
};

const BET_OPTIONS = [250, 500, 1000] as const;
const PLAYER_RADIUS = 18;
const MOVE_SPEED = 186;
const MAX_HP = 100;
const MAX_LIVES = 3;
const RESPAWN_MS = 1600;
const COUNTDOWN_MS = 3000;
const RESULT_MS = 2600;
const MOVE_SYNC_MS = 66;
const RANGE = 520;
const DAMAGE = 32;
const COOLDOWN_MS = 180;
const KNOCKBACK = 22;
const RETURN_WORLD_X = 980;
const RETURN_WORLD_Y = 1130;

const LOBBY_BOUNDS = new Phaser.Geom.Rectangle(38, 72, 724, 108);
const ARENA_BOUNDS = new Phaser.Geom.Rectangle(38, 202, 724, 352);
const SPAWNS = [
  { x: ARENA_BOUNDS.x + 98, y: ARENA_BOUNDS.centerY },
  { x: ARENA_BOUNDS.right - 98, y: ARENA_BOUNDS.centerY },
] as const;

const COVER_RECTS = [
  new Phaser.Geom.Rectangle(ARENA_BOUNDS.x + 112, ARENA_BOUNDS.y + 56, 74, 44),
  new Phaser.Geom.Rectangle(ARENA_BOUNDS.x + 92, ARENA_BOUNDS.bottom - 104, 92, 46),
  new Phaser.Geom.Rectangle(ARENA_BOUNDS.right - 186, ARENA_BOUNDS.y + 56, 92, 46),
  new Phaser.Geom.Rectangle(ARENA_BOUNDS.right - 186, ARENA_BOUNDS.bottom - 104, 74, 44),
  new Phaser.Geom.Rectangle(ARENA_BOUNDS.centerX - 132, ARENA_BOUNDS.centerY - 28, 74, 56),
  new Phaser.Geom.Rectangle(ARENA_BOUNDS.centerX + 58, ARENA_BOUNDS.centerY - 28, 74, 56),
  new Phaser.Geom.Rectangle(ARENA_BOUNDS.centerX - 26, ARENA_BOUNDS.y + 42, 52, 62),
  new Phaser.Geom.Rectangle(ARENA_BOUNDS.centerX - 26, ARENA_BOUNDS.bottom - 104, 52, 62),
  new Phaser.Geom.Rectangle(ARENA_BOUNDS.centerX - 14, ARENA_BOUNDS.centerY - 118, 28, 236),
] as const;

export class PvpArenaScene extends Phaser.Scene {
  private playerId = '';
  private authUserId = '';
  private username = '';
  private avatarConfig: AvatarConfig = {};
  private channel: ReturnType<NonNullable<typeof supabase>['channel']> | null = null;
  private remotePlayers = new Map<string, ArenaRemotePlayer>();
  private player!: AvatarRenderer;
  private playerNameplate!: Phaser.GameObjects.Text;
  private px = LOBBY_BOUNDS.centerX;
  private py = LOBBY_BOUNDS.bottom - 26;
  private lastMoveDx = 0;
  private lastIsMoving = false;
  private lastPosSent = 0;
  private lastShotAt = 0;
  private lastDamageAt = 0;
  private selectedBet: number = BET_OPTIONS[0];
  private ready = false;
  private inMatch = false;
  private alive = true;
  private hp = MAX_HP;
  private lives = MAX_LIVES;
  private matchId = '';
  private matchBet = 0;
  private opponentId = '';
  private slot: 0 | 1 | null = null;
  private respawnAt = 0;
  private countdownEndsAt = 0;
  private matchResolved = false;
  private paidEntryForMatch = '';
  private serverReservedMatchId = '';
  private lossReportedMatchId = '';
  private handledMatchResults = new Set<string>();
  private observedMatchResultId = '';
  private startThrottleUntil = 0;
  private opponentReadyDeadline = 0;
  private inTransition = false;
  private arenaStatus!: Phaser.GameObjects.Text;
  private rosterText!: Phaser.GameObjects.Text;
  private liveBoardText!: Phaser.GameObjects.Text;
  private spectatorText!: Phaser.GameObjects.Text;
  private betText!: Phaser.GameObjects.Text;
  private readyText!: Phaser.GameObjects.Text;
  private hpText!: Phaser.GameObjects.Text;
  private livesText!: Phaser.GameObjects.Text;
  private noticeText!: Phaser.GameObjects.Text;
  private countdownText!: Phaser.GameObjects.Text;
  private keyEsc!: Phaser.Input.Keyboard.Key;
  private keySpace!: Phaser.Input.Keyboard.Key;
  private keyOne!: Phaser.Input.Keyboard.Key;
  private keyTwo!: Phaser.Input.Keyboard.Key;
  private keyThree!: Phaser.Input.Keyboard.Key;
  private keyF!: Phaser.Input.Keyboard.Key;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keyW!: Phaser.Input.Keyboard.Key;
  private keyA!: Phaser.Input.Keyboard.Key;
  private keyS!: Phaser.Input.Keyboard.Key;
  private keyD!: Phaser.Input.Keyboard.Key;
  private pointerShootHandler?: (pointer: Phaser.Input.Pointer) => void;
  private readyBusy = false;

  constructor() {
    super({ key: 'PvpArenaScene' });
  }

  create() {
    announceScene(this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleShutdown, this);

    this.playerId = this.getOrCreatePlayerId();
    this.username = this.getOrCreateUsername();
    this.avatarConfig = loadStoredAvatarConfig();

    this.drawScene();
    this.createUi();
    createBackButton(this, () => this.requestExit(), 'SALIR');

    this.player = new AvatarRenderer(this, this.px, this.py, this.avatarConfig);
    this.player.setDepth(20);
    this.playerNameplate = this.add.text(this.px, this.py - 46, this.username, {
      fontSize: '8px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#F5C842',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5, 1).setDepth(100);

    this.keyEsc = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    this.keySpace = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.keyOne = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ONE);
    this.keyTwo = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.TWO);
    this.keyThree = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.THREE);
    this.keyF = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.F);
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.keyW = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W);
    this.keyA = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.keyS = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S);
    this.keyD = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D);

    this.pointerShootHandler = (pointer: Phaser.Input.Pointer) => {
      if (!pointer.leftButtonDown()) return;
      this.shoot(pointer.worldX, pointer.worldY);
    };
    this.input.on('pointerdown', this.pointerShootHandler);

    this.setupChannel();
    void this.syncAuthenticatedIdentity();
    this.refreshUi();
    this.cameras.main.resetFX();
    this.cameras.main.setAlpha(1);
    this.cameras.main.fadeIn(220, 0, 0, 0);
  }

  update(_time: number, delta: number) {
    if (this.inTransition) return;

    this.handleBetInput();
    this.handleReadyInput();

    if (Phaser.Input.Keyboard.JustDown(this.keyEsc)) {
      this.requestExit();
      return;
    }

    this.handleMovement(delta);
    this.syncState();
    this.updateRemotes();
    this.maybeStartMatch();
    this.maybeRespawn();
    this.maybeAbortUnpairedMatch();

    if (this.inMatch && this.alive && this.time.now >= this.countdownEndsAt) {
      if (this.keyF.isDown || this.input.activePointer.leftButtonDown()) {
        this.shoot(this.input.activePointer.worldX, this.input.activePointer.worldY);
      }
    }

    this.refreshUi();
  }

  private drawScene() {
    const g = this.add.graphics();
    g.fillStyle(0x06060f);
    g.fillRect(0, 0, 800, 600);

    g.fillStyle(0x11111b);
    g.fillRoundedRect(24, 24, 752, 552, 18);
    g.lineStyle(2, 0x2b2b41, 0.9);
    g.strokeRoundedRect(24, 24, 752, 552, 18);

    // Crowd glow / presentation pass
    g.fillStyle(0xff006e, 0.08);
    g.fillEllipse(180, 238, 180, 60);
    g.fillStyle(0x46b3ff, 0.08);
    g.fillEllipse(622, 238, 180, 60);

    g.fillStyle(0x140d08, 0.98);
    g.fillRoundedRect(LOBBY_BOUNDS.x, LOBBY_BOUNDS.y, LOBBY_BOUNDS.width, LOBBY_BOUNDS.height, 14);
    g.lineStyle(2, COLORS.GOLD, 0.45);
    g.strokeRoundedRect(LOBBY_BOUNDS.x, LOBBY_BOUNDS.y, LOBBY_BOUNDS.width, LOBBY_BOUNDS.height, 14);

    g.fillStyle(0x0c1116, 0.98);
    g.fillRoundedRect(ARENA_BOUNDS.x, ARENA_BOUNDS.y, ARENA_BOUNDS.width, ARENA_BOUNDS.height, 16);
    g.lineStyle(3, 0x4a6680, 0.55);
    g.strokeRoundedRect(ARENA_BOUNDS.x, ARENA_BOUNDS.y, ARENA_BOUNDS.width, ARENA_BOUNDS.height, 16);

    g.fillStyle(0x141b24, 1);
    g.fillRoundedRect(ARENA_BOUNDS.x + 12, ARENA_BOUNDS.y - 18, 168, 34, 10);
    g.fillRoundedRect(ARENA_BOUNDS.right - 180, ARENA_BOUNDS.y - 18, 168, 34, 10);
    g.lineStyle(2, 0x26384a, 0.9);
    g.strokeRoundedRect(ARENA_BOUNDS.x + 12, ARENA_BOUNDS.y - 18, 168, 34, 10);
    g.strokeRoundedRect(ARENA_BOUNDS.right - 180, ARENA_BOUNDS.y - 18, 168, 34, 10);

    // Lane tinting so the arena reads like left / center / right paths
    g.fillStyle(0x14304a, 0.14);
    g.fillRoundedRect(ARENA_BOUNDS.x + 18, ARENA_BOUNDS.y + 28, 140, ARENA_BOUNDS.height - 56, 16);
    g.fillStyle(0x28161b, 0.12);
    g.fillRoundedRect(ARENA_BOUNDS.right - 158, ARENA_BOUNDS.y + 28, 140, ARENA_BOUNDS.height - 56, 16);
    g.fillStyle(0x22303b, 0.1);
    g.fillRoundedRect(ARENA_BOUNDS.centerX - 84, ARENA_BOUNDS.y + 20, 168, ARENA_BOUNDS.height - 40, 18);

    // Spectator rails
    g.fillStyle(0x1a1510, 1);
    g.fillRect(ARENA_BOUNDS.x + 18, ARENA_BOUNDS.y + 8, ARENA_BOUNDS.width - 36, 16);
    g.fillRect(ARENA_BOUNDS.x + 18, ARENA_BOUNDS.bottom - 24, ARENA_BOUNDS.width - 36, 16);
    g.lineStyle(2, 0x6a5435, 0.6);
    for (let x = ARENA_BOUNDS.x + 24; x < ARENA_BOUNDS.right - 24; x += 28) {
      g.lineBetween(x, ARENA_BOUNDS.y + 8, x, ARENA_BOUNDS.y + 24);
      g.lineBetween(x, ARENA_BOUNDS.bottom - 24, x, ARENA_BOUNDS.bottom - 8);
    }

    g.lineStyle(1, 0x1b2430, 0.55);
    for (let x = ARENA_BOUNDS.x + 16; x < ARENA_BOUNDS.right - 12; x += 28) {
      g.lineBetween(x, ARENA_BOUNDS.y + 12, x, ARENA_BOUNDS.bottom - 12);
    }
    for (let y = ARENA_BOUNDS.y + 12; y < ARENA_BOUNDS.bottom - 12; y += 28) {
      g.lineBetween(ARENA_BOUNDS.x + 12, y, ARENA_BOUNDS.right - 12, y);
    }

    COVER_RECTS.forEach((rect, index) => {
      const isCenterSpine = index === COVER_RECTS.length - 1;
      const isMidAnchor = index === 4 || index === 5;
      g.fillStyle(isCenterSpine ? 0x3a5166 : (isMidAnchor ? 0x2b4254 : 0x22313f), 1);
      g.fillRoundedRect(rect.x, rect.y, rect.width, rect.height, 10);
      g.lineStyle(2, isCenterSpine ? 0x8fd6ff : 0x7fb8ff, isCenterSpine ? 0.62 : 0.4);
      g.strokeRoundedRect(rect.x, rect.y, rect.width, rect.height, 10);
    });

    this.add.text(ARENA_BOUNDS.x + 84, ARENA_BOUNDS.y + 22, 'LEFT LANE', {
      fontSize: '6px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#6CB6FF',
    }).setOrigin(0.5);
    this.add.text(ARENA_BOUNDS.centerX, ARENA_BOUNDS.y + 22, 'CENTER RISK', {
      fontSize: '6px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#C9D7E8',
    }).setOrigin(0.5);
    this.add.text(ARENA_BOUNDS.right - 84, ARENA_BOUNDS.y + 22, 'RIGHT LANE', {
      fontSize: '6px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#FF9B9B',
    }).setOrigin(0.5);

    this.add.text(400, 48, 'PVP PIT', {
      fontSize: '14px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#F5C842',
    }).setOrigin(0.5);

    this.add.text(400, 68, '1V1 / 3 VIDAS / EL GANADOR SE LLEVA EL POZO', {
      fontSize: '8px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#9A9AB2',
    }).setOrigin(0.5);

    this.add.text(160, 226, 'BLUE CORNER', {
      fontSize: '7px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#46B3FF',
    }).setOrigin(0.5);
    this.add.text(640, 226, 'RED CORNER', {
      fontSize: '7px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#FF6E6E',
    }).setOrigin(0.5);

    this.drawBookie(88, 132);
    this.drawSpawnPad(SPAWNS[0].x, SPAWNS[0].y, 0x46b3ff, 'SPAWN A / PEEK LEFT');
    this.drawSpawnPad(SPAWNS[1].x, SPAWNS[1].y, 0xff5e5e, 'SPAWN B / PEEK RIGHT');
  }

  private drawBookie(x: number, y: number) {
    this.add.ellipse(x, y + 30, 28, 10, 0x000000, 0.35);
    this.add.circle(x, y, 14, 0xD2A46A);
    this.add.rectangle(x, y + 24, 30, 28, 0x4a2f80);
    this.add.rectangle(x - 14, y + 24, 8, 18, 0xD2A46A);
    this.add.rectangle(x + 14, y + 24, 8, 18, 0xD2A46A);
    this.add.text(x, y - 28, 'BOTI', {
      fontSize: '7px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#F5C842',
    }).setOrigin(0.5);
  }

  private drawSpawnPad(x: number, y: number, color: number, label: string) {
    this.add.ellipse(x, y + 18, 92, 24, color, 0.12).setStrokeStyle(1, color, 0.42);
    this.add.text(x, y + 34, label, {
      fontSize: '6px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#8EA4BE',
    }).setOrigin(0.5);
  }

  private createUi() {
    this.betText = this.add.text(170, 94, '', {
      fontSize: '8px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#F5C842',
    });
    this.readyText = this.add.text(170, 116, '', {
      fontSize: '8px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#B8D7FF',
    });
    this.rosterText = this.add.text(170, 140, '', {
      fontSize: '7px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#D6D7E0',
      lineSpacing: 8,
    });
    this.liveBoardText = this.add.text(610, 90, '', {
      fontSize: '7px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#F0F3FF',
      lineSpacing: 8,
      align: 'right',
    }).setOrigin(1, 0);
    this.spectatorText = this.add.text(610, 146, '', {
      fontSize: '7px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#9FC6FF',
      lineSpacing: 7,
      align: 'right',
    }).setOrigin(1, 0);
    this.arenaStatus = this.add.text(400, 210, '', {
      fontSize: '8px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#8EA4BE',
    }).setOrigin(0.5);
    this.hpText = this.add.text(56, 560, '', {
      fontSize: '8px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#FF7A7A',
    });
    this.livesText = this.add.text(282, 560, '', {
      fontSize: '8px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#F5C842',
    });
    this.noticeText = this.add.text(400, 562, '', {
      fontSize: '8px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#39FF14',
    }).setOrigin(0.5);
    this.countdownText = this.add.text(400, 388, '', {
      fontSize: '16px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#F5C842',
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5).setDepth(1000);

    this.add.text(742, 88, '1/2/3 APUESTA', {
      fontSize: '7px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#B2B4C6',
    }).setOrigin(1, 0);
    this.add.text(742, 106, 'SPACE LISTO', {
      fontSize: '7px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#B2B4C6',
    }).setOrigin(1, 0);
    this.add.text(742, 124, 'CLICK / F DISPARA', {
      fontSize: '7px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#B2B4C6',
    }).setOrigin(1, 0);
    this.add.text(742, 142, 'ESC VOLVER', {
      fontSize: '7px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#B2B4C6',
    }).setOrigin(1, 0);
  }

  private setupChannel() {
    if (!supabase || !isConfigured) {
      this.flashNotice('REALTIME OFF - NECESITAS SUPABASE', '#FF7A7A');
      return;
    }

    this.channel = supabase.channel('waspi-room-pvp-pit', {
      config: { broadcast: { self: false } },
    });

    this.channel
      .on('broadcast', { event: 'player:join' }, ({ payload }) => this.handleRemoteState(payload))
      .on('broadcast', { event: 'player:move' }, ({ payload }) => this.handleRemoteState(payload))
      .on('broadcast', { event: 'player:leave' }, ({ payload }) => this.handleRemoteLeave(payload))
      .on('broadcast', { event: 'pvp:match_start' }, ({ payload }) => this.handleMatchStart(payload))
      .on('broadcast', { event: 'pvp:hit' }, ({ payload }) => this.handleHit(payload))
      .on('broadcast', { event: 'pvp:match_end' }, ({ payload }) => this.handleMatchEnd(payload))
      .subscribe(() => {
        this.broadcastState('player:join');
      });
  }

  private handleMovement(delta: number) {
    if (this.countdownEndsAt > this.time.now || (!this.alive && this.inMatch)) {
      this.lastMoveDx = 0;
      this.lastIsMoving = false;
      this.player.update(false, 0);
      return;
    }

    const left = this.cursors.left.isDown || this.keyA.isDown;
    const right = this.cursors.right.isDown || this.keyD.isDown;
    const up = this.cursors.up.isDown || this.keyW.isDown;
    const down = this.cursors.down.isDown || this.keyS.isDown;
    const mx = (right ? 1 : 0) - (left ? 1 : 0);
    const my = (down ? 1 : 0) - (up ? 1 : 0);
    const moving = mx !== 0 || my !== 0;
    this.lastMoveDx = mx;
    this.lastIsMoving = moving;

    if (!moving) {
      this.player.update(false, this.lastMoveDx);
      return;
    }

    const length = Math.hypot(mx, my) || 1;
    const vx = (mx / length) * MOVE_SPEED * (delta / 1000);
    const vy = (my / length) * MOVE_SPEED * (delta / 1000);
    const bounds = this.inMatch ? ARENA_BOUNDS : LOBBY_BOUNDS;
    let nextX = Phaser.Math.Clamp(this.px + vx, bounds.left + PLAYER_RADIUS, bounds.right - PLAYER_RADIUS);
    let nextY = Phaser.Math.Clamp(this.py + vy, bounds.top + PLAYER_RADIUS, bounds.bottom - PLAYER_RADIUS);

    if (this.inMatch) {
      nextX = this.resolveObstacleX(nextX);
      nextY = this.resolveObstacleY(nextY);
    }

    this.px = nextX;
    this.py = nextY;
    this.player.setPosition(this.px, this.py);
    this.player.setDepth(20 + Math.floor(this.py / 10));
    this.player.update(true, mx);
    this.playerNameplate.setPosition(this.px, this.py - 46);
  }

  private resolveObstacleX(nextX: number) {
    if (!this.collidesWithCover(nextX, this.py)) return nextX;
    return this.px;
  }

  private resolveObstacleY(nextY: number) {
    if (!this.collidesWithCover(this.px, nextY)) return nextY;
    return this.py;
  }

  private collidesWithCover(x: number, y: number) {
    return COVER_RECTS.some((rect) => circleRectOverlap(x, y, PLAYER_RADIUS, rect));
  }

  private handleBetInput() {
    if (this.inMatch) return;
    if (Phaser.Input.Keyboard.JustDown(this.keyOne)) this.setBet(BET_OPTIONS[0]);
    if (Phaser.Input.Keyboard.JustDown(this.keyTwo)) this.setBet(BET_OPTIONS[1]);
    if (Phaser.Input.Keyboard.JustDown(this.keyThree)) this.setBet(BET_OPTIONS[2]);
  }

  private setBet(next: number) {
    if (this.selectedBet === next) return;
    this.selectedBet = next;
    if (this.ready) this.ready = false;
    this.broadcastState('player:move');
    this.flashNotice(`APUESTA ${next} TENKS`, '#F5C842');
  }

  private handleReadyInput() {
    if (this.inMatch || !Phaser.Input.Keyboard.JustDown(this.keySpace) || this.readyBusy) return;
    void this.toggleReady();
  }

  private async toggleReady() {
    this.readyBusy = true;
    const auth = await this.getAuthSessionInfo();
    if (!auth) {
      this.flashNotice('INICIA SESION PARA APOSTAR EN PVP', '#FF7A7A');
      this.readyBusy = false;
      return;
    }
    this.applyAuthenticatedIdentity(auth.userId);
    if (getTenksBalance() < this.selectedBet) {
      this.flashNotice('NO TENES TENKS PARA ESA APUESTA', '#FF7A7A');
      this.readyBusy = false;
      return;
    }
    this.ready = !this.ready;
    this.broadcastState('player:move');
    this.flashNotice(this.ready ? 'LISTO PARA PELEAR' : 'LISTO CANCELADO', this.ready ? '#39FF14' : '#F5C842');
    this.readyBusy = false;
  }

  private maybeStartMatch() {
    if (!this.ready || this.inMatch || this.time.now < this.startThrottleUntil) return;
    const readyPlayers = [
      { playerId: this.playerId, bet: this.selectedBet, ready: this.ready },
      ...Array.from(this.remotePlayers.entries()).map(([playerId, player]) => ({
        playerId,
        bet: player.bet,
        ready: player.ready,
      })),
    ]
      .filter((player) => player.ready && player.bet === this.selectedBet)
      .sort((a, b) => a.playerId.localeCompare(b.playerId));

    if (readyPlayers.length < 2) return;
    if (readyPlayers[0].playerId !== this.playerId) return;

    const players = readyPlayers.slice(0, 2).map((player) => player.playerId);
    const payload: MatchStartPayload = {
      match_id: `${Date.now()}-${this.playerId}`,
      bet: this.selectedBet,
      players,
      leader_id: this.playerId,
    };
    this.startThrottleUntil = this.time.now + 1500;
    this.channel?.send({ type: 'broadcast', event: 'pvp:match_start', payload });
    this.handleMatchStart(payload);
  }

  private handleMatchStart(payload: unknown) {
    const next = parseMatchStartPayload(payload);
    if (!next) return;
    if (!next.players.includes(this.playerId)) return;
    if (this.matchId === next.match_id && this.inMatch) return;
    const localReadyForThisBet = this.ready && this.selectedBet === next.bet;
    if (!localReadyForThisBet) return;
    const opponentId = next.players.find((playerId) => playerId !== this.playerId) ?? '';
    const opponent = this.remotePlayers.get(opponentId);
    if (!opponent || !opponent.ready || opponent.bet !== next.bet) return;
    void this.beginMatchStart(next);
  }

  private async beginMatchStart(next: MatchStartPayload) {
    if (getTenksBalance() < next.bet) {
      this.ready = false;
      this.broadcastState('player:move');
      this.flashNotice('NO ALCANZA PARA ENTRAR AL MATCH', '#FF7A7A');
      return;
    }

    const slot = next.players[0] === this.playerId ? 0 : 1;
    const opponentId = next.players[slot === 0 ? 1 : 0] ?? '';
    const reserved = await this.reserveStake(next.match_id, next.bet, opponentId);
    if (!reserved) {
      this.ready = false;
      this.broadcastState('player:move');
      return;
    }

    this.ready = false;
    this.inMatch = true;
    this.alive = true;
    this.hp = MAX_HP;
    this.lives = MAX_LIVES;
    this.matchId = next.match_id;
    this.matchBet = next.bet;
    this.matchResolved = false;
    this.observedMatchResultId = '';
    this.slot = slot;
    this.opponentId = opponentId;
    this.respawnAt = 0;
    this.countdownEndsAt = this.time.now + COUNTDOWN_MS;
    this.opponentReadyDeadline = this.time.now + COUNTDOWN_MS + 1600;
    this.teleportToSpawn(this.slot);
    this.flashNotice(`MATCH POR ${next.bet} TENKS`, '#39FF14');
    this.broadcastState('player:move');
  }

  private teleportToSpawn(slot: 0 | 1 | null) {
    if (slot === null) return;
    this.px = SPAWNS[slot].x;
    this.py = SPAWNS[slot].y;
    this.player.setPosition(this.px, this.py);
    this.playerNameplate.setPosition(this.px, this.py - 46);
  }

  private maybeRespawn() {
    if (!this.inMatch || this.alive || this.respawnAt === 0 || this.time.now < this.respawnAt) return;
    this.alive = true;
    this.hp = MAX_HP;
    this.respawnAt = 0;
    this.countdownEndsAt = this.time.now + 850;
    this.teleportToSpawn(this.slot);
    this.broadcastState('player:move');
    this.flashNotice(`VIDAS ${this.lives}`, '#46B3FF');
  }

  private maybeAbortUnpairedMatch() {
    if (!this.inMatch || !this.matchId || !this.opponentReadyDeadline) return;
    if (this.time.now < this.opponentReadyDeadline) return;
    const opponent = this.remotePlayers.get(this.opponentId);
    if (opponent?.inMatch && opponent.matchId === this.matchId) {
      this.opponentReadyDeadline = 0;
      return;
    }

    const matchId = this.matchId;
    this.flashNotice('MATCH CANCELADO: RIVAL NO ENTRO', '#FFB36A');
    void this.cancelStake(matchId);
    this.resetMatchState();
  }

  private shoot(targetX: number, targetY: number) {
    if (!this.inMatch || !this.alive || this.time.now < this.countdownEndsAt) return;
    if (this.time.now - this.lastShotAt < COOLDOWN_MS) return;
    this.lastShotAt = this.time.now;

    const angle = Phaser.Math.Angle.Between(this.px, this.py, targetX, targetY);
    const tracerEndX = this.px + Math.cos(angle) * 180;
    const tracerEndY = this.py + Math.sin(angle) * 180;
    const tracer = this.add.line(0, 0, this.px, this.py, tracerEndX, tracerEndY, COLORS.GOLD, 0.85)
      .setOrigin(0, 0)
      .setDepth(200);
    tracer.setLineWidth(2, 2);
    this.tweens.add({
      targets: tracer,
      alpha: 0,
      duration: 110,
      onComplete: () => tracer.destroy(),
    });

    const muzzle = this.add.circle(this.px, this.py, 10, 0xF5C842, 0.7).setDepth(201);
    this.tweens.add({
      targets: muzzle,
      alpha: 0,
      scale: 1.8,
      duration: 140,
      onComplete: () => muzzle.destroy(),
    });

    const hit = this.findBestRemoteTarget(angle);
    if (!hit) return;

    const payload: HitPayload = {
      match_id: this.matchId,
      source_id: this.playerId,
      target_id: hit.playerId,
      dmg: DAMAGE,
      knockback_x: Math.cos(angle) * KNOCKBACK,
      knockback_y: Math.sin(angle) * KNOCKBACK,
    };
    this.channel?.send({ type: 'broadcast', event: 'pvp:hit', payload });
  }

  private findBestRemoteTarget(angle: number) {
    let best: { playerId: string; forward: number } | null = null;
    for (const [playerId, remote] of this.remotePlayers.entries()) {
      if (playerId !== this.opponentId) continue;
      if (!remote.inMatch || remote.matchId !== this.matchId || !remote.alive) continue;
      const dx = remote.x - this.px;
      const dy = remote.y - this.py;
      const forward = dx * Math.cos(angle) + dy * Math.sin(angle);
      if (forward < 0 || forward > RANGE) continue;
      const lateral = Math.abs(-dx * Math.sin(angle) + dy * Math.cos(angle));
      if (lateral > 26) continue;
      const obstacleDist = firstObstacleDistance(this.px, this.py, angle, COVER_RECTS);
      if (obstacleDist !== null && obstacleDist < forward) continue;
      if (!best || forward < best.forward) {
        best = { playerId, forward };
      }
    }
    return best;
  }

  private handleHit(payload: unknown) {
    const next = parseHitPayload(payload);
    if (!next) return;
    if (next.target_id !== this.playerId || next.match_id !== this.matchId) return;
    if (next.source_id !== this.opponentId) return;
    if (!this.inMatch || !this.alive || this.time.now < this.countdownEndsAt) return;
    if (this.time.now - this.lastDamageAt < 150) return;
    this.lastDamageAt = this.time.now;

    this.hp = Math.max(0, this.hp - next.dmg);
    this.px = Phaser.Math.Clamp(this.px + next.knockback_x, ARENA_BOUNDS.left + PLAYER_RADIUS, ARENA_BOUNDS.right - PLAYER_RADIUS);
    this.py = Phaser.Math.Clamp(this.py + next.knockback_y, ARENA_BOUNDS.top + PLAYER_RADIUS, ARENA_BOUNDS.bottom - PLAYER_RADIUS);
    if (this.collidesWithCover(this.px, this.py)) {
      this.teleportToSpawn(this.slot);
    } else {
      this.player.setPosition(this.px, this.py);
      this.playerNameplate.setPosition(this.px, this.py - 46);
    }

    const burst = this.add.circle(this.px, this.py - 16, 12, 0xFF5E5E, 0.8).setDepth(220);
    this.tweens.add({
      targets: burst,
      alpha: 0,
      scale: 2,
      duration: 180,
      onComplete: () => burst.destroy(),
    });

    if (this.hp > 0) {
      this.broadcastState('player:move');
      return;
    }

    this.lives = Math.max(0, this.lives - 1);
    this.alive = false;
    this.hp = 0;
    this.broadcastState('player:move');

    if (this.lives > 0) {
      this.respawnAt = this.time.now + RESPAWN_MS;
      this.flashNotice(`CAISTE - VIDA ${this.lives}`, '#FF7A7A');
      return;
    }

    void this.finishMatchAsLoser(next.source_id);
  }

  private async finishMatchAsLoser(winnerId: string) {
    const matchId = this.matchId;
    const reported = await this.reportLoss(matchId, winnerId);
    const payloadEnd: MatchEndPayload = {
      match_id: matchId,
      winner_id: winnerId,
      loser_id: this.playerId,
      pot: this.matchBet * 2,
      reason: reported ? 'elimination' : 'pending_report',
    };
    this.channel?.send({ type: 'broadcast', event: 'pvp:match_end', payload: payloadEnd });
    this.handleMatchEnd(payloadEnd);
  }

  private handleMatchEnd(payload: unknown) {
    const next = parseMatchEndPayload(payload);
    if (!next) return;
    const localInvolved = next.winner_id === this.playerId || next.loser_id === this.playerId;
    const observedRemotely = Array.from(this.remotePlayers.values()).some((player) => player.matchId === next.match_id);
    if (!localInvolved && next.match_id !== this.matchId) return;
    if (!localInvolved && !this.matchId && !observedRemotely) return;
    if (this.handledMatchResults.has(next.match_id)) return;
    if (next.match_id !== this.matchId && this.matchId) return;
    if (localInvolved) {
      const expectedOpponent = next.winner_id === this.playerId ? next.loser_id : next.winner_id;
      if (this.opponentId && expectedOpponent !== this.opponentId) return;
    }
    this.handledMatchResults.add(next.match_id);
    this.matchResolved = true;
    this.opponentReadyDeadline = 0;

    if (next.winner_id === this.playerId) {
      void this.settleStake(next);
    }

    if (next.winner_id === this.playerId && next.pot > 0) {
      this.flashNotice(`GANASTE +${next.pot} TENKS`, '#39FF14');
    } else if (next.loser_id === this.playerId) {
      this.flashNotice('MATCH PERDIDO', '#FF7A7A');
    } else {
      this.observedMatchResultId = next.match_id;
      this.flashNotice(`MATCH TERMINADO: ${next.reason ?? 'RESUELTO'}`, '#46B3FF');
    }

    this.time.delayedCall(RESULT_MS, () => {
      if (localInvolved) {
        this.resetMatchState();
      }
    });
  }

  private resetMatchState() {
    this.inMatch = false;
    this.ready = false;
    this.alive = true;
    this.hp = MAX_HP;
    this.lives = MAX_LIVES;
    this.countdownEndsAt = 0;
    this.respawnAt = 0;
    this.matchId = '';
    this.matchBet = 0;
    this.opponentId = '';
    this.slot = null;
    this.matchResolved = false;
    this.observedMatchResultId = '';
    this.paidEntryForMatch = '';
    this.lossReportedMatchId = '';
    this.px = LOBBY_BOUNDS.centerX;
    this.py = LOBBY_BOUNDS.bottom - 26;
    this.player.setPosition(this.px, this.py);
    this.playerNameplate.setPosition(this.px, this.py - 46);
    this.broadcastState('player:move');
  }

  private handleRemoteState(payload: unknown) {
    const next = parseArenaStatePayload(payload);
    if (!next || next.player_id === this.playerId) return;
    if (!this.remotePlayers.has(next.player_id)) {
      this.spawnRemotePlayer(next.player_id, next.username, next.x, next.y, next.avatar ?? {});
    }
    const remote = this.remotePlayers.get(next.player_id)!;
    remote.targetX = next.x;
    remote.targetY = next.y;
    remote.username = next.username;
    remote.moveDx = next.dir ?? 0;
    remote.isMoving = next.moving ?? false;
    remote.ready = next.ready ?? false;
    remote.bet = next.bet ?? BET_OPTIONS[0];
    remote.inMatch = next.in_match ?? false;
    remote.lives = next.lives ?? MAX_LIVES;
    remote.hp = next.hp ?? MAX_HP;
    remote.alive = next.alive ?? true;
    remote.slot = next.slot === 0 || next.slot === 1 ? next.slot : null;
    remote.matchId = next.match_id ?? '';
    remote.nameplate.setText(`${next.username}${remote.ready && !remote.inMatch ? ' *' : ''}`);
  }

  private handleRemoteLeave(payload: unknown) {
    const playerId = readStringField(payload, 'player_id', 'playerId');
    if (!playerId) return;
    const remote = this.remotePlayers.get(playerId);
    if (!remote) return;
    remote.avatar.destroy();
    remote.nameplate.destroy();
    this.remotePlayers.delete(playerId);

    if (this.inMatch && playerId === this.opponentId && !this.matchResolved) {
      const payloadEnd: MatchEndPayload = {
        match_id: this.matchId,
        winner_id: this.playerId,
        loser_id: playerId,
        pot: this.matchBet * 2,
        reason: 'forfeit',
      };
      this.channel?.send({ type: 'broadcast', event: 'pvp:match_end', payload: payloadEnd });
      this.handleMatchEnd(payloadEnd);
    }
  }

  private spawnRemotePlayer(playerId: string, username: string, x: number, y: number, avatarConfig: AvatarConfig) {
    const avatar = new AvatarRenderer(this, x, y, avatarConfig);
    avatar.setDepth(20 + Math.floor(y / 10));
    const nameplate = this.add.text(x, y - 46, username, {
      fontSize: '8px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#88AAFF',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5, 1).setDepth(100);

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
      ready: false,
      bet: BET_OPTIONS[0],
      inMatch: false,
      lives: MAX_LIVES,
      hp: MAX_HP,
      alive: true,
      slot: null,
      matchId: '',
    });
  }

  private updateRemotes() {
    for (const remote of this.remotePlayers.values()) {
      remote.x = Phaser.Math.Linear(remote.x, remote.targetX, 0.2);
      remote.y = Phaser.Math.Linear(remote.y, remote.targetY, 0.2);
      remote.avatar.setPosition(remote.x, remote.y);
      remote.avatar.setDepth(20 + Math.floor(remote.y / 10));
      remote.avatar.update(remote.isMoving && remote.alive, remote.moveDx);
      remote.nameplate.setPosition(remote.x, remote.y - 46);
      remote.avatar.getContainer().setAlpha(remote.alive ? 1 : 0.35);
      remote.nameplate.setAlpha(remote.alive ? 1 : 0.5);
    }
  }

  private refreshUi() {
    const readyPlayers = [
      { playerId: this.playerId, username: this.username, ready: this.ready, bet: this.selectedBet, inMatch: this.inMatch, lives: this.lives },
      ...Array.from(this.remotePlayers.entries()).map(([playerId, remote]) => ({
        playerId,
        username: remote.username,
        ready: remote.ready,
        bet: remote.bet,
        inMatch: remote.inMatch,
        lives: remote.lives,
      })),
    ];
    const activeMatchPlayers = readyPlayers.filter((player) => player.inMatch);
    const spectatorCount = readyPlayers.filter((player) => !player.inMatch).length;
    const livePot = activeMatchPlayers.length >= 2
      ? (() => {
          const betA = activeMatchPlayers[0]?.bet ?? 0;
          const betB = activeMatchPlayers[1]?.bet ?? betA;
          return betA + betB;
        })()
      : 0;

    this.betText.setText(`APUESTA ${this.selectedBet} TENKS  /  SALDO ${getTenksBalance()}`);
    this.readyText.setText(this.inMatch ? `MATCH ${this.matchBet} TENKS` : (this.ready ? 'ESTAS LISTO' : 'SPACE PARA LISTO'));
    this.rosterText.setText([
      'JUGADORES EN LA FILA',
      ...readyPlayers.slice(0, 5).map((player) => {
        const state = player.inMatch ? `FIGHT ${player.lives}` : (player.ready ? `READY ${player.bet}` : `BET ${player.bet}`);
        const me = player.playerId === this.playerId ? 'TU ' : '';
        return `${me}${player.username} ${state}`;
      }),
    ].join('\n'));
    this.liveBoardText.setText(activeMatchPlayers.length >= 2
      ? [
          'MATCH EN VIVO',
          `${activeMatchPlayers[0]?.username ?? 'WASPI'} VS ${activeMatchPlayers[1]?.username ?? 'WASPI'}`,
          `POZO ${livePot} TENKS`,
        ].join('\n')
      : [
          'MATCH EN VIVO',
          'ESPERANDO RETADOR',
          `POZO ${this.selectedBet * 2} TENKS`,
        ].join('\n'));
    this.spectatorText.setText([
      `ESPECTADORES ${Math.max(0, spectatorCount - (this.inMatch ? 0 : 1))}`,
      `COLA ${readyPlayers.filter((player) => !player.inMatch).length}`,
      activeMatchPlayers.length >= 2 ? 'MIRANDO DESDE GRADAS' : (this.observedMatchResultId ? 'ULTIMO MATCH CERRADO' : 'SIN PELEA ACTIVA'),
    ].join('\n'));

    const countdownRemaining = this.countdownEndsAt > this.time.now
      ? Math.ceil((this.countdownEndsAt - this.time.now) / 1000)
      : 0;
    this.countdownText.setText(countdownRemaining > 0 ? String(countdownRemaining) : '');
    if (this.inMatch && this.opponentId) {
      const opponent = this.remotePlayers.get(this.opponentId);
      const opponentLives = opponent?.lives ?? MAX_LIVES;
      this.arenaStatus.setText(`ARENA ACTIVA / VIDAS TU ${this.lives} - RIVAL ${opponentLives}`);
    } else {
      const waiting = readyPlayers.filter((player) => player.ready && player.bet === this.selectedBet && !player.inMatch).length;
      this.arenaStatus.setText(waiting >= 2 ? 'EMPAREJANDO...' : 'ESPERANDO DOS JUGADORES CON LA MISMA APUESTA');
    }

    this.hpText.setText(`HP ${this.hp}`);
    this.livesText.setText(`VIDAS ${this.lives}/${MAX_LIVES}`);
  }

  private syncState() {
    if (!this.channel) return;
    const now = Date.now();
    if (now - this.lastPosSent < MOVE_SYNC_MS) return;
    this.lastPosSent = now;
    this.broadcastState('player:move');
  }

  private broadcastState(event: 'player:join' | 'player:move') {
    if (!this.channel) return;
    this.channel.send({
      type: 'broadcast',
      event,
      payload: {
        player_id: this.playerId,
        username: this.username,
        x: Math.round(this.px),
        y: Math.round(this.py),
        dir: this.lastMoveDx,
        moving: this.lastIsMoving,
        avatar: this.avatarConfig,
        ready: this.ready,
        bet: this.selectedBet,
        in_match: this.inMatch,
        lives: this.lives,
        hp: this.hp,
        alive: this.alive,
        slot: this.slot,
        match_id: this.matchId,
      },
    });
  }

  private flashNotice(message: string, color: string) {
    this.noticeText.setText(message);
    this.noticeText.setColor(color);
    this.noticeText.setAlpha(1);
    this.tweens.killTweensOf(this.noticeText);
    this.tweens.add({
      targets: this.noticeText,
      alpha: 0.3,
      duration: 1700,
      ease: 'Sine.easeOut',
      onComplete: () => this.noticeText.setAlpha(1),
    });
  }

  private async getAuthSessionInfo() {
    if (!supabase || !isConfigured) return null;
    const { data } = await supabase.auth.getSession();
    if (!data.session) return null;
    return {
      token: data.session.access_token,
      userId: data.session.user.id,
    };
  }

  private async getAuthToken() {
    const auth = await this.getAuthSessionInfo();
    return auth?.token ?? null;
  }

  private async syncAuthenticatedIdentity() {
    const auth = await this.getAuthSessionInfo();
    if (!auth) return;
    this.applyAuthenticatedIdentity(auth.userId);
  }

  private applyAuthenticatedIdentity(userId: string) {
    this.authUserId = userId;
    if (this.playerId === userId) return;

    const previousId = this.playerId;
    if (this.channel && previousId) {
      this.channel.send({
        type: 'broadcast',
        event: 'player:leave',
        payload: { player_id: previousId },
      });
    }

    this.playerId = userId;
    this.broadcastState('player:join');
  }

  private async reserveStake(matchId: string, bet: number, opponentId: string) {
    const token = await this.getAuthToken();
    if (!token) {
      this.flashNotice('SESION REQUERIDA PARA RESERVAR APUESTA', '#FF7A7A');
      return false;
    }

    const res = await fetch('/api/pvp/match', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        action: 'reserve',
        matchId,
        opponentId,
        bet,
      }),
    }).catch(() => null);

    if (!res?.ok) {
      const json = await res?.json().catch(() => null) as { error?: string } | null;
      this.flashNotice(json?.error ?? 'NO SE PUDO RESERVAR LA APUESTA', '#FF7A7A');
      return false;
    }

    const json = await res.json().catch(() => null) as { player?: { tenks?: number } } | null;
    if (typeof json?.player?.tenks === 'number') {
      initTenks(json.player.tenks);
    }
    this.paidEntryForMatch = matchId;
    this.serverReservedMatchId = matchId;
    return true;
  }

  private async cancelStake(matchId: string) {
    if (!this.paidEntryForMatch || this.paidEntryForMatch !== matchId) return;
    const token = await this.getAuthToken();
    if (!token) {
      this.flashNotice('SESION EXPIRADA: RECONÉCTATE PARA RECUPERAR TU APUESTA', '#FFB36A');
      return;
    }

    const res = await fetch('/api/pvp/match', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        action: 'cancel',
        matchId,
      }),
    }).catch(() => null);

    if (res?.ok) {
      const json = await res.json().catch(() => null) as { player?: { tenks?: number } } | null;
      if (typeof json?.player?.tenks === 'number') {
        initTenks(json.player.tenks);
      }
    }
    this.paidEntryForMatch = '';
    this.serverReservedMatchId = '';
  }

  private async settleStake(result: MatchEndPayload) {
    const token = await this.getAuthToken();
    if (!token) {
      this.flashNotice('SESION EXPIRADA: EL PAGO QUEDÓ PENDIENTE', '#FFB36A');
      return;
    }

    const res = await fetch('/api/pvp/match', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        action: 'settle',
        matchId: result.match_id,
        winnerId: result.winner_id,
        loserId: result.loser_id,
      }),
    }).catch(() => null);

    if (res?.ok) {
      const json = await res.json().catch(() => null) as { player?: { tenks?: number } } | null;
      if (typeof json?.player?.tenks === 'number') {
        initTenks(json.player.tenks);
      }
    } else {
      this.flashNotice('PAGO PENDIENTE: REINTENTA ENTRANDO DE NUEVO', '#FFB36A');
    }
    this.paidEntryForMatch = '';
    this.serverReservedMatchId = '';
  }

  private async reportLoss(matchId: string, winnerId: string) {
    if (this.lossReportedMatchId === matchId) return true;
    const token = await this.getAuthToken();
    if (!token) {
      this.flashNotice('SESION EXPIRADA: NO SE PUDO REPORTAR LA DERROTA', '#FFB36A');
      return false;
    }

    const res = await fetch('/api/pvp/match', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        action: 'report_loss',
        matchId,
        winnerId,
      }),
    }).catch(() => null);

    if (!res?.ok) {
      const json = await res?.json().catch(() => null) as { error?: string } | null;
      this.flashNotice(json?.error ?? 'NO SE PUDO REPORTAR EL RESULTADO', '#FFB36A');
      return false;
    }

    this.lossReportedMatchId = matchId;
    return true;
  }

  private requestExit() {
    if (this.inMatch) {
      this.flashNotice('TERMINA EL MATCH PARA SALIR', '#FF7A7A');
      return;
    }
    this.exitToWorld();
  }

  private exitToWorld() {
    if (this.inTransition) return;
    this.inTransition = true;
    this.cameras.main.resetFX();
    this.cameras.main.setAlpha(1);
    this.cameras.main.fadeOut(220, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start('WorldScene', { returnX: RETURN_WORLD_X, returnY: RETURN_WORLD_Y });
    });
  }

  private handleShutdown() {
    if (this.pointerShootHandler) {
      this.input.off('pointerdown', this.pointerShootHandler);
      this.pointerShootHandler = undefined;
    }
    if (this.channel) {
      this.channel.send({
        type: 'broadcast',
        event: 'player:leave',
        payload: { player_id: this.playerId },
      });
      this.channel.unsubscribe();
      this.channel = null;
    }
    this.remotePlayers.forEach((remote) => {
      remote.avatar.destroy();
      remote.nameplate.destroy();
    });
    this.remotePlayers.clear();
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
    return window.localStorage.getItem('waspi_username') ?? 'waspi_guest';
  }
}

function readStringField(payload: unknown, ...keys: string[]) {
  if (!payload || typeof payload !== 'object') return null;
  for (const key of keys) {
    const value = (payload as Record<string, unknown>)[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function readNumberField(payload: unknown, ...keys: string[]) {
  if (!payload || typeof payload !== 'object') return null;
  for (const key of keys) {
    const value = (payload as Record<string, unknown>)[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return null;
}

function readBooleanField(payload: unknown, ...keys: string[]) {
  if (!payload || typeof payload !== 'object') return null;
  for (const key of keys) {
    const value = (payload as Record<string, unknown>)[key];
    if (typeof value === 'boolean') return value;
  }
  return null;
}

function parseArenaStatePayload(payload: unknown): ArenaStatePayload | null {
  const playerId = readStringField(payload, 'player_id', 'playerId');
  const username = readStringField(payload, 'username') ?? 'waspi_guest';
  const x = readNumberField(payload, 'x');
  const y = readNumberField(payload, 'y');
  if (!playerId || x === null || y === null) return null;
  const avatar = payload && typeof payload === 'object' && 'avatar' in payload && payload.avatar && typeof payload.avatar === 'object'
    ? payload.avatar as AvatarConfig
    : undefined;
  return {
    player_id: playerId,
    username,
    x,
    y,
    dir: readNumberField(payload, 'dir', 'dx'),
    moving: readBooleanField(payload, 'moving', 'isMoving'),
    avatar,
    ready: readBooleanField(payload, 'ready'),
    bet: readNumberField(payload, 'bet'),
    in_match: readBooleanField(payload, 'in_match', 'inMatch'),
    lives: readNumberField(payload, 'lives'),
    hp: readNumberField(payload, 'hp'),
    alive: readBooleanField(payload, 'alive'),
    slot: readNumberField(payload, 'slot'),
    match_id: readStringField(payload, 'match_id', 'matchId'),
  };
}

function parseMatchStartPayload(payload: unknown): MatchStartPayload | null {
  if (!payload || typeof payload !== 'object') return null;
  const matchId = readStringField(payload, 'match_id', 'matchId');
  const bet = readNumberField(payload, 'bet');
  const leaderId = readStringField(payload, 'leader_id', 'leaderId') ?? '';
  const playersRaw = (payload as Record<string, unknown>).players;
  const players = Array.isArray(playersRaw) ? playersRaw.filter((value): value is string => typeof value === 'string') : [];
  if (!matchId || bet === null || players.length < 2) return null;
  return { match_id: matchId, bet, players, leader_id: leaderId };
}

function parseHitPayload(payload: unknown): HitPayload | null {
  if (!payload || typeof payload !== 'object') return null;
  const matchId = readStringField(payload, 'match_id', 'matchId');
  const sourceId = readStringField(payload, 'source_id', 'sourceId');
  const targetId = readStringField(payload, 'target_id', 'targetId');
  const dmg = readNumberField(payload, 'dmg');
  const knockbackX = readNumberField(payload, 'knockback_x', 'knockbackX');
  const knockbackY = readNumberField(payload, 'knockback_y', 'knockbackY');
  if (!matchId || !sourceId || !targetId || dmg === null || knockbackX === null || knockbackY === null) return null;
  return {
    match_id: matchId,
    source_id: sourceId,
    target_id: targetId,
    dmg,
    knockback_x: knockbackX,
    knockback_y: knockbackY,
  };
}

function parseMatchEndPayload(payload: unknown): MatchEndPayload | null {
  if (!payload || typeof payload !== 'object') return null;
  const matchId = readStringField(payload, 'match_id', 'matchId');
  const winnerId = readStringField(payload, 'winner_id', 'winnerId');
  const loserId = readStringField(payload, 'loser_id', 'loserId');
  const pot = readNumberField(payload, 'pot');
  if (!matchId || !winnerId || !loserId || pot === null) return null;
  return {
    match_id: matchId,
    winner_id: winnerId,
    loser_id: loserId,
    pot,
    reason: readStringField(payload, 'reason') ?? undefined,
  };
}

function circleRectOverlap(cx: number, cy: number, radius: number, rect: Phaser.Geom.Rectangle) {
  const nearestX = Phaser.Math.Clamp(cx, rect.left, rect.right);
  const nearestY = Phaser.Math.Clamp(cy, rect.top, rect.bottom);
  const dx = cx - nearestX;
  const dy = cy - nearestY;
  return dx * dx + dy * dy < radius * radius;
}

function firstObstacleDistance(originX: number, originY: number, angle: number, rects: readonly Phaser.Geom.Rectangle[]) {
  let best: number | null = null;
  for (const rect of rects) {
    const dist = rayRectDistance(originX, originY, angle, rect);
    if (dist === null) continue;
    if (best === null || dist < best) best = dist;
  }
  return best;
}

function rayRectDistance(originX: number, originY: number, angle: number, rect: Phaser.Geom.Rectangle) {
  const dirX = Math.cos(angle);
  const dirY = Math.sin(angle);
  const points = [
    [rect.left, rect.top, rect.right, rect.top],
    [rect.right, rect.top, rect.right, rect.bottom],
    [rect.right, rect.bottom, rect.left, rect.bottom],
    [rect.left, rect.bottom, rect.left, rect.top],
  ];

  let best: number | null = null;
  for (const [x1, y1, x2, y2] of points) {
    const dist = raySegmentDistance(originX, originY, dirX, dirY, x1, y1, x2, y2);
    if (dist === null) continue;
    if (best === null || dist < best) best = dist;
  }
  return best;
}

function raySegmentDistance(originX: number, originY: number, dirX: number, dirY: number, x1: number, y1: number, x2: number, y2: number) {
  const segX = x2 - x1;
  const segY = y2 - y1;
  const cross = dirX * segY - dirY * segX;
  if (Math.abs(cross) < 0.0001) return null;
  const diffX = x1 - originX;
  const diffY = y1 - originY;
  const t = (diffX * segY - diffY * segX) / cross;
  const u = (diffX * dirY - diffY * dirX) / cross;
  if (t < 0 || u < 0 || u > 1) return null;
  return t;
}
