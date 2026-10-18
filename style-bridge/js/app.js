// App shell: hash router, views and event handling.
(function () {
  const S = SB.store;
  const sess = SB.session;
  const main = document.getElementById('main');
  const MAX_PHOTOS = 6;
  const MAX_PHOTO_MB = 15;

  // ---------- helpers ----------
  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function plain(name) { return name.replace(/ \(.*\)$/, ''); }
  function tierText(tiers) {
    const min = Math.min.apply(null, tiers), max = Math.max.apply(null, tiers);
    const s = function (n) { return SB.vocab.budgets[n - 1].short; };
    return min === max ? s(min) : s(min) + '–' + s(max);
  }
  function monogram(name) {
    const words = name.replace(/[^A-Za-z0-9 &']/g, '').split(/\s+/).filter(Boolean);
    return (words.length > 1 ? words[0][0] + words[1][0] : words[0].slice(0, 2)).toUpperCase();
  }
  function brandTone(id) {
    const tones = ['#e7ded1', '#dfe5dc', '#e4dfe8', '#efe1d6', '#dde3ea', '#ece6d3'];
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    return tones[h % tones.length];
  }
  const ext = ' <span class="sr-only">(opens in a new tab)</span><span aria-hidden="true">↗</span>';

  const ICONS = {
    tees: 'M16 8l-8 5 3 6 4-2v21h18V17l4 2 3-6-8-5c-1 3-3.5 4.5-8 4.5S17 11 16 8z',
    shirts: 'M17 8l-9 5 3 7 4-2v20h18V18l4 2 3-7-9-5-7 6-7-6zM24 14v24',
    knitwear: 'M17 8l-9 6 2 18h5V18v20h18V18v14h5l2-18-9-6c-1 3-3.5 4-7 4s-6-1-7-4z',
    outerwear: 'M17 7l-10 6 2 22h6V20v19h8V12l-6-5zM31 7l10 6-2 22h-6V20v19h-8V12l6-5z',
    pants: 'M14 7h20l2 33h-7l-5-24-5 24h-7z',
    denim: 'M14 7h20l2 33h-7l-5-24-5 24h-7zM14 12h20',
    dresses: 'M19 6h10l-1 8 9 26H11l9-26z',
    activewear: 'M17 7h14l1 33h-6l-2-22-2 22h-6z',
    shoes: 'M6 30c0-6 2-12 6-12 2 4 6 6 12 6l14 4c3 1 4 3 4 6v2H6z',
    accessories: 'M12 18h24l3 22H9zM18 18c0-6 2-9 6-9s6 3 6 9'
  };
  function itemIcon(cat) {
    return '<svg viewBox="0 0 48 48" aria-hidden="true" focusable="false"><path d="' + (ICONS[cat] || ICONS.tees) + '"/></svg>';
  }

  function visionProviderName() { return SB.services.status.features.visionProvider === 'anthropic' ? 'Anthropic' : 'OpenAI'; }

  function sourceBadge(source) {
    const map = { user: 'You told us', guess: 'Suggested', confirmed: 'You confirmed' };
    return '<span class="badge badge-' + source + '"' + (source === 'guess' ? ' title="Suggested by Style Bridge"' : '') + '>' + map[source] + (source === 'guess' ? '<span class="sr-only"> by Style Bridge</span>' : '') + '</span>';
  }

  // ---------- router ----------
  const routes = {
    '': { title: 'Style Bridge — Discover brands that fit your style, budget and life', render: viewHome },
    start: { title: 'Tell us your style · Style Bridge', render: viewStart },
    profile: { title: 'Your style profile · Style Bridge', render: viewProfile },
    matches: { title: 'Your picks · Style Bridge', render: viewMatches },
    saved: { title: 'Saved · Style Bridge', render: viewSaved },
    cart: { title: 'Your cart · Style Bridge', render: viewCart },
    checkout: { title: 'Checkout · Style Bridge', render: viewCheckout },
    brands: { title: 'Brand guide · Style Bridge', render: viewBrands },
    privacy: { title: 'Privacy & your data · Style Bridge', render: viewPrivacy }
  };

  function currentRoute() {
    const hash = location.hash.replace(/^#\/?/, '');
    const [name, anchor] = hash.split('#');
    return { name: routes[name] ? name : '', anchor: anchor };
  }

  function render(opts) {
    opts = opts || {};
    const route = currentRoute();
    const focusId = opts.keepFocus && document.activeElement ? document.activeElement.id : null;
    const scrollY = window.scrollY;
    main.innerHTML = routes[route.name].render();
    document.title = routes[route.name].title;
    document.body.classList.toggle('route-home', route.name === '');
    updateNav(route.name);
    applyMotion(!opts.keepFocus);
    if (route.name === '') initStage();
    onScroll();
    if (route.name === 'matches') setTimeout(maybeAutoWebSearch, 0);

    if (opts.keepFocus) {
      window.scrollTo(0, scrollY);
      const target = (focusId && document.getElementById(focusId)) || (opts.fallbackFocus && document.getElementById(opts.fallbackFocus));
      if (target) target.focus({ preventScroll: true });
    } else {
      const anchorEl = route.anchor && document.getElementById(route.anchor);
      if (anchorEl) anchorEl.scrollIntoView();
      else window.scrollTo(0, 0);
      const h1 = main.querySelector('h1');
      if (h1 && !opts.initial) h1.focus({ preventScroll: true });
    }
  }

  function go(path) {
    if (location.hash === '#' + path) render();
    else location.hash = path;
  }

  function updateNav(name) {
    document.querySelectorAll('.site-nav a').forEach(function (a) {
      const target = a.getAttribute('href').replace(/^#\/?/, '');
      if (target === name || (target === 'cart' && name === 'checkout')) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    const n = S.state.favorites.brands.length + S.state.favorites.items.length;
    const badge = document.getElementById('saved-count');
    badge.textContent = n ? String(n) : '';
    badge.hidden = !n;
    const c = cartCount();
    const cb = document.getElementById('cart-count');
    if (cb) { cb.textContent = c ? String(c) : ''; cb.hidden = !c; }
  }

  // ---------- HOME ----------
  // White hero with an image card and a full-width wordmark; a black panel slides up over it on scroll.
  // Images are optional files in assets/ (see loadArt); without them, color fields stand in.
  function viewHome() {
    const hasProfile = !!S.state.profile;
    const vision = SB.services.status.features.vision;
    const arr = '<span class="arr" aria-hidden="true">→</span>';
    return '' +
      '<section class="j-hero" aria-labelledby="hero-title">' +
        '<div class="j-hero-sticky">' +
          '<div class="j-stage" aria-hidden="true"></div>' +
          '<h1 class="wordmark j-hero-mark" id="hero-title" tabindex="-1" data-fit>Style Bridge</h1>' +
          '<p class="j-hint" aria-hidden="true">Press &amp; drag</p>' +
        '</div>' +
      '</section>' +
      '<div class="j-body">' +
        '<section class="j-row" aria-label="About Style Bridge">' +
          '<p class="j-label">2026 — United States</p>' +
          '<div class="j-content">' +
            '<p class="j-statement">Find brands and pieces that fit your style, budget and life — not just the brands you already know. Tell us what you like, add an outfit photo, and we’ll search official brand sites and reputable stores for specific products, with a reason for each one.</p>' +
            '<p class="j-actions">' +
              (hasProfile
                ? '<a class="j-link" href="#/matches">View my picks ' + arr + '</a><a class="j-link" href="#/profile">Edit my style profile ' + arr + '</a>'
                : '<a class="j-link" href="#/start">Build my style profile ' + arr + '</a>') +
              '<button type="button" class="j-link" id="sample-home" data-action="load-sample">Try a sample profile ' + arr + '</button>' +
            '</p>' +
          '</div>' +
        '</section>' +
        '<section class="j-row" id="how" aria-labelledby="how-title">' +
          '<h2 class="j-label" id="how-title">How it works</h2>' +
          '<div class="j-content"><ol class="j-list cols-3">' +
            '<li><span class="j-num">01</span><strong>Tell us what you like</strong>Name brands you like from any country — English or Chinese names work — and add an outfit photo if you want.</li>' +
            '<li><span class="j-num">02</span><strong>Shape your style profile</strong>Answer a few questions and adjust the tags we suggest from your brands and photos, all on one page. Size and ZIP code are optional.</li>' +
            '<li><span class="j-num">03</span><strong>Get specific picks</strong>Exact products from official sites and reputable stores, with reasons, sources and other places to buy them.</li>' +
          '</ol></div>' +
        '</section>' +
        '<section class="j-row" aria-labelledby="who-title">' +
          '<h2 class="j-label" id="who-title">Made for</h2>' +
          '<div class="j-content"><ul class="j-list cols-3">' +
            '<li><strong>New to the US</strong>Know your style but not the local brands? Start from brands you wore before and find US options with a similar look and price.</li>' +
            '<li><strong>Ready for something new</strong>Love one brand but want more options? We look at style, fit, category and budget, not just the label.</li>' +
            '<li><strong>Shopping with a goal</strong>Work pants under $100 or a warm coat for your first winter — tell us, and we keep the list short.</li>' +
          '</ul></div>' +
        '</section>' +
        '<section class="j-row" aria-labelledby="promise-title">' +
          '<h2 class="j-label" id="promise-title">Our promises</h2>' +
          '<div class="j-content"><ul class="j-list">' +
            '<li><strong>No account needed</strong>Your profile stays in this browser.</li>' +
            '<li><strong>' + (vision ? 'Photo AI is opt-in, per photo' : 'Photos stay on your device') + '</strong>Clothes only — never faces, body or identity.</li>' +
            '<li><strong>Every budget welcome</strong>We only use a budget you set, and we never guess it.</li>' +
            '<li><strong>Honest information</strong>Sources on every pick. Anything we couldn’t verify is labeled.</li>' +
          '</ul></div>' +
        '</section>' +
      '</div>';
  }

  // ---------- motion: wordmark, scroll reveal, pill nav, hero image ----------
  const reduceMotion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)').matches : false;
  // Splits a wordmark into letters (for the rise-in) and sizes it to fill its container's width.
  function splitWordmark(el) {
    if (el.dataset.split) return;
    const text = el.textContent.trim();
    let i = 0;
    el.setAttribute('aria-label', text);
    el.innerHTML = '<span class="wm-inner" aria-hidden="true">' + text.split(' ').map(function (word) {
      return '<span class="wm-line"><span class="wm-clip">' + word.split('').map(function (ch) {
        return '<span class="wm-ch" style="--i:' + (i++) + '">' + esc(ch) + '</span>';
      }).join('') + '</span></span>';
    }).join('<span class="wm-gap"> </span>') + '</span>';
    el.dataset.split = '1';
  }
  function fitWordmarks() {
    document.querySelectorAll('[data-fit]').forEach(function (el) {
      splitWordmark(el);
      el.classList.toggle('two-line', window.innerWidth < 640);
      const cs = getComputedStyle(el);
      const avail = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const inner = el.querySelector('.wm-inner');
      el.style.fontSize = '100px';
      const w = inner.getBoundingClientRect().width;
      if (w > 0 && avail > 0) el.style.fontSize = (100 * avail / w * 0.995).toFixed(2) + 'px';
      // The image card above the wordmark tucks behind the top of the letters.
      if (el.parentElement) el.parentElement.style.setProperty('--mark-h', el.getBoundingClientRect().height + 'px');
    });
  }
  // Fades blocks up as they scroll into view. Only on page changes, never on in-place re-renders.
  let revealObserver = null;
  function applyMotion(animate) {
    fitWordmarks();
    if (reduceMotion || !('IntersectionObserver' in window)) return;
    if (!revealObserver) {
      revealObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('in'); revealObserver.unobserve(en.target); } });
      }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
    }
    const sel = '.j-row, .page-head, .panel, .pcard, .summary-card, .web-search, .product-card, .brand-card, .dir-card, .picks-state, .empty';
    main.querySelectorAll(sel).forEach(function (el, i) {
      if (!animate) { el.classList.remove('reveal'); return; }
      const siblings = el.parentElement ? Array.prototype.indexOf.call(el.parentElement.children, el) : 0;
      el.style.setProperty('--d', ((siblings % 4) * 0.08).toFixed(2) + 's');
      el.classList.add('reveal');
      revealObserver.observe(el);
    });
  }
  // The header turns into a floating pill once you scroll past it; the hero image grows slightly.
  let scrollTicking = false;
  function onScroll() {
    if (scrollTicking) return;
    scrollTicking = true;
    requestAnimationFrame(function () {
      scrollTicking = false;
      const y = window.scrollY, header = document.getElementById('site-header');
      document.body.classList.toggle('nav-pill', window.innerWidth > 720 && y > header.offsetHeight + 40);
      const art = main.querySelector('.j-stage');
      if (art && !reduceMotion) art.style.setProperty('--art-scale', (1 + Math.min(1, y / window.innerHeight) * 0.14).toFixed(3));
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  let resizeTimer = null;
  window.addEventListener('resize', function () { clearTimeout(resizeTimer); resizeTimer = setTimeout(function () { fitWordmarks(); onScroll(); }, 120); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitWordmarks);

  // Optional images in assets/: hero-1 … hero-N (or a single hero) for the home stage, footer for the footer card.
  // The server lists what's there (one request); without the API server, the color fields stay.
  let heroImages = [];
  function loadArt() {
    const root = document.documentElement;
    fetch('api/assets').then(function (r) { return r.ok ? r.json() : { files: [] }; }).then(function (res) {
      const files = [].concat(res.files || []);
      const abs = function (name) { return new URL('assets/' + name, document.baseURI).href; };
      heroImages = files.filter(function (n) { return /^hero(-\d+)?\./i.test(n); })
        .sort(function (a, b) { return (parseInt(a.replace(/\D/g, ''), 10) || 0) - (parseInt(b.replace(/\D/g, ''), 10) || 0); })
        .map(abs);
      const footer = files.find(function (n) { return /^footer\./i.test(n); });
      if (footer) root.style.setProperty('--footer-image', 'url("' + abs(footer) + '")');
      if (heroImages.length) initStage(true);
    }).catch(function () { /* static mode: keep the color fields */ });
  }

  window.addEventListener('pointerup', function () { stage.down = false; if (stage.hint) stage.hint.classList.remove('pressed'); });
  window.addEventListener('pointercancel', function () { stage.down = false; });

  // ---------- home stage: rotating images that follow the cursor; press for the next one, drag to leave a trail ----------
  const stage = { el: null, figs: [], idx: 0, x: 0, y: 0, tx: 0, ty: 0, down: false, lastX: 0, lastY: 0, px: 0, py: 0, raf: 0, timer: 0, clones: 0 };
  function initStage(rebuild) {
    const el = main.querySelector('.j-stage');
    if (!el || (stage.el === el && !rebuild)) return;
    const sticky = el.parentElement, hint = sticky.querySelector('.j-hint');
    const urls = heroImages.length ? heroImages : [null];
    el.innerHTML = '<div class="j-clones"></div>' + urls.map(function (u, i) {
      return '<figure class="j-fig' + (i === 0 ? ' active' : '') + '">' + (u ? '<img src="' + esc(u) + '" alt="" draggable="false" decoding="async">' : '<span class="j-fig-ph"></span>') + '</figure>';
    }).join('');
    stage.figs = Array.prototype.slice.call(el.querySelectorAll('.j-fig'));
    stage.idx = 0; stage.x = stage.y = stage.tx = stage.ty = 0; stage.down = false;
    if (stage.el === el) return;   // listeners are already on this element
    stage.el = el;
    const center = function () { const r = sticky.getBoundingClientRect(); const f = stage.figs[stage.idx].getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height * 0.42, r: r, fw: f.width, fh: f.height }; };
    const show = function (i) {
      stage.figs[stage.idx].classList.remove('active');
      stage.idx = (i + stage.figs.length) % stage.figs.length;
      stage.figs[stage.idx].classList.add('active');
    };
    stage.next = function () { show(stage.idx + 1); };
    // A copy of the current image left behind at its current spot; it fades and is removed.
    const stamp = function () {
      if (stage.clones > 90) return;
      const fig = stage.figs[stage.idx], c = fig.cloneNode(true);
      c.className = 'j-fig j-clone';
      c.style.transform = fig.style.transform;
      el.querySelector('.j-clones').appendChild(c);
      stage.clones++;
      setTimeout(function () { c.style.opacity = '0'; }, 700);
      setTimeout(function () { c.remove(); stage.clones--; }, 2400);
    };
    sticky.addEventListener('pointermove', function (e) {
      const c = center();
      stage.px = e.clientX; stage.py = e.clientY;
      if (stage.down) { stage.tx = e.clientX - c.x; stage.ty = e.clientY - c.y; }
      else if (e.pointerType === 'mouse' && !reduceMotion) {
        // Drift a little toward the cursor, like it's curious.
        stage.tx = Math.max(-c.r.width * 0.18, Math.min(c.r.width * 0.18, (e.clientX - c.x) * 0.3));
        stage.ty = Math.max(-120, Math.min(120, (e.clientY - c.y) * 0.25));
      }
      if (hint && e.pointerType === 'mouse') { hint.style.transform = 'translate(' + (e.clientX - c.r.left + 18) + 'px,' + (e.clientY - c.r.top + 18) + 'px)'; hint.classList.add('on'); }
      if (stage.down && e.pointerType === 'mouse' && !reduceMotion && Math.hypot(e.clientX - stage.lastX, e.clientY - stage.lastY) > 12) {
        stamp(); stage.lastX = e.clientX; stage.lastY = e.clientY;
      }
    });
    sticky.addEventListener('pointerleave', function () { if (hint) hint.classList.remove('on'); if (!stage.down) { stage.tx = 0; stage.ty = 0; } });
    sticky.addEventListener('pointerdown', function (e) {
      if (e.button !== 0 || e.target.closest('a, button')) return;
      stage.next();
      if (e.pointerType !== 'mouse' || reduceMotion) return;   // touch: a tap just shows the next image
      e.preventDefault();
      const c = center();
      stage.down = true; stage.lastX = e.clientX; stage.lastY = e.clientY;
      stage.tx = e.clientX - c.x; stage.ty = e.clientY - c.y;
      if (hint) hint.classList.add('pressed');
    });
    stage.hint = hint;
    const tick = function () {
      if (!document.body.contains(el)) { stage.el = null; cancelAnimationFrame(stage.raf); clearInterval(stage.timer); return; }
      const k = stage.down ? 0.35 : 0.06;
      stage.x += (stage.tx - stage.x) * k; stage.y += (stage.ty - stage.y) * k;
      const t = 'translate3d(calc(-50% + ' + stage.x.toFixed(1) + 'px), calc(-50% + ' + stage.y.toFixed(1) + 'px), 0)';
      stage.figs[stage.idx].style.transform = t;
      stage.raf = requestAnimationFrame(tick);
    };
    cancelAnimationFrame(stage.raf); clearInterval(stage.timer);
    stage.raf = requestAnimationFrame(tick);
    if (!reduceMotion) stage.timer = setInterval(function () { if (!stage.down && !document.hidden) stage.next(); }, 2600);
  }

  // ---------- START / ONBOARDING (1 Brands · 2 Photos · 3 Your style profile) ----------
  const STEPS = ['Brands', 'Photos', 'Your style profile'];
  function stepper(current) {
    return '<ol class="stepper" aria-label="Steps">' + STEPS.map(function (n, i) {
      const num = i + 1;
      const state = num === current ? 'current' : num < current ? 'done' : '';
      const action = num === 3 ? 'data-action="open-profile"' : 'data-action="goto-step" data-step="' + num + '"';
      return '<li class="' + state + '"><button type="button" id="step-tab-' + num + '" ' + action + (num === current ? ' aria-current="step"' : '') + '><span class="step-dot">' + num + '</span>' + n + '</button></li>';
    }).join('') + '</ol>';
  }

  function viewStart() {
    if (sess.step !== 1 && sess.step !== 2) sess.step = 1;
    const body = sess.step === 1 ? stepBrands() : stepPhotos();
    const back = sess.step > 1 ? '<button type="button" class="btn btn-ghost" id="step-back" data-action="goto-step" data-step="1">Back</button>' : '<span></span>';
    const next = sess.step === 1
      ? '<button type="button" class="btn btn-primary" id="step-next" data-action="goto-step" data-step="2">Next: photos</button>'
      : '<button type="button" class="btn btn-primary" id="step-next" data-action="open-profile">' + (sess.photos.length ? 'Next: your style profile' : 'Skip photos — go to my profile') + '</button>';

    return '<div class="container narrow page">' +
      '<p class="eyebrow">Step ' + sess.step + ' of 3</p>' +
      '<h1 tabindex="-1">Tell us about your style</h1>' +
      '<p class="muted">Start with brands you like and, if you want, a few outfit photos. Next, you’ll review and edit your whole style profile in one place. Everything is optional.</p>' +
      stepper(sess.step) +
      '<div id="start-error" class="form-error" role="alert"></div>' +
      '<div class="panel">' + body + '</div>' +
      '<div class="step-actions">' + back + next + '</div>' +
      '</div>';
  }

  function stepBrands() {
    const brands = S.state.inputs.brands;
    const chips = brands.length
      ? '<ul class="chip-list" aria-label="Brands you added">' + brands.map(function (b, i) {
          // Every brand looks the same here, whether or not it's in our catalog (the catalog only adds suggestions).
          const label = plain(b.name);
          return '<li class="chip">' + esc(label) +
            '<button type="button" class="chip-x" id="rm-brand-' + i + '" data-action="remove-brand" data-index="' + i + '" aria-label="Remove ' + esc(label) + '">×</button></li>';
        }).join('') + '</ul>'
      : '<p class="empty-inline">No brands yet. Add one above or tap a popular pick below.</p>';

    const added = new Set(brands.map(function (b) { return b.id; }));
    const pills = function (ids) {
      return ids.filter(function (id) { return !added.has(id) && SB.engine.brandById(id); }).map(function (id) {
        const b = SB.engine.brandById(id);
        return '<button type="button" class="pill" id="pop-' + id + '" data-action="add-popular" data-id="' + id + '">+ ' + esc(plain(b.name)) + (b.nameZh ? ' <span lang="zh">' + esc(b.nameZh) + '</span>' : '') + '</button>';
      }).join('');
    };
    const popularUs = pills(['everlane', 'madewell', 'jcrew', 'levis', 'lululemon', 'patagonia', 'gap', 'nike']);
    const popularIntl = pills(['uniqlo', 'zara', 'cos', 'hm', 'aritzia']);
    const popularCn = pills(['urban-revivo', 'jnby', 'li-ning', 'icicle', 'peacebird', 'bosideng', 'neiwai']);
    const popular = popularUs + popularIntl + popularCn;

    return '<h2>Which brands do you already like?</h2>' +
      '<p class="muted">From any country. English or Chinese names both work. You can skip this and pick styles in your profile instead.</p>' +
      '<form class="add-brand" data-form="add-brand" novalidate>' +
        '<label for="brand-input">Brand name</label>' +
        '<div class="input-row"><input id="brand-input" name="brand" list="home-brand-list" autocomplete="off" maxlength="40" placeholder="e.g. Everlane, Uniqlo, 江南布衣" aria-describedby="brand-error">' +
        '<button class="btn btn-primary" type="submit">Add</button></div>' +
        '<p class="field-error" id="brand-error" aria-live="polite"></p>' +
      '</form>' +
      '<datalist id="home-brand-list">' + SB.homeBrands.map(function (b) {
        return '<option value="' + esc(plain(b.name)) + '">' + (b.nameZh ? esc(b.nameZh) : '') + '</option>' + (b.nameZh ? '<option value="' + esc(b.nameZh) + '">' + esc(plain(b.name)) + '</option>' : '');
      }).join('') + '</datalist>' +
      chips +
      (popular ? '<p class="subhead">Popular picks</p>' +
        (popularUs ? '<p class="pill-label">US brands</p><div class="pill-row">' + popularUs + '</div>' : '') +
        (popularIntl ? '<p class="pill-label">International brands</p><div class="pill-row">' + popularIntl + '</div>' : '') +
        (popularCn ? '<p class="pill-label">Brands from China</p><div class="pill-row">' + popularCn + '</div>' : '') : '') +
      '<p class="sample-line">Just looking around? <button type="button" class="btn-link" id="sample-start" data-action="load-sample">Load a sample profile</button> to see the full demo.</p>';
  }

  // A clearly labeled sample profile, so reviewers can see the whole flow in one click.
  function loadSample() {
    const ids = ['jnby', 'urban-revivo', 'everlane'];
    S.state.inputs = {
      brands: ids.map(function (id) { const b = SB.engine.brandById(id); return { id: id, name: b.name }; }),
      quiz: { department: 'women', styles: ['minimal'], categories: ['knitwear', 'pants'], fits: ['relaxed'], colors: ['earth'], occasions: ['work', 'everyday'], budgets: [2], sizes: [], shopping: ['online', 'stores'] },
      photoColors: [], photoTags: {}, details: ['wide-leg trousers'], removed: {}, personal: {}
    };
    S.state.feedback = {};
    S.state.profile = SB.engine.buildProfile(S.state.inputs);
    S.state.profile.sample = true;
    S.save();
    sess.flash = 'Sample profile loaded. Edit anything here, or start over with your own answers.';
    go('/profile');
  }

  // AI photo tags as labeled rows of chips. They're added to the profile as suggestions the user can remove.
  function aiAttributes(t) {
    if (!t.clothingVisible) return '<p class="photo-status">No clothing recognized in this photo.</p>';
    const rows = [
      ['Style', (t.styles || []).map(function (id) { return SB.label('styles', id); })],
      ['Category', (t.categories || []).map(function (id) { return SB.label('categories', id); })],
      ['Fit', (t.fits || []).map(function (id) { return SB.label('fits', id); })],
      ['Colors', (t.colors || []).map(function (id) { return SB.label('colors', id); })],
      ['Patterns', (t.patterns || []).filter(function (id) { return id !== 'other'; }).map(SB.engine.patternLabel)],
      ['Details', t.details || []]
    ].filter(function (r) { return r[1].length; });
    if (!rows.length && !t.notes) return '<p class="photo-status">No clear clothing details found.</p>';
    return '<p class="ai-head"><span class="badge badge-guess">AI suggestions</span><span class="hint">These are added to your profile. You can remove any that don’t fit.</span></p>' +
      (rows.length ? '<dl class="ai-attrs">' + rows.map(function (r) {
        return '<div><dt>' + r[0] + '</dt><dd>' + r[1].map(function (v) { return '<span class="attr-chip">' + esc(v) + '</span>'; }).join('') + '</dd></div>';
      }).join('') + '</dl>' : '') +
      (t.notes ? '<p class="photo-status"><strong>Notes:</strong> ' + esc(t.notes) + '</p>' : '');
  }

  function stepPhotos() {
    const consent = sess.photoConsent;
    const vision = SB.services.status.features.vision;
    const photos = sess.photos.map(function (p) {
      let status = '';
      if (p.status === 'reading') status = '<p class="photo-status" role="status"><span class="spinner" aria-hidden="true"></span> Reading colors…</p>';
      if (p.status === 'error') status = '<p class="photo-status error">' + esc(p.error) + '</p>';
      if (p.status === 'done' && !aiAnalyzed(p)) {
        // On-device reading of the photo's center; it can't tell clothes from the background.
        status = '<div class="swatches" aria-hidden="true">' + p.swatches.map(function (c) { return '<span style="background:' + c + '"></span>'; }).join('') + '</div>' +
          '<p class="photo-status">' + (p.families.length ? 'Colors in the photo: ' + esc(p.families.map(function (f) { return SB.label('colors', f); }).join(', ')) : 'No clear colors found') + '</p>' +
          (p.families.length ? '<p class="hint">This quick color reading can include the background.' + (vision ? ' Analyze clothing with AI to use only the colors of what you’re wearing.' : ' Remove any colors that don’t fit in your profile.') + '</p>' : '');
      }
      let ai = '', aiBtn = '';
      if (vision && p.status === 'done') {
        const a = p.ai || {};
        if (a.status === 'loading') ai = '<p class="photo-status" role="status"><span class="spinner" aria-hidden="true"></span>Analyzing clothing…</p>';
        else if (a.status === 'error') ai = '<p class="photo-status error">' + esc(a.error) + '</p>';
        else if (a.status === 'done') ai = aiAttributes(a.tags);
        if (a.status !== 'loading' && a.status !== 'done') {
          aiBtn = '<button type="button" class="btn btn-text" id="ai-photo-' + p.id + '" data-action="ai-photo" data-id="' + p.id + '"' + (sess.aiConsent ? '' : ' disabled') + '>' + (a.status === 'error' ? 'Try AI analysis again' : 'Analyze clothing with AI') + '</button>';
        }
      }
      return '<li class="upload">' +
        '<div class="upload-media">' + (p.url ? '<img src="' + p.url + '" alt="Your outfit photo ' + esc(p.name) + '">' : '<div class="upload-missing">Can’t preview</div>') + '</div>' +
        '<div class="upload-body"><p class="upload-title">' + esc(p.name) + '</p>' + status + ai +
        '<div class="upload-actions">' + aiBtn +
        '<button type="button" class="btn btn-text" id="rm-photo-' + p.id + '" data-action="remove-photo" data-id="' + p.id + '">Remove photo<span class="sr-only"> ' + esc(p.name) + '</span></button></div></div></li>';
    }).join('');
    const aiBox = vision
      ? '<div class="privacy-box ai-box"><h3>Optional: AI clothing analysis</h3>' +
          '<p>AI can also suggest garment types, fit, style, colors, patterns and details (like “cropped boxy jacket”) from a photo. If you choose this for a photo, <strong>that photo is sent to our server and to our AI provider (' + visionProviderName() + ')</strong> and analyzed for clothing only. Our server keeps it in memory just for the request and doesn’t save it; ' + visionProviderName() + ' handles it under its own API data terms. The results are added to your profile as “AI · photo” tags, and you can remove any of them.</p>' +
          '<label class="check"><input type="checkbox" id="ai-consent" data-change="ai-consent"' + (sess.aiConsent ? ' checked' : '') + '> I agree to send the photos I choose for AI clothing analysis.</label></div>'
      : '';

    return '<h2>Add a few outfit photos <span class="optional">(optional)</span></h2>' +
      '<p class="muted">A photo of an outfit you like helps us find similar pieces. ' + (vision ? '' : '<strong>This demo uses basic color reading, not AI.</strong> You can pick colors and fits in your profile next.') + '</p>' +
      '<div class="privacy-box" id="photo-privacy">' +
        '<h3>How we use your photos</h3>' +
        '<ul>' +
          '<li><strong>Colors are read on your device.</strong> Your browser reads the photo; this step never uploads it.</li>' +
          '<li><strong>They’re not saved.</strong> Photos disappear when you remove them, refresh or close this tab. We only keep words that describe the clothes (like “Earth tones”) in your profile.</li>' +
          '<li><strong>Clothes only.</strong> We look at clothing, never faces, identity, age, body, size or anything personal.</li>' +
          '<li><strong>Never shared for marketing.</strong>' + (vision ? ' AI analysis is a separate, optional step below.' : '') + '</li>' +
        '</ul>' +
        '<label class="check"><input type="checkbox" id="photo-consent" data-change="photo-consent"' + (consent ? ' checked' : '') + '> I understand, and I want to use photos for this session.</label>' +
      '</div>' +
      '<div class="dropzone' + (consent ? '' : ' disabled') + '" id="dropzone">' +
        '<input type="file" id="photo-input" class="sr-only" accept="image/jpeg,image/png,image/webp,image/gif" multiple data-change="photo-input"' + (consent ? '' : ' disabled') + ' aria-describedby="photo-help">' +
        '<label for="photo-input" class="btn ' + (consent ? 'btn-primary' : 'btn-disabled') + '">Choose photos</label>' +
        '<p id="photo-help" class="hint">' + (consent ? 'Or drag photos here. JPG, PNG or WebP, up to ' + MAX_PHOTOS + ' photos, ' + MAX_PHOTO_MB + ' MB each.' : 'Check the box above to add photos.') + '</p>' +
      '</div>' +
      '<p id="photo-error" class="field-error" aria-live="polite">' + esc(sess.photoError || '') + '</p>' +
      (photos ? aiBox + '<ul class="upload-list" aria-label="Your photos">' + photos + '</ul><button type="button" class="btn btn-text danger" id="rm-all-photos" data-action="remove-all-photos">Remove all photos</button>' : '') +
      '<p class="hint note">Tip: a full outfit in good light works best. ' + (vision ? '' : 'Recognizing garment types and fit needs an AI vision service, which isn’t connected on this server, so for now we only read colors.') + '</p>';
  }

  // ---------- PROFILE (step 3: questions, tags, brands, location and sizing in one place) ----------
  function emptyState(title, text, href, cta) {
    return '<div class="container narrow page"><div class="empty"><h1 tabindex="-1">' + title + '</h1><p>' + text + '</p><a class="btn btn-primary" href="' + href + '">' + cta + '</a></div></div>';
  }

  const PHOTO_SOURCES = ['AI photo analysis', 'your outfit photos'];
  function isPhotoItem(x) {
    return !!(x.photo || (x.from || []).some(function (f) { return PHOTO_SOURCES.indexOf(f) !== -1; }));
  }

  // The profile is always derived from the saved inputs, so edits, removals and photo results stay in sync.
  function rebuildProfile() {
    const old = S.state.profile;
    S.state.profile = SB.engine.buildProfile(S.state.inputs);
    if (old && old.sample) S.state.profile.sample = true;
    return S.state.profile;
  }
  function editInputs(fn, focusId) {
    fn(S.state.inputs);
    rebuildProfile();
    S.save();
    render({ keepFocus: true, fallbackFocus: focusId });
  }
  // Copies what the current session's photos produced (color names and AI clothing tags) into the inputs.
  function syncPhotos() {
    const done = sess.photos.filter(function (p) { return p.status === 'done'; });
    if (!done.length) return;
    const inputs = S.state.inputs;
    inputs.photoColors = photoColors();
    const tags = { categories: [], styles: [], fits: [], colors: [], patterns: [], details: [] };
    done.forEach(function (p) {
      if (!p.ai || p.ai.status !== 'done' || !p.ai.tags.clothingVisible) return;
      Object.keys(tags).forEach(function (g) {
        (p.ai.tags[g] || []).forEach(function (id) { if (tags[g].indexOf(id) === -1) tags[g].push(id); });
      });
    });
    inputs.photoTags = tags;
  }
  function openProfile() {
    if (sess.photos.some(function (p) { return p.status === 'reading' || (p.ai && p.ai.status === 'loading'); })) {
      setStartError('Hang on, we’re still reading your photos.');
      return;
    }
    syncPhotos();
    rebuildProfile();
    S.save();
    sess.flash = S.storageOk ? null : 'Heads up: your browser is blocking storage, so this profile will be lost when you close the tab.';
    go('/profile');
  }

  // One question, answered with tags. Selected tags are used in the search; suggestions are selected too
  // and marked with where they came from. Turning a tag off keeps it off.
  function tagGroup(group, title, hint) {
    const list = S.state.profile[group] || [];
    const byId = {}; list.forEach(function (x) { byId[x.id] = x; });
    const buttons = SB.vocab[group].map(function (o) {
      const x = byId[o.id], on = !!x;
      const mark = x && x.source === 'guess' ? (isPhotoItem(x) ? 'photo' : 'brands') : '';
      return '<button type="button" class="ptag' + (on ? ' on' : '') + (mark ? ' suggested' : '') + '" id="tag-' + group + '-' + o.id + '" data-action="toggle-tag" data-group="' + group + '" data-id="' + o.id + '" aria-pressed="' + on + '"' + (x && x.reason ? ' title="' + esc(x.reason) + '"' : '') + '>' +
        '<span class="tag-check" aria-hidden="true">' + (on ? '✓' : '+') + '</span><span class="tag-label">' + esc(o.label) + '</span>' +
        (mark ? '<span class="tag-src">' + (mark === 'photo' ? 'AI · photo' : 'From brands') + '</span><span class="sr-only">, suggested ' + (mark === 'photo' ? 'by AI from your photo' : 'from brands you like') + '</span>' : '') + '</button>';
    }).join('');
    return '<fieldset class="tag-group"><legend id="h-' + group + '">' + title + '</legend>' + (hint ? '<p class="hint">' + hint + '</p>' : '') + '<div class="tags">' + buttons + '</div></fieldset>';
  }

  function detailsGroup() {
    const list = S.state.profile.details || [];
    const chips = list.length ? '<ul class="chip-list">' + list.map(function (x) {
      const ai = x.source === 'guess';
      return '<li class="chip ' + (ai ? 'chip-guess' : 'chip-user') + '"' + (x.reason ? ' title="' + esc(x.reason) + '"' : '') + '>' +
        '<span>' + esc(x.text) + (x.kind === 'pattern' ? ' <span class="chip-note">pattern</span>' : '') + '</span>' +
        (ai ? '<span class="tag-src">AI · photo</span>' : '') +
        '<button type="button" class="chip-x" id="rm-details-' + x.id + '" data-action="remove-detail" data-id="' + x.id + '" aria-label="Remove ' + esc(x.text) + '">×</button></li>';
    }).join('') + '</ul>' : '<p class="empty-inline">None yet.</p>';
    return '<fieldset class="tag-group"><legend id="h-details">Style details &amp; patterns</legend>' +
      '<p class="hint">The specific things you look for, like “wide-leg trousers” or “cropped boxy jacket.” These shape your search the most.</p>' + chips +
      '<form class="add-detail" data-form="add-detail" novalidate><label class="sr-only" for="detail-input">Add a style detail</label>' +
      '<div class="input-row"><input id="detail-input" name="detail" maxlength="40" autocomplete="off" placeholder="e.g. wide-leg trousers" aria-describedby="detail-error"><button class="btn btn-small btn-outline" type="submit">Add</button></div>' +
      '<p class="field-error" id="detail-error" aria-live="polite"></p></form></fieldset>';
  }

  // Simple user-only choices (department, budget, size ranges, shopping) stored in the quiz answers.
  function choiceGroup(group, title, type, selected, change, hint) {
    const items = SB.vocab[group].map(function (o) {
      const id = 'p-' + group + '-' + o.id;
      const checked = type === 'radio' ? selected === o.id : selected.indexOf(o.id) !== -1;
      return '<label class="choice small" for="' + id + '"><input type="' + type + '" name="p-' + group + '" id="' + id + '" value="' + o.id + '" data-change="' + change + '"' + (checked ? ' checked' : '') + '><span class="choice-face"><span class="choice-label">' + esc(o.label) + '</span></span></label>';
    }).join('');
    return '<fieldset class="tag-group"><legend id="h-' + group + '">' + title + '</legend>' + (hint ? '<p class="hint">' + hint + '</p>' : '') + '<div class="choices compact">' + items + '</div></fieldset>';
  }

  // ---------- optional location and sizing ----------
  const US_STATES = 'AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' ');
  const SHOE_SYSTEMS = [['us-women', 'US women’s'], ['us-men', 'US men’s'], ['eu', 'EU'], ['uk', 'UK']];
  function personal() { return S.state.inputs.personal || (S.state.inputs.personal = {}); }
  function num(v) { const n = parseFloat(v); return isNaN(n) ? null : n; }
  // Field-level problems with what was typed. Invalid values are kept on screen but never sent.
  function personalErrors(pd) {
    const e = {};
    if (pd.zip && !/^\d{5}$/.test(pd.zip)) e.zip = 'Enter a 5-digit ZIP code, like 10001.';
    if (pd.city && !/^[\p{L} .'\-]{2,40}$/u.test(pd.city)) e.city = 'Enter a city name only (no street address).';
    if (pd.city && !pd.state) e.state = 'Choose a state to go with the city.';
    ['tops', 'bottoms', 'dresses'].forEach(function (k) { if (pd[k] && !/^[A-Za-z0-9 .\/\-]{1,12}$/.test(pd[k])) e[k] = 'Use a short size label, like M, 8 or 28x30.'; });
    if (pd.shoeSize && !(num(pd.shoeSize) >= 1 && num(pd.shoeSize) <= 50)) e.shoeSize = 'Enter a shoe size number, like 8 or 8.5.';
    if (pd.heightUnit === 'cm') { if (pd.heightCm && !(num(pd.heightCm) >= 100 && num(pd.heightCm) <= 230)) e.height = 'Enter a height between 100 and 230 cm.'; }
    else if (pd.heightFt || pd.heightIn) {
      if (!(num(pd.heightFt) >= 3 && num(pd.heightFt) <= 7) || (pd.heightIn && !(num(pd.heightIn) >= 0 && num(pd.heightIn) < 12))) e.height = 'Enter feet (3–7) and inches (0–11).';
    }
    return e;
  }
  function heightCm(pd) {
    if (pd.heightUnit === 'cm') return num(pd.heightCm) ? Math.round(num(pd.heightCm)) : null;
    if (!num(pd.heightFt)) return null;
    return Math.round(((num(pd.heightFt) * 12) + (num(pd.heightIn) || 0)) * 2.54);
  }
  function heightText(cm, pd) {
    if (pd.heightUnit === 'cm') return cm + ' cm';
    return num(pd.heightFt) + '′' + (num(pd.heightIn) || 0) + '″';
  }
  // Only valid, user-entered values. Weight is never included; there's no street address to include.
  function locationPayload(pd) {
    const e = personalErrors(pd), loc = {};
    if (pd.zip && !e.zip) loc.zip = pd.zip;
    if (pd.city && pd.state && !e.city && !e.state) { loc.city = pd.city.trim(); loc.state = pd.state; }
    return Object.keys(loc).length ? loc : null;
  }
  function sizingPayload(pd) {
    const e = personalErrors(pd), s = {};
    ['tops', 'bottoms', 'dresses'].forEach(function (k) { if (pd[k] && !e[k]) s[k] = pd[k].trim(); });
    if (pd.shoeSize && !e.shoeSize) s.shoe = { size: num(pd.shoeSize), system: pd.shoeSystem || 'us-women' };
    const h = heightCm(pd); if (h && !e.height) s.heightCm = h;
    return Object.keys(s).length ? s : null;
  }

  function field(key, label, input, pd, errs, hint) {
    return '<div class="pfield"><label for="pd-' + key + '">' + label + '</label>' + input +
      (hint ? '<p class="hint">' + hint + '</p>' : '') +
      '<p class="field-error" id="pd-' + key + '-err" aria-live="polite">' + esc(errs[key] || '') + '</p></div>';
  }
  function textInput(key, pd, attrs) {
    return '<input id="pd-' + key + '" data-change="personal" data-key="' + key + '" value="' + esc(pd[key] || '') + '" autocomplete="off" aria-describedby="pd-' + key + '-err"' + (attrs || '') + '>';
  }

  function locationCard(pd, errs) {
    const has = pd.zip || pd.city || pd.state;
    return '<section class="card pcard" aria-labelledby="h-location"><h2 id="h-location">Shopping location <span class="optional">(optional)</span></h2>' +
      '<p class="hint">Helps us find stores and products available near you in the US. We only ask for a ZIP code or city — never a street address. It’s sent to our server and OpenAI’s web search only when you search, and only if your shopping region is the United States.</p>' +
      '<div class="pfields">' +
        field('zip', 'ZIP code', textInput('zip', pd, ' inputmode="numeric" maxlength="5" placeholder="e.g. 10001"'), pd, errs) +
        field('city', 'City', textInput('city', pd, ' maxlength="40" placeholder="e.g. Seattle"'), pd, errs) +
        field('state', 'State', '<select id="pd-state" data-change="personal" data-key="state" aria-describedby="pd-state-err"><option value="">Choose…</option>' +
          US_STATES.map(function (s) { return '<option' + (pd.state === s ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select>', pd, errs) +
      '</div>' +
      choiceGroup('shopping', 'How you like to shop', 'checkbox', S.state.inputs.quiz.shopping || [], 'profile-shopping', '“International online stores” adds brands based outside the US. Their US shipping isn’t confirmed.') +
      (has ? '<button type="button" class="btn btn-text danger" id="clear-location" data-action="clear-location">Remove my location</button>' : '') +
      '</section>';
  }

  function sizingCard(pd, errs) {
    const has = ['tops', 'bottoms', 'dresses', 'shoeSize', 'heightFt', 'heightIn', 'heightCm', 'weight'].some(function (k) { return pd[k]; });
    const cm = pd.heightUnit === 'cm';
    const height = '<div class="unit-row">' + (cm
        ? '<input id="pd-height" data-change="personal" data-key="heightCm" inputmode="decimal" value="' + esc(pd.heightCm || '') + '" placeholder="cm" aria-label="Height in centimeters" aria-describedby="pd-height-err">'
        : '<input id="pd-height" data-change="personal" data-key="heightFt" inputmode="numeric" value="' + esc(pd.heightFt || '') + '" placeholder="ft" aria-label="Height, feet" aria-describedby="pd-height-err">' +
          '<input id="pd-height-in" data-change="personal" data-key="heightIn" inputmode="numeric" value="' + esc(pd.heightIn || '') + '" placeholder="in" aria-label="Height, inches">') +
      '<select id="pd-height-unit" data-change="personal" data-key="heightUnit" aria-label="Height unit"><option value="ftin"' + (cm ? '' : ' selected') + '>ft / in</option><option value="cm"' + (cm ? ' selected' : '') + '>cm</option></select></div>';
    const weight = '<div class="unit-row"><input id="pd-weight" data-change="personal" data-key="weight" inputmode="decimal" value="' + esc(pd.weight || '') + '" aria-describedby="pd-weight-err">' +
      '<select id="pd-weight-unit" data-change="personal" data-key="weightUnit" aria-label="Weight unit"><option value="lb"' + (pd.weightUnit === 'kg' ? '' : ' selected') + '>lb</option><option value="kg"' + (pd.weightUnit === 'kg' ? ' selected' : '') + '>kg</option></select></div>';
    const shoe = '<div class="unit-row">' + textInput('shoeSize', pd, ' inputmode="decimal" maxlength="5" placeholder="e.g. 8.5"') +
      '<select id="pd-shoe-system" data-change="personal" data-key="shoeSystem" aria-label="Shoe size system">' +
        SHOE_SYSTEMS.map(function (s) { return '<option value="' + s[0] + '"' + ((pd.shoeSystem || 'us-women') === s[0] ? ' selected' : '') + '>' + s[1] + '</option>'; }).join('') + '</select></div>';
    return '<section class="card pcard" aria-labelledby="h-sizing"><h2 id="h-sizing">Size &amp; fit <span class="optional">(optional)</span></h2>' +
      '<p class="hint">We only use what you type here. We never guess your size from photos, height or weight. Sizes are used to look for items offered in your size and to check size availability when a store lists it — sizing differs by brand, so always check the size chart.</p>' +
      tagGroup('fits', 'Fit you prefer') +
      choiceGroup('sizes', 'Size ranges', 'checkbox', S.state.inputs.quiz.sizes, 'profile-size') +
      '<div class="pfields">' +
        field('tops', 'Tops size', textInput('tops', pd, ' maxlength="12" placeholder="e.g. M or 8"'), pd, errs) +
        field('bottoms', 'Bottoms size', textInput('bottoms', pd, ' maxlength="12" placeholder="e.g. 28 or 6"'), pd, errs) +
        field('dresses', 'Dress size', textInput('dresses', pd, ' maxlength="12" placeholder="e.g. 4"'), pd, errs) +
        field('shoeSize', 'Shoe size', shoe, pd, errs) +
        field('height', 'Height', height, pd, errs, 'Used only to point out petite or tall length options.') +
        field('weight', 'Weight', weight, pd, errs, 'Kept on this device for your reference. Never sent anywhere.') +
      '</div>' +
      (has ? '<button type="button" class="btn btn-text danger" id="clear-sizing" data-action="clear-sizing">Remove my size info</button>' : '') +
      '</section>';
  }

  // Plain-English list of exactly what a search sends, shown before any search runs.
  function sendDisclosure(p) {
    return '<p class="fine send-note"><strong>What we send to search:</strong> ' + esc(sentSummary(discoverPayload(p))) +
      '. This goes to our server and OpenAI’s web search when you search. Tags marked “AI · photo” or “From brands” are included unless you remove them. Photos, street addresses and your weight are never sent, and nothing is bought or added to a cart.</p>';
  }

  function viewProfile() {
    syncPhotos();
    const p = rebuildProfile();
    S.save();
    const q = S.state.inputs.quiz;
    const pd = personal();
    const errs = personalErrors(pd);
    const words = SB.engine.keywords(p);
    const nRemoved = Object.keys(S.state.inputs.removed || {}).reduce(function (n, g) { return n + (S.state.inputs.removed[g] || []).length; }, 0);
    const brandChips = p.brands.length ? '<ul class="chip-list">' + p.brands.map(function (b) {
      return '<li class="chip chip-user"><span>' + esc(plain(b.name)) + '</span></li>';
    }).join('') + '</ul>' : '<p class="empty-inline">No brands yet.</p>';
    const ready = p.styles.length + p.categories.length + p.brands.length + (p.details || []).length > 0;

    return '<div class="container page profile-page">' +
      '<p class="eyebrow">Step 3 of 3</p>' +
      '<h1 tabindex="-1">Your style profile</h1>' +
      '<p class="muted">Everything selected here is used for your picks. Tags marked “AI · photo” or “From brands” were suggested for you — they’re on already, so just remove any that don’t fit and add your own.</p>' +
      stepper(3) +
      (sess.flash ? '<p class="flash" role="status">' + esc(sess.flash) + '</p>' : '') +
      (p.sample ? '<p class="sample-note"><span class="demo-chip">Sample</span> This is a sample profile for the demo: someone recently arrived in the US who likes JNBY, Urban Revivo and Everlane, wants work and everyday pieces, and has a $40–$100 budget. It isn’t about you — edit it, or <button type="button" class="btn-link" id="sample-reset" data-action="start-over">start over</button>.</p>' : '') +
      '<section class="summary-card"><p class="eyebrow">Your style in a few words</p>' +
        (words.length ? '<p class="keywords">' + words.map(esc).join('<span aria-hidden="true"> · </span>') + '</p>' : '<p class="keywords muted">Pick a style or two below</p>') +
        '<div class="legend" aria-label="Legend"><span class="ptag on mini" aria-hidden="true"><span class="tag-check">✓</span>You</span><span>you picked it</span>' +
        '<span class="ptag on suggested mini" aria-hidden="true"><span class="tag-check">✓</span><span class="tag-src">AI · photo</span></span><span>suggested from your photo</span>' +
        '<span class="ptag on suggested mini" aria-hidden="true"><span class="tag-check">✓</span><span class="tag-src">From brands</span></span><span>suggested from brands you like</span></div></section>' +
      '<div class="profile-stack">' +
        '<section class="card pcard" aria-labelledby="h-who"><h2 id="h-who">Who you’re shopping for</h2>' +
          choiceGroup('departments', 'Shopping for', 'radio', q.department, 'profile-dept') +
          '<h3 class="subhead" id="h-brands">Brands you like</h3>' + brandChips +
          '<button type="button" class="btn btn-text" id="edit-brands" data-action="edit-brands">Edit brands</button></section>' +
        '<section class="card pcard" aria-labelledby="h-style"><h2 id="h-style">Your style</h2>' +
          tagGroup('styles', 'Which styles feel like you?') +
          tagGroup('categories', 'What do you want to shop for?') +
          tagGroup('colors', 'Which colors do you reach for?') +
          detailsGroup() +
          tagGroup('occasions', 'Where will you wear them?') +
          (nRemoved ? '<p class="hint">You turned off ' + nRemoved + ' suggestion' + (nRemoved === 1 ? '' : 's') + '. They stay off. <button type="button" class="btn-link" id="restore-removed" data-action="restore-removed">Turn suggestions back on</button></p>' : '') +
        '</section>' +
        '<section class="card pcard" aria-labelledby="h-budget"><h2 id="h-budget">Budget per piece <span class="optional">(optional)</span></h2>' +
          choiceGroup('budgets', 'Typical budget for one piece', 'checkbox', q.budgets, 'profile-budget', 'For example, one sweater or one pair of pants. Only you set this — we never guess your budget. Leave it empty to see every price range.') +
        '</section>' +
        sizingCard(pd, errs) +
        locationCard(pd, errs) +
        feedbackCard() +
      '</div>' +
      sendDisclosure(p) +
      '<div class="page-foot"><div class="foot-left"><button type="button" class="btn btn-ghost" id="profile-back" data-action="goto-step" data-step="2">Back to photos</button>' +
        '<button type="button" class="btn btn-text danger" id="start-over" data-action="start-over">Start over</button></div>' +
        '<a class="btn btn-primary" href="#/matches" id="show-picks">Show my picks</a></div>' +
      (ready ? '' : '<p class="hint foot-hint">Add a brand, a style, something you want to shop for, or a style detail so we have something to search for.</p>') +
      '</div>';
  }

  function feedbackCard() {
    const list = brandFeedback();
    if (!list.length) return '';
    const row = function (val, title) {
      const names = list.filter(function (x) { return x.value === val; });
      return '<p class="subhead">' + title + '</p>' + (names.length
        ? '<ul class="chip-list">' + names.map(function (x, i) {
            return '<li class="chip chip-feedback"><span>' + esc(x.name) + '</span><button type="button" class="chip-x" id="fbrm-' + val + '-' + i + '" data-action="web-feedback" data-value="" data-name="' + esc(x.name) + '" aria-label="Clear feedback for ' + esc(x.name) + '">×</button></li>';
          }).join('') + '</ul>'
        : '<p class="empty-inline">None yet.</p>');
    };
    return '<section class="card pcard" aria-labelledby="h-feedback"><h2 id="h-feedback">Your feedback ' + reasonBadge('feedback') + '</h2>' +
      '<p class="hint">From “More like this” and “Not for me” in your picks. Your next search looks for more like the first and leaves out the second.</p>' +
      row('more', 'More like this') + row('less', 'Not for me') + '</section>';
  }

  // Feedback on brands from your picks, by name (web results have no catalog id).
  function brandFeedback() {
    const wf = S.state.webFeedback || {};
    return Object.keys(wf).map(function (k) { return wf[k]; }).filter(function (x) { return x && x.name && (x.value === 'more' || x.value === 'less'); });
  }
  function feedbackFor(name) {
    const x = (S.state.webFeedback || {})[String(name).toLowerCase()];
    return x ? x.value : null;
  }

  // ---------- YOUR PICKS: live, personalized web search (server-side OpenAI web_search) ----------
  const WEB_REGIONS = [['US', 'United States'], ['CA', 'Canada'], ['GB', 'United Kingdom'], ['AU', 'Australia'], ['CN', 'China'], ['JP', 'Japan'], ['FR', 'France'], ['DE', 'Germany']];
  function regionName(code) { return (WEB_REGIONS.find(function (x) { return x[0] === code; }) || ['', code])[1]; }

  // Everything active in the profile is sent (tags are on unless removed), plus optional location and sizes
  // the user typed. Never sent: photos, street addresses, weight.
  function discoverPayload(p) {
    const ids = function (list) { return (list || []).map(function (x) { return x.id; }); };
    const details = p.details || [];
    const fb = brandFeedback();
    // Attributes from outfit photos are also sent separately so the server can put them first.
    // Items backed by more photo signals (on-device colors + AI analysis) lead the planned searches.
    const photoSupport = function (x) { return (x.from || []).filter(function (f) { return PHOTO_SOURCES.indexOf(f) !== -1; }).length; };
    const fromPhoto = function (list) { return (list || []).filter(isPhotoItem).sort(function (a, b) { return photoSupport(b) - photoSupport(a); }); };
    const photoDetails = fromPhoto(details);
    const pd = p.personal || {};
    const region = sess.web.region;
    const payload = {
      photoLook: {
        categories: ids(fromPhoto(p.categories)), styles: ids(fromPhoto(p.styles)), colors: ids(fromPhoto(p.colors)), fits: ids(fromPhoto(p.fits)),
        patterns: photoDetails.filter(function (d) { return d.kind === 'pattern'; }).map(function (d) { return d.value; }),
        details: photoDetails.filter(function (d) { return d.kind === 'detail'; }).map(function (d) { return d.text; }).slice(0, 6)
      },
      department: p.department, styles: ids(p.styles), categories: ids(p.categories), colors: ids(p.colors),
      fits: ids(p.fits), occasions: ids(p.occasions), budgets: p.budgets.slice(), sizes: p.sizes.slice(),
      details: details.filter(function (d) { return d.kind === 'detail'; }).map(function (d) { return d.text; }).slice(0, 8),
      patterns: details.filter(function (d) { return d.kind === 'pattern'; }).map(function (d) { return d.value; }),
      brands: p.brands.map(function (b) { return plain(b.name); }).slice(0, 8),
      likedBrands: fb.filter(function (x) { return x.value === 'more'; }).map(function (x) { return x.name; }).slice(0, 6),
      avoidBrands: fb.filter(function (x) { return x.value === 'less'; }).map(function (x) { return x.name; }).slice(0, 10),
      region: region
    };
    const loc = region === 'US' ? locationPayload(pd) : null;
    const sizing = sizingPayload(pd);
    if (loc) payload.location = loc;
    if (sizing) payload.sizing = sizing;
    return payload;
  }

  function sentSummary(payload) {
    const parts = [];
    const look = payload.photoLook;
    const lookWords = [].concat(
      look.categories.map(function (id) { return SB.label('categories', id); }), look.colors.map(function (id) { return SB.label('colors', id); }),
      look.fits.map(function (id) { return SB.label('fits', id); }), look.patterns.map(SB.engine.patternLabel),
      look.details.map(function (d) { return '“' + d + '”'; }), look.styles.map(function (id) { return SB.label('styles', id); }));
    if (lookWords.length) parts.push('from your outfit photos (searched first): ' + lookWords.join(', '));
    if (payload.brands.length) parts.push('brands you like: ' + payload.brands.join(', '));
    // Everything below is sent too; photo items are listed once, above.
    const notLook = function (key) { return payload[key].filter(function (x) { return (look[key] || []).indexOf(x) === -1; }); };
    [['styles', 'styles'], ['categories', 'categories'], ['fits', 'fit'], ['colors', 'colors'], ['occasions', 'occasions'], ['sizes', 'size ranges']].forEach(function (g) {
      const ids = notLook(g[0]);
      if (ids.length) parts.push(g[1] + ': ' + ids.map(function (id) { return SB.label(g[0], id); }).join(', '));
    });
    if (notLook('patterns').length) parts.push('patterns: ' + notLook('patterns').map(SB.engine.patternLabel).join(', '));
    if (notLook('details').length) parts.push('style details: ' + notLook('details').map(function (d) { return '“' + d + '”'; }).join(', '));
    parts.push('budget: ' + (payload.budgets.length ? payload.budgets.map(function (b) { return SB.label('budgets', b); }).join(', ') : 'not set'));
    if (payload.likedBrands.length) parts.push('more like: ' + payload.likedBrands.join(', '));
    if (payload.avoidBrands.length) parts.push('leave out: ' + payload.avoidBrands.join(', '));
    parts.push('shopping region: ' + regionName(payload.region));
    const loc = payload.location;
    if (loc) parts.push('location: ' + [loc.city ? loc.city + ', ' + loc.state : '', loc.zip ? 'ZIP ' + loc.zip : ''].filter(Boolean).join(' '));
    const sz = payload.sizing;
    if (sz) {
      const sp = [];
      if (sz.tops) sp.push('tops ' + sz.tops);
      if (sz.bottoms) sp.push('bottoms ' + sz.bottoms);
      if (sz.dresses) sp.push('dresses ' + sz.dresses);
      if (sz.shoe) sp.push('shoes ' + (SHOE_SYSTEMS.find(function (s) { return s[0] === sz.shoe.system; }) || ['', ''])[1] + ' ' + sz.shoe.size);
      if (sz.heightCm) sp.push('height ' + heightText(sz.heightCm, personal()));
      parts.push('your sizes: ' + sp.join(', '));
    }
    return parts.join(' · ');
  }

  function hostOf(u) { try { return new URL(u).host.replace(/^www\./, ''); } catch (e) { return u; } }

  // Results are cached on this device for 24 hours per profile, so revisiting doesn't re-run (and re-bill) a search.
  const WEB_CACHE = 'styleBridge.web.v4';   // v4: photo look + attribute-match ranking
  const OLD_KEYS = ['styleBridge.web.v2', 'styleBridge.web.v3', 'styleBridge.webConsent'];
  const WEB_TTL = 24 * 60 * 60 * 1000;
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage blocked: fine */ } }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } }
  OLD_KEYS.forEach(lsDel);
  // Feedback is sent with the next search but doesn't trigger a new one by itself.
  function webKey(p) {
    const x = discoverPayload(p);
    delete x.likedBrands; delete x.avoidBrands;
    return JSON.stringify(x);
  }
  function readWebCache(key) {
    try {
      const c = JSON.parse(lsGet(WEB_CACHE) || 'null');
      if (!(c && c.key === key && Date.now() - c.at < WEB_TTL)) return null;
      c.result = SB.services.discovery.normalize(c.result);
      return c;
    } catch (e) { return null; }
  }
  function resetWeb() {
    sess.web = { status: 'idle', region: sess.web ? sess.web.region : 'US', result: null, error: null };
    sess.showDemo = false; sess.webCat = '';
    lsDel(WEB_CACHE);
  }

  function errorText(err) {
    if (err.code === 'not_configured') return 'Personalized search isn’t turned on for this server yet (the site owner needs to add an OpenAI API key), so we can’t show picks right now.';
    if (err.code === 'network') return 'We couldn’t reach the server. Check your connection and try again.';
    if (err.code === 'empty_profile') return 'Your profile doesn’t have anything confirmed to search for yet. Add or keep a style, category, style detail or brand.';
    if (err.name === 'AbortError') return 'The search took too long.';
    return (typeof err.message === 'string' && err.message) || 'Something went wrong. Please try again.';
  }

  function runWebSearch(auto) {
    const p = S.state.profile;
    if (!p || sess.web.status === 'loading') return;
    const key = webKey(p);
    // A new search always starts from a clean slate: old results are never shown again after this point.
    sess.web = { status: 'loading', region: sess.web.region, result: null, error: null, key: key, cached: false };
    sess.showDemo = false; sess.webCat = ''; sess.showOverBudget = false; sess.showSizeOut = false;
    lsDel(WEB_CACHE);
    if (currentRoute().name === 'matches') render({ keepFocus: true, fallbackFocus: 'picks-title' });
    announce(auto ? 'Finding picks for your profile. This can take up to a minute.' : 'Searching again. This can take up to a minute.');
    SB.services.discovery.search(discoverPayload(p)).then(function (res) {
      if (sess.web.key !== key) return;   // the profile changed while this was running
      sess.web.status = 'done'; sess.web.result = res;
      const found = (res.brands || []).length + (res.products || []).length;
      if (found) lsSet(WEB_CACHE, JSON.stringify({ key: key, at: Date.now(), result: res }));
      announce(found ? 'Your picks are ready. Checking other stores and photos next.' : 'The search found no matches this time.');
    }).catch(function (err) {
      if (sess.web.key !== key) return;
      sess.web.status = 'error'; sess.web.result = null; sess.web.error = errorText(err);
      announce('We couldn’t load your picks. ' + sess.web.error);
    }).then(function () {
      if (currentRoute().name === 'matches') render({ keepFocus: true, fallbackFocus: sess.web.status === 'error' ? 'web-retry' : 'picks-title' });
      runCompare();
    });
  }

  // Step 2: the same items at other stores (official sites, retailers, Amazon, store listings, resale), plus
  // photos from whichever store page we can read. One more search for the top picks; saved with the results.
  const COMPARE_TOP = 6;
  function runCompare() {
    const w = sess.web, r = w.result;
    if (!r || w.status !== 'done' || r.compare || w.compareStatus === 'loading') return;
    const items = (r.products || []).filter(function (wp) { return !(wp.status && wp.status.availability === 'out-of-stock') && feedbackFor(wp.brandName) !== 'less'; }).slice(0, COMPARE_TOP);
    if (!items.length) return;
    const key = w.key;
    w.compareStatus = 'loading'; w.compareError = null; w.compareIds = items.map(function (x) { return x.id; });
    if (currentRoute().name === 'matches') render({ keepFocus: true });
    const loc = r.region === 'US' ? locationPayload(personal()) : null;
    SB.services.discovery.compare({
      region: r.region, location: loc || undefined,
      products: items.map(function (wp) { return { id: wp.id, brand: wp.brandName, name: wp.name, color: wp.color, category: wp.category, url: wp.url }; })
    }).then(function (res) {
      if (sess.web.key !== key || sess.web.result !== r) return;
      const byId = {};
      res.items.forEach(function (it) { byId[it.id] = it; });
      r.compare = { checkedAt: res.checkedAt, ids: w.compareIds, byId: byId, sources: res.sources || [], queries: res.queries || [] };
      w.compareStatus = 'done';
      lsSet(WEB_CACHE, JSON.stringify({ key: key, at: Date.now(), result: r }));
      const n = res.items.reduce(function (s, it) { return s + it.offers.length; }, 0);
      announce(n ? 'Found ' + n + ' more place' + (n === 1 ? '' : 's') + ' to buy your picks.' : 'We couldn’t find your picks at other stores.');
    }).catch(function (err) {
      if (sess.web.key !== key || sess.web.result !== r) return;
      w.compareStatus = 'error';
      w.compareError = err.name === 'AbortError' ? 'Checking other stores took too long.' : (typeof err.message === 'string' && err.message) || 'We couldn’t check other stores.';
      announce(w.compareError);
    }).then(function () {
      if (currentRoute().name === 'matches') render({ keepFocus: true });
    });
  }
  function compareFor(id) {
    const r = webData(), w = sess.web;
    if (!r) return { state: null };
    if (r.compare) return r.compare.byId[id] ? { state: 'done', item: r.compare.byId[id] } : { state: r.compare.ids.indexOf(id) === -1 ? 'skipped' : 'done', item: null };
    if ((w.compareIds || []).indexOf(id) === -1) return { state: w.compareStatus === 'loading' || w.compareStatus === 'error' ? 'skipped' : null };
    return { state: w.compareStatus || null };
  }

  // Runs after the Your picks page renders: show saved results for this exact profile, or search.
  // Opening "Your picks" (e.g. "Looks good — show my picks") is the request to search; the profile and
  // picks pages both say what is sent. A failed search is not retried automatically.
  function maybeAutoWebSearch() {
    const p = S.state.profile;
    if (!p || currentRoute().name !== 'matches' || sess.web.status === 'loading') return;
    const key = webKey(p);
    if (sess.web.key === key && sess.web.status !== 'idle') return;
    const cached = readWebCache(key);
    if (cached) {
      sess.web = { status: 'done', region: sess.web.region, result: cached.result, error: null, key: key, cached: true };
      render({ keepFocus: true });
      runCompare();   // saved results from before the comparison step get it now
      return;
    }
    runWebSearch(true);
  }

  function picksControls(p) {
    const w = sess.web, loading = w.status === 'loading';
    const regionSelect = '<label class="sort" for="web-region"><span>Shopping region</span><select id="web-region" data-change="web-region"' + (loading ? ' disabled' : '') + '>' +
      WEB_REGIONS.map(function (r) { return '<option value="' + r[0] + '"' + (w.region === r[0] ? ' selected' : '') + '>' + r[1] + '</option>'; }).join('') + '</select></label>';
    return '<section class="web-search card" id="web-search" aria-labelledby="search-title">' +
      '<h2 id="search-title" class="sr-only">Search settings</h2>' +
      '<div class="web-controls">' + regionSelect +
        '<button type="button" class="btn btn-primary btn-small" id="web-go" data-action="web-search"' + (loading ? ' disabled' : '') + '>Search again</button>' +
        '<a class="btn btn-outline btn-small" href="#/profile">Edit preferences</a></div></section>';
  }

  function picksBody(p) {
    const w = sess.web, key = webKey(p);
    if (w.status === 'loading') {
      const words = SB.engine.keywords(p);
      return '<div class="picks-state" role="status"><span class="spinner big" aria-hidden="true"></span>' +
        '<h2 id="picks-title" tabindex="-1">Finding picks for your style…</h2>' +
        '<p class="muted">Searching official brand sites and well-known stores' + (words.length ? ' for ' + esc(words.join(', ')) : '') + '. This can take up to a minute.</p></div>';
    }
    if (w.status === 'error' && w.key === key) {
      return '<div class="picks-state error" role="alert"><h2 id="picks-title" tabindex="-1">We couldn’t load your picks</h2>' +
        '<p>' + esc(w.error) + '</p>' +
        '<div class="state-actions"><button type="button" class="btn btn-primary" id="web-retry" data-action="web-search">Try again</button>' +
        '<a class="btn btn-outline" href="#/profile">Edit preferences</a></div>' +
        (sess.showDemo ? '' : '<p class="hint">Want to see what picks look like? <button type="button" class="btn-link" id="show-demo" data-action="show-demo">Show demo examples</button> — clearly labeled, not personalized and not live.</p>') +
        '</div>';
    }
    if (w.status === 'done' && w.key === key && w.result) return picksResults(p, w);
    // A search for this profile is about to start.
    return '<div class="picks-state" role="status"><span class="spinner big" aria-hidden="true"></span><h2 id="picks-title" tabindex="-1">Getting your picks ready…</h2></div>';
  }

  function picksEmpty(title, text) {
    return '<div class="picks-state" role="status"><h2 id="picks-title" tabindex="-1">' + title + '</h2><p>' + text + '</p>' +
      '<div class="state-actions"><button type="button" class="btn btn-primary" id="web-retry" data-action="web-search">Search again</button>' +
      '<a class="btn btn-outline" href="#/profile">Edit preferences</a></div></div>';
  }

  function picksResults(p, w) {
    const r = w.result;
    const notForMe = function (name) { return feedbackFor(name) === 'less'; };
    const allProducts = (r.products || []).filter(function (wp) {
      return !(wp.status && wp.status.availability === 'out-of-stock') && !notForMe(wp.brandName);   // our page check found no sizes in stock
    });
    const brands = (r.brands || []).filter(function (wb) { return !notForMe(wb.name); });
    const hiddenBrands = (r.brands || []).map(function (wb) { return wb.name; }).concat((r.products || []).map(function (wp) { return wp.brandName; }))
      .filter(function (n, i, a) { return notForMe(n) && a.indexOf(n) === i; });
    if (!allProducts.length && !brands.length && !hiddenBrands.length) {
      return picksEmpty('No matches found this time', 'The search didn’t find specific products we could link to for this profile. Try another shopping region, or add a style detail or category to your profile.');
    }

    const cats = allProducts.map(function (wp) { return wp.category; }).filter(function (c, i, a) { return a.indexOf(c) === i; });
    if (sess.webCat && cats.indexOf(sess.webCat) === -1) sess.webCat = '';
    const picks = { items: [], overBudget: 0, otherCurrency: 0, sizeOut: 0 };
    allProducts.forEach(function (wp) {
      if (sess.webCat && wp.category !== sess.webCat) return;
      const x = webItem(wp);
      x.budget = SB.engine.productBudget(x.product, p);
      // The store's own page says your size is out of stock: hide it unless asked.
      if (x.product.sizeCheck && x.product.sizeCheck.status === 'out-of-stock') { picks.sizeOut++; if (!sess.showSizeOut) return; }
      if (x.budget === 'over') { picks.overBudget++; if (!sess.showOverBudget) return; }
      if (x.budget === 'not-compared') { picks.otherCurrency++; if (!sess.showOverBudget) return; }
      picks.items.push(x);
    });
    // Partial results: say plainly what we couldn't confirm.
    const checking = w.compareStatus === 'loading';
    const comparedSet = r.compare ? r.compare.ids : [];
    const compared = comparedSet.filter(function (id) { const it = r.compare.byId[id]; return it && it.offers.some(function (o) { return o.match === 'same'; }); }).length;
    const partial = [];
    if (r.dropped) partial.push(r.dropped + ' result' + (r.dropped === 1 ? '' : 's') + ' left out because we couldn’t confirm the link');
    if (allProducts.length && allProducts.length < 4) partial.push('only ' + allProducts.length + ' product' + (allProducts.length === 1 ? '' : 's') + ' could be confirmed');
    if (r.compare && compared < comparedSet.length) partial.push(compared ? 'the same item was found at other stores for ' + compared + ' of ' + comparedSet.length + ' picks we compared' : 'we couldn’t confirm these items at other stores, so there’s no full price comparison');
    const noPhoto = allProducts.filter(function (wp) { return !webItem(wp).product.image; }).length;
    if (!checking && noPhoto) partial.push(noPhoto + ' product' + (noPhoto === 1 ? ' has' : 's have') + ' no photo we could use, because the store’s page couldn’t be read');
    const sizeToggle = !picks.sizeOut ? '' : sess.showSizeOut
      ? '<p class="hint">Showing items whose page lists your size as out of stock. <button type="button" class="btn-link" id="hide-size-out" data-action="toggle-size-out" data-value="0">Hide them</button></p>'
      : '<p class="hint">' + picks.sizeOut + ' item' + (picks.sizeOut === 1 ? ' is' : 's are') + ' hidden because the store’s page lists your size as out of stock. <button type="button" class="btn-link" id="show-size-out" data-action="toggle-size-out" data-value="1">Show ' + (picks.sizeOut === 1 ? 'it' : 'them') + '</button></p>';

    const catSelect = cats.length > 1 ? '<label class="sort" for="web-cat"><span>Category</span><select id="web-cat" data-change="web-cat"><option value="">All (' + allProducts.length + ')</option>' +
      cats.map(function (c) { return '<option value="' + c + '"' + (sess.webCat === c ? ' selected' : '') + '>' + esc(SB.label('categories', c)) + '</option>'; }).join('') + '</select></label>' : '';
    const sources = r.sources || [];
    const hiddenNote = hiddenBrands.length
      ? '<p class="hint">Hidden because you said “Not for me”: ' + hiddenBrands.map(function (n, i) {
          return '<button type="button" class="btn-link" id="unhide-' + i + '" data-action="web-feedback" data-value="" data-name="' + esc(n) + '">' + esc(n) + ' <span class="sr-only">(show again)</span></button>';
        }).join(', ') + '. Your next search leaves ' + (hiddenBrands.length === 1 ? 'it' : 'them') + ' out.</p>'
      : '';

    return '<div class="picks-results">' +
      '<h2 id="picks-title" class="sr-only" tabindex="-1">Your results</h2>' +
      '<section class="product-picks" aria-labelledby="pp-title"><div class="results-bar"><h2 class="list-title" id="pp-title">Products for you</h2>' + catSelect + '</div>' +
        (checking ? '<p class="compare-status banner" role="status"><span class="spinner" aria-hidden="true"></span> Checking other stores and photos for your top picks…</p>' : '') +
        (w.compareStatus === 'error' ? '<p class="hint" role="alert">We couldn’t check other stores for these picks. <button type="button" class="btn-link" id="compare-retry" data-action="compare-retry">Try again</button></p>' : '') +
        overBudgetToggle(picks, p) + sizeToggle +
        (picks.items.length ? '<div class="item-grid">' + picks.items.map(productCard).join('') + '</div>'
          : '<div class="empty small"><h3>No products to show here</h3><p>' + (allProducts.length ? 'Try another category' + (picks.overBudget + picks.otherCurrency ? ', or show items outside your budget' : '') + '.' : 'This search found brands but no specific product pages we could confirm.') + '</p></div>') +
        // Short fine print under the products: when the search ran, how it's sorted, and anything we couldn't confirm.
        '<div class="picks-foot fine">' +
          '<p>Found by web search for ' + esc(regionName(r.region)) + ' on ' + esc(new Date(r.retrievedAt).toLocaleString('en-US')) + (w.cached ? ' (saved on this device)' : '') +
            '. Sorted by how closely each item matches ' + (r.usedPhotoLook ? 'your outfit photo and preferences' : 'your preferences') +
            '. Prices, stock, shipping and store availability can change and are unverified unless “See details” says we checked the store’s page — check the store before you buy.</p>' +
          (partial.length ? '<p>Partial results: ' + esc(partial.join('; ')) + '.</p>' : '') +
        '</div>' +
      '</section>' +
      hiddenNote +
      (brands.length ? '<section class="web-brands" aria-labelledby="wb-title"><h2 class="list-title" id="wb-title">Brands to explore</h2>' +
        '<div class="brand-list">' + brands.map(function (wb) { return webBrandCard(wb, r.products || []); }).join('') + '</div></section>' : '') +
      (sources.length ? '<details class="web-consulted" id="web-consulted"' + (sess.open['web-consulted'] ? ' open' : '') + '><summary>Pages the search looked at (' + sources.length + ')</summary><ul>' +
        sources.slice(0, 25).map(function (s) { return '<li><a href="' + esc(s.url) + '" target="_blank" rel="noopener noreferrer">' + esc(s.title || hostOf(s.url)) + ext + '</a></li>'; }).join('') +
        '</ul></details>' : '') +
      ((r.queries || []).length ? '<details class="web-consulted" id="web-queries"' + (sess.open['web-queries'] ? ' open' : '') + '><summary>Searches we ran (' + r.queries.length + ')</summary><ul>' +
        r.queries.slice(0, 20).map(function (q) { return '<li>' + esc(q) + '</li>'; }).join('') + '</ul></details>' : '') +
      '</div>';
  }

  // Fixed, hand-checked product pages from data/products.json. Shown only when the user asks, and labeled.
  function demoSection() {
    if (!sess.showDemo) return '';
    const seen = {};
    const items = SB.products.filter(function (pr) {
      if (seen[pr.brandId] || !SB.engine.brandById(pr.brandId)) return false;
      seen[pr.brandId] = true; return true;
    }).slice(0, 6).map(function (pr) { return { product: pr, brand: SB.engine.brandById(pr.brandId), budget: 'none', demo: true }; });
    return '<section class="demo-examples" id="demo-examples" aria-labelledby="demo-title">' +
      '<h2 id="demo-title" class="list-title" tabindex="-1">Demo examples — not personalized, not live</h2>' +
      '<p class="data-note">These fixed examples come from a small set of product pages we checked by hand' + (SB.catalogMeta.productChecksAt ? ' on ' + esc(fmtDate(SB.catalogMeta.productChecksAt)) : '') +
        '. They are <strong>not</strong> based on your profile, and prices and stock may have changed. Your own picks appear above after a successful search.</p>' +
      '<div class="item-grid">' + items.map(productCard).join('') + '</div>' +
      '<button type="button" class="btn btn-text" id="hide-demo" data-action="hide-demo">Hide demo examples</button></section>';
  }

  function viewMatches() {
    const p = S.state.profile;
    if (!p) return emptyState('Let’s find your picks', 'First, tell us a bit about your style. It takes about two minutes.', '#/start', 'Get started');
    const words = SB.engine.keywords(p);
    return '<div class="container page">' +
      '<div class="page-head"><div><p class="eyebrow">Your picks</p><h1 tabindex="-1">Picks for your style</h1>' +
      '<p class="muted">Based on: ' + (words.length ? esc(words.join(', ')) : 'your answers') + (p.budgets.length ? ' · Budget: ' + esc(p.budgets.map(function (b) { return SB.vocab.budgets[b - 1].short; }).join(', ')) : '') + '. <a href="#/profile">Edit preferences</a></p></div></div>' +
      picksControls(p) +
      '<div class="picks" id="picks" aria-busy="' + (sess.web.status === 'loading') + '">' + picksBody(p) + '</div>' +
      demoSection() +
      '</div>';
  }

  // ---------- MATCHES helpers (shared with the brand guide) ----------
  // <select> for a vocab group; `only` limits options to ids that actually occur.
  function vocabSelect(id, label, group, value, change, only) {
    const opts = SB.vocab[group].filter(function (o) { return !only || only.indexOf(o.id) !== -1; });
    return '<label for="' + id + '">' + label + '</label><select id="' + id + '" data-change="' + change + '" data-key="' + id.replace(/^(f|d)-/, '') + '"><option value="">Any</option>' +
      opts.map(function (o) { return '<option value="' + o.id + '"' + (String(value) === String(o.id) ? ' selected' : '') + '>' + esc(o.label) + '</option>'; }).join('') + '</select>';
  }
  function usedValues(brands, key) {
    const set = [];
    brands.forEach(function (b) { [].concat(b[key]).forEach(function (v) { if (set.indexOf(v) === -1) set.push(v); }); });
    return set;
  }

  const LEVEL = { strong: 'Strong match', good: 'Good match', explore: 'Worth exploring' };

  function saveButton(kind, id, name) {
    const on = S.isFavorite(kind, id);
    return '<button type="button" class="save-btn" id="save-' + kind + '-' + id.replace(/[^a-z0-9-]/gi, '_') + '" data-action="toggle-save" data-kind="' + kind + '" data-id="' + esc(id) + '" aria-pressed="' + on + '" aria-label="' + (on ? 'Remove ' : 'Save ') + esc(name) + (on ? ' from saved' : '') + '">' +
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg><span>' + (on ? 'Saved' : 'Save') + '</span></button>';
  }

  function budgetFlag(r) {
    if (r.budgetStatus === 'within') return '<span class="flag ok">In your budget</span>';
    if (r.budgetStatus === 'above') return '<span class="flag warn">Above your budget — look for sales</span>';
    if (r.budgetStatus === 'below') return '<span class="flag">Below your budget</span>';
    return '';
  }

  // ---------- data-status labels ----------
  function fmtDate(iso) {
    if (!iso) return '';
    const d = new Date(iso + 'T12:00:00');
    return isNaN(d) ? iso : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
  function linkBadge(b) {
    if (b.linkStatus === 'verified') return '<span class="status ok" title="Automated check: the page loaded and its title names the brand">Link checked ' + esc(fmtDate(b.linkCheckedAt)) + '</span>';
    if (b.linkStatus === 'none') return '<span class="status">No official link on file</span>';
    return '<span class="status warn" title="Our automated check could not confirm this page (many sites block automated checks)">Link not verified</span>';
  }
  function storeStatusText(b) {
    if (b.stores.status === 'verified') return 'Store info verified ' + fmtDate(b.lastVerified);
    if (b.stores.status === 'pending') return 'Store info not yet verified';
    return 'No store data yet';
  }
  function reasonBadge(source) {
    const map = { user: 'You told us', guess: 'Suggested by Style Bridge', feedback: 'Your feedback', web: 'Web search' };
    return '<span class="badge badge-' + source + '">' + map[source] + '</span>';
  }
  function dataStatus(b) {
    const priceVerified = b.price.status === 'verified';
    return '<div class="data-row">' + linkBadge(b) +
      '<span class="status' + (priceVerified ? ' ok' : '') + '">' + (priceVerified ? 'Prices verified' : 'Estimated prices') + '</span>' +
      '<span class="status' + (b.stores.status === 'verified' ? ' ok' : '') + '">' + esc(storeStatusText(b)) + '</span></div>' +
      '<details class="data-details" id="data-' + b.id + '"' + (sess.open['data-' + b.id] ? ' open' : '') + '><summary>About this info</summary><dl>' +
        '<div><dt>Source</dt><dd>' + (b.source === 'editorial' ? 'Style Bridge editorial demo data (compiled ' + esc(fmtDate(SB.catalogMeta.compiledAt)) + ')' : esc(b.source)) + '</dd></div>' +
        '<div><dt>Last verified by a person</dt><dd>' + (b.lastVerified ? esc(fmtDate(b.lastVerified)) : 'Not yet') + '</dd></div>' +
        '<div><dt>Official link</dt><dd>' + (b.linkStatus === 'verified' ? 'Automated check on ' + esc(fmtDate(b.linkCheckedAt)) + ': page loaded and named the brand.' : b.linkStatus === 'none' ? 'None on file.' : 'Not confirmed by our automated check.') + '</dd></div>' +
        '<div><dt>Style tags, sizes & prices</dt><dd>Editorial estimates — not checked against the brand’s current catalog.</dd></div>' +
        '<div><dt>Product listings</dt><dd>' + (SB.engine.productsForBrand(b.id).length
          ? SB.engine.productsForBrand(b.id).length + ' hand-checked listing(s), read from the brand’s own product pages.'
          : 'None yet — browse the official site for current products.') + '</dd></div>' +
      '</dl></details>';
  }

  function storeBlock(b) {
    const st = sess.storeLookup[b.id] || {};
    if (b.hasStores !== true) {
      return '<div class="where-col"><h4>In stores</h4><p>' + (b.hasStores === false ? 'No physical stores known.' : 'No store data yet.') + '</p></div>';
    }
    const form = st.open
      ? '<form class="zip-form" data-form="zip" data-brand="' + b.id + '" novalidate>' +
          '<label for="zip-' + b.id + '">Your ZIP code</label>' +
          '<div class="input-row"><input id="zip-' + b.id + '" inputmode="numeric" maxlength="5" autocomplete="postal-code" value="' + esc(st.zip || '') + '" aria-describedby="zip-msg-' + b.id + '"><button class="btn btn-small btn-outline" type="submit">Search</button></div>' +
          '<p id="zip-msg-' + b.id + '" class="' + (st.error ? 'field-error' : 'hint') + '" aria-live="polite">' + (st.error ? esc(st.error) : st.message ? st.message : '') + '</p>' +
        '</form>'
      : '<button type="button" class="btn btn-text" id="stores-' + b.id + '" data-action="open-stores" data-id="' + b.id + '">Find stores near me</button>';
    const results = st.results
      ? '<ul class="store-results">' + (st.results.length ? st.results.map(function (s) {
          return '<li><strong>' + esc(s.name) + '</strong><br><span class="small">' + esc(s.address) + '</span>' + (s.mapsUrl ? ' <a class="small" href="' + esc(s.mapsUrl) + '" target="_blank" rel="noopener noreferrer">Map' + ext + '</a>' : '') + '</li>';
        }).join('') : '<li class="small">No matching stores found near this ZIP code.</li>') + '</ul>' +
        '<p class="fine">' + esc(st.source) + ', retrieved ' + esc(new Date(st.retrievedAt).toLocaleString('en-US')) + (st.cached ? ' (cached)' : '') + '. ' + esc(st.note) + '</p>'
      : '';
    return '<div class="where-col"><h4>In stores</h4><p>' + esc(b.stores.summary || 'No store data yet.') + '</p>' + form + results + '</div>';
  }

  function onlineBlock(b) {
    const link = b.officialUrl ? '<a class="btn btn-small btn-primary" href="' + esc(b.officialUrl) + '" target="_blank" rel="noopener noreferrer">Official site' + ext + '</a>' : '';
    const note = b.online === true ? '' : b.online === false ? '<p>No online shopping.</p>' : '<p>US online shopping not confirmed.</p>';
    return '<div class="where-col"><h4>Online</h4>' + note + (link || '<p>No official link on file.</p>') + '</div>';
  }


  function originText(b) {
    return b.country === 'US' ? 'US-based brand' : 'International brand · based in ' + SB.label('countries', b.country);
  }
  function availabilityText(b) {
    if (b.usAvailability === 'yes') return 'Listed as sold in the US — not verified';
    if (b.usAvailability === 'intl-online') return 'International online store — US shipping not verified';
    return 'US availability unknown';
  }
  function brandMeta(b) {
    return esc((b.country === 'US' ? 'US-based' : 'Based in ' + SB.label('countries', b.country)) + ' · ' +
      (b.usAvailability === 'yes' ? 'Sold in the US' : b.usAvailability === 'intl-online' ? 'International online store' : 'US availability unknown'));
  }

  // Quick facts: what it's good for, price, origin and availability, each with its data status.
  function brandFacts(b, r) {
    const uc = r.useCase;
    const good = uc
      ? uc.categories.map(function (c) { return SB.label('categories', c); }).concat(uc.occasions.map(function (o) { return SB.label('occasions', o); }))
      : b.categories.slice(0, 3).map(function (c) { return SB.label('categories', c); });
    return '<dl class="facts">' +
      '<div><dt>' + (uc && uc.personal ? 'Useful for you' : 'Best known for') + '</dt><dd>' + esc(good.join(' · ')) + '</dd></div>' +
      '<div><dt>Price</dt><dd><span class="tier" aria-label="Price level ' + tierText(b.price.tiers) + '">' + tierText(b.price.tiers) + '</span> ' + esc(b.price.note || tierRange(b.price.tiers)) + ' <span class="approx">estimate</span></dd></div>' +
      '<div><dt>Origin</dt><dd>' + esc(originText(b)) + ' <span class="approx">editorial</span></dd></div>' +
      '<div><dt>US availability</dt><dd>' + esc(availabilityText(b)) + '</dd></div>' +
    '</dl>';
  }

  function brandCard(r, opts) {
    opts = opts || {};
    const b = r.brand;
    const detailsId = 'pieces-' + b.id;
    return '<article class="brand-card" id="card-' + b.id + '" tabindex="-1" aria-labelledby="bn-' + b.id + '">' +
      '<div class="brand-top">' +
        '<div class="monogram" style="background:' + brandTone(b.id) + '" aria-hidden="true">' + esc(monogram(b.name)) + '</div>' +
        '<div class="brand-title"><h3 id="bn-' + b.id + '">' + esc(b.name) + (b.nameZh ? ' <span class="zh" lang="zh">' + esc(b.nameZh) + '</span>' : '') + '</h3><p class="muted small">' + brandMeta(b) + '</p></div>' +
        saveButton('brands', b.id, b.name) +
      '</div>' +
      (r.level ? '<div class="meta-row"><span class="level level-' + r.level + '">' + LEVEL[r.level] + '</span>' + (r.affordablePick ? '<span class="flag">Budget-friendly pick</span>' : '') + (r.regionPick ? '<span class="flag">From another region</span>' : '') + budgetFlag(r) + '</div>' : '') +
      '<p>' + esc(b.intro) + '</p>' +
      brandFacts(b, r) +
      (r.reasons && r.reasons.length ? '<h4 class="why-title">Why it fits you</h4><ul class="reasons">' + r.reasons.map(function (x) { return '<li class="r-' + x.kind + '">' + esc(x.text) + ' ' + reasonBadge(x.source) + '</li>'; }).join('') + '</ul>' : '') +
      (r.sizeMisses && r.sizeMisses.length ? '<p class="hint">Limited or no ' + esc(r.sizeMisses.map(function (s) { return SB.label('sizes', s).toLowerCase(); }).join(', ')) + ' sizes listed.</p>' : '') +
      '<p class="good-for"><span>Good for:</span> ' + b.categories.slice(0, 5).map(function (c) { return '<span class="tag">' + esc(SB.label('categories', c)) + '</span>'; }).join('') + '</p>' +
      (b.sizes.length ? '<p class="small muted">Size ranges: ' + esc(b.sizes.map(function (s) { return SB.label('sizes', s); }).join(' · ')) + '</p>' : '') +
      '<div class="where">' + onlineBlock(b) + storeBlock(b) + '</div>' +
      dataStatus(b) +
      brandProducts(b, detailsId) +
    '</article>';
  }

  // Verified listings for one brand, or an honest note that there are none.
  function brandProducts(b, detailsId) {
    const list = SB.engine.productsForBrand(b.id);
    if (!list.length) {
      return '<p class="no-products">No verified product listings for ' + esc(plain(b.name)) + ' yet.' +
        (b.officialUrl ? ' <a href="' + esc(b.officialUrl) + '" target="_blank" rel="noopener noreferrer">Browse current products on the official site' + ext + '</a>' : '') + '</p>';
    }
    const profile = S.state.profile;
    return '<details class="pieces" id="' + detailsId + '"' + (sess.open[detailsId] ? ' open' : '') + '><summary>Products from ' + esc(plain(b.name)) + ' (' + list.length + ' hand-checked listing' + (list.length === 1 ? '' : 's') + ')</summary>' +
      '<ul class="mini-items">' + list.map(function (pr) {
        const budget = SB.engine.productBudget(pr, profile);
        return '<li>' + productThumb(pr, 'mini-thumb') +
          '<div><a class="mini-name" href="' + esc(pr.url) + '" target="_blank" rel="noopener noreferrer">' + esc(pr.name) + ext + '</a>' +
          '<span class="small muted"> · ' + esc(formatPrice(pr.price)) + (pr.color ? ' · ' + esc(pr.color) : '') + '</span>' +
          (budget === 'over' ? ' <span class="flag warn">Over your budget</span>' : '') +
          '<br><span class="fine">' + esc(checkLine(pr)) + '</span></div>' +
          saveButton('items', pr.id, pr.name) + '</li>';
      }).join('') + '</ul></details>';
  }

  // ---------- product cards ----------
  function formatPrice(price) {
    try {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: price.currency, maximumFractionDigits: price.amount % 1 ? 2 : 0 }).format(price.amount);
    } catch (e) {
      return price.amount + ' ' + price.currency;
    }
  }
  function checkLine(pr) {
    const s = pr.status;
    return s.pageVerified ? 'Product page checked ' + fmtDate(s.checkedAt) : 'Product page not verified';
  }
  // Product photo as published on the store's own product page (displayed by link, never copied). With no photo,
  // or if the store blocks it, a compact labeled strip replaces it — no broken icon or large empty box.
  function productThumb(pr, cls) {
    const fallback = '<span class="img-fallback" hidden>' + itemIcon(pr.category) + '<span>No photo available here — see it on the store’s page</span></span>';
    if (!pr.image || !pr.image.url) return '<span class="' + cls + ' no-img">' + fallback.replace(' hidden', '') + '</span>';
    return '<span class="' + cls + '"><img src="' + esc(pr.image.url) + '" alt="' + esc(pr.image.alt) + '" loading="lazy" decoding="async" referrerpolicy="no-referrer" data-fallback>' + fallback + '</span>';
  }

  // The user's own size for this item, as the store's page lists it. Never a fit claim.
  function sizeLine(pr) {
    const c = pr.sizeCheck;
    if (!c) return '';
    const m = {
      'in-stock': ['ok', 'in stock when checked'], 'out-of-stock': ['warn', 'out of stock when checked'], listed: ['', 'listed (stock not shown)'],
      'not-listed': ['warn', 'not listed on the store’s page'], unverified: ['', 'availability not verified']
    }[c.status] || ['', 'availability not verified'];
    return '<p class="size-line"><span class="status ' + m[0] + '">Your ' + esc(c.label.toLowerCase()) + ' size ' + esc(c.size) + ': ' + m[1] + '</span> <span class="fine">Sizing varies by brand — check the size chart.</span></p>';
  }

  const CHANNELS = { official: 'Official site', retailer: 'Retailer', marketplace: 'Marketplace', store: 'In-store listing', resale: 'Resale' };
  function offerRow(o) {
    const price = o.price
      ? '<span class="offer-price">' + esc(formatPrice(o.price)) + ' <span class="approx">' + esc(o.price.currency) + (o.priceFrom === 'page' ? ', from the page' : ', from search — not verified') + '</span></span>'
      : '<span class="muted">Price not verified</span>';
    const facts = [price];
    if (o.condition) facts.push('Condition: ' + esc(o.condition) + (o.conditionFrom === 'page' ? '' : ' <span class="approx">per the listing, not verified</span>'));
    facts.push(o.availability === 'in-stock' ? '<span class="status ok">In stock when checked</span>' : o.availability === 'out-of-stock' ? '<span class="status warn">Out of stock when checked</span>' : '<span class="muted">Availability not verified</span>');
    if (o.shippingNote) facts.push('Shipping/pickup: ' + esc(o.shippingNote) + ' <span class="approx">from search, not verified</span>');
    const readNote = {
      'not-allowed': 'This site doesn’t allow automated checks, so price and stock aren’t verified.',
      blocked: 'The store blocked our check, so price and stock aren’t verified.', robots: 'The store asks automated tools not to read this page.'
    }[o.readStatus];
    facts.push('<span class="fine">' + (o.pageVerified ? 'Page checked ' : 'Found by search ') + esc(fmtDate(o.checkedAt)) + (readNote ? '. ' + readNote : '') + '</span>');
    return '<li class="offer"><div class="offer-head"><a href="' + esc(o.url) + '" target="_blank" rel="noopener noreferrer">' + esc(o.seller || hostLabel(o.url)) + ext + '</a>' +
      '<span class="channel">' + esc(CHANNELS[o.channel] || 'Store') + '</span>' + (o.primary ? '<span class="channel main">This listing</span>' : '') + '</div>' +
      '<p class="offer-name">' + esc(o.productName) + (o.variant ? ' <span class="muted">· ' + esc(o.variant) + '</span>' : '') + '</p>' +
      '<p class="offer-facts">' + facts.join('<span aria-hidden="true"> · </span>') + '</p></li>';
  }
  // Same item at other stores (official, retailers, marketplaces, store listings, resale). Similar items are
  // listed separately and never presented as a price comparison.
  function comparisonBlock(pr) {
    const list = pr.comparison || [];
    if (!pr.web || !list.length) return '';
    const same = list.filter(function (o) { return o.match === 'same'; });
    const alts = list.filter(function (o) { return o.match !== 'same'; });
    const otherSame = same.filter(function (o) { return !o.primary; }).length;
    const channels = same.map(function (o) { return o.channel; }).filter(function (c, i, a) { return c && a.indexOf(c) === i; });
    const id = 'cmp-' + pr.id;
    const open = !!sess.open[id];
    const state = pr.compareState === 'loading'
      ? '<p class="compare-status"><span class="spinner" aria-hidden="true"></span> Checking official sites, other stores, Amazon and resale for this item…</p>'
      : pr.compareState === 'error'
        ? '<p class="hint">We couldn’t check other stores. ' + esc(sess.web.compareError || '') + ' <button type="button" class="btn-link" id="compare-retry-' + esc(pr.id) + '" data-action="compare-retry">Try again</button></p>'
        : pr.compareState === 'skipped' ? '<p class="hint">We compare stores for your top ' + COMPARE_TOP + ' picks.</p>'
          : !otherSame && pr.compareState === 'done' ? '<p class="hint">We couldn’t verify this exact item at other stores, so a full price comparison isn’t available.' + (pr.sources && pr.sources.length ? ' Sources found are listed on the card.' : '') + '</p>' : '';
    return '<details class="compare" id="' + esc(id) + '"' + (open ? ' open' : '') + '><summary>' +
        (otherSame ? 'Compare ' + same.length + ' places to buy' + (channels.length > 1 ? ' (' + channels.map(function (c) { return CHANNELS[c] || c; }).join(', ') + ')' : '') : 'Where to buy') +
        (alts.length ? ' · ' + alts.length + ' similar' : '') + '</summary>' +
      '<ul class="offer-list">' + same.map(offerRow).join('') + '</ul>' + state +
      (alts.length ? '<p class="subhead">Similar items — not a direct price comparison</p><ul class="offer-list alt">' + alts.map(offerRow).join('') + '</ul>' : '') +
      '<p class="fine">Prices, stock, shipping and store availability can change. Colors, sizes and condition can differ between listings, so compare the details before you buy.</p></details>';
  }
  function productStatusChips(pr, budget) {
    const s = pr.status;
    const chips = [];
    if (pr.web) {
      // Web search result: say exactly what our own page check confirmed, and nothing more.
      chips.push('<span class="status source-web">Found by web search</span>');
      if (s.pageVerified) chips.push('<span class="status ok">Product page checked ' + esc(fmtDate(s.checkedAt)) + '</span>');
      else chips.push('<span class="status warn" title="' + (s.robotsBlocked ? 'The site doesn’t allow automated checks' : 'We couldn’t read this page') + '">Product page not checked</span>');
      chips.push(pr.priceFrom === 'page' ? '<span class="status ok">Price from product page</span>'
        : pr.price ? '<span class="status warn">Price from search — unverified</span>' : '<span class="status warn">Price not confirmed</span>');
    } else if (s.pageVerified && s.priceVerified) {
      chips.push('<span class="status ok">Product page &amp; price verified ' + esc(fmtDate(s.checkedAt)) + '</span>');
    } else {
      chips.push(s.pageVerified ? '<span class="status ok">Product page verified ' + esc(fmtDate(s.checkedAt)) + '</span>' : '<span class="status warn">Product page not verified</span>');
      chips.push(s.priceVerified ? '<span class="status ok">Price verified ' + esc(fmtDate(s.checkedAt)) + '</span>' : '<span class="status warn">Price not verified</span>');
    }
    if (s.availability === 'in-stock') chips.push('<span class="status ok" title="' + esc(s.availabilityDetail) + '">In stock when checked (' + esc(s.availabilityDetail.replace(' listed in stock', '')) + ')</span>');
    else if (s.availability === 'out-of-stock') chips.push('<span class="status warn">Out of stock when checked</span>');
    else chips.push('<span class="status warn">Availability not verified</span>');
    if (budget === 'over') chips.push('<span class="flag warn">Over your budget</span>');
    if (budget === 'within') chips.push('<span class="flag ok">In your budget</span>');
    if (budget === 'not-compared') chips.push('<span class="status">Priced in ' + esc(pr.price.currency) + ' — not compared with your USD budget</span>');
    return '<div class="data-row">' + chips.join('') + '</div>';
  }

  function matchChips(list) {
    return list && list.length
      ? '<p class="matches"><span class="matches-label">Matches your</span> ' + list.map(function (m) { return '<span class="attr-chip">' + esc(m) + '</span>'; }).join('') + '</p>'
      : '';
  }
  // Our own match check: photo matches first; "checked" means the product page itself says so.
  function evidenceChips(list) {
    if (!list || !list.length) return '';
    const sorted = list.slice().sort(function (a, b) { return (b.from === 'photo') - (a.from === 'photo'); });
    return '<p class="matches"><span class="matches-label">Matches your</span> ' + sorted.map(function (e) {
      const where = e.checked ? 'found on the product page' : 'from the search summary; not confirmed on the product page';
      return '<span class="attr-chip' + (e.from === 'photo' ? ' from-photo' : '') + (e.checked ? '' : ' unchecked') + '" title="' + (e.from === 'photo' ? 'From your outfit photo, ' : 'From your profile, ') + where + '">' +
        (e.from === 'photo' ? '<span class="chip-src">Photo</span> ' : '') + esc(e.label) + (e.checked ? '' : '<span class="sr-only"> (' + where + ')</span>') + '</span>';
    }).join('') + '</p>';
  }
  function likesBrand(name) {
    const p = S.state.profile, n = String(name || '').toLowerCase();
    return !!(p && n && p.brands.some(function (b) { return plain(b.name).toLowerCase() === n; }));
  }

  function productCard(x) {
    const pr = x.product, b = x.brand;
    const budget = x.budget || SB.engine.productBudget(pr, S.state.profile);
    const origin = !pr.web && b.country ? (b.country === 'US' ? 'US brand' : 'Based in ' + SB.label('countries', b.country)) : '';
    const priceLine = pr.price
      ? esc(formatPrice(pr.price)) + ' <span class="approx">' + esc(pr.price.currency) +
        (pr.status.priceVerified ? ', as listed on ' + esc(fmtDate(pr.status.checkedAt)) : ', not verified') + '</span>'
      : '<span class="muted">Price not confirmed</span>';
    const store = pr.web ? hostLabel(pr.url) : plain(b.name);
    return '<article class="item-card product-card' + (pr.web ? ' is-web' : ' is-demo') + '" aria-labelledby="pn-' + esc(pr.id) + '">' +
      productThumb(pr, 'item-visual photo') +
      (pr.web && pr.image && pr.image.from ? '<p class="photo-credit">Photo from ' + esc(pr.image.from) + '’s product page</p>' : '') +
      '<div class="item-body">' +
        (x.demo ? '<p><span class="demo-chip">Demo example</span></p>' : '') +
        (pr.photoMatches >= 2 ? '<p><span class="flag ok">Close to your outfit photo</span></p>' : '') +
        '<p class="item-brand">' + esc(b.name) + (origin ? ' <span class="item-origin">· ' + esc(origin) + '</span>' : '') + '</p>' +
        '<h3 id="pn-' + esc(pr.id) + '">' + esc(pr.name) + '</h3>' +
        '<p class="item-meta">' + esc(SB.label('categories', pr.category)) + (pr.color ? ' · Color: ' + esc(pr.color) : '') + '</p>' +
        '<p class="price">' + priceLine + '</p>' +
        '<div class="item-actions"><a class="btn btn-small btn-primary" href="' + esc(pr.url) + '" target="_blank" rel="noopener noreferrer">View on ' + esc(store) + ext + '</a>' + cartButton(pr) + saveButton('items', pr.id, pr.name) + '</div>' +
        productMore(x, pr, b, budget) +
        comparisonBlock(pr) +
      '</div></article>';
  }

  // "See details": verification labels, size check, why it fits, matched attributes, product details and sources.
  function productMore(x, pr, b, budget) {
    const id = 'more-' + pr.id;
    return '<details class="card-more" id="' + esc(id) + '"' + (sess.open[id] ? ' open' : '') + '><summary><span class="more-label">See details</span><span class="sr-only"> for ' + esc(pr.name) + '</span></summary>' +
      '<div class="card-more-body">' +
        productStatusChips(pr, budget) +
        sizeLine(pr) +
        (pr.web && likesBrand(b.name) ? '<p class="hint">A brand you already like — included for this specific piece.</p>' : '') +
        (x.why ? '<p class="why">' + reasonBadge('web') + ' ' + esc(x.why) + '</p>' : '') +
        (pr.evidence ? evidenceChips(pr.evidence) : matchChips(pr.matched)) +
        (pr.details ? '<p class="small"><strong>Details:</strong> ' + esc(pr.details) + '</p>' : '') +
        (pr.web && pr.sources && pr.sources.length ? '<p class="fine">Sources: ' + pr.sources.map(function (u) { return '<a href="' + esc(u) + '" target="_blank" rel="noopener noreferrer">' + esc(hostLabel(u)) + ext + '</a>'; }).join(', ') + '</p>' : '') +
        '<p class="fine">' + (pr.web
          ? 'Found by web search on ' + esc(fmtDate(pr.status.checkedAt)) + '. Check price, sizes, shipping and returns on the store’s page before you buy.'
          : 'Checked by hand on ' + esc(fmtDate(pr.status.checkedAt)) + ' from ' + esc(plain(b.name)) + '’s product page. Not personalized; price and stock may have changed.') + '</p>' +
      '</div></details>';
  }

  function hostLabel(u) { try { return new URL(u).host.replace(/^www\./, ''); } catch (e) { return 'store'; } }

  // ---------- web results as cards ----------
  function webData() {
    const w = sess.web;
    return w && w.status === 'done' && w.result && Array.isArray(w.result.products) ? w.result : null;
  }

  // A web product as a card item. Nothing is filled in that the search or our page check didn't return.
  function webItem(wp) {
    // Other stores (and a photo from one of them, if the product's own page had none) from the comparison step.
    const cmp = compareFor(wp.id);
    const more = cmp.item ? cmp.item.offers : [];
    const image = wp.image || (cmp.item && cmp.item.image) || null;
    return {
      product: {
        id: wp.id, web: true, name: wp.name, category: wp.category, color: wp.color, url: wp.url, image: image,
        compareState: cmp.state,
        price: wp.price, priceFrom: wp.priceFrom, status: wp.status, details: wp.productDetails || '', matched: wp.matchedAttributes || [], sources: wp.sources || [],
        // Our ranking check (newer results): verified evidence replaces the model's own "matched" list.
        evidence: Array.isArray(wp.matchEvidence) ? wp.matchEvidence : null, photoMatches: wp.photoMatches || 0, score: wp.score,
        sizeCheck: wp.sizeCheck || null, comparison: (wp.comparison || []).concat(more), seller: wp.seller, channel: wp.channel
      },
      brand: { name: wp.brandName, country: null }, why: wp.whyFits
    };
  }

  // Up to 3 product photos for a brand, only from product pages our server read (name + image on the page).
  function brandShots(wb, products) {
    const n = String(wb.name).toLowerCase(), seen = {};
    const fromResults = (products || []).filter(function (wp) { return String(wp.brandName).toLowerCase() === n && wp.image && wp.status && wp.status.pageVerified; })
      .map(function (wp) { return { name: wp.name, url: wp.url, image: wp.image, price: wp.priceFrom === 'page' ? wp.price : null, checkedAt: wp.status.checkedAt, category: wp.category }; });
    const shots = (wb.products || []).concat(fromResults).filter(function (s) {
      if (!s.image || !s.image.url || seen[s.url]) return false;
      seen[s.url] = true; return true;
    }).slice(0, 3);
    if (!shots.length) return '';
    return '<div class="brand-shots"><p class="subhead">From ' + esc(wb.name) + '</p><ul class="shot-list">' + shots.map(function (s) {
      return '<li><a href="' + esc(s.url) + '" target="_blank" rel="noopener noreferrer">' + productThumb({ image: s.image, category: s.category }, 'shot-img') +
        '<span class="shot-name">' + esc(s.name) + '<span class="sr-only"> (opens in a new tab)</span></span></a>' +
        (s.price ? '<span class="shot-price">' + esc(formatPrice(s.price)) + ' <span class="approx">as listed ' + esc(fmtDate(s.checkedAt)) + '</span></span>' : '') + '</li>';
    }).join('') + '</ul><p class="fine">Photos' + (shots.some(function (s) { return s.price; }) ? ' and prices' : '') + ' from each product’s page, checked ' + esc(fmtDate(shots[0].checkedAt)) + '. They may have changed.</p></div>';
  }

  function webBrandCard(wb, products) {
    const id = 'web-' + String(wb.name).toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const fb = feedbackFor(wb.name);
    return '<article class="brand-card is-web" aria-labelledby="bn-' + esc(id) + '">' +
      '<div class="brand-top">' +
        '<div class="monogram" style="background:' + brandTone(id) + '" aria-hidden="true">' + esc(monogram(wb.name)) + '</div>' +
        '<div class="brand-title"><h3 id="bn-' + esc(id) + '">' + esc(wb.name) + '</h3><p class="muted small">Found by web search for your profile</p></div>' +
      '</div>' +
      (likesBrand(wb.name) ? '<div class="meta-row"><span class="flag">A brand you already like</span></div>' : '') +
      (wb.whyFits ? '<h4 class="why-title">Why it fits you</h4><p class="why">' + reasonBadge('web') + ' ' + esc(wb.whyFits) + '</p>' : '') +
      matchChips(wb.matchedAttributes) +
      brandShots(wb, products) +
      '<dl class="facts">' +
        (wb.categories && wb.categories.length ? '<div><dt>Good for</dt><dd>' + esc(wb.categories.map(function (c) { return SB.label('categories', c); }).join(' · ')) + '</dd></div>' : '') +
        '<div><dt>Price</dt><dd>' + esc(wb.priceNote || 'Not confirmed') + ' <span class="approx">from search, unverified</span></dd></div>' +
        '<div><dt>Availability & shipping</dt><dd>' + esc(wb.availabilityNote || 'Not confirmed') + ' <span class="approx">unverified</span></dd></div>' +
      '</dl>' +
      '<div class="where"><div class="where-col"><h4>Shop</h4>' +
        (wb.url ? '<a class="btn btn-small btn-primary" href="' + esc(wb.url) + '" target="_blank" rel="noopener noreferrer">Official site' + ext + '</a>' : '<p>Official site not confirmed by the search.</p>') +
      '</div>' +
      ((wb.sources || []).length ? '<div class="where-col"><h4>Sources</h4><ul class="web-src-list">' + wb.sources.map(function (u) {
        return '<li><a href="' + esc(u) + '" target="_blank" rel="noopener noreferrer">' + esc(hostLabel(u)) + ext + '</a></li>';
      }).join('') + '</ul></div>' : '') + '</div>' +
      '<div class="feedback" role="group" aria-label="Is ' + esc(wb.name) + ' your style?">' +
        '<button type="button" class="fb-btn" id="fb-more-' + esc(id) + '" data-action="web-feedback" data-value="more" data-name="' + esc(wb.name) + '" aria-pressed="' + (fb === 'more') + '">' + (fb === 'more' ? '✓ ' : '') + 'More like this</button>' +
        '<button type="button" class="fb-btn" id="fb-less-' + esc(id) + '" data-action="web-feedback" data-value="less" data-name="' + esc(wb.name) + '" aria-pressed="false">Not for me</button>' +
      '</div>' +
    '</article>';
  }
  function overBudgetToggle(picks, p) {
    if (!p.budgets.length) return '';
    if (sess.showOverBudget) return '<p class="hint">Showing items outside your budget too (marked “Over your budget” or by currency). <button type="button" class="btn-link" id="hide-over" data-action="toggle-over" data-value="0">Hide them</button></p>';
    const over = picks.overBudget, other = picks.otherCurrency, n = over + other;
    if (!n) return '';
    const why = [];
    if (over) why.push(over + ' over the budget you set');
    if (other) why.push(other + ' priced in another currency, so we can’t compare ' + (other === 1 ? 'it' : 'them') + ' with your USD budget');
    return '<p class="hint">' + n + ' item' + (n === 1 ? ' is' : 's are') + ' hidden: ' + why.join('; ') + '. <button type="button" class="btn-link" id="show-over" data-action="toggle-over" data-value="1">Show ' + (n === 1 ? 'it' : 'them') + ' anyway</button></p>';
  }

  // Plain-English version of a tier range, e.g. [2,3] -> "Most pieces about $40–$250".
  function tierRange(tiers) {
    const min = Math.min.apply(null, tiers), max = Math.max.apply(null, tiers);
    const low = [0, 0, 40, 100, 250][min], high = [0, 40, 100, 250, 0][max];
    if (max === 4) return min === 1 ? 'From under $40 to $250+' : 'Most pieces $' + low + '+';
    if (min === 1) return 'Most pieces under $' + high;
    return 'Most pieces about $' + low + '–$' + high;
  }

  // ---------- SAVED ----------
  function viewSaved() {
    const fav = S.state.favorites;
    if (!fav.brands.length && !fav.items.length) {
      return emptyState('Nothing saved yet', 'Tap “Save” on any brand or product in your picks to keep it here.', S.state.profile ? '#/matches' : '#/start', S.state.profile ? 'Browse my picks' : 'Get started');
    }
    const p = S.state.profile;
    const scored = p ? SB.engine.recommend(p) : [];
    const byId = SB.engine.brandById;
    const brandCards = fav.brands.map(function (id) {
      const r = scored.find(function (x) { return x.brand.id === id; });
      const b = byId(id);
      if (!b) return '';
      return brandCard(r || { brand: b, reasons: [], budgetStatus: 'unset', sizeMisses: [] });
    }).join('');
    // Saved products resolve against the current verified listings; older saved placeholders are dropped.
    const snaps = fav.webItems || {};
    const savedProducts = fav.items.map(function (id) {
      const pr = SB.engine.productById(id);
      if (pr) return { product: pr, brand: byId(pr.brandId), budget: 'none', demo: true };
      const wp = snaps[id];
      return wp ? webItem(SB.services.discovery.normalize({ products: [wp] }).products[0]) : null;
    }).filter(Boolean);
    const stale = fav.items.length - savedProducts.length;
    const items = savedProducts.map(productCard).join('');
    return '<div class="container page"><p class="eyebrow">Saved</p><h1 tabindex="-1">Your saved brands & products</h1>' +
      '<p class="muted">Saved on this device only. Remove anything with the Saved button.</p>' +
      (stale ? '<p class="hint">' + stale + ' saved item' + (stale === 1 ? ' is' : 's are') + ' no longer shown because ' + (stale === 1 ? 'it’s' : 'they’re') + ' no longer available here.</p>' : '') +
      (brandCards ? '<h2 class="list-title">Brands (' + fav.brands.length + ')</h2><div class="brand-list">' + brandCards + '</div>' : '') +
      (items ? '<h2 class="list-title">Products (' + savedProducts.length + ')</h2><div class="item-grid">' + items + '</div>' : '') +
      '</div>';
  }

  // ---------- CART & CHECKOUT ----------
  // Style Bridge keeps its own shopping list on this device. It never adds anything to a store's cart and never
  // takes payment: checkout hands each item off to the store's own product page, where the user pays.
  function cartCount() { return S.state.cart.reduce(function (n, l) { return n + (l.qty || 1); }, 0); }
  function cartButton(pr) {
    const on = !!S.cartLine(pr.id);
    return '<button type="button" class="cart-btn' + (on ? ' on' : '') + '" id="cart-' + esc(pr.id.replace(/[^a-z0-9-]/gi, '_')) + '" data-action="toggle-cart" data-id="' + esc(pr.id) + '" aria-pressed="' + on + '">' +
      (on ? '✓ In cart' : 'Add to cart') + '<span class="sr-only">: ' + esc(pr.name) + '</span></button>';
  }
  // The product as it was found (search result incl. other stores, or a hand-checked demo listing).
  function cartSnapshot(id) {
    const web = webData();
    const wp = (web && (web.products || []).find(function (x) { return x.id === id; })) || ((S.state.favorites.webItems || {})[id]);
    if (wp) {
      const x = webItem(SB.services.discovery.normalize({ products: [Object.assign({}, wp)] }).products[0]);
      return { raw: Object.assign({}, wp, { comparison: x.product.comparison, image: x.product.image }) };
    }
    const pr = SB.engine.productById(id);
    return pr ? { demoId: id } : null;
  }
  function lineItem(l) {
    if (l.raw) { const x = webItem(SB.services.discovery.normalize({ products: [Object.assign({}, l.raw)] }).products[0]); x.product.comparison = l.raw.comparison || x.product.comparison; return x; }
    const pr = SB.engine.productById(l.demoId);
    return pr ? { product: pr, brand: SB.engine.brandById(pr.brandId), demo: true } : null;
  }
  // The user's own size for this kind of item, if they entered one (just a starting value they can change).
  function defaultSize(category) {
    const pd = personal();
    if (category === 'shoes') return pd.shoeSize ? pd.shoeSize + ' ' + ((SHOE_SYSTEMS.find(function (s) { return s[0] === (pd.shoeSystem || 'us-women'); }) || ['', ''])[1]) : '';
    if (category === 'pants' || category === 'denim') return pd.bottoms || '';
    if (category === 'dresses') return pd.dresses || pd.tops || '';
    return pd.tops || '';
  }
  function storeName(x) { return x.product.web ? (x.product.seller || hostLabel(x.product.url)) : plain(x.brand.name); }
  function cartGroups() {
    const groups = [];
    S.state.cart.forEach(function (l) {
      const x = lineItem(l);
      if (!x) return;
      const name = storeName(x);
      let g = groups.find(function (gr) { return gr.store === name; });
      if (!g) { g = { store: name, host: hostLabel(x.product.url), lines: [] }; groups.push(g); }
      g.lines.push({ line: l, item: x });
    });
    return groups;
  }
  // Estimated totals: only USD prices we have; anything else is counted and named, never guessed.
  function cartTotals(entries) {
    const t = { items: 0, usd: 0, priced: 0, unpriced: 0, otherCurrency: 0, unverified: 0 };
    entries.forEach(function (e) {
      const q = e.line.qty || 1, pr = e.item.product;
      t.items += q;
      if (!pr.price) { t.unpriced += q; return; }
      if (pr.price.currency !== 'USD') { t.otherCurrency += q; return; }
      t.usd += pr.price.amount * q; t.priced += q;
      if (!(pr.status && pr.status.priceVerified)) t.unverified += q;
    });
    return t;
  }
  function usd(n) { return formatPrice({ amount: Math.round(n * 100) / 100, currency: 'USD' }); }
  function priceNote(pr) {
    if (!pr.price) return '<span class="muted">Price not confirmed</span>';
    return esc(formatPrice(pr.price)) + ' <span class="approx">' + (pr.status && pr.status.priceVerified ? 'from the store’s page, ' + esc(fmtDate(pr.status.checkedAt)) : 'from search — not verified') + '</span>';
  }
  function totalsBlock(t) {
    return '<dl class="cart-sum">' +
      '<div><dt>Items</dt><dd>' + t.items + '</dd></div>' +
      '<div class="cart-sum-total"><dt>Estimated subtotal</dt><dd>' + (t.priced ? usd(t.usd) : '—') + '</dd></div></dl>' +
      '<p class="fine">' + [
        t.unverified ? t.unverified + ' price' + (t.unverified === 1 ? ' comes' : 's come') + ' from search and ' + (t.unverified === 1 ? 'isn’t' : 'aren’t') + ' verified' : '',
        t.unpriced ? t.unpriced + ' item' + (t.unpriced === 1 ? ' has' : 's have') + ' no confirmed price and ' + (t.unpriced === 1 ? 'isn’t' : 'aren’t') + ' included' : '',
        t.otherCurrency ? t.otherCurrency + ' item' + (t.otherCurrency === 1 ? ' is' : 's are') + ' priced in another currency and not included' : '',
        'Taxes, shipping and final prices are set by each store at checkout'
      ].filter(Boolean).join('. ') + '.</p>';
  }

  function viewCart() {
    const groups = cartGroups();
    const head = '<div class="page-head"><div><p class="eyebrow">Your cart</p><h1 tabindex="-1">Your cart</h1>' +
      '<p class="muted">Pieces you picked, grouped by store. This list is saved on this device only — nothing is added to a store’s cart until you check out there.</p></div></div>';
    if (!groups.length) {
      return '<div class="container page">' + head +
        '<div class="empty"><h2>Your cart is empty</h2><p>Add pieces from your picks with “Add to cart.”</p><a class="btn btn-primary" href="#/matches">Go to my picks</a></div></div>';
    }
    const all = [].concat.apply([], groups.map(function (g) { return g.lines; }));
    return '<div class="container page">' + head +
      '<div class="cart-layout"><div class="cart-groups">' +
        groups.map(function (g, gi) {
          const t = cartTotals(g.lines);
          return '<section class="cart-store card" aria-labelledby="store-' + gi + '">' +
            '<div class="cart-store-head"><h2 id="store-' + gi + '">' + esc(g.store) + '</h2><span class="fine">' + esc(g.host) + ' · ' + t.items + ' item' + (t.items === 1 ? '' : 's') + (t.priced ? ' · about ' + usd(t.usd) : '') + '</span></div>' +
            '<ul class="cart-lines">' + g.lines.map(function (e) { return cartLineRow(e); }).join('') + '</ul></section>';
        }).join('') +
      '</div>' +
      '<aside class="cart-aside card" aria-label="Cart summary"><h2>Summary</h2>' + totalsBlock(cartTotals(all)) +
        '<a class="btn btn-primary cart-go" href="#/checkout">Continue to checkout</a>' +
        '<button type="button" class="btn btn-text danger" id="cart-clear" data-action="cart-clear">Clear cart</button></aside>' +
      '</div></div>';
  }

  function cartLineRow(e) {
    const l = e.line, x = e.item, pr = x.product, id = esc(l.id), key = l.id.replace(/[^a-z0-9-]/gi, '_');
    const q = l.qty || 1;
    const others = (pr.comparison || []).filter(function (o) { return !o.primary && o.match === 'same'; });
    return '<li class="cart-line">' +
      productThumb(pr, 'cart-thumb') +
      '<div class="cart-info">' +
        '<p class="item-brand">' + esc(x.brand.name) + (x.demo ? ' <span class="demo-chip">Demo example</span>' : '') + '</p>' +
        '<h3><a href="' + esc(pr.url) + '" target="_blank" rel="noopener noreferrer">' + esc(pr.name) + ext + '</a></h3>' +
        '<p class="item-meta">' + esc(SB.label('categories', pr.category)) + (pr.color ? ' · Color: ' + esc(pr.color) : '') + '</p>' +
        '<div class="cart-controls">' +
          '<label class="cart-field" for="size-' + key + '"><span>Size</span><input id="size-' + key + '" data-change="cart-size" data-id="' + id + '" maxlength="16" value="' + esc(l.size || '') + '" placeholder="Choose at store"></label>' +
          '<div class="cart-field"><span id="qty-l-' + key + '">Quantity</span><div class="qty" role="group" aria-labelledby="qty-l-' + key + '">' +
            '<button type="button" id="qty-dn-' + key + '" data-action="cart-qty" data-id="' + id + '" data-delta="-1" aria-label="One fewer"' + (q <= 1 ? ' disabled' : '') + '>−</button>' +
            '<output aria-live="polite">' + q + '</output>' +
            '<button type="button" id="qty-up-' + key + '" data-action="cart-qty" data-id="' + id + '" data-delta="1" aria-label="One more"' + (q >= 9 ? ' disabled' : '') + '>+</button></div></div>' +
        '</div>' +
        (pr.sizeCheck ? sizeLine(pr) : '') +
        (others.length ? '<p class="fine">Also found at: ' + others.map(function (o) { return '<a href="' + esc(o.url) + '" target="_blank" rel="noopener noreferrer">' + esc(o.seller) + ext + '</a>' + (o.price ? ' ' + esc(formatPrice(o.price)) + (o.priceFrom === 'page' ? '' : ' (from search)') : ''); }).join(' · ') + '</p>' : '') +
        '<p class="cart-line-actions"><button type="button" class="btn-link" id="cart-save-' + key + '" data-action="cart-save" data-id="' + id + '">Move to saved</button>' +
          '<button type="button" class="btn-link danger" id="cart-rm-' + key + '" data-action="cart-remove" data-id="' + id + '">Remove</button></p>' +
      '</div>' +
      '<div class="cart-price"><p class="price">' + priceNote(pr) + '</p>' + (pr.price && q > 1 ? '<p class="fine">' + q + ' × ' + esc(formatPrice(pr.price)) + ' = ' + esc(formatPrice({ amount: pr.price.amount * q, currency: pr.price.currency })) + '</p>' : '') + '</div>' +
      '</li>';
  }

  // One-step payment, laid out as the finished feature. It's a preview: no address or card fields are collected,
  // and "Place order" stays disabled (screen readers are told why).
  function payHereSection(groups, all) {
    const t = cartTotals(all);
    const rows = groups.map(function (g) {
      const st = cartTotals(g.lines);
      return '<div><dt>' + esc(g.store) + ' <span class="fine">· ' + st.items + ' item' + (st.items === 1 ? '' : 's') + '</span></dt><dd>' + (st.priced ? usd(st.usd) : 'Price at store') + '</dd></div>';
    }).join('');
    return '<section class="card co-pay" aria-labelledby="co-pay-title">' +
      '<h2 id="co-pay-title">Pay for everything here</h2>' +
      '<p class="muted">One payment for all ' + groups.length + ' store' + (groups.length === 1 ? '' : 's') + '. We place each order with the store and send you a single confirmation.</p>' +
      '<div class="co-pay-grid">' +
        '<div class="co-block"><h3>Ship to</h3><div class="co-row" aria-disabled="true"><span>Add a shipping address</span><span class="co-chev" aria-hidden="true">›</span></div></div>' +
        '<div class="co-block"><h3>Payment</h3><div class="co-methods" aria-disabled="true">' +
          '<span class="co-method on">Card</span><span class="co-method">Apple Pay</span><span class="co-method">PayPal</span></div></div>' +
      '</div>' +
      '<dl class="co-totals">' + rows +
        '<div><dt>Shipping</dt><dd>Set by each store</dd></div>' +
        '<div><dt>Estimated tax</dt><dd>Calculated at order</dd></div>' +
        '<div class="co-total"><dt>Total</dt><dd>' + (t.priced ? usd(t.usd) : '—') + '</dd></div></dl>' +
      '<button type="button" class="btn btn-primary co-place" disabled>Place order' + (t.priced ? ' · ' + usd(t.usd) : '') + '<span class="sr-only"> (not available in this preview)</span></button>' +
      '<p class="fine">Each store’s own terms, shipping and return policies apply.</p>' +
      '</section>';
  }

  function viewCheckout() {
    const groups = cartGroups();
    if (!groups.length) return emptyState('Nothing to check out yet', 'Add pieces to your cart from your picks first.', '#/matches', 'Go to my picks');
    const all = [].concat.apply([], groups.map(function (g) { return g.lines; }));
    const bought = all.filter(function (e) { return e.line.purchased; }).length;
    const steps = '<ol class="co-steps" aria-label="Checkout steps"><li class="done"><a href="#/cart">Cart</a></li><li class="current" aria-current="step">Review by store</li><li>Pay</li></ol>';
    return '<div class="container page">' +
      '<div class="page-head"><div><p class="eyebrow">Checkout</p><h1 tabindex="-1">Check out</h1>' +
      '<p class="muted">Your items come from ' + groups.length + ' store' + (groups.length === 1 ? '' : 's') + '. Buy each one on the store’s own site, or pay for everything at once below.</p></div></div>' +
      steps +
      (bought === all.length ? '<p class="flash" role="status">You’ve marked everything as bought. <button type="button" class="btn-link" id="co-clear-bought" data-action="cart-clear-bought">Clear bought items from your cart</button></p>' : '') +
      '<div class="cart-layout"><div class="cart-groups">' +
        groups.map(function (g, gi) {
          const t = cartTotals(g.lines);
          return '<section class="cart-store card" aria-labelledby="co-store-' + gi + '">' +
            '<div class="cart-store-head"><h2 id="co-store-' + gi + '">' + esc(g.store) + '</h2><span class="fine">' + t.items + ' item' + (t.items === 1 ? '' : 's') + (t.priced ? ' · about ' + usd(t.usd) + ' before tax and shipping' : '') + '</span></div>' +
            '<ul class="co-lines">' + g.lines.map(function (e) {
              const l = e.line, pr = e.item.product, key = l.id.replace(/[^a-z0-9-]/gi, '_');
              return '<li class="co-line' + (l.purchased ? ' is-bought' : '') + '">' + productThumb(pr, 'cart-thumb small') +
                '<div class="cart-info"><h3>' + esc(pr.name) + '</h3>' +
                  '<p class="item-meta">' + (l.size ? 'Size ' + esc(l.size) : 'Size: choose at the store') + ' · Qty ' + (l.qty || 1) + (pr.color ? ' · ' + esc(pr.color) : '') + '</p>' +
                  '<p class="price">' + priceNote(pr) + '</p></div>' +
                '<div class="co-actions"><a class="btn btn-small btn-primary" href="' + esc(pr.url) + '" target="_blank" rel="noopener noreferrer">Buy at ' + esc(g.store) + ext + '</a>' +
                  '<label class="check" for="bought-' + key + '"><input type="checkbox" id="bought-' + key + '" data-change="cart-bought" data-id="' + esc(l.id) + '"' + (l.purchased ? ' checked' : '') + '> I bought this</label></div>' +
                '</li>';
            }).join('') + '</ul>' +
            '<p class="fine">On the store’s page, pick size ' + (g.lines.some(function (e) { return e.line.size; }) ? 'and quantity as listed above' : 'and quantity') + ', then add it to that store’s cart and pay there. Check returns and shipping before you buy.</p></section>';
        }).join('') +
        payHereSection(groups, all) +
      '</div>' +
      '<aside class="cart-aside card" aria-label="Order summary"><h2>Order summary</h2>' + totalsBlock(cartTotals(all)) +
        '<p class="co-progress"><strong>' + bought + ' of ' + all.length + '</strong> product' + (all.length === 1 ? '' : 's') + ' bought</p>' +
        '<div class="co-bar" aria-hidden="true"><span style="width:' + Math.round(100 * bought / all.length) + '%"></span></div>' +
        '<a class="btn btn-outline cart-go" href="#/cart">Back to cart</a></aside>' +
      '</div></div>';
  }

  // ---------- BRAND GUIDE ----------
  // Product photos for a brand from our hand-checked listings, each linking to its product page and labeled
  // with the check date. Brands without checked listings stay text-only (with the official-site link).
  function dirShots(b) {
    const list = SB.engine.productsForBrand(b.id).filter(function (pr) { return pr.image && pr.image.url; }).slice(0, 3);
    if (!list.length) return '';
    return '<ul class="shot-list small-shots" aria-label="Products from ' + esc(plain(b.name)) + '">' + list.map(function (pr) {
      return '<li><a href="' + esc(pr.url) + '" target="_blank" rel="noopener noreferrer">' + productThumb(pr, 'shot-img') +
        '<span class="shot-name">' + esc(pr.name) + '<span class="sr-only"> (opens in a new tab)</span></span></a>' +
        (pr.price && pr.status.priceVerified ? '<span class="shot-price">' + esc(formatPrice(pr.price)) + '</span>' : '') + '</li>';
    }).join('') + '</ul><p class="fine">Product pages checked by hand ' + esc(fmtDate(list[0].status.checkedAt)) + '. Not live listings — prices and stock may have changed.</p>';
  }
  function viewBrands() {
    const f = sess.dirFilters || (sess.dirFilters = SB.engine.defaultDirFilters());
    const list = SB.engine.filterDirectory(f);
    const sel = function (id, label, group, value, only) { return '<div class="filter-field">' + vocabSelect(id, label, group, value, 'dir-filter', only) + '</div>'; };
    const tiers = SB.vocab.budgets.map(function (o) {
      return '<label class="check" for="d-tier-' + o.id + '"><input type="checkbox" id="d-tier-' + o.id + '" value="' + o.id + '" data-change="dir-tier"' + (f.tiers.indexOf(o.id) !== -1 ? ' checked' : '') + '> <span><b>' + o.short + '</b> ' + o.label + '</span></label>';
    }).join('');
    const radio = function (name, key, options) {
      return options.map(function (c) {
        const id = 'd-' + name + '-' + (c[0] || 'any');
        return '<label class="check" for="' + id + '"><input type="radio" name="' + name + '" id="' + id + '" value="' + c[0] + '" data-change="dir-radio" data-key="' + key + '"' + (f[key] === c[0] ? ' checked' : '') + '> ' + c[1] + '</label>';
      }).join('');
    };
    const counts = {
      total: SB.brands.length, us: SB.usBrands.length,
      cn: SB.brands.filter(function (b) { return b.country === 'CN'; }).length,
      usBased: SB.brands.filter(function (b) { return b.country === 'US'; }).length,
      intl: SB.brands.filter(function (b) { return b.country !== 'US' && b.usAvailability === 'yes'; }).length,
      regions: usedValues(SB.brands, 'country').length,
      links: SB.brands.filter(function (b) { return b.linkStatus === 'verified'; }).length
    };
    const rows = list.map(function (b) {
      return '<article class="dir-card" aria-labelledby="dn-' + b.id + '">' +
        '<div class="dir-head"><div class="monogram small" style="background:' + brandTone(b.id) + '" aria-hidden="true">' + esc(monogram(b.name)) + '</div>' +
        '<div><h3 id="dn-' + b.id + '">' + esc(b.name) + (b.nameZh ? ' <span class="zh" lang="zh">' + esc(b.nameZh) + '</span>' : '') + '</h3><p class="muted small">' + brandMeta(b) + '</p></div>' +
        (b.usAvailability === 'yes' ? saveButton('brands', b.id, b.name) : '') + '</div>' +
        '<p class="small"><span class="segment-tag">' + esc(SB.label('segments', b.segment)) + '</span> ' + esc(b.intro) + '</p>' +
        dirShots(b) +
        '<p class="dir-tags"><span class="tier">' + tierText(b.price.tiers) + '</span> ' + b.styles.map(function (s) { return '<span class="tag">' + esc(SB.label('styles', s)) + '</span>'; }).join('') + '</p>' +
        '<p class="small muted">' + esc(b.categories.slice(0, 4).map(function (c) { return SB.label('categories', c); }).join(' · ')) + (b.sizes.length ? ' · Sizes: ' + esc(b.sizes.map(function (s) { return SB.label('sizes', s); }).join(', ')) : '') + '</p>' +
        '<div class="dir-foot">' + (b.officialUrl ? '<a href="' + esc(b.officialUrl) + '" target="_blank" rel="noopener noreferrer">Official site' + ext + '</a>' : '<span class="small muted">No official link on file</span>') +
        linkBadge(b) + '<span class="status">' + esc(storeStatusText(b)) + '</span></div>' +
      '</article>';
    }).join('');
    return '<div class="container page">' +
      '<div class="page-head"><div><p class="eyebrow">Brand guide</p><h1 tabindex="-1">Explore ' + counts.total + ' brands</h1>' +
      '<p class="muted">An editorial guide to brands from ' + counts.regions + ' countries, from accessible basics to luxury houses and independent designers: ' +
        SB.vocab.segments.map(function (s) { return SB.brands.filter(function (b) { return b.segment === s.id; }).length + ' ' + s.label.toLowerCase(); }).join(', ') +
        '. It doesn’t cover every brand, and not every international brand ships to the US. ' + counts.links + ' official links passed our automated check; ' +
        Object.keys(SB.productsByBrand).length + ' brands have verified product listings.</p></div>' +
      '<button type="button" class="btn btn-outline btn-small" id="dl-csv" data-action="download-csv">Download as CSV</button></div>' +
      '<p class="data-note"><strong>Editorial info:</strong> style tags, price levels, size ranges and store notes are editorial estimates, not verified. Link checks were automated on ' + esc(fmtDate(SB.catalogMeta.linkChecksAt)) + '.</p>' +
      '<div class="matches-layout">' +
        '<aside class="filters" aria-label="Brand filters"><details id="dir-filters"' + ((sess.open['dir-filters'] === undefined ? window.innerWidth >= 900 : sess.open['dir-filters']) ? ' open' : '') + '><summary>Filters</summary><div class="filters-body">' +
          '<div class="filter-field"><label for="d-q">Search</label><input id="d-q" type="search" value="' + esc(f.q) + '" placeholder="Name, e.g. 李宁 or Gap" data-change="dir-filter" data-key="q" autocomplete="off"></div>' +
          sel('d-country', 'Brand from', 'countries', f.country, usedValues(SB.brands, 'country')) +
          sel('d-segment', 'Market segment', 'segments', f.segment) +
          '<div class="filter-field"><label for="d-availability">US availability</label><select id="d-availability" data-change="dir-filter" data-key="availability"><option value="">Any</option>' +
            SB.vocab.usAvailability.map(function (o) { return '<option value="' + o.id + '"' + (f.availability === o.id ? ' selected' : '') + '>' + esc(o.label) + '</option>'; }).join('') + '</select></div>' +
          sel('d-style', 'Style', 'styles', f.style) + sel('d-category', 'Category', 'categories', f.category) + sel('d-size', 'Size range', 'sizes', f.size) +
          '<fieldset class="filter-group"><legend>Price per piece</legend>' + tiers + '</fieldset>' +
          '<fieldset class="filter-group"><legend>Where to shop</legend>' + radio('dch', 'channel', [['', 'Anywhere'], ['online', 'Online'], ['stores', 'In stores']]) + '</fieldset>' +
          '<fieldset class="filter-group"><legend>Official link</legend>' + radio('dlink', 'link', [['', 'Any'], ['verified', 'Link checked'], ['unverified', 'Not verified']]) + '</fieldset>' +
          '<fieldset class="filter-group"><legend>Product listings</legend>' + radio('dprod', 'products', [['', 'Any'], ['yes', 'Has verified listings']]) + '</fieldset>' +
          '<button type="button" class="btn btn-text" id="reset-dir" data-action="reset-dir">Reset filters</button>' +
        '</div></details></aside>' +
        '<div class="results"><p class="result-count" role="status">' + list.length + ' brand' + (list.length === 1 ? '' : 's') + '</p>' +
          (list.length ? '<div class="dir-grid">' + rows + '</div>' : '<div class="empty small"><h2>No brands match</h2><p>Try removing a filter.</p><button type="button" class="btn btn-outline" id="reset-dir-empty" data-action="reset-dir">Reset filters</button></div>') +
        '</div>' +
      '</div></div>';
  }

  function catalogCsv() {
    const cols = ['id', 'name', 'nameZh', 'country', 'segment', 'usAvailability', 'styles', 'categories', 'sizes', 'priceTiers', 'priceStatus', 'officialUrl', 'linkStatus', 'linkCheckedAt', 'online', 'hasStores', 'storesStatus', 'verifiedProductListings', 'source', 'lastVerified'];
    const cell = function (v) { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const lines = [cols.join(',')].concat(SB.engine.filterDirectory(sess.dirFilters || SB.engine.defaultDirFilters()).map(function (b) {
      return [b.id, b.name, b.nameZh || '', b.country, b.segment, b.usAvailability, b.styles.join('|'), b.categories.join('|'), b.sizes.join('|'), b.price.tiers.join('|'), b.price.status,
        b.officialUrl, b.linkStatus, b.linkCheckedAt, b.online, b.hasStores, b.stores.status, SB.engine.productsForBrand(b.id).length, b.source, b.lastVerified].map(cell).join(',');
    }));
    return '﻿' + lines.join('\r\n');
  }

  // ---------- PRIVACY ----------
  function viewPrivacy() {
    const nPhotos = sess.photos.length;
    const nFav = S.state.favorites.brands.length + S.state.favorites.items.length;
    const feat = SB.services.status.features;
    const linkCount = SB.brands.filter(function (b) { return b.linkStatus === 'verified'; }).length;
    const rows = [
      ['Brand list & style tags', 'Written by our editors for this demo', 'Not verified; brands change over time'],
      ['Official links', linkCount + ' of ' + SB.brands.filter(function (b) { return b.officialUrl; }).length + ' passed an automated check (' + esc(fmtDate(SB.catalogMeta.linkChecksAt)) + ')', 'Many big retailers block automated checks, so “not verified” doesn’t mean wrong'],
      ['Prices', 'Rough price levels ($–$$$$) and editorial estimates', 'Not live prices; check the official site'],
      ['Your picks', feat.webSearch ? 'Found for your profile by AI web search (OpenAI), with cited sources; product pages are re-checked by our server where the site allows it' : 'Not available: personalized search isn’t turned on for this server', 'Prices, stock and shipping are unverified unless the card says our page check confirmed them. Never live inventory'],
      ['Demo examples', SB.products.length + ' product pages from ' + Object.keys(SB.productsByBrand).length + ' brands, checked by hand (' + esc(fmtDate(SB.catalogMeta.productChecksAt)) + '). Shown only if you choose “Show demo examples,” and in the brand guide', 'Not personalized and not live — price and stock can change'],
      ['Store info', 'General notes; no addresses stored', feat.stores ? 'ZIP lookup uses Google Places results, which can be out of date' : 'ZIP store lookup isn’t connected yet'],
      ['Photo analysis', feat.vision ? 'Colors on your device; optional AI garment analysis on our server' : 'Colors only, on your device', feat.vision ? 'AI results are suggestions you can edit' : 'AI garment & fit detection isn’t connected']
    ];
    return '<div class="container narrow page">' +
      '<p class="eyebrow">Privacy & your data</p><h1 tabindex="-1">Your data stays with you</h1>' +
      '<p class="lead small-lead">Style Bridge works without an account. Here’s exactly what we use, where it lives, and how to delete it.</p>' +
      (sess.flash ? '<p class="flash" role="status">' + esc(sess.flash) + '</p>' : '') +
      '<div class="privacy-grid">' +
        '<section class="card"><h2>What we use</h2><ul><li>Brands you type in</li><li>The tags in your style profile, including suggestions you didn’t remove</li><li>Color names and clothing tags from your photos (like “Earth tones”)</li><li>Style details (like “wide-leg trousers”)</li><li>Optional: your ZIP code or city and state, and the sizes, height and weight you type in</li><li>Your “More like this” / “Not for me” feedback</li><li>Brands and products you save, and items in your cart</li></ul></section>' +
        '<section class="card"><h2>Your photos</h2><ul><li>Colors are read inside your browser; that step never uploads anything</li>' +
          (feat.vision ? '<li>Only if you choose “Analyze clothing with AI” is that one photo sent to our server and on to our AI provider (' + visionProviderName() + ') for clothing tags. It isn’t saved on our server.</li>' : '<li>AI photo analysis is not connected, so photos never leave your device</li>') +
          '<li>Not saved: gone when you remove them, refresh or close the tab</li><li>Never used to identify you or guess your age, ethnicity, body, health or income</li><li>Never shared for marketing</li></ul></section>' +
        '<section class="card"><h2>Where it’s stored</h2><p>Your profile, feedback, saved items and cart are kept in this browser’s local storage on this device. There are no accounts, and nothing syncs to other devices.</p>' +
          (feat.webSearch ? '<p>When you open Your picks, the tags in your style profile (brands, styles, categories, fit, colors, occasions, size ranges, style details, patterns), your budget and region, and brands you marked “More like this” or “Not for me” are sent to our server and to OpenAI to run the search. If you entered them, your ZIP code or city and state (United States region only) and your clothing sizes, shoe size and height are sent too. Photos, street addresses and your weight are never sent, and our server doesn’t log your location or sizes. The search runs again when your profile changes. The latest results are saved on this device for 24 hours; deleting your profile or everything clears them.</p>' : '') +
          '<p>You can remove your location and size info anytime with the “Remove” buttons in your style profile.</p></section>' +
        '<section class="card"><h2>What we never do</h2><ul><li>Guess your budget. We only use a budget you set.</li><li>Guess your size from photos, height or weight, or say an item will fit you.</li><li>Ask for or send a street address. If a future checkout needs one, it would go only to that retailer, and only when you choose to continue.</li><li>Infer income from photos, looks, background or where you live.</li><li>Sell or share your information.</li></ul></section>' +
      '</div>' +
      '<section class="danger-zone" aria-labelledby="delete-title"><h2 id="delete-title">Delete your data</h2>' +
        '<div class="delete-row"><div><h3>Photos in this session</h3><p class="muted small">' + (nPhotos ? nPhotos + ' photo' + (nPhotos > 1 ? 's' : '') + ' in memory' : 'No photos right now') + '. Color names already added to your profile stay until you remove them there or delete your profile.</p></div><button type="button" class="btn btn-outline danger" id="del-photos" data-action="delete-photos"' + (nPhotos ? '' : ' disabled') + '>Delete photos</button></div>' +
        '<div class="delete-row"><div><h3>Style profile & answers</h3><p class="muted small">' + (S.state.profile || S.state.inputs.brands.length ? 'Your brands, answers, photo tags, location and size info, feedback and profile' : 'Nothing saved') + '</p></div><button type="button" class="btn btn-outline danger" id="del-profile" data-action="delete-profile"' + (S.state.profile || S.state.inputs.brands.length ? '' : ' disabled') + '>Delete profile</button></div>' +
        '<div class="delete-row"><div><h3>Saved brands & products</h3><p class="muted small">' + (nFav ? nFav + ' saved' : 'Nothing saved') + '</p></div><button type="button" class="btn btn-outline danger" id="del-favs" data-action="delete-favorites"' + (nFav ? '' : ' disabled') + '>Delete saved</button></div>' +
        '<div class="delete-row all"><div><h3>Everything</h3><p class="muted small">Removes all Style Bridge data from this browser.</p></div><button type="button" class="btn btn-danger" id="del-all" data-action="delete-all">Delete everything</button></div>' +
      '</section>' +
      '<section id="data" class="section-tight" aria-labelledby="data-title"><h2 id="data-title">About our data</h2>' +
        '<p class="muted">This is a demo. We’d rather be clear about what’s real than pretend.</p>' +
        '<div class="table-wrap"><table><thead><tr><th scope="col">Information</th><th scope="col">What it is</th><th scope="col">Keep in mind</th></tr></thead><tbody>' +
        rows.map(function (r) { return '<tr><th scope="row">' + r[0] + '</th><td>' + r[1] + '</td><td>' + r[2] + '</td></tr>'; }).join('') +
        '</tbody></table></div>' +
        '<p class="fine">Brand names and trademarks belong to their owners. Style Bridge isn’t affiliated with or paid by any brand listed.</p>' +
      '</section></div>';
  }

  // ---------- actions ----------
  function setStartError(msg) {
    const el = document.getElementById('start-error');
    if (el) el.textContent = msg || '';
  }

  function addBrand(text) {
    const err = document.getElementById('brand-error');
    const input = document.getElementById('brand-input');
    const value = text.trim().replace(/\s+/g, ' ');
    if (!value) { err.textContent = 'Type a brand name first.'; input.setAttribute('aria-invalid', 'true'); input.focus(); return; }
    if (value.length > 40) { err.textContent = 'That name is too long. Try 40 characters or fewer.'; input.focus(); return; }
    const hb = SB.engine.findHomeBrand(value);
    const list = S.state.inputs.brands;
    const dup = list.some(function (b) { return hb ? b.id === hb.id : !b.id && b.name.toLowerCase() === value.toLowerCase(); });
    if (dup) { err.textContent = 'You’ve already added ' + (hb ? plain(hb.name) : value) + '.'; input.focus(); return; }
    if (list.length >= 12) { err.textContent = 'You can add up to 12 brands.'; return; }
    list.push(hb ? { id: hb.id, name: hb.name } : { id: null, name: value });
    S.save();
    render({ keepFocus: true, fallbackFocus: 'brand-input' });
    const fresh = document.getElementById('brand-input');
    if (fresh) { fresh.value = ''; fresh.focus(); }
  }

  // A style detail typed by the user, e.g. "wide-leg trousers". Kept in inputs too, so rebuilding the profile keeps it.
  function addDetail(text) {
    const err = document.getElementById('detail-error');
    const value = text.trim().replace(/\s+/g, ' ');
    const p = S.state.profile;
    if (!/[\p{L}\p{N}]{2}/u.test(value)) { err.textContent = 'Type a short detail first, like “wide-leg trousers.”'; document.getElementById('detail-input').focus(); return; }
    if (value.length > 40) { err.textContent = 'Keep it to 40 characters or fewer.'; return; }
    const id = SB.engine.detailId('detail', value);
    if ((p.details || []).some(function (d) { return d.id === id; })) { err.textContent = 'That detail is already in your profile.'; return; }
    if ((p.details || []).length >= 12) { err.textContent = 'You can add up to 12 details.'; return; }
    editInputs(function (inputs) {
      inputs.details = (inputs.details || []).concat(value);
      if (inputs.removed && inputs.removed.details) inputs.removed.details = inputs.removed.details.filter(function (x) { return x !== id; });
    }, 'detail-input');
    const box = document.getElementById('detail-input');
    if (box) { box.value = ''; box.focus(); }
    announce('Added ' + value + ' to your style details.');
  }

  function handlePhotoFiles(files) {
    const msgs = [];
    // Photos that failed to load don't take up a slot.
    const usable = function () { return sess.photos.filter(function (p) { return p.status !== 'error'; }).length; };
    Array.from(files).forEach(function (file) {
      if (usable() >= MAX_PHOTOS) { msgs.push('You can add up to ' + MAX_PHOTOS + ' photos. Remove one to add another.'); return; }
      if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) { msgs.push('“' + file.name + '” isn’t a supported image. Try a JPG, PNG or WebP.'); return; }
      if (file.size > MAX_PHOTO_MB * 1024 * 1024) { msgs.push('“' + file.name + '” is larger than ' + MAX_PHOTO_MB + ' MB.'); return; }
      const photo = { id: 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: file.name, file: file, url: URL.createObjectURL(file), status: 'reading', families: [], swatches: [] };
      sess.photos.push(photo);
      SB.services.styleAnalysis.readPhotoColors(file).then(function (res) {
        photo.status = 'done'; photo.families = res.families; photo.swatches = res.swatches;
      }).catch(function () {
        photo.status = 'error'; photo.error = 'We couldn’t read this photo. Try a different JPG or PNG.';
      }).then(function () {
        if (currentRoute().name === 'start' && sess.step === 2) render({ keepFocus: true });
      });
    });
    // Keep the message in state so it survives the re-render when each photo finishes reading.
    sess.photoError = msgs.length ? Array.from(new Set(msgs)).join(' ') : '';
    render({ keepFocus: true, fallbackFocus: 'photo-input' });
    if (sess.photoError) announce(sess.photoError);
  }

  function removePhoto(id) {
    const i = sess.photos.findIndex(function (p) { return p.id === id; });
    if (i !== -1) {
      if (sess.photos[i].url) URL.revokeObjectURL(sess.photos[i].url);
      sess.photos.splice(i, 1);
    }
  }
  function removeAllPhotos() {
    sess.photos.forEach(function (p) { if (p.url) URL.revokeObjectURL(p.url); });
    sess.photos = [];
  }

  // A photo the AI analyzed gives clothing-only colors, so its on-device reading (which can't tell clothes
  // from the background) isn't used.
  function aiAnalyzed(p) { return !!(p.ai && p.ai.status === 'done' && p.ai.tags && p.ai.tags.clothingVisible); }

  // The colors that show up most across the photos without AI analysis (each lists its colors from most to least common).
  function photoColors() {
    const score = {};
    sess.photos.filter(function (p) { return !aiAnalyzed(p); }).forEach(function (p) {
      (p.families || []).forEach(function (f, i) { score[f] = (score[f] || 0) + (3 - Math.min(i, 2)); });
    });
    return Object.keys(score).sort(function (a, b) { return score[b] - score[a]; }).slice(0, 3);
  }

  // Profiles saved before tags were on by default: carry over what the user added and removed.
  function migrateProfile() {
    const p = S.state.profile, inputs = S.state.inputs;
    if (!p || p.v === 2) return;
    inputs.removed = {}; inputs.personal = inputs.personal || {};
    ['styles', 'categories', 'colors', 'fits', 'occasions'].forEach(function (g) {
      (p[g] || []).forEach(function (x) { if (x.source === 'user' && inputs.quiz[g].indexOf(x.id) === -1) inputs.quiz[g].push(x.id); });
    });
    const fresh = SB.engine.buildProfile(inputs);
    ['styles', 'categories', 'colors', 'fits', 'occasions', 'details'].forEach(function (g) {
      const had = (p[g] || []).map(function (x) { return x.id; });
      const gone = (fresh[g] || []).filter(function (x) { return had.indexOf(x.id) === -1; }).map(function (x) { return x.id; });
      if (gone.length) inputs.removed[g] = gone;
    });
    rebuildProfile();
    S.save();
  }

  // Turning a tag off records it as removed so a rebuild never brings it back; turning it on makes it yours.
  function toggleTag(group, id) {
    const on = (S.state.profile[group] || []).some(function (x) { return x.id === id; });
    editInputs(function (inputs) {
      const q = inputs.quiz, removed = inputs.removed = inputs.removed || {};
      removed[group] = (removed[group] || []).filter(function (x) { return x !== id; });
      if (on) { q[group] = q[group].filter(function (x) { return x !== id; }); removed[group].push(id); }
      else if (q[group].indexOf(id) === -1) q[group].push(id);
    }, 'tag-' + group + '-' + id);
    announce(SB.label(group, id) + (on ? ' removed.' : ' added.'));
  }

  function confirmDelete(message) {
    return window.confirm(message);
  }

  function confirmDelete(message) {
    return window.confirm(message);
  }

  document.addEventListener('click', function (e) {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const a = el.dataset.action;
    sess.flash = null;

    switch (a) {
      case 'goto-step':
        sess.step = Number(el.dataset.step);
        if (currentRoute().name === 'start') render({ keepFocus: false });
        else go('/start');
        break;
      case 'open-profile':
        openProfile();
        break;
      case 'toggle-tag':
        toggleTag(el.dataset.group, el.dataset.id);
        break;
      case 'remove-detail': {
        const d = (S.state.profile.details || []).find(function (x) { return x.id === el.dataset.id; });
        if (!d) break;
        editInputs(function (inputs) {
          if (d.source === 'user') inputs.details = (inputs.details || []).filter(function (t) { return SB.engine.detailId('detail', t) !== d.id; });
          const removed = inputs.removed = inputs.removed || {};
          removed.details = (removed.details || []).filter(function (x) { return x !== d.id; }).concat(d.id);
        }, 'detail-input');
        if (!document.getElementById(el.id)) document.getElementById('detail-input').focus();
        announce(d.text + ' removed.');
        break;
      }
      case 'restore-removed':
        editInputs(function (inputs) { inputs.removed = {}; }, 'h-style');
        announce('Suggestions turned back on.');
        break;
      case 'clear-location':
        editInputs(function (inputs) { ['zip', 'city', 'state'].forEach(function (k) { delete inputs.personal[k]; }); }, 'pd-zip');
        document.getElementById('pd-zip').focus();
        announce('Your location was removed.');
        break;
      case 'clear-sizing':
        editInputs(function (inputs) {
          ['tops', 'bottoms', 'dresses', 'shoeSize', 'shoeSystem', 'heightFt', 'heightIn', 'heightCm', 'heightUnit', 'weight', 'weightUnit'].forEach(function (k) { delete inputs.personal[k]; });
        }, 'pd-tops');
        document.getElementById('pd-tops').focus();
        announce('Your size info was removed.');
        break;
      case 'add-popular': {
        const hb = SB.engine.homeBrandById(el.dataset.id);
        if (hb && !S.state.inputs.brands.some(function (b) { return b.id === hb.id; })) {
          S.state.inputs.brands.push({ id: hb.id, name: hb.name });
          S.save();
        }
        render({ keepFocus: true, fallbackFocus: 'brand-input' });
        break;
      }
      case 'remove-brand':
        S.state.inputs.brands.splice(Number(el.dataset.index), 1);
        S.save();
        render({ keepFocus: true, fallbackFocus: 'brand-input' });
        break;
      case 'remove-photo':
        removePhoto(el.dataset.id);
        sess.photoError = '';
        render({ keepFocus: true, fallbackFocus: 'photo-input' });
        break;
      case 'remove-all-photos':
        removeAllPhotos();
        sess.photoError = '';
        render({ keepFocus: true, fallbackFocus: 'photo-input' });
        break;
      case 'edit-brands':
        sess.step = 1;
        go('/start');
        break;
      case 'start-over':
        if (confirmDelete('Start over? This deletes your style profile and answers on this device. Saved items stay.')) {
          S.clearProfile();
          removeAllPhotos();
          resetWeb();
          sess.step = 1;
          go('/start');
        }
        break;
      case 'web-search':
        runWebSearch(false);
        break;
      case 'show-demo':
        sess.showDemo = true;
        render({ keepFocus: true });
        document.getElementById('demo-title').focus();
        announce('Showing demo examples. They are not personalized and not live.');
        break;
      case 'hide-demo':
        sess.showDemo = false;
        render({ keepFocus: true, fallbackFocus: document.getElementById('show-demo') ? 'show-demo' : 'picks-title' });
        if (document.getElementById('show-demo')) document.getElementById('show-demo').focus();
        break;
      case 'web-feedback': {
        const name = el.dataset.name, k = String(name).toLowerCase();
        const wf = S.state.webFeedback = S.state.webFeedback || {};
        const cur = wf[k] && wf[k].value;
        if (!el.dataset.value || cur === el.dataset.value) delete wf[k];
        else wf[k] = { name: name, value: el.dataset.value };
        S.save();
        const now = wf[k] && wf[k].value;
        render({ keepFocus: true, fallbackFocus: currentRoute().name === 'profile' ? 'h-feedback' : 'pp-title' });
        announce(now === 'more' ? 'Got it. Your next search will look for more like ' + name + '.'
          : now === 'less' ? name + ' is hidden and will be left out of your next search.'
          : 'Feedback for ' + name + ' cleared.');
        break;
      }
      case 'compare-retry':
        sess.web.compareStatus = null; sess.web.compareError = null;
        runCompare();
        break;
      case 'toggle-size-out':
        sess.showSizeOut = el.dataset.value === '1';
        render({ keepFocus: true, fallbackFocus: sess.showSizeOut ? 'hide-size-out' : 'show-size-out' });
        announce(sess.showSizeOut ? 'Showing items whose page lists your size as out of stock.' : 'Items out of stock in your size are hidden.');
        break;
      case 'toggle-over':
        sess.showOverBudget = el.dataset.value === '1';
        render({ keepFocus: true, fallbackFocus: sess.showOverBudget ? 'hide-over' : 'show-over' });
        announce(sess.showOverBudget ? 'Showing items over your budget, marked “Over your budget.”' : 'Items over your budget are hidden.');
        break;
      case 'load-sample':
        removeAllPhotos();
        loadSample();
        break;
      case 'reset-dir':
        sess.dirFilters = SB.engine.defaultDirFilters();
        render({ keepFocus: true, fallbackFocus: 'reset-dir' });
        break;
      case 'download-csv': {
        const blob = new Blob([catalogCsv()], { type: 'text/csv;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'style-bridge-brands.csv';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
        announce('Brand list downloaded.');
        break;
      }
      case 'ai-photo': {
        const photo = sess.photos.find(function (p) { return p.id === el.dataset.id; });
        if (!photo || !sess.aiConsent) break;
        photo.ai = { status: 'loading' };
        render({ keepFocus: true, fallbackFocus: 'rm-photo-' + photo.id });
        SB.services.styleAnalysis.describeOutfit(photo.file).then(function (tags) {
          photo.ai = { status: 'done', tags: tags };
        }).catch(function (err) {
          photo.ai = { status: 'error', error: err.message || 'Photo analysis failed. Please try again later.' };
        }).then(function () {
          if (currentRoute().name === 'start' && sess.step === 2) render({ keepFocus: true });
        });
        break;
      }
      case 'toggle-cart': {
        const id = el.dataset.id;
        if (S.cartLine(id)) {
          S.removeFromCart(id);
          render({ keepFocus: true });
          announce('Removed from your cart.');
        } else {
          const snap = cartSnapshot(id);
          if (!snap) { announce('We couldn’t add this item. Try searching again.'); break; }
          const x = snap.raw ? webItem(snap.raw) : { product: SB.engine.productById(snap.demoId) };
          S.addToCart(Object.assign({ id: id, size: defaultSize(x.product.category), color: x.product.color || '' }, snap));
          render({ keepFocus: true });
          announce('Added to your cart. ' + cartCount() + ' item' + (cartCount() === 1 ? '' : 's') + ' in your cart.');
        }
        break;
      }
      case 'cart-qty': {
        const l = S.cartLine(el.dataset.id);
        if (l) S.updateCart(l.id, { qty: Math.max(1, Math.min(9, (l.qty || 1) + Number(el.dataset.delta))) });
        render({ keepFocus: true });
        if (l) announce('Quantity ' + l.qty + '.');
        break;
      }
      case 'cart-remove':
        S.removeFromCart(el.dataset.id);
        render({ keepFocus: true, fallbackFocus: 'cart-clear' });
        announce('Removed from your cart.');
        break;
      case 'cart-save': {
        // Keep it in Saved (with its snapshot), then take it out of the cart.
        const l = S.cartLine(el.dataset.id);
        if (l) {
          if (l.raw) { const snaps = S.state.favorites.webItems = S.state.favorites.webItems || {}; snaps[l.id] = l.raw; }
          if (!S.isFavorite('items', l.id)) S.toggleFavorite('items', l.id);
          S.removeFromCart(l.id);
        }
        render({ keepFocus: true, fallbackFocus: 'cart-clear' });
        announce('Moved to saved.');
        break;
      }
      case 'cart-clear':
        if (confirmDelete('Remove everything from your cart?')) { S.clearCart(); render(); announce('Your cart is empty.'); }
        break;
      case 'cart-clear-bought':
        S.state.cart = S.state.cart.filter(function (l) { return !l.purchased; });
        S.save();
        go(S.state.cart.length ? '/checkout' : '/cart');
        announce('Bought items cleared.');
        break;
      case 'toggle-save': {
        // Web products aren't in our catalog, so keep a small snapshot to show them on the Saved page.
        if (el.dataset.kind === 'items' && /^web-/.test(el.dataset.id)) {
          const snaps = S.state.favorites.webItems = S.state.favorites.webItems || {};
          if (snaps[el.dataset.id]) delete snaps[el.dataset.id];
          else {
            const web = webData();
            const wp = web && (web.products || []).find(function (x) { return x.id === el.dataset.id; });
            if (wp) snaps[el.dataset.id] = wp;
          }
        }
        const added = S.toggleFavorite(el.dataset.kind, el.dataset.id);
        render({ keepFocus: true });
        announce(added ? 'Saved.' : 'Removed from saved.');
        break;
      }
      case 'open-stores':
        sess.storeLookup[el.dataset.id] = { open: true };
        render({ keepFocus: true });
        document.getElementById('zip-' + el.dataset.id).focus();
        break;
      case 'delete-photos':
        removeAllPhotos();
        sess.flash = 'Your photos were deleted.';
        render({ keepFocus: true });
        break;
      case 'delete-profile':
        if (confirmDelete('Delete your style profile, brands, answers and photo colors from this device?')) {
          S.clearProfile(); removeAllPhotos(); resetWeb(); sess.filters = null; sess.step = 1;
          sess.flash = 'Your style profile and answers were deleted.';
          render({ keepFocus: true });
        }
        break;
      case 'delete-favorites':
        if (confirmDelete('Delete all saved brands and products?')) {
          S.clearFavorites();
          sess.flash = 'Your saved items were deleted.';
          render({ keepFocus: true });
        }
        break;
      case 'delete-all':
        if (confirmDelete('Delete everything Style Bridge has stored in this browser? This can’t be undone.')) {
          S.clearAll(); removeAllPhotos(); resetWeb(); sess.filters = null; sess.step = 1; sess.photoConsent = false; sess.aiConsent = false; sess.storeLookup = {};
          sess.flash = 'All your Style Bridge data was deleted from this browser.';
          render({ keepFocus: true });
        }
        break;
    }
  });

  document.addEventListener('submit', function (e) {
    const form = e.target.closest('[data-form]');
    if (!form) return;
    e.preventDefault();
    if (form.dataset.form === 'add-brand') addBrand(form.brand.value);
    if (form.dataset.form === 'add-detail') addDetail(form.detail.value);
    if (form.dataset.form === 'zip') {
      const id = form.dataset.brand;
      const zip = document.getElementById('zip-' + id).value.trim();
      const st = sess.storeLookup[id] = { open: true, zip: zip };
      const brand = SB.engine.brandById(id);
      if (!/^\d{5}$/.test(zip)) {
        st.error = 'Enter a 5-digit US ZIP code, like 10001.';
        render({ keepFocus: true });
        return;
      }
      const siteLink = brand.officialUrl ? ' Please use the store locator on <a href="' + esc(brand.officialUrl) + '" target="_blank" rel="noopener noreferrer">' + esc(plain(brand.name)) + '’s official site' + ext + '</a>.' : '';
      st.message = '<span class="spinner" aria-hidden="true"></span> Searching…';
      render({ keepFocus: true });
      SB.services.stores.findNearby(id, zip).then(function (data) {
        sess.storeLookup[id] = { open: true, zip: zip, results: data.results, source: data.source, retrievedAt: data.retrievedAt, cached: data.cached, note: data.note, message: data.results.length + ' result' + (data.results.length === 1 ? '' : 's') + ' found.' };
      }).catch(function (err) {
        sess.storeLookup[id] = { open: true, zip: zip, message: err.code === 'not_configured'
          ? 'Store lookup isn’t connected on this server, so we can’t show verified addresses yet.' + siteLink
          : esc(err.message || 'Store search failed.') + siteLink };
      }).then(function () { render({ keepFocus: true }); });
    }
  });

  document.addEventListener('change', function (e) {
    const el = e.target;
    const kind = el.dataset && el.dataset.change;
    if (!kind) return;
    switch (kind) {
      case 'photo-consent':
        sess.photoConsent = el.checked;
        render({ keepFocus: true });
        break;
      case 'web-region':
        // A different region is a different search: the old results are replaced.
        sess.web.region = el.value;
        render({ keepFocus: true });
        break;
      case 'cart-size':
        S.updateCart(el.dataset.id, { size: String(el.value || '').trim().slice(0, 16) });
        break;
      case 'cart-bought':
        S.updateCart(el.dataset.id, { purchased: el.checked });
        render({ keepFocus: true });
        announce(el.checked ? 'Marked as bought.' : 'Marked as not bought yet.');
        break;
      case 'web-cat':
        sess.webCat = el.value;
        render({ keepFocus: true });
        break;
      case 'ai-consent':
        sess.aiConsent = el.checked;
        render({ keepFocus: true });
        break;
      case 'dir-filter':
        sess.dirFilters[el.dataset.key] = el.value;
        render({ keepFocus: true });
        break;
      case 'dir-tier': {
        const t = Number(el.value), df = sess.dirFilters;
        df.tiers = el.checked ? df.tiers.concat(t) : df.tiers.filter(function (x) { return x !== t; });
        render({ keepFocus: true });
        break;
      }
      case 'dir-radio':
        sess.dirFilters[el.dataset.key] = el.value;
        render({ keepFocus: true });
        break;
      case 'photo-input':
        handlePhotoFiles(el.files);
        break;
      case 'profile-budget':
        editInputs(function (inputs) {
          const v = Number(el.value), cur = inputs.quiz.budgets;
          inputs.quiz.budgets = el.checked ? cur.filter(function (x) { return x !== v; }).concat(v).sort() : cur.filter(function (x) { return x !== v; });
        }, el.id);
        break;
      case 'profile-size':
        editInputs(function (inputs) {
          const cur = inputs.quiz.sizes;
          inputs.quiz.sizes = el.checked ? cur.filter(function (x) { return x !== el.value; }).concat(el.value) : cur.filter(function (x) { return x !== el.value; });
        }, el.id);
        break;
      case 'profile-shopping':
        editInputs(function (inputs) {
          const cur = inputs.quiz.shopping || [];
          inputs.quiz.shopping = el.checked ? cur.filter(function (x) { return x !== el.value; }).concat(el.value) : cur.filter(function (x) { return x !== el.value; });
        }, el.id);
        break;
      case 'profile-dept':
        editInputs(function (inputs) { inputs.quiz.department = el.value; }, el.id);
        break;
      case 'personal': {
        // Optional location / sizing. Saved on this device as typed; only valid values are ever sent.
        const key = el.dataset.key, value = String(el.value || '').trim();
        editInputs(function (inputs) {
          const pd = inputs.personal = inputs.personal || {};
          if (value) pd[key] = key === 'state' ? value.toUpperCase() : value; else delete pd[key];
        }, el.id);
        const err = personalErrors(personal());
        const errKey = /^height/.test(key) ? 'height' : key === 'shoeSystem' ? 'shoeSize' : key;
        if (err[errKey]) announce(err[errKey]);
        break;
      }
    }
  });

  // Clear brand validation message while typing.
  let searchTimer = null;
  document.addEventListener('input', function (e) {
    if (e.target.id === 'd-q') {
      const value = e.target.value;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(function () {
        sess.dirFilters.q = value;
        render({ keepFocus: true });
        const box = document.getElementById('d-q');
        if (box) box.setSelectionRange(box.value.length, box.value.length);
      }, 250);
      return;
    }
    if (e.target.id === 'brand-input') {
      e.target.removeAttribute('aria-invalid');
      const err = document.getElementById('brand-error');
      if (err) err.textContent = '';
    }
  });

  // Product photos come from brand sites; if one fails to load, swap in a labeled fallback tile.
  document.addEventListener('error', function (e) {
    const img = e.target;
    if (!img || img.tagName !== 'IMG' || !img.hasAttribute('data-fallback')) return;
    const fallback = img.nextElementSibling;
    if (img.parentElement) img.parentElement.classList.add('no-img');   // collapse to the compact fallback strip
    img.remove();
    if (fallback) fallback.hidden = false;
  }, true);

  // Remember open/closed <details>.
  document.addEventListener('toggle', function (e) {
    if (e.target.tagName === 'DETAILS' && e.target.id) sess.open[e.target.id] = e.target.open;
  }, true);

  // Drag & drop photos.
  document.addEventListener('dragover', function (e) {
    const dz = e.target.closest && e.target.closest('#dropzone');
    if (dz && sess.photoConsent) { e.preventDefault(); dz.classList.add('over'); }
  });
  document.addEventListener('dragleave', function (e) {
    const dz = e.target.closest && e.target.closest('#dropzone');
    if (dz) dz.classList.remove('over');
  });
  document.addEventListener('drop', function (e) {
    const dz = e.target.closest && e.target.closest('#dropzone');
    if (!dz) return;
    e.preventDefault();
    if (sess.photoConsent) handlePhotoFiles(e.dataTransfer.files);
  });

  function announce(msg) {
    const live = document.getElementById('live');
    live.textContent = '';
    setTimeout(function () { live.textContent = msg; }, 30);
  }

  // Mobile menu
  const menuBtn = document.getElementById('menu-btn');
  const nav = document.getElementById('site-nav');
  menuBtn.addEventListener('click', function () {
    const open = menuBtn.getAttribute('aria-expanded') === 'true';
    menuBtn.setAttribute('aria-expanded', String(!open));
    nav.classList.toggle('open', !open);
  });
  nav.addEventListener('click', function (e) {
    if (e.target.closest('a')) { menuBtn.setAttribute('aria-expanded', 'false'); nav.classList.remove('open'); }
  });

  // Site-wide banner states exactly which mode the app runs in (driven by /api/status).
  function updateModeBanner() {
    const st = SB.services.status, f = st.features;
    const on = [f.webSearch && 'web search', f.vision && 'AI photo analysis', f.stores && 'store lookup'].filter(Boolean);
    const label = document.getElementById('mode-label'), text = document.getElementById('mode-text');
    label.textContent = f.webSearch ? 'Live search' : 'Search off';
    // Kept short: it sits in the header's right column.
    text.textContent = st.mode === 'static'
      ? 'No API server, so picks can’t load.'
      : f.webSearch
        ? 'Connected: ' + on.join(', ') + '.'
        : 'Web search isn’t connected, so picks can’t load.';
  }

  // ---------- boot: load service status + catalog before the first render ----------
  // The footer is static: its rows fade up and its wordmark rises once they scroll into view.
  function footerMotion() {
    const mark = document.querySelector('.footer-mark');
    if (reduceMotion || !('IntersectionObserver' in window)) { if (mark) mark.classList.add('in'); return; }
    const io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
    }, { threshold: 0.15 });
    document.querySelectorAll('.footer-rows .j-row').forEach(function (el) { el.classList.add('reveal'); io.observe(el); });
    if (mark) io.observe(mark);
  }

  function boot() {
    loadArt();
    footerMotion();
    main.innerHTML = '<div class="container narrow page"><div class="loading" role="status"><span class="spinner big" aria-hidden="true"></span><p class="muted">Loading the brand guide…</p></div></div>';
    SB.services.init()
      .then(function () { return SB.services.catalog.load(); })
      .then(function (cat) {
        SB.engine.setCatalog(cat);
        migrateProfile();
        updateModeBanner();
        window.addEventListener('hashchange', function () { sess.flash = null; render(); });
        render({ initial: true });
      })
      .catch(function () {
        main.innerHTML = '<div class="container narrow page"><div class="empty"><h1 tabindex="-1">We couldn’t load the brand guide</h1>' +
          '<p>Check your connection and try again. If you opened the file directly from your computer, start the local server instead (see README).</p>' +
          '<button type="button" class="btn btn-primary" id="retry-load">Try again</button></div></div>';
        document.getElementById('retry-load').addEventListener('click', boot);
      });
  }
  boot();
})();
