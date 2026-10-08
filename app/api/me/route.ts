import { NextRequest, NextResponse } from 'next/server';
import { COOKIE, verifySession } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const email = await verifySession(req.cookies.get(COOKIE)?.value);
  return NextResponse.json({ email });
}
