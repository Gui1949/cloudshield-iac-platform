import { InvalidResourceUrnError } from '../errors/domain-errors.js';

export type CloudProvider = 'aws' | 'gcp' | 'azure' | 'k8s';

export class CloudResourceUrn {
  private static readonly URN_REGEX =
    /^urn:cloudshield:(aws|gcp|azure|k8s):([a-z0-9-]+):([a-zA-Z0-9_-]+):([a-z0-9_-]+)\/([a-zA-Z0-9._-]+)$/;

  private readonly _urn: string;
  private readonly _provider: CloudProvider;
  private readonly _region: string;
  private readonly _account: string;
  private readonly _service: string;
  private readonly _resourceId: string;

  private constructor(
    urn: string,
    provider: CloudProvider,
    region: string,
    account: string,
    service: string,
    resourceId: string
  ) {
    this._urn = urn;
    this._provider = provider;
    this._region = region;
    this._account = account;
    this._service = service;
    this._resourceId = resourceId;
  }

  public static from(urn: string): CloudResourceUrn {
    if (!urn || typeof urn !== 'string') {
      throw new InvalidResourceUrnError(String(urn), 'URN não pode ser nulo ou vazio.');
    }

    const trimmed = urn.trim();
    const match = trimmed.match(CloudResourceUrn.URN_REGEX);

    if (!match) {
      throw new InvalidResourceUrnError(
        trimmed,
        'Formato inválido. Padrão esperado: urn:cloudshield:{provider}:{region}:{account}:{service}/{resourceId}'
      );
    }

    const [, providerStr, region, account, service, resourceId] = match;
    const provider = providerStr as CloudProvider;

    return new CloudResourceUrn(trimmed, provider, region, account, service, resourceId);
  }

  public static create(
    provider: CloudProvider,
    region: string,
    account: string,
    service: string,
    resourceId: string
  ): CloudResourceUrn {
    const rawUrn = `urn:cloudshield:${provider}:${region}:${account}:${service}/${resourceId}`;
    return CloudResourceUrn.from(rawUrn);
  }

  public get value(): string {
    return this._urn;
  }

  public get provider(): CloudProvider {
    return this._provider;
  }

  public get region(): string {
    return this._region;
  }

  public get account(): string {
    return this._account;
  }

  public get service(): string {
    return this._service;
  }

  public get resourceId(): string {
    return this._resourceId;
  }

  public equals(other: CloudResourceUrn): boolean {
    if (!other) return false;
    return this._urn === other._urn;
  }

  public toString(): string {
    return this._urn;
  }
}
