import { FinOpsBudgetExceededError, InvalidFinOpsAmountError } from '../errors/domain-errors.js';

export class FinOpsBudget {
  private readonly _monthlyLimitCents: number;
  private readonly _allocatedCents: number;
  private readonly _warningThresholdPercent: number;

  private constructor(monthlyLimitCents: number, allocatedCents: number, warningThresholdPercent: number) {
    this._monthlyLimitCents = monthlyLimitCents;
    this._allocatedCents = allocatedCents;
    this._warningThresholdPercent = warningThresholdPercent;
  }

  public static fromCents(monthlyLimitCents: number, warningThresholdPercent: number = 80): FinOpsBudget {
    if (typeof monthlyLimitCents !== 'number' || !Number.isInteger(monthlyLimitCents)) {
      throw new InvalidFinOpsAmountError(monthlyLimitCents, 'O limite orçamentário deve ser um número inteiro em centavos.');
    }
    if (monthlyLimitCents <= 0) {
      throw new InvalidFinOpsAmountError(monthlyLimitCents, 'O limite orçamentário mensal deve ser estritamente positivo (> 0c).');
    }
    if (warningThresholdPercent <= 0 || warningThresholdPercent > 100) {
      throw new InvalidFinOpsAmountError(warningThresholdPercent, 'O percentual de alerta de threshold deve estar entre 1% e 100%.');
    }

    return new FinOpsBudget(monthlyLimitCents, 0, warningThresholdPercent);
  }

  public static fromCurrency(amount: number, warningThresholdPercent: number = 80): FinOpsBudget {
    if (typeof amount !== 'number' || isNaN(amount) || amount <= 0) {
      throw new InvalidFinOpsAmountError(amount, 'O valor em moeda deve ser positivo.');
    }
    const cents = Math.round(amount * 100);
    return FinOpsBudget.fromCents(cents, warningThresholdPercent);
  }

  public get monthlyLimitCents(): number {
    return this._monthlyLimitCents;
  }

  public get allocatedCents(): number {
    return this._allocatedCents;
  }

  public get remainingCents(): number {
    return Math.max(0, this._monthlyLimitCents - this._allocatedCents);
  }

  public get utilizationPercent(): number {
    if (this._monthlyLimitCents === 0) return 0;
    return Number(((this._allocatedCents / this._monthlyLimitCents) * 100).toFixed(2));
  }

  public get warningThresholdPercent(): number {
    return this._warningThresholdPercent;
  }

  public isWarningThresholdReached(): boolean {
    return this.utilizationPercent >= this._warningThresholdPercent;
  }

  public isLimitReached(): boolean {
    return this._allocatedCents >= this._monthlyLimitCents;
  }

  public allocate(costCents: number): FinOpsBudget {
    if (typeof costCents !== 'number' || !Number.isInteger(costCents) || costCents < 0) {
      throw new InvalidFinOpsAmountError(costCents, 'O custo a ser alocado deve ser um inteiro não-negativo em centavos.');
    }

    const novoTotal = this._allocatedCents + costCents;
    if (novoTotal > this._monthlyLimitCents) {
      throw new FinOpsBudgetExceededError(this._allocatedCents, costCents, this._monthlyLimitCents);
    }

    return new FinOpsBudget(this._monthlyLimitCents, novoTotal, this._warningThresholdPercent);
  }

  public deallocate(costCents: number): FinOpsBudget {
    if (typeof costCents !== 'number' || !Number.isInteger(costCents) || costCents < 0) {
      throw new InvalidFinOpsAmountError(costCents, 'O custo a desalocar deve ser um inteiro não-negativo.');
    }

    const novoTotal = Math.max(0, this._allocatedCents - costCents);
    return new FinOpsBudget(this._monthlyLimitCents, novoTotal, this._warningThresholdPercent);
  }

  public format(currencySymbol: string = 'USD'): string {
    const dollars = (this._monthlyLimitCents / 100).toFixed(2);
    const allocated = (this._allocatedCents / 100).toFixed(2);
    return `${currencySymbol} ${allocated} / ${currencySymbol} ${dollars} (${this.utilizationPercent}%)`;
  }
}
