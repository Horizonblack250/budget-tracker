import { useMemo, useRef, useState } from 'react';
import { computeMonth, coverOptions, sources, type MonthResult, type Source } from '../lib/calc';
import { fmt, monthOf, num } from '../lib/format';
import { newId } from '../lib/plan';
import { FREE, type Data, type Entry } from '../lib/types';
import { newEntryId, useDispatch } from '../state/store';
import { useUI } from '../state/ui';
import { PotPicker, Sheet } from './Sheet';

export const MIN_GOAL = 2000;

function defaultDate(view: string, today: string) {
  return monthOf(today) === view ? today : `${view}-01`;
}

function groupSources(list: Source[]): [string, Source[]][] {
  return [
    ['Spending money', list.filter((s) => s.kind === 'free' || s.kind === 'allowance')],
    ['Savings & goals', list.filter((s) => s.kind === 'fund' || s.kind === 'goal')],
  ];
}

type Shortfall = { from: Source; amt: number; have: number; short: number; options: Source[] };

export function ExpenseSheet({ data, view, today, initialFrom, onClose }: { data: Data; view: string; today: string; initialFrom?: string; onClose: () => void }) {
  const dispatch = useDispatch();
  const [amt, setAmt] = useState('');
  const [from, setFrom] = useState(initialFrom ?? FREE);
  const [note, setNote] = useState('');
  const [date, setDate] = useState(defaultDate(view, today));
  const [warn, setWarn] = useState<Shortfall | null>(null);
  const amtRef = useRef<HTMLInputElement>(null);

  const at = useMemo(() => computeMonth(data, monthOf(date)), [data, date]);
  const list = sources(at).filter((s) => s.kind === 'free' || s.kind === 'allowance' || s.available > 0 || s.id === from);
  const src = list.find((s) => s.id === from) ?? list[0];

  const save = (entries: Entry[]) => {
    dispatch({ type: 'addEntries', entries });
    onClose();
  };

  const submit = () => {
    setWarn(null);
    const a = num(amt);
    if (a <= 0) return amtRef.current?.focus();
    const e: Entry = { id: newEntryId(), date, amt: a, from: src.id, note: note.trim() };
    if (src.available >= a) return save([e]);
    const have = Math.max(src.available, 0);
    const short = a - have;
    setWarn({ from: src, amt: a, have, short, options: coverOptions(at, src.id, short) });
  };

  const cover = (w: Shortfall, by: Source) => {
    const n = note.trim();
    const entries: Entry[] = [];
    if (w.have > 0) entries.push({ id: newEntryId(), date, amt: w.have, from: w.from.id, note: n });
    entries.push({ id: newEntryId() + 1, date, amt: w.short, from: by.id, note: `${n} (covers ${w.from.name})`.trim() });
    save(entries);
  };

  return (
    <Sheet title="Add expense" onClose={onClose}>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label className="bigamount">
          <span>₹</span>
          <input ref={amtRef} autoFocus type="number" inputMode="decimal" min={0} step="any" placeholder="0" aria-label="Amount in rupees" value={amt} onChange={(e) => { setAmt(e.target.value); setWarn(null); }} />
        </label>
        <input className="field" type="text" placeholder="What for? (lunch, Zomato, Myntra…)" aria-label="What for" value={note} onChange={(e) => setNote(e.target.value)} />
        <PotPicker label="Pay from" groups={groupSources(list)} value={src.id} onChange={(id) => { setFrom(id); setWarn(null); }} />
        <label className="field-row">
          <span className="mute">Date</span>
          <input type="date" min={`${data.start}-01`} value={date} onChange={(e) => { if (e.target.value) { setDate(e.target.value); setWarn(null); } }} />
        </label>

        {warn ? (
          <div className="warn" aria-live="polite">
            <p>
              <strong>{warn.from.name}</strong> only has {fmt(warn.have)} left.
              {warn.have > 0 ? ` That ${fmt(warn.have)} comes from it, and the other ${fmt(warn.short)}…` : ` Where should the ${fmt(warn.short)} come from?`}
            </p>
            <div className="choices">
              {warn.options.map((o) => (
                <button key={o.id} type="button" className={o.id === FREE ? 'choice primary' : 'choice'} onClick={() => cover(warn, o)}>
                  <span>from {o.name}</span>
                  <span className="small">{fmt(o.available)} left</span>
                </button>
              ))}
              {!warn.options.length && <p className="small mute">Nothing unlocked has enough to cover it.</p>}
              <button type="button" className="choice" onClick={() => save([{ id: newEntryId(), date, amt: warn.amt, from: warn.from.id, note: note.trim() }])}>
                <span>Keep all in {warn.from.name}</span>
                <span className="small">it goes negative and carries over</span>
              </button>
            </div>
          </div>
        ) : (
          <button type="submit" className="primary wide">
            Add {num(amt) > 0 ? fmt(num(amt)) : 'expense'}
          </button>
        )}
      </form>
    </Sheet>
  );
}

