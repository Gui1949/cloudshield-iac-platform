import { FinOpsBudget } from '../../../domain/value-objects/FinOpsBudget.js';
import { InfrastructureStack } from '../../../domain/entities/InfrastructureStack.js';
import { IStateLockManager } from '../../ports/concurrency/IStateLockManager.js';
import { IUnitOfWork } from '../../ports/unit-of-work/IUnitOfWork.js';

export interface ProvisionarStackInputDTO {
  stackId: string;
  name: string;
  environment: 'dev' | 'staging' | 'prod';
  monthlyBudgetCents: number;
  warningThresholdPercent?: number;
}

export interface ProvisionarStackOutputDTO {
  stackId: string;
  name: string;
  environment: string;
  state: string;
  version: number;
  monthlyLimitCents: number;
  allocatedCents: number;
}

export class ProvisionarStackUseCase {
  constructor(
    private readonly uow: IUnitOfWork,
    private readonly lockManager: IStateLockManager
  ) {}

  public async execute(input: ProvisionarStackInputDTO): Promise<ProvisionarStackOutputDTO> {
    return this.lockManager.withLock(input.stackId, async () => {
      return this.uow.execute(async ctx => {
        const existing = await ctx.stacks.buscarPorId(input.stackId);
        if (existing) {
          throw new Error(`Stack com ID '${input.stackId}' já existe.`);
        }

        const budget = FinOpsBudget.fromCents(
          input.monthlyBudgetCents,
          input.warningThresholdPercent ?? 80
        );

        const stack = InfrastructureStack.create({
          id: input.stackId,
          name: input.name,
          environment: input.environment,
          budget
        });

        // Transição inicial de integridade
        stack.transitionTo('VALIDATING', 'Inicialização de conformidade de stack');
        stack.transitionTo('PLAN_READY', 'Plano base estruturado com sucesso');

        await ctx.stacks.salvar(stack);

        return {
          stackId: stack.id,
          name: stack.name,
          environment: stack.environment,
          state: stack.state,
          version: stack.version,
          monthlyLimitCents: stack.budget.monthlyLimitCents,
          allocatedCents: stack.budget.allocatedCents
        };
      });
    });
  }
}
