import type { Order, Provider, TaskInfo } from './calc';

const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const rng = (seed: number) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

const PICKUP = ['12, 80 Feet Road, Indiranagar, Bengaluru 560038', '45, 5th Block, Koramangala, Bengaluru 560095', '7, MG Road, Ashok Nagar, Bengaluru 560001', '221, 27th Main, HSR Layout, Bengaluru 560102', '9, Brigade Road, Shanthala Nagar, Bengaluru 560025'];
const DROP = ['Flat 304, Prestige Shantiniketan, Whitefield, Bengaluru 560048', '18, 4th Cross, JP Nagar 2nd Phase, Bengaluru 560078', 'B-12, Sobha Dream Acres, Panathur, Bengaluru 560103', '56, Church Street Residency, MG Road, Bengaluru 560001', 'No. 23, 1st Main, BTM Layout 2nd Stage, Bengaluru 560076'];
const CUSTOMERS = ['Rohan Mehta', 'Priya Nair', 'Arjun Reddy', 'Sneha Iyer', 'Karan Malhotra', 'Divya Menon', 'Imran Sheikh', 'Ananya Das'];
const RIDERS = ['Suresh Kumar', 'Manjunath R', 'Mohammed Faisal', 'Venkatesh B', 'Ramesh Gowda', 'Dinesh Naik'];

const phone = (r: () => number) => `9${Math.floor(100000000 + r() * 899999999)}`;
const pick = <T,>(a: T[], r: () => number) => a[Math.floor(r() * a.length)];
export const newTaskId = (p: Provider, r: () => number = Math.random) => `${p === 'UENGAGE' ? 'UEN' : 'PRO'}-T${Math.floor(10000000 + r() * 89999999)}`;

/** Demo task details; seeded so the same order always gets the same values. */
export function genTask(p: Provider, seed?: string): TaskInfo {
  const r = seed ? rng(hash(seed)) : Math.random;
  return {
    taskId: newTaskId(p, r), riderName: pick(RIDERS, r), riderPhone: phone(r),
    pickupAddress: pick(PICKUP, r), pickupPhone: phone(r),
    customerName: pick(CUSTOMERS, r), customerPhone: phone(r), dropAddress: pick(DROP, r),
  };
}
export const taskOf = (o: Order): TaskInfo => o.task ?? genTask(o.provider, o.id);
