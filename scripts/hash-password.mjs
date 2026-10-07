// Usage: node scripts/hash-password.mjs email password
// Prints one AUTH_USERS entry. Join several entries with ";" in the AUTH_USERS env var.
import { pbkdf2Sync, randomBytes } from 'node:crypto';
const [email, password] = process.argv.slice(2);
if (!email || !password) { console.error('Usage: node scripts/hash-password.mjs email password'); process.exit(1); }
const salt = randomBytes(16).toString('hex');
const hash = pbkdf2Sync(password, Buffer.from(salt, 'hex'), 100000, 32, 'sha256').toString('hex');
console.log(`${email.toLowerCase()}|${salt}|${hash}`);
