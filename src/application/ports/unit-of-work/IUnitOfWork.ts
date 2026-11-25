import { IInfrastructureStackRepository } from '../repositories/IInfrastructureStackRepository.js';

export interface IUnitOfWorkContext {
  readonly stacks: IInfrastructureStackRepository;
}

export interface IUnitOfWork {
  execute<T>(operation: (context: IUnitOfWorkContext) => Promise<T>): Promise<T>;
}
