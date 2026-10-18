// Catalog normalization, profile building and recommendation scoring.
// Budget is taken ONLY from what the user enters — never inferred from brands, photos or anything else.
window.SB = window.SB || {};

(function () {
  const ATTRS = ['styles', 'categories', 'colors', 'fits', 'occasions'];
  const GUESS_LIMIT = { styles: 3, categories: 4, colors: 2, fits: 2, occasions: 3 };
  const TOP_PICKS = 6;   // keep the main result set small and useful

  SB.label = function (group, id) {
    const item = ((SB.vocab && SB.vocab[group]) || []).find(function (o) { return String(o.id) === String(id); });
    return item ? item.label : id;
  };

  // ---------- catalog ----------
  function setCatalog(cat) {
    SB.vocab = cat.vocab;
    const checks = (cat.linkChecks && cat.linkChecks.results) || {};
    SB.brands = cat.brands.brands.map(function (b) {
      const check = checks[b.id];
      // A check only counts if it was made against the URL currently on file.
      const valid = check && check.url === b.officialUrl;
      b.linkStatus = !b.officialUrl ? 'none' : valid ? check.status : 'unverified';
      b.linkCheckedAt = valid && check.status === 'verified' ? check.checkedAt : '';
      return b;
    });
    SB.brandIndex = {};
    SB.brands.forEach(function (b) { SB.brandIndex[b.id] = b; });
    SB.usBrands = SB.brands.filter(function (b) { return b.usAvailability === 'yes'; });
    // Any catalog brand, from any region, can be entered as a brand the user already likes.
    SB.homeBrands = SB.brands;
    SB.catalogMeta = {
      source: cat.source, compiledAt: cat.brands.compiledAt, notice: cat.brands.notice,
      linkChecksAt: cat.linkChecks ? cat.linkChecks.generatedAt : '', linkMethod: cat.linkChecks ? cat.linkChecks.method : '',
      productSource: cat.products ? cat.products.source : 'none',
      productChecksAt: ''
    };
    setProducts(cat.products, cat.productChecks);
  }

  // Merge each listing with its newest check (product-checks.json wins when it is at least as recent).
  function setProducts(productData, checkData) {
    const checks = (checkData && checkData.results) || {};
    SB.products = [];
    SB.productIndex = {};
    SB.productsByBrand = {};
    ((productData && productData.products) || []).forEach(function (p) {
      if (!SB.brandIndex[p.brandId]) return;   // listings must belong to a catalog brand
      const base = p.checks || {};
      const latest = checks[p.id];
      const useLatest = latest && latest.checkedAt >= (base.checkedAt || '');
      const c = useLatest ? latest : base;
      p.status = {
        checkedAt: c.checkedAt || '',
        pageVerified: !!c.pageVerified,
        priceVerified: !!c.priceVerified,
        availability: c.availability || 'unverified',
        availabilityDetail: c.availabilityDetail || ''
      };
      if (useLatest && latest.price && latest.price.amount) p.price = latest.price;
      // A listing whose page could not be confirmed on the latest check is kept out of recommendations.
      if (useLatest && !latest.pageVerified) p.status.pageVerified = false;
      SB.products.push(p);
      SB.productIndex[p.id] = p;
      (SB.productsByBrand[p.brandId] = SB.productsByBrand[p.brandId] || []).push(p);
      if (p.status.checkedAt > SB.catalogMeta.productChecksAt) SB.catalogMeta.productChecksAt = p.status.checkedAt;
    });
    Object.keys(SB.productsByBrand).forEach(function (id) {
      SB.productsByBrand[id] = SB.productsByBrand[id].filter(function (p) { return p.status.pageVerified; });
    });
  }
  function brandById(id) { return SB.brandIndex[id]; }
  function shortName(b) { return b.name.replace(/ \(.*\)$/, ''); }

  // Match free text (English or Chinese names) to a catalog brand.
  function findHomeBrand(text) {
    const q = text.trim().toLowerCase();
    if (!q) return null;
    return SB.homeBrands.find(function (b) {
      return b.name.toLowerCase() === q || shortName(b).toLowerCase() === q || b.id === q || (b.nameZh && b.nameZh === q) || b.aliases.indexOf(q) !== -1;
    }) || null;
  }

  // ---------- profile ----------
  function buildProfile(inputs) {
    const quiz = inputs.quiz;
    const known = inputs.brands.map(function (b) { return b.id && brandById(b.id); }).filter(Boolean);
    const aiTags = inputs.photoTags || {};
    const removed = inputs.removed || {};
    const off = function (group, id) { return (removed[group] || []).indexOf(id) !== -1; };
    const profile = {
      v: 2,
      personal: Object.assign({}, inputs.personal || {}),   // optional location and sizing, exactly as typed
      department: quiz.department || 'any',
      budgets: quiz.budgets.slice(),
      sizes: quiz.sizes.slice(),
      shopping: (quiz.shopping || []).slice(),   // 'online' | 'stores' | 'intl' — user-entered only
      brands: inputs.brands.slice(),
      createdAt: new Date().toISOString()
    };

    ATTRS.forEach(function (attr) {
      const list = quiz[attr].map(function (id) { return { id: id, source: 'user' }; });
      const taken = new Set(quiz[attr]);
      const tally = {};
      known.forEach(function (b) {
        (b[attr] || []).forEach(function (id, idx) {
          const t = tally[id] || (tally[id] = { score: 0, from: [] });
          t.score += 1 + (b[attr].length - idx) * 0.1;
          t.from.push(shortName(b));
        });
      });
      Object.keys(tally)
        .filter(function (id) { return !taken.has(id); })
        .sort(function (a, b) { return tally[b].score - tally[a].score; })
        .slice(0, GUESS_LIMIT[attr])
        .forEach(function (id) {
          taken.add(id);
          if (!off(attr, id)) list.push({ id: id, source: 'guess', from: tally[id].from.slice(0, 3) });   // removed tags stay removed
        });

      const fromPhotos = (attr === 'colors' ? (inputs.photoColors || []) : []).map(function (id) { return { id: id, label: 'your outfit photos' }; })
        .concat((aiTags[attr] || []).map(function (id) { return { id: id, label: 'AI photo analysis' }; }));
      // `photo: true` marks anything the outfit photos support, so a search can give it priority once kept.
      fromPhotos.forEach(function (p) {
        const existing = list.find(function (x) { return x.id === p.id; });
        if (existing) {
          existing.photo = true;
          if (existing.source === 'guess' && existing.from.indexOf(p.label) === -1) existing.from.push(p.label);
        } else if (!off(attr, p.id)) list.push({ id: p.id, source: 'guess', from: [p.label], photo: true });
      });
      list.forEach(function (x) { if (x.from) x.reason = 'Based on ' + x.from.join(', '); });
      profile[attr] = list;
    });

    // Style details: short phrases typed by the user, plus AI patterns/details from photos as suggestions.
    profile.details = [];
    const addDetail = function (kind, value, source) {
      const text = kind === 'pattern' ? patternLabel(value) : String(value).trim();
      const id = detailId(kind, value);
      if (!text || off('details', id) || profile.details.some(function (d) { return d.id === id; })) return;
      const d = { id: id, kind: kind, value: value, text: text, source: source };
      if (source === 'guess') { d.from = ['AI photo analysis']; d.reason = 'Based on AI photo analysis'; d.photo = true; }
      profile.details.push(d);
    };
    (inputs.details || []).forEach(function (t) { addDetail('detail', t, 'user'); });
    (aiTags.patterns || []).filter(function (id) { return PATTERNS[id] && id !== 'other'; }).forEach(function (id) { addDetail('pattern', id, 'guess'); });
    (aiTags.details || []).forEach(function (t) { addDetail('detail', t, 'guess'); });
    return profile;
  }

  const PATTERNS = { solid: 'Solid colors', stripes: 'Stripes', plaid: 'Plaid / check', floral: 'Florals', graphic: 'Graphic prints', animal: 'Animal print', 'polka-dot': 'Polka dots', 'color-block': 'Color blocking', other: 'Other patterns' };
  function patternLabel(id) { return PATTERNS[id] || id; }
  function detailId(kind, value) { return kind + '-' + String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40); }

  function keywords(profile) {
    const words = [];
    profile.styles.slice(0, 2).forEach(function (s) { words.push(SB.label('styles', s.id)); });
    const fitWords = { relaxed: 'Relaxed fit', regular: 'Regular fit', tailored: 'Tailored fit', cropped: 'Cropped shapes' };
    if (profile.fits[0]) words.push(fitWords[profile.fits[0].id]);
    if (profile.colors[0]) words.push(SB.label('colors', profile.colors[0].id));
    (profile.details || []).slice(0, 2).forEach(function (d) { words.push(d.text); });
    return words;
  }

  // ---------- recommendations ----------
  function joinLabels(group, ids) {
    const labels = ids.map(function (id) { return SB.label(group, id); });
    if (labels.length <= 1) return labels.join('');
    return labels.slice(0, -1).join(', ') + ' and ' + labels[labels.length - 1];
  }
  function lower(s) { return s.charAt(0).toLowerCase() + s.slice(1); }
  function budgetLabel(tiers) {
    const min = Math.min.apply(null, tiers), max = Math.max.apply(null, tiers);
    const lo = SB.label('budgets', min), hi = SB.label('budgets', max);
    return min === max ? lo : lo + ' to ' + hi;
  }
  function isUserSource(s) { return s === 'user' || s === 'confirmed'; }

  // Weighted overlap, split into what the user said vs. what we guessed.
  function hits(brandTags, list) {
    const user = [], guess = [];
    let score = 0;
    list.forEach(function (x) {
      if (brandTags.indexOf(x.id) === -1) return;
      if (isUserSource(x.source)) { user.push(x); score += 1; } else { guess.push(x); score += 0.7; }
    });
    return { user: user, guess: guess, score: score, all: user.concat(guess) };
  }
  function guessFrom(items) {
    const from = [];
    items.forEach(function (x) { (x.from || []).forEach(function (f) { if (from.indexOf(f) === -1) from.push(f); }); });
    return from.slice(0, 2).join(' and ');
  }

  function feedbackContext() {
    const fb = (SB.store && SB.store.state.feedback) || {};
    const liked = [], disliked = [];
    Object.keys(fb).forEach(function (id) {
      const b = brandById(id);
      if (!b) return;
      (fb[id] === 'more' ? liked : disliked).push(b);
    });
    return { map: fb, liked: liked, disliked: disliked };
  }

  function sharedStyles(a, b) { return a.styles.filter(function (s) { return b.styles.indexOf(s) !== -1; }); }

  function scoreBrand(brand, profile, fb) {
    if (profile.department !== 'any' && brand.departments.indexOf(profile.department) === -1) return null;

    let score = 0;
    const reasons = [];
    const add = function (kind, source, text) { reasons.push({ kind: kind, source: source, text: text }); };
    const userBrandIds = profile.brands.map(function (b) { return b.id; }).filter(Boolean);

    // 1. Brands the user named (any region). Connections are made on style + category, never on country alone.
    if (userBrandIds.indexOf(brand.id) !== -1) {
      score += 5;
      add('brand', 'user', 'You listed ' + shortName(brand) + (brand.usAvailability === 'yes'
        ? ' — it’s listed as sold in the US, so you can keep shopping it here.'
        : ' — it has an official international online store you can check.'));
    }
    const linked = [];
    brand.similarTo.filter(function (s) { return userBrandIds.indexOf(s.id) !== -1; }).slice(0, 2).forEach(function (s) {
      score += 4;
      linked.push(s.id);
      add('brand', 'user', 'You listed ' + shortName(brandById(s.id)) + ' — ' + s.note.replace(/^it /, shortName(brand) + ' ').replace(/^its /, shortName(brand) + '’s ') + '.');
    });
    // Style-based link to a listed brand: needs 2+ shared styles AND a shared category.
    if (!linked.length) {
      const listed = userBrandIds.map(brandById).filter(function (l) { return l && l.id !== brand.id; });
      const best = listed.map(function (l) {
        return { l: l, styles: sharedStyles(l, brand), cats: l.categories.filter(function (c) { return brand.categories.indexOf(c) !== -1; }) };
      }).filter(function (m) { return m.styles.length >= 2 && m.cats.length; })
        .sort(function (a, b) { return (b.styles.length + b.cats.length) - (a.styles.length + a.cats.length); })[0];
      if (best) {
        score += 2.5;
        add('brand', 'user', 'Shares the ' + joinLabels('styles', best.styles.slice(0, 2)) + ' look of ' + shortName(best.l) + ', which you listed — especially in ' + joinLabels('categories', best.cats.slice(0, 2)).toLowerCase() + '.');
      }
    }

    // 2. Your own feedback.
    const mine = fb.map[brand.id];
    if (mine === 'more') { score += 5; add('feedback', 'feedback', 'You marked this brand “More my style.”'); }
    fb.liked.forEach(function (l) {
      if (l.id === brand.id) return;
      const shared = sharedStyles(l, brand);
      if (shared.length >= 2) { score += 2.5; add('feedback', 'feedback', 'Shares the ' + joinLabels('styles', shared.slice(0, 2)) + ' look of ' + shortName(l) + ', which you marked “More my style.”'); }
    });
    fb.disliked.forEach(function (d) { if (d.id !== brand.id && sharedStyles(d, brand).length >= 2) score -= 1.5; });

    // 3. Style profile.
    const st = hits(brand.styles, profile.styles);
    score += st.score * 3;
    if (st.user.length) add('style', 'user', 'Matches the ' + joinLabels('styles', st.user.slice(0, 2).map(function (x) { return x.id; })) + ' style you chose.');
    else if (st.guess.length) add('style', 'guess', 'Matches the ' + joinLabels('styles', st.guess.slice(0, 2).map(function (x) { return x.id; })) + ' style we suggested from ' + guessFrom(st.guess) + '.');

    const ft = hits(brand.fits, profile.fits);
    score += ft.score * 0.8;
    if (ft.all.length) add('fit', isUserSource(ft.all[0].source) ? 'user' : 'guess', 'Known for ' + lower(SB.label('fits', ft.all[0].id)) + ' fits, ' + (isUserSource(ft.all[0].source) ? 'which you prefer.' : 'which we suggested from your other answers.'));

    const ct = hits(brand.categories, profile.categories);
    score += ct.score * 1.2;
    if (ct.all.length) add('category', isUserSource(ct.all[0].source) ? 'user' : 'guess', 'Strong in ' + joinLabels('categories', ct.all.slice(0, 2).map(function (x) { return x.id; })).toLowerCase() + (isUserSource(ct.all[0].source) ? ', which you wear most.' : ', which we suggested you wear often.'));

    const oc = hits(brand.occasions, profile.occasions);
    score += oc.score;
    if (oc.user.length) add('occasion', 'user', 'Works for ' + joinLabels('occasions', oc.user.slice(0, 2).map(function (x) { return x.id; })).toLowerCase() + ', where you said you’ll wear it.');

    const co = hits(brand.colors, profile.colors);
    score += co.score * 0.8;
    if (co.all.length) {
      const c = co.all[0];
      const why = isUserSource(c.source) ? 'a color you picked.' : (c.from || []).some(function (f) { return /photo/.test(f); }) ? 'which we read from your photos.' : 'which we suggested from your brands.';
      add('color', isUserSource(c.source) ? 'user' : 'guess', 'Often comes in ' + SB.label('colors', c.id).toLowerCase() + ' — ' + why);
    }

    // 4. Budget: only the user's own choice.
    let budgetStatus = 'unset';
    const tiers = brand.price.tiers;
    if (profile.budgets.length) {
      const maxB = Math.max.apply(null, profile.budgets), minB = Math.min.apply(null, profile.budgets);
      if (tiers.some(function (t) { return profile.budgets.indexOf(t) !== -1; })) {
        budgetStatus = 'within'; score += 2;
        add('budget', 'user', 'Fits the ' + budgetLabel(profile.budgets) + ' per-piece budget you set (based on estimated prices).');
      } else if (Math.min.apply(null, tiers) > maxB) { budgetStatus = 'above'; score -= 3; }
      else if (Math.max.apply(null, tiers) < minB) { budgetStatus = 'below'; score += 0.5; }
    }

    // 5. Size needs.
    const sizeHits = profile.sizes.filter(function (s) { return brand.sizes.indexOf(s) !== -1; });
    const sizeMisses = profile.sizes.filter(function (s) { return brand.sizes.indexOf(s) === -1; });
    score += sizeHits.length * 1.5 - sizeMisses.length;
    if (sizeHits.length) add('size', 'user', 'Carries ' + joinLabels('sizes', sizeHits).toLowerCase() + ' sizes, which you asked for.');

    // 6. How the user likes to shop (editorial availability data, not verified).
    const shop = profile.shopping || [];
    if (shop.indexOf('stores') !== -1 && brand.hasStores === true) { score += 1; add('shopping', 'user', 'Listed as having US stores, and you like to shop in person (store info not verified).'); }
    else if (shop.indexOf('online') !== -1 && brand.online === true) { score += 0.5; }
    if (brand.usAvailability === 'intl-online') add('shopping', 'user', 'You said you’re open to international online stores — check US shipping and returns before you order.');

    // What this brand is most useful for, for this user.
    const useCase = {
      categories: ct.all.length ? ct.all.slice(0, 2).map(function (x) { return x.id; }) : brand.categories.slice(0, 2),
      occasions: oc.all.slice(0, 2).map(function (x) { return x.id; }),
      personal: ct.all.length > 0
    };

    const priority = { brand: 0, feedback: 1, style: 2, budget: 3, size: 4, shopping: 5, fit: 6, category: 7, occasion: 8, color: 9 };
    reasons.sort(function (a, b) { return priority[a.kind] - priority[b.kind]; });
    return {
      brand: brand, score: score, reasons: reasons.slice(0, 5), budgetStatus: budgetStatus, sizeMisses: sizeMisses, useCase: useCase,
      styleHits: st.all.map(function (x) { return x.id; }), feedback: mine || null, hidden: mine === 'less'
    };
  }

  /** Brands we can recommend: listed as sold in the US, plus international online stores if the user opted in. */
  function candidates(profile) {
    const intl = (profile.shopping || []).indexOf('intl') !== -1;
    return SB.brands.filter(function (b) { return b.usAvailability === 'yes' || (intl && b.usAvailability === 'intl-online'); });
  }

  // ---------- web search results ----------
  function hostOf(u) { try { return new URL(u).host.toLowerCase().replace(/^(www|us|shop)\./, ''); } catch (e) { return ''; } }

  /** Finds the catalog brand a web result refers to (by name/alias, or by official website host). */
  function catalogBrandFor(name, url) {
    const byName = name ? findHomeBrand(name) || findHomeBrand(name.replace(/\s*\(.*\)$/, '')) : null;
    if (byName) return byName;
    const h = url ? hostOf(url) : '';
    if (!h) return null;
    return SB.brands.find(function (b) { return b.officialUrl && hostOf(b.officialUrl) === h; }) || null;
  }

  /** Map of catalog brand id -> web brand result, for brands the web search also recommended. */
  function webBrandIndex(web) {
    const idx = {};
    ((web && web.brands) || []).forEach(function (wb) {
      const b = catalogBrandFor(wb.name, wb.url);
      if (b && !idx[b.id]) idx[b.id] = wb;
    });
    return idx;
  }

  function recommend(profile, web) {
    const fb = feedbackContext();
    const webIdx = webBrandIndex(web);
    const results = candidates(profile).map(function (b) {
      const r = scoreBrand(b, profile, fb);
      if (r && webIdx[b.id]) {
        // The web search independently recommended this catalog brand: surface it and say why.
        r.score += 4;
        r.web = webIdx[b.id];
        if (webIdx[b.id].whyFits) r.reasons = [{ kind: 'web', source: 'web', text: 'Web search: ' + webIdx[b.id].whyFits }].concat(r.reasons).slice(0, 5);
      }
      return r;
    }).filter(Boolean);
    results.sort(function (a, b) { return b.score - a.score; });
    const visible = results.filter(function (r) { return !r.hidden; });
    const top = visible.length ? Math.max(visible[0].score, 1) : 1;
    results.forEach(function (r) {
      const ratio = r.score / top;
      r.level = ratio >= 0.72 ? 'strong' : ratio >= 0.45 ? 'good' : 'explore';
    });

    // Keep the top picks diverse: include a budget-friendly brand unless the user chose only higher budgets.
    const wantsAffordable = !profile.budgets.length || profile.budgets.indexOf(1) !== -1;
    const firstSix = visible.slice(0, 6);
    if (wantsAffordable && visible.length > 6 && !firstSix.some(function (r) { return r.brand.price.tiers.indexOf(1) !== -1; })) {
      const pick = visible.slice(6).find(function (r) { return r.brand.price.tiers.indexOf(1) !== -1 && r.level !== 'explore'; });
      if (pick) {
        pick.affordablePick = true;
        results.splice(results.indexOf(pick), 1);
        results.splice(results.indexOf(firstSix[5]), 0, pick);
      }
    }
    // ...and from more than one region, when a good match from another region exists.
    const six = results.filter(function (r) { return !r.hidden; }).slice(0, TOP_PICKS);
    const regions = six.map(function (r) { return r.brand.country; });
    if (six.length === TOP_PICKS && regions.every(function (c) { return c === regions[0]; })) {
      const other = results.filter(function (r) { return !r.hidden; }).slice(TOP_PICKS)
        .find(function (r) { return r.brand.country !== regions[0] && r.level !== 'explore'; });
      if (other) {
        other.regionPick = true;
        results.splice(results.indexOf(other), 1);
        results.splice(results.indexOf(six[TOP_PICKS - 1]), 0, other);
      }
    }
    results.forEach(function (r, i) { r.rank = i; });
    return results;
  }

  // ---------- products (verified listings only; never generic placeholders) ----------

  // Budget tier for a USD price, matching vocab budgets: 1 <$40, 2 $40–100, 3 $100–250, 4 $250+.
  function usdTier(amount) { return amount < 40 ? 1 : amount < 100 ? 2 : amount < 250 ? 3 : 4; }

  /**
   * Budget status for one product. Only USD prices are compared, and only against a budget the user set.
   * 'unset' = no budget given; 'within' / 'under' / 'over'; 'not-compared' = non-USD price.
   */
  function productBudget(product, profile) {
    if (!profile || !profile.budgets.length) return 'unset';
    if (!product.price || typeof product.price.amount !== 'number') return 'unknown';
    if (product.price.currency !== 'USD') return 'not-compared';
    const t = usdTier(product.price.amount);
    if (profile.budgets.indexOf(t) !== -1) return 'within';
    return t > Math.max.apply(null, profile.budgets) ? 'over' : 'under';
  }

  function productsForBrand(brandId) { return SB.productsByBrand[brandId] || []; }

  function productWhy(p, r, profile) {
    const parts = [];
    const catEntry = profile.categories.find(function (c) { return c.id === p.category; });
    if (catEntry) parts.push(isUserSource(catEntry.source) ? SB.label('categories', p.category) + ' is a category you told us you wear.' : SB.label('categories', p.category) + ' is a category we suggested from your brands.');
    if (r && r.styleHits.length) parts.push('From a brand that matches your ' + joinLabels('styles', r.styleHits.slice(0, 2)) + ' style.');
    return parts.join(' ');
  }

  /**
   * Products for the "Show my picks" screen: verified listings from the top recommended brands,
   * favoring the user's categories, max 2 per brand. Over-budget items are excluded unless includeOver.
   */
  function productPicks(results, profile, opts) {
    opts = opts || {};
    const cats = profile.categories.map(function (c) { return c.id; });
    const scored = [];
    results.filter(function (r) { return !r.hidden; }).slice(0, opts.brandWindow || 15).forEach(function (r, ri) {
      productsForBrand(r.brand.id).forEach(function (p) {
        if (opts.category && p.category !== opts.category) return;
        if (p.status.availability === 'out-of-stock') return;
        const budget = productBudget(p, profile);
        const catIdx = cats.indexOf(p.category);
        scored.push({ p: p, r: r, budget: budget, score: (catIdx === -1 ? 0 : 10 - catIdx) - ri * 0.6 + (budget === 'within' ? 2 : 0) });
      });
    });
    scored.sort(function (a, b) { return b.score - a.score; });
    const perBrand = {}, out = [];
    let overCount = 0, otherCurrency = 0;
    scored.forEach(function (s) {
      // With a budget set, items above it — or priced in another currency we can't compare — are hidden by default.
      if (s.budget === 'over') { overCount++; if (!opts.includeOver) return; }
      if (s.budget === 'not-compared') { otherCurrency++; if (!opts.includeOver) return; }
      if (out.length >= (opts.limit || 6)) return;
      const n = perBrand[s.p.brandId] || 0;
      if (n >= (opts.perBrand || 2)) return;
      perBrand[s.p.brandId] = n + 1;
      out.push({ product: s.p, brand: s.r.brand, budget: s.budget, why: productWhy(s.p, s.r, profile) });
    });
    return { items: out, overBudget: overCount, otherCurrency: otherCurrency, considered: scored.length };
  }

  /** Brands the user named that aren't sold in US stores but have an international online store. */
  function familiarAbroad(profile) {
    return profile.brands.map(function (b) { return b.id && brandById(b.id); })
      .filter(function (b) { return b && b.usAvailability === 'intl-online'; });
  }

  function minTier(b) { return Math.min.apply(null, b.price.tiers); }
  function maxTier(b) { return Math.max.apply(null, b.price.tiers); }

  function matchesCommon(b, f) {
    if (f.tiers && f.tiers.length && !b.price.tiers.some(function (t) { return f.tiers.indexOf(t) !== -1; })) return false;
    if (f.category && b.categories.indexOf(f.category) === -1) return false;
    if (f.style && b.styles.indexOf(f.style) === -1) return false;
    if (f.occasion && b.occasions.indexOf(f.occasion) === -1) return false;
    if (f.country && b.country !== f.country) return false;
    if (f.segment && b.segment !== f.segment) return false;
    if (f.size && b.sizes.indexOf(f.size) === -1) return false;
    if (f.channel === 'online' && b.online !== true && b.usAvailability !== 'intl-online') return false;
    if (f.channel === 'stores' && b.hasStores !== true) return false;
    return true;
  }

  function applyFilters(results, f, profile) {
    return results.filter(function (r) {
      if (r.hidden) return false;
      if (!matchesCommon(r.brand, f)) return false;
      if (f.withinBudget && profile.budgets.length && r.budgetStatus === 'above') return false;
      return true;
    }).sort(function (a, b) {
      if (f.sort === 'price-asc') return minTier(a.brand) - minTier(b.brand) || a.rank - b.rank;
      if (f.sort === 'price-desc') return maxTier(b.brand) - maxTier(a.brand) || a.rank - b.rank;
      return a.rank - b.rank;
    });
  }

  function filterDirectory(f) {
    const q = (f.q || '').trim().toLowerCase();
    return SB.brands.filter(function (b) {
      if (q && !(b.name.toLowerCase().indexOf(q) !== -1 || (b.nameZh && b.nameZh.indexOf(q) !== -1) || b.aliases.some(function (a) { return a.indexOf(q) !== -1; }))) return false;
      if (f.availability && b.usAvailability !== f.availability) return false;
      if (f.link === 'verified' && b.linkStatus !== 'verified') return false;
      if (f.link === 'unverified' && b.linkStatus === 'verified') return false;
      if (f.products === 'yes' && !productsForBrand(b.id).length) return false;
      return matchesCommon(b, f);
    }).sort(function (a, b) { return a.name.localeCompare(b.name); });
  }

  /** All verified listings from the filtered brand results (the "Products" tab). */
  function productsFrom(results, f, profile, includeOver) {
    return productPicks(results, profile, { category: f.category, includeOver: includeOver, limit: 200, perBrand: 50, brandWindow: results.length });
  }

  SB.engine = {
    setCatalog: setCatalog,
    brandById: brandById,
    homeBrandById: brandById,
    findHomeBrand: findHomeBrand,
    buildProfile: buildProfile,
    patternLabel: patternLabel,
    detailId: detailId,
    keywords: keywords,
    recommend: recommend,
    familiarAbroad: familiarAbroad,
    productPicks: productPicks,
    catalogBrandFor: catalogBrandFor,
    webBrandIndex: webBrandIndex,
    candidates: candidates,
    TOP_PICKS: TOP_PICKS,
    applyFilters: applyFilters,
    filterDirectory: filterDirectory,
    productsFrom: productsFrom,
    productsForBrand: productsForBrand,
    productBudget: productBudget,
    productById: function (id) { return SB.productIndex[id]; },
    defaultFilters: function () {
      return { tiers: [], category: '', style: '', occasion: '', channel: '', country: '', segment: '', size: '', withinBudget: false, sort: 'match' };
    },
    defaultDirFilters: function () {
      return { q: '', country: '', segment: '', availability: '', style: '', category: '', tiers: [], size: '', channel: '', link: '', products: '' };
    }
  };
})();
