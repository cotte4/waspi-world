// CaveScene.ts
// Mining Lv5 cave expedition. Accessible from BosqueMaterialesScene.
// 3 rare mineral nodes, 5-minute exit timer, atmospheric dark visuals.
// All drawn in code — no external tilesets.

import Phaser from 'phaser';
import { announceScene, bindSafeResetToPlaza, createBackButton, transitionToScene, transitionToWorldScene } from '../systems/SceneUi';
import { getSkillSystem } from '../systems/SkillSystem';
import { MiningMinigame } from '../systems/MiningMinigame';
import { eventBus, EVENTS } from '../config/eventBus';
import { SAFE_PLAZA_RETURN } from '../config/constants';
import { getContractSystem } from '../systems/ContractSystem';
import { getQuestSystem } from '../systems/QuestSystem';
import { getMasterySystem } from '../systems/MasterySystem';
import { getEventSystem } from '../systems/EventSystem';
import { AvatarRenderer, loadStoredAvatarConfig } from '../systems/AvatarRenderer';
import { SceneControls } from '../systems/SceneControls';

// ─── Constants ────────────────────────────────────────────────────────────────
const W = 600;
const H = 400;
const MOVE_SPEED = 120;
const SPRINT_MULT = 1.5;
const NODE_COLLECT_RANGE = 50;
const NODE_RESPAWN_MS = 45_000;
const EXPEDITION_DURATION_MS = 5 * 60 * 1000; // 5 minutes

// Cave entry spawn — top-centre of cave map
const ENTRY_X = 300;
const ENTRY_Y = 60;

// Return coords passed back to BosqueMaterialesScene
const RETURN_BOSQUE_X = 1380;
const RETURN_BOSQUE_Y = 200;

// ─── Node definitions ─────────────────────────────────────────────────────────
const NODE_DEFS: Array<{ x: number; y: number }> = [
  { x: 140, y: 220 },
  { x: 300, y: 310 },
  { x: 460, y: 200 },
];

// ─── Collider rects (walls, stalactite bases) ────────────────────────────────
const WALL_RECTS: Array<{ x: number; y: number; w: number; h: number }> = [
  // Outer walls (40px thick)
  { x: 0,   y: 0,       w: W,  h: 36 },   // top
  { x: 0,   y: H - 36,  w: W,  h: 36 },   // bottom — entry is cut in below
  { x: 0,   y: 0,       w: 36, h: H },     // left
  { x: W - 36, y: 0,    w: 36, h: H },     // right
  // Interior boulders / pillars
  { x: 80,  y: 150, w: 44, h: 44 },
  { x: 380, y: 130, w: 48, h: 48 },
  { x: 220, y: 260, w: 38, h: 38 },
  { x: 480, y: 270, w: 42, h: 42 },
];

// ─── Scene data type ──────────────────────────────────────────────────────────
type CaveSceneData = {
  returnX?: number;
  returnY?: number;
};

// ─── Node state ───────────────────────────────────────────────────────────────
type CaveNode = {
  idx: number;
  x: number;
  y: number;
  available: boolean;
  respawnAt: number;
  circle: Phaser.GameObjects.Arc;
  glow: Phaser.GameObjects.Arc;
  glowOuter: Phaser.GameObjects.Arc;
  label: Phaser.GameObjects.Text;
};

// ─── Scene ────────────────────────────────────────────────────────────────────
export class CaveScene extends Phaser.Scene {
  private player!: AvatarRenderer;
  private controls!: SceneControls;

  private keyW!: Phaser.Input.Keyboard.Key;
  private keyA!: Phaser.Input.Keyboard.Key;
  private keyS!: Phaser.Input.Keyboard.Key;
  private keyD!: Phaser.Input.Keyboard.Key;
  private keyE!: Phaser.Input.Keyboard.Key;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private shiftKey?: Phaser.Input.Keyboard.Key;

  private px = ENTRY_X;
  private py = ENTRY_Y;

  private inTransition = false;
  private minigameActive = false;
  private activeMiningMinigame: MiningMinigame | null = null;

  private wallColliders: Phaser.Geom.Rectangle[] = [];
  private caveNodes: CaveNode[] = [];

  private promptText?: Phaser.GameObjects.Text;
  private timerText?: Phaser.GameObjects.Text;
  private hudCollected?: Phaser.GameObjects.Text;
  private interactHint?: Phaser.GameObjects.Text;
  private collectedTotal = 0;

