import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { hasPermission } from '../lib/permissions';
import ordersIllustration from '../assets/illustrations/hub-orders.webp';
import returnsIllustration from '../assets/illustrations/hub-returns.webp';

export function HomePage() {
  const { partner } = useAuth();
  return (
    <div className="pa-home">
      <h1 className="po-page__title">Главная</h1>
      <h2 className="po-section-title">Разделы</h2>
      <div className="po-tiles" aria-label="Разделы кабинета">
        <Link className="po-tile pa-home__tile" to="/orders">
          <span className="po-tile__title">Заказы</span>
          <span className="po-tile__art"><img src={ordersIllustration} alt="" width={104} height={100} decoding="async" /></span>
        </Link>
        {hasPermission(partner, 'ViewReturns') && (
          <Link className="po-tile pa-home__tile" to="/returns">
            <span className="po-tile__title">Возвраты</span>
            <span className="po-tile__art"><img src={returnsIllustration} alt="" width={104} height={100} decoding="async" /></span>
          </Link>
        )}
      </div>
    </div>
  );
}
