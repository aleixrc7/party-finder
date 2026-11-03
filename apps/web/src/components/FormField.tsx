import type { ReactNode } from 'react';
import { Label } from '@/components/ui/form-controls';

interface FormFieldProps {
  id: string;
  label: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
}

export function FormField({ id, label, error, required = false, children }: FormFieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>
        {label}
        {required && (
          <span aria-hidden="true" className="text-destructive">
            {' *'}
          </span>
        )}
      </Label>
      {children}
      {error && (
        <p id={`${id}-error`} className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

export function controlProps(id: string, error?: string) {
  return {
    id,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error ? `${id}-error` : undefined,
  };
}
