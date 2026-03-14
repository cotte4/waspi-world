export const BASKET_REWARD_TIERS = [
  { minScore: 9, tenks: 8 },
  { minScore: 7, tenks: 6 },
  { minScore: 5, tenks: 4 },
  { minScore: 3, tenks: 2 },
  { minScore: 0, tenks: 0 },
] as const;

export function calculateBasketReward(score: number) {
  const safeScore = Math.max(0, Math.floor(score));
  return BASKET_REWARD_TIERS.find((tier) => safeScore >= tier.minScore)?.tenks ?? 0;
}
