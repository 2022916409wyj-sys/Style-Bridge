// Service layer. The browser only talks to our own server (/api/*); API keys never reach this code.
// If /api is missing (e.g. another static server), the app runs in static demo mode from data/*.json.
window.SB = window.SB || {};

(function () {
  function ServiceError(code, message, status) {
    const err = new Error(message || code);
    err.code = code;
    err.status = status || 0;
    return err;
  }

  function fetchJson(url, opts) {
    return fetch(url, opts).then(function (res) {
      return res.text().then(function (text) {
        let body = null;
        try { body = text ? JSON.parse(text) : null; } catch (e) { body = null; }
        if (!res.ok) throw ServiceError((body && body.error) || 'http_' + res.status, body && body.message, res.status);
        if (body === null) throw ServiceError('bad_json', 'Unexpected response.', res.status);
        return body;
      });
    }, function () {
      throw ServiceError('network', 'Could not reach the server.');
    });
  }

  function asList(v) { return Array.isArray(v) ? v : v == null || v === '' ? [] : [v]; }

  // Normalize web search results the same way (sources / categories may arrive as single strings).
  function normalizeDiscovery(r) {
    (r.brands || []).forEach(function (b) {
      b.categories = asList(b.categories); b.sources = asList(b.sources); b.matchedAttributes = asList(b.matchedAttributes); b.products = asList(b.products);
    });
    (r.products || []).forEach(function (p) {
      p.sources = asList(p.sources); p.matchedAttributes = asList(p.matchedAttributes); p.comparison = asList(p.comparison);
      if (p.matchEvidence !== undefined) p.matchEvidence = asList(p.matchEvidence);
    });
    if (r.plannedQueries !== undefined) r.plannedQueries = asList(r.plannedQueries);
    r.queries = asList(r.queries);
    r.brands = asList(r.brands); r.products = asList(r.products); r.sources = asList(r.sources);
    return r;
  }

  const staticStatus = { mode: 'static', features: { catalog: 'static-json', products: false, stores: false, vision: false, webSearch: false }, limits: { maxImageMB: 5 } };

  // Downscale before upload: smaller payload, and enough detail for clothing.
  function fileToJpegBase64(file, maxSide) {
    return new Promise(function (resolve, reject) {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = function () {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL('image/jpeg', 0.85).split(',')[1]);
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(ServiceError('unreadable', 'We couldn’t read this photo.')); };
      img.src = url;
    });
  }

  SB.services = {
    status: staticStatus,

    init: function () {
      return fetchJson('api/status').then(function (s) {
        SB.services.status = s;
      }).catch(function () {
        SB.services.status = staticStatus;
      });
    },

    // ---- Catalog -----------------------------------------------------
    catalog: {
      /** Loads brands + vocab + link checks. Adapter: local JSON now; an authorized feed later (same shape). */
      load: function () {
        return fetchJson('api/catalog').catch(function () {
          return Promise.all([
            fetchJson('data/brands.json'),
            fetchJson('data/vocab.json'),
            fetchJson('data/link-checks.json').catch(function () { return null; }),
            // Product listings are optional: if they fail to load, brand picks still work.
            fetchJson('data/products.json').catch(function () { return null; }),
            fetchJson('data/product-checks.json').catch(function () { return null; })
          ]).then(function (r) { return { source: 'static-json', brands: r[0], vocab: r[1], linkChecks: r[2], products: r[3], productChecks: r[4] }; });
        });
      },
      /**
       * Product listings for one brand. Today the server's adapter returns manually verified listings
       * (data/products.json); an authorized brand/retailer/affiliate feed can replace it with the same shape.
       */
      products: function (brandId) {
        return fetchJson('api/products?brand=' + encodeURIComponent(brandId));
      }
    },

    // ---- Style analysis ----------------------------------------------
    styleAnalysis: {
      /** On-device color reading. No pixels leave the browser. */
      readPhotoColors: function (file) {
        return new Promise(function (resolve, reject) {
          const url = URL.createObjectURL(file);
          const img = new Image();
          img.onload = function () {
            try {
              const size = 72;
              const canvas = document.createElement('canvas');
              canvas.width = size; canvas.height = size;
              const ctx = canvas.getContext('2d', { willReadFrequently: true });
              ctx.drawImage(img, img.width * 0.2, img.height * 0.25, img.width * 0.6, img.height * 0.65, 0, 0, size, size);
              const data = ctx.getImageData(0, 0, size, size).data;
              URL.revokeObjectURL(url);
              resolve(summarizePixels(data));
            } catch (e) { URL.revokeObjectURL(url); reject(e); }
          };
          img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('UNREADABLE')); };
          img.src = url;
        });
      },
      /**
       * Garment / fit / style tags from the server's vision endpoint (only when the server has a key).
       * The server sends the photo to the AI provider, keeps it in memory only, and never stores it.
       */
      describeOutfit: function (file) {
        if (!SB.services.status.features.vision) return Promise.reject(ServiceError('not_configured', 'AI outfit analysis is not connected.'));
        return fileToJpegBase64(file, 1280).then(function (b64) {
          return fetchJson('api/analyze-outfit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mediaType: 'image/jpeg', imageBase64: b64 })
          });
        }).then(function (tags) {
          // Always hand the app real lists, even if a one-item list arrives as a plain string.
          ['categories', 'styles', 'colors', 'fits', 'patterns', 'details'].forEach(function (k) { tags[k] = asList(tags[k]); });
          return tags;
        });
      }
    },

    // ---- Web discovery (server calls the OpenAI Responses API with web_search) ----
    discovery: {
      normalize: function (r) { return normalizeDiscovery(r); },
      /**
       * Sends the confirmed profile to our server, which runs the web search. The API key never
       * reaches the browser. Resolves to { text, citations[], sources[], queries[], retrievedAt, region }.
       */
      search: function (payload) {
        if (!SB.services.status.features.webSearch) return Promise.reject(ServiceError('not_configured', 'Web search is not turned on.'));
        const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 170000) : null;
        return fetchJson('api/discover', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: ctrl ? ctrl.signal : undefined
        }).then(function (r) { clearTimeout(timer); return normalizeDiscovery(r); }, function (e) { clearTimeout(timer); throw e; });
      },
      // Second step: the same items at other stores (official, retailers, Amazon, store listings, resale) + photos.
      compare: function (payload) {
        if (!SB.services.status.features.webSearch) return Promise.reject(ServiceError('not_configured', 'Price comparison is not turned on.'));
        const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 170000) : null;
        return fetchJson('api/compare', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: ctrl ? ctrl.signal : undefined
        }).then(function (r) {
          clearTimeout(timer);
          r.items = asList(r.items);
          r.items.forEach(function (it) { it.offers = asList(it.offers); });
          return r;
        }, function (e) { clearTimeout(timer); throw e; });
      }
    },

    // ---- Store locator -----------------------------------------------
    stores: {
      findNearby: function (brandId, zip) {
        if (!SB.services.status.features.stores) return Promise.reject(ServiceError('not_configured', 'Store lookup is not connected.'));
        return fetchJson('api/stores?brand=' + encodeURIComponent(brandId) + '&zip=' + encodeURIComponent(zip));
      }
    }
  };

  // Map pixels to broad color families using simple HSL rules.
  function summarizePixels(data) {
    const counts = { neutrals: 0, earth: 0, blues: 0, pastels: 0, brights: 0 };
    const buckets = {};
    let total = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 128) continue;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      counts[familyFor(rgbToHsl(r, g, b))]++;
      total++;
      const key = (r >> 5) + '-' + (g >> 5) + '-' + (b >> 5);
      const bk = buckets[key] || (buckets[key] = { n: 0, r: 0, g: 0, b: 0 });
      bk.n++; bk.r += r; bk.g += g; bk.b += b;
    }
    if (!total) return { families: [], swatches: [] };
    return {
      families: Object.keys(counts).filter(function (k) { return counts[k] / total >= 0.18; }).sort(function (a, b) { return counts[b] - counts[a]; }),
      swatches: Object.values(buckets).sort(function (a, b) { return b.n - a.n; }).slice(0, 5).map(function (bk) {
        return rgbToHex(Math.round(bk.r / bk.n), Math.round(bk.g / bk.n), Math.round(bk.b / bk.n));
      })
    };
  }
  function familyFor(c) {
    const h = c.h, s = c.s, l = c.l;
    if (s < 0.15 || l < 0.12 || l > 0.92) return 'neutrals';
    if (h >= 195 && h <= 255) return s > 0.6 && l > 0.35 && l < 0.65 ? 'brights' : 'blues';
    if (l > 0.72) return 'pastels';
    if (s > 0.6 && l > 0.3 && l < 0.65) return 'brights';
    if (h >= 15 && h <= 100) return 'earth';
    return s > 0.45 ? 'brights' : 'earth';
  }
  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
    }
    return { h: h, s: s, l: l };
  }
  function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(function (v) { return v.toString(16).padStart(2, '0'); }).join('');
  }
})();
