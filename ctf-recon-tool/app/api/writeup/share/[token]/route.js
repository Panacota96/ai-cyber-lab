import { NextResponse } from 'next/server';
import { apiError } from '@/lib/api-error';
import { getWriteupShareByToken } from '@/lib/db';

export async function GET(_request, { params }) {
  const { token } = await params;
  const share = getWriteupShareByToken(token);
  if (!share) return apiError('Share not found', 404);
  return NextResponse.json({ share });
}
