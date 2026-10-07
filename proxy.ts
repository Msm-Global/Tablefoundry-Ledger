import { NextRequest, NextResponse } from 'next/server';
import { COOKIE, verifySession } from '@/lib/auth';

export async function proxy(req: NextRequest) {
  const user = await verifySession(req.cookies.get(COOKIE)?.value);
  if (user) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.search = '';
  url.searchParams.set('next', req.nextUrl.pathname + req.nextUrl.search);
  return NextResponse.redirect(url);
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|login|api/login).*)'] };
