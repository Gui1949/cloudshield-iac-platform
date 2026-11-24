import { SecurityComplianceViolationError } from '../errors/domain-errors.js';
import { CidrBlock } from './CidrBlock.js';

export type TrafficDirection = 'ingress' | 'egress';
export type NetworkProtocol = 'tcp' | 'udp' | 'icmp' | 'all';

export interface SecurityRuleProps {
  direction: TrafficDirection;
  protocol: NetworkProtocol;
  fromPort: number;
  toPort: number;
  sourceCidr: CidrBlock;
  description: string;
}

export class SecurityRule {
  private static readonly RESTRICTED_PORTS_OPEN_INTERNET: Record<number, string> = {
    22: 'CIS 4.1 - Acesso administrativo SSH (porta 22) não pode estar aberto para o mundo (0.0.0.0/0)',
    3389: 'CIS 4.2 - Acesso administrativo RDP (porta 3389) não pode estar aberto para o mundo (0.0.0.0/0)',
    5432: 'Acesso direto a banco de dados PostgreSQL (porta 5432) proibido via 0.0.0.0/0',
    3306: 'Acesso direto a banco de dados MySQL (porta 3306) proibido via 0.0.0.0/0',
    1433: 'Acesso direto a banco de dados MSSQL (porta 1433) proibido via 0.0.0.0/0',
    9092: 'Acesso direto ao broker Apache Kafka (porta 9092) proibido via 0.0.0.0/0',
    6379: 'Acesso direto ao cache Redis (porta 6379) proibido via 0.0.0.0/0'
  };

  private readonly _direction: TrafficDirection;
  private readonly _protocol: NetworkProtocol;
  private readonly _fromPort: number;
  private readonly _toPort: number;
  private readonly _sourceCidr: CidrBlock;
  private readonly _description: string;

  private constructor(props: SecurityRuleProps) {
    this._direction = props.direction;
    this._protocol = props.protocol;
    this._fromPort = props.fromPort;
    this._toPort = props.toPort;
    this._sourceCidr = props.sourceCidr;
    this._description = props.description;
  }

  public static create(props: SecurityRuleProps): SecurityRule {
    if (props.fromPort < 0 || props.fromPort > 65535) {
      throw new SecurityComplianceViolationError('PortRange', `Porta inicial '${props.fromPort}' fora do intervalo 0-65535.`);
    }
    if (props.toPort < 0 || props.toPort > 65535) {
      throw new SecurityComplianceViolationError('PortRange', `Porta final '${props.toPort}' fora do intervalo 0-65535.`);
    }
    if (props.fromPort > props.toPort) {
      throw new SecurityComplianceViolationError('PortRange', `Porta inicial (${props.fromPort}) não pode ser maior que final (${props.toPort}).`);
    }

    return new SecurityRule(props);
  }

  public get direction(): TrafficDirection {
    return this._direction;
  }

  public get protocol(): NetworkProtocol {
    return this._protocol;
  }

  public get fromPort(): number {
    return this._fromPort;
  }

  public get toPort(): number {
    return this._toPort;
  }

  public get sourceCidr(): CidrBlock {
    return this._sourceCidr;
  }

  public get description(): string {
    return this._description;
  }

  public isCisBenchmarkCompliant(): { compliant: boolean; reason?: string } {
    if (this._direction !== 'ingress') {
      return { compliant: true };
    }

    const isOpenToWorld = this._sourceCidr.value === '0.0.0.0/0';
    if (!isOpenToWorld) {
      return { compliant: true };
    }

    // Se está aberto para 0.0.0.0/0, verifica se intercepta alguma porta restrita
    for (const [portStr, reason] of Object.entries(SecurityRule.RESTRICTED_PORTS_OPEN_INTERNET)) {
      const port = Number(portStr);
      if (this.coversPort(port)) {
        return { compliant: false, reason };
      }
    }

    return { compliant: true };
  }

  public validateCisCompliance(): void {
    const check = this.isCisBenchmarkCompliant();
    if (!check.compliant) {
      throw new SecurityComplianceViolationError('CIS-Benchmark', check.reason || 'Regra de segurança viola padrões CIS.');
    }
  }

  public coversPort(port: number): boolean {
    if (this._protocol === 'all') return true;
    return port >= this._fromPort && port <= this._toPort;
  }
}
