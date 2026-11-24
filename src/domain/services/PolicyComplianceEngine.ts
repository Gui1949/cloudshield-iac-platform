import { CloudResource } from '../entities/CloudResource.js';
import { InfrastructureStack } from '../entities/InfrastructureStack.js';

export interface PolicyViolation {
  ruleId: string;
  resourceUrn: string;
  resourceName: string;
  severity: 'MEDIUM' | 'HIGH' | 'CRITICAL';
  description: string;
}

export interface ComplianceEvaluationResult {
  compliant: boolean;
  totalResourcesEvaluated: number;
  violations: PolicyViolation[];
  evaluatedAt: Date;
}

export class PolicyComplianceEngine {
  public static evaluateStack(stack: InfrastructureStack): ComplianceEvaluationResult {
    return PolicyComplianceEngine.evaluateResources(stack.resources, stack.environment);
  }

  public static evaluateResources(
    resources: readonly CloudResource[],
    environment: 'dev' | 'staging' | 'prod'
  ): ComplianceEvaluationResult {
    const violations: PolicyViolation[] = [];

    for (const resource of resources) {
      // POL-001: CIS Benchmarks - Regras de Segurança
      for (const rule of resource.securityRules) {
        const check = rule.isCisBenchmarkCompliant();
        if (!check.compliant) {
          violations.push({
            ruleId: 'POL-001-CIS-BENCHMARK',
            resourceUrn: resource.urn.value,
            resourceName: resource.name,
            severity: 'CRITICAL',
            description: check.reason || 'Violação de regras de portas restritas abertas para 0.0.0.0/0.'
          });
        }
      }

      // POL-002: Criptografia em Repouso Obrigatória (KMS)
      const dataStoreTypes = ['rds-database', 'kafka-cluster', 's3-bucket'];
      if (dataStoreTypes.includes(resource.resourceType) && !resource.encryptedAtRest) {
        violations.push({
          ruleId: 'POL-002-ENCRYPTION-AT-REST',
          resourceUrn: resource.urn.value,
          resourceName: resource.name,
          severity: 'CRITICAL',
          description: `O recurso '${resource.name}' (${resource.resourceType}) exige criptografia KMS em repouso habilitada.`
        });
      }

      // POL-003: Prefixo de Subnet Corporativa
      if (resource.resourceType === 'subnet' && resource.cidrBlock) {
        const prefix = resource.cidrBlock.prefix;
        if (prefix < 16 || prefix > 28) {
          violations.push({
            ruleId: 'POL-003-SUBNET-PREFIX-RANGE',
            resourceUrn: resource.urn.value,
            resourceName: resource.name,
            severity: 'HIGH',
            description: `Prefixo CIDR /${prefix} de '${resource.name}' fora do padrão corporativo recomendado (/16 a /28).`
          });
        }
      }

      // POL-004: Tags Corporativas Obrigatórias
      const mandatoryTags = ['Environment', 'Project', 'Owner'];
      for (const tag of mandatoryTags) {
        if (!resource.tags[tag]) {
          violations.push({
            ruleId: 'POL-004-MANDATORY-TAGS',
            resourceUrn: resource.urn.value,
            resourceName: resource.name,
            severity: 'MEDIUM',
            description: `Recurso '${resource.name}' não possui a tag obrigatória de governança: '${tag}'.`
          });
        }
      }

      // POL-005: Alta Disponibilidade Multi-AZ em Staging e Produção
      if ((environment === 'staging' || environment === 'prod') && resource.resourceType === 'rds-database') {
        const isMultiAz = resource.metadata['multiAz'] === true;
        if (!isMultiAz) {
          violations.push({
            ruleId: 'POL-005-MULTI-AZ-REQUIRED',
            resourceUrn: resource.urn.value,
            resourceName: resource.name,
            severity: 'HIGH',
            description: `Banco de dados de missão crítica em ambiente '${environment}' exige configuração Multi-AZ (metadata.multiAz: true).`
          });
        }
      }
    }

    return {
      compliant: violations.length === 0,
      totalResourcesEvaluated: resources.length,
      violations,
      evaluatedAt: new Date()
    };
  }
}
