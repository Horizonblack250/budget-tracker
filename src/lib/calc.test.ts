import { describe, expect, it } from 'vitest';
import { available, buildup, computeMonth, computeMonths, coverOptions, targetPrompts } from './calc';
import { defaultData } from './defaults';
import { changePlan } from './plan';
import { normalize } from './storage';
import { FREE, type Data, type Entry } from './types';

let nextId = 1;
const spend = (date: string, amt: number, from: string, note = ''): Entry => ({ id: nextId++, date, amt, from, note });
const move = (date: string, amt: number, from: string, to: string): Entry => ({ id: nextId++, date, amt, from, to, note: '' });
const withEntries = (d: Data, ...entries: Entry[]): Data => ({ ...d, entries: [...d.entries, ...entries] });

describe('default month', () => {
  const r = computeMonth(defaultData(), '2026-12');
  it('splits the salary', () => {
    expect(r.salary).toBe(45800);
    expect(r.totals).toEqual({ fixed: 15900, invest: 5000, savings: 10000, allowances: 7250 });
    // 45800 − 15900 − 5000 − 10000 − 7250
    expect(r.free.al).toBe(7650);
    expect(r.free.left).toBe(7650);
  });
  it('funds get their first contribution', () => {
    expect(r.funds.map((f) => [f.id, f.balance])).toEqual([['emergency', 5000], ['travel', 5000]]);
  });
  it('investments accumulate', () => {
    expect(computeMonth(defaultData(), '2027-03').invest[0].total).toBe(20000);
  });
});

describe('carry-forward', () => {
  it('unspent free money carries into next month', () => {
    const d = withEntries(defaultData(), spend('2026-12-10', 1000, FREE));
    expect(computeMonth(d, '2026-12').free.left).toBe(6650);
    const jan = computeMonth(d, '2027-01');
    expect(jan.free.cin).toBe(6650);
    expect(jan.free.left).toBe(7650 + 6650);
  });
  it('unspent allowance stays in the same allowance', () => {
    const d = withEntries(defaultData(), spend('2026-12-05', 300, 'office'));
    const dec = computeMonth(d, '2026-12');
    expect(dec.allowances.find((a) => a.id === 'office')!.left).toBe(1950);
    expect(dec.free.left).toBe(7650);
    expect(computeMonth(d, '2027-01').allowances.find((a) => a.id === 'office')!.left).toBe(2250 + 1950);
  });
  it('overspending carries as a deficit', () => {
    const d = withEntries(defaultData(), spend('2026-12-20', 8150, FREE));
    expect(computeMonth(d, '2026-12').free.left).toBe(-500);
    expect(computeMonth(d, '2027-01').free.cin).toBe(-500);
  });
});

