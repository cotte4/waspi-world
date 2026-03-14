import Phaser from 'phaser';
import { eventBus, EVENTS } from '../config/eventBus';
import {
  isActionDown,
  isActionJustDown,
  isMovementDirectionJustDown,
  loadControlSettings,
  readMovementVector,
  type ActionBinding,
  type ControlSettings,
  type MovementDirection,
} from './ControlSettings';

export class SceneControls {
  private offControls: (() => void) | null = null;
  private currentSettings: ControlSettings = loadControlSettings();

  constructor(private readonly scene: Phaser.Scene) {
    this.offControls = eventBus.on(EVENTS.CONTROL_SETTINGS_CHANGED, (payload: unknown) => {
      if (!payload || typeof payload !== 'object') return;
      const next = payload as Partial<ControlSettings>;
      this.currentSettings = {
        ...this.currentSettings,
        ...next,
        movementBindings: {
          ...this.currentSettings.movementBindings,
          ...next.movementBindings,
        },
        actionBindings: {
          ...this.currentSettings.actionBindings,
          ...next.actionBindings,
        },
      };
    });

    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.destroy();
    });
  }

  get settings() {
    return this.currentSettings;
  }

  readMovement(includeJoystick = false) {
    return readMovementVector({
      scene: this.scene,
      settings: this.currentSettings,
      includeJoystick,
    });
  }

  isActionDown(action: ActionBinding) {
    return isActionDown(this.scene, this.currentSettings, action);
  }

  isActionJustDown(action: ActionBinding) {
    return isActionJustDown(this.scene, this.currentSettings, action);
  }

  isMovementDirectionJustDown(direction: MovementDirection) {
    return isMovementDirectionJustDown(this.scene, this.currentSettings, direction);
  }

  destroy() {
    this.offControls?.();
    this.offControls = null;
  }
}

