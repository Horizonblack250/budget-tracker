import type { Session } from '@supabase/supabase-js';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Login } from './components/Login';
import { Goals } from './components/Goals';
import { History } from './components/History';
import { Home } from './components/Home';
import { PlanTab } from './components/PlanTab';
import { AddMoneySheet, ExpenseSheet, NewGoalSheet } from './components/Sheets';
import { UndoToast } from './components/ui';
import { computeMonths } from './lib/calc';
import { defaultData } from './lib/defaults';
import { addMonths, monthLabel, todayISO } from './lib/format';
import { localBackend } from './lib/storage';
import { supabase } from './lib/supabase';
import { SyncEngine, type SyncStatus } from './lib/sync';
import type { Data } from './lib/types';
import { DispatchCtx, reducer } from './state/store';
import { UICtx, type SheetState, type Tab } from './state/ui';

const STATUS: Record<SyncStatus, string> = {
  synced: 'synced ✓',
  syncing: 'syncing…',
  offline: 'offline · will sync later',
  error: 'sync problem · saved on this device',
};

export type Account = { email: string; unsynced: boolean; signOut: () => Promise<void> };

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

/** Signs you in when Supabase is set up; otherwise runs local-only. */
export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(supabase ? undefined : null);
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  if (!supabase) return <Budget />;
  if (session === undefined) return null;
  if (!session) return <Login db={supabase} />;
  return <Budget key={session.user.id} userId={session.user.id} email={session.user.email ?? ''} />;
}

function Budget({ userId, email }: { userId?: string; email?: string }) {
  const today = useToday();
  const [state, dispatch] = useReducer(reducer, null, () => {
    const data = defaultData();
    const now = todayISO().slice(0, 7);
    return { data, view: now < data.start ? data.start : now, past: [], toast: null };
  });
  const [loaded, setLoaded] = useState(false);
  const [sync, setSyncState] = useState<SyncStatus | null>(null);
  const [syncDetail, setSyncDetail] = useState('');
  const [showSync, setShowSync] = useState(false);
  const setSync = useCallback((s: SyncStatus, detail?: string) => {
    setSyncState(s);
    if (s === 'synced') setSyncDetail('');
    else if (detail) setSyncDetail(detail);
  }, []);
  const [tab, setTab] = useState<Tab>('home');
  const [sheet, setSheet] = useState<SheetState>(null);
  const engine = useRef<SyncEngine | null>(null);
  /** The data last loaded from storage: no need to save it straight back. */
  const loadedData = useRef<Data | null>(null);
  const viewRef = useRef(state.view);
  viewRef.current = state.view;

  useEffect(() => {
    const show = (d: Data | null) => {
      if (d) {
        loadedData.current = d;
        dispatch({ type: 'replace', data: d, view: todayISO().slice(0, 7) });
      } else loadedData.current = state.data;
    };
    if (supabase && userId) {
      const e = new SyncEngine(supabase, userId, setSync, (d) => {
        loadedData.current = d;
        dispatch({ type: 'replace', data: d, view: viewRef.current });
      });
      engine.current = e;
      e.init().then((d) => {
        show(d);
        setLoaded(true);
      });
      return () => e.dispose();
    }
    localBackend.load().then((d) => {
      show(d);
      setLoaded(true);
    });
    // Runs once per signed-in user (the component is keyed by user id).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!loaded || state.data === loadedData.current) return;
    if (engine.current) engine.current.save(state.data);
    else void localBackend.save(state.data);
  }, [state.data, loaded]);

  const account: Account | undefined = useMemo(
    () =>
      supabase && email
        ? {
            email,
            unsynced: sync !== 'synced',
            signOut: async () => {
              engine.current?.dispose();
              SyncEngine.clearDevice();
              await supabase!.auth.signOut();
            },
          }
        : undefined,
    [email, sync],
  );
  const statusText = sync ? STATUS[sync] : localBackend.label;

  const months = useMemo(() => computeMonths(state.data, state.view), [state.data, state.view]);
  const r = months[months.length - 1];
  const closeSheet = useCallback(() => setSheet(null), []);
  const dismissToast = useCallback(() => dispatch({ type: 'dismissToast' }), []);
  const lastStep = state.past[state.past.length - 1];

  // Ctrl/Cmd+Z undoes the last change (but not while typing in a field).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'z' && !el.closest('input, textarea, select')) {
        e.preventDefault();
        dispatch({ type: 'undo' });
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  const ui = useMemo(() => ({ setTab: (t: Tab) => { setTab(t); window.scrollTo(0, 0); }, openSheet: setSheet }), []);
  const nowMonth = today.slice(0, 7);

  if (!loaded) return null;
  return (
    <DispatchCtx.Provider value={dispatch}>
      <UICtx.Provider value={ui}>
        <div className="shell">
          <div className="stickytop">
          <header className="topbar">
            <div className="brand">
              <span className="logo" aria-hidden>₹</span>
              <span>
                Monthly budget
                {sync ? (
                  <button type="button" className={`status statusbtn ${sync === 'error' ? 'neg' : ''}`} onClick={() => setShowSync((x) => !x)} aria-expanded={showSync}>
                    {statusText} ▾
                  </button>
                ) : (
                  <span className="status">{statusText}</span>
                )}
              </span>
            </div>
            <button
              type="button"
              className="undobtn"
              disabled={!lastStep}
              onClick={() => dispatch({ type: 'undo' })}
              title={lastStep ? `Undo: ${lastStep.label} (Ctrl/⌘+Z)` : 'Nothing to undo'}
              aria-label={lastStep ? `Undo: ${lastStep.label}` : 'Nothing to undo'}
            >
              <span aria-hidden>↶</span>
              <span className="undotext">{lastStep ? `Undo: ${lastStep.label}` : 'Undo'}</span>
            </button>
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
          {showSync && sync && (
            <div className={`card syncpanel ${sync === 'error' ? 'syncpanel-err' : ''}`} role="status">
              <p>
                <strong>{STATUS[sync]}</strong>
                {email && <span className="small mute block">Signed in as {email} · account {userId?.slice(0, 8)}</span>}
              </p>
              {syncDetail && (
                <p className="small">
                  Details: <code>{syncDetail}</code>
                </p>
              )}
              <p className="small mute">Your changes are always saved on this device first, then sent online. Changes from your other devices arrive when you come back to the app, or within about 15 seconds.</p>
              <div className="btnrow">
                <button type="button" className="primary" onClick={() => void engine.current?.syncNow()}>
                  Sync now
                </button>
                <button type="button" onClick={() => setShowSync(false)}>
                  Close
                </button>
              </div>
            </div>
          )}

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
          </div>

          <main className="content">
            {tab === 'home' && <Home data={state.data} r={r} today={today} />}
            {tab === 'goals' && <Goals months={months} today={today} />}
            {tab === 'history' && <History data={state.data} view={state.view} />}
            {tab === 'plan' && <PlanTab data={state.data} r={r} account={account} />}
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
        {state.toast && <UndoToast msg={state.toast.msg} stamp={state.toast.key} onUndo={state.toast.canUndo && lastStep ? () => dispatch({ type: 'undo' }) : undefined} onDone={dismissToast} />}
      </UICtx.Provider>
    </DispatchCtx.Provider>
  );
}
