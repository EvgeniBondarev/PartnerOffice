import { Navigate, Route, Routes } from 'react-router-dom';
import { RequireAuth } from './auth/RequireAuth';
import { AppShell } from './layout/AppShell';
import { LoginPage } from './pages/LoginPage';
import { OrdersPage } from './orders/OrdersPage';
import { ReturnsPage } from './returns/ReturnsPage';
import { HomePage } from './pages/HomePage';

const RETURNS_SECTION_KEY = 'partner-office.returns-section';

function lastReturnsSection(): 'waiting' | 'received' | 'shelf' {
  try {
    const saved = window.localStorage.getItem(RETURNS_SECTION_KEY);
    return saved === 'received' || saved === 'shelf' ? saved : 'waiting';
  } catch {
    return 'waiting';
  }
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route path="/orders" element={<OrdersPage />} />
          <Route path="/returns" element={<Navigate to={`/returns/${lastReturnsSection()}`} replace />} />
          <Route path="/returns/waiting" element={<ReturnsPage key="waiting" section="waiting" />} />
          <Route path="/returns/received" element={<ReturnsPage key="received" section="received" />} />
          <Route path="/returns/shelf" element={<ReturnsPage key="shelf" section="shelf" />} />
          <Route path="/" element={<HomePage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
