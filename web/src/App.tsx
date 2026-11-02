import { Navigate, Route, Routes } from 'react-router-dom';
import { RequireAuth } from './auth/RequireAuth';
import { AppShell } from './layout/AppShell';
import { LoginPage } from './pages/LoginPage';
import { OrdersPage } from './orders/OrdersPage';
import { ReturnsPage } from './returns/ReturnsPage';
import { HomePage } from './pages/HomePage';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route path="/orders" element={<OrdersPage />} />
          <Route path="/returns" element={<Navigate to="/returns/waiting" replace />} />
          <Route path="/returns/waiting" element={<ReturnsPage />} />
          <Route path="/" element={<HomePage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
