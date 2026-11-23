const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** ₹ with Indian digit grouping, true minus sign for negatives. */
export function fmt(n: number): string {
  const r = Math.round(n);
  const s = '₹' + Math.abs(r).toLocaleString('en-IN');
  return r < 0 ? '−' + s : s;
}

export function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function monthOf(date: string): string {
  return date.slice(0, 7);
}

export function addMonths(m: string, k: number): string {
  const [y, mo] = m.split('-').map(Number);
  const idx = y * 12 + (mo - 1) + k;
  return `${Math.floor(idx / 12)}-${pad((idx % 12) + 1)}`;
}

export function monthsBetween(a: string, b: string): number {
  const [ya, ma] = a.split('-').map(Number);
  const [yb, mb] = b.split('-').map(Number);
  return (yb - ya) * 12 + (mb - ma);
}

export function monthLabel(m: string): string {
  const [y, mo] = m.split('-').map(Number);
  return `${MONTHS[mo - 1]} ${y}`;
}

export function dayLabel(date: string): string {
  const [, mo, d] = date.split('-').map(Number);
  return `${pad(d)} ${MONTHS[mo - 1]}`;
}

export function todayISO(now = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function daysInMonth(m: string): number {
  const [y, mo] = m.split('-').map(Number);
  return new Date(y, mo, 0).getDate();
}

/** Parse a number input: empty/invalid → 0, negatives clamped to 0. */
export function num(v: string): number {
  const n = parseFloat(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}
