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

Лимиты и потоки (должны совпадать на обоих слоях nginx):

- **Фото возврата.** Файл до 10 МБ + multipart ⇒ `client_max_body_size 11M` и на VPS (`server`), и в контейнере (`web/nginx/default.conf.template`, `server` и `/partner-api/`), `client_body_timeout 120s`, `proxy_send_timeout 120s`. Если менять лимит, то в обоих местах и во фронтенде (`ReturnIssueDialog.tsx`), иначе верхний слой отдаст 413 раньше приложения.
- **SSE `/partner-api/returns/events`.** Отдельный `location =` на обоих слоях: `proxy_buffering off`, `proxy_cache off`, `gzip off`, `proxy_read_timeout` 3600s в контейнере и 3630s на VPS. При обрыве `EventSource` переподключается сам, а список опрашивается раз в 15 с.
- **Заголовки безопасности** вынесены в `web/nginx/security-headers.inc` (в образе: `/etc/nginx/snippets/`). nginx не наследует `add_header` в location со своим `add_header`, поэтому файл подключён в каждом таком location. `Cache-Control` в каждом location задаётся один раз; свой `Cache-Control` Studio2 в `/partner-api/` скрывается (`proxy_hide_header`), остаётся `no-store`.
- **Путь `/partner-api`.** `proxy_pass` передаёт Studio2 исходный `$request_uri` без нормализации, поэтому небезопасный **путь** отсекается ранним фильтром уровня `server` контейнера (`if ($partner_api_block) { return 400; }` в `web/nginx/default.conf.template`). Он срабатывает в rewrite-фазе, до выбора `location`: проверка внутри `location /partner-api/` пропускала бы пути, которые nginx нормализует за его пределы (`/partner-api/a/%2e%2e/%2e%2e/admin` → `/admin` → SPA 200). Фильтр действует, если исходный путь начинается с `/partner-api` или нормализованный путь приводит к нему (`/x/%2e%2e/partner-api/...`), и даёт 400 для:
  - `%2f`, `%5c`, `%00`, `%2e%2e`, `%2e.`, `.%2e`, одиночного `%2e`, сегментов `.` и `..`, буквального `\`;
  - многослойного кодирования: `%25` + любое число `25` + `2e`/`2f`/`5c`/`00` (`%252e`, `%25252f`, `%2525252e`...) и закодированных цифр следующего слоя (`%25%32%65`, `%252%65`);
  - overlong UTF-8 (`%c0%ae`, `%c0%af`, `%e0%80%ae`) и `%u`-кодирования.

  Ограничение: регулярка не раскодирует слои, а ищет известные формы, поэтому правило консервативно: после `%25` запрещён любой `%`. Буквальный процент в пути (`/partner-api/orders/100%25`) проходит. Кодировки в **query** (`?q=a%2Fb`, `?key=..%2f`, `?q=%252e%252e`) не проверяются и проходят как есть. Пути вне `/partner-api` (SPA) не блокируются. VPS-слой запрос не фильтрует, а передаёт как есть: защита стоит в контейнере.

### Проверка конфигов без сервера

```bash
bash web/nginx/test/run.sh                                  # шаблон из рабочей копии + эталон VPS
WEB_IMAGE=partner-office:<тег> bash web/nginx/test/run.sh   # то же на собранном образе
```

Нужен docker. Скрипт поднимает фейковый Studio2, контейнер partner-office и VPS-слой (без TLS) и проверяет лимиты 11M на обоих слоях, заголовки, `Cache-Control`, SSE без буферизации и блокировку путей (фактический ответ 400 для одно- и многослойного обхода, включая `/partner-api/a/%2e%2e/%2e%2e/admin`, и 200 для query-кодировок). Эталон VPS целиком (с TLS) проверяется на сервере: `nginx -t`.

### Выкладка изменений VPS (вручную)

1. Скопировать `deploy/vps-nginx/partner-office.mpsuper.ru` в `/etc/nginx/sites-available/`, `nginx -t && systemctl reload nginx`.
2. Порядок: сначала VPS (11M и SSE-location безвредны без нового контейнера), затем деплой контейнера пушем в `main`. Обратный порядок даёт 413 на фото до обновления VPS.
3. Проверка снаружи: `curl -sN -H 'Accept: text/event-stream' https://partner-office.mpsuper.ru/partner-api/returns/events` (под сессией партнёра) — события приходят сразу, а не пачкой по таймауту; загрузка фото ~10 МБ проходит; `curl -si --path-as-is 'https://partner-office.mpsuper.ru/partner-api/x%2f..%2fy'`, `.../partner-api/a/%2e%2e/%2e%2e/admin` и `.../partner-api/a/%252e%252e/%252e%252e/admin` → 400 (без `--path-as-is` curl сам нормализует `..`).

