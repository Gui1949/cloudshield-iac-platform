import {
  StackNotFoundError,
  StateSnapshotNotFoundError
} from '../../errors/application-errors.js';
import { IStateLockManager } from '../../ports/concurrency/IStateLockManager.js';
import { IUnitOfWork } from '../../ports/unit-of-work/IUnitOfWork.js';

export interface RollbackStackInputDTO {
  stackId: string;
  targetVersion: number;
  reason: string;
}

export interface RollbackStackOutputDTO {
  stackId: string;
  restoredVersion: number;
  newVersion: number;
  state: string;
  totalResources: number;
  totalMonthlyCostCents: number;
  reason: string;
}

export class RollbackStackUseCase {
  constructor(
    private readonly uow: IUnitOfWork,
    private readonly lockManager: IStateLockManager
  ) {}

  public async execute(input: RollbackStackInputDTO): Promise<RollbackStackOutputDTO> {
    return this.lockManager.withLock(input.stackId, async () => {
      return this.uow.execute(async ctx => {
        const currentStack = await ctx.stacks.buscarPorId(input.stackId);
        if (!currentStack) {
          throw new StackNotFoundError(input.stackId);
        }

        const snapshot = await ctx.stacks.buscarSnapshot(input.stackId, input.targetVersion);
        if (!snapshot) {
          throw new StateSnapshotNotFoundError(input.stackId, input.targetVersion);
        }

        // Restaura snapshot histórico mantendo a versão corrente para integridade da FSM
        const restored = snapshot.clone();
        restored.setVersion?.(currentStack.version);

        await ctx.stacks.salvar(restored);

        return {
          stackId: restored.id,
          restoredVersion: input.targetVersion,
          newVersion: restored.version,
          state: restored.state,
          totalResources: restored.resources.length,
          totalMonthlyCostCents: restored.totalMonthlyCostCents(),
          reason: input.reason
        };
      });
    });
  }
}
