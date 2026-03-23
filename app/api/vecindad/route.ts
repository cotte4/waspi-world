import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient, getAuthenticatedUser, hasServiceRole, isServerSupabaseConfigured } from '@/src/lib/supabaseServer';
import { grantInventoryItem, normalizePlayerState, syncVecindadDeed, VECINDAD_DEED_ITEM_ID, type PlayerState } from '@/src/lib/playerState';
import { ensurePlayerRow } from '@/src/lib/commercePersistence';
import {
  clearFarmPlant,
  createVecindadParcel,
  deleteVecindadParcel,
  getFarmPlantBySlot,
  getParcelOccupant,
  getUserVecindadParcel,
  hasPlayerUnlock,
  listVecindadParcels,
  loadPlayerUsername,
  mergePlayerWithVecindad,
  persistPlayerMetadata,
  unlockPlayerFeature,
  updateVecindadParcelBuildStage,
  upsertFarmPlant,
} from '@/src/lib/vecindadPersistence';
import { getNextVecindadBuildCost, getNextVecindadBuildStage, getParcelById, MAX_VECINDAD_STAGE, normalizeVecindadBuildStage } from '@/src/lib/vecindad';

const PLAYER_METADATA_KEY = 'waspiPlayer';
const CANNABIS_FARM_UNLOCK_KEY = 'cannabis_farm';
const FARM_UNLOCK_COST = 11000;
const FARM_SLOT_COUNT = 6;
const FARM_SEED_CONFIG = {
  basica: { cost: 200, growthMs: 30 * 60 * 1000, rewardBase: 280 },
  indica: { cost: 350, growthMs: 60 * 60 * 1000, rewardBase: 480 },
  sativa: { cost: 500, growthMs: 2 * 60 * 60 * 1000, rewardBase: 800 },
  purple_haze: { cost: 800, growthMs: 3 * 60 * 60 * 1000, rewardBase: 1440 },
  og_kush: { cost: 1200, growthMs: 5 * 60 * 60 * 1000, rewardBase: 2400 },
} as const;
type FarmSeedType = keyof typeof FARM_SEED_CONFIG;
type FarmPlantState = NonNullable<PlayerState['vecindad']['farmPlants']>[number];

type VecindadAction =
  | { action: 'buy'; parcelId: string }
  | { action: 'build' }
  | { action: 'farm_unlock' }
  | { action: 'farm_plant'; slotIndex: number; seedType: FarmSeedType }
  | { action: 'farm_water'; slotIndex: number }
  | { action: 'farm_harvest'; slotIndex: number };

function isFarmSeedType(value: unknown): value is FarmSeedType {
  return typeof value === 'string' && value in FARM_SEED_CONFIG;
}

function getPlantStage(plant: FarmPlantState) {
  const cfg = FARM_SEED_CONFIG[plant.seedType];
  const elapsed = Date.now() - plant.plantedAt;
  const ratio = elapsed / cfg.growthMs;
  const effectiveRatio = plant.waterCount >= 1 ? ratio : ratio * 0.5;
  if (effectiveRatio < 0.25) return 'sprout';
  if (effectiveRatio < 0.5) return 'seedling';
  if (effectiveRatio < 1) return 'growing';
  return 'flowering';
}

export async function GET(request: NextRequest) {
  if (!isServerSupabaseConfigured || !hasServiceRole) {
    return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 });
  }

  const admin = createSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'Admin client unavailable.' }, { status: 500 });
  }

  const authHeader = request.headers.get('authorization');
  const user = authHeader ? await getAuthenticatedUser(authHeader) : null;

  try {
    const parcels = await listVecindadParcels(admin);
    let player: PlayerState | null = null;

    if (user) {
      const basePlayer = normalizePlayerState(user.user_metadata?.[PLAYER_METADATA_KEY]);
      player = await mergePlayerWithVecindad(admin, user.id, basePlayer);
    }

    return NextResponse.json({ parcels, player });
  } catch (error) {
    // Return empty parcels gracefully — missing migrations shouldn't hard-crash the scene
    const message = error instanceof Error ? error.message : 'Vecindad load failed.';
    console.error('[api/vecindad] GET error:', message);
    return NextResponse.json({ parcels: [], player: null });
  }
}

