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

  // 3) opzionale ma utile: corregge anche il titolo del tab se fosse clonato da Docs
  const base = 'e164.it';
  document.title = `${base} — ${current.label}`;

  // 4) rimuove eventuali footer iniettati da layout esterni
  document.querySelectorAll('footer').forEach((footer) => footer.remove());
})();
