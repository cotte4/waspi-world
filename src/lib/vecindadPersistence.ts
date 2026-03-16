import type { SupabaseClient, User } from '@supabase/supabase-js';
import { syncVecindadDeed, type PlayerState } from '@/src/lib/playerState';
import { normalizeVecindadBuildStage, type SharedParcelState } from '@/src/lib/vecindad';

type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

type VecindadParcelRow = {
  parcel_id: string;
  owner_id: string;
  owner_username: string;
  build_stage: number;
};

type PlayerUnlockRow = {
  user_id: string;
  unlock_key: string;
  unlocked_at: string;
};

type FarmPlantRow = {
  user_id: string;
  slot_index: number;
  seed_type: string;
  planted_at: string;
  watered_at: string | null;
  water_count: number;
  harvested: boolean;
};

const PLAYER_METADATA_KEY = 'waspiPlayer';
const CANNABIS_FARM_UNLOCK_KEY = 'cannabis_farm';

export async function listVecindadParcels(admin: SupabaseClient): Promise<SharedParcelState[]> {
  const { data, error } = await admin
    .from('vecindad_parcels')
    .select('parcel_id, owner_id, owner_username, build_stage')
    .order('parcel_id', { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    parcelId: row.parcel_id,
    ownerId: row.owner_id,
    ownerUsername: row.owner_username,
    buildStage: normalizeVecindadBuildStage(row.build_stage),
  }));
}

export async function getUserVecindadParcel(admin: SupabaseClient, userId: string) {
  const { data, error } = await admin
    .from('vecindad_parcels')
    .select('parcel_id, owner_id, owner_username, build_stage')
    .eq('owner_id', userId)
    .maybeSingle<VecindadParcelRow>();

  if (error) throw error;
  if (!data) return null;

  return {
    parcelId: data.parcel_id,
    ownerId: data.owner_id,
    ownerUsername: data.owner_username,
    buildStage: normalizeVecindadBuildStage(data.build_stage),
  };
}

export async function getParcelOccupant(admin: SupabaseClient, parcelId: string) {
  const { data, error } = await admin
    .from('vecindad_parcels')
    .select('parcel_id, owner_id, owner_username, build_stage')
    .eq('parcel_id', parcelId)
    .maybeSingle<VecindadParcelRow>();

  if (error) throw error;
  if (!data) return null;

  return {
    parcelId: data.parcel_id,
    ownerId: data.owner_id,
    ownerUsername: data.owner_username,
    buildStage: normalizeVecindadBuildStage(data.build_stage),
  };
}

export async function createVecindadParcel(
  admin: SupabaseClient,
  input: {
    userId: string;
    username: string;
    parcelId: string;
    buildStage: number;
  }
) {
  const { error } = await admin
    .from('vecindad_parcels')
    .insert({
      parcel_id: input.parcelId,
      owner_id: input.userId,
      owner_username: input.username,
      build_stage: input.buildStage,
    });

  if (error) throw error;
}

export async function deleteVecindadParcel(admin: SupabaseClient, parcelId: string) {
  const { error } = await admin
    .from('vecindad_parcels')
    .delete()
    .eq('parcel_id', parcelId);

  if (error) throw error;
}

export async function updateVecindadParcelBuildStage(
  admin: SupabaseClient,
  input: {
    userId: string;
    parcelId: string;
    buildStage: number;
  }
) {
  const { error } = await admin
    .from('vecindad_parcels')
    .update({
      build_stage: input.buildStage,
      updated_at: new Date().toISOString(),
    })
    .eq('owner_id', input.userId)
    .eq('parcel_id', input.parcelId);

  if (error) throw error;
}

export async function loadPlayerUsername(admin: SupabaseClient, userId: string) {
  const { data, error } = await admin
    .from('players')
    .select('username')
    .eq('id', userId)
    .maybeSingle<{ username: string }>();

  if (error) throw error;
  return data?.username ?? null;
}

