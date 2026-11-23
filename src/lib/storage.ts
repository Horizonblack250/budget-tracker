import { defaultData, defaultPlan, DEFAULT_START } from './defaults';
import { FREE, type Data, type Entry } from './types';

/**
 * Where data lives. The app only talks to this interface, so the local
 * implementation can later be swapped for (or combined with) Supabase.
 */
export interface StorageBackend {
  /** Shown in the header, e.g. "saved on this device". */
  label: string;
  load(): Promise<Data | null>;
  save(data: Data): Promise<void>;
}

const KEY = 'budget-tracker-v2';

export function loadLocal(): Data | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? normalize(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function saveLocal(data: Data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch (e) {
    console.error('[storage] could not save on this device', e);
  }
}

export function clearLocal() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
}

/** Used when Supabase isn't configured. */
export const localBackend: StorageBackend = {
  label: 'saved on this device',
  async load() {
    return loadLocal();
  },
  async save(data) {
    localStorage.setItem(KEY, JSON.stringify(data));
  },
};

/* ---------- validation, import and export ---------- */

function isObj(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

/** Accepts this app's format (v2) or the original app's format (v1) and returns clean v2 data. Throws if neither. */
export function normalize(raw: unknown): Data {
  if (!isObj(raw)) throw new Error('Not a budget backup');
  if (raw.version === 2) {
    if (!isObj(raw.plans) || !Array.isArray(raw.entries)) throw new Error('Backup is missing plans or entries');
    const d = defaultData();
    return {
      version: 2,
      start: typeof raw.start === 'string' ? raw.start : d.start,
      plans: raw.plans as Data['plans'],
      opening: isObj(raw.opening) ? (raw.opening as Data['opening']) : {},
      ov: isObj(raw.ov) ? (raw.ov as Data['ov']) : {},
      entries: (raw.entries as Entry[]).filter((e) => e && typeof e.amt === 'number' && typeof e.date === 'string'),
      t: typeof raw.t === 'number' ? raw.t : undefined,
    };
  }
  if (isObj(raw.set) && Array.isArray(raw.ex)) return fromV1(raw);
  throw new Error('Not a budget backup');
}

/** Convert a backup from the original single-file app. */
function fromV1(raw: Record<string, unknown>): Data {
  const s = raw.set as Record<string, number | string>;
  const n = (k: string, d: number) => (typeof s[k] === 'number' ? (s[k] as number) : d);
  const start = typeof s.start === 'string' ? s.start : DEFAULT_START;
  const plan = defaultPlan();
  const officeAmt = Math.ceil((n('odays', 3) * n('ocost', 150) * 4.33 * (1 + n('obuf', 15) / 100)) / 50) * 50;
  const amounts: Record<string, number> = {
    rent: n('rent', 15900), sip: n('sip', 5000), emergency: n('ef', 5000), travel: n('travel', 5000),
    office: officeAmt, misc: n('misc', 1500), med: n('med', 2500),
  };
  plan.salary = n('salary', 45800);
  // The original had no phone allowance or emergency target.
  plan.buckets = plan.buckets
    .filter((b) => b.id !== 'phone')
    .map((b) => ({ ...b, amount: amounts[b.id] ?? b.amount, target: b.id === 'emergency' ? undefined : b.target }));

  const ov: Data['ov'] = {};
  for (const [m, v] of Object.entries((raw.ov as Record<string, number>) ?? {})) (ov[m] ??= {}).salary = v;
  for (const [m, v] of Object.entries((raw.rov as Record<string, number>) ?? {})) (ov[m] ??= {}).rent = v;

  const brMap: Record<string, string> = { office: 'office', misc: 'misc', med: 'med', rest: FREE };
  const entries: Entry[] = (raw.ex as Record<string, unknown>[]).map((e) => {
    const src = e.src as string | undefined;
    let from = brMap[(e.br as string) ?? ''];
    if (!from) from = e.cat === 'Misc' ? 'misc' : e.cat === 'Medical' ? 'med' : FREE;
    if (src === 'trv') from = 'travel';
    if (src === 'ef') from = 'emergency';
    return { id: e.id as number, date: e.date as string, amt: e.amt as number, from, note: (e.note as string) ?? '' };
  });

  return {
    version: 2, start, plans: { [start]: plan },
    opening: { travel: n('openTrv', 0), emergency: n('openEF', 0) },
    ov, entries,
  };
}

export function exportFile(data: Data, today: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `budget-backup-${today}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
