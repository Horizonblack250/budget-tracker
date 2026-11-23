import { allBuckets } from '../lib/calc';
import { dayLabel, fmt, monthLabel } from '../lib/format';
import { FREE, type Data, type Entry } from '../lib/types';
import { useDispatch } from '../state/store';
import { useUI } from '../state/ui';

export function EntryRows({ data, entries }: { data: Data; entries: Entry[] }) {
  const dispatch = useDispatch();
  const names = allBuckets(data);
  const name = (id: string) => (id === FREE ? 'Free spending' : names.get(id)?.name ?? id);
  return (
    <ul className="entries">
      {entries.map((e) => (
        <li key={e.id}>
          <span className="edate">{dayLabel(e.date)}</span>
          <span className="emain">
            <span className="etitle">{e.note || (e.to ? `Added to ${name(e.to)}` : name(e.from))}</span>
            <span className="small mute">{e.to ? `${name(e.from)} → ${name(e.to)}` : name(e.from)}</span>
          </span>
          <span className={`eamt ${e.to ? 'moved' : ''}`}>{e.to ? fmt(e.amt) : `−${fmt(e.amt)}`}</span>
          <button type="button" className="icon del" aria-label="Delete entry" onClick={() => dispatch({ type: 'deleteEntry', id: e.id })}>
            ✕
          </button>
        </li>
      ))}
    </ul>
  );
}

export function History({ data, view }: { data: Data; view: string }) {
  const { openSheet } = useUI();
  const list = data.entries
    .filter((e) => e.date.startsWith(view))
    .sort((a, b) => (a.date === b.date ? b.id - a.id : a.date < b.date ? 1 : -1));
  const spent = list.filter((e) => !e.to).reduce((s, e) => s + e.amt, 0);
  const moved = list.filter((e) => e.to).reduce((s, e) => s + e.amt, 0);
  return (
    <section className="section">
      <div className="sectionhead">
        <h2>{monthLabel(view)}</h2>
        <span className="small mute">
          {fmt(spent)} spent{moved > 0 && ` · ${fmt(moved)} saved to goals`}
        </span>
      </div>
      <div className="card list">
        {list.length ? (
          <EntryRows data={data} entries={list} />
        ) : (
          <div className="empty">
            <p>No expenses in {monthLabel(view)} yet.</p>
            <button type="button" className="primary" onClick={() => openSheet({ type: 'expense' })}>
              ＋ Add expense
            </button>
          </div>
        )}
      </div>
      <p className="small mute center">To change an entry, delete it (✕) and add it again. Undo appears for 10 seconds.</p>
    </section>
  );
}
