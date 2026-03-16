import { VoiceChatManager } from './VoiceChatManager';

let instance: VoiceChatManager | null = null;

export function getVoiceChat(): VoiceChatManager {
  if (!instance) {
    instance = new VoiceChatManager({
      minDistance: 150,
      maxDistance: 600,
      falloffCurve: 'logarithmic',
      masterVolume: 1.0,
    });
  }
  return instance;
}

export function destroyVoiceChat(): void {
  instance?.destroy();
  instance = null;
}
