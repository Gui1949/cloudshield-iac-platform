import { InvalidCidrBlockError } from '../errors/domain-errors.js';

export class CidrBlock {
  private readonly _cidr: string;
  private readonly _networkIpInt: number;
  private readonly _broadcastIpInt: number;
  private readonly _prefix: number;

  private constructor(cidr: string, networkIpInt: number, broadcastIpInt: number, prefix: number) {
    this._cidr = cidr;
    this._networkIpInt = networkIpInt;
    this._broadcastIpInt = broadcastIpInt;
    this._prefix = prefix;
  }

  public static from(cidr: string): CidrBlock {
    if (!cidr || typeof cidr !== 'string') {
      throw new InvalidCidrBlockError(String(cidr), 'Bloco CIDR não pode ser nulo ou vazio.');
    }

    const trimmed = cidr.trim();
    const parts = trimmed.split('/');
    if (parts.length !== 2) {
      throw new InvalidCidrBlockError(trimmed, 'Formato inválido. Esperado padrão IPv4: x.x.x.x/prefixo.');
    }

    const [ipPart, prefixPart] = parts;
    const prefix = parseInt(prefixPart, 10);

    if (isNaN(prefix) || prefix < 0 || prefix > 32) {
      throw new InvalidCidrBlockError(trimmed, 'Prefixo de sub-rede deve ser um inteiro entre 0 e 32.');
    }

    const octets = ipPart.split('.');
    if (octets.length !== 4) {
      throw new InvalidCidrBlockError(trimmed, 'Endereço IPv4 deve conter exatamente 4 octetos.');
    }

    let ipInt = 0;
    for (let i = 0; i < 4; i++) {
      const octet = parseInt(octets[i], 10);
      if (isNaN(octet) || octet < 0 || octet > 255 || String(octet) !== octets[i]) {
        throw new InvalidCidrBlockError(trimmed, `Octeto '${octets[i]}' inválido. Deve ser entre 0 e 255.`);
      }
      ipInt = (ipInt << 8) | octet;
      // Garante representação unsigned de 32 bits
      ipInt = ipInt >>> 0;
    }

    // Calcula máscara de rede de 32 bits
    const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
    const networkIpInt = (ipInt & mask) >>> 0;
    const invertedMask = (~mask) >>> 0;
    const broadcastIpInt = (networkIpInt | invertedMask) >>> 0;

    const normalizedNetworkIp = CidrBlock.intToIp(networkIpInt);
    const normalizedCidr = `${normalizedNetworkIp}/${prefix}`;

    return new CidrBlock(normalizedCidr, networkIpInt, broadcastIpInt, prefix);
  }

  public get value(): string {
    return this._cidr;
  }

  public get prefix(): number {
    return this._prefix;
  }

  public get networkIp(): string {
    return CidrBlock.intToIp(this._networkIpInt);
  }

  public get broadcastIp(): string {
    return CidrBlock.intToIp(this._broadcastIpInt);
  }

  public get totalIps(): number {
    if (this._prefix === 0) return 4294967296;
    return Math.pow(2, 32 - this._prefix);
  }

  public get usableIpsCloud(): number {
    // Provedores de nuvem (AWS/GCP/Azure) reservam tipicamente 5 IPs por subnet
    const total = this.totalIps;
    return total <= 5 ? 0 : total - 5;
  }

  public overlapsWith(other: CidrBlock): boolean {
    if (!other) return false;
    return this._networkIpInt <= other._broadcastIpInt && this._broadcastIpInt >= other._networkIpInt;
  }

  public contains(ip: string): boolean {
    try {
      const octets = ip.trim().split('.');
      if (octets.length !== 4) return false;
      let ipInt = 0;
      for (const octetStr of octets) {
        const octet = parseInt(octetStr, 10);
        if (isNaN(octet) || octet < 0 || octet > 255) return false;
        ipInt = ((ipInt << 8) | octet) >>> 0;
      }
      return ipInt >= this._networkIpInt && ipInt <= this._broadcastIpInt;
    } catch {
      return false;
    }
  }

  public equals(other: CidrBlock): boolean {
    if (!other) return false;
    return this._cidr === other._cidr;
  }

  private static intToIp(intVal: number): string {
    const o1 = (intVal >>> 24) & 255;
    const o2 = (intVal >>> 16) & 255;
    const o3 = (intVal >>> 8) & 255;
    const o4 = intVal & 255;
    return `${o1}.${o2}.${o3}.${o4}`;
  }
}
