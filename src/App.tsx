import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Goals } from './components/Goals';
import { History } from './components/History';
import { Home } from './components/Home';
import { PlanTab } from './components/PlanTab';
import { AddMoneySheet, ExpenseSheet, NewGoalSheet } from './components/Sheets';
import { UndoToast } from './components/ui';
import { computeMonths } from './lib/calc';
import { defaultData } from './lib/defaults';
import { addMonths, monthLabel, todayISO } from './lib/format';
import { localBackend, type StorageBackend } from './lib/storage';
import { DispatchCtx, reducer } from './state/store';
import { UICtx, type SheetState, type Tab } from './state/ui';

const backend: StorageBackend = localBackend;

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'home', label: 'Home', icon: '⌂' },
  { id: 'goals', label: 'Goals', icon: '◎' },
  { id: 'history', label: 'History', icon: '≡' },
  { id: 'plan', label: 'Plan', icon: '⚙' },
];

function useToday() {
  const [today, setToday] = useState(todayISO());
  useEffect(() => {
    const t = setInterval(() => setToday(todayISO()), 60_000);
    return () => clearInterval(t);
  }, []);
  return today;
}

export default function App() {
  const today = useToday();
  const [state, dispatch] = useReducer(reducer, null, () => {
    const data = defaultData();
    const now = todayISO().slice(0, 7);
    return { data, view: now < data.start ? data.start : now, undo: null };
  });
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState(backend.label);
  const [tab, setTab] = useState<Tab>('home');
  const [sheet, setSheet] = useState<SheetState>(null);
  const firstSave = useRef(true);

  useEffect(() => {
    backend.load().then((d) => {
      if (d) dispatch({ type: 'replace', data: d, view: todayISO().slice(0, 7) });
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (!loaded) return;
    if (firstSave.current) {
      firstSave.current = false;
      return;
    }
    backend.save(state.data).then(
      () => setStatus(backend.label),
      () => setStatus('couldn’t save!'),
    );
  }, [state.data, loaded]);

  const months = useMemo(() => computeMonths(state.data, state.view), [state.data, state.view]);
  const r = months[months.length - 1];
  const closeSheet = useCallback(() => setSheet(null), []);
  const dismissUndo = useCallback(() => dispatch({ type: 'dismissUndo' }), []);
  const ui = useMemo(() => ({ setTab: (t: Tab) => { setTab(t); window.scrollTo(0, 0); }, openSheet: setSheet }), []);
  const nowMonth = today.slice(0, 7);

  if (!loaded) return null;
  return (
    <DispatchCtx.Provider value={dispatch}>
      <UICtx.Provider value={ui}>
        <div className="shell">
          <header className="topbar">
            <div className="brand">
              <span className="logo" aria-hidden>₹</span>
              <span>
                Monthly budget
                <span className="status">{status}</span>
              </span>
            </div>
            <div className="monthnav">
              <button type="button" className="icon" aria-label="Previous month" disabled={state.view <= state.data.start} onClick={() => dispatch({ type: 'view', month: addMonths(state.view, -1) })}>
                ‹
              </button>
              <span className="monthlabel">{monthLabel(state.view)}</span>
              <button type="button" className="icon" aria-label="Next month" onClick={() => dispatch({ type: 'view', month: addMonths(state.view, 1) })}>
                ›
              </button>
              {state.view !== nowMonth && nowMonth >= state.data.start && (
                <button type="button" className="pill" onClick={() => dispatch({ type: 'view', month: nowMonth })}>
                  Today
                </button>
              )}
            </div>
          </header>

          <nav className="tabs" aria-label="Sections">
            {TABS.map((t) => (
              <button key={t.id} type="button" className={tab === t.id ? 'on' : ''} aria-current={tab === t.id ? 'page' : undefined} onClick={() => ui.setTab(t.id)}>
                <span className="tabicon" aria-hidden>
                  {t.icon}
                </span>
                {t.label}
              </button>
            ))}
          </nav>

          <main className="content">
            {tab === 'home' && <Home data={state.data} r={r} today={today} />}
            {tab === 'goals' && <Goals months={months} today={today} />}
            {tab === 'history' && <History data={state.data} view={state.view} />}
            {tab === 'plan' && <PlanTab data={state.data} r={r} />}
          </main>

          {tab !== 'home' && (
            <button type="button" className="fab" aria-label="Add expense" onClick={() => setSheet({ type: 'expense' })}>
              ＋
            </button>
          )}
        </div>

        {sheet?.type === 'expense' && <ExpenseSheet data={state.data} view={state.view} today={today} initialFrom={sheet.from} onClose={closeSheet} />}
        {sheet?.type === 'addMoney' && <AddMoneySheet data={state.data} view={state.view} today={today} to={sheet.to} onClose={closeSheet} />}
        {sheet?.type === 'newGoal' && <NewGoalSheet r={r} onClose={closeSheet} />}
        {state.undo && <UndoToast msg={state.undo.msg} stamp={state.undo.key} onUndo={() => dispatch({ type: 'undo' })} onDone={dismissUndo} />}
      </UICtx.Provider>
    </DispatchCtx.Provider>
  );
}
