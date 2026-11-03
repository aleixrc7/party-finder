import { describe, expect, it } from 'vitest';
import { ClientIpResolver } from '../../src/common/client-ip';

describe('ClientIpResolver', () => {
  it('uses the socket address and ignores forwarded headers without trusted proxies', () => {
    const resolver = new ClientIpResolver(undefined);
    expect(
      resolver.resolve('203.0.113.5', {
        'x-forwarded-for': '1.2.3.4',
        'cf-connecting-ip': '5.6.7.8',
      }),
    ).toBe('203.0.113.5');
  });

  it('ignores forwarded headers from an untrusted peer', () => {
    const resolver = new ClientIpResolver('10.0.0.1');
    expect(resolver.resolve('203.0.113.5', { 'cf-connecting-ip': '1.2.3.4' })).toBe('203.0.113.5');
  });

  it('prefers CF-Connecting-IP from a trusted proxy', () => {
    const resolver = new ClientIpResolver('10.0.0.1');
    expect(resolver.resolve('10.0.0.1', { 'cf-connecting-ip': '198.51.100.9' })).toBe(
      '198.51.100.9',
    );
  });

  it('walks X-Forwarded-For from the right, skipping trusted proxies (spoofed left entries lose)', () => {
    const resolver = new ClientIpResolver('10.0.0.0/8');
    expect(
      resolver.resolve('10.1.1.1', { 'x-forwarded-for': '6.6.6.6, 198.51.100.9, 10.2.2.2' }),
    ).toBe('198.51.100.9');
  });

  it('falls back to the peer for invalid header values and normalises IPv4-mapped addresses', () => {
    const resolver = new ClientIpResolver('10.0.0.1');
    expect(resolver.resolve('::ffff:10.0.0.1', { 'cf-connecting-ip': 'not-an-ip' })).toBe(
      '10.0.0.1',
    );
    expect(resolver.resolve('::ffff:203.0.113.5', {})).toBe('203.0.113.5');
    expect(resolver.resolve(undefined, {})).toBe('unknown');
  });

  it('supports IPv6 proxies and rejects invalid configuration', () => {
    const resolver = new ClientIpResolver('::1');
    expect(resolver.resolve('::1', { 'cf-connecting-ip': '198.51.100.1' })).toBe('198.51.100.1');
    expect(() => new ClientIpResolver('not-an-ip')).toThrow();
  });
});