  private exitTimer?: Phaser.Time.TimerEvent;
  private timeRemainingMs = EXPEDITION_DURATION_MS;
  private bridgeCleanupFns: Array<() => void> = [];

  constructor() {
    super({ key: 'CaveScene' });
  }

  init(data?: CaveSceneData) {
    this.inTransition = false;
    this.px = data?.returnX !== undefined ? data.returnX : ENTRY_X;
    this.py = data?.returnY !== undefined ? data.returnY : ENTRY_Y;
    this.collectedTotal = 0;
    this.timeRemainingMs = EXPEDITION_DURATION_MS;
  }

  create() {
    this.inTransition = false;
    this.input.enabled = true;
    announceScene(this);

    this.controls = new SceneControls(this);

    // WAKE — defensive reset
    this.events.on(Phaser.Scenes.Events.WAKE, () => {
      this.inTransition = false;
      this.input.enabled = true;
      if (this.input.keyboard) this.input.keyboard.enabled = true;
    });

    // SHUTDOWN — clean up everything
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.onShutdown, this);

    // Safe-reset binding
    bindSafeResetToPlaza(this, () => {
      transitionToWorldScene(this, SAFE_PLAZA_RETURN.X, SAFE_PLAZA_RETURN.Y);
    });

    // Build world
    this.buildWalls();
    this.drawBackground();
    this.drawCaveWalls();
    this.drawStalactites();
    this.drawEntryMarker();
    this.setupNodes();
    this.createPlayer();
    this.setupInput();
    this.setupUi();
    this.startExpeditionTimer();

    createBackButton(this, () => this.leaveToBosque(), 'BOSQUE');

