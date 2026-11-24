/**
 * Keyed per-resource async mutex that serializes concurrent operations touching the same
 * sorted lock keys in memory before/alongside SQL `SELECT ... FOR UPDATE`.
 *
 * Why both?
 * 1. In production PostgreSQL, `SELECT ... ORDER BY id ASC FOR UPDATE` provides cross-process
 *    row-level locking across multiple server instances.
 * 2. Within a single Node.js worker (and in-memory test engines like `pg-mem` where `FOR UPDATE`
 *    is a no-op), acquiring locks in the exact same deterministic sorted key order (`[idA, idB].sort()`)
 *    prevents connection pool starvation, eliminates circular-wait deadlocks, and guarantees strict
 *    serializable execution in every environment.
 */
class KeyedLockManager {
  private readonly tails = new Map<string, Promise<void>>();

  private async acquireOne(key: string): Promise<() => void> {
    const previous = this.tails.get(key) || Promise.resolve();
    let releaseFn!: () => void;
    const current = new Promise<void>((resolve) => {
      releaseFn = resolve;
    });
    const chained = previous.then(() => current);
    this.tails.set(key, chained);

    await previous;

    return () => {
      releaseFn();
      if (this.tails.get(key) === chained) {
        this.tails.delete(key);
      }
    };
  }

  /**
   * Acquires locks for all requested keys in deterministic lexicographical order,
   * executes `fn()`, and releases all locks in reverse order.
   */
  public async withLocks<T>(keys: string[], fn: () => Promise<T>): Promise<T> {
    const uniqueSortedKeys = Array.from(new Set(keys)).sort();
    const releases: Array<() => void> = [];

    try {
      for (const key of uniqueSortedKeys) {
        const release = await this.acquireOne(key);
        releases.push(release);
      }
      return await fn();
    } finally {
      for (let i = releases.length - 1; i >= 0; i--) {
        releases[i]();
      }
    }
  }
}

export const walletLockManager = new KeyedLockManager();