### Не сделано: реальный адрес клиента (PROXY protocol)

Не внедрялось: нужен доступ к общему `/etc/nginx/stream.conf` на VPS и подтверждённый доверенный адрес источника, этого в репозитории нет. Перед выкладкой проверить на VPS:

1. `nginx -V 2>&1 | tr ' ' '\n' | grep -E 'with-stream|ssl_preread|http_realip'` — есть `--with-stream`, `--with-stream_ssl_preread_module` (уже используется) и `--with-http_realip_module` (нужен для `real_ip_header proxy_protocol`).
2. Точно знать, какие `server` в `stream.conf` попадают в `map $ssl_preread_server_name` и каким `server` отдаётся TCP: `proxy_protocol on;` включается на уровне stream-`server`, общего для **всех** сайтов (Studio2 и остальных). Включить его только для partner-office нельзя, пока upstream не разделён отдельным `server`/`listen`; иначе остальные TLS-серверы получат строку `PROXY ...` вместо ClientHello и сломаются.
3. Для partner-office: `listen 127.0.0.1:8454 ssl http2 proxy_protocol;` + `set_real_ip_from 127.0.0.1; real_ip_header proxy_protocol;` (доверять только адресу stream-слоя; после этого `$remote_addr` в существующем `proxy_set_header X-Real-IP $remote_addr` уже клиентский). Нельзя оставлять `proxy_protocol` в `listen` без включения на стороне stream (и наоборот): в обоих случаях соединение рвётся.
4. Проверка после включения (в окне обслуживания, `nginx -t` недостаточно): `curl -I https://partner-office.mpsuper.ru/healthz` и по одному запросу к остальным сайтам за тем же `stream`; в логе контейнера `docker logs partner-office` в `X-Real-IP`/`X-Forwarded-For` должен быть адрес клиента, а не `127.0.0.1`. Откат: вернуть прежние `stream.conf` и файл сайта, `nginx -t && systemctl reload nginx`.

Первая выдача сертификата:

```bash
certbot certonly --webroot -w /var/www/certbot -d partner-office.mpsuper.ru
nginx -t && systemctl reload nginx
```

## Известные ограничения

- **Адрес клиента.** Публичный `:443` на VPS разбирает nginx `stream` по SNI и передаёт TCP на локальный TLS-сервер, поэтому `$remote_addr` на нём всегда `127.0.0.1` (так же у Studio2 и остальных сайтов). Studio2 видит этот адрес в журнале партнёров и в лимите попыток входа: лимит по IP общий для всех. Блокировка после 5 неверных кодов считается по учётной записи и этим не затронута. Лимит на запрос названия организации (10 в минуту на IP) по той же причине общий для всех: при большом числе одновременных входов название может не показаться, на вход это не влияет. Чтобы передать настоящий адрес, нужен `proxy_protocol` между `stream` и TLS-серверами: это правка общей конфигурации VPS, в этот проект она не входит.
- **Выход.** Сессия хранится в постоянной cookie (подписанный билет, на сервере её нет) 30 дней с продлением при активности: «Выйти» удаляет cookie в браузере, а скопированный ранее билет действует до конца своего срока или до отключения партнёра или смены его почты в Studio2.

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

## Вход по почте: настройки Studio2

Приглашения и коды отправляются через `SmtpSettings` Studio2 (адрес отправителя берётся оттуда). Ссылка в приглашении строится из ключа `PartnerOffice:PublicUrl` (по умолчанию `https://partner-office.mpsuper.ru`). Перед выкладкой нового фронта на Studio2 должна быть применена миграция `AddPartnerEmailLogin` и у существующих партнёров внесена почта, иначе они не смогут войти.
