export interface IStateLockManager {
  /**
   * Adquire lock exclusivo para um ou mais identificadores de recursos ou stacks.
   * Em operações multi-recurso, os identificadores são ordenados lexicograficamente
   * para prevenir deadlocks (RN-07).
   * @returns Função assíncrona de liberação (release).
   */
  acquireLock(resourceIds: string | string[], timeoutMs?: number): Promise<() => Promise<void>>;

  /**
   * Verifica se o identificador está atualmente bloqueado.
   */
  isLocked(resourceId: string): boolean;

  /**
   * Executa uma função sob a proteção do lock exclusivo garantindo liberação no finally.
   */
  withLock<T>(resourceIds: string | string[], fn: () => Promise<T>, timeoutMs?: number): Promise<T>;
}
