import { useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../ui/Button';
import { Informer } from '../ui/Informer';

/** Заглушка главной: подтверждает, что вход работает и профиль партнёра получен. Раздел заказов — следующий шаг. */
export function HomePage() {
  const { partner, signOut } = useAuth();
  const [leaving, setLeaving] = useState(false);

  const onSignOut = async () => {
    setLeaving(true);
    try {
      await signOut();
    } finally {
      setLeaving(false);
    }
  };

  return (
    <div className="pa-shell">
      <header className="po-header">
        <div className="po-header__logo">
          <span className="pa-brand__mark" aria-hidden="true">PO</span>
          <span className="po-header__title">PartnerOffice</span>
        </div>
        <span className="po-header__spacer" />
        <span className="po-header__user" aria-label="Партнёр">{partner?.name}</span>
        <Button variant="secondary" size={400} loading={leaving} onClick={onSignOut}>Выйти</Button>
      </header>

      <main className="pa-page">
        <h1 className="ozi-heading-500 pa-page__title">Здравствуйте, {partner?.name}</h1>
        <Informer kind="info" title="Раздел заказов в разработке">
          Вход работает. Следующим шагом здесь появятся ваши заказы: номер, название, картинка, артикул, статус и действия с ними.
        </Informer>
      </main>
    </div>
  );
}