/** Put money into a goal or fund from any unlocked pot. */
export function AddMoneySheet({ data, view, today, to, onClose }: { data: Data; view: string; today: string; to: string; onClose: () => void }) {
  const dispatch = useDispatch();
  const [amt, setAmt] = useState('');
  const [from, setFrom] = useState(FREE);
  const [date, setDate] = useState(defaultDate(view, today));
  const [confirm, setConfirm] = useState(false);

  const at = useMemo(() => computeMonth(data, monthOf(date)), [data, date]);
  const target = at.funds.find((f) => f.id === to);
  const list = sources(at).filter((s) => s.id !== to && !s.locked && (s.kind === 'free' || s.kind === 'allowance' || s.available > 0));
  const src = list.find((s) => s.id === from) ?? list[0];
  const a = num(amt);
  const toGo = target && target.target > 0 ? Math.max(0, target.target - target.balance) : 0;

  const submit = () => {
    if (a <= 0 || !src) return;
    if (src.available < a && !confirm) return setConfirm(true);
    dispatch({ type: 'addEntries', entries: [{ id: newEntryId(), date, amt: a, from: src.id, to, note: '' }], msg: `Added to ${target?.name ?? 'goal'}` });
    onClose();
  };

  const quick = [500, 1000, 2000, 5000].filter((q) => !toGo || q <= toGo);

  return (
    <Sheet title={`Add money to ${target?.name ?? 'goal'}`} onClose={onClose}>
      <form noValidate onSubmit={(e) => { e.preventDefault(); submit(); }}>
        {target && (
          <p className="mute small">
            Saved {fmt(target.balance)}
            {target.target > 0 && ` of ${fmt(target.target)} · ${fmt(toGo)} to go`}
          </p>
        )}
        <label className="bigamount">
          <span>₹</span>
          <input autoFocus type="number" inputMode="decimal" min={0} step="any" placeholder="0" aria-label="Amount in rupees" value={amt} onChange={(e) => { setAmt(e.target.value); setConfirm(false); }} />
        </label>
        <div className="quick">
          {quick.map((q) => (
            <button key={q} type="button" className="pill" onClick={() => { setAmt(String(q)); setConfirm(false); }}>
              {fmt(q)}
            </button>
          ))}
          {toGo > 0 && (
            <button type="button" className="pill" onClick={() => { setAmt(String(toGo)); setConfirm(false); }}>
              All {fmt(toGo)} to go
            </button>
          )}
        </div>
        <PotPicker label="Take it from" groups={groupSources(list)} value={src?.id ?? ''} onChange={(id) => { setFrom(id); setConfirm(false); }} />
        <p className="small mute">Locked pots and investments aren’t listed: you can’t borrow from them.</p>
        <label className="field-row">
          <span className="mute">Date</span>
          <input type="date" min={`${data.start}-01`} value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
        </label>
        {confirm && src && (
          <p className="warn small" aria-live="polite">
            {src.name} only has {fmt(src.available)}. Adding {fmt(a)} takes it negative — press again to do it anyway.
          </p>
        )}
        <button type="submit" className="primary wide" disabled={a <= 0}>
          {confirm ? 'Add anyway' : `Add ${a > 0 ? fmt(a) : 'money'}`}
        </button>
      </form>
    </Sheet>
  );
}

export function NewGoalSheet({ r, onClose }: { r: MonthResult; onClose: () => void }) {
  const dispatch = useDispatch();
  const { openSheet } = useUI();
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [locked, setLocked] = useState(false);
  const [tried, setTried] = useState(false);
  const t = num(target);
  const nameErr = !name.trim() ? 'Give your goal a name' : '';
  const targetErr = t < MIN_GOAL ? `A goal needs a target of at least ${fmt(MIN_GOAL)}` : '';

  const submit = () => {
    setTried(true);
    if (nameErr || targetErr) return;
    const id = newId('goal');
    dispatch({ type: 'plan', from: r.month, op: { type: 'add', bucket: { id, kind: 'goal', name: name.trim(), amount: 0, target: t, locked } } });
    openSheet({ type: 'addMoney', to: id });
  };

  return (
    <Sheet title="New goal" onClose={onClose}>
      <form noValidate onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <p className="mute small">Save up for something at your own pace. There’s no fixed monthly amount — add money whenever you have some spare.</p>
        <label className="field-label">
          What are you saving for?
          <input autoFocus className="field" type="text" placeholder="Mom’s phone, new laptop, Goa trip…" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        {tried && nameErr && <p className="small neg">{nameErr}</p>}
        <label className="field-label">
          How much do you need?
          <span className="bigamount small-amt">
            <span>₹</span>
            <input type="number" inputMode="numeric" min={MIN_GOAL} placeholder={String(MIN_GOAL)} value={target} onChange={(e) => setTarget(e.target.value)} />
          </span>
        </label>
        {tried && targetErr && <p className="small neg">{targetErr}</p>}
        <label className="toggle">
          <input type="checkbox" checked={locked} onChange={(e) => setLocked(e.target.checked)} />
          <span>
            🔒 Lock it <span className="small mute">— never use this goal’s money to cover other shortfalls</span>
          </span>
        </label>
        <button type="submit" className="primary wide">
          Create goal
        </button>
      </form>
    </Sheet>
  );
}
