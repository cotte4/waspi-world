import { NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import path from 'path';

export async function GET() {
  try {
    const filePath = path.join(process.cwd(), 'public', 'patch-notes.json');
    const content = readFileSync(filePath, 'utf-8');
    return NextResponse.json(JSON.parse(content), {
      headers: { 'Cache-Control': 'public, max-age=300' },
    });
  } catch {
    return NextResponse.json([]);
  }
}
