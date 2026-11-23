import { addMonths, monthOf } from './format';
import { FREE, type Bucket, type Data, type Entry, type Plan } from './types';

/** The plan in effect for month m: the latest snapshot at or before m (or the earliest one). */
export function planFor(data: Data, m: string): Plan {
  const keys = Object.keys(data.plans).sort();
  let chosen = keys[0];
  for (const k of keys) if (k <= m) chosen = k;
  return data.plans[chosen];
}

/** Every bucket that has ever existed, latest definition wins. Used for names of removed buckets. */
export function allBuckets(data: Data): Map<string, Bucket> {
  const map = new Map<string, Bucket>();
  for (const k of Object.keys(data.plans).sort()) for (const b of data.plans[k].buckets) map.set(b.id, b);
  return map;
}

export type PotRow = {
  id: string;
  name: string;
  hint?: string;
  locked: boolean;
  /** Monthly allowance amount. */
  al: number;
  /** Carried in from last month (negative = deficit). */
  cin: number;
  /** Spent on expenses this month. */
  spent: number;
  /** Moved in from / out to other buckets this month. */
  movedIn: number;
  movedOut: number;
  left: number;
};

export type FundRow = {
  id: string;
  name: string;
  hint?: string;
  locked: boolean;
  /** Contribution in the plan. */
  planned: number;
  /** Actually contributed this month (less than planned once the target is reached). */
  contrib: number;
  /** planned − contrib: money that went to free spending because the target is reached. */
  freed: number;
  target: number;
  targetAck: boolean;
  withdrawn: number;
  movedIn: number;
  movedOut: number;
  balance: number;
  /** In the plan this month (false = removed but still holds a balance). */
  active: boolean;
};

export type MonthResult = {
  month: string;
  plan: Plan;
  salary: number;
  salaryOverridden: boolean;
  fixed: { id: string; name: string; hint?: string; amount: number; def: number; overridden: boolean }[];
  invest: { id: string; name: string; amount: number; total: number }[];
  funds: FundRow[];
  allowances: PotRow[];
  free: PotRow;
  totals: { fixed: number; invest: number; savings: number; allowances: number };
};

type Running = {
  carry: Record<string, number>; // allowance + free balances
  fundBal: Record<string, number>;
  fundSeen: Set<string>;
  invested: Record<string, number>;
};

function emptyPot(id: string, name: string, al: number, cin: number, locked = false, hint?: string): PotRow {
  return { id, name, hint, locked, al, cin, spent: 0, movedIn: 0, movedOut: 0, left: 0 };
}

