import {
  CidrCollisionError,
  DuplicateResourceError,
  InvalidStateTransitionError,
  ResourceNotFoundError
} from '../errors/domain-errors.js';
import { BudgetThresholdAlertEvent } from '../events/BudgetThresholdAlertEvent.js';
import { DomainEvent } from '../events/DomainEvent.js';
import { StackState, StackStateChangedEvent } from '../events/StackStateChangedEvent.js';
import { CloudResourceUrn } from '../value-objects/CloudResourceUrn.js';
import { FinOpsBudget } from '../value-objects/FinOpsBudget.js';
import { CloudResource } from './CloudResource.js';

export interface InfrastructureStackProps {
  id: string;
  name: string;
  environment: 'dev' | 'staging' | 'prod';
  budget: FinOpsBudget;
  initialState?: StackState;
  version?: number;
}

export class InfrastructureStack {
  private static readonly VALID_TRANSITIONS: Record<StackState, StackState[]> = {
    DRAFT: ['VALIDATING', 'DESTROYED'],
    VALIDATING: ['PLAN_READY', 'FAILED'],
    PLAN_READY: ['APPLYING', 'DRAFT'],
    APPLYING: ['PROVISIONED', 'FAILED'],
    PROVISIONED: ['DRIFTED', 'APPLYING', 'DESTROYED'],
    DRIFTED: ['APPLYING', 'PLAN_READY', 'DESTROYED'],
    FAILED: ['DRAFT', 'VALIDATING', 'DESTROYED'],
    DESTROYED: [] // Estado terminal
  };

  private readonly _id: string;
  private readonly _name: string;
  private readonly _environment: 'dev' | 'staging' | 'prod';
  private _state: StackState;
  private _budget: FinOpsBudget;
  private _version: number;
  private readonly _resources: Map<string, CloudResource> = new Map();
  private readonly _domainEvents: DomainEvent[] = [];

  private constructor(props: InfrastructureStackProps) {
    this._id = props.id;
    this._name = props.name;
    this._environment = props.environment;
    this._budget = props.budget;
    this._state = props.initialState ?? 'DRAFT';
    this._version = props.version ?? 1;
  }

  public static create(props: InfrastructureStackProps): InfrastructureStack {
    if (!props.id || props.id.trim().length === 0) {
      throw new Error('ID da stack não pode ser vazio.');
    }
    if (!props.name || props.name.trim().length === 0) {
      throw new Error('Nome da stack não pode ser vazio.');
    }
    return new InfrastructureStack(props);
  }

  public get id(): string {
    return this._id;
  }

  public get name(): string {
    return this._name;
  }

  public get environment(): 'dev' | 'staging' | 'prod' {
    return this._environment;
  }

  public get state(): StackState {
    return this._state;
  }

  public get version(): number {
    return this._version;
  }

  public incrementVersion(): void {
    this._version++;
  }

  public setVersion(v: number): void {
    this._version = v;
  }

  public get budget(): FinOpsBudget {
    return this._budget;
  }

  public get resources(): readonly CloudResource[] {
    return Array.from(this._resources.values());
  }

  public get domainEvents(): readonly DomainEvent[] {
    return [...this._domainEvents];
  }

  public clearDomainEvents(): void {
    this._domainEvents.length = 0;
  }

  public addResource(resource: CloudResource): void {
    const urnStr = resource.urn.value;
    if (this._resources.has(urnStr)) {
      throw new DuplicateResourceError(urnStr);
    }

    // RN-02: Se for recurso de rede com CIDR (ex: subnet), verifica se colide com outro recurso já existente
    if (resource.cidrBlock) {
      for (const existing of this._resources.values()) {
        if (existing.cidrBlock && existing.resourceType === resource.resourceType) {
          if (resource.cidrBlock.overlapsWith(existing.cidrBlock)) {
            throw new CidrCollisionError(
              resource.cidrBlock.value,
              existing.cidrBlock.value,
              resource.name,
              existing.name
            );
          }
        }
      }
    }

    // RN-01: Aloca custo no orçamento FinOps (lança FinOpsBudgetExceededError se estourar o limite)
    const budgetAnterior = this._budget;
    this._budget = this._budget.allocate(resource.monthlyCostCents);

    // Se cruzou o threshold de alerta após a alocação, emite evento de alerta
    if (!budgetAnterior.isWarningThresholdReached() && this._budget.isWarningThresholdReached()) {
      this._domainEvents.push(
        new BudgetThresholdAlertEvent(
          this._id,
          this._budget.allocatedCents,
          this._budget.monthlyLimitCents,
          this._budget.warningThresholdPercent
        )
      );
    }

    this._resources.set(urnStr, resource);
  }

  public removeResource(urn: CloudResourceUrn): void {
    const urnStr = urn.value;
    const existing = this._resources.get(urnStr);
    if (!existing) {
      throw new ResourceNotFoundError(urnStr);
    }

    this._budget = this._budget.deallocate(existing.monthlyCostCents);
    this._resources.delete(urnStr);
  }

  public getResource(urn: CloudResourceUrn): CloudResource | undefined {
    return this._resources.get(urn.value);
  }

  public transitionTo(nextState: StackState, reason: string): void {
    const allowed = InfrastructureStack.VALID_TRANSITIONS[this._state] || [];
    if (!allowed.includes(nextState)) {
      throw new InvalidStateTransitionError(
        this._state,
        nextState,
        `Transições permitidas a partir de '${this._state}': [${allowed.join(', ')}]`
      );
    }

    const previousState = this._state;
    this._state = nextState;
    this._domainEvents.push(new StackStateChangedEvent(this._id, previousState, nextState, reason));
  }

  public totalMonthlyCostCents(): number {
    let total = 0;
    for (const r of this._resources.values()) {
      total += r.monthlyCostCents;
    }
    return total;
  }

  public clone(): InfrastructureStack {
    const cloned = new InfrastructureStack({
      id: this._id,
      name: this._name,
      environment: this._environment,
      budget: this._budget,
      initialState: this._state,
      version: this._version
    });

    for (const res of this._resources.values()) {
      cloned._resources.set(res.urn.value, res);
    }

    return cloned;
  }
}
