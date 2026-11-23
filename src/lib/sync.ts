import type { SupabaseClient } from '@supabase/supabase-js';
import { clearLocal, loadLocal, normalize, saveLocal } from './storage';
import type { Data } from './types';

export type SyncStatus = 'synced' | 'syncing' | 'offline' | 'error';

const PENDING_KEY = 'budget-tracker-pending';
const STAMP_KEY = 'budget-tracker-stamp';
const PUSH_DELAY = 800;
const PULL_EVERY = 15_000;

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* storage unavailable: we just keep going from memory */
  }
}
const pending = () => read(PENDING_KEY) === '1';
const setPending = (on: boolean) => write(PENDING_KEY, on ? '1' : null);

type Remote = { data: Data; stamp: string };

function describe(e: unknown): string {
  if (e && typeof e === 'object') {
    const x = e as { message?: string; code?: string; details?: string; hint?: string };
    return [x.message, x.code && `(code ${x.code})`, x.hint].filter(Boolean).join(' ');
  }
  return String(e);
}

const short = (id?: string | null) => (id ? id.slice(0, 8) : 'none');

/** Who does this device think it is, and who does Supabase think it is? */
async function whoAmI(db: SupabaseClient, appUser: string): Promise<string> {
  try {
    const { data: s } = await db.auth.getSession();
    const token = s.session?.access_token;
    let tokenUser = 'none';
    let expiry = '';
    if (token) {
      const claims = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      tokenUser = `${short(claims.sub)} (${claims.role})`;
      expiry = ` · login expires in ${Math.round((claims.exp * 1000 - Date.now()) / 60000)} min by this device’s clock`;
    }
    const { data: u, error } = await db.auth.getUser();
    const server = error ? `error: ${error.message}` : short(u.user?.id);
    return `app account ${short(appUser)} · login token ${tokenUser} · Supabase says ${server}${expiry}`;
  } catch (e) {
    return `could not check login: ${String(e)}`;
  }
}

/**
 * Keeps a local copy (so the app opens and works offline) and mirrors every
 * change to one row in the `budgets` table.
 *
 * To tell whether another device saved something, we compare the row's
 * `updated_at` with the one we last saw. That marker comes from the database
 * row itself, so it doesn't matter if the phone's and PC's clocks disagree.
 */
export class SyncEngine {
  private latest: Data | null = null;
  /** `updated_at` of the cloud row as of our last read or write. */
  private stamp: string | null = read(STAMP_KEY);
  private timer: ReturnType<typeof setTimeout> | undefined;
  private busy = false;
  private disposed = false;
  private readonly cleanups: (() => void)[] = [];
  private readonly db: SupabaseClient;
  private readonly userId: string;
  private readonly onStatus: (s: SyncStatus, detail?: string) => void;
  private readonly onRemote: (d: Data) => void;

  constructor(db: SupabaseClient, userId: string, onStatus: (s: SyncStatus, detail?: string) => void, onRemote: (d: Data) => void) {
    this.db = db;
    this.userId = userId;
    this.onStatus = onStatus;
    this.onRemote = onRemote;
    const wake = () => void this.syncNow();
    const visible = () => document.visibilityState === 'visible' && wake();
    const offline = () => this.onStatus('offline');
    window.addEventListener('online', wake);
    window.addEventListener('focus', wake);
    window.addEventListener('offline', offline);
    document.addEventListener('visibilitychange', visible);
    const iv = setInterval(() => document.visibilityState === 'visible' && void this.pull(), PULL_EVERY);
    this.cleanups.push(
      () => window.removeEventListener('online', wake),
      () => window.removeEventListener('focus', wake),
      () => window.removeEventListener('offline', offline),
      () => document.removeEventListener('visibilitychange', visible),
      () => clearInterval(iv),
    );
  }

  private setStamp(s: string | null) {
    this.stamp = s;
    write(STAMP_KEY, s);
  }

