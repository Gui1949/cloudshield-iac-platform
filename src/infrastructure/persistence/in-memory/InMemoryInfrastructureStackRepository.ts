import { OptimisticLockError } from '../../../application/errors/application-errors.js';
import {
  IInfrastructureStackRepository,
  StateSnapshotMetadata
} from '../../../application/ports/repositories/IInfrastructureStackRepository.js';
import { InfrastructureStack } from '../../../domain/entities/InfrastructureStack.js';

interface SnapshotRecord {
  version: number;
  snapshot: InfrastructureStack;
  timestamp: Date;
}

export class InMemoryInfrastructureStackRepository implements IInfrastructureStackRepository {
  private readonly stacks: Map<string, InfrastructureStack> = new Map();
  private readonly snapshots: Map<string, SnapshotRecord[]> = new Map();

  public async salvar(stack: InfrastructureStack): Promise<void> {
    const existing = this.stacks.get(stack.id);

    if (existing) {
      // RN-08: Validação de concorrência otimista
      if (existing.version !== stack.version) {
        throw new OptimisticLockError(stack.id, existing.version, stack.version);
      }
    }

    // Salva snapshot imutável da versão sendo persistida
    const snapshotClone = stack.clone();
    let history = this.snapshots.get(stack.id);
    if (!history) {
      history = [];
      this.snapshots.set(stack.id, history);
    }

    history.push({
      version: stack.version,
      snapshot: snapshotClone,
      timestamp: new Date()
    });

    // Incrementa versão para a próxima transação e salva no mapa ativo
    const toPersist = stack.clone();
    toPersist.incrementVersion();
    this.stacks.set(stack.id, toPersist);
  }

  public async buscarPorId(id: string): Promise<InfrastructureStack | null> {
    const stack = this.stacks.get(id);
    return stack ? stack.clone() : null;
  }

  public async buscarSnapshot(id: string, version: number): Promise<InfrastructureStack | null> {
    const history = this.snapshots.get(id);
    if (!history) return null;
    const record = history.find(r => r.version === version);
    return record ? record.snapshot.clone() : null;
  }

  public async listarSnapshots(id: string): Promise<StateSnapshotMetadata[]> {
    const history = this.snapshots.get(id);
    if (!history) return [];

    return history.map(r => ({
      version: r.version,
      state: r.snapshot.state,
      timestamp: r.timestamp,
      costCents: r.snapshot.totalMonthlyCostCents(),
      resourceCount: r.snapshot.resources.length
    }));
  }

  public async listarTodas(): Promise<InfrastructureStack[]> {
    return Array.from(this.stacks.values()).map(s => s.clone());
  }

  public async remover(id: string): Promise<void> {
    this.stacks.delete(id);
  }

  // Métodos de suporte para Unit of Work (captura e restauração de estado interno)
  public createInternalStateSnapshot(): {
    stacks: Map<string, InfrastructureStack>;
    snapshots: Map<string, SnapshotRecord[]>;
  } {
    const clonedStacks = new Map<string, InfrastructureStack>();
    for (const [id, s] of this.stacks.entries()) {
      clonedStacks.set(id, s.clone());
    }

    const clonedSnapshots = new Map<string, SnapshotRecord[]>();
    for (const [id, hist] of this.snapshots.entries()) {
      clonedSnapshots.set(
        id,
        hist.map(r => ({ version: r.version, snapshot: r.snapshot.clone(), timestamp: r.timestamp }))
      );
    }

    return { stacks: clonedStacks, snapshots: clonedSnapshots };
  }

  public restoreInternalState(state: {
    stacks: Map<string, InfrastructureStack>;
    snapshots: Map<string, SnapshotRecord[]>;
  }): void {
    this.stacks.clear();
    for (const [id, s] of state.stacks.entries()) {
      this.stacks.set(id, s.clone());
    }

    this.snapshots.clear();
    for (const [id, hist] of state.snapshots.entries()) {
      this.snapshots.set(
        id,
        hist.map(r => ({ version: r.version, snapshot: r.snapshot.clone(), timestamp: r.timestamp }))
      );
    }
  }
}
