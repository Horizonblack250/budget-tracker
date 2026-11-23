import { useState } from 'react';
import { targetPrompts, type MonthResult } from '../lib/calc';
import { addMonths, daysInMonth, fmt, monthLabel } from '../lib/format';
import { newId } from '../lib/plan';
import { useDispatch } from '../state/store';
import { Lock, Money, NumberField } from './ui';

export function Header({ view, start, status }: { view: string; start: string; status: string }) {
  const dispatch = useDispatch();
  return (
    <header className="header">
      <h1>
        Monthly budget <span className="status">· {status}</span>
      </h1>
      <nav className="monthnav">
        <button type="button" aria-label="Previous month" disabled={view <= start} onClick={() => dispatch({ type: 'view', month: addMonths(view, -1) })}>
          ‹
        </button>
        <span className="monthlabel">{monthLabel(view)}</span>
        <button type="button" aria-label="Next month" onClick={() => dispatch({ type: 'view', month: addMonths(view, 1) })}>
          ›
        </button>
      </nav>
    </header>
  );
}

export function Hero({ r, today }: { r: MonthResult; today: string }) {
  const left = r.free.left;
  let sub = left < 0 ? 'over your free spending money' : 'left to spend freely';
  if (today.slice(0, 7) === r.month && left > 0) {
    const n = daysInMonth(r.month) - Number(today.slice(8, 10)) + 1;
    sub += ` · about ${fmt(left / n)} a day for ${n} more day${n === 1 ? '' : 's'}`;
  }
  const t = r.totals;
  const spent = Math.min(r.free.spent, Math.max(r.free.al, 0));
  const over = r.free.al >= 0 && r.free.spent > r.free.al ? r.free.spent - r.free.al : 0;
  const base = Math.max(r.salary, t.fixed + t.invest + t.savings + t.allowances + r.free.spent, 1);
  const segs = [
    { name: 'Fixed costs', v: t.fixed, c: 'var(--rent)' },
    { name: 'Investments', v: t.invest, c: 'var(--sip)' },
    { name: 'Savings', v: t.savings, c: 'var(--ef)' },
    { name: 'Allowances', v: t.allowances, c: 'var(--allow)' },
    { name: 'Spent freely', v: spent, c: 'var(--spent)' },
  ];
  return (
    <section className="hero" aria-live="polite">
      <div className={`headline ${Math.round(left) < 0 ? 'neg' : ''}`}>{fmt(left)}</div>
      <div className="mute">{sub}</div>
      <div className="bar" role="img" aria-label="How this month’s salary is split">
        {segs.map((s) => (s.v > 0 ? <span key={s.name} title={`${s.name} ${fmt(s.v)}`} style={{ width: `${(s.v / base) * 100}%`, background: s.c }} /> : null))}
        {over > 0 && <span title={`Over ${fmt(over)}`} style={{ width: `${(over / base) * 100}%`, background: 'var(--over)' }} />}
      </div>
      <ul className="legend">
        {segs.map((s) => (
          <li key={s.name}>
            <i style={{ background: s.c }} /> {s.name} {fmt(s.v)}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** "Your emergency fund is full — where should its money go?" */
export function TargetPrompts({ r }: { r: MonthResult }) {
  const dispatch = useDispatch();
  const [goalFor, setGoalFor] = useState<string | null>(null);
  const [goalName, setGoalName] = useState('');
  const [goalTarget, setGoalTarget] = useState<number | null>(null);
  const prompts = targetPrompts(r);
  if (!prompts.length) return null;
  const from = r.month;
  return (
    <>
      {prompts.map((f) => {
        const others = r.funds.filter((o) => o.active && o.id !== f.id);
        return (
          <section key={f.id} className="card prompt" aria-live="polite">
            <p>
              <strong>{f.name}</strong> has reached its {fmt(f.target)} target 🎉 Its {fmt(f.planned)} a month is going to free spending for now.
              Where should it go from {monthLabel(from)}?
            </p>
            <div className="btnrow">
              {others.map((o) => (
                <button key={o.id} type="button" onClick={() => dispatch({ type: 'plan', from, op: { type: 'redirect', fromId: f.id, toId: o.id, amount: f.planned } })}>
                  Into {o.name}
                </button>
              ))}
              <button type="button" onClick={() => { setGoalFor(f.id); setGoalName(''); setGoalTarget(null); }}>
                Start a new goal
              </button>
              <button type="button" onClick={() => dispatch({ type: 'plan', from, op: { type: 'update', id: f.id, patch: { targetAck: true } } })}>
                Keep it as free spending
              </button>
            </div>
            {goalFor === f.id && (
              <form
                className="inlineform"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!goalName.trim()) return;
                  const id = newId('fund');
                  dispatch({ type: 'plan', from, op: { type: 'add', bucket: { id, kind: 'fund', name: goalName.trim(), amount: 0, target: goalTarget ?? undefined } } });
                  dispatch({ type: 'plan', from, op: { type: 'redirect', fromId: f.id, toId: id, amount: f.planned } });
                  setGoalFor(null);
                }}
              >
                <input aria-label="Goal name" placeholder="Goal name (e.g. Education)" value={goalName} onChange={(e) => setGoalName(e.target.value)} autoFocus />
                <NumberField aria-label="Goal target" placeholder="Target ₹ (optional)" value={goalTarget} nullable onValue={setGoalTarget} />
                <button type="submit" className="primary">
                  Create goal with {fmt(f.planned)}/month
                </button>
              </form>
            )}
            <p className="small mute">If you later take money out, it refills automatically up to the target.</p>
          </section>
        );
      })}
    </>
  );
}

export function Summary({ r }: { r: MonthResult }) {
  const dispatch = useDispatch();
  const t = r.totals;
  const stats: [string, number][] = [
    ['Salary', r.salary],
    ['Fixed costs', t.fixed],
    ['Investments', t.invest],
    ['Savings', t.savings],
    ['Allowances', t.allowances],
    ['Free to spend', r.free.al],
    ['Spent freely', r.free.spent],
    ['Carried in', r.free.cin],
  ];
  if (r.free.movedOut) stats.push(['Moved to goals', r.free.movedOut]);
  const ovRow = (key: string, label: string, value: number, def: number, overridden: boolean) => (
    <div className="ovrow" key={key}>
      <label htmlFor={`ov-${key}`}>{label}</label>
      <div className="ovinput">
        <NumberField
          id={`ov-${key}`}
          nullable
          placeholder={`${def} (default)`}
          value={overridden ? value : null}
          onValue={(n) => dispatch({ type: 'override', month: r.month, key, value: n })}
        />
        <button type="button" disabled={!overridden} onClick={() => dispatch({ type: 'override', month: r.month, key, value: null })}>
          Use default
        </button>
      </div>
    </div>
  );
  return (
    <section className="card">
      <div className="stats">
        {stats.map(([k, v]) => (
          <div key={k} className="stat">
            <div className="mute small">{k}</div>
            <Money n={v} className="statv" />
          </div>
        ))}
      </div>
      <h3 className="sub">This month only</h3>
      {ovRow('salary', 'Salary this month', r.salary, r.plan.salary, r.salaryOverridden)}
      {r.fixed.map((f) => ovRow(f.id, `${f.name} this month${f.hint ? ` (${f.hint})` : ''}`, f.amount, f.def, f.overridden))}
    </section>
  );
}

export function Funds({ r }: { r: MonthResult }) {
  return (
    <section className="card">
      <h2>Savings & investments</h2>
      <div className="funds">
        {r.funds.map((f) => {
          const out = f.withdrawn + f.movedOut;
          const pct = f.target > 0 ? Math.min(100, Math.max(0, (f.balance / f.target) * 100)) : null;
          return (
            <div key={f.id} className="fund">
              <div className="mute small">
                {f.name} <Lock on={f.locked} /> {!f.active && '(closed)'}
              </div>
              <Money n={f.balance} className="statv" />
              {pct !== null && (
                <>
                  <div className="track" aria-hidden>
                    <div className="fill goal" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="small mute">
                    {Math.round(pct)}% of {fmt(f.target)}
                  </div>
                </>
              )}
              <div className="small mute">
                {f.contrib > 0 ? `+${fmt(f.contrib)} this month` : f.planned > 0 ? 'target reached, nothing added' : 'no monthly amount'}
                {f.movedIn > 0 && ` · +${fmt(f.movedIn)} moved in`}
              </div>
              <div className="small mute">{out > 0 ? `taken out this month: ${fmt(out)}` : 'nothing taken out this month'}</div>
            </div>
          );
        })}
        {r.invest.map((i) => (
          <div key={i.id} className="fund">
            <div className="mute small">
              {i.name} <Lock on />
            </div>
            <Money n={i.total} className="statv" />
            <div className="small mute">invested since start · {fmt(i.amount)} a month</div>
            <div className="small mute">never spendable</div>
          </div>
        ))}
      </div>
    </section>
  );
}
