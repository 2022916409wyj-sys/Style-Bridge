// Local persistence. Everything lives in this browser's localStorage only.
// Photos are NEVER persisted — they live in SB.session (memory) until removed or the tab closes.
window.SB = window.SB || {};

(function () {
  const KEY = 'styleBridge.v1';

  function emptyQuiz() {
    return { department: 'any', styles: [], categories: [], fits: [], colors: [], occasions: [], budgets: [], sizes: [], shopping: [] };
  }

  function defaults() {
    return {
      // The style profile is always rebuilt from these inputs (see SB.engine.buildProfile), so they are the source of truth.
      // removed: tags the user turned off, by group (kept off on rebuild). personal: optional location and sizing.
      inputs: { brands: [], quiz: emptyQuiz(), photoColors: [], photoTags: {}, details: [], removed: {}, personal: {} },
      profile: null,
      feedback: {},          // brandId -> 'more' | 'less' (user's own reactions to recommendations)
      webFeedback: {},       // lower-case brand name -> { name, value: 'more' | 'less' } for brands found by web search
      favorites: { brands: [], items: [] },
      // Style Bridge's own shopping list (not a store's cart). Each line keeps a snapshot of the product as found.
      // { id, product, brand, qty, size, color, addedAt, purchased }
      cart: []
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return defaults();
      const parsed = JSON.parse(raw);
      const base = defaults();
      return {
        inputs: Object.assign(base.inputs, parsed.inputs, { quiz: Object.assign(emptyQuiz(), parsed.inputs && parsed.inputs.quiz) }),
        profile: parsed.profile || null,
        feedback: parsed.feedback || {},
        webFeedback: parsed.webFeedback || {},
        favorites: Object.assign(base.favorites, parsed.favorites),
        cart: Array.isArray(parsed.cart) ? parsed.cart : []
      };
    } catch (e) {
      return defaults();
    }
  }

  SB.store = {
    state: load(),
    storageOk: true,
    save: function () {
      try {
        localStorage.setItem(KEY, JSON.stringify(this.state));
        this.storageOk = true;
      } catch (e) {
        // Private mode or blocked storage: the app still works for this visit.
        this.storageOk = false;
      }
    },
    clearProfile: function () {
      this.state.inputs = defaults().inputs;
      this.state.profile = null;
      this.state.feedback = {};
      this.state.webFeedback = {};
      this.save();
    },
    setFeedback: function (brandId, value) {
      if (!value || this.state.feedback[brandId] === value) delete this.state.feedback[brandId];
      else this.state.feedback[brandId] = value;
      this.save();
      return this.state.feedback[brandId] || null;
    },
    clearFavorites: function () {
      this.state.favorites = defaults().favorites;
      this.save();
    },
    clearAll: function () {
      this.state = defaults();
      try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
    },
    isFavorite: function (kind, id) {
      return this.state.favorites[kind].indexOf(id) !== -1;
    },
    toggleFavorite: function (kind, id) {
      const list = this.state.favorites[kind];
      const i = list.indexOf(id);
      if (i === -1) list.push(id); else list.splice(i, 1);
      this.save();
      return i === -1;
    },
    // ---- cart (kept on this device only) ----
    cartLine: function (id) { return this.state.cart.find(function (l) { return l.id === id; }) || null; },
    addToCart: function (line) {
      if (this.cartLine(line.id)) return false;
      this.state.cart.push(Object.assign({ qty: 1, size: '', color: '', purchased: false, addedAt: new Date().toISOString() }, line));
      this.save();
      return true;
    },
    updateCart: function (id, changes) {
      const l = this.cartLine(id);
      if (l) { Object.assign(l, changes); this.save(); }
      return l;
    },
    removeFromCart: function (id) {
      this.state.cart = this.state.cart.filter(function (l) { return l.id !== id; });
      this.save();
    },
    clearCart: function () { this.state.cart = []; this.save(); },
    emptyQuiz: emptyQuiz
  };

  // In-memory session state (not saved).
  SB.session = {
    photos: [],          // { id, name, url, file, status, families, swatches, error, ai: {status, tags, error} }
    photoConsent: false,
    aiConsent: false,    // separate opt-in for sending a photo to the server's AI analysis
    dirFilters: null,    // brand guide filters
    web: { status: 'idle', region: 'US', result: null, error: null },  // web search results (memory only)
    webCat: '',          // category filter on Your picks
    showDemo: false,     // the user asked to see the labeled demo examples
    step: 1,
    filters: null,
    view: 'brands',
    open: {},            // expanded <details> keyed by id
    storeLookup: {},     // per-brand ZIP lookup UI state
    flash: null          // one-time status message
  };
})();
