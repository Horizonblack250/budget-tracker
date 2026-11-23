import { createContext, useContext } from 'react';

export type Tab = 'home' | 'goals' | 'plan' | 'history';

export type SheetState =
  | { type: 'expense'; from?: string }
  | { type: 'addMoney'; to: string }
  | { type: 'newGoal' }
  | null;

export type UI = {
  setTab: (t: Tab) => void;
  openSheet: (s: SheetState) => void;
};

export const UICtx = createContext<UI>({ setTab: () => {}, openSheet: () => {} });
export const useUI = () => useContext(UICtx);
