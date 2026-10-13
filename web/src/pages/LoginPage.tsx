import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError } from '../api/client';
import * as authApi from '../api/auth';
import type { LockedResponse } from '../api/auth';
import { useAuth } from '../auth/AuthContext';
import { CODE_LENGTH, normalizeCode, validateCode, validateEmail } from '../lib/validation';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { Informer } from '../ui/Informer';
import { TextField } from '../ui/TextField';

const INVALID_CODE = 'Неверный или просроченный код';
/** Пауза перед повторной отправкой кода совпадает с серверной (Studio2, PartnerAuthService.ResendPause). */
const RESEND_PAUSE_SECONDS = 60;
const LOOKUP_DEBOUNCE_MS = 400;

type Step = 'email' | 'code';

const parseUtc = (value?: string): number => {
  if (!value) return NaN;
  return new Date(value.endsWith('Z') ? value : `${value}Z`).getTime();
};

/** Время окончания блокировки в виде «15:42». Сервер отдаёт UTC, показываем местное время. */
function formatLockTime(lockedUntilUtc?: string): string | null {
  const at = parseUtc(lockedUntilUtc);
  return Number.isNaN(at) ? null : new Date(at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

/** Ссылка из приглашения: /login?email=…&code=…. Параметры читаем один раз и убираем из адресной строки. */
function readInvite(params: URLSearchParams): { email: string; code: string } | null {
  const email = (params.get('email') ?? '').trim();
  if (!email) return null;
  return { email, code: normalizeCode(params.get('code') ?? '') };
}

export function LoginPage() {
  const { status, signInWithCode } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const from = (location.state as { from?: string } | null)?.from ?? '/';

  // Приглашение читаем в начальном состоянии: после очистки адреса значения остаются в форме.
  const [invite] = useState(() => readInvite(searchParams));
  const fromInvite = Boolean(invite && validateEmail(invite.email) === null && invite.code.length === CODE_LENGTH);

  const [step, setStep] = useState<Step>(fromInvite ? 'code' : 'email');
  const [email, setEmail] = useState(invite?.email ?? '');
  const [code, setCode] = useState(fromInvite ? invite!.code : '');
  const [organization, setOrganization] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [codeRejected, setCodeRejected] = useState(false);
  const [serverMessage, setServerMessage] = useState<string | null>(null);
  const [lockedUntil, setLockedUntil] = useState<{ at: number; text: string | null } | null>(null);
  const [resendAt, setResendAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const emailRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (invite) setSearchParams({}, { replace: true });
    // Один раз при открытии: убираем из адресной строки почту и код из ссылки.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Название организации подтягивается по полностью введённой и верной почте, с паузой после последнего символа.
  useEffect(() => {
    setOrganization(null);
    const trimmed = email.trim();
    if (validateEmail(trimmed) !== null) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      authApi
        .lookupOrganization(trimmed, controller.signal)
        .then((result) => {
          if (!controller.signal.aborted) setOrganization(result?.name ?? null);
        })
        .catch(() => {
          // Название лишь подсказка: при любой ошибке (сеть, лимит) просто не показываем его.
        });
    }, LOOKUP_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [email]);

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

  // Секундомер повторной отправки тикает только пока пауза не кончилась.
  useEffect(() => {
    if (resendAt === null || resendAt <= Date.now()) return;
    setNow(Date.now());
    const timer = window.setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= resendAt) window.clearInterval(timer);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resendAt]);

  useEffect(() => {
    if (step === 'code') codeRef.current?.focus();
  }, [step]);

  if (status === 'authenticated') return <Navigate to={from} replace />;

  const resendSeconds = resendAt === null ? 0 : Math.max(0, Math.ceil((resendAt - now) / 1000));

  const resetServerFeedback = () => {
    setCodeRejected(false);
    setServerMessage(null);
  };

  const applyLock = (data: LockedResponse | null) => {
    const at = parseUtc(data?.lockedUntilUtc);
    setLockedUntil({ at: Number.isNaN(at) ? Date.now() + 60_000 : at, text: formatLockTime(data?.lockedUntilUtc) });
  };

  const startResendPause = (seconds = RESEND_PAUSE_SECONDS) => {
    setResendAt(Date.now() + seconds * 1000);
    setNow(Date.now());
  };

  const onEmailChange = (value: string) => {
    setEmail(value);
    resetServerFeedback();
    // Пока ошибка показана, проверяем на каждый символ: она пропадает сразу, как поле исправлено.
    if (emailError) setEmailError(validateEmail(value));
  };

  /** Просит отправить код. Возвращает true, если можно показывать ввод кода. */
  const sendCode = async (trimmed: string): Promise<boolean> => {
    try {
      await authApi.requestCode(trimmed);
      startResendPause();
      return true;
    } catch (error) {
      if (!(error instanceof ApiError)) {
        setServerMessage('Не удалось отправить код. Попробуйте ещё раз.');
      } else if (error.status === 429) {
        const data = error.data as LockedResponse | null;
        if (data?.lockedUntilUtc) {
          applyLock(data);
        } else {
          // Код уже отправляли меньше минуты назад: он действует, показываем ввод и ждём паузу.
          startResendPause(data?.retryAfterSeconds ?? RESEND_PAUSE_SECONDS);
          return true;
        }
      } else {
        setServerMessage(error.message);
      }
      return false;
    }
  };

  const onEmailSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting || lockedUntil) return;

    const trimmed = email.trim();
    setEmail(trimmed);
    const error = validateEmail(trimmed);
    setEmailError(error);
    if (error) {
      emailRef.current?.focus();
      return;
    }

    setSubmitting(true);
    resetServerFeedback();
    try {
      if (await sendCode(trimmed)) {
        setCode('');
        setCodeError(null);
        setStep('code');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const signIn = async (value: string) => {
    if (submitting || lockedUntil) return;
    const error = validateCode(value);
    setCodeError(error);
    if (error) {
      codeRef.current?.focus();
      return;
    }

    setSubmitting(true);
    resetServerFeedback();
    try {
      await signInWithCode(email.trim(), value);
      navigate(from, { replace: true });
    } catch (caught) {
      if (!(caught instanceof ApiError)) {
        setServerMessage('Не удалось войти. Попробуйте ещё раз.');
      } else if (caught.status === 401) {
        setCodeRejected(true);
        setCode('');
        codeRef.current?.focus();
      } else if (caught.status === 429) {
        applyLock(caught.data as LockedResponse | null);
      } else {
        setServerMessage(caught.message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const onCodeChange = (value: string) => {
    const digits = normalizeCode(value);
    setCode(digits);
    resetServerFeedback();
    if (codeError) setCodeError(validateCode(digits));
    // Шесть цифр введены или вставлены целиком: отправляем без лишнего нажатия.
    if (digits.length === CODE_LENGTH) void signIn(digits);
  };

  const onCodeSubmit = (event: FormEvent) => {
    event.preventDefault();
    void signIn(code);
  };

  const onResend = async () => {
    if (resending || resendSeconds > 0 || lockedUntil) return;
    setResending(true);
    resetServerFeedback();
    try {
      await sendCode(email.trim());
      setCode('');
      setCodeError(null);
      codeRef.current?.focus();
    } finally {
      setResending(false);
    }
  };

  const changeEmail = () => {
    setStep('email');
    setCode('');
    setCodeError(null);
    setLockedUntil(null);
    resetServerFeedback();
    window.setTimeout(() => emailRef.current?.focus(), 0);
  };

  const organizationBadge = organization && (
    <div className="pa-org" role="status">
      <Icon name="ui-check" size={16} className="pa-org__icon" />
      <span>
        Организация: <strong>{organization}</strong>
      </span>
    </div>
  );

  return (
    <main className="pa-auth">
      <div className="pa-auth__shape pa-auth__shape--top" aria-hidden="true" />
      <div className="pa-auth__shape pa-auth__shape--bottom" aria-hidden="true" />

      <section className="pa-auth__card" aria-labelledby="login-title">
        <div className="pa-brand pa-brand--login">
          <img className="pa-brand__mark pa-brand__mark--login" src="/brand/partner-package-login-256.png" alt="" />
          <span className="pa-brand__name">PartnerOffice</span>
        </div>

        <h1 id="login-title" className="pa-auth__title ozi-heading-500">Вход в кабинет партнёра</h1>
        {step === 'email' ? (
          <p className="pa-auth__lead ozi-body-500">
            Введите почту, на которую владелец отправил приглашение. Мы пришлём на неё код для входа.
          </p>
        ) : (
          <p className="pa-auth__lead ozi-body-500">
            {fromInvite && resendAt === null ? (
              <>Код из приглашения уже подставлен. Нажмите «Войти», чтобы открыть кабинет для <strong>{email}</strong>.</>
            ) : (
              <>
                Мы отправили код на <strong>{email}</strong>. Он действует 10 минут. Если письма нет, загляните в папку «Спам».
              </>
            )}
          </p>
        )}

        {lockedUntil && (
          <Informer kind="warning" title="Слишком много неверных кодов">
            {lockedUntil.text ? `Вход откроется в ${lockedUntil.text}.` : 'Подождите немного и попробуйте снова.'} Если почта указана неверно, попросите владельца исправить её.
          </Informer>
        )}
        {serverMessage && <Informer kind="error">{serverMessage}</Informer>}

        {step === 'email' ? (
          <form className="pa-auth__form" onSubmit={onEmailSubmit} noValidate>
            <TextField
              label="Почта"
              name="email"
              type="email"
              inputMode="email"
              value={email}
              inputRef={emailRef}
              onValueChange={onEmailChange}
              onBlur={() => {
                const trimmed = email.trim();
                if (trimmed !== email) setEmail(trimmed);
                if (email.length > 0 || emailError) setEmailError(validateEmail(trimmed));
              }}
              error={emailError}
              hint="Например, name@company.ru"
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              autoFocus
              readOnly={submitting}
            />
            {organizationBadge}

            <Button type="submit" size={600} fill loading={submitting} disabled={Boolean(lockedUntil)}>
              Получить код
            </Button>
          </form>
        ) : (
          <form className="pa-auth__form" onSubmit={onCodeSubmit} noValidate>
            {organizationBadge}
            <TextField
              label="Код из письма"
              name="code"
              inputMode="numeric"
              value={code}
              inputRef={codeRef}
              onValueChange={onCodeChange}
              onBlur={() => {
                if (code.length > 0 || codeError) setCodeError(validateCode(code));
              }}
              error={codeRejected ? INVALID_CODE : codeError}
              hint={`${CODE_LENGTH} цифр`}
              autoComplete="one-time-code"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              maxLength={CODE_LENGTH + 4}
              readOnly={submitting}
            />

            <Button type="submit" size={600} fill loading={submitting} disabled={Boolean(lockedUntil)}>
              Войти
            </Button>
          </form>
        )}

        <div className="pa-auth__links">
          {step === 'code' && (
            <>
              <button type="button" className="pa-link" onClick={onResend} disabled={resending || resendSeconds > 0 || Boolean(lockedUntil)}>
                {resendSeconds > 0 ? `Отправить код ещё раз через ${resendSeconds} с` : 'Отправить код ещё раз'}
              </button>
              <button type="button" className="pa-link" onClick={changeEmail}>
                Изменить почту
              </button>
            </>
          )}
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
            <Informer kind="info" title="Доступ выдаёт владелец">
              Партнёры не регистрируются сами: владелец кабинета заводит партнёра в Studio2 и отправляет приглашение на его почту. Если приглашения нет или код не приходит, проверьте, что почта указана верно, и попросите владельца отправить приглашение ещё раз.
            </Informer>
          </div>
        )}
      </section>

      <footer className="pa-auth__footer ozi-body-300">PartnerOffice · кабинет партнёра</footer>
    </main>
  );
}
