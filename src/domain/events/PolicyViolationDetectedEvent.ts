import { randomUUID } from 'node:crypto';
import { DomainEvent } from './DomainEvent.js';

export class PolicyViolationDetectedEvent implements DomainEvent {
  public readonly eventId: string;
  public readonly occurredAt: Date;
  public readonly eventName = 'PolicyViolationDetected';

  constructor(
    public readonly stackId: string,
    public readonly resourceUrn: string,
    public readonly ruleName: string,
    public readonly detail: string
  ) {
    this.eventId = randomUUID();
    this.occurredAt = new Date();
  }
}
