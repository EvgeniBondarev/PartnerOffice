# Заголовки безопасности. nginx наследует add_header в location только если там нет своих add_header,
# поэтому файл подключается и на уровне server, и в каждом location, где задан свой add_header
# (иначе заголовки пропадают с /assets/, /brand/, /partner-api/ и т. д.).
# Cache-Control сюда не входит: его задаёт каждый location один раз.
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header X-Frame-Options "DENY" always;
# Картинки товаров приходят с серверов Ozon; этикетки открываются как blob: из PDF.
add_header Content-Security-Policy "default-src 'self'; img-src 'self' data: blob: https://*.ozone.ru; style-src 'self' 'unsafe-inline'; script-src 'self'; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'" always;
