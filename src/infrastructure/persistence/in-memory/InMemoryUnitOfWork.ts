import {
  IUnitOfWork,
  IUnitOfWorkContext
} from '../../../application/ports/unit-of-work/IUnitOfWork.js';
import { InMemoryInfrastructureStackRepository } from './InMemoryInfrastructureStackRepository.js';

export class InMemoryUnitOfWork implements IUnitOfWork {
  private readonly stackRepo: InMemoryInfrastructureStackRepository;

  constructor(stackRepo: InMemoryInfrastructureStackRepository) {
    this.stackRepo = stackRepo;
  }

  public async execute<T>(operation: (context: IUnitOfWorkContext) => Promise<T>): Promise<T> {
    // RN-06: Captura snapshot completo antes de iniciar a operação transacional
    const snapshotBefore = this.stackRepo.createInternalStateSnapshot();

    try {
      const result = await operation({
        stacks: this.stackRepo
      });
      return result;
    } catch (error) {
      // Rollback atômico imediato de qualquer alteração pendente
      this.stackRepo.restoreInternalState(snapshotBefore);
      throw error;
    }
  }
}
