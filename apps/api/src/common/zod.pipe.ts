import type { PipeTransform } from '@nestjs/common';
import { toValidationErrorDetails } from '@party-finder/shared';
import type { z } from 'zod';
import { AppError } from './errors';

/** Validates a body, query or param with a schema from `@party-finder/shared`. */
export function parseWith<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  const result = schema.safeParse(value);
  if (!result.success) throw AppError.validation(toValidationErrorDetails(result.error));
  return result.data;
}

export class ZodPipe<S extends z.ZodType> implements PipeTransform<unknown, z.output<S>> {
  constructor(private readonly schema: S) {}

  transform(value: unknown): z.output<S> {
    return parseWith(this.schema, value);
  }
}
