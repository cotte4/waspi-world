import type { SupabaseClient, User } from '@supabase/supabase-js';
import type { PlayerState } from '@/src/lib/playerState';
import { appendTenksTransaction, ensureCatalogSeeded, ensurePlayerRow, hydratePlayerFromDatabase, PLAYER_METADATA_KEY } from '@/src/lib/commercePersistence';
import { creditBalance, debitBalance } from '@/src/lib/tenksBalance';

const PVP_RESERVATION_KEY = 'waspiPvpReservation';
const PVP_OUTCOME_KEY = 'waspiPvpOutcome';
export const PVP_BET_OPTIONS = [250, 500, 1000] as const;
const RESERVATION_TTL_MS = 10 * 60 * 1000;

export type PvpReservation = {
  matchId: string;
  opponentId: string;
  bet: number;
  createdAt: string;
};

export type PvpOutcome = {
  matchId: string;
  winnerId: string;
  loserId: string;
  reportedBy: string;
  createdAt: string;
};

type UserWithPlayer = {
  user: User;
  player: PlayerState;
  reservation: PvpReservation | null;
  outcome: PvpOutcome | null;
};

export function readReservation(user: User): PvpReservation | null {
  const raw = user.user_metadata?.[PVP_RESERVATION_KEY];
  if (!raw || typeof raw !== 'object') return null;
  const matchId = typeof raw.matchId === 'string' ? raw.matchId.trim() : '';
  const opponentId = typeof raw.opponentId === 'string' ? raw.opponentId.trim() : '';
  const bet = typeof raw.bet === 'number' ? raw.bet : NaN;
  const createdAt = typeof raw.createdAt === 'string' ? raw.createdAt : new Date().toISOString();
  if (!matchId || !opponentId || !Number.isFinite(bet) || bet <= 0) return null;
  return { matchId, opponentId, bet, createdAt };
}

export function readOutcome(user: User): PvpOutcome | null {
  const raw = user.user_metadata?.[PVP_OUTCOME_KEY];
  if (!raw || typeof raw !== 'object') return null;
  const matchId = typeof raw.matchId === 'string' ? raw.matchId.trim() : '';
  const winnerId = typeof raw.winnerId === 'string' ? raw.winnerId.trim() : '';
  const loserId = typeof raw.loserId === 'string' ? raw.loserId.trim() : '';
  const reportedBy = typeof raw.reportedBy === 'string' ? raw.reportedBy.trim() : '';
  const createdAt = typeof raw.createdAt === 'string' ? raw.createdAt : new Date().toISOString();
  if (!matchId || !winnerId || !loserId || !reportedBy) return null;
  return { matchId, winnerId, loserId, reportedBy, createdAt };
}

function isReservationExpired(reservation: PvpReservation) {
  const createdAt = new Date(reservation.createdAt).getTime();
  if (!Number.isFinite(createdAt)) return true;
  return Date.now() - createdAt > RESERVATION_TTL_MS;
}

export async function loadUserWithState(admin: SupabaseClient, userId: string): Promise<UserWithPlayer | null> {
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error) throw error;
  if (!data.user) return null;
  const player = await hydratePlayerFromDatabase(admin, data.user);
  return {
    user: data.user,
    player,
    reservation: readReservation(data.user),
    outcome: readOutcome(data.user),
  };
}

export async function persistPlayerMetadata(
  admin: SupabaseClient,
  input: {
    user: User;
    player: PlayerState;
    reservation: PvpReservation | null;
    outcome?: PvpOutcome | null;
  }
) {
  const { data: latestUserData, error: latestUserError } = await admin.auth.admin.getUserById(input.user.id);
  if (latestUserError) throw latestUserError;

  const latestUser = latestUserData.user ?? input.user;
  const metadata = {
    ...(latestUser.user_metadata ?? {}),
  } as Record<string, unknown>;

  metadata[PLAYER_METADATA_KEY] = input.player as unknown as Record<string, unknown>;

  if (input.reservation) {
    metadata[PVP_RESERVATION_KEY] = input.reservation;
  } else {
    delete metadata[PVP_RESERVATION_KEY];
  }

  if (typeof input.outcome !== 'undefined') {
    if (input.outcome) {
      metadata[PVP_OUTCOME_KEY] = input.outcome;
    } else {
      delete metadata[PVP_OUTCOME_KEY];
    }
  }

  await ensureCatalogSeeded(admin);
  await ensurePlayerRow(admin, latestUser, input.player, { syncTenksBalance: true });

  const { error } = await admin.auth.admin.updateUserById(input.user.id, {
    user_metadata: metadata,
  });

  if (error) throw error;
}

