# AGENTS.md

## Qué es este repo

Sitio web de Ingeniería Esencial S.A. de C.V. (iesencial.com): páginas HTML
estáticas + un **manejador de publicaciones de contenidos** (estilo noticias)
que publica artículos en markdown. Desarrollo aquí, despliegue aparte en el
servidor (root del vhost según `iesencial.conf`). No hay framework ni bundler;
todo este stack es JavaScript/HTML/CSS plano. **No usar PHP.**

## Estructura

- `index.html` — página central (convertida de la copia de referencia).
- `toc/`, `boletin/`, `finanzas/` — secciones de contenido:
  - `index.html` — página del manejador (idéntica plantilla, cambia solo
    `data-section` del `<body>` y la sección del título).
  - `YYYY-MM-DD-<Serie-NN>:<Título>.md` — artículos subidos **manualmente**
    (el ejemplo canónico del cliente: `2026-09-07-Boletin-01:Fondos de Noruega.md`).
    Los dos puntos y espacios del nombre se manejan vía `encodeURIComponent`.
  - `index.json` — **generado** por `scripts/build-index.mjs` (lista de
    artículos más recientes primero). No editar a mano.
- `assets/` — plantilla HTML5 UP del sitio existente (descargada del sitio en
  vivo: `main.css`, `main.js`, jQuery y plugins) + lo propio del manejador:
  - `assets/js/content.js` — el manejador (menú lateral derecho, paginador de
    20 entradas, lee `.md` y lo convierte a HTML con `marked` + `DOMPurify`).
  - `assets/js/marked.min.js`, `assets/js/purify.min.js` — dependencias
    vendorizadas (CDN no confiable detrás de nginx).
  - `assets/katex/` — **KaTeX** (katex.min.js/css + 20 fuentes woff2): renderiza
    matemáticas LaTeX tipo GFM (`$...$`, `$$...$$`) que `marked` no procesa.
    `content.js` los convierte después del saneado (nunca dentro de `<code>`/
    `<pre>`; una heurística evita que precios como `$5.00` se vuelvan matemática).
  - `assets/css/content.css` — estilos fluidos del manejador (sin dimensiones
    fijas; en móvil el menú se apila arriba del artículo vía `imp-narrower`).
- `scripts/build-index.mjs` (+ `build-index.py` equivalente) — regenera los
  `index.json` a partir de los `.md`. Elijo a mano: `node` si existe, si no
  `python3` (**este entorno no tiene node**).
- `scripts/deploy.sh` — verifica archivos críticos (pre-flight), genera índices
  y copia el repo al root del vhost (local o vía `SSH_TARGET=...`), y verifica
  en el destino (post-check: URLs 200 en remoto, existencia de archivos en
  local). **Nunca usa `--delete`**: páginas del sitio que no están en el repo
  (soluciones.html, hardware.html, contacto.html) deben sobrevivir el despliegue.
- `iesencial.conf` — nginx: estático puro (PHP removido), `try_files` +
  `location ~* \.md$ { default_type text/markdown; }`. Aplicar aparte del
  deploy: `nginx -t && systemctl reload nginx`.

## Flujo de publicación (cliente)

1. Subir `.md` a la sección con el prefijo de fecha ISO (`YYYY-MM-DD-...`).
2. `scripts/deploy.sh` (regenera `index.json`, copia al servidor).
3. El navegador del visitante descarga `index.json` y el `.md` elegido y lo
   convierte a HTML en el momento. Sin autenticación: el contenido se controla
   en el repositorio.

## Convenciones y trampas

- Contenido y código de UI en **español**.
- El menú del sitio apunta a las secciones como `toc/`, `finanzas/`, `boletin/`
  (sesgados en `index.html` y en el menú de cada página de sección).
- `content.js` se lee `data-section` del `<body>` y resuelve `../<seccion>/...`;
  por eso `index.html` de cada sección está en su propio directorio.
- Los artículos se enlazan por hash `#art=<fileName codificado>` (lectura
  profunda directa; sin hash abre el artículo más reciente).
- Los archivos `view-source_https___www.iesencial.com*.html` son **copias de
  referencia antiguas** (pre-manejador); `index.html` es la página central
  mantenida. No borrar las copias sin avisar.
- `jquery.scrollgress.min.js` da 404 incluso en el sitio en vivo: omitido.
- `ncl.js` bloquea el clic derecho en todo el sitio (comportamiento existente).
- Verificación enfocada: `python3 -m http.server 8080` en la raíz y abrir
  `/toc/`, `/boletin/`, `/finanzas/`; probar paginador con más de 20 artículos
  en una sección (borrarlos después).