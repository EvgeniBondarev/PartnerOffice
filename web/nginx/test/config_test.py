"""Статические проверки вывода `nginx -T` (то, что нельзя увидеть поведенчески: таймауты). Аргументы: web.conf vps.conf"""
import re
import sys


def block(text, header):
    start = text.index(header)
    depth, i = 0, text.index("{", start)
    begin = i
    while True:
        depth += text[i] == "{"
        depth -= text[i] == "}"
        i += 1
        if depth == 0:
            return text[begin:i]


def secs(value):
    m = re.fullmatch(r"(\d+)([smh]?)", value)
    return int(m.group(1)) * {"": 1, "s": 1, "m": 60, "h": 3600}[m.group(2)]


failures = []


def check(cond, msg):
    print(("ok   " if cond else "FAIL ") + msg)
    if not cond:
        failures.append(msg)


def directive(body, name):
    m = re.search(rf"^\s*{name}\s+([^;]+);", body, re.M)
    return m.group(1).strip() if m else None


web, vps = (open(p, encoding="utf-8").read() for p in sys.argv[1:3])
for layer, text in (("web", web), ("vps", vps)):
    try:
        sse = block(text, "location = /partner-api/returns/events")
    except ValueError:
        check(False, f"{layer}: exact SSE location exists")
        continue
    check(True, f"{layer}: exact SSE location exists")
    check(directive(sse, "proxy_buffering") == "off", f"{layer}: SSE proxy_buffering off")
    check(directive(sse, "proxy_cache") == "off", f"{layer}: SSE proxy_cache off")
    check(directive(sse, "gzip") == "off", f"{layer}: SSE gzip off")
    t = directive(sse, "proxy_read_timeout")
    check(t is not None and secs(t) >= 3600, f"{layer}: SSE proxy_read_timeout >= 1h ({t})")

try:
    api = block(web, "location /partner-api/")
except ValueError:
    api = ""
check(directive(api, "client_max_body_size") == "11m", "web: /partner-api/ client_max_body_size 11m")
check(directive(api, "client_body_timeout") is not None, "web: client_body_timeout set")
check(directive(api, "proxy_send_timeout") is not None, "web: proxy_send_timeout set")
# Охранник стоит на уровне server (до выбора location), а не только внутри location /partner-api/.
srv = block(web, "server {")
head = re.split(r"^\s*location\s", srv, maxsplit=1, flags=re.M)[0]
check(re.search(r"^\s*if\s*\(\$partner_api_block\)\s*\{\s*return 400;\s*\}", head, re.M) is not None,
      "web: server-level 'if ($partner_api_block) { return 400; }' before any location")
check("partner_api_block" not in api, "web: guard is not placed inside location /partner-api/")
vsrv = block(vps[vps.rindex("server {", 0, vps.index("server_name partner-office.mpsuper.ru")):], "server {")
check(re.search(r"client_max_body_size\s+11[mM];", vsrv) is not None, "vps: client_max_body_size 11M")
check(re.search(r"client_body_timeout\s+\d+", vsrv) is not None, "vps: client_body_timeout set")
check(re.search(r"proxy_send_timeout\s+\d+", vsrv) is not None, "vps: proxy_send_timeout set")
sys.exit(1 if failures else 0)
