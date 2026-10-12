# VPS 178.253.53.2: /etc/nginx/sites-available/partner-office.mpsuper.ru (симлинк в sites-enabled).
# Эталонная копия: конфиги VPS руками правятся на сервере и не деплоятся автоматически.
#
# Схема: HTTPS :443 -> nginx stream (SNI, /etc/nginx/stream.conf) -> 127.0.0.1:8454 (этот сервер, TLS-терминация)
#        -> OpenVPN -> 192.168.1.130:5014 (контейнер partner-office на VolnaServer).
#
# stream.conf: добавить строку
#     partner-office.mpsuper.ru   127.0.0.1:8454;

upstream partner_office_backend {
    server 192.168.1.130:5014 max_fails=3 fail_timeout=15s;
    keepalive 8;
    keepalive_timeout 15s;
}

server {
    listen 80;
    listen [::]:80;
    server_name partner-office.mpsuper.ru;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 127.0.0.1:8454 ssl http2;
    server_name partner-office.mpsuper.ru;

    ssl_certificate /etc/letsencrypt/live/partner-office.mpsuper.ru/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/partner-office.mpsuper.ru/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers off;

    add_header Strict-Transport-Security "max-age=31536000" always;
    include /etc/nginx/snippets/errorpages.conf;
    client_max_body_size 2M;

    location / {
        proxy_pass http://partner_office_backend;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_connect_timeout 5s;
        # Отгрузка и печать этикетки ждут ответа Ozon.
        proxy_read_timeout 330s;
    }
}
