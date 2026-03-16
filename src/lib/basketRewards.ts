export const BASKET_STREAK_REWARDS = [
  { minStreak: 4, tenks: 100 },
  { minStreak: 3, tenks: 70 },
  { minStreak: 2, tenks: 50 },
  { minStreak: 1, tenks: 35 },
] as const;

export function calculateBasketShotReward(streak: number) {
  const safeStreak = Math.max(1, Math.floor(streak));
  return BASKET_STREAK_REWARDS.find((tier) => safeStreak >= tier.minStreak)?.tenks ?? 100;
}

export function calculateBasketReward(score: number) {
  const safeScore = Math.max(0, Math.floor(score));
  return safeScore * 35;
}
