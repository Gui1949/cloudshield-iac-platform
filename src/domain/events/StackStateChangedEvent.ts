import { randomUUID } from 'node:crypto';
import { DomainEvent } from './DomainEvent.js';

export type StackState =
  | 'DRAFT'
  | 'VALIDATING'
  | 'PLAN_READY'
  | 'APPLYING'
  | 'PROVISIONED'
  | 'DRIFTED'
  | 'FAILED'
  | 'DESTROYED';

export class StackStateChangedEvent implements DomainEvent {
  public readonly eventId: string;
  public readonly occurredAt: Date;
  public readonly eventName = 'StackStateChanged';

  constructor(
    public readonly stackId: string,
    public readonly fromState: StackState,
    public readonly toState: StackState,
    public readonly reason: string
  ) {
    this.eventId = randomUUID();
    this.occurredAt = new Date();
  }
}
