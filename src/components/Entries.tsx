import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { allBuckets, available, computeMonth, coverOptions, sources, type MonthResult, type Source } from '../lib/calc';
import { dayLabel, fmt, monthOf, num } from '../lib/format';
import { FREE, type Data, type Entry } from '../lib/types';
import { newEntryId, useDispatch } from '../state/store';
import { Lock, Money } from './ui';

function defaultDate(view: string, today: string) {
  return monthOf(today) === view ? today : `${view}-01`;
}

/** Keep the date field in the viewed month unless the person picked a date there already. */
function useDateForView(view: string, today: string) {
  const [date, setDate] = useState(defaultDate(view, today));
  useEffect(() => {
    setDate((d) => (monthOf(d) === view ? d : defaultDate(view, today)));
  }, [view, today]);
  return [date, setDate] as const;
}

type Shortfall = { from: Source; amt: number; have: number; short: number; options: Source[]; note: string; date: string };

export function AddExpense({ data, r, today }: { data: Data; r: MonthResult; today: string }) {
  const dispatch = useDispatch();
  const [amt, setAmt] = useState('');
  const [from, setFrom] = useState(FREE);
  const [note, setNote] = useState('');
  const [date, setDate] = useDateForView(r.month, today);
  const [warn, setWarn] = useState<Shortfall | null>(null);
  const amtRef = useRef<HTMLInputElement>(null);

  const srcs = sources(r);
  const spendable = srcs.filter((s) => s.kind !== 'fund' || r.funds.find((f) => f.id === s.id)?.active || s.available > 0);
  useEffect(() => {
    if (!srcs.some((s) => s.id === from)) setFrom(FREE);
  }, [srcs, from]);

  const save = (entries: Entry[]) => {
    dispatch({ type: 'addEntries', entries });
    setAmt('');
    setNote('');
    setWarn(null);
    amtRef.current?.focus();
  };

  const add = () => {
    setWarn(null);
    const a = num(amt);
    if (a <= 0) return amtRef.current?.focus();
    const at = computeMonth(data, monthOf(date));
    const src = sources(at).find((s) => s.id === from) ?? sources(at)[0];
    const av = available(at, src.id);
    const entry: Entry = { id: newEntryId(), date, amt: a, from: src.id, note: note.trim() };
    if (av >= a) return save([entry]);
    const have = Math.max(av, 0);
    const short = a - have;
    setWarn({ from: src, amt: a, have, short, options: coverOptions(at, src.id, short), note: note.trim(), date });
  };

  const cover = (w: Shortfall, by: Source) => {
    const entries: Entry[] = [];
    if (w.have > 0) entries.push({ id: newEntryId(), date: w.date, amt: w.have, from: w.from.id, note: w.note });
    entries.push({ id: newEntryId() + 1, date: w.date, amt: w.short, from: by.id, note: `${w.note} (covers ${w.from.name})`.trim() });
    save(entries);
  };

  const onEnter = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      add();
    }
  };

  const groups: [string, Source[]][] = [
    ['Spending', spendable.filter((s) => s.kind !== 'fund')],
    ['Savings (withdrawal)', spendable.filter((s) => s.kind === 'fund')],
  ];

  return (
    <section className="card">
      <h2>Add an expense</h2>
      <div className="form">
        <input ref={amtRef} type="number" inputMode="decimal" min={0} step="any" placeholder="Amount (₹)" aria-label="Amount (₹)" value={amt} onChange={(e) => setAmt(e.target.value)} onKeyDown={onEnter} />
        <select aria-label="Spend from" value={from} onChange={(e) => setFrom(e.target.value)}>
          {groups.map(([label, list]) =>
            list.length ? (
              <optgroup key={label} label={label}>
                {list.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({fmt(s.available)}){s.locked ? ' 🔒' : ''}
                  </option>
                ))}
              </optgroup>
            ) : null,
          )}
        </select>
        <input type="text" placeholder="What for (lunch, Zomato, Myntra...)" aria-label="What for" value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={onEnter} />
        <input type="date" aria-label="Date" min={`${data.start}-01`} value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
        <button type="button" className="primary" onClick={add}>
          Add expense
        </button>
      </div>
      <div aria-live="polite">
        {warn && (
          <div className="warn">
            <p>
              {warn.from.name} has {fmt(warn.have)} left and this expense is {fmt(warn.amt)}. {warn.have > 0 && `The ${fmt(warn.have)} will come from it. `}
              Pay the remaining {fmt(warn.short)} from{warn.options.length ? '' : ' (nothing unlocked has enough)'}:
            </p>
            <div className="btnrow">
              {warn.options.map((o) => (
                <button key={o.id} type="button" className={o.id === FREE ? 'primary' : ''} onClick={() => cover(warn, o)}>
                  {o.name} ({fmt(o.available)} left)
                </button>
              ))}
              <button type="button" onClick={() => save([{ id: newEntryId(), date: warn.date, amt: warn.amt, from: warn.from.id, note: warn.note }])}>
                Keep it in {warn.from.name} (goes negative)
              </button>
              <button type="button" onClick={() => setWarn(null)}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

/** Move money between pots, e.g. from free spending into a goal. */
export function MoveMoney({ data, r, today }: { data: Data; r: MonthResult; today: string }) {
  const dispatch = useDispatch();
  const srcs = sources(r);
  const fromList = srcs.filter((s) => !s.locked && (s.kind !== 'fund' || s.available > 0));
  const [from, setFrom] = useState(FREE);
  const toList = srcs.filter((s) => s.id !== from && (s.kind !== 'fund' || r.funds.find((f) => f.id === s.id)?.active));
  const [to, setTo] = useState('');
  const [amt, setAmt] = useState('');
  const [date, setDate] = useDateForView(r.month, today);
  const [confirm, setConfirm] = useState(false);

  const toId = toList.some((s) => s.id === to) ? to : (toList.find((s) => s.kind === 'fund') ?? toList[0])?.id;
  const a = num(amt);
  const avail = useMemo(() => (a > 0 ? available(computeMonth(data, monthOf(date)), from) : 0), [data, date, from, a]);

  const doMove = () => {
    if (a <= 0 || !toId) return;
    if (avail < a && !confirm) return setConfirm(true);
    dispatch({ type: 'addEntries', entries: [{ id: newEntryId(), date, amt: a, from, to: toId, note: '' }], msg: 'Money moved' });
    setAmt('');
    setConfirm(false);
  };

  return (
    <details className="card">
      <summary>
        <h2>Move money</h2>
        <span className="small mute">e.g. put spare free money into a goal</span>
      </summary>
      <div className="form move">
        <input type="number" inputMode="decimal" min={0} step="any" placeholder="Amount (₹)" aria-label="Amount to move" value={amt} onChange={(e) => { setAmt(e.target.value); setConfirm(false); }} />
        <label className="small mute">
          From
          <select value={from} onChange={(e) => { setFrom(e.target.value); setConfirm(false); }}>
            {fromList.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({fmt(s.available)})
              </option>
            ))}
          </select>
        </label>
        <label className="small mute">
          To
          <select value={toId} onChange={(e) => setTo(e.target.value)}>
            {toList.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <input type="date" aria-label="Date" min={`${data.start}-01`} value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
        <button type="button" className="primary" onClick={doMove}>
          {confirm ? 'Move anyway' : 'Move'}
        </button>
      </div>
      {confirm && (
        <p className="small neg" aria-live="polite">
          That source only has {fmt(avail)}. Moving {fmt(a)} will take it negative.
        </p>
      )}
      <p className="small mute">Locked pots can’t be moved out of. To start a new goal, add it under Monthly plan → Savings funds & goals.</p>
    </details>
  );
}

export function Allowances({ r }: { r: MonthResult }) {
  const rows = [...r.allowances, r.free];
  return (
    <section className="card">
      <h2>Allowances</h2>
      {rows.map((p) => {
        const avail = p.al + p.cin + p.movedIn;
        const out = p.spent + p.movedOut;
        const pct = avail > 0 ? Math.min(100, (out / avail) * 100) : out > 0 ? 100 : 0;
        return (
          <div key={p.id} className="allow">
            <div className="allowname">
              <div>
                {p.name} <Lock on={p.locked} />
              </div>
              {p.hint && <div className="small mute">{p.hint}</div>}
            </div>
            <div className="track" aria-hidden>
              <div className={`fill ${Math.round(p.left) < 0 ? 'over' : ''}`} style={{ width: `${pct}%` }} />
            </div>
            <div className="allowamt">
              <div>
                <Money n={p.left} /> left
              </div>
              <div className="small mute">
                {fmt(p.spent)} of {fmt(p.al)}
                {Math.round(p.cin) !== 0 && ` ${p.cin > 0 ? '+' : '−'} ${fmt(Math.abs(p.cin))} carried`}
                {p.movedIn > 0 && ` + ${fmt(p.movedIn)} moved in`}
                {p.movedOut > 0 && ` − ${fmt(p.movedOut)} moved out`}
              </div>
            </div>
          </div>
        );
      })}
    </section>
  );
}

export function EntryList({ data, view }: { data: Data; view: string }) {
  const dispatch = useDispatch();
  const names = allBuckets(data);
  const name = (id: string) => (id === FREE ? 'Free spending' : names.get(id)?.name ?? id);
  const isFund = (id: string) => names.get(id)?.kind === 'fund';
  const list = data.entries
    .filter((e) => monthOf(e.date) === view)
    .sort((a, b) => (a.date === b.date ? b.id - a.id : a.date < b.date ? 1 : -1));
  return (
    <section className="card">
      <h2>Expenses</h2>
      {!list.length && <p className="mute">No expenses yet. Add your first one above.</p>}
      <ul className="entries">
        {list.map((e) => (
          <li key={e.id}>
            <span className="mute">{dayLabel(e.date)}</span>
            <span>
              {e.to ? (
                <>
                  {name(e.from)} → {name(e.to)} <span className="tag">(moved)</span>
                </>
              ) : (
                <>
                  {name(e.from)} {isFund(e.from) && <span className="tag">(withdrawal)</span>}
                </>
              )}
              {e.note && <div className="small mute">{e.note}</div>}
            </span>
            <strong className="tnum">{fmt(e.amt)}</strong>
            <button type="button" className="del" aria-label="Delete entry" onClick={() => dispatch({ type: 'deleteEntry', id: e.id })}>
              ✕
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