function stepMonth(data: Data, m: string, run: Running, entries: Entry[]): MonthResult {
  const plan = planFor(data, m);
  const ov = data.ov[m] ?? {};
  const salary = ov.salary ?? plan.salary;

  const fixed = plan.buckets
    .filter((b) => b.kind === 'fixed')
    .map((b) => ({ id: b.id, name: b.name, hint: b.hint, amount: ov[b.id] ?? b.amount, def: b.amount, overridden: b.id in ov }));

  const invest = plan.buckets
    .filter((b) => b.kind === 'invest')
    .map((b) => {
      run.invested[b.id] = (run.invested[b.id] ?? 0) + b.amount;
      return { id: b.id, name: b.name, amount: b.amount, total: run.invested[b.id] };
    });

  // Funds: contribute at the start of the month, capped at the target.
  const funds = new Map<string, FundRow>();
  for (const b of plan.buckets.filter((x) => x.kind === 'fund')) {
    if (!run.fundSeen.has(b.id)) {
      run.fundSeen.add(b.id);
      run.fundBal[b.id] = (run.fundBal[b.id] ?? 0) + (data.opening[b.id] ?? 0);
    }
    const bal = run.fundBal[b.id];
    const target = b.target ?? 0;
    const contrib = target > 0 ? Math.max(0, Math.min(b.amount, target - bal)) : b.amount;
    funds.set(b.id, {
      id: b.id, name: b.name, hint: b.hint, locked: !!b.locked, planned: b.amount, contrib, freed: b.amount - contrib,
      target, targetAck: !!b.targetAck, withdrawn: 0, movedIn: 0, movedOut: 0, balance: bal + contrib, active: true,
    });
  }
  // Removed funds that still hold money stay visible.
  const names = allBuckets(data);
  for (const id of Object.keys(run.fundBal)) {
    if (funds.has(id) || Math.round(run.fundBal[id]) === 0) continue;
    const b = names.get(id);
    funds.set(id, {
      id, name: b?.name ?? id, locked: !!b?.locked, planned: 0, contrib: 0, freed: 0, target: 0, targetAck: false,
      withdrawn: 0, movedIn: 0, movedOut: 0, balance: run.fundBal[id], active: false,
    });
  }

  // Allowances. Leftovers of removed allowances fold into free spending.
  const allowBuckets = plan.buckets.filter((b) => b.kind === 'allowance');
  const allowIds = new Set(allowBuckets.map((b) => b.id));
  for (const id of Object.keys(run.carry)) {
    if (id !== FREE && !allowIds.has(id)) {
      run.carry[FREE] = (run.carry[FREE] ?? 0) + run.carry[id];
      delete run.carry[id];
    }
  }
  const pots = new Map<string, PotRow>();
  for (const b of allowBuckets) pots.set(b.id, emptyPot(b.id, b.name, b.amount, run.carry[b.id] ?? 0, !!b.locked, b.hint));

  const totals = {
    fixed: fixed.reduce((s, x) => s + x.amount, 0),
    invest: invest.reduce((s, x) => s + x.amount, 0),
    savings: [...funds.values()].reduce((s, f) => s + f.contrib, 0),
    allowances: allowBuckets.reduce((s, b) => s + b.amount, 0),
  };
  const freeAl = salary - totals.fixed - totals.invest - totals.savings - totals.allowances;
  const free = emptyPot(FREE, 'Free spending', freeAl, run.carry[FREE] ?? 0, false, 'lifestyle, food, shopping, fun');

  // Apply this month's entries. Unknown sources fall back to free spending.
  const pot = (id: string) => pots.get(id) ?? (funds.has(id) ? null : free);
  for (const e of entries) {
    const srcPot = pot(e.from);
    const srcFund = funds.get(e.from);
    if (e.to) {
      if (srcFund) srcFund.movedOut += e.amt;
      else if (srcPot) srcPot.movedOut += e.amt;
      const dstFund = funds.get(e.to);
      const dstPot = pot(e.to);
      if (dstFund) dstFund.movedIn += e.amt;
      else if (dstPot) dstPot.movedIn += e.amt;
    } else if (srcFund) srcFund.withdrawn += e.amt;
    else if (srcPot) srcPot.spent += e.amt;
  }

  for (const p of [...pots.values(), free]) {
    p.left = p.al + p.cin + p.movedIn - p.spent - p.movedOut;
    run.carry[p.id] = p.left;
  }
  for (const f of funds.values()) {
    f.balance += f.movedIn - f.withdrawn - f.movedOut;
    run.fundBal[f.id] = f.balance;
  }

  return {
    month: m, plan, salary, salaryOverridden: 'salary' in ov, fixed, invest,
    funds: [...funds.values()], allowances: [...pots.values()], free, totals,
  };
}

/** Compute every month from the start month up to and including `viewed`. */
export function computeMonths(data: Data, viewed: string): MonthResult[] {
  const byMonth = new Map<string, Entry[]>();
  for (const e of data.entries) {
    const m = monthOf(e.date);
    if (!byMonth.has(m)) byMonth.set(m, []);
    byMonth.get(m)!.push(e);
  }
  const run: Running = { carry: {}, fundBal: {}, fundSeen: new Set(), invested: {} };
  const out: MonthResult[] = [];
  const first = viewed < data.start ? viewed : data.start;
  for (let m = first; m <= viewed; m = addMonths(m, 1)) out.push(stepMonth(data, m, run, byMonth.get(m) ?? []));
  return out;
}

export function computeMonth(data: Data, viewed: string): MonthResult {
  const all = computeMonths(data, viewed);
  return all[all.length - 1];
}

/** Money available in a source as of a month: allowance/free left, or fund balance. */
export function available(r: MonthResult, id: string): number {
  if (id === FREE) return r.free.left;
  const a = r.allowances.find((x) => x.id === id);
  if (a) return a.left;
  const f = r.funds.find((x) => x.id === id);
  return f ? f.balance : 0;
}

export type Source = { id: string; name: string; kind: 'free' | 'allowance' | 'fund'; locked: boolean; available: number };

/** Everything money can be spent from in that month (investments are never a source). */
export function sources(r: MonthResult): Source[] {
  return [
    { id: FREE, name: r.free.name, kind: 'free' as const, locked: false, available: r.free.left },
    ...r.allowances.map((a) => ({ id: a.id, name: a.name, kind: 'allowance' as const, locked: a.locked, available: a.left })),
    ...r.funds.map((f) => ({ id: f.id, name: f.name, kind: 'fund' as const, locked: f.locked, available: f.balance })),
  ];
}

/** Sources that may cover a shortfall of `short` for `chosen`: not locked, not the same, enough money. */
export function coverOptions(r: MonthResult, chosen: string, short: number): Source[] {
  return sources(r).filter((s) => s.id !== chosen && !s.locked && s.available >= short);
}

/** Funds that are already full at the start of the month and still have a planned contribution nobody decided about. */
export function targetPrompts(r: MonthResult): FundRow[] {
  return r.funds.filter((f) => f.active && f.planned > 0 && f.freed === f.planned && !f.targetAck);
}
