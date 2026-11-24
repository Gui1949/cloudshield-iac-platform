import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CloudResource } from '../domain/entities/CloudResource.js';
import { InfrastructureStack } from '../domain/entities/InfrastructureStack.js';
import {
  CidrCollisionError,
  DuplicateResourceError,
  FinOpsBudgetExceededError,
  InvalidCidrBlockError,
  InvalidFinOpsAmountError,
  InvalidResourceUrnError,
  InvalidStateTransitionError,
  SecurityComplianceViolationError
} from '../domain/errors/domain-errors.js';
import { PolicyComplianceEngine } from '../domain/services/PolicyComplianceEngine.js';
import { CidrBlock } from '../domain/value-objects/CidrBlock.js';
import { CloudResourceUrn } from '../domain/value-objects/CloudResourceUrn.js';
import { FinOpsBudget } from '../domain/value-objects/FinOpsBudget.js';
import { SecurityRule } from '../domain/value-objects/SecurityRule.js';

describe('Sprint 06 - Fase 1: CloudShield IaC Platform (Domain Core & Invariants)', () => {
  describe('RN-02: CidrBlock (Modelagem de Rede e Anti-Colisão)', () => {
    it('deve instanciar bloco CIDR válido e calcular rede, broadcast e IPs disponíveis', () => {
      const cidr = CidrBlock.from('10.0.0.0/24');
      assert.equal(cidr.value, '10.0.0.0/24');
      assert.equal(cidr.prefix, 24);
      assert.equal(cidr.networkIp, '10.0.0.0');
      assert.equal(cidr.broadcastIp, '10.0.0.255');
      assert.equal(cidr.totalIps, 256);
      assert.equal(cidr.usableIpsCloud, 251); // 256 - 5 reservados em nuvem
    });

    it('deve normalizar IP de host para o endereço base da rede', () => {
      const cidr = CidrBlock.from('192.168.1.155/24');
      assert.equal(cidr.value, '192.168.1.0/24');
      assert.equal(cidr.networkIp, '192.168.1.0');
    });

    it('deve rejeitar formatos de CIDR inválidos ou octetos fora do range', () => {
      assert.throws(() => CidrBlock.from('10.0.0/24'), InvalidCidrBlockError);
      assert.throws(() => CidrBlock.from('10.0.0.256/24'), InvalidCidrBlockError);
      assert.throws(() => CidrBlock.from('10.0.0.1/33'), InvalidCidrBlockError);
      assert.throws(() => CidrBlock.from(''), InvalidCidrBlockError);
    });

    it('deve detectar sobreposição (overlap) entre blocos CIDR colidentes', () => {
      const vpcCidr = CidrBlock.from('10.0.0.0/16');
      const subnetA = CidrBlock.from('10.0.1.0/24');
      const subnetB = CidrBlock.from('10.0.1.128/25');
      const subnetC = CidrBlock.from('10.0.2.0/24');

      assert.ok(vpcCidr.overlapsWith(subnetA), 'Subnet A deve estar contida na VPC');
      assert.ok(subnetA.overlapsWith(subnetB), 'Subnet A e Subnet B colidem');
      assert.ok(!subnetA.overlapsWith(subnetC), 'Subnet A e Subnet C não colidem');
    });

    it('deve verificar continência de endereço IP individual no bloco', () => {
      const subnet = CidrBlock.from('172.16.10.0/24');
      assert.ok(subnet.contains('172.16.10.50'));
      assert.ok(subnet.contains('172.16.10.254'));
      assert.ok(!subnet.contains('172.16.11.1'));
    });
  });

  describe('RN-03: CloudResourceUrn (Identificação Canônica de Recursos)', () => {
    it('deve criar URN canônico para recursos suportados (AWS, GCP, Azure, K8s)', () => {
      const urn = CloudResourceUrn.from(
        'urn:cloudshield:aws:us-east-1:123456789012:vpc/vpc-production-main'
      );
      assert.equal(urn.provider, 'aws');
      assert.equal(urn.region, 'us-east-1');
      assert.equal(urn.account, '123456789012');
      assert.equal(urn.service, 'vpc');
      assert.equal(urn.resourceId, 'vpc-production-main');
    });

    it('deve rejeitar provedor de nuvem desconhecido ou formato inválido', () => {
      assert.throws(
        () => CloudResourceUrn.from('urn:cloudshield:oracle:sa-east-1:acc:db/inst-1'),
        InvalidResourceUrnError
      );
      assert.throws(
        () => CloudResourceUrn.from('urn:invalid:format'),
        InvalidResourceUrnError
      );
    });
  });

  describe('RN-01: FinOpsBudget (Precisão em Integer Cents e Teto Orçamentário)', () => {
    it('deve gerenciar orçamento com exatidão em centavos inteiros', () => {
      const budget = FinOpsBudget.fromCurrency(1500.5, 80); // $1,500.50 -> 150050 cents
      assert.equal(budget.monthlyLimitCents, 150050);
      assert.equal(budget.allocatedCents, 0);
      assert.equal(budget.remainingCents, 150050);
      assert.equal(budget.utilizationPercent, 0);
      assert.ok(!budget.isWarningThresholdReached());
    });

    it('deve rejeitar valores decimais não inteiros no construtor de centavos', () => {
      assert.throws(() => FinOpsBudget.fromCents(100.45), InvalidFinOpsAmountError);
      assert.throws(() => FinOpsBudget.fromCents(-500), InvalidFinOpsAmountError);
    });

    it('deve alocar custos e disparar alarme de threshold em 80%', () => {
      let budget = FinOpsBudget.fromCents(100000, 80); // 100000c = $1,000.00
      budget = budget.allocate(79000); // 79%
      assert.ok(!budget.isWarningThresholdReached());

      budget = budget.allocate(2000); // 81%
      assert.ok(budget.isWarningThresholdReached());
      assert.equal(budget.remainingCents, 19000);
    });

    it('deve bloquear alocação que ultrapasse o teto orçamentário (FinOpsBudgetExceededError)', () => {
      const budget = FinOpsBudget.fromCents(50000); // 50000c
      assert.throws(() => budget.allocate(50001), FinOpsBudgetExceededError);
    });
  });

  describe('RN-04: SecurityRule & CIS Benchmarks (Blindagem de Rede)', () => {
    it('deve permitir tráfego HTTP/HTTPS irrestrito para 0.0.0.0/0', () => {
      const ruleHttp = SecurityRule.create({
        direction: 'ingress',
        protocol: 'tcp',
        fromPort: 80,
        toPort: 80,
        sourceCidr: CidrBlock.from('0.0.0.0/0'),
        description: 'Allow HTTP Public'
      });
      const check = ruleHttp.isCisBenchmarkCompliant();
      assert.ok(check.compliant);
    });

    it('deve violar CIS Benchmark ao abrir SSH (22) ou RDP (3389) para 0.0.0.0/0', () => {
      const ruleSsh = SecurityRule.create({
        direction: 'ingress',
        protocol: 'tcp',
        fromPort: 22,
        toPort: 22,
        sourceCidr: CidrBlock.from('0.0.0.0/0'),
        description: 'Unsafe SSH'
      });
      const check = ruleSsh.isCisBenchmarkCompliant();
      assert.ok(!check.compliant);
      assert.ok(check.reason?.includes('CIS 4.1'));
      assert.throws(() => ruleSsh.validateCisCompliance(), SecurityComplianceViolationError);
    });

    it('deve permitir acesso SSH apenas quando restrito a CIDR corporativo privado', () => {
      const ruleSshBastion = SecurityRule.create({
        direction: 'ingress',
        protocol: 'tcp',
        fromPort: 22,
        toPort: 22,
        sourceCidr: CidrBlock.from('10.200.0.0/24'),
        description: 'Corporate Bastion Access'
      });
      assert.ok(ruleSshBastion.isCisBenchmarkCompliant().compliant);
    });
  });

  describe('RN-04 & RN-01: CloudResource (Entidade de Recurso & Governança)', () => {
    it('deve exigir criptografia em repouso (KMS) para bancos e clusters de mensageria', () => {
      const dbUrn = CloudResourceUrn.create('aws', 'us-east-1', '123456789012', 'rds', 'db-pg-core');
      assert.throws(
        () =>
          CloudResource.create({
            urn: dbUrn,
            name: 'CoreBankingDatabase',
            resourceType: 'rds-database',
            encryptedAtRest: false, // VIOLAÇÃO
            monthlyCostCents: 45000
          }),
        SecurityComplianceViolationError
      );
    });

    it('deve instanciar recurso de armazenamento em conformidade com KMS habilitado', () => {
      const dbUrn = CloudResourceUrn.create('aws', 'us-east-1', '123456789012', 'rds', 'db-pg-core');
      const kmsUrn = CloudResourceUrn.create('aws', 'us-east-1', '123456789012', 'kms', 'key-db');
      const resource = CloudResource.create({
        urn: dbUrn,
        name: 'CoreBankingDatabase',
        resourceType: 'rds-database',
        encryptedAtRest: true,
        kmsKeyUrn: kmsUrn,
        monthlyCostCents: 45000,
        tags: { Environment: 'prod', Project: 'TitanCore', Owner: 'Guilherme' }
      });
      assert.ok(resource.encryptedAtRest);
      assert.equal(resource.monthlyCostCents, 45000);
    });
  });

  describe('RN-05 & RN-02: InfrastructureStack (Agregado Raiz & FSM)', () => {
    it('deve gerenciar ciclo de vida da FSM com transições estritas e emissão de eventos', () => {
      const stack = InfrastructureStack.create({
        id: 'stk-01',
        name: 'TitanProductionStack',
        environment: 'prod',
        budget: FinOpsBudget.fromCents(200000) // $2,000.00
      });

      assert.equal(stack.state, 'DRAFT');

      stack.transitionTo('VALIDATING', 'Iniciando validação de sintaxe e políticas');
      assert.equal(stack.state, 'VALIDATING');

      stack.transitionTo('PLAN_READY', 'Plano de execução gerado com sucesso');
      assert.equal(stack.state, 'PLAN_READY');

      stack.transitionTo('APPLYING', 'Disparando provisionamento no provider');
      assert.equal(stack.state, 'APPLYING');

      stack.transitionTo('PROVISIONED', 'Infraestrutura provisionada com sucesso');
      assert.equal(stack.state, 'PROVISIONED');

      // Verifica eventos emitidos
      const events = stack.domainEvents;
      assert.equal(events.length, 4);
      assert.equal(events[3].eventName, 'StackStateChanged');
    });

    it('deve rejeitar transições ilegais na máquina de estados', () => {
      const stack = InfrastructureStack.create({
        id: 'stk-02',
        name: 'DevStack',
        environment: 'dev',
        budget: FinOpsBudget.fromCents(50000)
      });

      // Pular de DRAFT direto para PROVISIONED é proibido
      assert.throws(() => stack.transitionTo('PROVISIONED', 'Tentativa ilegal'), InvalidStateTransitionError);
    });

    it('deve impedir colisão de subnets com o mesmo CIDR na mesma stack', () => {
      const stack = InfrastructureStack.create({
        id: 'stk-net',
        name: 'VpcNetworkingStack',
        environment: 'prod',
        budget: FinOpsBudget.fromCents(100000)
      });

      const subnet1 = CloudResource.create({
        urn: CloudResourceUrn.create('aws', 'us-east-1', '123', 'subnet', 'sub-pub-1a'),
        name: 'SubnetPublic1A',
        resourceType: 'subnet',
        cidrBlock: CidrBlock.from('10.0.1.0/24'),
        monthlyCostCents: 500
      });

      const subnetColidente = CloudResource.create({
        urn: CloudResourceUrn.create('aws', 'us-east-1', '123', 'subnet', 'sub-priv-1a'),
        name: 'SubnetPrivate1A',
        resourceType: 'subnet',
        cidrBlock: CidrBlock.from('10.0.1.128/25'), // SOBREPÕE 10.0.1.0/24
        monthlyCostCents: 500
      });

      stack.addResource(subnet1);
      assert.throws(() => stack.addResource(subnetColidente), CidrCollisionError);
    });

    it('deve emitir alerta de threshold ao ultrapassar 80% do orçamento FinOps', () => {
      const stack = InfrastructureStack.create({
        id: 'stk-budget-alert',
        name: 'DataPlatformStack',
        environment: 'prod',
        budget: FinOpsBudget.fromCents(100000, 80) // 100000c limite, 80% aviso
      });

      const kafka = CloudResource.create({
        urn: CloudResourceUrn.create('aws', 'us-east-1', '123', 'kafka-cluster', 'msk-main'),
        name: 'KafkaCluster',
        resourceType: 'kafka-cluster',
        encryptedAtRest: true,
        monthlyCostCents: 85000 // 85% do limite
      });

      stack.addResource(kafka);
      const alertEvents = stack.domainEvents.filter(e => e.eventName === 'BudgetThresholdAlert');
      assert.equal(alertEvents.length, 1);
    });

    it('deve desalocar custo do orçamento ao remover recurso da stack', () => {
      const stack = InfrastructureStack.create({
        id: 'stk-clean',
        name: 'CleanStack',
        environment: 'dev',
        budget: FinOpsBudget.fromCents(100000)
      });

      const s3Urn = CloudResourceUrn.create('aws', 'us-east-1', '123', 's3-bucket', 'bkt-logs');
      const s3 = CloudResource.create({
        urn: s3Urn,
        name: 'LogsBucket',
        resourceType: 's3-bucket',
        encryptedAtRest: true,
        monthlyCostCents: 2000
      });

      stack.addResource(s3);
      assert.equal(stack.budget.allocatedCents, 2000);

      stack.removeResource(s3Urn);
      assert.equal(stack.budget.allocatedCents, 0);
      assert.equal(stack.totalMonthlyCostCents(), 0);
    });
  });

  describe('PolicyComplianceEngine (Motor de Avaliação de Conformidade)', () => {
    it('deve aprovar stack com recursos 100% em conformidade com segurança e FinOps', () => {
      const stack = InfrastructureStack.create({
        id: 'stk-compliant',
        name: 'CompliantProductionStack',
        environment: 'prod',
        budget: FinOpsBudget.fromCents(200000)
      });

      const rds = CloudResource.create({
        urn: CloudResourceUrn.create('aws', 'us-east-1', '123', 'rds-database', 'rds-master'),
        name: 'PostgresMaster',
        resourceType: 'rds-database',
        encryptedAtRest: true,
        monthlyCostCents: 50000,
        tags: { Environment: 'prod', Project: 'Titan', Owner: 'Guilherme' },
        metadata: { multiAz: true }
      });

      const subnet = CloudResource.create({
        urn: CloudResourceUrn.create('aws', 'us-east-1', '123', 'subnet', 'sub-data-1a'),
        name: 'SubnetData1A',
        resourceType: 'subnet',
        cidrBlock: CidrBlock.from('10.0.10.0/24'),
        monthlyCostCents: 500,
        tags: { Environment: 'prod', Project: 'Titan', Owner: 'Guilherme' }
      });

      stack.addResource(rds);
      stack.addResource(subnet);

      const evaluation = PolicyComplianceEngine.evaluateStack(stack);
      assert.ok(evaluation.compliant);
      assert.equal(evaluation.violations.length, 0);
    });

    it('deve sinalizar violações para falta de tags e falta de Multi-AZ em produção', () => {
      const stack = InfrastructureStack.create({
        id: 'stk-non-compliant',
        name: 'NonCompliantStack',
        environment: 'prod',
        budget: FinOpsBudget.fromCents(200000)
      });

      const rdsWithoutMultiAz = CloudResource.create({
        urn: CloudResourceUrn.create('aws', 'us-east-1', '123', 'rds-database', 'rds-orphan'),
        name: 'PostgresOrphan',
        resourceType: 'rds-database',
        encryptedAtRest: true,
        monthlyCostCents: 40000,
        tags: { Environment: 'prod' }, // Faltam Project e Owner
        metadata: { multiAz: false } // Produção sem Multi-AZ
      });

      stack.addResource(rdsWithoutMultiAz);

      const evaluation = PolicyComplianceEngine.evaluateStack(stack);
      assert.ok(!evaluation.compliant);
      assert.ok(evaluation.violations.some(v => v.ruleId === 'POL-005-MULTI-AZ-REQUIRED'));
      assert.ok(evaluation.violations.some(v => v.ruleId === 'POL-004-MANDATORY-TAGS'));
    });
  });
});
