import { InvalidFinOpsAmountError, SecurityComplianceViolationError } from '../errors/domain-errors.js';
import { CidrBlock } from '../value-objects/CidrBlock.js';
import { CloudResourceUrn } from '../value-objects/CloudResourceUrn.js';
import { SecurityRule } from '../value-objects/SecurityRule.js';

export type ResourceType =
  | 'vpc'
  | 'subnet'
  | 'security-group'
  | 'rds-database'
  | 'kafka-cluster'
  | 'eks-cluster'
  | 's3-bucket'
  | 'iam-role';

export interface CloudResourceProps {
  urn: CloudResourceUrn;
  name: string;
  resourceType: ResourceType;
  cidrBlock?: CidrBlock;
  securityRules?: SecurityRule[];
  encryptedAtRest?: boolean;
  kmsKeyUrn?: CloudResourceUrn;
  monthlyCostCents: number;
  tags?: Record<string, string>;
  metadata?: Record<string, unknown>;
}

export class CloudResource {
  private readonly _urn: CloudResourceUrn;
  private readonly _name: string;
  private readonly _resourceType: ResourceType;
  private readonly _cidrBlock?: CidrBlock;
  private readonly _securityRules: SecurityRule[];
  private readonly _encryptedAtRest: boolean;
  private readonly _kmsKeyUrn?: CloudResourceUrn;
  private readonly _monthlyCostCents: number;
  private readonly _tags: Record<string, string>;
  private readonly _metadata: Record<string, unknown>;

  private constructor(props: CloudResourceProps) {
    this._urn = props.urn;
    this._name = props.name;
    this._resourceType = props.resourceType;
    this._cidrBlock = props.cidrBlock;
    this._securityRules = props.securityRules ? [...props.securityRules] : [];
    this._encryptedAtRest = props.encryptedAtRest ?? false;
    this._kmsKeyUrn = props.kmsKeyUrn;
    this._monthlyCostCents = props.monthlyCostCents;
    this._tags = props.tags ? { ...props.tags } : {};
    this._metadata = props.metadata ? { ...props.metadata } : {};
  }

  public static create(props: CloudResourceProps): CloudResource {
    if (!props.name || props.name.trim().length === 0) {
      throw new Error('Nome do recurso de nuvem não pode ser vazio.');
    }

    if (
      typeof props.monthlyCostCents !== 'number' ||
      !Number.isInteger(props.monthlyCostCents) ||
      props.monthlyCostCents < 0
    ) {
      throw new InvalidFinOpsAmountError(props.monthlyCostCents, 'Custo mensal do recurso deve ser um inteiro não-negativo em centavos.');
    }

    if (props.resourceType === 'vpc' || props.resourceType === 'subnet') {
      if (!props.cidrBlock) {
        throw new Error(`Recursos do tipo '${props.resourceType}' exigem um bloco CIDR obrigatório.`);
      }
    }

    const resource = new CloudResource(props);
    resource.validateSecurityCompliance();
    return resource;
  }

  public get urn(): CloudResourceUrn {
    return this._urn;
  }

  public get name(): string {
    return this._name;
  }

  public get resourceType(): ResourceType {
    return this._resourceType;
  }

  public get cidrBlock(): CidrBlock | undefined {
    return this._cidrBlock;
  }

  public get securityRules(): readonly SecurityRule[] {
    return this._securityRules;
  }

  public get encryptedAtRest(): boolean {
    return this._encryptedAtRest;
  }

  public get kmsKeyUrn(): CloudResourceUrn | undefined {
    return this._kmsKeyUrn;
  }

  public get monthlyCostCents(): number {
    return this._monthlyCostCents;
  }

  public get tags(): Readonly<Record<string, string>> {
    return this._tags;
  }

  public get metadata(): Readonly<Record<string, unknown>> {
    return this._metadata;
  }

  public validateSecurityCompliance(): void {
    // 1. Recursos de armazenamento ou bancos exigem encriptação em repouso (KMS)
    const storageTypes: ResourceType[] = ['rds-database', 'kafka-cluster', 's3-bucket'];
    if (storageTypes.includes(this._resourceType)) {
      if (!this._encryptedAtRest) {
        throw new SecurityComplianceViolationError(
          'KMS-Encryption-Mandatory',
          `Recurso '${this._name}' (${this._resourceType}) deve ter criptografia em repouso habilitada (encryptedAtRest: true).`
        );
      }
    }

    // 2. Valida todas as regras de segurança contra CIS Benchmarks
    for (const rule of this._securityRules) {
      rule.validateCisCompliance();
    }
  }
}
