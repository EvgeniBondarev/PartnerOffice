# Выкладка PartnerOffice

Адрес: **https://partner-office.mpsuper.ru**. Приложение стоит на VolnaServer (192.168.1.130) рядом со Studio2 и выкладывается само при каждом пуше в `main`.

## Как это устроено

```
Браузер ──HTTPS──> VPS 178.253.53.2 :443
                    nginx stream (SNI) ──> 127.0.0.1:8454 (TLS, certbot)
                    ──OpenVPN──> 192.168.1.130:5014
                                  контейнер partner-office (nginx)
                                    ├─ /            статика React-приложения
                                    └─ /partner-api ──docker-сеть studio2_default──> studio2-web-1:5002
```

- Для браузера и приложение, и API живут на одном адресе. Cookie сессии партнёра (`HttpOnly`, `SameSite=Strict`) работает без CORS, `VITE_API_BASE_URL` в проде пустой.
- Контейнер входит в docker-сеть Studio2 и ходит в неё по имени `studio2-web-1`; наружу API Studio2 этим путём не открывается.
- Порт `5014` опубликован на LAN-адрес `192.168.1.130` и на `127.0.0.1` (как у `ozon-returns`: tun-адрес `10.8.0.6` появляется позже старта контейнера).
- nginx контейнера передаёт Studio2 реальный адрес клиента (`X-Real-IP` от VPS в `X-Forwarded-For`), иначе все партнёры делили бы один лимит попыток входа.

## Конвейер (`.github/workflows/deploy.yml`)

Запускается пушем в `main` и вручную (`workflow_dispatch`).

1. **test** (GitHub-hosted): `npm ci`, проверка типов, тесты, сборка. Упала — выкладки нет.
2. **deploy** (self-hosted раннер на VolnaServer, метки `volnaserver`, `partner-office`):
   - запоминает работающую версию;
   - собирает образ `partner-office:<sha>` (`web/Dockerfile`, контекст — корень репозитория);
   - `docker compose -f deploy/docker-compose.yml up -d`;
   - ждёт `healthy`, проверяет `/`, `/orders` и прокси в Studio2 (`/partner-api/auth/me` без входа должен ответить 401; другой код — только предупреждение, потому что Studio2 может перезапускаться);
   - при неудаче возвращает прежний образ; при успехе оставляет три последних образа.

Ни одного секрета в репозитории и в Actions не нужно: образ собирается на самом сервере.

### Безопасность раннера

Репозиторий публичный, а раннер стоит внутри сети. Поэтому:
- workflow запускается **только** по `push` в `main` и вручную, событие `pull_request` не используется: код из форков на раннере не исполняется;
- в настройках репозитория (Settings → Actions → General) оставить «Require approval for all outside collaborators»;
- раннер зарегистрирован только на этот репозиторий и работает от пользователя `volna`.

## Раннер на VolnaServer

Каталог `/home/volna/actions-runner-partner-office`. Работает как **пользовательский** systemd-сервис `actions-runner-partner-office.service` пользователя `volna` (включён `loginctl enable-linger`, поэтому стартует при загрузке сервера без входа). Остальные раннеры на сервере стоят системными сервисами: их ставит `svc.sh install`, которому нужен `sudo`.

```bash
# на VolnaServer под пользователем volna
systemctl --user status actions-runner-partner-office
journalctl --user -u actions-runner-partner-office -n 50
systemctl --user restart actions-runner-partner-office
```

Состояние со стороны GitHub: `gh api repos/EvgeniBondarev/PartnerOffice/actions/runners`.

Перерегистрация (если раннер пропал): новый токен `gh api -X POST repos/EvgeniBondarev/PartnerOffice/actions/runners/registration-token --jq .token`; в каталоге раннера `systemctl --user stop actions-runner-partner-office`, `./config.sh remove --token <токен>`, затем `./config.sh --unattended --url https://github.com/EvgeniBondarev/PartnerOffice --token <токен> --name volnaserver-partner-office --labels volnaserver,partner-office --replace` и `systemctl --user start actions-runner-partner-office`.

## VPS (nginx и сертификат)

Конфиги VPS правятся руками и не деплоятся. Эталон лежит в `deploy/vps-nginx/partner-office.mpsuper.ru`.

- `/etc/nginx/sites-available/partner-office.mpsuper.ru` (+ симлинк в `sites-enabled`): порт 80 для ACME и редирект, `127.0.0.1:8454 ssl`, upstream `192.168.1.130:5014`.
- `/etc/nginx/stream.conf`: строка `partner-office.mpsuper.ru 127.0.0.1:8454;` в `map $ssl_preread_server_name`.
- Сертификат certbot (webroot `/var/www/certbot`), автообновление `certbot.timer`; после обновления nginx перечитывается хуками из `/etc/letsencrypt/renewal-hooks/deploy`.

Первая выдача сертификата:

```bash
certbot certonly --webroot -w /var/www/certbot -d partner-office.mpsuper.ru
nginx -t && systemctl reload nginx
```

## Откат и диагностика

```bash
# на VolnaServer
docker ps --filter name=partner-office
docker logs --tail 100 partner-office
docker images partner-office
# откат на конкретную версию
PARTNER_OFFICE_TAG=<sha> docker compose -f deploy/docker-compose.yml up -d
# проверка без VPS
curl -i http://192.168.1.130:5014/healthz
curl -i http://192.168.1.130:5014/partner-api/auth/me   # 401 = Studio2 отвечает
```

Ответ 502 на `/partner-api/*` — Studio2 недоступна (перезапуск или упала `studio2-web-1`); страница при этом открывается.
