import { CalendarDays, LogIn, LogOut, PartyPopper, Ticket, UserRound } from 'lucide-react';
import type { ComponentType, ReactNode } from 'react';
import { NavLink, Outlet } from 'react-router';
import { useCurrentUser, useLogout } from '@/features/auth/queries';
import { errorMessage } from '@/lib/api/errors';
import { routes } from '@/lib/routes';
import { cn } from '@/lib/utils';

function SidebarLink({
  to,
  icon: Icon,
  children,
}: {
  to: string;
  icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  children: ReactNode;
}) {
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) =>
        cn(
          'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-sidebar-accent focus-visible:outline-2 focus-visible:outline-sidebar-foreground',
          isActive && 'bg-sidebar-accent',
        )
      }
    >
      <Icon className="size-4 shrink-0" aria-hidden={true} />
      {children}
    </NavLink>
  );
}

function SessionControls() {
  const { user, isPending } = useCurrentUser();
  const logout = useLogout();

  if (isPending) {
    return null;
  }
  if (!user) {
    return (
      <SidebarLink to={routes.login} icon={LogIn}>
        Identificarse
      </SidebarLink>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      <p className="flex min-w-0 items-center gap-2 px-3 py-2 text-sm font-medium">
        <UserRound className="size-4 shrink-0" aria-hidden="true" />
        <span className="truncate">{user.username}</span>
      </p>
      <button
        type="button"
        disabled={logout.isPending}
        className="flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-sidebar-muted transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:outline-2 focus-visible:outline-sidebar-foreground disabled:opacity-50"
        onClick={() => logout.mutate()}
      >
        <LogOut className="size-4 shrink-0" aria-hidden="true" />
        Cerrar sesión
      </button>
      {logout.isError && (
        <p role="alert" className="px-3 text-xs text-sidebar-muted">
          {errorMessage(logout.error)}
        </p>
      )}
    </div>
  );
}

export function AppLayout() {
  const { user } = useCurrentUser();

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="flex shrink-0 flex-col gap-4 bg-sidebar p-3 text-sidebar-foreground md:sticky md:top-0 md:h-screen md:w-56">
        <p className="flex items-center gap-2 px-3 py-2 text-base font-semibold">
          <PartyPopper className="size-5" aria-hidden="true" />
          Party Finder
        </p>
        <nav aria-label="Principal" className="flex flex-1 flex-col gap-1">
          <SidebarLink to={routes.calendar} icon={CalendarDays}>
            Calendario
          </SidebarLink>
          {user && (
            <SidebarLink to={routes.events} icon={Ticket}>
              Eventos
            </SidebarLink>
          )}
          <div className="mt-2 md:mt-auto">
            <SessionControls />
          </div>
        </nav>
      </aside>
      <main className="min-w-0 flex-1">
        <Outlet />
      </main>
    </div>
  );
}
