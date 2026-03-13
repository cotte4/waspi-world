import Phaser from 'phaser';
import { AvatarRenderer, AvatarConfig } from '../systems/AvatarRenderer';
import { ChatSystem } from '../systems/ChatSystem';
import { WORLD, VIEWPORT, PLAYER, COLORS, ZONES, BUILDINGS, CHAT } from '../config/constants';
import { eventBus, EVENTS } from '../config/eventBus';
import { supabase, isConfigured } from '../../lib/supabase';

interface RemotePlayer {
  avatar: AvatarRenderer;
  nameplate: Phaser.GameObjects.Text;
  username: string;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
}

export class WorldScene extends Phaser.Scene {
  // Player
  private px = PLAYER.SPAWN_X;
  private py = PLAYER.SPAWN_Y;
  private playerId = '';
  private playerUsername = '';
  private playerAvatar!: AvatarRenderer;
  private playerNameplate!: Phaser.GameObjects.Text;
  private playerBody!: Phaser.GameObjects.Rectangle; // invisible — camera target

  // Input
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keyW!: Phaser.Input.Keyboard.Key;
  private keyA!: Phaser.Input.Keyboard.Key;
  private keyS!: Phaser.Input.Keyboard.Key;
  private keyD!: Phaser.Input.Keyboard.Key;
  private inputBlocked = false; // true when chat input is focused

  // Chat
  private chatSystem!: ChatSystem;
  private lastChatSent = 0;

  // Multiplayer
  private remotePlayers = new Map<string, RemotePlayer>();
  private lastPosSent = 0;
  private channel: ReturnType<NonNullable<typeof supabase>['channel']> | null = null;

  constructor() {
    super({ key: 'WorldScene' });
  }

