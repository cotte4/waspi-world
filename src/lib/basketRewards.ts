export const BASKET_STREAK_REWARDS = [
  { minStreak: 4, tenks: 300 },
  { minStreak: 3, tenks: 200 },
  { minStreak: 2, tenks: 150 },
  { minStreak: 1, tenks: 100 },
] as const;

export function calculateBasketShotReward(streak: number) {
  const safeStreak = Math.max(1, Math.floor(streak));
  return BASKET_STREAK_REWARDS.find((tier) => safeStreak >= tier.minStreak)?.tenks ?? 100;
}

export function calculateBasketReward(score: number) {
  const safeScore = Math.max(0, Math.floor(score));
  return safeScore * 100;
}
