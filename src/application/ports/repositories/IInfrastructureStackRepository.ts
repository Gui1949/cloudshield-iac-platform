import { InfrastructureStack } from '../../../domain/entities/InfrastructureStack.js';

export interface StateSnapshotMetadata {
  version: number;
  state: string;
  timestamp: Date;
  costCents: number;
  resourceCount: number;
}

export interface IInfrastructureStackRepository {
  salvar(stack: InfrastructureStack): Promise<void>;
  buscarPorId(id: string): Promise<InfrastructureStack | null>;
  buscarSnapshot(id: string, version: number): Promise<InfrastructureStack | null>;
  listarSnapshots(id: string): Promise<StateSnapshotMetadata[]>;
  listarTodas(): Promise<InfrastructureStack[]>;
  remover(id: string): Promise<void>;
}
