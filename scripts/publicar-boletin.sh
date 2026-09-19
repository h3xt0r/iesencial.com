#!/usr/bin/env bash
#
# Publica un boletín del repo de boletines (~/Git/boletin) en la sección web
# boletin/ de este repositorio (iesencial.com).
#
# Toma el .md de trabajo (imprenta) del boletín, que ya contiene el texto
# final, los pies y la posición de los diagramas, y produce la copia web:
#
#   boletin/YYYY-MM-DD-Boletin-NN: Nombre.md
#     · la fecha se toma del prefijo del archivo fuente (dated);
#     · Diagramas/<figura>.pdf  ->  diagramas/<Boletin-NN-slug>/<figura>.svg;
#     · se desescapan los \$ de importes (escapado de LaTeX) a $ para la web.
#   boletin/diagramas/<Boletin-NN-slug>/  <- .svg copiados desde el repo.
#
# La fuente y el .md de trabajo nunca se modifican. El check de diagramas de
# deploy.sh ya es dinámico (globea boletin/diagramas/*/*.svg), así que este
# script no necesita tocar deploy.sh.
#
# Uso:
#   scripts/publicar-boletin.sh                                  # más reciente
#   scripts/publicar-boletin.sh BOLETIN="Boletin 06"
#   scripts/publicar-boletin.sh BOLETIN="Boletin 06" BOLETINES_REPO=/ruta/al/repo
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

BOLETINES_REPO="${BOLETINES_REPO:-$HOME/Git/boletin}"
BOLETIN="${BOLETIN:-}"

# Acepta los ajustes tanto como argumentos (scripts/publicar-boletin.sh BOLETIN="Boletin 06")
# como en el entorno (BOLETIN="Boletin 06" scripts/publicar-boletin.sh).
for arg in "$@"; do
  case "$arg" in
    BOLETIN=*)        BOLETIN="${arg#BOLETIN=}" ;;
    BOLETINES_REPO=*) BOLETINES_REPO="${arg#BOLETINES_REPO=}" ;;
    *) echo "Uso: scripts/publicar-boletin.sh [BOLETIN=\"Boletin NN\"] [BOLETINES_REPO=/ruta]" >&2; exit 1 ;;
  esac
done

# 1. Directorio del boletín (por defecto el más reciente del repo de boletines).
if [[ -z "$BOLETIN" ]]; then
  latest="$(ls -1d "$BOLETINES_REPO"/Boletin*/ 2>/dev/null | sort -V | tail -1 || true)"
  [[ -n "$latest" ]] || { echo "ERROR: no hay boletines en '$BOLETINES_REPO'." >&2; exit 1; }
  BOLETIN="$(basename "${latest%/}")"
fi
BOLETIN_DIR="$BOLETINES_REPO/$BOLETIN"
if [[ ! -d "$BOLETIN_DIR" ]]; then
  echo "ERROR: no existe el directorio '$BOLETIN_DIR'." >&2
  exit 1
fi

# 2. Fuente (con fecha) y .md de trabajo (imprenta).
SRC="$(ls "$BOLETIN_DIR"/????-??-??-Boletin*.md 2>/dev/null | head -1 || true)"
WORK="$(ls "$BOLETIN_DIR"/Boletin-*.md 2>/dev/null | head -1 || true)"
if [[ ! -f "$SRC" ]]; then
  echo "ERROR: falta la fuente (????-??-??-Boletin*.md) en '$BOLETIN_DIR'." >&2
  exit 1
fi
if [[ ! -f "$WORK" ]]; then
  echo "ERROR: falta el .md de trabajo (Boletin-*.md) en '$BOLETIN_DIR'." >&2
  echo "       Ejecuta primero en el repo de boletines: make trabajo BOLETIN=\"$BOLETIN\"" >&2
  exit 1
fi

DATE="$(basename "$SRC" | cut -c1-10)"                       # 2026-09-10
WORK_BASE="$(basename "$WORK")"                             # Boletin-06: Nombre.md
WEB_NAME="$DATE-$WORK_BASE"                                 # 2026-09-10-Boletin-06: Nombre.md
SLUG="$(basename "$WORK" .md | sed -e 's/["  :]/-/g' -e 's/--*/-/g' -e 's/^-//' -e 's/-$//')"

# 3. Copia web: ligas de diagrama -> .svg + desescapado de \$ (LaTeX).
WEB_TMP="$(mktemp)"
trap 'rm -f "$WEB_TMP"' EXIT
SLUG="$SLUG" python3 - "$WORK" > "$WEB_TMP" <<'PY'
import os, re, sys
slug = os.environ["SLUG"]
src = open(sys.argv[1], encoding="utf-8").read()
out = re.sub(r'!\[(.*?)\]\(Diagramas/([^()]+)\.pdf\)',
             r'![\1](diagramas/' + slug + r'/\2.svg)', src)
out = out.replace(r'\$', '$')   # importes en dólares: el escape de LaTeX no aplica en web
sys.stdout.write(out)
PY

# 4. Copiar los .svg del boletín a boletin/diagramas/<slug>/.
DEST_DIR="boletin/diagramas/$SLUG"
mkdir -p "$DEST_DIR"
cp "$BOLETIN_DIR"/Diagramas/*.svg "$DEST_DIR/"

# 5. Verificación: cada diagrama referenciado debe existir como .svg.
missing=0
while IFS= read -r stem; do
  if [[ ! -f "$DEST_DIR/$stem.svg" ]]; then
    echo "  FALTA el .svg de: Diagramas/$stem.pdf" >&2
    missing=1
  fi
done < <(grep -o 'Diagramas/[^)]*\.pdf' "$WORK" | sed 's#Diagramas/##; s#\.pdf$##' | sort -u)
if [[ "$missing" -ne 0 ]]; then
  echo "ERROR: faltan diagramas .svg; ejecuta 'make diagramas' en el repo de boletines." >&2
  exit 1
fi

mv "$WEB_TMP" "boletin/$WEB_NAME"
trap - EXIT

echo "==> Publicado en la web:"
echo "    boletin/$WEB_NAME"
echo "    slug     : $SLUG"
echo "    .svg     : $(find "$DEST_DIR" -name '*.svg' | wc -l) en boletin/diagramas/$SLUG"
echo "    fuente   : $SRC  (sin modificar)"
echo "    trabajo  : $(dirname "$WORK")/$(basename "$WORK")  (sin modificar)"
echo
echo "Pendiente manual:"
echo "  git add \"boletin/$WEB_NAME\" \"boletin/diagramas/$SLUG\""
echo "  git commit -m \"boletin: publicar $WEB_NAME\""