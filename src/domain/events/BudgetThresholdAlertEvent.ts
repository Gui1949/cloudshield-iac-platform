import { randomUUID } from 'node:crypto';
import { DomainEvent } from './DomainEvent.js';

export class BudgetThresholdAlertEvent implements DomainEvent {
  public readonly eventId: string;
  public readonly occurredAt: Date;
  public readonly eventName = 'BudgetThresholdAlert';

  constructor(
    public readonly stackId: string,
    public readonly currentCostCents: number,
    public readonly limitCents: number,
    public readonly thresholdPercent: number
  ) {
    this.eventId = randomUUID();
    this.occurredAt = new Date();
  }
}
