import { db } from './db';

/**
 * Atomic sequential counters for challan / payment-request / receipt numbering.
 *
 * Primary path: backend atomic counter endpoint (MongoDB findOneAndUpdate $inc) so
 * concurrent clients never get duplicate numbers. Offline/failure fallback: local
 * Dexie counter seeded from the max existing local number (best-effort; the server
 * counter remains the source of truth once back online).
 */

export interface NextNumberOptions {
  key: string; // counter document id, e.g. 'productChallan'
  prefix: string; // e.g. 'SWH-'
  pad?: number; // zero-pad width, default 4
}

function format(prefix: string, seq: number, pad: number): string {
  return `${prefix}${String(seq).padStart(pad, '0')}`;
}

async function nextLocalSeq(key: string): Promise<number> {
  const existing = await db.counters.get(key);
  const next = (existing?.seq || 0) + 1;
  await db.counters.put({ id: key, seq: next });
  return next;
}

export async function getNextNumber(opts: NextNumberOptions): Promise<{ number: string; seq: number }> {
  const pad = opts.pad ?? 4;

  // Try backend atomic counter first
  try {
    const { buildApiUrl } = await import('./firebase');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(buildApiUrl(`/api/counters/${encodeURIComponent(opts.key)}/next`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
      signal: controller.signal
    });
    clearTimeout(timer);
    if (res.ok) {
      const data = await res.json();
      const seq = Number(data?.seq);
      if (seq && seq > 0) {
        // Keep local counter in sync so offline fallback stays ahead
        await db.counters.put({ id: opts.key, seq });
        return { number: format(opts.prefix, seq, pad), seq };
      }
    }
    throw new Error('counter endpoint returned no seq');
  } catch (err) {
    console.warn(`Counter '${opts.key}' backend call failed, using local fallback:`, err);
    const seq = await nextLocalSeq(opts.key);
    return { number: format(opts.prefix, seq, pad), seq };
  }
}

/**
 * Seed a local counter from the current max so an offline-first first-use doesn't
 * restart at 1. Call with the highest existing sequence already in use.
 */
export async function seedLocalCounter(key: string, atLeast: number): Promise<void> {
  try {
    const existing = await db.counters.get(key);
    if (!existing || existing.seq < atLeast) {
      await db.counters.put({ id: key, seq: atLeast });
    }
  } catch (_) {}
}
