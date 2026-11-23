import type { SupabaseClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it } from 'vitest';
import { defaultData } from './defaults';
import { SyncEngine, type SyncStatus } from './sync';
import { FREE, type Data } from './types';

/* ---- a tiny browser + Supabase stand-in, with one storage per "device" ---- */

class Store {
  m = new Map<string, string>();
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
}
const g = globalThis as unknown as Record<string, unknown>;
g.window = { addEventListener() {}, removeEventListener() {} };
g.document = { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} };
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true });

/** Pretend to be the `budgets` table: one row, server sets updated_at. */
function fakeDb() {
  const table = { row: null as null | { data: Data; updated_at: string }, n: 0 };
  const db = {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: table.row && JSON.parse(JSON.stringify(table.row)), error: null }) }) }),
      upsert: (r: { data: Data }) => ({
        select: () => ({
          single: async () => {
            table.row = { data: JSON.parse(JSON.stringify(r.data)), updated_at: `stamp-${++table.n}` };
            return { data: { updated_at: table.row.updated_at }, error: null };
          },
        }),
      }),
    }),
  };
  return { table, db: db as unknown as SupabaseClient };
}

type Device = { store: Store; engine: SyncEngine; shown: Data | null; status: SyncStatus | null };

function device(db: SupabaseClient): Device {
  const d: Device = { store: new Store(), engine: null as unknown as SyncEngine, shown: null, status: null };
  g.localStorage = d.store;
  d.engine = new SyncEngine(db, 'me', (s) => (d.status = s), (data) => (d.shown = data));
  return d;
}
/** Run something "on" a device (switches which localStorage is live). */
async function on<T>(d: Device, f: () => Promise<T> | T): Promise<T> {
  g.localStorage = d.store;
  return f();
}
const withExpense = (base: Data, amt: number, t: number): Data => ({
  ...base,
  t,
  entries: [...base.entries, { id: amt, date: '2026-12-05', amt, from: FREE, note: '' }],
});
const flush = (d: Device) => on(d, () => (d.engine as unknown as { flush(): Promise<void> }).flush());

describe('sync between two devices', () => {
  let db: SupabaseClient;
  beforeEach(() => {
    db = fakeDb().db;
  });

  it('PC picks up a phone expense even when the phone clock is behind', async () => {
    const pc = device(db);
    const pcStart = withExpense(defaultData(), 100, 5_000_000); // PC clock is ahead
    await on(pc, () => { pc.engine.save(pcStart); return flush(pc); });
    expect(pc.status).toBe('synced');

    const phone = device(db);
    const loaded = await on(phone, () => phone.engine.init());
    expect(loaded?.entries).toHaveLength(1);

    const phoneEdit = withExpense(loaded!, 250, 1_000); // phone clock far behind
    await on(phone, () => { phone.engine.save(phoneEdit); return flush(phone); });
    expect(phone.status).toBe('synced');

    await on(pc, () => pc.engine.pull());
    expect(pc.shown?.entries.map((e) => e.amt)).toEqual([100, 250]);
  });

  it('does not reload its own save', async () => {
    const pc = device(db);
    await on(pc, () => { pc.engine.save(withExpense(defaultData(), 100, 1)); return flush(pc); });
    await on(pc, () => pc.engine.pull());
    expect(pc.shown).toBeNull();
  });

  it('first sign-in uploads what was already on the device', async () => {
    const pc = device(db);
    pc.store.setItem('budget-tracker-v2', JSON.stringify(withExpense(defaultData(), 42, 1)));
    await on(pc, () => pc.engine.init());
    const phone = device(db);
    const got = await on(phone, () => phone.engine.init());
    expect(got?.entries.map((e) => e.amt)).toEqual([42]);
  });

  it('unsent offline changes are sent on the next start instead of being overwritten', async () => {
    const pc = device(db);
    await on(pc, () => { pc.engine.save(withExpense(defaultData(), 1, 10)); return flush(pc); });
    // Go offline, make a change, "close the app".
    (navigator as { onLine: boolean }).onLine = false;
    await on(pc, () => { pc.engine.save(withExpense(withExpense(defaultData(), 1, 10), 2, 20)); return flush(pc); });
    expect(pc.status).toBe('offline');
    (navigator as { onLine: boolean }).onLine = true;
    // Reopen.
    const again = await on(pc, () => new SyncEngine(db, 'me', () => {}, () => {}));
    const reopened = await on(pc, () => again.init());
    expect(reopened?.entries.map((e) => e.amt)).toEqual([1, 2]);
    const phone = device(db);
    expect((await on(phone, () => phone.engine.init()))?.entries.map((e) => e.amt)).toEqual([1, 2]);
  });
});
