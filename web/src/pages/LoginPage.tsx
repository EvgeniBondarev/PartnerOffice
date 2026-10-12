import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ApiError } from '../api/client';
import type { LockedResponse } from '../api/auth';
import { useAuth } from '../auth/AuthContext';
import { hasErrors, validateLogin, validateLoginForm, validatePassword } from '../lib/validation';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { Informer } from '../ui/Informer';
import { TextField } from '../ui/TextField';

const INVALID_CREDENTIALS = 'Неверный логин или пароль';

/** Время окончания блокировки в виде «15:42». Сервер отдаёт UTC, показываем местное время. */
function formatLockTime(lockedUntilUtc?: string): string | null {
  if (!lockedUntilUtc) return null;
  const until = new Date(lockedUntilUtc.endsWith('Z') ? lockedUntilUtc : `${lockedUntilUtc}Z`);
  return Number.isNaN(until.getTime()) ? null : until.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

export function LoginPage() {
  const { status, signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';

  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [credentialsRejected, setCredentialsRejected] = useState(false);
  const [serverMessage, setServerMessage] = useState<string | null>(null);
  const [lockedUntil, setLockedUntil] = useState<{ at: number; text: string | null } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const loginRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  // Кнопка снова включается сама, когда блокировка на сервере закончилась.
  useEffect(() => {
    if (!lockedUntil) return;
    const rest = lockedUntil.at - Date.now();
    if (rest <= 0) {
      setLockedUntil(null);
      return;
    }
    const timer = window.setTimeout(() => setLockedUntil(null), rest);
    return () => window.clearTimeout(timer);
  }, [lockedUntil]);

  if (status === 'authenticated') return <Navigate to={from} replace />;

  const resetServerFeedback = () => {
    setCredentialsRejected(false);
    setServerMessage(null);
  };

  const onLoginChange = (value: string) => {
    setLogin(value);
    resetServerFeedback();
    // Пока ошибка показана, проверяем на каждый символ: она пропадает сразу, как поле исправлено.
    if (loginError) setLoginError(validateLogin(value));
  };

  const onPasswordChange = (value: string) => {
    setPassword(value);
    resetServerFeedback();
    if (passwordError) setPasswordError(validatePassword(value));
  };

  const trackCapsLock = (event: KeyboardEvent<HTMLInputElement>) => setCapsLock(event.getModifierState('CapsLock'));

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting || lockedUntil) return;

    const trimmedLogin = login.trim();
    setLogin(trimmedLogin);
    const errors = validateLoginForm(trimmedLogin, password);
    setLoginError(errors.login);
    setPasswordError(errors.password);
    if (hasErrors(errors)) {
      (errors.login ? loginRef : passwordRef).current?.focus();
      return;
    }

    setSubmitting(true);
    resetServerFeedback();
    try {
      await signIn(trimmedLogin, password);
      navigate(from, { replace: true });
    } catch (error) {
      if (!(error instanceof ApiError)) {
        setServerMessage('Не удалось войти. Попробуйте ещё раз.');
      } else if (error.status === 401) {
        setCredentialsRejected(true);
        setPassword('');
        passwordRef.current?.focus();
      } else if (error.status === 429) {
        const data = error.data as LockedResponse | null;
        const at = data?.lockedUntilUtc ? new Date(data.lockedUntilUtc.endsWith('Z') ? data.lockedUntilUtc : `${data.lockedUntilUtc}Z`).getTime() : NaN;
        setLockedUntil({ at: Number.isNaN(at) ? Date.now() + 60_000 : at, text: formatLockTime(data?.lockedUntilUtc) });
      } else {
        setServerMessage(error.message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="pa-auth">
      <div className="pa-auth__shape pa-auth__shape--top" aria-hidden="true" />
      <div className="pa-auth__shape pa-auth__shape--bottom" aria-hidden="true" />

      <section className="pa-auth__card" aria-labelledby="login-title">
        <div className="pa-brand">
          <span className="pa-brand__mark" aria-hidden="true">PO</span>
          <span className="pa-brand__name">PartnerOffice</span>
        </div>

        <h1 id="login-title" className="pa-auth__title ozi-heading-500">Вход в кабинет партнёра</h1>
        <p className="pa-auth__lead ozi-body-500">
          Введите логин и пароль, которые вам выдал владелец кабинета. Заказы и действия с ними доступны после входа.
        </p>

        {lockedUntil && (
          <Informer kind="warning" title="Слишком много неудачных попыток">
            {lockedUntil.text ? `Вход откроется в ${lockedUntil.text}.` : 'Подождите немного и попробуйте снова.'} Если пароль утерян, попросите владельца задать новый.
          </Informer>
        )}
        {serverMessage && <Informer kind="error">{serverMessage}</Informer>}

        <form className="pa-auth__form" onSubmit={onSubmit} noValidate>
          <TextField
            label="Логин"
            name="username"
            value={login}
            inputRef={loginRef}
            onValueChange={onLoginChange}
            onBlur={() => {
              const trimmed = login.trim();
              if (trimmed !== login) setLogin(trimmed);
              if (login.length > 0 || loginError) setLoginError(validateLogin(trimmed));
            }}
            error={loginError}
            invalid={credentialsRejected}
            hint="Его выдаёт владелец. Латиница, цифры и . _ @ -"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            autoFocus
            readOnly={submitting}
          />

          <TextField
            label="Пароль"
            name="password"
            type={showPassword ? 'text' : 'password'}
            value={password}
            inputRef={passwordRef}
            onValueChange={onPasswordChange}
            onBlur={() => {
              setCapsLock(false);
              if (password.length > 0 || passwordError) setPasswordError(validatePassword(password));
            }}
            onKeyDown={trackCapsLock}
            onKeyUp={trackCapsLock}
            error={credentialsRejected ? INVALID_CREDENTIALS : passwordError}
            warning={capsLock ? 'Включён Caps Lock' : null}
            hint="Не короче 8 символов"
            autoComplete="current-password"
            readOnly={submitting}
            rightSlot={
              <button
                type="button"
                className="pa-field__toggle"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
                aria-pressed={showPassword}
                title={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
              >
                <Icon name={showPassword ? 'ui-eye-off' : 'ui-eye'} />
              </button>
            }
          />

          <Button type="submit" size={600} fill loading={submitting} disabled={Boolean(lockedUntil)}>
            Войти
          </Button>
        </form>

        <div className="pa-auth__links">
          <button
            type="button"
            className="pa-link"
            onClick={() => setShowHelp((value) => !value)}
            aria-expanded={showHelp}
            aria-controls="login-help"
          >
            Не могу войти
          </button>
        </div>

        {showHelp && (
          <div id="login-help">
            <Informer kind="info" title="Логин и пароль задаёт владелец">
              Партнёры не регистрируются сами: учётную запись создаёт владелец кабинета в Studio2. Если вы забыли пароль или вход заблокирован, попросите владельца задать новый пароль.
            </Informer>
          </div>
        )}
      </section>

      <footer className="pa-auth__footer ozi-body-300">PartnerOffice · кабинет партнёра</footer>
    </main>
  );
}
