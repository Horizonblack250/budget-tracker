/** Where money in a plan goes each month. */
export type Kind =
  | 'fixed' // rent, bills you must pay. Can be overridden per month.
  | 'invest' // SIP and similar. Set aside and gone: never spendable, never borrowable.
  | 'fund' // savings funds (emergency, travel). Balance grows by a fixed monthly amount; can be withdrawn from.
  | 'goal' // something to save up for (e.g. Mom's phone). Has a target, no monthly amount: you add money when you want.
  | 'allowance'; // monthly spending budgets with carry-forward.

export type Bucket = {
  id: string;
  kind: Kind;
  name: string;
  /** Monthly amount (cost, investment, contribution or allowance). */
  amount: number;
  /** Locked buckets are never offered as a source to cover someone else's shortfall. */
  locked?: boolean;
  /** Funds only: stop contributing once the balance reaches this. 0/undefined = no target. */
  target?: number;
  /** Funds only: the owner saw the "target reached" prompt and chose to let the money go to free spending. */
  targetAck?: boolean;
  /** Short description shown under the name. */
  hint?: string;
};

export type Plan = {
  salary: number;
  buckets: Bucket[];
};

/** The id used for the free spending pot (the remainder). */
export const FREE = 'free';

export type Entry = {
  id: number;
  date: string; // YYYY-MM-DD
  amt: number; // > 0
  /** Bucket id the money comes out of (an allowance, a fund, or FREE). */
  from: string;
  /** Set for a move: the bucket id the money goes into. Not set for an expense. */
  to?: string;
  note: string;
};

export type Data = {
  version: 2;
  /** First month of tracking, YYYY-MM. */
  start: string;
  /** Plan snapshots keyed by the month they take effect from. */
  plans: Record<string, Plan>;
  /** Balance a fund already had when it was first added. */
  opening: Record<string, number>;
  /** Per-month overrides: month -> { salary?: n, [fixedBucketId]: n }. */
  ov: Record<string, Record<string, number>>;
  entries: Entry[];
  /** Last modified (ms). */
  t?: number;
};
