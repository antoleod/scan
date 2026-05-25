import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'barra_diag_logs';
const MAX = 500;
const MAX_DATA_CHARS = 1200;

export interface LogEntry {
  ts: string;
  level: 'info' | 'warn' | 'error';
  event: string;
  data?: unknown;
}

class Diagnostics {
  private logs: LogEntry[] = [];
  private loaded = false;
  private globalHandlersInstalled = false;
  private listeners = new Set<(logs: LogEntry[]) => void>();

  /**
   * Subscribe to live log updates. Fires immediately with the current logs and
   * again after every write/clear. Returns an unsubscribe function.
   */
  subscribe(listener: (logs: LogEntry[]) => void): () => void {
    this.listeners.add(listener);
    listener([...this.logs]);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    const snapshot = [...this.logs];
    this.listeners.forEach((l) => l(snapshot));
  }

  async init() {
    if (this.loaded) return;
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) this.logs = parsed.slice(-MAX);
      } catch {
        this.logs = [];
      }
    }
    this.loaded = true;
    this.notify();
  }

  installGlobalHandlers() {
    if (this.globalHandlersInstalled) return;
    this.globalHandlersInstalled = true;

    const originalConsole = {
      warn: console.warn?.bind(console),
      error: console.error?.bind(console),
    };

    console.warn = (...args: unknown[]) => {
      originalConsole.warn?.(...args);
      void this.warn('console.warn', { args: this.serializeData(args) });
    };

    console.error = (...args: unknown[]) => {
      originalConsole.error?.(...args);
      void this.error('console.error', { args: this.serializeData(args) });
    };

    const target = globalThis as typeof globalThis & {
      addEventListener?: (type: string, listener: (event: Event) => void) => void;
      ErrorUtils?: { getGlobalHandler?: () => unknown; setGlobalHandler?: (handler: unknown) => void };
    };

    target.addEventListener?.('error', (event) => {
      const err = event as ErrorEvent;
      void this.error('runtime.error', {
        message: err.message,
        filename: err.filename,
        lineno: err.lineno,
        colno: err.colno,
      });
    });

    target.addEventListener?.('unhandledrejection', (event) => {
      const rejection = event as PromiseRejectionEvent;
      void this.error('runtime.unhandled_rejection', { reason: this.serializeData(rejection.reason) });
    });

    if (target.ErrorUtils?.setGlobalHandler && target.ErrorUtils?.getGlobalHandler) {
      const previousHandler = target.ErrorUtils.getGlobalHandler();
      target.ErrorUtils.setGlobalHandler((error: Error, isFatal?: boolean) => {
        void this.error('runtime.native_error', {
          message: String(error?.message || error),
          name: String(error?.name || ''),
          stack: String(error?.stack || ''),
          isFatal: Boolean(isFatal),
        });
        if (typeof previousHandler === 'function') {
          previousHandler(error, isFatal);
        }
      });
    }
  }

  private serializeData(value: unknown): unknown {
    try {
      return JSON.parse(JSON.stringify(value, (_key, item) => {
        if (item instanceof Error) {
          return { name: item.name, message: item.message, stack: item.stack };
        }
        if (typeof item === 'function') return `[Function ${item.name || 'anonymous'}]`;
        if (typeof item === 'string' && item.length > MAX_DATA_CHARS) return `${item.slice(0, MAX_DATA_CHARS)}...`;
        return item;
      }));
    } catch {
      const fallback = String(value);
      return fallback.length > MAX_DATA_CHARS ? `${fallback.slice(0, MAX_DATA_CHARS)}...` : fallback;
    }
  }

  async track<T>(event: string, data: unknown, action: () => T | Promise<T>): Promise<T> {
    await this.info(`${event}.start`, data);
    const startedAt = Date.now();
    try {
      const result = await action();
      await this.info(`${event}.success`, { durationMs: Date.now() - startedAt });
      return result;
    } catch (error) {
      await this.error(`${event}.error`, {
        durationMs: Date.now() - startedAt,
        message: String(error),
      });
      throw error;
    }
  }

  private async persist() {
    try {
      await AsyncStorage.setItem(KEY, JSON.stringify(this.logs));
    } catch {
      // noop
    }
  }

  async write(level: LogEntry['level'], event: string, data?: unknown) {
    await this.init();
    this.logs.push({ ts: new Date().toISOString(), level, event, data: this.serializeData(data) });
    if (this.logs.length > MAX) this.logs = this.logs.slice(this.logs.length - MAX);
    this.notify();
    await this.persist();
  }

  info(event: string, data?: unknown) { return this.write('info', event, data); }
  warn(event: string, data?: unknown) { return this.write('warn', event, data); }
  error(event: string, data?: unknown) { return this.write('error', event, data); }

  async clear() {
    this.logs = [];
    this.notify();
    await AsyncStorage.removeItem(KEY);
  }

  async getLogs() {
    await this.init();
    return [...this.logs];
  }

  async getText() {
    const logs = await this.getLogs();
    return logs.map((x) => `${x.ts} [${x.level.toUpperCase()}] ${x.event}${x.data ? ` ${JSON.stringify(x.data)}` : ''}`).join('\n');
  }

  async getJson() {
    return JSON.stringify(await this.getLogs(), null, 2);
  }
}

export const diag = new Diagnostics();
