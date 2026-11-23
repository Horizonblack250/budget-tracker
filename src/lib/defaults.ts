import type { Data, Plan } from './types';

export const DEFAULT_START = '2026-12';

export function defaultPlan(): Plan {
  return {
    salary: 45800,
    buckets: [
      { id: 'rent', kind: 'fixed', name: 'Rent', amount: 15900, hint: 'with electricity, AC etc.' },
      { id: 'sip', kind: 'invest', name: 'Long-term SIP', amount: 5000, locked: true },
      { id: 'emergency', kind: 'fund', name: 'Emergency fund', amount: 5000, target: 50000, locked: true },
      { id: 'travel', kind: 'fund', name: 'Travel fund', amount: 5000, hint: 'trips home, travel' },
      { id: 'office', kind: 'allowance', name: 'Office lunch', amount: 2250, hint: '3 days a week, ~₹150 + buffer' },
      { id: 'phone', kind: 'allowance', name: 'Phone & subscriptions', amount: 1000 },
      { id: 'misc', kind: 'allowance', name: 'Misc', amount: 1500, hint: 'household, odds and ends' },
      { id: 'med', kind: 'allowance', name: 'Medical', amount: 2500 },
    ],
  };
}

export function defaultData(): Data {
  return {
    version: 2,
    start: DEFAULT_START,
    plans: { [DEFAULT_START]: defaultPlan() },
    opening: {},
    ov: {},
    entries: [],
  };
}
