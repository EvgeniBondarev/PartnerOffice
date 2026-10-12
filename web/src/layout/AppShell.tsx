import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Icon } from '../ui/Icon';
import { usePopover } from '../ui/usePopover';

const COLLAPSED_KEY = 'partner-office.menu-collapsed';

/** Ниже этой ширины меню по умолчанию свёрнуто: таблице заказов нужно место. Выбор пользователя важнее. */
const AUTO_COLLAPSE_BELOW = 1440;

function readCollapsed(): boolean {
  try {
    const saved = window.localStorage.getItem(COLLAPSED_KEY);
    if (saved !== null) return saved === '1';
  } catch {
    // хранилище недоступно: решает ширина окна
  }
  return window.innerWidth < AUTO_COLLAPSE_BELOW;
}

interface MenuEntry {
  to: string;
  icon: string;
  label: string;
}

/** Разделы кабинета. Остальные разделы (возвраты, претензии…) добавляются сюда по мере появления. */
const MENU: MenuEntry[][] = [[{ to: '/orders', icon: 'nav-shipping', label: 'Заказы' }]];

/** Каркас по брендбуку (раздел 5): шапка 56px, меню слева 260px (свёрнутое 88px), страница с отступами 24/32. */
export function AppShell() {
  const { partner, signOut } = useAuth();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const userMenu = usePopover();
  const [leaving, setLeaving] = useState(false);

  // Запоминаем только явный выбор пользователя, а не автоматическое сворачивание по ширине окна.
  const toggleMenu = () =>
    setCollapsed((value) => {
      try {
        window.localStorage.setItem(COLLAPSED_KEY, value ? '0' : '1');
      } catch {
        // хранилище может быть недоступно (приватный режим): меню просто не запомнит состояние
      }
      return !value;
    });

  const onSignOut = async () => {
    setLeaving(true);
    try {
      await signOut();
    } finally {
      setLeaving(false);
    }
  };

  return (
    <div className={`po-shell${collapsed ? ' po-shell--collapsed' : ''}`}>
      <header className="po-header">
        <div className="po-header__logo">
          <img
            className="pa-brand__mark"
            src="/brand/partner-office-nav-32.png"
            srcSet="/brand/partner-office-nav-32.png 1x, /brand/partner-office-nav-64.png 2x"
            alt=""
          />
          <span className="po-header__title">PartnerOffice</span>
        </div>
        <span className="po-header__spacer" />

        <div className="pa-usermenu" ref={userMenu.rootRef}>
          <button
            ref={userMenu.buttonRef}
            type="button"
            className="po-header__user pa-usermenu__button"
            aria-haspopup="menu"
            aria-expanded={userMenu.open}
            onClick={() => userMenu.setOpen(!userMenu.open)}
          >
            <span className="pa-usermenu__name">{partner?.name}</span>
            <span className="po-avatar__container po-avatar__size-400 ozi-body-300" aria-hidden="true">
              <span className="po-avatar__statusMaskContainer">
                <span className="po-avatar__avatar po-avatar__counterMaskContainer">
                  <Icon name="ui-user" size={16} />
                </span>
              </span>
            </span>
            <Icon name="ui-chevron-down" />
          </button>
          {userMenu.open && (
            <div className="po-dropdown po-dropdown--500 pa-popover pa-popover--right" role="menu">
              <div className="po-dropdown__list">
                <div className="pa-usermenu__login">Логин: {partner?.login}</div>
                <button
                  type="button"
                  role="menuitem"
                  className="po-dropdown-item pa-menuitem"
                  disabled={leaving}
                  onClick={onSignOut}
                  autoFocus
                >
                  <span className="po-dropdown-item__block">
                    <span className="po-dropdown-item__text">Выйти</span>
                  </span>
                </button>
              </div>
            </div>
          )}
        </div>
      </header>

      <nav className="po-menu" aria-label="Разделы кабинета">
        <ul>
          {MENU.map((group, index) => (
            <div className="po-menu__group" key={index}>
              {group.map((entry) => (
                <li key={entry.to} className="po-menu-item__menuItem">
                  <NavLink
                    to={entry.to}
                    title={collapsed ? entry.label : undefined}
                    className={({ isActive }) => `po-menu-item__button po-menu-item__roundHover pa-menu__link po-menu__item${isActive ? ' po-menu__item--active' : ''}`}
                  >
                    <div className="po-data-cell__dataCell" style={{ ['--columns' as string]: 'max-content 1fr' }}>
                      <div className="po-menu-item__block">
                        <div className="po-menu__icon">
                          <Icon name={entry.icon} />
                        </div>
                      </div>
                      <div className="po-data-cell__content">
                        <div className="po-data-content__dataContent po-data-content__size-500">
                          <div className="po-data-content__label po-data-content__label-size-500 ozi-table-500">{entry.label}</div>
                        </div>
                      </div>
                    </div>
                  </NavLink>
                </li>
              ))}
            </div>
          ))}
        </ul>
        <div className="pa-menu__footer">
          <button
            type="button"
            className="pa-menu__collapse"
            onClick={toggleMenu}
            aria-label={collapsed ? 'Развернуть меню' : 'Свернуть меню'}
            title={collapsed ? 'Развернуть меню' : 'Свернуть меню'}
          >
            <Icon name={collapsed ? 'ui-menu-expand' : 'ui-menu-rollback'} />
            <span className="pa-menu__collapseText">Свернуть</span>
          </button>
          <div className="po-menu__copyright pa-menu__copyright">© PartnerOffice</div>
        </div>
      </nav>

      <main className="po-page">
        <Outlet />
      </main>
    </div>
  );
}
