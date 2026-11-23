import { useRef, useState } from 'react';
import type { MonthResult } from '../lib/calc';
import { fmt, monthLabel, todayISO } from '../lib/format';
import { newId } from '../lib/plan';
import { exportFile, normalize } from '../lib/storage';
import type { Bucket, Data, Kind } from '../lib/types';
import { useDispatch } from '../state/store';
import { Money, NumberField, TextField } from './ui';

const GROUPS: { kind: Kind; title: string; help: string; add: string; newName: string; lockable: boolean }[] = [
  { kind: 'fixed', title: 'Fixed costs', help: 'Bills you pay every month. If one is different this month, change it below under “This month only”.', add: 'Add a bill', newName: 'New bill', lockable: false },
  { kind: 'invest', title: 'Investments', help: 'Set aside and gone, like it was never there. Always locked — never spendable.', add: 'Add an investment', newName: 'New investment', lockable: false },
  { kind: 'fund', title: 'Savings funds', help: 'Get a fixed amount every month. With a target, they stop when full and ask where the money goes next.', add: 'Add a savings fund', newName: 'New fund', lockable: true },
  { kind: 'allowance', title: 'Allowances', help: 'Monthly budgets for regular spending. What you don’t use carries over to next month.', add: 'Add an allowance', newName: 'New allowance', lockable: true },
];

function Row({ b, from, data }: { b: Bucket; from: string; data: Data }) {
  const dispatch = useDispatch();
  const [confirm, setConfirm] = useState(false);
  const update = (patch: Partial<Bucket>) => dispatch({ type: 'plan', from, op: { type: 'update', id: b.id, patch } });
  const lockable = b.kind === 'fund' || b.kind === 'allowance';
  return (
    <div className={`prow ${b.kind === 'fund' ? 'prow-fund' : ''}`}>
      <TextField className="pname" aria-label="Name" value={b.name} onValue={(name) => update({ name })} />
      <label className="money-in">
        <span className="small mute">{b.kind === 'fund' ? 'Monthly' : 'Amount'}</span>
        <span className="rupee">
          ₹<NumberField aria-label={`${b.name} amount`} value={b.amount} onValue={(n) => update({ amount: n ?? 0 })} />
        </span>
      </label>
      {b.kind === 'fund' && (
        <>
          <label className="money-in">
            <span className="small mute">Stop at</span>
            <span className="rupee">
              ₹<NumberField aria-label={`${b.name} target`} placeholder="no limit" nullable value={b.target ?? null} onValue={(n) => update({ target: n ?? undefined, targetAck: false })} />
            </span>
          </label>
          <label className="money-in">
            <span className="small mute">Already have</span>
            <span className="rupee">
              ₹<NumberField aria-label={`${b.name} already saved`} value={data.opening[b.id] ?? 0} onValue={(n) => dispatch({ type: 'opening', id: b.id, value: n ?? 0 })} />
            </span>
          </label>
        </>
      )}
      <div className="pactions">
        {lockable ? (
          <button
            type="button"
            className={`pill lockbtn ${b.locked ? 'on' : ''}`}
            aria-pressed={!!b.locked}
            title={b.locked ? 'Locked: never used to cover other shortfalls. Click to unlock.' : 'Unlocked: can cover other shortfalls. Click to lock.'}
            onClick={() => update({ locked: !b.locked })}
          >
            {b.locked ? '🔒 Locked' : 'Unlocked'}
          </button>
        ) : (
          b.kind === 'invest' && <span className="pill lockbtn on static" title="Investments are always locked">🔒 Locked</span>
        )}
        {confirm ? (
          <>
            <button type="button" className="danger small" onClick={() => dispatch({ type: 'plan', from, op: { type: 'remove', id: b.id } })}>
              Remove
            </button>
            <button type="button" className="small" onClick={() => setConfirm(false)}>
              Keep
            </button>
          </>
        ) : (
          <button type="button" className="icon" aria-label={`Remove ${b.name}`} onClick={() => setConfirm(true)}>
            ✕
          </button>
        )}
      </div>
    </div>
  );
}

