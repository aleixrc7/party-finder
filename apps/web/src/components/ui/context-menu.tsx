import * as ContextMenuPrimitive from '@radix-ui/react-context-menu';
import { ChevronRight } from 'lucide-react';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export const ContextMenu = ContextMenuPrimitive.Root;
export const ContextMenuTrigger = ContextMenuPrimitive.Trigger;
export const ContextMenuSub = ContextMenuPrimitive.Sub;

const surfaceClasses =
  'z-50 min-w-44 overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md';
const itemClasses =
  'relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none select-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0';

export function ContextMenuContent({
  className,
  ...props
}: ComponentProps<typeof ContextMenuPrimitive.Content>) {
  return (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.Content className={cn(surfaceClasses, className)} {...props} />
    </ContextMenuPrimitive.Portal>
  );
}

export function ContextMenuItem({
  className,
  ...props
}: ComponentProps<typeof ContextMenuPrimitive.Item>) {
  return <ContextMenuPrimitive.Item className={cn(itemClasses, className)} {...props} />;
}

export function ContextMenuSubTrigger({
  className,
  children,
  ...props
}: ComponentProps<typeof ContextMenuPrimitive.SubTrigger>) {
  return (
    <ContextMenuPrimitive.SubTrigger
      className={cn(itemClasses, 'data-[state=open]:bg-accent', className)}
      {...props}
    >
      {children}
      <ChevronRight className="ml-auto" aria-hidden="true" />
    </ContextMenuPrimitive.SubTrigger>
  );
}

export function ContextMenuSubContent({
  className,
  ...props
}: ComponentProps<typeof ContextMenuPrimitive.SubContent>) {
  return (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.SubContent className={cn(surfaceClasses, className)} {...props} />
    </ContextMenuPrimitive.Portal>
  );
}
