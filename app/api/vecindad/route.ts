import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient, getAuthenticatedUser, hasServiceRole, isServerSupabaseConfigured } from '@/src/lib/supabaseServer';
import { grantInventoryItem, normalizePlayerState, syncVecindadDeed, VECINDAD_DEED_ITEM_ID, type PlayerState } from '@/src/lib/playerState';
import { ensurePlayerRow } from '@/src/lib/commercePersistence';
import { createVecindadParcel, deleteVecindadParcel, getParcelOccupant, getUserVecindadParcel, listVecindadParcels, loadPlayerUsername, mergePlayerWithVecindad, persistPlayerMetadata, updateVecindadParcelBuildStage } from '@/src/lib/vecindadPersistence';
import { getNextVecindadBuildCost, getNextVecindadBuildStage, getParcelById, MAX_VECINDAD_STAGE, normalizeVecindadBuildStage } from '@/src/lib/vecindad';

const PLAYER_METADATA_KEY = 'waspiPlayer';

type VecindadAction =
  | { action: 'buy'; parcelId: string }
  | { action: 'build' };

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
    const message = error instanceof Error ? error.message : 'Vecindad load failed.';
    return NextResponse.json({ error: message }, { status: 500 });
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
        await ensurePlayerRow(admin, user, player);
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
  } catch (error) {
    const errorCode = typeof error === 'object' && error && 'code' in error
      ? String((error as { code?: string }).code)
      : '';
    if (body.action === 'buy' && errorCode === '23505') {
      return NextResponse.json({ error: 'Esa parcela acaba de ser comprada por otro jugador.' }, { status: 409 });
    }
    const message = error instanceof Error ? error.message : 'Vecindad update failed.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
