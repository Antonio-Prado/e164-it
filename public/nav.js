(() => {
  const routes = [
    { path: '/',         label: 'Single',  subtitle: 'Parse/format E.164 numbers. VoIP/CRM-friendly outputs.' },
    { path: '/batch/',   label: 'Batch CSV', subtitle: 'Process CSV batches: normalize, validate, export.' },
    { path: '/docs/',    label: 'Docs',    subtitle: 'API + Batch reference, operational notes, and examples.' },
    { path: '/api/',     label: 'API',     subtitle: 'Endpoints, parameters, and examples.' },
    { path: '/privacy/', label: 'Privacy', subtitle: 'Privacy & security notes.' },
    { path: '/samples/', label: 'Samples', subtitle: 'Examples and test vectors.' },
  ];
  const norm = (p) => {
    if (!p) return '/';
    p = p.split('?')[0].split('#')[0];
    if (!p.startsWith('/')) p = '/' + p;
    // normalizza trailing slash (tutto con slash, tranne root)
    p = p.replace(/\/+$/, '/');
    return p === '//' ? '/' : p;
  };

  const pathname = norm(location.pathname);

  // scegli la route più specifica (prefisso più lungo)
  let current = routes[0];
  for (const r of routes) {
    const rp = norm(r.path);
    const match = (rp === '/' ? pathname === '/' : (pathname === rp || pathname.startsWith(rp)));
    if (match && rp.length > norm(current.path).length) current = r;
  }

  // 1) evidenzia voce menu corretta (supporta sia aria-current sia class="active")
  const header = document.querySelector('header');
  if (header) {
    const links = header.querySelectorAll('nav a[href]');
    links.forEach(a => {
      const hrefPath = norm(new URL(a.getAttribute('href'), location.origin).pathname);
      const isActive = hrefPath === norm(current.path);

      a.classList.toggle('active', isActive);
      if (isActive) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });

    // 2) corregge la label “Docs” in alto a sinistra se è una label di sezione
    // (non tocca “e164.it” se lo usi come brand fisso)
    const brand = header.querySelector('.brand') || header;
    const candidates = [
      brand.querySelector('h1'),
      brand.querySelector('.subtitle'),
      brand.querySelector('p'),
      brand.querySelector('.muted'),
    ].filter(Boolean);

    const known = new Set(routes.map(r => r.label.toLowerCase()));
    for (const el of candidates) {
      const t = (el.textContent || '').trim().toLowerCase();
      if (known.has(t)) { el.textContent = current.label; break; }
    }
    const subtitleEl = header.querySelector('.subtitle');
    if (subtitleEl && current.subtitle) subtitleEl.textContent = current.subtitle;
  }

  function ensureFooter() {
    // Remove any legacy in-page footers (older templates kept it inside <main>).
    document.querySelectorAll('footer.meta').forEach(el => el.remove());

    // Inject minimal footer styles once (also works on pages that don't load styles.tech.css).
    if (!document.getElementById('e164-footer-style')) {
      const style = document.createElement('style');
      style.id = 'e164-footer-style';
      style.textContent = `
        :root{--e164-border:rgba(0,0,0,.12);--e164-muted:rgba(0,0,0,.62)}
        .site-footer{margin-top:28px;padding-top:14px;border-top:1px solid var(--border,var(--e164-border));font-size:12px;line-height:1.35;color:var(--muted,var(--e164-muted))}
        .site-footer a{color:inherit;text-decoration:none}
        .site-footer a:hover{text-decoration:underline}
        .site-footer__row{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
        .site-footer__note{max-width:68ch}
        .site-footer__sub{margin-top:10px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
        .site-footer__nav{display:flex;align-items:center;flex-wrap:wrap}
        .site-footer__nav a + a::before{content:"·";opacity:.75;margin:0 10px}
        .site-footer__copy{opacity:.9}
      `.trim();
      document.head.appendChild(style);
    }

    const wrap = document.querySelector('.wrap') || document.body;
    const main = wrap.querySelector('main') || document.querySelector('main');

    // Avoid duplicates on soft navigations or cached DOM.
    wrap.querySelectorAll('footer.site-footer').forEach(el => el.remove());

    const footerHints = [
      {
        prefix: '/docs/batch/',
        note: 'Batch docs: CSV input, normalization, validation, output fields.',
        ctaHref: '/batch/',
        ctaLabel: 'Go to Batch CSV →',
      },
      {
        prefix: '/docs/api/',
        note: 'API docs: endpoints, request/response schema, status codes.',
        ctaHref: '/api/',
        ctaLabel: 'Back to API →',
      },
      {
        prefix: '/docs/',
        note: 'Docs live at /docs. Same styling as the main UI.',
        ctaHref: '/',
        ctaLabel: 'Back to Single →',
      },
      {
        prefix: '/batch/',
        note: 'Batch: CSV processing is local; API calls happen only when you submit.',
        ctaHref: '/docs/batch/',
        ctaLabel: 'Read Batch docs →',
      },
      {
        prefix: '/api/',
        note: 'API reference (quick). Full docs: /docs/api/.',
        ctaHref: '/docs/api/',
        ctaLabel: 'Open API docs →',
      },
      {
        prefix: '/privacy/',
        note: 'Privacy & security notes for e164.it.',
        ctaHref: '/docs/security/',
        ctaLabel: 'Security notes →',
      },
      {
        prefix: '/samples/',
        note: 'Examples and test vectors (useful for automated checks).',
        ctaHref: '/docs/faq/',
        ctaLabel: 'Read FAQ →',
      },
      {
        prefix: '/',
        note: 'Local-only: API key stored in your browser (localStorage).',
        ctaHref: '/batch/',
        ctaLabel: 'Go to Batch CSV →',
      },
    ];

    let hint = footerHints[footerHints.length - 1];
    for (const h of footerHints) {
      if (pathname === h.prefix || (h.prefix !== '/' && pathname.startsWith(h.prefix))) { hint = h; break; }
    }

    const year = String(new Date().getFullYear());
    const footer = document.createElement('footer');
    footer.className = 'site-footer';
    footer.setAttribute('role', 'contentinfo');
    footer.innerHTML = `
      <div class="site-footer__row">
        <span class="site-footer__note">${hint.note}</span>
        <span><a href="${hint.ctaHref}">${hint.ctaLabel}</a></span>
      </div>
      <div class="site-footer__sub">
        <nav class="site-footer__nav" aria-label="Footer">
          <a href="/docs/">Docs</a>
          <a href="/api/">API</a>
          <a href="/privacy/">Privacy</a>
          <a href="/samples/">Samples</a>
          <a href="https://github.com/Antonio-Prado/e164-it" target="_blank" rel="noopener noreferrer">GitHub</a>
        </nav>
        <span class="site-footer__copy">© ${year} e164.it</span>
      </div>
    `.trim();

    if (main && main.parentElement === wrap) wrap.insertBefore(footer, main.nextSibling);
    else wrap.appendChild(footer);
  }

  ensureFooter();

  // 3) opzionale ma utile: corregge anche il titolo del tab se fosse clonato da Docs
  const base = 'e164.it';
  document.title = `${base} — ${current.label}`;

  // 4) rimuove eventuali footer iniettati da layout esterni
  document.querySelectorAll('footer').forEach((footer) => footer.remove());
})();
