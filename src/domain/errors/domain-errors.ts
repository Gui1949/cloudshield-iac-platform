export abstract class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    (Error as unknown as { captureStackTrace?: (err: Error, fn: Function) => void }).captureStackTrace?.(
      this,
      this.constructor
    );
  }
}

export class InvalidCidrBlockError extends DomainError {
  constructor(cidr: string, reason: string) {
    super(`[RN-02] Bloco CIDR inválido '${cidr}': ${reason}`);
  }
}

export class CidrCollisionError extends DomainError {
  constructor(cidrA: string, cidrB: string, resourceA: string, resourceB: string) {
    super(`[RN-02] Colisão de CIDR detectada: '${cidrA}' (${resourceA}) sobrepõe '${cidrB}' (${resourceB})`);
  }
}

export class InvalidResourceUrnError extends DomainError {
  constructor(urn: string, reason: string) {
    super(`[RN-03] URN de recurso de nuvem inválido '${urn}': ${reason}`);
  }
}

export class InvalidFinOpsAmountError extends DomainError {
  constructor(cents: number, reason: string) {
    super(`[RN-01] Valor FinOps inválido '${cents}': ${reason}`);
  }
}

export class FinOpsBudgetExceededError extends DomainError {
  constructor(custoAtual: number, custoAdicional: number, tetoOrcamentario: number) {
    super(
      `[RN-01] Teto orçamentário FinOps excedido: Custo atual (${custoAtual}c) + Adicional (${custoAdicional}c) = ${custoAtual + custoAdicional}c ultrapassa o limite de ${tetoOrcamentario}c`
    );
  }
}

export class SecurityComplianceViolationError extends DomainError {
  constructor(ruleName: string, violationDetail: string) {
    super(`[RN-04] Violação de conformidade de segurança (${ruleName}): ${violationDetail}`);
  }
}

export class InvalidStateTransitionError extends DomainError {
  constructor(estadoAtual: string, novoEstado: string, motivo: string) {
    super(`[RN-05] Transição de estado inválida de '${estadoAtual}' para '${novoEstado}': ${motivo}`);
  }
}

export class DuplicateResourceError extends DomainError {
  constructor(urn: string) {
    super(`Recurso duplicado na stack: Recurso com URN '${urn}' já está registrado.`);
  }
}

export class ResourceNotFoundError extends DomainError {
  constructor(urn: string) {
    super(`Recurso não encontrado na stack: '${urn}'`);
  }
}