  create() {
    // Generate player ID and username
    this.playerId = this.getOrCreatePlayerId();
    this.playerUsername = this.getOrCreateUsername();

    // Draw world layers
    this.drawBackground();
    this.drawPlaza();
    this.drawBuildings();
    this.drawStreet();
    this.drawLampPosts();

    // Invisible camera target
    this.playerBody = this.add.rectangle(this.px, this.py, 2, 2, 0x000000, 0).setDepth(0);

    // Player avatar
    this.playerAvatar = new AvatarRenderer(this, this.px, this.py, {
      bodyColor: COLORS.SKIN_LIGHT,
      hairColor: COLORS.HAIR_BROWN,
      topColor: COLORS.BODY_BLUE,
      bottomColor: COLORS.LEGS_DARK,
    });
    this.playerAvatar.setDepth(50);

    // Player nameplate
    this.playerNameplate = this.add.text(this.px, this.py - 46, this.playerUsername, {
      fontSize: '9px',
      fontFamily: '"Press Start 2P", "Courier New", monospace',
      color: '#F5C842',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5, 1).setDepth(120);

    // Draw house name
    this.drawHouse();

    // Input
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.keyW = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W);
    this.keyA = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.keyS = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S);
    this.keyD = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D);

    // Camera
    this.cameras.main.setBounds(0, 0, WORLD.WIDTH, WORLD.HEIGHT);
    this.cameras.main.startFollow(this.playerBody, true, 0.1, 0.1);
    this.cameras.main.setZoom(1);

    // Chat system
    this.chatSystem = new ChatSystem(this);

    // Bridge events from React
    this.setupReactBridge();

    // Supabase Realtime
    this.setupRealtime();

    // Notify React that player is ready
    eventBus.emit(EVENTS.PLAYER_INFO, {
      playerId: this.playerId,
      username: this.playerUsername,
    });

    // Ambient NPC
    this.spawnAmbientNPCs();
  }

  // ─── World Drawing ───────────────────────────────────────────────────────────

  private drawBackground() {
    const g = this.add.graphics().setDepth(-10);
    g.fillStyle(COLORS.BG);
    g.fillRect(0, 0, WORLD.WIDTH, WORLD.HEIGHT);

    // Stars (random dots in sky area)
    g.fillStyle(0xFFFFFF, 0.6);
    const seed = 42;
    for (let i = 0; i < 200; i++) {
      const sx = ((seed * (i * 137 + 1)) % WORLD.WIDTH);
      const sy = ((seed * (i * 97 + 3)) % 600);
      g.fillCircle(sx, sy, Math.random() < 0.2 ? 1.5 : 1);
    }
  }

  private drawStreet() {
    const g = this.add.graphics().setDepth(1);

    // North sidewalk
    g.fillStyle(COLORS.SIDEWALK);
    g.fillRect(0, ZONES.NORTH_SIDEWALK_Y, WORLD.WIDTH, ZONES.NORTH_SIDEWALK_H);

    // Street
    g.fillStyle(COLORS.STREET);
    g.fillRect(0, ZONES.STREET_Y, WORLD.WIDTH, ZONES.STREET_H);

    // Center dashes
    const dashY = ZONES.STREET_Y + ZONES.STREET_H / 2;
    g.fillStyle(0xFFFFFF, 0.15);
    for (let dx = 0; dx < WORLD.WIDTH; dx += 80) {
      g.fillRect(dx, dashY - 2, 48, 4);
    }

    // South sidewalk
    g.fillStyle(COLORS.SIDEWALK);
    g.fillRect(0, ZONES.SOUTH_SIDEWALK_Y, WORLD.WIDTH, ZONES.SOUTH_SIDEWALK_H);

    // Curb lines
    g.lineStyle(2, 0x333344, 0.8);
    g.strokeRect(0, ZONES.NORTH_SIDEWALK_Y, WORLD.WIDTH, ZONES.NORTH_SIDEWALK_H);
    g.strokeRect(0, ZONES.SOUTH_SIDEWALK_Y, WORLD.WIDTH, ZONES.SOUTH_SIDEWALK_H);
  }

  private drawPlaza() {
    const g = this.add.graphics().setDepth(0);

    // Grass area
    g.fillStyle(COLORS.GRASS);
    g.fillRect(0, ZONES.PLAZA_Y, WORLD.WIDTH, WORLD.HEIGHT - ZONES.PLAZA_Y);

    // Plaza stone area
    g.fillStyle(0x111118);
    g.fillRect(1100, ZONES.PLAZA_Y + 50, 1000, 600);

    // Fountain
    const fx = 1600, fy = ZONES.PLAZA_Y + 300;
    g.fillStyle(COLORS.FOUNTAIN);
    g.fillCircle(fx, fy, 80);
    g.fillStyle(0x0A1520);
    g.fillCircle(fx, fy, 60);
    g.fillStyle(0x2255AA, 0.7);
    g.fillCircle(fx, fy, 45);
    g.fillStyle(0x88CCFF, 0.5);
    g.fillCircle(fx, fy, 15); // water center

    // Fountain border
    g.lineStyle(3, 0x334455, 0.9);
    g.strokeCircle(fx, fy, 80);

    // Bench near fountain
    this.drawBench(g, 1450, fy + 110);
    this.drawBench(g, 1750, fy + 110);
    this.drawBench(g, fx - 120, fy - 20);
    this.drawBench(g, fx + 120, fy - 20);

    // Plaza text
    this.add.text(fx, ZONES.PLAZA_Y + 20, 'PLAZA', {
      fontSize: '8px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#334455',
    }).setOrigin(0.5).setDepth(2);
  }

  private drawBench(g: Phaser.GameObjects.Graphics, x: number, y: number) {
    g.fillStyle(0x3A2A1A);
    g.fillRect(x - 25, y, 50, 8);
    g.fillRect(x - 22, y + 8, 8, 10);
    g.fillRect(x + 14, y + 8, 8, 10);
  }

  private drawBuildings() {
    // ARCADE
    this.drawArcadeBuilding();
    // WASPI STORE
    this.drawStoreBuilding();
    // CAFÉ
    this.drawCafeBuilding();
  }

  private drawArcadeBuilding() {
    const { x, y, w, h } = BUILDINGS.ARCADE;
    const g = this.add.graphics().setDepth(2);

    // Main facade
    g.fillStyle(COLORS.BUILDING_ARCADE);
    g.fillRect(x, y, w, h);

    // Roof overhang
    g.fillStyle(COLORS.ROOF_DARK);
    g.fillRect(x - 8, y, w + 16, 30);

    // Windows (glowing blue)
    const winPositions = [[x+40,y+80],[x+120,y+80],[x+200,y+80],[x+280,y+80],[x+40,y+180],[x+120,y+180],[x+200,y+180],[x+280,y+180]];
    winPositions.forEach(([wx, wy]) => {
      g.fillStyle(COLORS.WINDOW_COOL, 0.15);
      g.fillRect(wx, wy, 55, 65);
      g.lineStyle(1.5, COLORS.NEON_BLUE, 0.7);
      g.strokeRect(wx, wy, 55, 65);
    });

    // Entrance
    g.fillStyle(0x050510);
    g.fillRect(x + w/2 - 35, y + h - 80, 70, 80);
    g.lineStyle(2, COLORS.NEON_BLUE, 0.9);
    g.strokeRect(x + w/2 - 35, y + h - 80, 70, 80);

    // ARCADE neon sign
    const signText = this.add.text(x + w/2, y + 40, 'ARCADE', {
      fontSize: '18px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#FF006E',
      stroke: '#FF006E',
      strokeThickness: 2,
    }).setOrigin(0.5).setDepth(3);

    // Glow flicker tween
    this.tweens.add({
      targets: signText,
      alpha: { from: 1, to: 0.7 },
      duration: 800 + Math.random() * 400,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // Screen glow on facade
    g.fillStyle(COLORS.NEON_PINK, 0.05);
    g.fillRect(x, y, w, h);

    // Column separators
    g.lineStyle(1, 0x1A1A30, 0.9);
    for (let cx = x + 100; cx < x + w; cx += 100) {
      g.lineBetween(cx, y, cx, y + h);
    }
  }

  private drawStoreBuilding() {
    const { x, y, w, h } = BUILDINGS.STORE;
    const g = this.add.graphics().setDepth(2);

    // Main facade (slightly lighter)
    g.fillStyle(COLORS.BUILDING_STORE);
    g.fillRect(x, y, w, h);

    // Gold accent stripe
    g.fillStyle(COLORS.GOLD, 0.15);
    g.fillRect(x, y, w, 8);
    g.fillRect(x, y + h - 100, w, 6);

    // Roof
    g.fillStyle(COLORS.ROOF_DARK);
    g.fillRect(x - 10, y, w + 20, 35);

    // Large display windows
    g.fillStyle(COLORS.WINDOW_COOL, 0.08);
    g.fillRect(x + 40, y + 100, 180, 220);
    g.fillRect(x + w - 220, y + 100, 180, 220);
    g.lineStyle(2, COLORS.GOLD, 0.5);
    g.strokeRect(x + 40, y + 100, 180, 220);
    g.strokeRect(x + w - 220, y + 100, 180, 220);

    // Mannequin shapes inside windows (simple outlines)
    g.lineStyle(1, COLORS.GOLD, 0.4);
    // Left window mannequin
    g.strokeCircle(x + 130, y + 140, 15);
    g.strokeRect(x + 118, y + 155, 24, 40);
    // Right window mannequin
    g.strokeCircle(x + w - 130, y + 140, 15);
    g.strokeRect(x + w - 142, y + 155, 24, 40);

    // Main entrance (double door)
    g.fillStyle(0x050510);
    g.fillRect(x + w/2 - 50, y + h - 90, 100, 90);
    g.lineStyle(2, COLORS.GOLD, 0.9);
    g.strokeRect(x + w/2 - 50, y + h - 90, 100, 90);
    // Door handle
    g.fillStyle(COLORS.GOLD);
    g.fillCircle(x + w/2 - 10, y + h - 45, 3);
    g.fillCircle(x + w/2 + 10, y + h - 45, 3);

    // WASPI neon sign
    const waspi = this.add.text(x + w/2, y + 55, 'WASPI', {
      fontSize: '28px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#F5C842',
      stroke: '#F5C842',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(3);

    this.add.text(x + w/2, y + 85, 'S T O R E', {
      fontSize: '10px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#AAAAAA',
    }).setOrigin(0.5).setDepth(3);

    // Gold glow pulse
    this.tweens.add({
      targets: waspi,
      alpha: { from: 1, to: 0.85 },
      duration: 1200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // Gold ambient glow
    g.fillStyle(COLORS.GOLD, 0.03);
    g.fillRect(x, y, w, h);
  }

  private drawCafeBuilding() {
    const { x, y, w, h } = BUILDINGS.CAFE;
    const g = this.add.graphics().setDepth(2);

    // Facade (warm)
    g.fillStyle(COLORS.BUILDING_CAFE);
    g.fillRect(x, y, w, h);

    // Roof
    g.fillStyle(COLORS.ROOF_DARK);
    g.fillRect(x - 8, y, w + 16, 32);

    // Warm windows
    const cWins = [[x+50,y+90],[x+160,y+90],[x+270,y+90],[x+100,y+220],[x+220,y+220]];
    cWins.forEach(([wx, wy]) => {
      g.fillStyle(COLORS.WINDOW_WARM, 0.18);
      g.fillRect(wx, wy, 60, 70);
      g.lineStyle(1.5, COLORS.NEON_ORANGE, 0.6);
      g.strokeRect(wx, wy, 60, 70);
    });

    // Entrance
    g.fillStyle(0x080400);
    g.fillRect(x + w/2 - 30, y + h - 75, 60, 75);
    g.lineStyle(2, COLORS.NEON_ORANGE, 0.9);
    g.strokeRect(x + w/2 - 30, y + h - 75, 60, 75);

    // CAFÉ sign
    const cafeSign = this.add.text(x + w/2, y + 48, 'CAFÉ', {
      fontSize: '20px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#FF6B00',
      stroke: '#FF6B00',
      strokeThickness: 2,
    }).setOrigin(0.5).setDepth(3);

    this.tweens.add({
      targets: cafeSign,
      alpha: { from: 1, to: 0.75 },
      duration: 1500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // Warm ambient
    g.fillStyle(COLORS.NEON_ORANGE, 0.03);
    g.fillRect(x, y, w, h);
  }

  private drawHouse() {
    const { x, y, w, h } = BUILDINGS.HOUSE;
    const g = this.add.graphics().setDepth(2);

    g.fillStyle(COLORS.BUILDING_HOUSE);
    g.fillRect(x, y, w, h);

    // Roof
    g.fillStyle(COLORS.ROOF_DARK);
    g.fillRect(x - 5, y, w + 10, 20);

    // Windows
    [[x + 60, y + 30], [x + w - 110, y + 30]].forEach(([wx, wy]) => {
      g.fillStyle(COLORS.WINDOW_WARM, 0.2);
      g.fillRect(wx, wy, 50, 55);
      g.lineStyle(1.5, 0x886633, 0.7);
      g.strokeRect(wx, wy, 50, 55);
    });

    // Door
    g.fillStyle(0x050508);
    g.fillRect(x + w/2 - 20, y + h - 60, 40, 60);
    g.lineStyle(2, 0x443322, 0.8);
    g.strokeRect(x + w/2 - 20, y + h - 60, 40, 60);
    g.fillStyle(0x886633);
    g.fillCircle(x + w/2 + 8, y + h - 30, 3);

    // Label
    this.add.text(x + w/2, y + 10, 'TU CASA', {
      fontSize: '8px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#334455',
    }).setOrigin(0.5).setDepth(3);
  }

  private drawLampPosts() {
    const g = this.add.graphics().setDepth(3);
    const postY = ZONES.NORTH_SIDEWALK_Y + 5;
    const postH = 120;

    for (let lx = 200; lx < WORLD.WIDTH; lx += 320) {
      // Post
      g.lineStyle(3, 0x333344);
      g.lineBetween(lx, postY, lx, postY - postH);

      // Top bar
      g.lineBetween(lx, postY - postH, lx + 20, postY - postH - 15);

      // Lamp housing
      g.fillStyle(0x2A2A3A);
      g.fillRect(lx + 10, postY - postH - 22, 22, 12);

      // Glow circle
      g.fillStyle(0xFFEEAA, 0.15);
      g.fillCircle(lx + 21, postY - postH - 16, 35);

      g.fillStyle(0xFFEEAA, 0.25);
      g.fillCircle(lx + 21, postY - postH - 16, 20);

      // Light bulb
      g.fillStyle(0xFFFFAA);
      g.fillCircle(lx + 21, postY - postH - 16, 5);

      // South sidewalk lamps too
      const southY = ZONES.SOUTH_SIDEWALK_Y + 55;
      g.lineStyle(3, 0x333344);
      g.lineBetween(lx + 160, southY, lx + 160, southY - 100);
      g.lineBetween(lx + 160, southY - 100, lx + 180, southY - 115);
      g.fillStyle(0x2A2A3A);
      g.fillRect(lx + 170, southY - 122, 18, 10);
      g.fillStyle(0xFFEEAA, 0.12);
      g.fillCircle(lx + 179, southY - 117, 28);
      g.fillStyle(0xFFFFAA);
      g.fillCircle(lx + 179, southY - 117, 4);
    }
  }

  private spawnAmbientNPCs() {
    // Non-interactive decorative NPCs that wander
    const npcConfigs: AvatarConfig[] = [
      { bodyColor: 0xD4A574, hairColor: 0x1A0A00, topColor: 0x553322, bottomColor: 0x221122 },
      { bodyColor: 0xE8C49A, hairColor: 0x000000, topColor: 0x222255, bottomColor: 0x111133 },
      { bodyColor: 0xC17A4A, hairColor: 0x220000, topColor: 0x334422, bottomColor: 0x1A2211 },
    ];

    const npcPositions = [
      { x: 600, y: 750 }, { x: 2000, y: 720 }, { x: 1000, y: 780 },
    ];

    npcPositions.forEach((pos, i) => {
      const cfg = npcConfigs[i % npcConfigs.length];
      const npc = new AvatarRenderer(this, pos.x, pos.y, cfg);
      npc.setDepth(40);

      // Simple wander tween
      const range = 80 + Math.random() * 60;
      this.tweens.add({
        targets: npc.getContainer(),
        x: pos.x + (Math.random() > 0.5 ? range : -range),
        duration: 3000 + Math.random() * 2000,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
        onUpdate: () => npc.update(true, 0),
      });
    });
  }

  // ─── Player & Input ──────────────────────────────────────────────────────────

  private handleMovement(delta: number) {
    if (this.inputBlocked) return;

    const speed = PLAYER.SPEED * (delta / 1000);
    let dx = 0, dy = 0;

    const left = this.cursors.left.isDown || this.keyA.isDown;
    const right = this.cursors.right.isDown || this.keyD.isDown;
    const up = this.cursors.up.isDown || this.keyW.isDown;
    const down = this.cursors.down.isDown || this.keyS.isDown;

    if (left) dx -= 1;
    if (right) dx += 1;
    if (up) dy -= 1;
    if (down) dy += 1;

    // Normalize diagonal
    if (dx !== 0 && dy !== 0) { dx *= 0.707; dy *= 0.707; }

    const isMoving = dx !== 0 || dy !== 0;
    const newX = Phaser.Math.Clamp(this.px + dx * speed, 20, WORLD.WIDTH - 20);
    const newY = Phaser.Math.Clamp(this.py + dy * speed, 20, WORLD.HEIGHT - 20);

    // Simple building collision: can't enter building zone unless near a door
    const inBuildingZone = newY < ZONES.BUILDING_BOTTOM && newY > ZONES.BUILDING_TOP;

    let finalX = newX;
    let finalY = newY;

    if (inBuildingZone) {
      // Check if near a door entrance (within 60px of door center)
      const doors = [
        BUILDINGS.ARCADE.x + BUILDINGS.ARCADE.w / 2,
        BUILDINGS.STORE.x + BUILDINGS.STORE.w / 2,
        BUILDINGS.CAFE.x + BUILDINGS.CAFE.w / 2,
      ];
      const nearDoor = doors.some(doorX => Math.abs(newX - doorX) < 60);

      if (!nearDoor) {
        // Allow horizontal movement but clamp vertical
        finalY = Math.max(this.py, ZONES.BUILDING_BOTTOM);
      }
    }

    this.px = finalX;
    this.py = finalY;

    this.playerAvatar.update(isMoving, dx);
    this.playerAvatar.setPosition(this.px, this.py);
    this.playerAvatar.setDepth(Math.floor(this.py / 10));

    this.playerBody.setPosition(this.px, this.py);
    this.playerNameplate.setPosition(this.px, this.py - 46);
    this.chatSystem.updatePosition('__player__', this.px, this.py);
  }

  // ─── Realtime / Multiplayer ──────────────────────────────────────────────────

  private setupRealtime() {
    if (!supabase || !isConfigured) {
      console.log('[Waspi] Supabase not configured — solo mode');
      return;
    }

    this.channel = supabase.channel('waspi-world', {
      config: { broadcast: { self: false } },
    });

    this.channel
      .on('broadcast', { event: 'player:move' }, ({ payload }) => {
        this.handleRemoteMove(payload);
      })
      .on('broadcast', { event: 'player:chat' }, ({ payload }) => {
        this.handleRemoteChat(payload);
      })
      .on('broadcast', { event: 'player:join' }, ({ payload }) => {
        this.handleRemoteJoin(payload);
      })
      .on('broadcast', { event: 'player:leave' }, ({ payload }) => {
        this.handleRemoteLeave(payload);
      })
      .subscribe(() => {
        // Announce join
        this.channel!.send({
          type: 'broadcast',
          event: 'player:join',
          payload: {
            playerId: this.playerId,
            username: this.playerUsername,
            x: this.px,
            y: this.py,
          },
        });
      });
  }

  private handleRemoteJoin(payload: { playerId: string; username: string; x: number; y: number }) {
    if (payload.playerId === this.playerId) return;
    if (!this.remotePlayers.has(payload.playerId)) {
      this.spawnRemotePlayer(payload.playerId, payload.username, payload.x, payload.y);
    }
  }

  private handleRemoteLeave(payload: { playerId: string }) {
    const rp = this.remotePlayers.get(payload.playerId);
    if (rp) {
      rp.avatar.destroy();
      rp.nameplate.destroy();
      this.remotePlayers.delete(payload.playerId);
      this.chatSystem.clearBubble(payload.playerId);
    }
  }

  private handleRemoteMove(payload: { playerId: string; username: string; x: number; y: number }) {
    if (payload.playerId === this.playerId) return;

    if (!this.remotePlayers.has(payload.playerId)) {
      this.spawnRemotePlayer(payload.playerId, payload.username, payload.x, payload.y);
    } else {
      const rp = this.remotePlayers.get(payload.playerId)!;
      rp.targetX = payload.x;
      rp.targetY = payload.y;
    }
  }

  private handleRemoteChat(payload: { playerId: string; username: string; message: string; x: number; y: number }) {
    if (payload.playerId === this.playerId) return;

    // Ensure remote player exists
    if (!this.remotePlayers.has(payload.playerId)) {
      this.spawnRemotePlayer(payload.playerId, payload.username, payload.x, payload.y);
    }

    this.chatSystem.showBubble(payload.playerId, payload.message, payload.x, payload.y, false);

    // Notify React chat log
    eventBus.emit(EVENTS.CHAT_RECEIVED, {
      playerId: payload.playerId,
      username: payload.username,
      message: payload.message,
      isMe: false,
    });
  }

  private spawnRemotePlayer(id: string, username: string, x: number, y: number) {
    const avatar = new AvatarRenderer(this, x, y, {
      bodyColor: COLORS.SKIN_LIGHT,
      hairColor: 0x000000,
      topColor: 0x442255,
      bottomColor: 0x221133,
    });
    avatar.setDepth(40);

    const nameplate = this.add.text(x, y - 46, username, {
      fontSize: '9px',
      fontFamily: '"Press Start 2P", "Courier New", monospace',
      color: '#88AAFF',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5, 1).setDepth(120);

    this.remotePlayers.set(id, { avatar, nameplate, username, x, y, targetX: x, targetY: y });
  }

  private syncPosition() {
    const now = Date.now();
    if (now - this.lastPosSent < 66) return; // ~15Hz
    this.lastPosSent = now;

    this.channel?.send({
      type: 'broadcast',
      event: 'player:move',
      payload: {
        playerId: this.playerId,
        username: this.playerUsername,
        x: Math.round(this.px),
        y: Math.round(this.py),
      },
    });
  }

  // ─── Chat Bridge (React ↔ Phaser) ───────────────────────────────────────────

  private setupReactBridge() {
    eventBus.on(EVENTS.CHAT_SEND, (message: unknown) => {
      if (typeof message !== 'string') return;
      const trimmed = message.trim();
      if (!trimmed) return;

      const now = Date.now();
      if (now - this.lastChatSent < CHAT.RATE_LIMIT_MS) return;
      this.lastChatSent = now;

      // Show bubble on own player
      this.chatSystem.showBubble('__player__', trimmed, this.px, this.py, true);

      // Broadcast to others
      this.channel?.send({
        type: 'broadcast',
        event: 'player:chat',
        payload: {
          playerId: this.playerId,
          username: this.playerUsername,
          message: trimmed,
          x: Math.round(this.px),
          y: Math.round(this.py),
        },
      });

      // Notify React log
      eventBus.emit(EVENTS.CHAT_RECEIVED, {
        playerId: this.playerId,
        username: this.playerUsername,
        message: trimmed,
        isMe: true,
      });
    });

    eventBus.on(EVENTS.CHAT_INPUT_FOCUS, () => { this.inputBlocked = true; });
    eventBus.on(EVENTS.CHAT_INPUT_BLUR, () => { this.inputBlocked = false; });
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private getOrCreatePlayerId(): string {
    if (typeof window === 'undefined') return crypto.randomUUID();
    const stored = localStorage.getItem('waspi_player_id');
    if (stored) return stored;
    const id = crypto.randomUUID();
    localStorage.setItem('waspi_player_id', id);
    return id;
  }

  private getOrCreateUsername(): string {
    if (typeof window === 'undefined') return 'waspi_guest';
    const stored = localStorage.getItem('waspi_username');
    if (stored) return stored;
    const adjectives = ['NEON', 'DARK', 'WILD', 'COOL', 'DOPE', 'EPIC', 'HYPE', 'SICK'];
    const nouns = ['WASPI', 'RIDER', 'GHOST', 'WOLF', 'BLADE', 'STORM', 'FIRE', 'BYTE'];
    const username = `${adjectives[Math.floor(Math.random() * adjectives.length)]}_${nouns[Math.floor(Math.random() * nouns.length)]}_${Math.floor(Math.random() * 999)}`;
    localStorage.setItem('waspi_username', username);
    return username;
  }

  // ─── Lifecycle ───────────────────────────────────────────────────────────────

  update(_time: number, delta: number) {
    this.handleMovement(delta);
    this.syncPosition();
    this.chatSystem.update();

    // Interpolate remote players
    for (const [, rp] of this.remotePlayers) {
      rp.x = Phaser.Math.Linear(rp.x, rp.targetX, 0.18);
      rp.y = Phaser.Math.Linear(rp.y, rp.targetY, 0.18);
      rp.avatar.setPosition(rp.x, rp.y);
      rp.avatar.setDepth(Math.floor(rp.y / 10));
      rp.nameplate.setPosition(rp.x, rp.y - 46);
      this.chatSystem.updatePosition(rp.avatar.getContainer().name ?? '', rp.x, rp.y);
    }
  }

  shutdown() {
    this.channel?.unsubscribe();
    this.chatSystem.destroy();
    eventBus.off(EVENTS.CHAT_SEND, () => {});
    eventBus.off(EVENTS.CHAT_INPUT_FOCUS, () => {});
    eventBus.off(EVENTS.CHAT_INPUT_BLUR, () => {});
  }
}
