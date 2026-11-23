import { createContext, useContext } from 'react';
import { monthOf } from '../lib/format';
import { changePlan, type PlanOp } from '../lib/plan';
import type { Data, Entry } from '../lib/types';

export type UndoInfo = { entries: Entry[]; msg: string; key: number };

export type AppState = {
  data: Data;
  view: string; // YYYY-MM
  undo: UndoInfo | null;
};

export type Action =
  | { type: 'replace'; data: Data; view: string }
  | { type: 'addEntries'; entries: Entry[]; msg?: string }
  | { type: 'deleteEntry'; id: number }
  | { type: 'undo' }
  | { type: 'dismissUndo' }
  | { type: 'view'; month: string }
  | { type: 'override'; month: string; key: string; value: number | null }
  | { type: 'plan'; from: string; op: PlanOp }
  | { type: 'start'; month: string }
  | { type: 'opening'; id: string; value: number };

const touch = (d: Data): Data => ({ ...d, t: Date.now() });

export function reducer(s: AppState, a: Action): AppState {
  switch (a.type) {
    case 'replace':
      return { data: a.data, view: a.view < a.data.start ? a.data.start : a.view, undo: null };
    case 'addEntries': {
      if (!a.entries.length) return s;
      return {
        data: touch({ ...s.data, entries: [...s.data.entries, ...a.entries] }),
        view: monthOf(a.entries[0].date),
        undo: { entries: s.data.entries, msg: a.msg ?? 'Expense added', key: Date.now() },
      };
    }
    case 'deleteEntry':
      return {
        ...s,
        data: touch({ ...s.data, entries: s.data.entries.filter((e) => e.id !== a.id) }),
        undo: { entries: s.data.entries, msg: 'Entry deleted', key: Date.now() },
      };
    case 'undo':
      return s.undo ? { ...s, data: touch({ ...s.data, entries: s.undo.entries }), undo: null } : s;
    case 'dismissUndo':
      return { ...s, undo: null };
    case 'view':
      return { ...s, view: a.month < s.data.start ? s.data.start : a.month };
    case 'override': {
      const month = { ...(s.data.ov[a.month] ?? {}) };
      if (a.value === null) delete month[a.key];
      else month[a.key] = a.value;
      const ov = { ...s.data.ov, [a.month]: month };
      if (!Object.keys(month).length) delete ov[a.month];
      return { ...s, data: touch({ ...s.data, ov }) };
    }
    case 'plan':
      return { ...s, data: touch(changePlan(s.data, a.from, a.op)) };
    case 'start': {
      // Keep the plan that applied at the old start effective at the new start too.
      const plans = { ...s.data.plans };
      const first = Object.keys(plans).sort()[0];
      if (a.month < first) {
        plans[a.month] = plans[first];
        delete plans[first];
      }
      const data = touch({ ...s.data, start: a.month, plans });
      return { ...s, data, view: s.view < a.month ? a.month : s.view };
    }
    case 'opening':
      return { ...s, data: touch({ ...s.data, opening: { ...s.data.opening, [a.id]: a.value } }) };
  }
}

export const DispatchCtx = createContext<(a: Action) => void>(() => {});
export const useDispatch = () => useContext(DispatchCtx);

export function newEntryId(): number {
  return Date.now() * 1000 + Math.floor(Math.random() * 1000);
}
