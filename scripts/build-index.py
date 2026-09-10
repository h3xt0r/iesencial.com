#!/usr/bin/env python3
"""
Genera index.json ("manejador de contenidos") para las secciones toc/, boletin/
y finanzas/: lista de artículos .md ordenada de más reciente a más antigua.

Convención de nombres de archivo (subida manual):
    YYYY-MM-DD-<Serie-NN>:<Título>.md     ej. 2026-09-07-Boletin-01:Fondos de Noruega.md

Uso:
    python3 scripts/build-index.py [seccion ...]    (sin argumentos: todas)
"""
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
DATE_PREFIX_RE = re.compile(r"^(\d{4}-\d{2}-\d{2})-(.+)\.md$", re.IGNORECASE)

SECTIONS = {
    "toc": {"label": "Teoría de Restricciones"},
    "boletin": {"label": "Boletines"},
    "finanzas": {"label": "Servicios Financieros"},
}


def build_section(name, meta):
    dir_path = REPO_ROOT / name
    articles = []
    for path in sorted(dir_path.glob("*.md"), key=lambda p: p.name.lower()):
        m = DATE_PREFIX_RE.match(path.name)
        date = m.group(1) if m else ""
        title = m.group(2) if m else path.name[:-3]  # sin el sufijo .md
        articles.append({"date": date, "title": title, "file": path.name})

    # Más recientes primero; empate -> nombre de archivo descendente (estable).
    articles.sort(key=lambda a: (a["date"] or "0000", a["file"]), reverse=True)

    index = {
        "section": name,
        "label": meta["label"],
        "generated": datetime.now(timezone.utc).isoformat(),
        "count": len(articles),
        "articles": articles,
    }
    (dir_path / "index.json").write_text(
        json.dumps(index, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"{name}/index.json  ->  {len(articles)} artículo(s)")
    for a in articles:
        print(f"   {a['date'] or '????-??-??'}  {a['file']}")


def main():
    names = sys.argv[1:] or list(SECTIONS)
    for name in names:
        meta = SECTIONS.get(name)
        if meta is None:
            print(
                f"Sección desconocida: {name} (disponibles: {', '.join(SECTIONS)})",
                file=sys.stderr,
            )
            sys.exit(1)
        build_section(name, meta)


if __name__ == "__main__":
    main()