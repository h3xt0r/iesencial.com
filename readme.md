para compilar los archivos a pdf con pandoc

pandoc "2026-09-10-Boletin-03: CapEx en AI - rotacion capital - mercado de bonos.md" \
  --pdf-engine=xelatex \
  -V monofont="DejaVu Sans Mono" \
  -o bonos.pdf
