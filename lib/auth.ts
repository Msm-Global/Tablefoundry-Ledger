// Credentials live only in environment variables (salted PBKDF2 hashes), never in the repo.
//   AUTH_USERS  = "email|saltHex|hashHex;email|saltHex|hashHex"
//   AUTH_SECRET = long random string used to sign session cookies
const enc = new TextEncoder();
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
const unhex = (s: string) => new Uint8Array((s.match(/../g) || []).map(h => parseInt(h, 16)));

export const COOKIE = 'tf_session';
export const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
const ITERATIONS = 100_000;

export async function hashPassword(password: string, saltHex: string) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: unhex(saltHex), iterations: ITERATIONS }, key, 256);
  return hex(bits);
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

function users() {
  return (process.env.AUTH_USERS || '').split(';').map(s => s.trim()).filter(Boolean).map(s => {
    const [email, salt, hash] = s.split('|');
    return { email: (email || '').toLowerCase(), salt, hash };
  });
}

export const authConfigured = () => !!process.env.AUTH_SECRET && users().length > 0;

export async function verifyLogin(email: string, password: string) {
  const u = users().find(x => x.email === email.trim().toLowerCase());
  // Always run the hash so response time does not reveal whether the email exists.
  const got = await hashPassword(password, u?.salt || '00'.repeat(16));
  return !!u && safeEqual(got, u.hash);
}

async function hmac(data: string) {
  const key = await crypto.subtle.importKey('raw', enc.encode(process.env.AUTH_SECRET || ''), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, enc.encode(data)));
}

export async function createSession(email: string) {
  const body = `${encodeURIComponent(email.toLowerCase())}~${Date.now() + SESSION_MS}`;
  return `${body}~${await hmac(body)}`;
}

export async function verifySession(token: string | undefined) {
  if (!token || !process.env.AUTH_SECRET) return null;
  const [email, exp, sig] = token.split('~');
  if (!email || !exp || !sig) return null;
  if (!safeEqual(sig, await hmac(`${email}~${exp}`))) return null;
  if (Date.now() > +exp) return null;
  return decodeURIComponent(email);
}

/** Only allow same-site relative redirects after login. */
export function safeNext(n: string | null | undefined) {
  return n && n.startsWith('/') && !n.startsWith('//') && !n.startsWith('/\\') ? n : '/';
}