export function PlanTab({ data, r }: { data: Data; r: MonthResult }) {
  const dispatch = useDispatch();
  const from = r.month;
  const plan = r.plan;
  const free = r.free.al;
  return (
    <>
      <p className="notice">
        Your monthly plan from <strong>{monthLabel(from)}</strong> onward. Changes don’t touch earlier months. 🔒 = locked: never used to cover a shortfall somewhere else.
      </p>

      <section className="card waterfall">
        <div className="wrow wtop">
          <span className="wlabel">Salary</span>
          <span className="rupee big-in">
            ₹<NumberField aria-label="Salary" value={plan.salary} onValue={(n) => dispatch({ type: 'plan', from, op: { type: 'salary', value: n ?? 0 } })} />
          </span>
        </div>
      </section>

      {GROUPS.map((g) => {
        const list = plan.buckets.filter((b) => b.kind === g.kind);
        const total = list.reduce((s, b) => s + b.amount, 0);
        return (
          <section key={g.kind} className={`card pgroup pg-${g.kind}`}>
            <div className="pghead">
              <h3>{g.title}</h3>
              <span className="pgtotal">−{fmt(total)}</span>
            </div>
            <p className="small mute">{g.help}</p>
            {list.map((b) => (
              <Row key={b.id} b={b} from={from} data={data} />
            ))}
            <button
              type="button"
              className="addrow"
              onClick={() => dispatch({ type: 'plan', from, op: { type: 'add', bucket: { id: newId(g.kind), kind: g.kind, name: g.newName, amount: 0, locked: g.kind === 'invest' || undefined } } })}
            >
              ＋ {g.add}
            </button>
          </section>
        );
      })}

      <section className={`card result ${free < 0 ? 'result-neg' : ''}`}>
        <div className="wrow">
          <span className="wlabel">= Free spending</span>
          <Money n={free} className="resultamt" />
        </div>
        <p className="small mute">
          {free < 0 ? 'Your plan uses more than your salary. Lower something above.' : 'Whatever is left goes here: food, shopping, fun — your money to spend without guilt. Goals are filled from here (Goals tab).'}
        </p>
      </section>

      <ThisMonth r={r} />
      <Settings data={data} />
    </>
  );
}

function ThisMonth({ r }: { r: MonthResult }) {
  const dispatch = useDispatch();
  const row = (key: string, label: string, value: number, def: number, overridden: boolean) => (
    <div className="wrow" key={key}>
      <span>
        {label}
        <span className="small mute block">usually {fmt(def)}</span>
      </span>
      <span className="ovctl">
        <span className="rupee">
          ₹<NumberField aria-label={`${label} in ${monthLabel(r.month)}`} nullable placeholder={String(def)} value={overridden ? value : null} onValue={(n) => dispatch({ type: 'override', month: r.month, key, value: n })} />
        </span>
        {overridden && (
          <button type="button" className="small" onClick={() => dispatch({ type: 'override', month: r.month, key, value: null })}>
            Reset
          </button>
        )}
      </span>
    </div>
  );
  return (
    <section className="card">
      <h3>This month only · {monthLabel(r.month)}</h3>
      <p className="small mute">Salary or a bill different just this month? Type it here. Leave empty to use the usual amount.</p>
      {row('salary', 'Salary', r.salary, r.plan.salary, r.salaryOverridden)}
      {r.fixed.map((f) => row(f.id, f.name, f.amount, f.def, f.overridden))}
    </section>
  );
}

function Settings({ data }: { data: Data }) {
  const dispatch = useDispatch();
  const file = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Data | null>(null);
  const [err, setErr] = useState('');
  return (
    <section className="card">
      <h3>Settings & backup</h3>
      <label className="wrow">
        <span>
          Tracking starts
          <span className="small mute block">carry-over and savings count from here</span>
        </span>
        <input type="month" className="auto" value={data.start} onChange={(e) => e.target.value && dispatch({ type: 'start', month: e.target.value })} />
      </label>
      <div className="wrow">
        <span>
          Backup
          <span className="small mute block">your data lives in this browser — keep a copy</span>
        </span>
        <span className="btnrow">
          <button type="button" onClick={() => exportFile(data, todayISO())}>
            Export
          </button>
          <button type="button" onClick={() => file.current?.click()}>
            Import
          </button>
        </span>
        <input
          ref={file}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            try {
              setErr('');
              setPending(normalize(JSON.parse(await f.text())));
            } catch (x) {
              setErr(x instanceof Error ? x.message : 'Could not read that file');
            }
          }}
        />
      </div>
      {err && <p className="small neg">{err}</p>}
      {pending && (
        <div className="warn">
          <p>
            This backup has {pending.entries.length} entries starting {monthLabel(pending.start)}. Replace everything in the app with it?
          </p>
          <div className="btnrow">
            <button type="button" className="danger" onClick={() => { dispatch({ type: 'replace', data: pending, view: todayISO().slice(0, 7), label: 'imported a backup' }); setPending(null); }}>
              Replace my data
            </button>
            <button type="button" onClick={() => setPending(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
