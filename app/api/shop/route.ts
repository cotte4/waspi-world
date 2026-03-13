import { NextResponse } from 'next/server';
import { TENKS_PACKS } from '@/src/lib/tenksPacks';
import { getSerializedCatalog, getSerializedPhysicalCatalog } from '@/src/lib/catalogServer';

export async function GET() {
  return NextResponse.json({
    items: getSerializedCatalog(),
    physicalItems: getSerializedPhysicalCatalog(),
    tenksPacks: TENKS_PACKS,
  });
}
