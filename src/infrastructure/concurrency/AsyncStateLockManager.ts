import { ConcurrentStateModificationError } from '../../application/errors/application-errors.js';
import { IStateLockManager } from '../../application/ports/concurrency/IStateLockManager.js';

interface MutexQueueItem {
  resolve: (release: () => void) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
}

class Mutex {
  private locked: boolean = false;
  private queue: MutexQueueItem[] = [];

  public acquire(resourceId: string, timeoutMs: number): Promise<() => void> {
    return new Promise<() => void>((resolve, reject) => {
      const timer = setTimeout(() => {
        const index = this.queue.findIndex(item => item.timer === timer);
        if (index !== -1) {
          this.queue.splice(index, 1);
          reject(
            new ConcurrentStateModificationError(
              resourceId,
              `Timeout de ${timeoutMs}ms aguardando liberação de lock exclusivo.`
            )
          );
        }
      }, timeoutMs);

      const release = () => {
        if (this.queue.length > 0) {
          const next = this.queue.shift()!;
          clearTimeout(next.timer);
          next.resolve(release);
        } else {
          this.locked = false;
        }
      };

      if (!this.locked) {
        this.locked = true;
        clearTimeout(timer);
        resolve(release);
      } else {
        this.queue.push({ resolve, reject, timer });
      }
    });
  }

  public isLocked(): boolean {
    return this.locked;
  }
}

export class AsyncStateLockManager implements IStateLockManager {
  private readonly mutexes: Map<string, Mutex> = new Map();

  private getMutex(id: string): Mutex {
    let mutex = this.mutexes.get(id);
    if (!mutex) {
      mutex = new Mutex();
      this.mutexes.set(id, mutex);
    }
    return mutex;
  }

  public async acquireLock(
    resourceIds: string | string[],
    timeoutMs: number = 5000
  ): Promise<() => Promise<void>> {
    const rawIds = Array.isArray(resourceIds) ? resourceIds : [resourceIds];
    // RN-07: Ordenação lexicográfica estrita anti-deadlock e deduplicação
    const sortedIds = Array.from(new Set(rawIds)).sort();

    const releaseFns: Array<() => void> = [];

    try {
      for (const id of sortedIds) {
        const mutex = this.getMutex(id);
        const release = await mutex.acquire(id, timeoutMs);
        releaseFns.push(release);
      }

      return async () => {
        // Libera em ordem reversa
        for (let i = releaseFns.length - 1; i >= 0; i--) {
          releaseFns[i]();
        }
      };
    } catch (err) {
      // Se falhou ao adquirir qualquer lock da cadeia, libera imediatamente os já adquiridos
      for (let i = releaseFns.length - 1; i >= 0; i--) {
        releaseFns[i]();
      }
      throw err;
    }
  }

  public isLocked(resourceId: string): boolean {
    const mutex = this.mutexes.get(resourceId);
    return mutex ? mutex.isLocked() : false;
  }

  public async withLock<T>(
    resourceIds: string | string[],
    fn: () => Promise<T>,
    timeoutMs: number = 5000
  ): Promise<T> {
    const release = await this.acquireLock(resourceIds, timeoutMs);
    try {
      return await fn();
    } finally {
      await release();
    }
  }
}
