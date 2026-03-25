import { DEFAULT_PLAYER_STATE, normalizePlayerState, type PlayerState } from './playerState';

type PersistedPlayerRow = {
  avatar_config?: unknown;
  equipped_top?: string | null;
  equipped_bottom?: string | null;
  utility_equipped?: unknown;
  muted_players?: unknown;
};

type PersistedPlayerStatsRow = {
  zombie_kills?: number;
  xp?: number;
};

type AssembleHydratedPlayerInput = {
  playerRow?: PersistedPlayerRow | null;
  statsRow?: PersistedPlayerStatsRow | null;
  owned?: string[];
  tenks?: number;
};

export function assembleHydratedPlayer(
  basePlayer: PlayerState | undefined,
  input: AssembleHydratedPlayerInput
): PlayerState {
  const normalizedBase = normalizePlayerState(basePlayer ?? DEFAULT_PLAYER_STATE);
  const utilityEquipped = Array.isArray(input.playerRow?.utility_equipped)
    ? input.playerRow.utility_equipped.filter((value): value is string => typeof value === 'string')
    : normalizedBase.inventory.equipped.utility;
  const mutedPlayers = Array.isArray(input.playerRow?.muted_players)
    ? input.playerRow.muted_players.filter((value): value is string => typeof value === 'string')
    : normalizedBase.mutedPlayers;

  return normalizePlayerState({
    ...normalizedBase,
    tenks: typeof input.tenks === 'number' ? input.tenks : normalizedBase.tenks,
    inventory: {
      owned: input.owned ?? normalizedBase.inventory.owned,
      equipped: {
        top: input.playerRow?.equipped_top ?? normalizedBase.inventory.equipped.top,
        bottom: input.playerRow?.equipped_bottom ?? normalizedBase.inventory.equipped.bottom,
        utility: utilityEquipped,
      },
    },
    avatar: input.playerRow?.avatar_config && typeof input.playerRow.avatar_config === 'object'
      ? input.playerRow.avatar_config
      : normalizedBase.avatar,
    mutedPlayers,
    progression: {
      kills: input.statsRow?.zombie_kills ?? normalizedBase.progression?.kills ?? 0,
      xp: input.statsRow?.xp ?? normalizedBase.progression?.xp ?? 0,
    },
  });
}

export function applyEditablePlayerPatch(
  currentPlayer: PlayerState,
  requestedPlayer?: Partial<PlayerState> | null
): PlayerState {
  return normalizePlayerState({
    ...currentPlayer,
    avatar: {
      ...currentPlayer.avatar,
      ...(requestedPlayer?.avatar ?? {}),
    },
    mutedPlayers: Array.isArray(requestedPlayer?.mutedPlayers)
      ? requestedPlayer.mutedPlayers
      : currentPlayer.mutedPlayers,
    inventory: {
      ...currentPlayer.inventory,
      equipped: {
        ...currentPlayer.inventory.equipped,
        ...(requestedPlayer?.inventory?.equipped ?? {}),
      },
      owned: currentPlayer.inventory.owned,
    },
    tenks: currentPlayer.tenks,
    progression: {
      kills: currentPlayer.progression?.kills ?? 0,
      xp: currentPlayer.progression?.xp ?? 0,
    },
    vecindad: currentPlayer.vecindad,
  });
}