async function releaseExpiredReservation(admin: SupabaseClient, current: UserWithPlayer) {
  if (!current.reservation || !isReservationExpired(current.reservation)) return current;

  const credit = await creditBalance(admin, {
    playerId: current.user.id,
    amount: current.reservation.bet,
    fallbackBalance: current.player.tenks,
  });

  const refundedPlayer: PlayerState = {
    ...current.player,
    tenks: credit.newBalance,
  };

  try {
    await persistPlayerMetadata(admin, {
      user: current.user,
      player: refundedPlayer,
      reservation: null,
      outcome: current.outcome?.matchId === current.reservation.matchId ? null : current.outcome,
    });
  } catch (error) {
    await debitBalance(admin, {
      playerId: current.user.id,
      amount: current.reservation.bet,
      fallbackBalance: credit.newBalance,
    }).catch(() => undefined);
    throw error;
  }
  await appendTenksTransaction(admin, {
    playerId: current.user.id,
    amount: current.reservation.bet,
    reason: 'pvp_match_stale_refund',
    balanceAfter: refundedPlayer.tenks,
  });

  return {
    user: current.user,
    player: refundedPlayer,
    reservation: null,
    outcome: current.outcome?.matchId === current.reservation.matchId ? null : current.outcome,
  };
}

export async function reservePvpStake(
  admin: SupabaseClient,
  input: {
    user: User;
    opponentId: string;
    matchId: string;
    bet: number;
  }
) {
  if (!PVP_BET_OPTIONS.includes(input.bet as (typeof PVP_BET_OPTIONS)[number])) {
    throw new Error('Invalid bet amount.');
  }

  const current = await loadUserWithState(admin, input.user.id);
  if (!current) throw new Error('Player not found.');
  const nextCurrent = await releaseExpiredReservation(admin, current);

  if (nextCurrent.reservation?.matchId === input.matchId) {
    return { player: nextCurrent.player, reservation: nextCurrent.reservation, alreadyReserved: true };
  }
  if (nextCurrent.reservation) {
    throw new Error('You already have a pending PvP reservation.');
  }
  const opponent = await loadUserWithState(admin, input.opponentId);
  if (!opponent) throw new Error('Opponent not found.');
  const nextOpponent = await releaseExpiredReservation(admin, opponent);
  if (
    nextOpponent.reservation &&
    (nextOpponent.reservation.matchId !== input.matchId || nextOpponent.reservation.opponentId !== input.user.id)
  ) {
    throw new Error('Opponent already has a pending PvP match.');
  }

  const debit = await debitBalance(admin, {
    playerId: nextCurrent.user.id,
    amount: input.bet,
    fallbackBalance: nextCurrent.player.tenks,
  });
  if (!debit.ok) {
    throw new Error('Not enough TENKS for this bet.');
  }

  const nextPlayer: PlayerState = {
    ...nextCurrent.player,
    tenks: debit.newBalance,
  };
  const reservation: PvpReservation = {
    matchId: input.matchId,
    opponentId: input.opponentId,
    bet: input.bet,
    createdAt: new Date().toISOString(),
  };

  try {
    await persistPlayerMetadata(admin, {
      user: nextCurrent.user,
      player: nextPlayer,
      reservation,
      outcome: nextCurrent.outcome,
    });
  } catch (error) {
    await creditBalance(admin, {
      playerId: nextCurrent.user.id,
      amount: input.bet,
      fallbackBalance: debit.newBalance,
    }).catch(() => undefined);
    throw error;
  }
  await appendTenksTransaction(admin, {
    playerId: nextCurrent.user.id,
    amount: -input.bet,
    reason: 'pvp_match_entry',
    balanceAfter: nextPlayer.tenks,
  });

  return { player: nextPlayer, reservation, alreadyReserved: false };
}

export async function cancelPvpStake(
  admin: SupabaseClient,
  input: {
    user: User;
    matchId: string;
  }
) {
  const current = await loadUserWithState(admin, input.user.id);
  if (!current) throw new Error('Player not found.');
  const nextCurrent = await releaseExpiredReservation(admin, current);
  if (!nextCurrent.reservation || nextCurrent.reservation.matchId !== input.matchId) {
    return { player: nextCurrent.player, refunded: false };
  }

  const credit = await creditBalance(admin, {
    playerId: nextCurrent.user.id,
    amount: nextCurrent.reservation.bet,
    fallbackBalance: nextCurrent.player.tenks,
  });

  const nextPlayer: PlayerState = {
    ...nextCurrent.player,
    tenks: credit.newBalance,
  };

  try {
    await persistPlayerMetadata(admin, {
      user: nextCurrent.user,
      player: nextPlayer,
      reservation: null,
      outcome: nextCurrent.outcome?.matchId === input.matchId ? null : nextCurrent.outcome,
    });
  } catch (error) {
    await debitBalance(admin, {
      playerId: nextCurrent.user.id,
      amount: nextCurrent.reservation.bet,
      fallbackBalance: credit.newBalance,
    }).catch(() => undefined);
    throw error;
  }
  await appendTenksTransaction(admin, {
    playerId: nextCurrent.user.id,
    amount: nextCurrent.reservation.bet,
    reason: 'pvp_match_cancel_refund',
    balanceAfter: nextPlayer.tenks,
  });

  return { player: nextPlayer, refunded: true };
}

