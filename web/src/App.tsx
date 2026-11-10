import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { RequireAuth } from './auth/RequireAuth';
import { AppShell } from './layout/AppShell';
import { LoginPage } from './pages/LoginPage';
import { OrdersPage } from './orders/OrdersPage';
import { ReturnsPage } from './returns/ReturnsPage';
import { HomePage } from './pages/HomePage';

const RETURNS_SECTION_KEY = 'partner-office.returns-section';

function lastReturnsSection(): 'waiting' | 'received' | 'shelf' | 'supplier' | 'warehouse' {
  try {
    const saved = window.localStorage.getItem(RETURNS_SECTION_KEY);
    if (saved === 'outbound') return 'supplier';   // прежняя вкладка «К отправке»
    return saved === 'received' || saved === 'shelf' || saved === 'supplier' || saved === 'warehouse' ? saved : 'waiting';
  } catch {
    return 'waiting';
  }
}

/** Прежняя вкладка «К отправке» разделилась: ссылка с `dest=us` ведёт во «Возврат на склад», остальные — во «Возврат поставщику». */
function OutboundRedirect() {
  const { search } = useLocation();
  return <Navigate to={new URLSearchParams(search).get('dest') === 'us' ? '/returns/warehouse' : '/returns/supplier'} replace />;
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
          <Route path="/returns/supplier" element={<ReturnsPage key="supplier" section="supplier" />} />
          <Route path="/returns/warehouse" element={<ReturnsPage key="warehouse" section="warehouse" />} />
          <Route path="/returns/outbound" element={<OutboundRedirect />} />
          <Route path="/" element={<HomePage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