export async function POST(request: NextRequest) {
  if (!isServerSupabaseConfigured || !hasServiceRole) {
    return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 });
  }

  const user = await getAuthenticatedUser(request.headers.get('authorization'));
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'Admin client unavailable.' }, { status: 500 });
  }

  const body = await request.json().catch(() => null) as VecindadAction | null;
  if (!body?.action) {
    return NextResponse.json({ error: 'Invalid vecindad action.' }, { status: 400 });
  }

  let player = normalizePlayerState(user.user_metadata?.[PLAYER_METADATA_KEY]);

  try {
    await ensurePlayerRow(admin, user, player);
    player = await mergePlayerWithVecindad(admin, user.id, player);

    if (body.action === 'buy') {
      const parcel = getParcelById(body.parcelId);
      if (!parcel) {
        return NextResponse.json({ error: 'Parcela invalida.' }, { status: 400 });
      }

      const myParcel = await getUserVecindadParcel(admin, user.id);
      if (myParcel?.parcelId === parcel.id) {
        const parcels = await listVecindadParcels(admin);
        return NextResponse.json({
          player: await mergePlayerWithVecindad(admin, user.id, player),
          parcels,
          notice: `La parcela ${parcel.id} ya es tuya.`,
        });
      }
      if (myParcel && myParcel.parcelId !== parcel.id) {
        return NextResponse.json({ error: 'Ya tenes una parcela en La Vecindad.' }, { status: 409 });
      }

      const occupied = await getParcelOccupant(admin, parcel.id);
      if (occupied && occupied.ownerId !== user.id) {
        return NextResponse.json({ error: `La parcela ${parcel.id} ya tiene duenio.` }, { status: 409 });
      }

      if (player.tenks < parcel.cost) {
        return NextResponse.json({ error: `Necesitas ${parcel.cost} TENKS para comprar esta parcela.` }, { status: 400 });
      }

      const nextBuildStage = normalizeVecindadBuildStage(myParcel?.buildStage ?? player.vecindad.buildStage ?? 0);
      player = syncVecindadDeed({
        ...player,
        tenks: Math.max(0, player.tenks - parcel.cost),
        vecindad: {
          ...player.vecindad,
          ownedParcelId: parcel.id,
          buildStage: nextBuildStage,
        },
      });

      if (!player.inventory.owned.includes(VECINDAD_DEED_ITEM_ID)) {
        player = grantInventoryItem(player, VECINDAD_DEED_ITEM_ID);
      }

      if (!myParcel) {
        const username = await loadPlayerUsername(admin, user.id) ?? `player_${user.id.slice(0, 8)}`;
        await createVecindadParcel(admin, {
          userId: user.id,
          username,
          parcelId: parcel.id,
          buildStage: nextBuildStage,
        });
      }

      try {
        await persistPlayerMetadata(admin, user, player);
        await ensurePlayerRow(admin, user, player, { syncTenksBalance: true });
      } catch (error) {
        if (!myParcel) {
          await deleteVecindadParcel(admin, parcel.id).catch(() => undefined);
        }
        throw error;
      }

        const parcels = await listVecindadParcels(admin);
        return NextResponse.json({
          player: await mergePlayerWithVecindad(admin, user.id, player),
          parcels,
          notice: `Compraste la parcela ${parcel.id}. La escritura ya esta en tu inventario. Ahora junta materiales y empeza a construir.`,
        });
      }

    const myParcel = await getUserVecindadParcel(admin, user.id);
    if (!myParcel) {
      return NextResponse.json({ error: 'Primero necesitas comprar una parcela.' }, { status: 400 });
    }

    if (body.action === 'build') {
      const currentStage = normalizeVecindadBuildStage(myParcel.buildStage);
      if (currentStage >= MAX_VECINDAD_STAGE) {
        return NextResponse.json({ error: 'Tu casa ya esta al maximo.' }, { status: 400 });
      }

      const materialCost = getNextVecindadBuildCost(currentStage);
      if (player.vecindad.materials < materialCost) {
        return NextResponse.json({ error: `Necesitas ${materialCost} materiales para seguir construyendo.` }, { status: 400 });
      }

      const nextStage = getNextVecindadBuildStage(currentStage);
      player = {
        ...player,
        vecindad: {
          ...player.vecindad,
          ownedParcelId: myParcel.parcelId,
          buildStage: nextStage,
          materials: player.vecindad.materials - materialCost,
        },
      };

      await updateVecindadParcelBuildStage(admin, {
        userId: user.id,
        parcelId: myParcel.parcelId,
        buildStage: nextStage,
      });
      try {
        await persistPlayerMetadata(admin, user, player);
        await ensurePlayerRow(admin, user, player);
      } catch (error) {
        await updateVecindadParcelBuildStage(admin, {
          userId: user.id,
          parcelId: myParcel.parcelId,
          buildStage: currentStage,
        }).catch(() => undefined);
        throw error;
      }

      const parcels = await listVecindadParcels(admin);
      return NextResponse.json({
        player: await mergePlayerWithVecindad(admin, user.id, player),
        parcels,
        notice: nextStage === 1
          ? 'Levantaste la primera estructura de tu casa.'
          : `Casa mejorada a STAGE ${nextStage}.`,
      });
    }

    if (body.action === 'farm_unlock') {
      const hasUnlock = await hasPlayerUnlock(admin, user.id, CANNABIS_FARM_UNLOCK_KEY);
      if (hasUnlock) {
        const parcels = await listVecindadParcels(admin);
        return NextResponse.json({
          player: await mergePlayerWithVecindad(admin, user.id, player),
          parcels,
          notice: 'Cannabis Farm ya estaba desbloqueado.',
        });
      }
      if (player.tenks < FARM_UNLOCK_COST) {
        return NextResponse.json({ error: `Necesitas ${FARM_UNLOCK_COST} TENKS.` }, { status: 400 });
      }
      player = {
        ...player,
        tenks: player.tenks - FARM_UNLOCK_COST,
      };
      await unlockPlayerFeature(admin, user.id, CANNABIS_FARM_UNLOCK_KEY);
      await persistPlayerMetadata(admin, user, player);
      await ensurePlayerRow(admin, user, player, { syncTenksBalance: true });
      const parcels = await listVecindadParcels(admin);
      return NextResponse.json({
        player: await mergePlayerWithVecindad(admin, user.id, player),
        parcels,
        notice: 'Cannabis Farm desbloqueado.',
      });
    }

    const unlocked = await hasPlayerUnlock(admin, user.id, CANNABIS_FARM_UNLOCK_KEY);
    if (!unlocked) {
      return NextResponse.json({ error: 'Desbloquea Cannabis Farm primero.' }, { status: 400 });
    }

    if (body.action === 'farm_plant') {
      const slotIndex = Math.floor(body.slotIndex);
      if (!Number.isFinite(slotIndex) || slotIndex < 0 || slotIndex >= FARM_SLOT_COUNT) {
        return NextResponse.json({ error: 'Slot invalido.' }, { status: 400 });
      }
      if (!isFarmSeedType(body.seedType)) {
        return NextResponse.json({ error: 'Semilla invalida.' }, { status: 400 });
      }
      const existing = await getFarmPlantBySlot(admin, user.id, slotIndex);
      if (existing) {
        return NextResponse.json({ error: 'Ese slot ya esta ocupado.' }, { status: 409 });
      }
      const cfg = FARM_SEED_CONFIG[body.seedType];
      if (player.tenks < cfg.cost) {
        return NextResponse.json({ error: `Necesitas ${cfg.cost} TENKS para esa semilla.` }, { status: 400 });
      }
      player = {
        ...player,
        tenks: player.tenks - cfg.cost,
      };
      await upsertFarmPlant(admin, {
        userId: user.id,
        slotIndex,
        seedType: body.seedType,
        waterCount: 0,
      });
      await persistPlayerMetadata(admin, user, player);
      await ensurePlayerRow(admin, user, player, { syncTenksBalance: true });
      const parcels = await listVecindadParcels(admin);
      return NextResponse.json({
        player: await mergePlayerWithVecindad(admin, user.id, player),
        parcels,
        notice: `Plantaste ${body.seedType.toUpperCase()}.`,
      });
    }

    if (body.action === 'farm_water') {
      const slotIndex = Math.floor(body.slotIndex);
      if (!Number.isFinite(slotIndex) || slotIndex < 0 || slotIndex >= FARM_SLOT_COUNT) {
        return NextResponse.json({ error: 'Slot invalido.' }, { status: 400 });
      }
      const plant = await getFarmPlantBySlot(admin, user.id, slotIndex);
      if (!plant) {
        return NextResponse.json({ error: 'No hay planta en ese slot.' }, { status: 404 });
      }
      await upsertFarmPlant(admin, {
        userId: user.id,
        slotIndex,
        seedType: plant.seedType,
        plantedAt: new Date(plant.plantedAt),
        wateredAt: new Date(),
        waterCount: Math.min(2, plant.waterCount + 1),
      });
      const parcels = await listVecindadParcels(admin);
      return NextResponse.json({
        player: await mergePlayerWithVecindad(admin, user.id, player),
        parcels,
        notice: 'Planta regada.',
      });
    }

    if (body.action === 'farm_harvest') {
      const slotIndex = Math.floor(body.slotIndex);
      if (!Number.isFinite(slotIndex) || slotIndex < 0 || slotIndex >= FARM_SLOT_COUNT) {
        return NextResponse.json({ error: 'Slot invalido.' }, { status: 400 });
      }
      const plant = await getFarmPlantBySlot(admin, user.id, slotIndex);
      if (!plant) {
        return NextResponse.json({ error: 'No hay planta para cosechar.' }, { status: 404 });
      }
      if (getPlantStage(plant) !== 'flowering') {
        return NextResponse.json({ error: 'La planta aun no esta lista.' }, { status: 400 });
      }
      const cfg = FARM_SEED_CONFIG[plant.seedType];
      const qualityBonus = plant.waterCount >= 1 ? 0.2 : 0;
      const variance = 0.9 + Math.random() * 0.2;
      const reward = Math.max(1, Math.floor(cfg.rewardBase * (1 + qualityBonus) * variance));
      player = {
        ...player,
        tenks: player.tenks + reward,
      };
      await clearFarmPlant(admin, user.id, slotIndex);
      await persistPlayerMetadata(admin, user, player);
      await ensurePlayerRow(admin, user, player, { syncTenksBalance: true });
      const parcels = await listVecindadParcels(admin);
      return NextResponse.json({
        player: await mergePlayerWithVecindad(admin, user.id, player),
        parcels,
        notice: `Cosecha +${reward} TENKS`,
        reward,
      });
    }

    return NextResponse.json({ error: 'Accion no soportada.' }, { status: 400 });
  } catch (error) {
    const errorCode = typeof error === 'object' && error && 'code' in error
      ? String((error as { code?: string }).code)
      : '';
    if (body.action === 'buy' && errorCode === '23505') {
      return NextResponse.json({ error: 'Esa parcela acaba de ser comprada por otro jugador.' }, { status: 409 });
    }
    const message = error instanceof Error
      ? error.message
      : typeof error === 'object' && error !== null && 'message' in error
        ? String((error as { message?: string }).message)
        : 'Vecindad update failed.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
