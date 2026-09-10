# AGENTS.md

## Qué es este repo

Sitio web de Ingeniería Esencial S.A. de C.V. (iesencial.com): páginas HTML
estáticas + un **manejador de publicaciones de contenidos** (estilo noticias)
que publica artículos en markdown. Sin framework ni bundler: JavaScript/HTML/CSS
plano. **No usar PHP.**

El repo es git (rama `master`, remote `h3xt0r/iesencial.com`) solo para
desarrollo: **publicar no es `git push`**, se publica con `scripts/deploy.sh`
(rsync al root del vhost).

## Estructura

- `index.html` — página central mantenida. El menú apunta a `/toc/`,
  `/finanzas/`, `/boletin/` y a las páginas estáticas `soluciones.html`,
  `hardware.html`, `contacto.html`.
- `toc/`, `boletin/`, `finanzas/` — secciones del manejador:
  - `index.html` — plantilla idéntica que cambia solo `data-section` del
    `<body>` (y título/icono de la cabecera).
  - `YYYY-MM-DD-<Serie-NN>:<Título>.md` — artículos subidos **a mano** (ej.
    `2026-09-07-Boletin-01:Fondos de Noruega.md`). Los `:` y espacios del
    nombre se manejan con `encodeURIComponent`.
  - `index.json` — **generado** por `scripts/build-index.py`; no editar a mano.
- `assets/` — plantilla HTML5 UP del sitio existente (`main.css`, `main.js`,
  jQuery y plugins) + lo propio del manejador:
  - `assets/js/content.js` — el manejador: lee `data-section` del `<body>` y
    resuelve `../<seccion>/...` (por eso cada sección vive en su directorio),
    menú lateral derecho con paginador de 20 entradas, y convierte el `.md`
    con `marked` + `DOMPurify`. Enlaces profundos por hash `#art=<file
    codificado>`; sin hash abre el artículo más reciente. Los `fetch` llevan
    `?t=Date.now()` (cache-busting).
  - `assets/js/marked.min.js`, `assets/js/purify.min.js` — vendorizadas (CDN no
    confiable detrás de nginx).
  - `assets/katex/` — KaTeX (js/css + 20 fuentes woff2): renderiza `$...$` /
    `$$...$$` después del saneado. `content.js` nunca procesa dentro de
    `<code>`/`<pre>` y la heurística `isMathLike` evita que precios como
    `$5.00` se vuelvan matemática.
  - `assets/css/content.css` — estilos del manejador (fluidos; en móvil el menú
    se apila arriba del artículo vía `imp-narrower`).
  - `assets/js/ncl.js` — bloquea el clic derecho en todo el sitio (comportamiento
    existente, no quitar).
- `scripts/build-index.py` — regenera los `index.json` (más recientes primero)
  a partir de los `.md`. Admite secciones como argumentos:
  `python3 scripts/build-index.py boletin`; sin argumentos regenera todas. Es
  la única vía para generar índices (el servidor de producción no tiene node;
  `build-index.mjs` fue eliminado).
- `scripts/deploy.sh` — pre-flight de archivos críticos, regenera índices,
  rsync al root del vhost y verifica el destino. Variables: `SERVER_ROOT`
  (default `/srv/http/virtual-hosts/iesencial.com`), `SSH_TARGET` (despliegue
  remoto; post-check con curl a `SITE_URL`, default `https://www.iesencial.com`);
  sin `SSH_TARGET` verifica los archivos dentro de `SERVER_ROOT`. **Nunca usa
  `--delete`**: todo lo que esté en el servidor y no en el repo debe sobrevivir.
  Excluye del despliegue: `.git`, `AGENTS.md`, `scripts/`, `iesencial.conf` y
  `view-source_*`.

## Flujo de publicación (cliente)

1. Subir `.md` a la sección con prefijo de fecha ISO (`YYYY-MM-DD-...`).
2. `scripts/deploy.sh` (regenera `index.json`, copia al servidor).
3. El navegador del visitante descarga `index.json` y el `.md` elegido y lo
   convierte a HTML en el momento. Sin autenticación: el contenido se controla
   en el repositorio.

## Convenciones y trampas

- Contenido y código de UI en **español**.
- El menú del sitio apunta a las secciones como `/toc/`, `/finanzas/`,
  `/boletin/` (así en `index.html` y en el menú de cada página de sección).
- `iesencial.conf` (nginx: estático puro, `location ~* \.md$ {
  default_type text/markdown; }`) **no está en este repo**: se aplica aparte en
  el servidor (`nginx -t && systemctl reload nginx`), nunca vía deploy.
- `toc.html` y `financieros.html` en la raíz son copias estáticas viejas
  (pre-manejador, sin `content.js`) e `index.bak` un respaldo divergente de
  `index.html`: están en git y se despliegan, pero no son las páginas
  mantenidas. No borrarlas sin avisar y no enlazar el menú a ellas.
- `jquery.scrollgress.min.js` no existe (404 también en el sitio en vivo): las
  páginas del manejador lo omiten, pero las páginas raíz legadas (`toc.html`,
  `financieros.html`, `soluciones.html`, `hardware.html`, `contacto.html`)
  todavía lo referencian y dan 404 en consola.
- `assets/sass/`, `assets/webfonts/` y los `desktop.ini` son basura arrastrada
  de la plantilla descargada (todo está commiteado): ignorar, no "limpiar" sin
  avisar.
- Verificación enfocada: `python3 -m http.server 8080` en la raíz y abrir
  `/toc/`, `/boletin/`, `/finanzas/`; probar el paginador con más de 20
  artículos en una sección (borrarlos después).