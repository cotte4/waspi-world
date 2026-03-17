import Phaser from 'phaser';
import { getSkillSystem, initSkillSystem } from '../systems/SkillSystem';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload() {
    // Kick off skill data fetch in the background — non-blocking
    void initSkillSystem();
    void getSkillSystem().loadPurchasedItems();
    void getSkillSystem().loadSpecs();

    const { width, height } = this.scale;

    // Background
    this.add.rectangle(width / 2, height / 2, width, height, 0x0E0E14);

    // Title
    const title = this.add.text(width / 2, height / 2 - 60, 'WASPI WORLD', {
      fontSize: '28px',
      fontFamily: '"Press Start 2P", "Courier New", monospace',
      color: '#F5C842',
    }).setOrigin(0.5);

    const subtitle = this.add.text(width / 2, height / 2 - 20, 'Open World - Chat Social - Streetwear', {
      fontSize: '8px',
      fontFamily: '"Press Start 2P", "Courier New", monospace',
      color: '#888888',
    }).setOrigin(0.5);

    // Loading bar background
    this.add.rectangle(width / 2, height / 2 + 30, 320, 18, 0x1A1A2E);
    const bar = this.add.rectangle(width / 2 - 160, height / 2 + 30, 0, 14, 0xF5C842).setOrigin(0, 0.5);

    const status = this.add.text(width / 2, height / 2 + 60, 'CARGANDO...', {
      fontSize: '8px',
      fontFamily: '"Press Start 2P", "Courier New", monospace',
      color: '#555555',
    }).setOrigin(0.5);

    this.tweens.add({
      targets: title,
      scale: { from: 0.98, to: 1.02 },
      alpha: { from: 0.9, to: 1 },
      duration: 1500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    this.tweens.add({
      targets: subtitle,
      alpha: { from: 0.45, to: 0.85 },
      duration: 1200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    this.tweens.add({
      targets: status,
      alpha: { from: 0.5, to: 1 },
      duration: 700,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    this.load.on('progress', (v: number) => {
      bar.setSize(320 * v, 14);
      bar.setAlpha(0.72 + v * 0.28);
    });

    this.load.on('complete', () => {
      status.setText('LISTO!');
    });

    this.load.on('loaderror', (file: unknown) => {
      console.log('[Waspi] Asset load error', file);
    });

    // Seed sprites (drop files into public/assets/seeds/)
    // If they don't exist, CreatorScene will fall back to procedural preview.
    this.load.image('cottenks', '/assets/sprites/cottenks.png');
    this.load.image('seed_gengar', '/assets/seeds/gengar.png');
    this.load.image('seed_buho', '/assets/seeds/buho.png');
    this.load.image('seed_piplup', '/assets/seeds/piplup.png');
    this.load.image('seed_chacha', '/assets/seeds/chacha.png');
    this.load.spritesheet('weapon_pistol_idle',   '/assets/sprites/guns/01_pistol/idle_strip.png',   { frameWidth: 64, frameHeight: 64 });
    this.load.spritesheet('weapon_pistol_shoot',  '/assets/sprites/guns/01_pistol/shoot_strip.png',  { frameWidth: 64, frameHeight: 64 });
    this.load.spritesheet('weapon_smg_idle',      '/assets/sprites/guns/02_smg/idle_strip.png',      { frameWidth: 64, frameHeight: 64 });
    this.load.spritesheet('weapon_smg_shoot',     '/assets/sprites/guns/02_smg/shoot_strip.png',     { frameWidth: 64, frameHeight: 64 });
    this.load.spritesheet('weapon_shotgun_idle',  '/assets/sprites/guns/03_shotgun/idle_strip.png',  { frameWidth: 64, frameHeight: 64 });
    this.load.spritesheet('weapon_shotgun_shoot', '/assets/sprites/guns/03_shotgun/shoot_strip.png', { frameWidth: 64, frameHeight: 64 });
    this.load.spritesheet('weapon_rifle_idle',    '/assets/sprites/guns/04_rifle/idle_strip.png',    { frameWidth: 64, frameHeight: 64 });
    this.load.spritesheet('weapon_rifle_shoot',   '/assets/sprites/guns/04_rifle/shoot_strip.png',   { frameWidth: 64, frameHeight: 64 });
    this.load.spritesheet('weapon_deagle_idle',   '/assets/sprites/guns/05_deagle/idle_strip.png',   { frameWidth: 64, frameHeight: 64 });
    this.load.spritesheet('weapon_deagle_shoot',  '/assets/sprites/guns/05_deagle/shoot_strip.png',  { frameWidth: 64, frameHeight: 64 });
    this.load.spritesheet('weapon_cannon_idle',   '/assets/sprites/guns/06_cannon/idle_strip.png',   { frameWidth: 64, frameHeight: 64 });
    this.load.spritesheet('weapon_cannon_shoot',  '/assets/sprites/guns/06_cannon/shoot_strip.png',  { frameWidth: 64, frameHeight: 64 });
    this.load.spritesheet('weapon_raygun_idle',   '/assets/sprites/guns/07_raygun/idle_strip.png',   { frameWidth: 64, frameHeight: 64 });
    this.load.spritesheet('weapon_raygun_shoot',  '/assets/sprites/guns/07_raygun/shoot_strip.png',  { frameWidth: 64, frameHeight: 64 });

    const CHARACTER_FOLDERS: Record<string, string> = {
      trap_a: 'trap_A',
      trap_b: 'trap_B',
      trap_c: 'trap_C',
      trap_d: 'trap_D',
    };
    const CHARACTER_STATES: Record<string, { file: string; frameWidth: number; frameHeight: number }> = {
      idle: { file: 'idle_strip.png', frameWidth: 64, frameHeight: 64 },
      walk_down: { file: 'walk_down_strip.png', frameWidth: 64, frameHeight: 64 },
      walk_side: { file: 'walk_side_strip.png', frameWidth: 64, frameHeight: 64 },
      walk_up: { file: 'walk_up_strip.png', frameWidth: 64, frameHeight: 64 },
      shoot: { file: 'shoot_strip.png', frameWidth: 64, frameHeight: 64 },
      hurt: { file: 'hurt_strip.png', frameWidth: 64, frameHeight: 64 },
      death: { file: 'death_strip.png', frameWidth: 64, frameHeight: 64 },
    };
    for (const [kind, folder] of Object.entries(CHARACTER_FOLDERS)) {
      for (const [state, meta] of Object.entries(CHARACTER_STATES)) {
        this.load.spritesheet(
          `character_${kind}_${state}`,
          `/assets/sprites/character/player/${folder}/${meta.file}`,
          { frameWidth: meta.frameWidth, frameHeight: meta.frameHeight },
        );
      }
    }

    // Zombie enemy spritesheets
    const ZOMBIE_FRAME_SIZE: Record<string, number> = { rusher: 64, shooter: 64, tank: 96, boss: 128 };
    const ZOMBIE_ANIMS: Record<string, string[]> = {
      rusher:  ['idle', 'walk', 'attack', 'hurt', 'death'],
      shooter: ['idle', 'walk', 'attack', 'hurt', 'death'],
      tank:    ['idle', 'walk', 'attack', 'hurt', 'death'],
      boss:    ['idle', 'walk', 'attack', 'hurt', 'death'],
    };
    for (const [type, states] of Object.entries(ZOMBIE_ANIMS)) {
      const fw = ZOMBIE_FRAME_SIZE[type];
      for (const state of states) {
        this.load.spritesheet(
          `zombie_${type}_${state}`,
          `/assets/sprites/enemies/zombies/${type}/${state}_strip.png`,
          { frameWidth: fw, frameHeight: fw },
        );
      }
    }
    this.load.audio('arcade_theme', '/assets/audio/arcade-theme.mp3');
    // Música por escena (archivos pendientes — fallan silenciosamente si no existen)
    this.load.audio('world_ambient',  '/assets/audio/world-ambient.ogg');
    this.load.audio('zombies_dark',   '/assets/audio/zombies-dark.ogg');
    this.load.audio('store_upbeat',   '/assets/audio/store-upbeat.ogg');
  }

  create() {
    this.scene.start('CreatorScene');
  }
}