describe('funds and goals', () => {
  it('withdrawals touch only the fund', () => {
    const d = withEntries(defaultData(), spend('2026-12-08', 2500, 'travel'));
    const r = computeMonth(d, '2026-12');
    expect(available(r, 'travel')).toBe(2500);
    expect(r.free.left).toBe(7650);
    expect(computeMonth(d, '2027-01').funds.find((f) => f.id === 'travel')!.balance).toBe(7500);
  });
  it('stops at the target and frees the money', () => {
    // Emergency target 50k at 5k/month: full after 10 months (Dec 2026 – Sep 2027).
    const sep = computeMonth(defaultData(), '2027-09');
    expect(sep.funds.find((f) => f.id === 'emergency')!.balance).toBe(50000);
    expect(targetPrompts(sep)).toHaveLength(0);
    const oct = computeMonth(defaultData(), '2027-10');
    const ef = oct.funds.find((f) => f.id === 'emergency')!;
    expect(ef.balance).toBe(50000);
    expect(ef.freed).toBe(5000);
    expect(oct.free.al).toBe(7650 + 5000);
    expect(targetPrompts(oct).map((f) => f.id)).toEqual(['emergency']);
  });
  it('a full fund refills after a withdrawal', () => {
    const d = withEntries(defaultData(), spend('2027-10-15', 3000, 'emergency'));
    const nov = computeMonth(d, '2027-11').funds.find((f) => f.id === 'emergency')!;
    expect(nov.contrib).toBe(3000);
    expect(nov.balance).toBe(50000);
  });
  it('redirecting from a month on leaves earlier months alone', () => {
    const d = changePlan(defaultData(), '2027-10', { type: 'redirect', fromId: 'emergency', toId: 'travel', amount: 5000 });
    expect(computeMonth(d, '2027-09').funds.find((f) => f.id === 'travel')!.balance).toBe(50000);
    const oct = computeMonth(d, '2027-10');
    expect(oct.funds.find((f) => f.id === 'travel')!.contrib).toBe(10000);
    expect(targetPrompts(oct)).toHaveLength(0);
  });
  it('goals have no monthly amount and fill only from moves', () => {
    let d = changePlan(defaultData(), '2026-12', {
      type: 'add', bucket: { id: 'mom', kind: 'goal', name: "Mom's phone", amount: 999, target: 20000 },
    });
    expect(computeMonth(d, '2026-12').free.al).toBe(7650); // the stray amount is ignored
    d = withEntries(d, move('2026-12-12', 3000, FREE, 'mom'), move('2027-01-03', 1000, 'misc', 'mom'));
    const r = computeMonth(d, '2026-12');
    expect(r.free.left).toBe(4650);
    expect(available(r, 'mom')).toBe(3000);
    const months = computeMonths(d, '2027-02');
    expect(buildup(months, 'mom').map((b) => [b.month, b.added, b.balance])).toEqual([
      ['2026-12', 3000, 3000], ['2027-01', 1000, 4000], ['2027-02', 0, 4000],
    ]);
    // A goal can be spent from like a fund.
    expect(coverOptions(computeMonth(d, '2027-02'), FREE, 4000).map((s) => s.id)).toContain('mom');
  });
});

describe('plan changes apply from a month onward', () => {
  it('raising rent in March keeps Dec–Feb unchanged', () => {
    const d = changePlan(defaultData(), '2027-03', { type: 'update', id: 'rent', patch: { amount: 17900 } });
    expect(computeMonth(d, '2027-02').free.al).toBe(7650);
    expect(computeMonth(d, '2027-03').free.al).toBe(5650);
  });
  it('per-month overrides', () => {
    const d: Data = { ...defaultData(), ov: { '2026-12': { salary: 39000, rent: 17900 } } };
    expect(computeMonth(d, '2026-12').free.al).toBe(7650 - 6800 - 2000);
    expect(computeMonth(d, '2027-01').free.al).toBe(7650);
  });
  it('a removed allowance folds its leftover into free spending', () => {
    let d = withEntries(defaultData(), spend('2026-12-03', 500, 'misc'));
    d = changePlan(d, '2027-01', { type: 'remove', id: 'misc' });
    const jan = computeMonth(d, '2027-01');
    expect(jan.allowances.some((a) => a.id === 'misc')).toBe(false);
    expect(jan.free.cin).toBe(7650 + 1000);
  });
});

describe('locked buckets', () => {
  it('are never offered to cover a shortfall', () => {
    const d = changePlan(defaultData(), '2026-12', { type: 'update', id: 'travel', patch: { locked: true } });
    const ids = coverOptions(computeMonth(d, '2026-12'), 'office', 50).map((s) => s.id);
    expect(ids).toContain(FREE);
    expect(ids).toContain('emergency'); // unlocked by default
    expect(ids).not.toContain('travel'); // locked
    expect(ids).not.toContain('sip'); // investments are never sources
    expect(ids).not.toContain('office');
  });
});

describe('import', () => {
  it('converts a backup from the original app', () => {
    const v1 = {
      set: { salary: 45800, rent: 15900, sip: 5000, ef: 5000, travel: 5000, misc: 1500, med: 2500, start: '2026-12', openEF: 0, openTrv: 0, odays: 3, ocost: 150, obuf: 15 },
      ov: {}, rov: { '2026-12': 17900 },
      ex: [{ id: 1, date: '2026-12-02', amt: 1000, br: 'rest', cat: 'Free spending', note: '', src: 'free' }],
    };
    const d = normalize(v1);
    const r = computeMonth(d, '2026-12');
    // Original spec: 8650 free, rent override −2000, spent 1000.
    expect(r.free.al).toBe(6650);
    expect(r.free.left).toBe(5650);
  });
  it('rejects junk', () => {
    expect(() => normalize({ hello: 1 })).toThrow();
  });
});
