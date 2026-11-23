import type { SupabaseClient } from '@supabase/supabase-js';
import { clearLocal, loadLocal, normalize, saveLocal } from './storage';
import type { Data } from './types';

export type SyncStatus = 'synced' | 'syncing' | 'offline' | 'error';

const PENDING_KEY = 'budget-tracker-pending';
const PUSH_DELAY = 800;
const PULL_EVERY = 60_000;

function pending(): boolean {
  try {
    return localStorage.getItem(PENDING_KEY) === '1';
  } catch {
    return false;
  }
}
function setPending(on: boolean) {
  try {
    if (on) localStorage.setItem(PENDING_KEY, '1');
    else localStorage.removeItem(PENDING_KEY);
  } catch {
    /* storage unavailable: we just retry from memory */
  }
}

/**
 * Keeps a local copy (so the app opens and works offline) and mirrors every
 * change to one row in the `budgets` table. The newest copy wins, by `data.t`.
 */
export class SyncEngine {
  private latest: Data | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private pushing = false;
  private disposed = false;
  private readonly cleanups: (() => void)[] = [];
  private readonly db: SupabaseClient;
  private readonly userId: string;
  private readonly onStatus: (s: SyncStatus) => void;
  private readonly onRemote: (d: Data) => void;

  constructor(db: SupabaseClient, userId: string, onStatus: (s: SyncStatus) => void, onRemote: (d: Data) => void) {
    this.db = db;
    this.userId = userId;
    this.onStatus = onStatus;
    this.onRemote = onRemote;
    const online = () => this.flush();
    const offline = () => this.onStatus('offline');
    const visible = () => document.visibilityState === 'visible' && this.pull();
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    document.addEventListener('visibilitychange', visible);
    const iv = setInterval(() => this.pull(), PULL_EVERY);
    this.cleanups.push(
      () => window.removeEventListener('online', online),
      () => window.removeEventListener('offline', offline),
      () => document.removeEventListener('visibilitychange', visible),
      () => clearInterval(iv),
    );
  }

  private async fetchRemote(): Promise<Data | null | 'error'> {
    const { data, error } = await this.db.from('budgets').select('data').eq('user_id', this.userId).maybeSingle();
    if (error) {
      console.error('[sync] fetch failed', error);
      return 'error';
    }
    return data ? normalize(data.data) : null;
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
    if (remote === 'error') {
      this.onStatus('error');
      return local;
    }
    if (!remote || (local && pending() && (local.t ?? 0) > (remote.t ?? 0))) {
      if (local) await this.push(local);
      else this.onStatus('synced');
      return local;
    }
    saveLocal(remote);
    setPending(false);
    this.latest = remote;
    this.onStatus('synced');
    return remote;
  }

  /** Called on every change: save locally now, upload shortly after. */
  save(data: Data) {
    this.latest = data;
    saveLocal(data);
    setPending(true);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), PUSH_DELAY);
  }

  private flush() {
    if (this.latest && pending()) void this.push(this.latest);
  }

  private async push(data: Data) {
    if (this.disposed) return;
    if (!navigator.onLine) {
      setPending(true);
      return this.onStatus('offline');
    }
    if (this.pushing) {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.flush(), PUSH_DELAY);
      return;
    }
    this.pushing = true;
    this.onStatus('syncing');
    const { error } = await this.db
      .from('budgets')
      .upsert({ user_id: this.userId, data, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
    this.pushing = false;
    if (error) {
      console.error('[sync] save failed', error);
      setPending(true);
      return this.onStatus(navigator.onLine ? 'error' : 'offline');
    }
    if (this.latest === data) setPending(false);
    this.onStatus(pending() ? 'syncing' : 'synced');
  }

  /** Fetch changes made on another device. */
  async pull() {
    if (this.disposed || this.pushing || pending() || !navigator.onLine) return;
    const remote = await this.fetchRemote();
    if (remote === 'error' || !remote) return;
    if ((remote.t ?? 0) > (this.latest?.t ?? 0) && !pending()) {
      this.latest = remote;
      saveLocal(remote);
      this.onRemote(remote);
    }
    this.onStatus('synced');
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
  }
}
