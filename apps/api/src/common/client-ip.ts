import { BlockList, isIP } from 'node:net';

function normalize(ip: string | undefined): string {
  if (!ip) return 'unknown';
  return ip.startsWith('::ffff:') ? ip.slice(7) : ip;
}

/**
 * Resolves the real client address. `CF-Connecting-IP` and `X-Forwarded-For` are honoured only
 * when the TCP peer is one of the trusted proxies (IPs or CIDRs); otherwise they are ignored,
 * so a client cannot spoof its address to dodge rate limits.
 */
export class ClientIpResolver {
  private readonly trusted = new BlockList();
  private readonly enabled: boolean;

  constructor(trustedProxies: string | undefined) {
    const entries = (trustedProxies ?? '')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
    this.enabled = entries.length > 0;
    for (const entry of entries) {
      const [address, prefix] = entry.split('/');
      const family = address ? isIP(address) : 0;
      if (!address || family === 0) throw new Error('TRUSTED_PROXIES contains an invalid address');
      const type = family === 4 ? 'ipv4' : 'ipv6';
      if (prefix === undefined) this.trusted.addAddress(address, type);
      else this.trusted.addSubnet(address, Number(prefix), type);
    }
  }

  private isTrusted(ip: string): boolean {
    const family = isIP(ip);
    if (family === 0) return false;
    return this.trusted.check(ip, family === 4 ? 'ipv4' : 'ipv6');
  }

  resolve(
    remoteAddress: string | undefined,
    headers: Record<string, string | string[] | undefined>,
  ): string {
    const peer = normalize(remoteAddress);
    if (!this.enabled || !this.isTrusted(peer)) return peer;

    const cf = headers['cf-connecting-ip'];
    const cfValue = (Array.isArray(cf) ? cf[0] : cf)?.trim();
    if (cfValue && isIP(cfValue)) return normalize(cfValue);

    const xff = headers['x-forwarded-for'];
    const chain = (Array.isArray(xff) ? xff.join(',') : (xff ?? ''))
      .split(',')
      .map((part) => normalize(part.trim()))
      .filter((part) => isIP(part) !== 0);
    // Walk from the right: the first address that is not one of our proxies is the client.
    for (let i = chain.length - 1; i >= 0; i--) {
      const candidate = chain[i];
      if (candidate && !this.isTrusted(candidate)) return candidate;
    }
    return peer;
  }
}
