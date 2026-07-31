export interface SettleInfo<T> {
  key: string;
  value: T;
  success: boolean;
}

export type SendFn<T> = (key: string, value: T) => Promise<boolean>;
export type SettleFn<T> = (info: SettleInfo<T>) => void;
export type ActivityFn = (active: boolean) => void;

/**
 * A keyed latest-value write queue.
 *
 * For each key, at most one write is in flight. If more values arrive while
 * that write is running, only the newest pending value is retained. Different
 * keys remain independent and may be written concurrently.
 */
export class LatestValueQueue<T> {
  private activeKeys = new Set<string>();
  private pendingValues = new Map<string, T>();
  private lastConfirmed = new Map<string, T>();
  private destroyed = false;
  private generation = 0;

  constructor(
    private readonly send: SendFn<T>,
    private readonly onSettle: SettleFn<T>,
    private readonly onActivityChange: ActivityFn = () => undefined
  ) {}

  /** Seed a value already known to be saved on the server. */
  seedConfirmed(key: string, value: T): void {
    if (this.destroyed) return;
    this.lastConfirmed.set(key, value);
  }

  getLastConfirmed(key: string): T | undefined {
    return this.lastConfirmed.get(key);
  }

  isActive(key: string): boolean {
    return this.activeKeys.has(key);
  }

  hasAnyActive(): boolean {
    return this.activeKeys.size > 0;
  }

  enqueue(key: string, value: T): void {
    if (this.destroyed) return;

    if (this.activeKeys.has(key)) {
      this.pendingValues.set(key, value);
      return;
    }

    this.activeKeys.add(key);
    this.onActivityChange(true);
    void this.runWrite(key, value, this.generation);
  }

  private async runWrite(key: string, value: T, generation: number): Promise<void> {
    let success = false;

    try {
      success = await this.send(key, value);
    } catch {
      success = false;
    }

    if (this.destroyed || generation !== this.generation) return;

    if (success) {
      this.lastConfirmed.set(key, value);
    }

    if (this.pendingValues.has(key)) {
      const nextValue = this.pendingValues.get(key) as T;
      this.pendingValues.delete(key);
      void this.runWrite(key, nextValue, generation);
      return;
    }

    this.activeKeys.delete(key);
    this.onSettle({ key, value, success });
    this.onActivityChange(this.hasAnyActive());
  }

  /** Reset the queue when loading a different data snapshot. */
  reset(): void {
    if (this.destroyed) return;
    this.generation += 1;
    this.activeKeys.clear();
    this.pendingValues.clear();
    this.lastConfirmed.clear();
    this.onActivityChange(false);
  }

  /** Permanently stop callbacks, intended for React unmount cleanup. */
  destroy(): void {
    this.destroyed = true;
    this.generation += 1;
    this.activeKeys.clear();
    this.pendingValues.clear();
    this.lastConfirmed.clear();
  }
}