export async function reportPvpLoss(
  admin: SupabaseClient,
  input: {
    caller: User;
    matchId: string;
    winnerId: string;
  }
) {
  const loser = await loadUserWithState(admin, input.caller.id);
  if (!loser) throw new Error('Player not found.');
  const nextLoser = await releaseExpiredReservation(admin, loser);
  if (!nextLoser.reservation || nextLoser.reservation.matchId !== input.matchId) {
    throw new Error('No active reservation for this match.');
  }
  if (nextLoser.reservation.opponentId !== input.winnerId) {
    throw new Error('Winner mismatch.');
  }

  const winner = await loadUserWithState(admin, input.winnerId);
  if (!winner) throw new Error('Winner not found.');
  const nextWinner = await releaseExpiredReservation(admin, winner);
  if (!nextWinner.reservation || nextWinner.reservation.matchId !== input.matchId) {
    throw new Error('Winner reservation missing.');
  }
  if (nextWinner.reservation.opponentId !== nextLoser.user.id) {
    throw new Error('Opponent mismatch.');
  }

  const outcome: PvpOutcome = {
    matchId: input.matchId,
    winnerId: input.winnerId,
    loserId: nextLoser.user.id,
    reportedBy: nextLoser.user.id,
    createdAt: new Date().toISOString(),
  };

  await persistPlayerMetadata(admin, {
    user: nextLoser.user,
    player: nextLoser.player,
    reservation: nextLoser.reservation,
    outcome,
  });
  await persistPlayerMetadata(admin, {
    user: nextWinner.user,
    player: nextWinner.player,
    reservation: nextWinner.reservation,
    outcome,
  });

  return { outcome };
}

export async function settlePvpForfeit(
  admin: SupabaseClient,
  input: {
    caller: User;
    matchId: string;
    winnerId: string;
    loserId: string;
  }
) {
  const winner = await loadUserWithState(admin, input.winnerId);
  const loser = await loadUserWithState(admin, input.loserId);
  const caller = await loadUserWithState(admin, input.caller.id);
  if (!winner || !loser || !caller) throw new Error('Participant not found.');
  const nextWinner = await releaseExpiredReservation(admin, winner);
  const nextLoser = await releaseExpiredReservation(admin, loser);
  const nextCaller = await releaseExpiredReservation(admin, caller);
  if (nextCaller.user.id !== input.winnerId) {
    throw new Error('Only the winner can settle a forfeit.');
  }

  const winnerReservation = nextWinner.reservation;
  const loserReservation = nextLoser.reservation;
  if (!winnerReservation || !loserReservation) {
    if (winnerReservation && winnerReservation.matchId === input.matchId) {
      await persistPlayerMetadata(admin, {
        user: nextWinner.user,
        player: nextWinner.player,
        reservation: null,
        outcome: nextWinner.outcome?.matchId === input.matchId ? null : nextWinner.outcome,
      });
    }
    if (loserReservation && loserReservation.matchId === input.matchId) {
      await persistPlayerMetadata(admin, {
        user: nextLoser.user,
        player: nextLoser.player,
        reservation: null,
        outcome: nextLoser.outcome?.matchId === input.matchId ? null : nextLoser.outcome,
      });
    }
    const callerNext = await loadUserWithState(admin, input.caller.id);
    return { player: callerNext?.player ?? nextCaller.player, settled: true, alreadySettled: true };
  }
  if (winnerReservation.matchId !== input.matchId || loserReservation.matchId !== input.matchId) {
    throw new Error('Reservation mismatch.');
  }
  if (winnerReservation.opponentId !== nextLoser.user.id || loserReservation.opponentId !== nextWinner.user.id) {
    throw new Error('Opponent mismatch.');
  }
  if (winnerReservation.bet !== loserReservation.bet) {
    throw new Error('Bet mismatch.');
  }

  const pot = winnerReservation.bet + loserReservation.bet;
  const credit = await creditBalance(admin, {
    playerId: nextWinner.user.id,
    amount: pot,
    fallbackBalance: nextWinner.player.tenks,
  });
  const winnerNext: PlayerState = {
    ...nextWinner.player,
    tenks: credit.newBalance,
  };

  try {
    await persistPlayerMetadata(admin, {
      user: nextWinner.user,
      player: winnerNext,
      reservation: null,
      outcome: null,
    });
  } catch (error) {
    await debitBalance(admin, {
      playerId: nextWinner.user.id,
      amount: pot,
      fallbackBalance: credit.newBalance,
    }).catch(() => undefined);
    throw error;
  }
  await appendTenksTransaction(admin, {
    playerId: nextWinner.user.id,
    amount: pot,
    reason: 'pvp_match_forfeit_win',
    balanceAfter: winnerNext.tenks,
  });

  await persistPlayerMetadata(admin, {
    user: nextLoser.user,
    player: nextLoser.player,
    reservation: null,
    outcome: null,
  });

  return { player: winnerNext, settled: true, alreadySettled: false, pot };
}

