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
    p = p.replace(/\/+$/, '/');
    return p === '//' ? '/' : p;
  };

  const pathname = norm(location.pathname);

  let current = routes[0];
  for (const r of routes) {
    const rp = norm(r.path);
    const match = (rp === '/' ? pathname === '/' : (pathname === rp || pathname.startsWith(rp)));
    if (match && rp.length > norm(current.path).length) current = r;
  }

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

  const base = 'e164.it';
  document.title = `${base} — ${current.label}`;

  document.querySelectorAll('footer').forEach((footer) => footer.remove());
  const footer = document.createElement('footer');
  footer.className = 'meta';
  footer.style.textAlign = 'center';
  footer.style.display = 'flex';
  footer.style.justifyContent = 'center';
  footer.style.alignItems = 'center';
  footer.style.width = '100%';
  footer.style.padding = '12px 0 20px';
  footer.style.borderTop = 'none';
  const footerInner = document.createElement('span');
  footerInner.style.display = 'inline-flex';
  footerInner.style.alignItems = 'center';
  footerInner.innerHTML = 'Another tool brought to you by <a href="https://www.linkedin.com/in/antoniopradoit/" target="_blank" rel="noopener noreferrer">The Internet Floopaloo</a> • ';
  const sourceLink = document.createElement('a');
  sourceLink.href = 'https://github.com/Antonio-Prado/e164-it';
  sourceLink.target = '_blank';
  sourceLink.rel = 'noopener noreferrer';
  sourceLink.textContent = 'Source';
  footerInner.appendChild(sourceLink);

  fetch('https://api.github.com/repos/Antonio-Prado/e164-it/commits/main', { cache: 'no-store' })
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => {
      const sha = data?.sha;
      const htmlUrl = data?.html_url;
      if (!sha || !htmlUrl) return;
      const shortSha = sha.slice(0, 7);
      sourceLink.href = htmlUrl;
      sourceLink.textContent = `Source @ ${shortSha}`;
    })
    .catch(() => {});

  footer.appendChild(footerInner);
  document.body.appendChild(footer);
})();
