(() => {
  const root = document.documentElement;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));

  /* Theme ---------------------------------------------------------------- */
  const prefersDark = matchMedia('(prefers-color-scheme: dark)');
  const currentTheme = () => root.dataset.theme || (prefersDark.matches ? 'dark' : 'light');
  $('.theme-toggle')?.addEventListener('click', () => {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    const apply = () => {
      root.dataset.theme = next;
      try { localStorage.setItem('vellum-theme', next); } catch (e) {}
    };
    if (document.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      document.startViewTransition(apply);
    } else {
      apply();
    }
  });

  /* Mobile menu ------------------------------------------------------------ */
  const menuBtn = $('.menu-toggle');
  const links = $('#nav-links');
  const setMenu = (open) => {
    links.classList.toggle('open', open);
    menuBtn.setAttribute('aria-expanded', String(open));
  };
  menuBtn?.addEventListener('click', () => setMenu(!links.classList.contains('open')));
  document.addEventListener('click', (e) => {
    if (links?.classList.contains('open') && !e.target.closest('.nav')) setMenu(false);
  });

  /* Header state, reading progress, back to top ----------------------------- */
  const header = $('.site-header');
  const toTop = document.createElement('button');
  toTop.className = 'to-top';
  toTop.type = 'button';
  toTop.setAttribute('aria-label', 'Back to top');
  toTop.innerHTML = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6"/></svg>';
  toTop.addEventListener('click', () => scrollTo({ top: 0, behavior: 'smooth' }));
  document.body.append(toTop);

  let ticking = false;
  const onScroll = () => {
    const y = scrollY;
    const max = document.documentElement.scrollHeight - innerHeight;
    header.classList.toggle('scrolled', y > 8);
    header.style.setProperty('--progress', max > 0 ? Math.min(1, y / max) : 0);
    toTop.classList.toggle('show', y > innerHeight);
    ticking = false;
  };
  addEventListener('scroll', () => {
    if (!ticking) { requestAnimationFrame(onScroll); ticking = true; }
  }, { passive: true });
  onScroll();

  /* Home: show the header avatar once the hero avatar scrolls out of view */
  const heroAvatar = $('.hero-avatar');
  if (heroAvatar) {
    new IntersectionObserver(([entry]) => {
      header.classList.toggle('show-avatar', !entry.isIntersecting);
    }, { rootMargin: '-64px 0px 0px 0px' }).observe(heroAvatar);
  }

  /* TOC active heading ------------------------------------------------------ */
  const tocLinks = $$('.post-toc a');
  if (tocLinks.length) {
    const map = new Map();
    tocLinks.forEach((a) => {
      const id = decodeURIComponent(a.getAttribute('href').slice(1));
      const h = document.getElementById(id);
      if (h) map.set(h, a);
    });
    const headings = [...map.keys()];
    const update = () => {
      let active = headings[0];
      for (const h of headings) {
        if (h.getBoundingClientRect().top < 120) active = h; else break;
      }
      tocLinks.forEach((a) => a.classList.remove('active'));
      const link = map.get(active);
      if (link) {
        link.classList.add('active');
        const toc = $('.post-toc');
        const r = link.getBoundingClientRect(), t = toc.getBoundingClientRect();
        if (r.top < t.top || r.bottom > t.bottom) link.scrollIntoView({ block: 'nearest' });
      }
    };
    addEventListener('scroll', () => requestAnimationFrame(update), { passive: true });
    update();
  }

  /* Code copy ------------------------------------------------------------- */
  $$('.prose figure.highlight').forEach((fig) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'copy-button';
    btn.textContent = 'Copy';
    btn.addEventListener('click', async () => {
      const code = $('.code pre', fig) || $('pre', fig);
      try {
        await navigator.clipboard.writeText(code.innerText.replace(/\n$/, ''));
        btn.textContent = 'Copied';
      } catch (e) {
        btn.textContent = 'Failed';
      }
      setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
    });
    fig.append(btn);
  });

  /* Image zoom ------------------------------------------------------------ */
  $$('.prose img').forEach((img) => {
    if (img.closest('a')) return;
    img.addEventListener('click', () => {
      const overlay = document.createElement('div');
      overlay.className = 'zoom-overlay';
      overlay.innerHTML = `<img src="${img.currentSrc || img.src}" alt="${img.alt || ''}">`;
      const close = () => { overlay.remove(); removeEventListener('keydown', onKey); };
      const onKey = (e) => { if (e.key === 'Escape') close(); };
      overlay.addEventListener('click', close);
      addEventListener('keydown', onKey);
      document.body.append(overlay);
    });
  });

  /* Search ---------------------------------------------------------------- */
  const dialog = $('.search-dialog');
  if (dialog) {
    const input = $('input', dialog);
    const list = $('.search-results', dialog);
    let index = null;
    let selected = 0;

    const load = async () => {
      if (index) return index;
      const res = await fetch(dialog.dataset.src);
      const data = await res.json();
      index = data.map((p) => ({
        title: p.title || '',
        url: p.url,
        text: (p.content || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ')
      }));
      return index;
    };

    const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const mark = (s, q) => esc(s).replace(new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), (m) => `<mark>${m}</mark>`);

    const render = async () => {
      const q = input.value.trim();
      list.classList.remove('no-result');
      if (!q) { list.innerHTML = ''; return; }
      const data = await load();
      const lower = q.toLowerCase();
      const hits = [];
      for (const p of data) {
        const t = p.title.toLowerCase().indexOf(lower);
        const c = p.text.toLowerCase().indexOf(lower);
        if (t < 0 && c < 0) continue;
        const start = Math.max(0, c - 20);
        hits.push({ p, score: t >= 0 ? 0 : 1, snippet: c >= 0 ? p.text.slice(start, start + 90) : p.text.slice(0, 90) });
      }
      hits.sort((a, b) => a.score - b.score);
      selected = 0;
      list.innerHTML = hits.slice(0, 20).map((h, i) =>
        `<li><a href="${h.p.url}" role="option" aria-selected="${i === 0}"><strong>${mark(h.p.title, q)}</strong><span>${mark(h.snippet, q)}</span></a></li>`
      ).join('');
      if (!hits.length) list.classList.add('no-result');
    };

    const select = (n) => {
      const items = $$('a', list);
      if (!items.length) return;
      selected = (n + items.length) % items.length;
      items.forEach((a, i) => a.setAttribute('aria-selected', String(i === selected)));
      items[selected].scrollIntoView({ block: 'nearest' });
    };

    const open = () => {
      if (dialog.open) return;
      dialog.showModal();
      input.select();
      load().catch(() => {});
    };

    $('.search-trigger')?.addEventListener('click', open);
    addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); open(); }
      else if (e.key === '/' && !e.target.closest('input, textarea, [contenteditable]')) { e.preventDefault(); open(); }
    });
    input.addEventListener('input', render);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); select(selected + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); select(selected - 1); }
      else if (e.key === 'Enter') { const a = $$('a', list)[selected]; if (a) location.href = a.href; }
    });
    dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
  }

  /* Comments (Gitalk, loaded when scrolled near) -------------------------- */
  const comments = $('.comments[data-gitalk]');
  if (comments) {
    const loadGitalk = () => {
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = 'https://cdnjs.cloudflare.com/ajax/libs/gitalk/1.8.0/gitalk.min.css';
      document.head.append(css);
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/gitalk/1.8.0/gitalk.min.js';
      s.onload = () => {
        // Same issue key as hexo-theme-redefine, so existing comments stay attached.
        let id = decodeURI(location.pathname);
        if (id.length > 50) id = id.substring(0, 47) + '...';
        new Gitalk({ ...JSON.parse(comments.dataset.gitalk), id }).render('gitalk-container');
      };
      document.body.append(s);
    };
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { io.disconnect(); loadGitalk(); }
    }, { rootMargin: '400px' });
    io.observe(comments);
  }
})();
