import { Link, Navigate, Outlet, Route, Routes, useLocation } from 'react-router';
import { EmptyState, LoadingState } from '@/components/states';
import { LoginPage } from '@/features/auth/LoginPage';
import { useCurrentUser } from '@/features/auth/queries';
import { RegisterPage } from '@/features/auth/RegisterPage';
import { VerifyEmailPage } from '@/features/auth/VerifyEmailPage';
import { CalendarPage } from '@/features/calendar/CalendarPage';
import { EventsPage } from '@/features/templates/EventsPage';
import { routes } from '@/lib/routes';
import { AppLayout } from './AppLayout';

function RequireSession() {
  const { user, isPending } = useCurrentUser();
  const location = useLocation();
  if (isPending) {
    return <LoadingState label="Comprobando la sesión…" />;
  }
  if (!user) {
    return <Navigate to={routes.login} replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}

function NotFoundPage() {
  return (
    <EmptyState title="Página no encontrada">
      <Link
        className="font-medium text-primary underline-offset-4 hover:underline"
        to={routes.calendar}
      >
        Volver al calendario
      </Link>
    </EmptyState>
  );
}

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path={routes.calendar} element={<CalendarPage />} />
        <Route element={<RequireSession />}>
          <Route path={routes.events} element={<EventsPage />} />
        </Route>
        <Route path={routes.login} element={<LoginPage />} />
        <Route path={routes.register} element={<RegisterPage />} />
        <Route path={routes.verifyEmail} element={<VerifyEmailPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
