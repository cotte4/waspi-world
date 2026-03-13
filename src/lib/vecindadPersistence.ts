import type { SupabaseClient, User } from '@supabase/supabase-js';
import type { PlayerState } from '@/src/lib/playerState';
import type { SharedParcelState } from '@/src/lib/vecindad';

type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

type VecindadParcelRow = {
  parcel_id: string;
  owner_id: string;
  owner_username: string;
  build_stage: number;
};

const PLAYER_METADATA_KEY = 'waspiPlayer';

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
    buildStage: row.build_stage,
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
    buildStage: data.build_stage,
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
    buildStage: data.build_stage,
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
  if (!parcel) {
    return {
      ...player,
      vecindad: {
        ...player.vecindad,
        ownedParcelId: undefined,
        buildStage: 0,
      },
    };
  }

  return {
    ...player,
    vecindad: {
      ...player.vecindad,
      ownedParcelId: parcel.parcelId,
      buildStage: parcel.buildStage,
    },
  };
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
