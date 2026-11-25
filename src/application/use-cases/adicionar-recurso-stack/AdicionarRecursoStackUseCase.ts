import { CloudResource, ResourceType } from '../../../domain/entities/CloudResource.js';
import { CidrBlock } from '../../../domain/value-objects/CidrBlock.js';
import { CloudResourceUrn } from '../../../domain/value-objects/CloudResourceUrn.js';
import { SecurityRule } from '../../../domain/value-objects/SecurityRule.js';
import { StackNotFoundError } from '../../errors/application-errors.js';
import { IStateLockManager } from '../../ports/concurrency/IStateLockManager.js';
import { IUnitOfWork } from '../../ports/unit-of-work/IUnitOfWork.js';

export interface AdicionarRecursoInputDTO {
  stackId: string;
  urn: string;
  name: string;
  resourceType: ResourceType;
  cidrBlock?: string;
  securityRules?: Array<{
    direction: 'ingress' | 'egress';
    protocol: 'tcp' | 'udp' | 'icmp' | 'all';
    fromPort: number;
    toPort: number;
    sourceCidr: string;
    description: string;
  }>;
  encryptedAtRest?: boolean;
  kmsKeyUrn?: string;
  monthlyCostCents: number;
  tags?: Record<string, string>;
  metadata?: Record<string, unknown>;
}

export interface AdicionarRecursoOutputDTO {
  stackId: string;
  resourceUrn: string;
  resourceName: string;
  totalCostCents: number;
  remainingBudgetCents: number;
  utilizationPercent: number;
  stackVersion: number;
  totalResources: number;
}

export class AdicionarRecursoStackUseCase {
  constructor(
    private readonly uow: IUnitOfWork,
    private readonly lockManager: IStateLockManager
  ) {}

  public async execute(input: AdicionarRecursoInputDTO): Promise<AdicionarRecursoOutputDTO> {
    return this.lockManager.withLock(input.stackId, async () => {
      return this.uow.execute(async ctx => {
        const stack = await ctx.stacks.buscarPorId(input.stackId);
        if (!stack) {
          throw new StackNotFoundError(input.stackId);
        }

        const urn = CloudResourceUrn.from(input.urn);
        const cidr = input.cidrBlock ? CidrBlock.from(input.cidrBlock) : undefined;
        const kms = input.kmsKeyUrn ? CloudResourceUrn.from(input.kmsKeyUrn) : undefined;

        const rules: SecurityRule[] = [];
        if (input.securityRules) {
          for (const r of input.securityRules) {
            rules.push(
              SecurityRule.create({
                direction: r.direction,
                protocol: r.protocol,
                fromPort: r.fromPort,
                toPort: r.toPort,
                sourceCidr: CidrBlock.from(r.sourceCidr),
                description: r.description
              })
            );
          }
        }

        const resource = CloudResource.create({
          urn,
          name: input.name,
          resourceType: input.resourceType,
          cidrBlock: cidr,
          securityRules: rules,
          encryptedAtRest: input.encryptedAtRest,
          kmsKeyUrn: kms,
          monthlyCostCents: input.monthlyCostCents,
          tags: input.tags,
          metadata: input.metadata
        });

        // RN-01, RN-02, RN-04: Domain checks executados dentro do agregado
        stack.addResource(resource);

        await ctx.stacks.salvar(stack);

        return {
          stackId: stack.id,
          resourceUrn: resource.urn.value,
          resourceName: resource.name,
          totalCostCents: stack.totalMonthlyCostCents(),
          remainingBudgetCents: stack.budget.remainingCents,
          utilizationPercent: stack.budget.utilizationPercent,
          stackVersion: stack.version,
          totalResources: stack.resources.length
        };
      });
    });
  }
}
