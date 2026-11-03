import * as LabelPrimitive from '@radix-ui/react-label';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

const controlClasses =
  'w-full rounded-md border border-input bg-card px-3 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-1 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive';

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cn(controlClasses, 'h-9 py-1', className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea className={cn(controlClasses, 'min-h-24 py-2', className)} {...props} />;
}

export function NativeSelect({ className, ...props }: ComponentProps<'select'>) {
  return <select className={cn(controlClasses, 'h-9 py-1', className)} {...props} />;
}

export function Label({ className, ...props }: ComponentProps<typeof LabelPrimitive.Root>) {
  return <LabelPrimitive.Root className={cn('text-sm font-medium', className)} {...props} />;
}
