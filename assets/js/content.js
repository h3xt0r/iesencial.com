/**
 * Manejador de contenidos (estilo noticias) — IES
 *
 * Convierte, al momento de presentarse en WEB, los artículos en markdown que
 * se suben manualmente a las carpetas toc/, boletin/ y finanzas/.
 *
 * Flujo:
 *   1. Lee <body data-section="..."> para saber en qué sección está la página.
 *   2. Descarga <seccion>/index.json (generado por scripts/build-index.py):
 *      lista de artículos con fecha, título y nombre de archivo.
 *   3. Dibuja en la barra lateral derecha el menú de artículos (más recientes
 *      primero) con paginador de 20 entradas.
 *   4. Al elegir un artículo descarga su .md, lo convierte a HTML con marked
 *      y lo limpiar con DOMPurify antes de inyectarlo.
 *
 * Requiere: assets/js/marked.min.js y assets/js/purify.min.js (incluidos antes
 * que este archivo).
 */
(function () {
  'use strict';

  var PAGE_SIZE = 20;               // entradas por página del paginador

  var BODY = document.body;
  var SECTION = (BODY && BODY.getAttribute('data-section')) || '';
  if (!SECTION) return;             // no es una página de contenidos

  var ROOT = '../';                 // las páginas de sección viven en <seccion>/index.html
  var INDEX_URL = ROOT + SECTION + '/index.json';
  var viewEl    = document.getElementById('article-view');
  var metaEl    = document.getElementById('article-meta');
  var menuEl    = document.getElementById('article-menu');
  var pagerEl   = document.getElementById('article-pager');

  var articles = [];               // [{ date, title, file }] ordenado desc
  var currentPage = 1;
  var totalPages = 1;

  /* ---------- utilidades ---------- */

  function encodeFile(name) {
    return encodeURIComponent(name).replace(/%2F/gi, '/');  // nunca debe contener '/'
  }

  function readHash() {
    var raw = window.location.hash || '';
    // raw empieza con '#', p.ej. "#art=2026-09-07-....md"
    if (raw.indexOf('art=') === 1) {
      try { return decodeURIComponent(raw.slice(5)); } catch (e) { return null; }
    }
    return null;
  }

  function setHash(file) {
    var h = 'art=' + encodeFile(file);
    try { window.history.replaceState(null, '', '#' + h); } catch (e) { /* sin hash */ }
  }

  function text(s) {
    return String(s == null ? '' : s);
  }

  function esc(s) {
    var d = document.createElement('div');
    d.textContent = text(s);
    return d.innerHTML;
  }

  /* ---------- menú lateral + paginador ---------- */

  function renderMenu() {
    var start = (currentPage - 1) * PAGE_SIZE;
    var slice = articles.slice(start, start + PAGE_SIZE);
    var frag = document.createDocumentFragment();

    slice.forEach(function (a) {
      var li = document.createElement('li');
      li.className = 'article-item';

      var link = document.createElement('a');
      link.href = '#' + 'art=' + encodeFile(a.file);
      link.setAttribute('data-file', a.file);
      link.setAttribute('title', a.title);

      var date = document.createElement('span');
      date.className = 'article-date';
      date.textContent = a.date || 's/f';

      var title = document.createElement('span');
      title.className = 'article-title';
      title.textContent = a.title;

      link.appendChild(date);
      link.appendChild(title);
      li.appendChild(link);
      frag.appendChild(li);
    });

    menuEl.innerHTML = '';
    if (slice.length === 0) {
      menuEl.innerHTML = '<p class="article-empty">Sin artículos. Sube archivos ' +
        'con el formato <code>YYYY-MM-DD-Nombre.md</code> y ejecuta ' +
        '<code>scripts/build-index.py</code>.</p>';
    } else {
      menuEl.appendChild(frag);
    }
    renderPager();
    markActive();
  }

  function renderPager() {
    if (totalPages <= 1) {
      pagerEl.innerHTML = '';
      return;
    }
    var wrap = document.createElement('div');
    wrap.className = 'article-pager-inner';

    var prev = document.createElement('button');
    prev.type = 'button';
    prev.className = 'pager-btn';
    prev.textContent = '‹ Anterior';
    prev.disabled = currentPage <= 1;
    prev.addEventListener('click', function () {
      if (currentPage > 1) { currentPage--; renderMenu(); }
    });

    var info = document.createElement('span');
    info.className = 'pager-info';
    info.textContent = 'Página ' + currentPage + ' de ' + totalPages;

    var next = document.createElement('button');
    next.type = 'button';
    next.className = 'pager-btn';
    next.textContent = 'Siguiente ›';
    next.disabled = currentPage >= totalPages;
    next.addEventListener('click', function () {
      if (currentPage < totalPages) { currentPage++; renderMenu(); }
    });

    wrap.appendChild(prev);
    wrap.appendChild(info);
    wrap.appendChild(next);
    pagerEl.innerHTML = '';
    pagerEl.appendChild(wrap);
  }

  function markActive() {
    var current = readHash();
    Array.prototype.forEach.call(menuEl.querySelectorAll('.article-item a'), function (a) {
      a.classList.toggle('active', a.getAttribute('data-file') === current);
    });
  }

  /* ---------- matemáticas (LaTeX tipo GFM: $...$ y $$...$$) ---------- */

  // Solo se trata como matemática lo que "parece" LaTeX: comandos (\, ^, _, {, })
  // o un token corto (p. ej. $T$). Así textos como "$5 y $3" no se rompen.
  function isMathLike(tex) {
    if (/[\\^_{}]/.test(tex)) return true;
    return /^[A-Za-z][A-Za-z0-9]{0,9}$/.test(tex);
  }

  // Divide un texto en piezas: texto literal y matemática (inline/display).
  function mathPieces(text) {
    var re = /\$\$([\s\S]+?)\$\$|\$([^$\n]+)\$/g;
    var pieces = [];
    var last = 0;
    var m, matched = false;
    while ((m = re.exec(text)) !== null) {
      matched = true;
      if (m.index > last) pieces.push({ type: 'text', value: text.slice(last, m.index) });
      if (m[1] !== undefined) {
        pieces.push({ type: 'display', value: m[1] });
      } else if (isMathLike(m[2])) {
        pieces.push({ type: 'math', value: m[2] });
      } else {
        pieces.push({ type: 'text', value: m[0] });  // no parece matemática: literal
      }
      last = m.index + m[0].length;
    }
    if (!matched) return null;
    if (last < text.length) pieces.push({ type: 'text', value: text.slice(last) });
    return pieces;
  }

  // Recorre el artículo ya inyectado y reemplaza los nodos de texto con
  // matemática por elementos KaTeX. No toca <code>/<pre> (código literal).
  function renderMathIn(rootEl) {
    if (!window.katex || !rootEl) return;
    var walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        for (var p = node.parentElement; p && p !== rootEl; p = p.parentElement) {
          if (p.tagName === 'CODE' || p.tagName === 'PRE' ||
              p.tagName === 'SCRIPT' || p.tagName === 'STYLE') {
            return NodeFilter.FILTER_REJECT;
          }
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    var textNodes = [];
    var node;
    while ((node = walker.nextNode()) !== null) textNodes.push(node);

    textNodes.forEach(function (textNode) {
      var pieces = mathPieces(textNode.nodeValue);
      if (!pieces) return;
      var frag = document.createDocumentFragment();
      pieces.forEach(function (piece) {
        if (piece.type === 'text') {
          frag.appendChild(document.createTextNode(piece.value));
          return;
        }
        var span = document.createElement('span');
        try {
          katex.render(piece.value, span, {
            displayMode: piece.type === 'display',
            throwOnError: false,
            strict: false
          });
        } catch (e) {
          span.textContent = '$' + piece.value + '$';
        }
        frag.appendChild(span);
      });
      textNode.parentNode.replaceChild(frag, textNode);
    });
  }

  /* ---------- lector de artículos ---------- */

  function showStatus(message) {
    viewEl.innerHTML = '<p class="article-status">' + esc(message) + '</p>';
  }

  function loadArticle(file, leaveHash) {
    if (!file) return;

    if (!leaveHash) setHash(file);
    viewEl.innerHTML = '<p class="article-status">Cargando…</p>';

    fetch(ROOT + SECTION + '/' + encodeFile(file) + '?t=' + Date.now())
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.text();
      })
      .then(function (md) {
        var found = articles.filter(function (a) { return a.file === file; })[0];
        var html;
        try {
          html = window.marked.parse(md);
        } catch (e) {
          html = '<pre>' + esc(md) + '</pre>';
        }
        if (window.DOMPurify) html = DOMPurify.sanitize(html);
        // Puede que el .md traiga su propio H1; mostramos fecha arriba y dejamos
        // que el contenido del artículo conserve su encabezado.
        if (metaEl) {
          if (found && found.date) {
            metaEl.textContent = (found.date) + ' · ' + (SECTION + '/');
          } else {
            metaEl.textContent = SECTION + '/';
          }
        }
        viewEl.innerHTML = '<div class="article-body">' + html + '</div>';
        renderMathIn(viewEl);
        markActive();
      })
      .catch(function (err) {
        showStatus('No se pudo cargar el artículo: ' + err.message);
      });
  }

  /* ---------- arranque ---------- */

  function init() {
    if (!viewEl || !menuEl) return;

    fetch(INDEX_URL + '?t=' + Date.now())
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        articles = (data && data.articles) || [];
        // Defensa extra: orden más reciente primero.
        articles.sort(function (a, b) {
          return (b.date || '0000').localeCompare(a.date || '0000') || b.file.localeCompare(a.file);
        });
        totalPages = Math.max(1, Math.ceil(articles.length / PAGE_SIZE));

        renderMenu();

        var wanted = readHash();
        var has = articles.some(function (a) { return a.file === wanted; });
        if (wanted && has) {
          loadArticle(wanted, true);
        } else if (wanted) {
          showStatus('El artículo solicitado no existe en esta sección.');
          if (articles.length) loadArticle(articles[0].file, true);
        } else if (articles.length) {
          // Vista inicial tipo noticias: abre el artículo más reciente.
          loadArticle(articles[0].file, true);
        } else {
          showStatus('Aún no hay artículos en esta sección.');
        }
      })
      .catch(function (err) {
        showStatus('No se pudo leer ' + INDEX_URL + '. ¿Se ejecutó ' +
          'scripts/build-index.py después de subir los artículos? (' + err.message + ')');
      });
  }

  window.addEventListener('hashchange', function () {
    var wanted = readHash();
    if (wanted) loadArticle(wanted, true);
    markActive();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();