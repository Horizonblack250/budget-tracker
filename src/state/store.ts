import { createContext, useContext } from 'react';
import { allBuckets } from '../lib/calc';
import { fmt, monthLabel, monthOf } from '../lib/format';
import { changePlan, type PlanOp } from '../lib/plan';
import { FREE, type Data, type Entry } from '../lib/types';

/** One undoable step: the data as it was before, and what the step did. */
export type UndoStep = { data: Data; label: string; key?: string; at: number };

export type Toast = { msg: string; key: number; canUndo: boolean };

export type AppState = {
  data: Data;
  view: string; // YYYY-MM
  /** Undo history, most recent last. */
  past: UndoStep[];
  toast: Toast | null;
};

type DataAction =
  | { type: 'addEntries'; entries: Entry[]; msg?: string }
  | { type: 'deleteEntry'; id: number }
  | { type: 'override'; month: string; key: string; value: number | null }
  | { type: 'plan'; from: string; op: PlanOp }
  | { type: 'start'; month: string }
  | { type: 'opening'; id: string; value: number };

export type Action =
  | DataAction
  /** Several changes recorded as one undo step. */
  | { type: 'batch'; actions: DataAction[]; label: string }
  | { type: 'replace'; data: Data; view: string; label?: string }
  | { type: 'undo' }
  | { type: 'dismissToast' }
  | { type: 'view'; month: string };

const MAX_UNDO = 30;
/** Edits to the same field within this window count as one undo step (typing "15900" is one change, not five). */
const MERGE_MS = 4000;

const touch = (d: Data): Data => ({ ...d, t: Date.now() });

function nameOf(data: Data, id: string): string {
  return id === FREE ? 'Free spending' : allBuckets(data).get(id)?.name ?? 'item';
}

/** Apply a change to the data. Returns the new data, a description, an optional merge key and a toast. */
function apply(data: Data, a: DataAction): { data: Data; label: string; key?: string; toast?: string } {
  switch (a.type) {
    case 'addEntries': {
      const total = a.entries.reduce((s, e) => s + e.amt, 0);
      const e = a.entries[0];
      const label = e.to ? `${fmt(total)} into ${nameOf(data, e.to)}` : `${fmt(total)} ${e.note ? `“${e.note}”` : nameOf(data, e.from)}`;
      return { data: { ...data, entries: [...data.entries, ...a.entries] }, label, toast: a.msg ?? 'Expense added' };
    }
    case 'deleteEntry': {
      const e = data.entries.find((x) => x.id === a.id);
      return {
        data: { ...data, entries: data.entries.filter((x) => x.id !== a.id) },
        label: `delete of ${e ? fmt(e.amt) : 'entry'}${e?.note ? ` “${e.note}”` : ''}`,
        toast: 'Entry deleted',
      };
    }
    case 'override': {
      const month = { ...(data.ov[a.month] ?? {}) };
      if (a.value === null) delete month[a.key];
      else month[a.key] = a.value;
      const ov = { ...data.ov, [a.month]: month };
      if (!Object.keys(month).length) delete ov[a.month];
      const what = a.key === 'salary' ? 'salary' : nameOf(data, a.key);
      return { data: { ...data, ov }, label: `changed ${what} for ${monthLabel(a.month)}`, key: `ov:${a.month}:${a.key}` };
    }
    case 'plan': {
      const op = a.op;
      let label = 'changed the plan';
      let key: string | undefined;
      if (op.type === 'salary') { label = 'changed salary'; key = 'plan:salary'; }
      if (op.type === 'add') label = `added ${op.bucket.name}`;
      if (op.type === 'remove') label = `removed ${nameOf(data, op.id)}`;
      if (op.type === 'redirect') label = `moved ${nameOf(data, op.fromId)}’s monthly amount`;
      if (op.type === 'move') label = `reordered ${nameOf(data, op.id)}`;
      if (op.type === 'update') {
        const n = nameOf(data, op.id);
        const p = op.patch;
        key = `plan:${op.id}:${Object.keys(p).sort().join(',')}`;
        if ('locked' in p) { label = `${p.locked ? 'locked' : 'unlocked'} ${n}`; key = undefined; }
        else if ('name' in p) label = `renamed ${n}`;
        else if ('target' in p) label = `changed ${n} target`;
        else if ('targetAck' in p) label = `kept ${n}’s money as free spending`;
        else label = `changed ${n}`;
      }
      return { data: changePlan(data, a.from, op), label, key };
    }
    case 'start': {
      // Keep the plan that applied at the old start effective at the new start too.
      const plans = { ...data.plans };
      const first = Object.keys(plans).sort()[0];
      if (a.month < first) {
        plans[a.month] = plans[first];
        delete plans[first];
      }
      return { data: { ...data, start: a.month, plans }, label: 'changed start month', key: 'start' };
    }
    case 'opening':
      return { data: { ...data, opening: { ...data.opening, [a.id]: a.value } }, label: `changed ${nameOf(data, a.id)} starting balance`, key: `opening:${a.id}` };
  }
}

/** Add an undo step, merging rapid edits to the same field into one. */
function record(past: UndoStep[], before: Data, label: string, key?: string): UndoStep[] {
  const now = Date.now();
  const top = past[past.length - 1];
  if (key && top?.key === key && now - top.at < MERGE_MS) return [...past.slice(0, -1), { ...top, label, at: now }];
  return [...past, { data: before, label, key, at: now }].slice(-MAX_UNDO);
}

function viewFor(data: Data, view: string) {
  return view < data.start ? data.start : view;
}

export function reducer(s: AppState, a: Action): AppState {
  switch (a.type) {
    case 'replace': {
      // Loading saved data starts a clean history; importing a backup can be undone.
      const past = a.label ? record(s.past, s.data, a.label) : [];
      return { data: a.data, view: viewFor(a.data, a.view), past, toast: a.label ? { msg: 'Backup imported', key: Date.now(), canUndo: true } : null };
    }
    case 'undo': {
      const step = s.past[s.past.length - 1];
      if (!step) return s;
      return {
        data: touch(step.data),
        view: viewFor(step.data, s.view),
        past: s.past.slice(0, -1),
        toast: { msg: `Undone: ${step.label}`, key: Date.now(), canUndo: false },
      };
    }
    case 'dismissToast':
      return { ...s, toast: null };
    case 'view':
      return { ...s, view: viewFor(s.data, a.month) };
    case 'batch': {
      let data = s.data;
      for (const x of a.actions) data = apply(data, x).data;
      return { ...s, data: touch(data), past: record(s.past, s.data, a.label), toast: { msg: a.label[0].toUpperCase() + a.label.slice(1), key: Date.now(), canUndo: true } };
    }
    default: {
      if (a.type === 'addEntries' && !a.entries.length) return s;
      const r = apply(s.data, a);
      const view = a.type === 'addEntries' ? monthOf(a.entries[0].date) : a.type === 'start' && s.view < a.month ? a.month : s.view;
      return {
        data: touch(r.data),
        view,
        past: record(s.past, s.data, r.label, r.key),
        toast: r.toast ? { msg: r.toast, key: Date.now(), canUndo: true } : s.toast,
      };
    }
  }
}

export const DispatchCtx = createContext<(a: Action) => void>(() => {});
export const useDispatch = () => useContext(DispatchCtx);

export function newEntryId(): number {
  return Date.now() * 1000 + Math.floor(Math.random() * 1000);
}
