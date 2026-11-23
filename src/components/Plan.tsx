import { useRef, useState } from 'react';
import type { MonthResult } from '../lib/calc';
import { fmt, monthLabel, todayISO } from '../lib/format';
import { newId, type PlanOp } from '../lib/plan';
import { exportFile, normalize } from '../lib/storage';
import type { Bucket, Data, Kind } from '../lib/types';
import { useDispatch } from '../state/store';
import { Money, NumberField, TextField } from './ui';

const SECTIONS: { kind: Kind; title: string; help: string; amountLabel: string; newName: string }[] = [
  { kind: 'fixed', title: 'Fixed costs', help: 'Paid every month. Override any month in the summary above.', amountLabel: 'Monthly cost', newName: 'New bill' },
  { kind: 'invest', title: 'Investments', help: 'Set aside and gone, like it was never there. Always locked, never spendable.', amountLabel: 'Monthly', newName: 'New investment' },
  { kind: 'fund', title: 'Savings funds & goals', help: 'Grow every month. Set a target and the contribution stops when it’s reached; you’ll be asked where the money goes next.', amountLabel: 'Monthly', newName: 'New goal' },
  { kind: 'allowance', title: 'Allowances', help: 'Monthly budgets. Unspent money carries into the same allowance next month; overspending carries as a deficit.', amountLabel: 'Monthly', newName: 'New allowance' },
];

function BucketRow({ b, from, data, isFirst, isLast }: { b: Bucket; from: string; data: Data; isFirst: boolean; isLast: boolean }) {
  const dispatch = useDispatch();
  const [confirmRemove, setConfirmRemove] = useState(false);
  const op = (o: PlanOp) => dispatch({ type: 'plan', from, op: o });
  const update = (patch: Partial<Bucket>) => op({ type: 'update', id: b.id, patch });
  const canLock = b.kind === 'fund' || b.kind === 'allowance';
  return (
    <div className="bucket">
      <TextField className="bname" aria-label="Name" value={b.name} onValue={(name) => update({ name })} />
      <label className="small mute">
        Monthly ₹
        <NumberField aria-label={`${b.name} monthly amount`} value={b.amount} onValue={(n) => update({ amount: n ?? 0 })} />
      </label>
      {b.kind === 'fund' && (
        <>
          <label className="small mute">
            Target ₹
            <NumberField aria-label={`${b.name} target`} placeholder="none" nullable value={b.target ?? null} onValue={(n) => update({ target: n ?? undefined, targetAck: false })} />
          </label>
          <label className="small mute">
            Already saved ₹
            <NumberField aria-label={`${b.name} already saved`} value={data.opening[b.id] ?? 0} onValue={(n) => dispatch({ type: 'opening', id: b.id, value: n ?? 0 })} />
          </label>
        </>
      )}
      <div className="bactions">
        {canLock && (
          <label className="small check" title="Locked pots are never used to cover another pot’s shortfall">
            <input type="checkbox" checked={!!b.locked} onChange={(e) => update({ locked: e.target.checked })} /> 🔒 Locked
          </label>
        )}
        <button type="button" aria-label={`Move ${b.name} up`} disabled={isFirst} onClick={() => op({ type: 'move', id: b.id, dir: -1 })}>
          ↑
        </button>
        <button type="button" aria-label={`Move ${b.name} down`} disabled={isLast} onClick={() => op({ type: 'move', id: b.id, dir: 1 })}>
          ↓
        </button>
        {confirmRemove ? (
          <>
            <button type="button" className="danger" onClick={() => op({ type: 'remove', id: b.id })}>
              Remove
            </button>
            <button type="button" onClick={() => setConfirmRemove(false)}>
              Keep
            </button>
          </>
        ) : (
          <button type="button" aria-label={`Remove ${b.name}`} onClick={() => setConfirmRemove(true)}>
            ✕
          </button>
        )}
      </div>
    </div>
  );
}

export function PlanCard({ data, r }: { data: Data; r: MonthResult }) {
  const dispatch = useDispatch();
  const from = r.month;
  const plan = r.plan;
  return (
    <details className="card plan">
      <summary>
        <h2>Monthly plan</h2>
        <span className="small mute">salary, bills, investments, goals, allowances</span>
      </summary>
      <p className="notice">
        Changes here apply from <strong>{monthLabel(from)}</strong> onward. Earlier months keep their numbers.
      </p>
      <div className="grid2">
        <label className="small mute">
          Salary ₹
          <NumberField value={plan.salary} onValue={(n) => dispatch({ type: 'plan', from, op: { type: 'salary', value: n ?? 0 } })} />
        </label>
        <label className="small mute">
          Start month (carry-forward begins here)
          <input type="month" value={data.start} onChange={(e) => e.target.value && dispatch({ type: 'start', month: e.target.value })} />
        </label>
      </div>
      {SECTIONS.map((s) => {
        const list = plan.buckets.filter((b) => b.kind === s.kind);
        return (
          <div key={s.kind} className="plansec">
            <h3>
              {s.title} <span className="mute small">{fmt(list.reduce((t, b) => t + b.amount, 0))} a month</span>
            </h3>
            <p className="small mute">{s.help}</p>
            {list.map((b, i) => (
              <BucketRow key={b.id} b={b} from={from} data={data} isFirst={i === 0} isLast={i === list.length - 1} />
            ))}
            <button
              type="button"
              className="add"
              onClick={() =>
                dispatch({
                  type: 'plan',
                  from,
                  op: { type: 'add', bucket: { id: newId(s.kind), kind: s.kind, name: s.newName, amount: 0, locked: s.kind === 'invest' ? true : undefined } },
                })
              }
            >
              + Add {s.newName.replace('New ', '').toLowerCase()}
            </button>
          </div>
        );
      })}
      <p className="freeline">
        Everything left goes to <strong>free spending</strong>: <Money n={r.free.al} /> in {monthLabel(from)}.
      </p>
      <Backup data={data} />
    </details>
  );
}

function Backup({ data }: { data: Data }) {
  const dispatch = useDispatch();
  const file = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Data | null>(null);
  const [err, setErr] = useState('');
  return (
    <div className="plansec">
      <h3>Backup</h3>
      <p className="small mute">Your data is saved in this browser. Export a copy now and then.</p>
      <div className="btnrow">
        <button type="button" onClick={() => exportFile(data, todayISO())}>
          Export backup
        </button>
        <button type="button" onClick={() => file.current?.click()}>
          Import backup
        </button>
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
            This backup has {pending.entries.length} entries starting {monthLabel(pending.start)}. Replace everything currently in the app with it?
          </p>
          <div className="btnrow">
            <button type="button" className="danger" onClick={() => { dispatch({ type: 'replace', data: pending, view: todayISO().slice(0, 7) }); setPending(null); }}>
              Replace my data
            </button>
            <button type="button" onClick={() => setPending(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
