#!/usr/bin/env bash
#
# Publica el sitio: desarrolla aquí -> despliegua en el servidor.
#
#  1. Verifica que todos los archivos críticos existan en el repo (pre-flight).
#  2. Regenera los index.json del manejador de contenidos a partir de los
#     artículos .md agregados manualmente (python3 scripts/build-index.py).
#  3. Copia el repositorio al root del vhost de nginx.
#  4. Verifica que los archivos críticos hayan quedado en el destino (post-check).
#
# Uso:
#   scripts/deploy.sh                                # el repo vive en el propio servidor
#   SSH_TARGET=user@servidor scripts/deploy.sh       # despliegue remoto por rsync
#
# El destino por defecto es el root del vhost en iesencial.conf:
#   SERVER_ROOT=/srv/http/virtual-hosts/iesencial.com
# En modo remoto la verificación posterior hace curl a:
#   SITE_URL=https://www.iesencial.com
#
# NOTA: no se borra nada en el destino (sin --delete): páginas previas del
# sitio que no están en el repo (soluciones.html, hardware.html, contacto.html)
# se conservan.
set -euo pipefail

SERVER_ROOT="${SERVER_ROOT:-/srv/http/virtual-hosts/iesencial.com}"
SITE_URL="${SITE_URL:-https://www.iesencial.com}"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

cd "$REPO_ROOT"

# Archivos que deben existir SIEMPRE en el repo (y llegar al servidor).
REQUIRED_FILES=(
  index.html
  assets/css/main.css
  assets/css/content.css
  assets/js/main.js
  assets/js/content.js
  assets/js/marked.min.js
  assets/js/purify.min.js
  assets/katex/katex.min.js
  assets/katex/katex.min.css
  toc/index.html
  boletin/index.html
  finanzas/index.html
)

# Diagramas SVG de los boletines web: se detectan solos (boletin/diagramas/*/*.svg),
# así que un boletín nuevo no exige editar este script.
WEB_DIAGRAMAS=()
while IFS= read -r -d '' f; do WEB_DIAGRAMAS+=("$f"); done \
  < <(find boletin/diagramas -type f -name '*.svg' -print0 2>/dev/null | sort -z)

echo "==> Verificación previa (archivos críticos en el repo)"
missing=0
for f in "${REQUIRED_FILES[@]}" "${WEB_DIAGRAMAS[@]}"; do
  if [[ ! -f "$f" ]]; then
    echo "  FALTA en el repo: $f" >&2
    missing=1
  fi
done
if [[ "$missing" -ne 0 ]]; then
  echo "ERROR: hay archivos faltantes en el repo; corrija antes de desplegar." >&2
  exit 1
fi
echo "  OK: todos los archivos críticos existen."

echo "==> Generando index.json (menús de toc/, boletin/, finanzas/)"
if command -v python3 >/dev/null 2>&1; then
  python3 scripts/build-index.py
else
  echo "ERROR: se requiere python3 para generar los índices (el servidor no tiene node)." >&2
  exit 1
fi

# Lo que NO se copia al sitio web (solo desarrollo/administración).
EXCLUDES=(
  --exclude '.git'
  --exclude 'AGENTS.md'
  --exclude 'scripts/'
  --exclude 'iesencial.conf'        # se aplica aparte: nginx -t && systemctl reload nginx
  --exclude 'view-source_*'
)

echo "==> Desplegando a $SERVER_ROOT"
if [[ -n "${SSH_TARGET:-}" ]]; then
  rsync -avz "${EXCLUDES[@]}" ./ "$SSH_TARGET:$SERVER_ROOT/"
else
  rsync -a "${EXCLUDES[@]}" ./ "$SERVER_ROOT/"
fi

echo "==> Verificación posterior (archivos en el destino)"
if [[ -n "${SSH_TARGET:-}" ]]; then
  # Remoto: comprobamos las URLs públicas del sitio (incluye todos los SVG).
  CHECK_PATHS=(/index.html /assets/js/content.js /assets/css/content.css
               /assets/js/marked.min.js /assets/js/purify.min.js
               /toc/index.json /boletin/index.json /finanzas/index.json)
  for f in "${WEB_DIAGRAMAS[@]}"; do CHECK_PATHS+=(/boletin/"${f#boletin/}"); done
  fail=0
  for p in "${CHECK_PATHS[@]}"; do
    code="$(curl -s -o /dev/null -w '%{http_code}' "$SITE_URL$p")"
    if [[ "$code" != "200" ]]; then
      echo "  LIVESITE $code: $p" >&2
      fail=1
    else
      echo "  OK 200: $p"
    fi
  done
  if [[ "$fail" -ne 0 ]]; then
    echo "ADVERTENCIA: algunas URLs no responden 200. Revise permisos y nginx." >&2
    exit 1
  fi
else
  # Local: el root del vhost está en esta máquina; verificamos los archivos.
  fail=0
  for p in "${REQUIRED_FILES[@]}" "${WEB_DIAGRAMAS[@]}" toc/index.json boletin/index.json finanzas/index.json; do
    if [[ ! -f "$SERVER_ROOT/$p" ]]; then
      echo "  FALTA en el destino: $p" >&2
      fail=1
    fi
  done
  if [[ "$fail" -ne 0 ]]; then
    echo "ERROR: faltan archivos en el destino ($SERVER_ROOT)." >&2
    exit 1
  fi
  echo "  OK: todos los archivos críticos están en $SERVER_ROOT."
fi

echo "Listo. Si cambió iesencial.conf: nginx -t && systemctl reload nginx"