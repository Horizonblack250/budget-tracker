# Monthly budget

A personal monthly budget and spending tracker (₹). The headline number is how much you can spend freely right now.

## How the money flows

Each month the salary is split, in this order:

1. **Fixed costs** – rent, bills. Overridable for any single month.
2. **Investments** – SIPs etc. Set aside and gone. Always locked, never spendable.
3. **Savings funds** – emergency fund, travel fund. A fixed amount every month; with a target they stop when full and the app asks where that money should go next. Full funds refill automatically after a withdrawal.
4. **Allowances** – office lunch, phone & subscriptions, misc, medical… Unspent money carries into the same allowance next month; overspending carries as a deficit.
5. **Free spending** – whatever is left. This is the headline.

Everything is customizable: add, rename, reorder or remove any item. Plan changes apply **from the viewed month onward**, so past months keep their numbers.

**Locked** funds and allowances are never offered to cover another pot's shortfall. When an expense is bigger than what its pot has left, the app asks where the rest should come from (or lets it go negative). Nothing is ever blocked.

**Goals** (Goals tab) – something to save up for, like "Mom's phone". A target of at least ₹2,000 and no fixed monthly amount: tap *Add money* and take it from free spending or any unlocked allowance/fund. Each goal shows its month-by-month buildup.

The app has four tabs: **Home** (free to spend, add expense, allowances), **Goals**, **History**, **Plan** (salary → costs → investments → savings → allowances = free spending).

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # calculation tests
npm run build
```

## Storage

Data is saved in the browser (localStorage) behind a small `StorageBackend` interface (`src/lib/storage.ts`), so a Supabase backend can be added without touching the UI. Use **Monthly plan → Backup** to export/import JSON. Backups from the original single-file app are converted on import.

## Code map

- `src/lib/calc.ts` – all money rules (pure functions, unit-tested in `calc.test.ts`)
- `src/lib/plan.ts` – plan changes applied from a month onward
- `src/lib/storage.ts` – storage interface, import/export
- `src/state/store.ts` – reducer (add/delete entries, undo, overrides, plan edits)
- `src/components/` – UI
