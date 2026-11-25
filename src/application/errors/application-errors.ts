export abstract class ApplicationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    (Error as unknown as { captureStackTrace?: (err: Error, fn: Function) => void }).captureStackTrace?.(
      this,
      this.constructor
    );
  }
}

export class StackNotFoundError extends ApplicationError {
  constructor(stackId: string) {
    super(`Stack de infraestrutura '${stackId}' não foi encontrada.`);
  }
}

export class ConcurrentStateModificationError extends ApplicationError {
  constructor(resourceUrnOrId: string, reason: string) {
    super(`[RN-07] Concorrência bloqueada: Modificação concorrente em '${resourceUrnOrId}'. Motivo: ${reason}`);
  }
}

export class OptimisticLockError extends ApplicationError {
  constructor(stackId: string, expectedVersion: number, actualVersion: number) {
    super(
      `[RN-08] Erro de concorrência otimista na stack '${stackId}': Versão esperada (${expectedVersion}) difere da versão atual (${actualVersion}).`
    );
  }
}

export class StateSnapshotNotFoundError extends ApplicationError {
  constructor(stackId: string, version: number) {
    super(`[RN-08] Snapshot de estado da stack '${stackId}' versão '${version}' não foi encontrado para rollback.`);
  }
}
