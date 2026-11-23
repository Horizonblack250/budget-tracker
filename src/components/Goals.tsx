import { useState } from 'react';
import { buildup, type FundRow, type MonthResult } from '../lib/calc';
import { fmt, monthLabel, monthOf } from '../lib/format';
import { FREE } from '../lib/types';
import { newEntryId, useDispatch } from '../state/store';
import { useUI } from '../state/ui';
import { MIN_GOAL } from './Sheets';
import { Bar, Lock, Money, NumberField, TextField } from './ui';

export function Goals({ months, today }: { months: MonthResult[]; today: string }) {
  const { openSheet } = useUI();
  const r = months[months.length - 1];
  const goals = r.funds.filter((f) => f.kind === 'goal' && (f.active || Math.round(f.balance) !== 0));
  const funds = r.funds.filter((f) => f.kind === 'fund' && (f.active || Math.round(f.balance) !== 0));
  return (
    <>
      <section className="section">
        <div className="sectionhead">
          <h2>Goals</h2>
          <button type="button" className="primary" onClick={() => openSheet({ type: 'newGoal' })}>
            ＋ New goal
          </button>
        </div>
        {goals.length === 0 && (
          <div className="card emptycard">
            <p className="strong">Saving up for something?</p>
            <p className="mute small">Mom’s phone, a laptop, a trip… Set a target (at least {fmt(MIN_GOAL)}) and add money whenever you have some spare — from free spending or any unlocked allowance.</p>
            <button type="button" className="primary" onClick={() => openSheet({ type: 'newGoal' })}>
              Create your first goal
            </button>
          </div>
        )}
        {goals.map((g) => (
          <GoalCard key={g.id} g={g} months={months} today={today} />
        ))}
      </section>

      <section className="section">
        <div className="sectionhead">
          <h2>Savings funds</h2>
          <span className="small mute">get a fixed amount every month · change it in Plan</span>
        </div>
        {funds.map((f) => (
          <div key={f.id} className="card goal">
            <div className="goalhead">
              <h3>
                {f.name} <Lock on={f.locked} />
              </h3>
              <Money n={f.balance} className="goalamt" />
            </div>
            {f.target > 0 && (
              <>
                <Bar value={f.balance} max={f.target} kind="goal" />
                <div className="small mute row-between">
                  <span>{Math.round(Math.min(100, (f.balance / f.target) * 100))}% of {fmt(f.target)}</span>
                  <span>{f.balance >= f.target ? 'full ✓' : `${fmt(f.target - f.balance)} to go`}</span>
                </div>
              </>
            )}
            <p className="small mute">
              {f.contrib > 0 ? `+${fmt(f.contrib)} from salary in ${monthLabel(r.month)}` : f.planned > 0 ? 'Full — not adding this month' : 'No monthly amount'}
              {f.withdrawn + f.movedOut > 0 && ` · ${fmt(f.withdrawn + f.movedOut)} taken out`}
            </p>
            <div className="btnrow">
              <button type="button" onClick={() => openSheet({ type: 'addMoney', to: f.id })}>
                ＋ Add extra
              </button>
              <button type="button" onClick={() => openSheet({ type: 'expense', from: f.id })}>
                Spend from it
              </button>
            </div>
          </div>
        ))}
      </section>

      {r.invest.length > 0 && (
        <section className="section">
          <div className="sectionhead">
            <h2>Investments</h2>
            <span className="small mute">🔒 set aside and gone</span>
          </div>
          <div className="card list">
            {r.invest.map((i) => (
              <div key={i.id} className="listrow static">
                <span>
                  {i.name}
                  <span className="small mute block">{fmt(i.amount)} a month</span>
                </span>
                <span className="listright">
                  <Money n={i.total} className="strong" />
                  <span className="small mute">invested so far</span>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

function GoalCard({ g, months, today }: { g: FundRow; months: MonthResult[]; today: string }) {
  const { openSheet } = useUI();
  const dispatch = useDispatch();
  const [editing, setEditing] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const r = months[months.length - 1];
  const done = g.target > 0 && g.balance >= g.target;
  const pct = g.target > 0 ? Math.min(100, (g.balance / g.target) * 100) : 0;
  const history = buildup(months, g.id).slice(-6);
  const maxAdded = Math.max(1, ...history.map((h) => h.added));
  const update = (patch: { name?: string; target?: number; locked?: boolean }) =>
    dispatch({ type: 'plan', from: r.month, op: { type: 'update', id: g.id, patch } });
  const remove = () => {
    if (g.balance > 0) {
      const date = monthOf(today) === r.month ? today : `${r.month}-01`;
      dispatch({ type: 'addEntries', entries: [{ id: newEntryId(), date, amt: g.balance, from: g.id, to: FREE, note: `${g.name} closed` }], msg: `${fmt(g.balance)} back to free spending` });
    }
    dispatch({ type: 'plan', from: r.month, op: { type: 'remove', id: g.id } });
  };

  return (
    <div className={`card goal ${done ? 'goal-done' : ''}`}>
      <div className="goalhead">
        <h3>
          {g.name} <Lock on={g.locked} /> {!g.active && <span className="small mute">(closed)</span>}
        </h3>
        <span className="goalamt">
          <Money n={g.balance} />
          {g.target > 0 && <span className="small mute"> / {fmt(g.target)}</span>}
        </span>
      </div>
      <Bar value={g.balance} max={g.target} kind="goal" />
      <div className="small mute row-between">
        <span>{Math.round(pct)}%</span>
        <span>{done ? '🎉 Goal reached!' : `${fmt(g.target - g.balance)} to go`}</span>
      </div>

      {history.some((h) => h.added > 0 || h.taken > 0) && (
        <div className="buildup" aria-label="Monthly buildup">
          {history.map((h) => (
            <div key={h.month} className="bcol" title={`${monthLabel(h.month)}: +${fmt(h.added)}${h.taken ? `, −${fmt(h.taken)}` : ''}`}>
              <span className="bval">{h.added > 0 ? fmt(h.added) : ''}</span>
              <span className="bbar" style={{ height: `${(h.added / maxAdded) * 100}%` }} />
              <span className="blabel">{monthLabel(h.month).slice(0, 3)}</span>
            </div>
          ))}
        </div>
      )}

      {g.active && (
        <div className="btnrow">
          {!done && (
            <button type="button" className="primary" onClick={() => openSheet({ type: 'addMoney', to: g.id })}>
              ＋ Add money
            </button>
          )}
          {g.balance > 0 && (
            <button type="button" onClick={() => openSheet({ type: 'expense', from: g.id })}>
              Spend from it
            </button>
          )}
          <button type="button" className="ghost" onClick={() => setEditing((x) => !x)} aria-expanded={editing}>
            {editing ? 'Done' : 'Edit'}
          </button>
        </div>
      )}

      {editing && (
        <div className="editbox">
          <label className="field-label">
            Name
            <TextField className="field" value={g.name} onValue={(name) => update({ name })} />
          </label>
          <label className="field-label">
            Target ₹ <span className="small mute">(at least {fmt(MIN_GOAL)})</span>
            <NumberField className="field" value={g.target} onValue={(n) => update({ target: Math.max(MIN_GOAL, n ?? 0) })} />
          </label>
          <label className="toggle">
            <input type="checkbox" checked={g.locked} onChange={(e) => update({ locked: e.target.checked })} />
            <span>🔒 Locked <span className="small mute">— never used to cover other shortfalls</span></span>
          </label>
          {confirmRemove ? (
            <div className="warn">
              <p className="small">
                Remove {g.name}?{g.balance > 0 && ` Its ${fmt(g.balance)} goes back to free spending.`}
              </p>
              <div className="btnrow">
                <button type="button" className="danger" onClick={remove}>
                  Remove goal
                </button>
                <button type="button" onClick={() => setConfirmRemove(false)}>
                  Keep it
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className="danger ghost" onClick={() => setConfirmRemove(true)}>
              Remove goal…
            </button>
          )}
        </div>
      )}
    </div>
  );
}
