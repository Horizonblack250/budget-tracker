import { targetPrompts, type MonthResult, type PotRow } from '../lib/calc';
import { daysInMonth, fmt, monthLabel } from '../lib/format';
import type { Data } from '../lib/types';
import { useDispatch } from '../state/store';
import { useUI } from '../state/ui';
import { EntryRows } from './History';
import { Bar, Lock, Money } from './ui';

export function Home({ data, r, today }: { data: Data; r: MonthResult; today: string }) {
  const { openSheet, setTab } = useUI();
  const recent = data.entries
    .filter((e) => e.date.startsWith(r.month))
    .sort((a, b) => (a.date === b.date ? b.id - a.id : a.date < b.date ? 1 : -1))
    .slice(0, 5);
  const savings = r.funds.filter((f) => f.active || Math.round(f.balance) !== 0);
  return (
    <>
      <Hero r={r} today={today} />
      <button type="button" className="primary wide big" onClick={() => openSheet({ type: 'expense' })}>
        ＋ Add expense
      </button>
      <TargetPrompts r={r} />

      <section className="section">
        <div className="sectionhead">
          <h2>Allowances</h2>
          <span className="small mute">tap one to log a spend</span>
        </div>
        <div className="tiles">
          {r.allowances.map((p) => (
            <AllowanceTile key={p.id} p={p} onClick={() => openSheet({ type: 'expense', from: p.id })} />
          ))}
        </div>
        {!r.allowances.length && (
          <p className="empty">
            No allowances yet. <button type="button" className="link" onClick={() => setTab('plan')}>Add one in Plan</button>
          </p>
        )}
      </section>

      {savings.length > 0 && (
        <section className="section">
          <div className="sectionhead">
            <h2>Savings & goals</h2>
            <button type="button" className="link" onClick={() => setTab('goals')}>
              See all →
            </button>
          </div>
          <div className="card list">
            {savings.map((f) => (
              <button key={f.id} type="button" className="listrow" onClick={() => setTab('goals')}>
                <span>
                  {f.name} <Lock on={f.locked} />
                </span>
                <span className="listright">
                  <Money n={f.balance} className="strong" />
                  {f.target > 0 && <Bar value={f.balance} max={f.target} kind="goal" />}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="section">
        <div className="sectionhead">
          <h2>Recent</h2>
          {recent.length > 0 && (
            <button type="button" className="link" onClick={() => setTab('history')}>
              All of {monthLabel(r.month)} →
            </button>
          )}
        </div>
        <div className="card list">
          {recent.length ? <EntryRows data={data} entries={recent} /> : <p className="empty">Nothing logged in {monthLabel(r.month)} yet.</p>}
        </div>
      </section>
    </>
  );
}

function Hero({ r, today }: { r: MonthResult; today: string }) {
  const left = r.free.left;
  let pace = '';
  if (today.slice(0, 7) === r.month && left > 0) {
    const n = daysInMonth(r.month) - Number(today.slice(8, 10)) + 1;
    pace = `about ${fmt(left / n)} a day for the next ${n} day${n === 1 ? '' : 's'}`;
  }
  const avail = r.free.al + r.free.cin + r.free.movedIn;
  return (
    <section className="hero card" aria-live="polite">
      <div className="herolabel">{left < 0 ? 'Over your free spending by' : 'Free to spend'}</div>
      <div className={`headline ${Math.round(left) < 0 ? 'neg' : ''}`}>{fmt(Math.abs(left))}</div>
      {pace && <div className="mute">{pace}</div>}
      <Bar value={r.free.spent + r.free.movedOut} max={Math.max(avail, 0)} kind={left < 0 ? 'over' : 'acc'} />
      <div className="herofoot small mute">
        <span>
          {fmt(r.free.al)} this month{Math.round(r.free.cin) !== 0 && ` ${r.free.cin > 0 ? '+' : '−'} ${fmt(Math.abs(r.free.cin))} carried over`}
        </span>
        <span>{fmt(r.free.spent)} spent</span>
      </div>
    </section>
  );
}

function AllowanceTile({ p, onClick }: { p: PotRow; onClick: () => void }) {
  const avail = p.al + p.cin + p.movedIn;
  const over = Math.round(p.left) < 0;
  return (
    <button type="button" className={`tile ${over ? 'tile-over' : ''}`} onClick={onClick} aria-label={`${p.name}: ${fmt(p.left)} left. Log a spend`}>
      <span className="tilename">
        {p.name} <Lock on={p.locked} />
      </span>
      <Money n={p.left} className="tileamt" />
      <Bar value={p.spent + p.movedOut} max={Math.max(avail, 0)} kind={over ? 'over' : 'acc'} />
      <span className="small mute">
        of {fmt(p.al)}
        {Math.round(p.cin) !== 0 && ` ${p.cin > 0 ? '+' : '−'}${fmt(Math.abs(p.cin))} carried`}
      </span>
    </button>
  );
}

/** A full savings fund keeps getting its monthly amount; ask where it should go instead. */
function TargetPrompts({ r }: { r: MonthResult }) {
  const dispatch = useDispatch();
  return (
    <>
      {targetPrompts(r).map((f) => (
        <section key={f.id} className="card prompt" aria-live="polite">
          <p>
            🎉 <strong>{f.name}</strong> is full at {fmt(f.target)}. Its {fmt(f.planned)} a month is going to free spending for now. Where should it go from {monthLabel(r.month)}?
          </p>
          <div className="btnrow">
            {r.funds
              .filter((o) => o.kind === 'fund' && o.active && o.id !== f.id)
              .map((o) => (
                <button key={o.id} type="button" onClick={() => dispatch({ type: 'plan', from: r.month, op: { type: 'redirect', fromId: f.id, toId: o.id, amount: f.planned } })}>
                  Into {o.name}
                </button>
              ))}
            <button type="button" onClick={() => dispatch({ type: 'plan', from: r.month, op: { type: 'update', id: f.id, patch: { targetAck: true } } })}>
              Keep it as free spending
            </button>
          </div>
          <p className="small mute">If you take money out later, it tops itself back up to the target.</p>
        </section>
      ))}
    </>
  );
}
