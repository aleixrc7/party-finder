import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { CONTRACT_VERSION, EVENT_TYPES, endpoints } from '../src';

interface OpenApiOperation {
  operationId?: string;
  responses: Record<string, unknown>;
  parameters?: { $ref?: string }[];
}
interface OpenApiDoc {
  info: { version: string };
  paths: Record<string, Record<string, OpenApiOperation>>;
  components: { schemas: { EventType: { enum: string[] } } };
}

const specPath = fileURLToPath(new URL('../../../docs/openapi.yaml', import.meta.url));
const spec = parse(readFileSync(specPath, 'utf8')) as OpenApiDoc;

const HTTP_METHODS = new Set(['get', 'post', 'patch', 'put', 'delete']);

function specOperations(): string[] {
  return Object.entries(spec.paths).flatMap(([path, item]) =>
    Object.keys(item)
      .filter((key) => HTTP_METHODS.has(key))
      .map((method) => `${method.toUpperCase()} ${path}`),
  );
}

describe('openapi.yaml and shared endpoints stay in sync', () => {
  it('has the same contract version', () => {
    expect(spec.info.version).toBe(CONTRACT_VERSION);
  });

  it('declares exactly the same operations', () => {
    const fromShared = Object.values(endpoints).map((e) => `${e.method} ${e.path}`);
    expect(specOperations().sort()).toEqual(fromShared.sort());
  });

  it('has the same EventType values', () => {
    expect(spec.components.schemas.EventType.enum).toEqual(EVENT_TYPES);
  });

  describe.each(Object.entries(endpoints))('%s', (name, endpoint) => {
    const operation = spec.paths[endpoint.path]?.[endpoint.method.toLowerCase()];

    it('uses the endpoint name as operationId', () => {
      expect(operation?.operationId).toBe(name);
    });

    it('declares the same status codes', () => {
      const expected = [String(endpoint.success.status), ...Object.keys(endpoint.errors)].sort();
      expect(Object.keys(operation?.responses ?? {}).sort()).toEqual(expected);
    });

    it('requires the CSRF header exactly when the request modifies data', () => {
      const hasCsrf = (operation?.parameters ?? []).some(
        (p) => p.$ref === '#/components/parameters/CsrfToken',
      );
      expect(hasCsrf).toBe(endpoint.csrf);
      expect(endpoint.csrf).toBe(endpoint.method !== 'GET');
    });
  });
});
