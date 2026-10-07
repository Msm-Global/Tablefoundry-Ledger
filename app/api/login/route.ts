import { NextRequest, NextResponse } from 'next/server';
import { COOKIE, SESSION_MS, authConfigured, createSession, verifyLogin } from '@/lib/auth';

export async function POST(req: NextRequest) {
  if (!authConfigured()) return NextResponse.json({ error: 'Login is not configured on the server.' }, { status: 500 });
  let body: { email?: string; password?: string } = {};
  try { body = await req.json(); } catch {}
  const email = String(body.email || ''), password = String(body.password || '');
  if (!(await verifyLogin(email, password))) {
    await new Promise(r => setTimeout(r, 700)); // slow down guessing
    return NextResponse.json({ error: 'Incorrect email or password.' }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, await createSession(email), {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: SESSION_MS / 1000,
  });
  return res;
}
