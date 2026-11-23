import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { AddExpense, Allowances, EntryList, MoveMoney } from './components/Entries';
import { Funds, Header, Hero, Summary, TargetPrompts } from './components/Overview';
import { PlanCard } from './components/Plan';
import { UndoToast } from './components/ui';
import { computeMonth } from './lib/calc';
import { defaultData } from './lib/defaults';
import { todayISO } from './lib/format';
import { localBackend, type StorageBackend } from './lib/storage';
import { DispatchCtx, reducer } from './state/store';

const backend: StorageBackend = localBackend;

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
    return { data, view: today.slice(0, 7) < data.start ? data.start : today.slice(0, 7), undo: null };
  });
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState(backend.label);
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
      () => setStatus('could not save!'),
    );
  }, [state.data, loaded]);

  const r = useMemo(() => computeMonth(state.data, state.view), [state.data, state.view]);
  const dismissUndo = useCallback(() => dispatch({ type: 'dismissUndo' }), []);

  if (!loaded) return null;
  return (
    <DispatchCtx.Provider value={dispatch}>
      <main className="app">
        <Header view={state.view} start={state.data.start} status={status} />
        <Hero r={r} today={today} />
        <TargetPrompts r={r} />
        <Summary r={r} />
        <Funds r={r} />
        <AddExpense data={state.data} r={r} today={today} />
        <MoveMoney data={state.data} r={r} today={today} />
        <Allowances r={r} />
        <EntryList data={state.data} view={state.view} />
        <PlanCard data={state.data} r={r} />
      </main>
      {state.undo && <UndoToast msg={state.undo.msg} stamp={state.undo.key} onUndo={() => dispatch({ type: 'undo' })} onDone={dismissUndo} />}
    </DispatchCtx.Provider>
  );
}
