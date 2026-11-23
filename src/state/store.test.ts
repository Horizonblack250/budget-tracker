import { describe, expect, it } from 'vitest';
import { computeMonth } from '../lib/calc';
import { defaultData } from '../lib/defaults';
import { FREE } from '../lib/types';
import { reducer, type Action, type AppState } from './store';

const start = (): AppState => ({ data: defaultData(), view: '2026-12', past: [], toast: null });
const run = (s: AppState, ...actions: Action[]) => actions.reduce(reducer, s);
const free = (s: AppState) => computeMonth(s.data, s.view).free.left;

describe('undo', () => {
  it('undoes a mistaken expense', () => {
    let s = run(start(), { type: 'addEntries', entries: [{ id: 1, date: '2026-12-05', amt: 999, from: FREE, note: 'oops' }] });
    expect(free(s)).toBe(7650 - 999);
    expect(s.past[s.past.length - 1].label).toContain('₹999');
    s = run(s, { type: 'undo' });
    expect(free(s)).toBe(7650);
    expect(s.data.entries).toHaveLength(0);
    expect(s.past).toHaveLength(0);
  });

  it('steps back through several actions in order', () => {
    let s = run(
      start(),
      { type: 'addEntries', entries: [{ id: 1, date: '2026-12-05', amt: 100, from: FREE, note: 'a' }] },
      { type: 'addEntries', entries: [{ id: 2, date: '2026-12-06', amt: 200, from: FREE, note: 'b' }] },
      { type: 'deleteEntry', id: 1 },
    );
    expect(s.data.entries.map((e) => e.id)).toEqual([2]);
    s = run(s, { type: 'undo' });
    expect(s.data.entries.map((e) => e.id)).toEqual([1, 2]);
    s = run(s, { type: 'undo' });
    expect(s.data.entries.map((e) => e.id)).toEqual([1]);
    s = run(s, { type: 'undo' }, { type: 'undo' }); // extra undo is harmless
    expect(s.data.entries).toHaveLength(0);
  });

  it('treats typing into one field as a single step', () => {
    let s = start();
    for (const v of [1, 15, 159, 1590, 15900]) s = run(s, { type: 'plan', from: '2026-12', op: { type: 'update', id: 'rent', patch: { amount: v } } });
    expect(s.past).toHaveLength(1);
    s = run(s, { type: 'undo' });
    expect(computeMonth(s.data, '2026-12').fixed[0].amount).toBe(15900);
  });

  it('undoes plan changes too', () => {
    let s = run(start(), { type: 'plan', from: '2026-12', op: { type: 'remove', id: 'misc' } });
    expect(computeMonth(s.data, '2026-12').allowances.some((a) => a.id === 'misc')).toBe(false);
    s = run(s, { type: 'undo' });
    expect(computeMonth(s.data, '2026-12').allowances.some((a) => a.id === 'misc')).toBe(true);
  });

  it('a batch is one step', () => {
    let s = run(start(), {
      type: 'batch',
      label: 'removed goal',
      actions: [
        { type: 'addEntries', entries: [{ id: 1, date: '2026-12-05', amt: 50, from: FREE, note: '' }] },
        { type: 'plan', from: '2026-12', op: { type: 'remove', id: 'misc' } },
      ],
    });
    expect(s.past).toHaveLength(1);
    s = run(s, { type: 'undo' });
    expect({ ...s.data, t: undefined }).toEqual({ ...defaultData(), t: undefined });
  });
});