export async function settlePvpMatch(
  admin: SupabaseClient,
  input: {
    caller: User;
    matchId: string;
    winnerId: string;
    loserId: string;
  }
) {
  const winner = await loadUserWithState(admin, input.winnerId);
  const loser = await loadUserWithState(admin, input.loserId);
  const caller = await loadUserWithState(admin, input.caller.id);
  if (!winner || !loser || !caller) throw new Error('Participant not found.');
  const nextWinner = await releaseExpiredReservation(admin, winner);
  const nextLoser = await releaseExpiredReservation(admin, loser);
  const nextCaller = await releaseExpiredReservation(admin, caller);
  if (nextCaller.user.id !== input.winnerId) {
    throw new Error('Only the winner can settle the match.');
  }

  const winnerReservation = nextWinner.reservation;
  const loserReservation = nextLoser.reservation;
  const outcome = nextWinner.outcome ?? nextLoser.outcome;
  if (!winnerReservation || !loserReservation) {
    if (winnerReservation && winnerReservation.matchId === input.matchId) {
      await persistPlayerMetadata(admin, {
        user: nextWinner.user,
        player: nextWinner.player,
        reservation: null,
        outcome: nextWinner.outcome?.matchId === input.matchId ? null : nextWinner.outcome,
      });
    }
    if (loserReservation && loserReservation.matchId === input.matchId) {
      await persistPlayerMetadata(admin, {
        user: nextLoser.user,
        player: nextLoser.player,
        reservation: null,
        outcome: nextLoser.outcome?.matchId === input.matchId ? null : nextLoser.outcome,
      });
    }
    const callerNext = await loadUserWithState(admin, input.caller.id);
    return { player: callerNext?.player ?? nextCaller.player, settled: true, alreadySettled: true };
  }
  if (!outcome || outcome.matchId !== input.matchId) {
    throw new Error('Match result was not reported yet.');
  }
  if (
    outcome.winnerId !== input.winnerId ||
    outcome.loserId !== input.loserId ||
    outcome.reportedBy !== input.loserId
  ) {
    throw new Error('Match result mismatch.');
  }
  if (winnerReservation.matchId !== input.matchId || loserReservation.matchId !== input.matchId) {
    throw new Error('Reservation mismatch.');
  }
  if (winnerReservation.opponentId !== nextLoser.user.id || loserReservation.opponentId !== nextWinner.user.id) {
    throw new Error('Opponent mismatch.');
  }
  if (winnerReservation.bet !== loserReservation.bet) {
    throw new Error('Bet mismatch.');
  }

  const pot = winnerReservation.bet + loserReservation.bet;
  const credit = await creditBalance(admin, {
    playerId: nextWinner.user.id,
    amount: pot,
    fallbackBalance: nextWinner.player.tenks,
  });
  const winnerNext: PlayerState = {
    ...nextWinner.player,
    tenks: credit.newBalance,
  };

  try {
    await persistPlayerMetadata(admin, {
      user: nextWinner.user,
      player: winnerNext,
      reservation: null,
      outcome: null,
    });
  } catch (error) {
    await debitBalance(admin, {
      playerId: nextWinner.user.id,
      amount: pot,
      fallbackBalance: credit.newBalance,
    }).catch(() => undefined);
    throw error;
  }
  await appendTenksTransaction(admin, {
    playerId: nextWinner.user.id,
    amount: pot,
    reason: 'pvp_match_win',
    balanceAfter: winnerNext.tenks,
  });

  await persistPlayerMetadata(admin, {
    user: nextLoser.user,
    player: nextLoser.player,
    reservation: null,
    outcome: null,
  });

  const callerPlayer = nextCaller.user.id === nextWinner.user.id ? winnerNext : nextLoser.player;
  return { player: callerPlayer, settled: true, alreadySettled: false, pot };
}
