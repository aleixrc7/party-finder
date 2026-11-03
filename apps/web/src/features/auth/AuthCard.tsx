import type { ReactNode } from 'react';
import { Card } from '@/components/ui/card';

export function AuthCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-md p-4 md:pt-12">
      <Card className="flex flex-col gap-4 p-6">
        <h1 className="text-xl font-semibold">{title}</h1>
        {children}
      </Card>
    </div>
  );
}
