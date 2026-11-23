import { planFor } from './calc';
import type { Bucket, Data, Plan } from './types';

/** A change to the plan. Applied to the snapshot at `from` and every later snapshot. */
export type PlanOp =
  | { type: 'salary'; value: number }
  | { type: 'update'; id: string; patch: Partial<Omit<Bucket, 'id' | 'kind'>> }
  | { type: 'add'; bucket: Bucket }
  | { type: 'remove'; id: string }
  | { type: 'move'; id: string; dir: -1 | 1 }
  /** Stop a fund's contribution and add it to another fund's. */
  | { type: 'redirect'; fromId: string; toId: string; amount: number };

function applyOp(plan: Plan, op: PlanOp): Plan {
  switch (op.type) {
    case 'salary':
      return { ...plan, salary: op.value };
    case 'update':
      return { ...plan, buckets: plan.buckets.map((b) => (b.id === op.id ? { ...b, ...op.patch } : b)) };
    case 'add':
      return plan.buckets.some((b) => b.id === op.bucket.id) ? plan : { ...plan, buckets: [...plan.buckets, op.bucket] };
    case 'remove':
      return { ...plan, buckets: plan.buckets.filter((b) => b.id !== op.id) };
    case 'move': {
      const list = [...plan.buckets];
      const i = list.findIndex((b) => b.id === op.id);
      if (i < 0) return plan;
      // Swap with the nearest neighbour of the same kind.
      let j = i + op.dir;
      while (j >= 0 && j < list.length && list[j].kind !== list[i].kind) j += op.dir;
      if (j < 0 || j >= list.length) return plan;
      [list[i], list[j]] = [list[j], list[i]];
      return { ...plan, buckets: list };
    }
    case 'redirect':
      return {
        ...plan,
        buckets: plan.buckets.map((b) =>
          b.id === op.fromId ? { ...b, amount: 0 } : b.id === op.toId ? { ...b, amount: b.amount + op.amount } : b,
        ),
      };
  }
}

/** Apply a plan change from month `from` onward. Earlier months keep their numbers. */
export function changePlan(data: Data, from: string, op: PlanOp): Data {
  const plans: Record<string, Plan> = {};
  for (const [k, p] of Object.entries(data.plans)) plans[k] = k > from ? applyOp(p, op) : p;
  plans[from] = applyOp(planFor(data, from), op);
  return { ...data, plans };
}

export function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