  private async fetchRemote(): Promise<Remote | null | { error: string }> {
    try {
      const { data, error } = await this.db.from('budgets').select('data, updated_at').eq('user_id', this.userId).maybeSingle();
      if (error) {
        console.error('[sync] fetch failed', error);
        return { error: describe(error) };
      }
      return data ? { data: normalize(data.data), stamp: String(data.updated_at) } : null;
    } catch (e) {
      console.error('[sync] fetch failed', e);
      return { error: describe(e) };
    }
  }

  /** Load the newest copy. Uploads the local copy the first time (moving this device's data to the cloud). */
  async init(): Promise<Data | null> {
    const local = loadLocal();
    this.latest = local;
    if (!navigator.onLine) {
      this.onStatus('offline');
      return local;
    }
    this.onStatus('syncing');
    const remote = await this.fetchRemote();
    if (remote && 'error' in remote) {
      this.onStatus('error', `${remote.error} — ${await whoAmI(this.db, this.userId)}`);
      return local;
    }
    // Nothing in the cloud yet, or this device has unsent changes made after the cloud copy: send ours.
    if (!remote || (local && pending() && (remote.stamp === this.stamp || (local.t ?? 0) > (remote.data.t ?? 0)))) {
      if (local) await this.push(local);
      else this.onStatus('synced');
      return local;
    }
    this.accept(remote);
    this.onStatus('synced');
    return remote.data;
  }

  private accept(remote: Remote) {
    this.latest = remote.data;
    saveLocal(remote.data);
    setPending(false);
    this.setStamp(remote.stamp);
  }

  /** Called on every change: save locally now, upload shortly after. */
  save(data: Data) {
    this.latest = data;
    saveLocal(data);
    setPending(true);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), PUSH_DELAY);
  }

  private async flush() {
    if (this.latest && pending()) await this.push(this.latest);
  }

  private async push(data: Data) {
    if (this.disposed) return;
    if (!navigator.onLine) {
      setPending(true);
      return this.onStatus('offline');
    }
    if (this.busy) {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => void this.flush(), PUSH_DELAY);
      return;
    }
    this.busy = true;
    this.onStatus('syncing');
    try {
      const { data: row, error } = await this.db
        .from('budgets')
        .upsert({ user_id: this.userId, data, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
        .select('updated_at')
        .single();
      if (error) throw error;
      this.setStamp(String(row.updated_at));
      if (this.latest === data) setPending(false);
      this.onStatus(pending() ? 'syncing' : 'synced');
    } catch (e) {
      console.error('[sync] save failed', e);
      setPending(true);
      const who = navigator.onLine ? ` — ${await whoAmI(this.db, this.userId)}` : '';
      this.onStatus(navigator.onLine ? 'error' : 'offline', describe(e) + who);
    } finally {
      this.busy = false;
    }
  }

  /** Fetch changes made on another device. */
  async pull() {
    if (this.disposed || this.busy || pending() || !navigator.onLine) return;
    this.busy = true;
    try {
      const remote = await this.fetchRemote();
      if (!remote) return;
      if ('error' in remote) return this.onStatus('error', remote.error);
      if (remote.stamp !== this.stamp && !pending()) {
        this.accept(remote);
        this.onRemote(remote.data);
      }
      this.onStatus('synced');
    } finally {
      this.busy = false;
    }
  }

  /** Send anything unsent, otherwise check for changes from other devices. */
  async syncNow() {
    if (!navigator.onLine) return this.onStatus('offline');
    if (pending()) await this.flush();
    else await this.pull();
  }

  dispose() {
    this.disposed = true;
    clearTimeout(this.timer);
    this.cleanups.forEach((f) => f());
  }

  /** On sign-out, remove this device's copy so the next person can't see it. */
  static clearDevice() {
    clearLocal();
    setPending(false);
    write(STAMP_KEY, null);
  }
}
