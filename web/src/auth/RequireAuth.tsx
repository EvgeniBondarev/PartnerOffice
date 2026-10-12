import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';

/** Пускает дальше только вошедшего партнёра. Остальных отправляет на вход и запоминает, куда они шли. */
export function RequireAuth() {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return (
      <div className="pa-splash" role="status" aria-live="polite">
        <div className="pa-splash__mark" aria-hidden="true">PO</div>
        <span className="ozi-body-500">Проверяем вход…</span>
      </div>
    );
  }

  if (status === 'anonymous') {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }

  return <Outlet />;
}