    this.cameras.main.setBounds(0, 0, W, H);
    this.cameras.main.startFollow(this.player.getContainer(), true, 0.12, 0.12);
    this.cameras.main.resetFX();
    this.cameras.main.fadeIn(300, 0, 0, 0);
  }

  update(_time: number, delta: number) {
    if (this.inTransition) return;
    this.handleMovement(delta);
    this.updateNodes();
    this.updatePrompt();
    this.checkExitTrigger();
    if (Phaser.Input.Keyboard.JustDown(this.keyE)) this.handleInteract();
  }

  // ─── World Building ───────────────────────────────────────────────────────

  private buildWalls() {
    this.wallColliders = WALL_RECTS.map(
      (r) => new Phaser.Geom.Rectangle(r.x, r.y, r.w, r.h),
    );
  }

  private drawBackground() {
    const g = this.add.graphics().setDepth(0);

    // Cave floor — near-black with blue-purple tint
    g.fillStyle(0x050508, 1);
    g.fillRect(0, 0, W, H);

    // Floor texture grid (faint)
    g.lineStyle(1, 0x0c0c14, 0.6);
    for (let x = 0; x < W; x += 32) g.lineBetween(x, 0, x, H);
    for (let y = 0; y < H; y += 32) g.lineBetween(0, y, W, y);

    // Floor variation patches — slightly lighter
    const patches: Array<{ x: number; y: number; w: number; h: number }> = [
      { x: 100, y: 180, w: 120, h: 80 },
      { x: 260, y: 260, w: 100, h: 70 },
      { x: 400, y: 170, w: 130, h: 90 },
    ];
    patches.forEach((p) => {
      g.fillStyle(0x0a0a12, 0.7);
      g.fillRoundedRect(p.x, p.y, p.w, p.h, 14);
    });
  }

  private drawCaveWalls() {
    const g = this.add.graphics().setDepth(1);

    // Outer wall fill
    g.fillStyle(0x1a1520, 1);
    g.fillRect(0, 0, W, 36);          // top
    g.fillRect(0, H - 36, W, 36);     // bottom
    g.fillRect(0, 0, 36, H);          // left
    g.fillRect(W - 36, 0, 36, H);     // right

    // Entry gap in bottom wall — centred
    g.fillStyle(0x050508, 1);
    g.fillRect(260, H - 36, 80, 36);

    // Wall edge highlights
    g.lineStyle(2, 0x2e2840, 0.8);
    g.strokeRect(36, 36, W - 72, H - 72);

    // Interior pillar boulders (match WALL_RECTS entries 4-7)
    const pillars = [
      { x: 80,  y: 150, w: 44, h: 44 },
      { x: 380, y: 130, w: 48, h: 48 },
      { x: 220, y: 260, w: 38, h: 38 },
      { x: 480, y: 270, w: 42, h: 42 },
    ];
    pillars.forEach((p) => {
      g.fillStyle(0x1c1828, 1);
      g.fillRoundedRect(p.x, p.y, p.w, p.h, 8);
      g.fillStyle(0x26223a, 0.7);
      g.fillRoundedRect(p.x + 6, p.y + 4, p.w - 14, p.h - 14, 5);
      g.lineStyle(1, 0x332e4a, 0.6);
      g.strokeRoundedRect(p.x, p.y, p.w, p.h, 8);
      // crack
      g.lineStyle(1, 0x100e18, 0.8);
      g.lineBetween(p.x + 12, p.y + 8, p.x + 6, p.y + p.h - 8);
    });

    // Scattered pebbles
    const pebbles = [
      { x: 160, y: 100 }, { x: 340, y: 80 }, { x: 520, y: 160 },
      { x: 70,  y: 300 }, { x: 530, y: 340 }, { x: 200, y: 340 },
    ];
    pebbles.forEach((p) => {
      g.fillStyle(0x16141e, 1);
      g.fillEllipse(p.x, p.y, 16, 10);
      g.lineStyle(1, 0x222030, 0.5);
      g.strokeEllipse(p.x, p.y, 16, 10);
    });
  }

  private drawStalactites() {
    const g = this.add.graphics().setDepth(1.5);

    // Stalactites hang from top wall — triangles pointing down
    const stalactites = [
      { x: 80,  len: 44, w: 18 },
      { x: 160, len: 30, w: 14 },
      { x: 230, len: 52, w: 22 },
      { x: 330, len: 38, w: 16 },
      { x: 420, len: 48, w: 20 },
      { x: 510, len: 28, w: 12 },
    ];
    stalactites.forEach((s) => {
      // Shadow drip on floor
      g.fillStyle(0x080810, 0.35);
      g.fillEllipse(s.x, 36 + s.len + 18, s.w + 10, 6);

      // Main body
      g.fillStyle(0x1a1520, 1);
      g.fillTriangle(
        s.x - s.w / 2, 36,
        s.x + s.w / 2, 36,
        s.x, 36 + s.len,
      );
      // Highlight edge
      g.lineStyle(1, 0x2e2840, 0.7);
      g.strokeTriangle(
        s.x - s.w / 2, 36,
        s.x + s.w / 2, 36,
        s.x, 36 + s.len,
      );
      // Inner lighter stripe
      g.fillStyle(0x232030, 0.5);
      g.fillTriangle(
        s.x - s.w / 4, 36,
        s.x + s.w / 4, 36,
        s.x, 36 + s.len * 0.6,
      );
    });

    // Stalagmites rise from bottom wall
    const stalagmites = [
      { x: 120, len: 35, w: 14 },
      { x: 210, len: 24, w: 12 },
      { x: 370, len: 40, w: 16 },
      { x: 480, len: 28, w: 12 },
    ];
    stalagmites.forEach((s) => {
      g.fillStyle(0x1a1520, 1);
      g.fillTriangle(
        s.x - s.w / 2, H - 36,
        s.x + s.w / 2, H - 36,
        s.x, H - 36 - s.len,
      );
      g.lineStyle(1, 0x2e2840, 0.6);
      g.strokeTriangle(
        s.x - s.w / 2, H - 36,
        s.x + s.w / 2, H - 36,
        s.x, H - 36 - s.len,
      );
    });
  }

  private drawEntryMarker() {
    const g = this.add.graphics().setDepth(0.5);
    // Faint golden marker at exit (bottom-centre gap)
    g.fillStyle(0xf5c842, 0.08);
    g.fillRect(260, H - 36, 80, 36);
    g.lineStyle(1, 0xf5c842, 0.3);
    g.strokeRect(260, H - 36, 80, 36);

    this.add.text(300, H - 20, '↓ SALIR', {
      fontSize: '5px', fontFamily: '"Press Start 2P", monospace',
      color: '#F5C842', stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(1).setAlpha(0.7);
  }

  // ─── Nodes ────────────────────────────────────────────────────────────────

  private setupNodes() {
    NODE_DEFS.forEach((def, i) => {
      // Outer ambient glow (large, very faint)
      const glowOuter = this.add.arc(def.x, def.y, 38, 0, 360, false, 0x5010c8, 0.06)
        .setDepth(1.8);

      // Inner glow ring
      const glow = this.add.arc(def.x, def.y, 22, 0, 360, false, 0x7030f0, 0.18)
        .setStrokeStyle(2, 0x9050ff, 0.5)
        .setDepth(1.9);

      // Node core
      const circle = this.add.arc(def.x, def.y, 10, 0, 360, false, 0xb080ff, 0.95)
        .setStrokeStyle(2, 0xd0a0ff, 0.9)
        .setDepth(2);

      // Label
      const label = this.add.text(def.x, def.y - 20, 'MINERAL', {
        fontSize: '4px', fontFamily: '"Press Start 2P", monospace',
        color: '#c090ff', stroke: '#000', strokeThickness: 3,
      }).setOrigin(0.5).setDepth(2.1);

      // Pulse tween on glow and core
      this.tweens.add({
        targets: [glow, circle],
        scaleX: { from: 0.88, to: 1.12 },
        scaleY: { from: 0.88, to: 1.12 },
        alpha: { from: 0.7, to: 1 },
        duration: 1100 + i * 250,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });

      // Slow outer glow pulse
      this.tweens.add({
        targets: glowOuter,
        alpha: { from: 0.04, to: 0.14 },
        scaleX: { from: 0.9, to: 1.2 },
        scaleY: { from: 0.9, to: 1.2 },
        duration: 2200 + i * 400,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });

      this.caveNodes.push({
        idx: i,
        x: def.x, y: def.y,
        available: true,
        respawnAt: 0,
        circle, glow, glowOuter, label,
      });
    });
  }

  // ─── Player ───────────────────────────────────────────────────────────────

  private createPlayer() {
    this.player = new AvatarRenderer(this, this.px, this.py, loadStoredAvatarConfig());
    this.player.setDepth(50);
  }

  // ─── Input ────────────────────────────────────────────────────────────────

  private setupInput() {
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.keyW = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W);
    this.keyA = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.keyS = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S);
    this.keyD = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D);
    this.keyE = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    this.shiftKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
  }

  // ─── UI ───────────────────────────────────────────────────────────────────

  private setupUi() {
    // Scene title
    this.add.text(this.scale.width / 2, 14, 'CUEVA OSCURA', {
      fontSize: '9px', fontFamily: '"Press Start 2P", monospace',
      color: '#9060cc', stroke: '#000', strokeThickness: 4,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(1000);

    // Countdown timer — top-centre, below title
    this.timerText = this.add.text(this.scale.width / 2, 30, '5:00', {
      fontSize: '7px', fontFamily: '"Press Start 2P", monospace',
      color: '#c090ff', stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(1000);

    // Collected HUD — top-left
    this.hudCollected = this.add.text(16, 76, 'MINERALES: 0', {
      fontSize: '7px', fontFamily: '"Press Start 2P", monospace',
      color: '#c090ff', stroke: '#000', strokeThickness: 3,
    }).setScrollFactor(0).setDepth(1000);

    // Interact prompt — bottom-centre
    this.promptText = this.add.text(this.scale.width / 2, this.scale.height - 26, '', {
      fontSize: '8px', fontFamily: '"Press Start 2P", monospace',
      color: '#F5C842', stroke: '#000000', strokeThickness: 4, align: 'center',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(1000);
  }

  // ─── Expedition timer ─────────────────────────────────────────────────────

  private startExpeditionTimer() {
    // Tick every second
    this.exitTimer = this.time.addEvent({
      delay: 1000,
      loop: true,
      callback: this.onTimerTick,
      callbackScope: this,
    });
  }

  private onTimerTick() {
    if (!this.scene?.isActive('CaveScene')) return;
    this.timeRemainingMs -= 1000;

    if (this.timeRemainingMs <= 0) {
      this.timeRemainingMs = 0;
      this.updateTimerDisplay();
      this.exitTimer?.remove();
      this.exitTimer = undefined;
      // Time's up — force exit
      this.leaveToBosque();
      return;
    }

    this.updateTimerDisplay();

    // Warning flash when under 60s
    if (this.timeRemainingMs <= 60_000 && this.timerText) {
      this.timerText.setColor(this.timeRemainingMs <= 30_000 ? '#FF4444' : '#FFaa22');
    }
  }

  private updateTimerDisplay() {
    if (!this.timerText) return;
    const totalSec = Math.max(0, Math.ceil(this.timeRemainingMs / 1000));
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    this.timerText.setText(`${m}:${s.toString().padStart(2, '0')}`);
  }

  // ─── Movement ─────────────────────────────────────────────────────────────

  private handleMovement(delta: number) {
    if (this.minigameActive) return;
    const dt = delta / 1000;
    const sprint = this.shiftKey?.isDown ? SPRINT_MULT : 1;
    const sys = getSkillSystem();
    const speedPct = sys.getPassiveBuffTotal('speed') + sys.getSynergyBuff('speed');
    const speed = MOVE_SPEED * (1 + speedPct / 100) * sprint;

    let dx = 0; let dy = 0;
    if (this.keyA.isDown || this.cursors.left.isDown)  dx -= 1;
    if (this.keyD.isDown || this.cursors.right.isDown) dx += 1;
    if (this.keyW.isDown || this.cursors.up.isDown)    dy -= 1;
    if (this.keyS.isDown || this.cursors.down.isDown)  dy += 1;

    if (dx !== 0 && dy !== 0) { dx *= 0.707; dy *= 0.707; }

    const nx = Phaser.Math.Clamp(this.px + dx * speed * dt, 36, W - 36);
    const ny = Phaser.Math.Clamp(this.py + dy * speed * dt, 36, H - 36);

    if (!this.collidesAt(nx, this.py)) this.px = nx;
    if (!this.collidesAt(this.px, ny)) this.py = ny;

    this.player.update(dx !== 0 || dy !== 0, dx, dy);
    this.player.setPosition(this.px, this.py);
  }

  private collidesAt(x: number, y: number): boolean {
    const r = 12;
    const pr = new Phaser.Geom.Rectangle(x - r, y - r, r * 2, r * 2);
    return this.wallColliders.some((c) => Phaser.Geom.Rectangle.Overlaps(pr, c));
  }

  // ─── Node updates ─────────────────────────────────────────────────────────

  private updateNodes() {
    const now = this.time.now;
    for (const node of this.caveNodes) {
      if (!node.available && now >= node.respawnAt) {
        node.available = true;
        node.circle.setVisible(true);
        node.glow.setVisible(true);
        node.glowOuter.setVisible(true);
        node.label.setVisible(true);
      }
    }
  }

  // ─── Prompt ───────────────────────────────────────────────────────────────

  private updatePrompt() {
    let hint = '';

    // Near exit?
    if (this.py > H - 55 && this.px >= 250 && this.px <= 350) {
      hint = '↓ SALIR AL BOSQUE';
    } else {
      for (const node of this.caveNodes) {
        if (!node.available) continue;
        const d = Phaser.Math.Distance.Between(this.px, this.py, node.x, node.y);
        if (d < NODE_COLLECT_RANGE) {
          hint = '[E] EXTRAER MINERAL RARO';
          break;
        }
      }
    }

    this.promptText?.setText(hint);
  }

  private showPrompt(msg: string) {
    this.promptText?.setText(msg);
    this.time.delayedCall(1800, () => this.promptText?.setText(''));
  }

  // ─── Interact ─────────────────────────────────────────────────────────────

  private handleInteract() {
    if (this.minigameActive) return;

    let nearest: CaveNode | null = null;
    let nearestDist = NODE_COLLECT_RANGE;

    for (const node of this.caveNodes) {
      if (!node.available) continue;
      const d = Phaser.Math.Distance.Between(this.px, this.py, node.x, node.y);
      if (d < nearestDist) { nearest = node; nearestDist = d; }
    }

    if (!nearest) return;

    nearest.available = false;
    nearest.respawnAt = this.time.now + NODE_RESPAWN_MS;
    nearest.circle.setVisible(false);
    nearest.glow.setVisible(false);
    nearest.glowOuter.setVisible(false);
    nearest.label.setVisible(false);

    this.minigameActive = true;

    // Safety: unblock after 12s if async hangs
    const safetyTimer = window.setTimeout(() => {
      if (!this.scene?.isActive('CaveScene')) return;
      this.minigameActive = false;
      this.activeMiningMinigame = null;
    }, 12_000);

    void (async () => {
      try {
        const sys = getSkillSystem();
        const miningLevel = sys.getLevel('mining');
        const isAutoMode = miningLevel >= 4;

        let minigameBonus = 0;
        let isAuto = isAutoMode;

        if (!isAutoMode) {
          const minigame = new MiningMinigame(this);
          this.activeMiningMinigame = minigame;
          const result = await minigame.play(false);
          minigame.destroy();
          this.activeMiningMinigame = null;
          isAuto = result === 'miss';
          minigameBonus = result === 'perfect' ? 5 : result === 'good' ? 3 : 0;
        }

        // Roll quality — cave nodes always count as 'cave_collect'
        const qr = await sys.rollQuality('mining', 'cave_collect', isAuto);
        if (!this.scene?.isActive('CaveScene')) return;

        // Contract + quest tracking
        void getContractSystem().trackAction('cave_collect', 'mining', qr.quality);
        void getQuestSystem().trackAction('cave_collect', 'mining');

        // XP
        const eventMult = getEventSystem().getXpMultiplier('mining');
        // Cave nodes give a premium: base 18 XP instead of 10
        const xpTotal = Math.round((18 + qr.xp_bonus + minigameBonus) * eventMult);

        this.collectedTotal++;
        this.hudCollected?.setText(`MINERALES: ${this.collectedTotal}`);

        // Determine if the player gets a MINERAL_OSCURO (rare bonus drop)
        // 25% chance at any quality roll; 100% on legendary
        const rareRoll = Math.random();
        const getRare = qr.quality === 'legendary' || rareRoll < 0.25;

        const dropLabel = getRare
          ? `+1 MINERAL_OSCURO [${qr.label}]  +${xpTotal} XP`
          : `+1 MINERAL [${qr.label}]  +${xpTotal} XP`;

        this.showPrompt(dropLabel);

        if (this.hudCollected) {
          this.hudCollected.setColor(qr.color);
          this.time.delayedCall(1600, () => {
            if (!this.hudCollected?.active) return;
            this.hudCollected.setColor('#c090ff');
          });
        }

        const xpResult = await sys.addXp('mining', xpTotal, 'cave_collect');
        if (!this.scene?.isActive('CaveScene')) return;

        if (xpResult.leveled_up) {
          eventBus.emit(EVENTS.UI_NOTICE, { message: `⛏️ MINERÍA LVL ${xpResult.new_level}!`, color: '#F5C842' });
        }

        // Mastery MP at Lv5
        if (sys.getLevel('mining') >= 5) {
          void getMasterySystem().earnMp('mining');
        }

        // Flash effects
        if (getRare) {
          this.cameras.main.flash(300, 120, 30, 200, false);
          eventBus.emit(EVENTS.UI_NOTICE, { message: '💎 MINERAL OSCURO!', color: '#c090ff' });
        } else if (qr.quality === 'legendary') {
          this.cameras.main.flash(400, 245, 200, 66, false);
          eventBus.emit(EVENTS.UI_NOTICE, { message: '✨ MATERIAL LEGENDARIO!', color: '#F5C842' });
        }
      } finally {
        window.clearTimeout(safetyTimer);
        if (this.scene?.isActive('CaveScene')) {
          this.minigameActive = false;
          this.activeMiningMinigame = null;
        }
      }
    })();
  }

  // ─── Exit ─────────────────────────────────────────────────────────────────

  private checkExitTrigger() {
    // Exit gap: bottom wall centre, x 260-340, y > H-45
    if (this.py > H - 45 && this.px >= 255 && this.px <= 345) {
      this.leaveToBosque();
    }
  }

  private leaveToBosque() {
    if (this.inTransition) return;
    this.inTransition = true;

    const started = transitionToScene(this, 'BosqueMaterialesScene', {
      returnX: RETURN_BOSQUE_X,
      returnY: RETURN_BOSQUE_Y,
    });

    if (!started) this.inTransition = false;
  }

  // ─── Shutdown ─────────────────────────────────────────────────────────────

  private onShutdown() {
    this.exitTimer?.remove();
    this.exitTimer = undefined;

    if (this.activeMiningMinigame) {
      this.activeMiningMinigame.destroy();
      this.activeMiningMinigame = null;
    }

    this.minigameActive = false;
    this.bridgeCleanupFns.forEach((fn) => fn());
    this.bridgeCleanupFns = [];
    this.controls.destroy();
  }
}
