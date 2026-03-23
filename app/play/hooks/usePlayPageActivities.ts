import { useEffect, useState } from 'react';
import { eventBus, EVENTS } from '@/src/game/config/eventBus';

export function usePlayPageActivities() {
  const [activeActivities, setActiveActivities] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    const onStart = (payload: unknown) => {
      const p = payload as { activity?: string };
      if (typeof p?.activity === 'string') {
        const activity = p.activity;
        setActiveActivities((prev) => new Set<string>([...prev, activity]));
      }
    };

    const onStop = (payload: unknown) => {
      const p = payload as { activity?: string };
      if (typeof p?.activity === 'string') {
        const activity = p.activity;
        setActiveActivities((prev) => {
          const next = new Set(prev);
          next.delete(activity);
          return next;
        });
      }
    };

    const offStart = eventBus.on(EVENTS.ACTIVITY_STARTED, onStart);
    const offStop = eventBus.on(EVENTS.ACTIVITY_STOPPED, onStop);
    const offScene = eventBus.on(EVENTS.SCENE_CHANGED, () => setActiveActivities(new Set()));

    return () => {
      offStart();
      offStop();
      offScene();
    };
  }, []);

  return activeActivities;
}
