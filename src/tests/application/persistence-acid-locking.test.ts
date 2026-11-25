import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  ConcurrentStateModificationError,
  OptimisticLockError,
  StackNotFoundError,
  StateSnapshotNotFoundError
} from '../../application/errors/application-errors.js';
import { AdicionarRecursoStackUseCase } from '../../application/use-cases/adicionar-recurso-stack/AdicionarRecursoStackUseCase.js';
import { ProvisionarStackUseCase } from '../../application/use-cases/provisionar-stack/ProvisionarStackUseCase.js';
import { RollbackStackUseCase } from '../../application/use-cases/rollback-stack/RollbackStackUseCase.js';
import {
  CidrCollisionError,
  FinOpsBudgetExceededError,
  SecurityComplianceViolationError
} from '../../domain/errors/domain-errors.js';
import { AsyncStateLockManager } from '../../infrastructure/concurrency/AsyncStateLockManager.js';
import { InMemoryInfrastructureStackRepository } from '../../infrastructure/persistence/in-memory/InMemoryInfrastructureStackRepository.js';
import { InMemoryUnitOfWork } from '../../infrastructure/persistence/in-memory/InMemoryUnitOfWork.js';

describe('Sprint 06 - Fase 2: CloudShield IaC Platform (Persistência ACID, Locking & Use Cases)', () => {
  const createEnvironment = () => {
    const stackRepo = new InMemoryInfrastructureStackRepository();
    const uow = new InMemoryUnitOfWork(stackRepo);
    const lockManager = new AsyncStateLockManager();

    const provisionarUseCase = new ProvisionarStackUseCase(uow, lockManager);
    const adicionarRecursoUseCase = new AdicionarRecursoStackUseCase(uow, lockManager);
    const rollbackUseCase = new RollbackStackUseCase(uow, lockManager);

    return { stackRepo, uow, lockManager, provisionarUseCase, adicionarRecursoUseCase, rollbackUseCase };
  };

  describe('AC-F2-01: ProvisionarStackUseCase (Inicialização Atômica & Versionamento)', () => {
    it('deve provisionar uma nova stack com orçamento FinOps e snapshot inicial versão 1', async () => {
      const { provisionarUseCase, stackRepo } = createEnvironment();

      const output = await provisionarUseCase.execute({
        stackId: 'stk-core-prod',
        name: 'TitanCoreProductionMesh',
        environment: 'prod',
        monthlyBudgetCents: 500000, // $5,000.00
        warningThresholdPercent: 80
      });

      assert.equal(output.stackId, 'stk-core-prod');
      assert.equal(output.name, 'TitanCoreProductionMesh');
      assert.equal(output.environment, 'prod');
      assert.equal(output.state, 'PLAN_READY');
      assert.equal(output.monthlyLimitCents, 500000);
      assert.equal(output.allocatedCents, 0);

      // Verifica persistência e snapshot gerado
      const saved = await stackRepo.buscarPorId('stk-core-prod');
      assert.ok(saved);
      assert.equal(saved.version, 2); // Salva v1, incrementa para próxima transação -> v2

      const snapshots = await stackRepo.listarSnapshots('stk-core-prod');
      assert.equal(snapshots.length, 1);
      assert.equal(snapshots[0].version, 1);
      assert.equal(snapshots[0].state, 'PLAN_READY');
    });

    it('deve rejeitar provisionamento de stack com ID já existente', async () => {
      const { provisionarUseCase } = createEnvironment();

      await provisionarUseCase.execute({
        stackId: 'stk-dup',
        name: 'StackOriginal',
        environment: 'dev',
        monthlyBudgetCents: 100000
      });

      await assert.rejects(
        () =>
          provisionarUseCase.execute({
            stackId: 'stk-dup',
            name: 'StackDuplicada',
            environment: 'dev',
            monthlyBudgetCents: 100000
          }),
        /já existe/
      );
    });
  });

  describe('AC-F2-02 & AC-F2-03: AdicionarRecurso & Rollback Atômico no Unit of Work (RN-06)', () => {
    it('deve adicionar recursos sucessivos atualizando version, snapshots e orçamento FinOps', async () => {
      const { provisionarUseCase, adicionarRecursoUseCase, stackRepo } = createEnvironment();

      await provisionarUseCase.execute({
        stackId: 'stk-net',
        name: 'NetworkStack',
        environment: 'prod',
        monthlyBudgetCents: 200000
      });

      // 1. Adiciona VPC
      const vpcOut = await adicionarRecursoUseCase.execute({
        stackId: 'stk-net',
        urn: 'urn:cloudshield:aws:us-east-1:123456:vpc/vpc-main',
        name: 'VpcMain',
        resourceType: 'vpc',
        cidrBlock: '10.0.0.0/16',
        monthlyCostCents: 15000,
        tags: { Environment: 'prod', Project: 'CloudShield', Owner: 'Guilherme' }
      });

      assert.equal(vpcOut.totalCostCents, 15000);
      assert.equal(vpcOut.remainingBudgetCents, 185000);
      assert.equal(vpcOut.totalResources, 1);

      // 2. Adiciona Subnet
      const subOut = await adicionarRecursoUseCase.execute({
        stackId: 'stk-net',
        urn: 'urn:cloudshield:aws:us-east-1:123456:subnet/sub-pub-1a',
        name: 'SubnetPub1A',
        resourceType: 'subnet',
        cidrBlock: '10.0.1.0/24',
        monthlyCostCents: 500,
        tags: { Environment: 'prod', Project: 'CloudShield', Owner: 'Guilherme' }
      });

      assert.equal(subOut.totalCostCents, 15500);
      assert.equal(subOut.totalResources, 2);

      const snapshots = await stackRepo.listarSnapshots('stk-net');
      assert.equal(snapshots.length, 3); // 1 provision + 2 recursos
    });

    it('deve executar rollback atômico integral em caso de colisão de CIDR ou erro de segurança', async () => {
      const { provisionarUseCase, adicionarRecursoUseCase, stackRepo } = createEnvironment();

      await provisionarUseCase.execute({
        stackId: 'stk-atomic',
        name: 'AtomicStack',
        environment: 'prod',
        monthlyBudgetCents: 100000
      });

      // Adiciona subnet 1
      await adicionarRecursoUseCase.execute({
        stackId: 'stk-atomic',
        urn: 'urn:cloudshield:aws:us-east-1:123:subnet/sub-1',
        name: 'Subnet1',
        resourceType: 'subnet',
        cidrBlock: '10.100.1.0/24',
        monthlyCostCents: 1000,
        tags: { Environment: 'prod', Project: 'A', Owner: 'G' }
      });

      const estadoAntes = await stackRepo.buscarPorId('stk-atomic');
      assert.equal(estadoAntes?.resources.length, 1);
      assert.equal(estadoAntes?.totalMonthlyCostCents(), 1000);

      // Tentativa de adicionar subnet colidente (10.100.1.128/25 sobrepõe 10.100.1.0/24)
      await assert.rejects(
        () =>
          adicionarRecursoUseCase.execute({
            stackId: 'stk-atomic',
            urn: 'urn:cloudshield:aws:us-east-1:123:subnet/sub-2-colide',
            name: 'Subnet2Colidente',
            resourceType: 'subnet',
            cidrBlock: '10.100.1.128/25',
            monthlyCostCents: 1000
          }),
        CidrCollisionError
      );

      // Verifica que o Unit of Work reverteu 100% das alterações
      const estadoApos = await stackRepo.buscarPorId('stk-atomic');
      assert.equal(estadoApos?.resources.length, 1);
      assert.equal(estadoApos?.totalMonthlyCostCents(), 1000);
      assert.equal(estadoApos?.budget.allocatedCents, 1000);
    });

    it('deve realizar rollback atômico caso o recurso exceda o teto orçamentário FinOps', async () => {
      const { provisionarUseCase, adicionarRecursoUseCase, stackRepo } = createEnvironment();

      await provisionarUseCase.execute({
        stackId: 'stk-budget',
        name: 'BudgetStack',
        environment: 'dev',
        monthlyBudgetCents: 50000 // 50000c limite
      });

      // Tenta adicionar cluster de R$ 600,00 (60000c)
      await assert.rejects(
        () =>
          adicionarRecursoUseCase.execute({
            stackId: 'stk-budget',
            urn: 'urn:cloudshield:aws:us-east-1:123:kafka-cluster/msk-big',
            name: 'MskExpensive',
            resourceType: 'kafka-cluster',
            encryptedAtRest: true,
            monthlyCostCents: 60000
          }),
        FinOpsBudgetExceededError
      );

      const stack = await stackRepo.buscarPorId('stk-budget');
      assert.equal(stack?.resources.length, 0);
      assert.equal(stack?.budget.allocatedCents, 0);
    });
  });

  describe('AC-F2-04 & AC-F2-05: StateLockManager (Concorrência & Anti-Deadlock RN-07)', () => {
    it('deve adquirir locks lexicograficamente ordenados sem deadlocks em concorrência cruzada', async () => {
      const { lockManager } = createEnvironment();

      // Duas operações concorrentes solicitando [stk-A, stk-B] e [stk-B, stk-A]
      const results: string[] = [];

      const worker1 = async () => {
        await lockManager.withLock(['stk-B', 'stk-A'], async () => {
          results.push('w1-start');
          await new Promise(r => setTimeout(r, 20));
          results.push('w1-end');
        });
      };

      const worker2 = async () => {
        await lockManager.withLock(['stk-A', 'stk-B'], async () => {
          results.push('w2-start');
          await new Promise(r => setTimeout(r, 20));
          results.push('w2-end');
        });
      };

      await Promise.all([worker1(), worker2()]);

      // Ambas finalizaram sem deadlock
      assert.equal(results.length, 4);
      assert.ok(!lockManager.isLocked('stk-A'));
      assert.ok(!lockManager.isLocked('stk-B'));
    });

    it('deve rejeitar com timeout tentativas concorrentes quando lock não for liberado a tempo', async () => {
      const { lockManager } = createEnvironment();

      let releaseWorker1: (() => Promise<void>) | null = null;
      releaseWorker1 = await lockManager.acquireLock('stk-busy', 1000);

      try {
        // Segunda tentativa com timeout curto de 50ms
        await assert.rejects(
          () => lockManager.acquireLock('stk-busy', 50),
          ConcurrentStateModificationError
        );
      } finally {
        await releaseWorker1();
      }
    });
  });

  describe('AC-F2-06 & AC-F2-07: Snapshot History & RollbackStackUseCase (RN-08)', () => {
    it('deve detectar concorrência otimista (OptimisticLockError) em saves concorrentes desatualizados', async () => {
      const { provisionarUseCase, stackRepo } = createEnvironment();

      await provisionarUseCase.execute({
        stackId: 'stk-optimistic',
        name: 'OptimisticStack',
        environment: 'dev',
        monthlyBudgetCents: 100000
      });

      // Carrega duas instâncias da mesma stack com versão 2
      const instanceA = await stackRepo.buscarPorId('stk-optimistic');
      const instanceB = await stackRepo.buscarPorId('stk-optimistic');
      assert.ok(instanceA && instanceB);

      // Instância A salva primeiro -> repositório avança para versão 3
      await stackRepo.salvar(instanceA);

      // Instância B tenta salvar com a versão desatualizada (v2) -> OptimisticLockError
      await assert.rejects(
        () => stackRepo.salvar(instanceB),
        OptimisticLockError
      );
    });

    it('deve realizar rollback da stack para uma versão pretérita específica', async () => {
      const { provisionarUseCase, adicionarRecursoUseCase, rollbackUseCase, stackRepo } = createEnvironment();

      // Versão 1: Stack criada (0 recursos, 0 custo)
      await provisionarUseCase.execute({
        stackId: 'stk-restore',
        name: 'RestoreStack',
        environment: 'prod',
        monthlyBudgetCents: 300000
      });

      // Versão 2: Adiciona VPC (15000c)
      await adicionarRecursoUseCase.execute({
        stackId: 'stk-restore',
        urn: 'urn:cloudshield:aws:us-east-1:123:vpc/vpc-base',
        name: 'VpcBase',
        resourceType: 'vpc',
        cidrBlock: '10.0.0.0/16',
        monthlyCostCents: 15000,
        tags: { Environment: 'prod', Project: 'CloudShield', Owner: 'Guilherme' }
      });

      // Versão 3: Adiciona Banco RDS (40000c)
      await adicionarRecursoUseCase.execute({
        stackId: 'stk-restore',
        urn: 'urn:cloudshield:aws:us-east-1:123:rds/db-postgres',
        name: 'DbPostgres',
        resourceType: 'rds-database',
        encryptedAtRest: true,
        monthlyCostCents: 40000,
        tags: { Environment: 'prod', Project: 'CloudShield', Owner: 'Guilherme' },
        metadata: { multiAz: true }
      });

      const estadoV3 = await stackRepo.buscarPorId('stk-restore');
      assert.equal(estadoV3?.resources.length, 2);
      assert.equal(estadoV3?.totalMonthlyCostCents(), 55000);

      // Executa rollback para a Versão 2 (antes do banco de dados ser adicionado)
      const rollbackOut = await rollbackUseCase.execute({
        stackId: 'stk-restore',
        targetVersion: 2,
        reason: 'Rollback planejado de teste de resiliência'
      });

      assert.equal(rollbackOut.restoredVersion, 2);
      assert.equal(rollbackOut.totalResources, 1);
      assert.equal(rollbackOut.totalMonthlyCostCents, 15000);

      // Verifica estado ativo na base
      const estadoAtual = await stackRepo.buscarPorId('stk-restore');
      assert.equal(estadoAtual?.resources.length, 1);
      assert.equal(estadoAtual?.resources[0].name, 'VpcBase');
      assert.equal(estadoAtual?.budget.allocatedCents, 15000);
    });

    it('deve falhar ao tentar rollback para versão inexistente', async () => {
      const { provisionarUseCase, rollbackUseCase } = createEnvironment();

      await provisionarUseCase.execute({
        stackId: 'stk-no-snapshot',
        name: 'NoSnapStack',
        environment: 'dev',
        monthlyBudgetCents: 50000
      });

      await assert.rejects(
        () =>
          rollbackUseCase.execute({
            stackId: 'stk-no-snapshot',
            targetVersion: 999, // Inexistente
            reason: 'Tentativa inválida'
          }),
        StateSnapshotNotFoundError
      );
    });
  });
});