export async function mergePlayerWithVecindad(admin: SupabaseClient, userId: string, player: PlayerState): Promise<PlayerState> {
  const parcel = await getUserVecindadParcel(admin, userId);
  const farmUnlocked = await hasPlayerUnlock(admin, userId, CANNABIS_FARM_UNLOCK_KEY);
  const farmPlants = await listFarmPlants(admin, userId);
  if (!parcel) {
    return syncVecindadDeed({
      ...player,
      vecindad: {
        ...player.vecindad,
        ownedParcelId: undefined,
        buildStage: 0,
        cannabisFarmUnlocked: false,
        farmPlants: [],
      },
    });
  }

  return syncVecindadDeed({
    ...player,
    vecindad: {
      ...player.vecindad,
      ownedParcelId: parcel.parcelId,
      buildStage: parcel.buildStage,
      cannabisFarmUnlocked: farmUnlocked,
      farmPlants,
    },
  });
}

export async function hasPlayerUnlock(admin: SupabaseClient, userId: string, unlockKey: string) {
  const { data, error } = await admin
    .from('player_unlocks')
    .select('user_id, unlock_key, unlocked_at')
    .eq('user_id', userId)
    .eq('unlock_key', unlockKey)
    .maybeSingle<PlayerUnlockRow>();
  if (error) throw error;
  return Boolean(data);
}

export async function unlockPlayerFeature(admin: SupabaseClient, userId: string, unlockKey: string) {
  const { error } = await admin
    .from('player_unlocks')
    .upsert(
      {
        user_id: userId,
        unlock_key: unlockKey,
      },
      { onConflict: 'user_id,unlock_key', ignoreDuplicates: true }
    );
  if (error) throw error;
}

export async function listFarmPlants(admin: SupabaseClient, userId: string): Promise<NonNullable<PlayerState['vecindad']['farmPlants']>> {
  const { data, error } = await admin
    .from('farm_plants')
    .select('user_id, slot_index, seed_type, planted_at, watered_at, water_count, harvested')
    .eq('user_id', userId)
    .eq('harvested', false)
    .order('slot_index', { ascending: true });
  if (error) throw error;
  return (data as FarmPlantRow[] | null ?? []).map((row) => ({
    slotIndex: row.slot_index,
    seedType: row.seed_type as NonNullable<PlayerState['vecindad']['farmPlants']>[number]['seedType'],
    plantedAt: new Date(row.planted_at).getTime(),
    wateredAt: row.watered_at ? new Date(row.watered_at).getTime() : undefined,
    waterCount: row.water_count,
  }));
}

export async function getFarmPlantBySlot(admin: SupabaseClient, userId: string, slotIndex: number) {
  const { data, error } = await admin
    .from('farm_plants')
    .select('user_id, slot_index, seed_type, planted_at, watered_at, water_count, harvested')
    .eq('user_id', userId)
    .eq('slot_index', slotIndex)
    .eq('harvested', false)
    .maybeSingle<FarmPlantRow>();
  if (error) throw error;
  if (!data) return null;
  return {
    slotIndex: data.slot_index,
    seedType: data.seed_type as NonNullable<PlayerState['vecindad']['farmPlants']>[number]['seedType'],
    plantedAt: new Date(data.planted_at).getTime(),
    wateredAt: data.watered_at ? new Date(data.watered_at).getTime() : undefined,
    waterCount: data.water_count,
  };
}

export async function upsertFarmPlant(
  admin: SupabaseClient,
  input: {
    userId: string;
    slotIndex: number;
    seedType: NonNullable<PlayerState['vecindad']['farmPlants']>[number]['seedType'];
    plantedAt?: Date;
    wateredAt?: Date;
    waterCount: number;
  }
) {
  const { error } = await admin
    .from('farm_plants')
    .upsert(
      {
        user_id: input.userId,
        slot_index: input.slotIndex,
        seed_type: input.seedType,
        planted_at: (input.plantedAt ?? new Date()).toISOString(),
        watered_at: input.wateredAt?.toISOString() ?? null,
        water_count: input.waterCount,
        harvested: false,
      },
      { onConflict: 'user_id,slot_index' }
    );
  if (error) throw error;
}

export async function clearFarmPlant(admin: SupabaseClient, userId: string, slotIndex: number) {
  const { error } = await admin
    .from('farm_plants')
    .delete()
    .eq('user_id', userId)
    .eq('slot_index', slotIndex);
  if (error) throw error;
}

export async function persistPlayerMetadata(admin: SupabaseClient, user: User, player: PlayerState) {
  const { error } = await admin.auth.admin.updateUserById(user.id, {
    user_metadata: {
      ...(user.user_metadata ?? {}),
      [PLAYER_METADATA_KEY]: player as unknown as Json,
    },
  });

  if (error) throw error;
}
