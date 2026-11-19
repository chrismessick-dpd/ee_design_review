/* Signoff EE: the home page (Chris, 2026-11-19). Not an engine file: only EE loads it, and app.js draws it
   only when config.home is set (ME and FW have none).

   The page shows when no board is open and someone is signed in (or in the demo); a click on the sidebar's
   Signoff EE logo opens it. Two panels:
   - Tools: Fabcheck, Pincheck, Loom, and Flasher as tiles with the hub's art (../signoff/assets/tool-art.svg).
     A click shows the tool's description under the tiles; a click on the selected tile, a double-click, or
     Open goes there.
   - Internal standards: one tile per deck (config.home.decks: Footprints, Schematics). A deck is a list of
     items, each a title, text, and pictures, shown as a list or as slides. FTEs add, edit, move, and delete
     items, and import and export decks as .pptx (assets/pptx.js); everyone signed in reads them.

   Storage: the private repo config.home.repo, one file per deck, decks/<id>.json
     { format: 'signoff.standards/1', id, title, items: [{ id, title, body, pics: [{ file, type, w, h, name }],
       updatedAt, updatedBy }], updatedAt, updatedBy }
   and pictures at images/<deck>/<item>-<pic>.<ext>. Every change reads the branch head, applies that one change
   to the deck as stored there, and commits with force: false, retrying on a race (as Tickets does), so a stale
   copy in a tab is never written back. Pictures of deleted items stay in the repo (Undo puts the item back).
   Nothing is kept in localStorage: decks and pictures live in memory for the page's life.

   Routes: #standards/<deck> (the list), #standards/<deck>/slides/<n> (slide n, from 1).

   window.SignoffHome: mount(el, ctx), reset(), leave(), busy(), and _test (pure helpers for tests/test.html).
   ctx: { demo, fte, login, toast(text, action), goHome(), note }: note is app.js's own HTML (already escaped), the
   empty page's message when there are no boards yet. */
(function () {
  'use strict';
  var C = window.SIGNOFF_CONFIG || {};
  var H = C.home;
  if (!H) return;
  var OWNER = (C.repos || {}).owner, REPO = H.repo, BRANCH = 'main', API = 'https://api.github.com';
  var FORMAT = 'signoff.standards/1';
  var DECKS = H.decks || [];

  // ── Small helpers ────────────────────────────────────────
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function rid(n) { var s = ''; var a = new Uint8Array(n || 8); crypto.getRandomValues(a); for (var i = 0; i < a.length; i++) s += 'abcdefghijkmnpqrstuvwxyz23456789'[a[i] % 32]; return s; }
  function now() { return new Date().toISOString(); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function get(store, k) { try { return store.getItem(k); } catch (e) { return null; } }
  function b64ToBytes(b64) { var bin = atob(String(b64).replace(/\s/g, '')), a = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return a; }
  function bytesToB64(bytes) { var s = ''; for (var i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); }
  function deckDef(id) { return DECKS.filter(function (d) { return d.id === id; })[0] || null; }
  function relTime(iso) {
    var t = Date.parse(iso); if (!t) return '';
    var s = Math.round((Date.now() - t) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return Math.round(s / 60) + ' min ago';
    if (s < 86400) return Math.round(s / 3600) + ' h ago';
    if (s < 86400 * 30) return Math.round(s / 86400) + ' d ago';
    return new Date(t).toLocaleDateString();
  }
  var EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' };
  var MAX_PIC = 8 * 1048576;

  // A deck as stored, tidied: unknown fields dropped, text kept as text, pictures only under images/.
  function cleanDeck(d, id) {
    d = d && typeof d === 'object' ? d : {};
    var def = deckDef(id) || {};
    return {
      format: FORMAT, id: id, title: String(d.title || def.title || id),
      items: (Array.isArray(d.items) ? d.items : []).filter(function (it) { return it && typeof it === 'object' && /^[a-z0-9]{4,16}$/.test(it.id || ''); }).map(function (it) {
        return {
          id: it.id, title: String(it.title || ''), body: String(it.body || ''),
          pics: (Array.isArray(it.pics) ? it.pics : []).filter(function (p) { return p && /^images\/[a-z0-9-]+\/[a-z0-9-]+\.(png|jpg|gif|webp)$/.test(p.file || ''); })
            .map(function (p) { return { file: p.file, type: EXT[p.type] ? p.type : 'image/png', w: +p.w || 0, h: +p.h || 0, name: String(p.name || '') }; }),
          updatedAt: String(it.updatedAt || ''), updatedBy: String(it.updatedBy || '')
        };
      }),
      updatedAt: String(d.updatedAt || ''), updatedBy: String(d.updatedBy || '')
    };
  }
  function serialize(d) { return JSON.stringify(d, null, 2) + '\n'; }

  // The changes, as pure functions of the deck read at the head (so a retry re-applies them to a newer one).
  var OPS = {
    add: function (d, a) { var i = a.at == null ? d.items.length : Math.max(0, Math.min(d.items.length, a.at)); d.items.splice(i, 0, a.item); },
    update: function (d, a) { var it = d.items.filter(function (x) { return x.id === a.id; })[0]; if (!it) throw new Error('That item was deleted in another tab or by someone else.'); Object.keys(a.fields).forEach(function (k) { it[k] = a.fields[k]; }); },
    remove: function (d, a) { d.items = d.items.filter(function (x) { return x.id !== a.id; }); },
    move: function (d, a) {
      var i = d.items.map(function (x) { return x.id; }).indexOf(a.id); if (i < 0) return;
      var it = d.items.splice(i, 1)[0], j = Math.max(0, Math.min(d.items.length, i + a.by));
      d.items.splice(j, 0, it);
    },
    replaceAll: function (d, a) { d.items = a.items.slice(); }
  };
  function applyOps(deck, ops, who, at) {
    ops.forEach(function (o) {
      OPS[o.op](deck, o);
      var it = o.item || (o.id && deck.items.filter(function (x) { return x.id === o.id; })[0]);
      if (it && o.op !== 'move' && o.op !== 'remove') { it.updatedAt = at; it.updatedBy = who; }
      (o.items || []).forEach(function (x) { x.updatedAt = at; x.updatedBy = who; });
    });
    deck.updatedAt = at; deck.updatedBy = who;
    return deck;
  }

  // ── GitHub (as Tickets does it: signoff/assets/tickets.js) ──
  function rawToken() { return get(sessionStorage, 'signoff.token') || get(localStorage, 'signoff.token') || ''; }
  function token() { var t = rawToken(), A = window.SignoffAuth; return A && A.owns && A.owns(t) ? A.token() : Promise.resolve(t); }
  function gh(method, path, body, retried) {
    return token().then(function (t) {
      if (!t) throw new Error('Sign in to see the standards.');
      return fetch(API + path, {
        method: method, cache: 'no-store',
        headers: { Authorization: 'Bearer ' + t, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined
      }).then(function (r) {
        var A = window.SignoffAuth;
        if (r.status === 401 && !retried && A && A.owns && A.owns(t)) return A.refresh(t).then(function () { return gh(method, path, body, true); });
        if (r.ok) return r.status === 204 ? {} : r.json();
        return r.json().catch(function () { return {}; }).then(function (j) {
          var e = new Error(r.status === 404 || r.status === 403 ? 'The standards repo (' + REPO + ') isn’t shared with you yet. Ask Chris to add you.' : (j.message || ('GitHub said ' + r.status)));
          e.status = r.status; e.race = r.status === 422 || r.status === 409;
          throw e;
        });
      });
    });
  }
  function repo(p) { return '/repos/' + OWNER + '/' + REPO + p; }
  function head() {
    return gh('GET', repo('/git/ref/heads/' + BRANCH)).then(function (ref) {
      var commit = ref.object.sha;
      return gh('GET', repo('/git/commits/' + commit)).then(function (c) {
        return gh('GET', repo('/git/trees/' + c.tree.sha + '?recursive=1')).then(function (t) {
          var files = {};
          (t.tree || []).forEach(function (e) { if (e.type === 'blob') files[e.path] = e.sha; });
          lastFiles = files;
          return { commit: commit, tree: c.tree.sha, files: files };
        });
      });
    });
  }
  var blobText = {};
  function readBlobText(sha) {
    if (blobText[sha]) return Promise.resolve(blobText[sha]);
    return gh('GET', repo('/git/blobs/' + sha)).then(function (b) {
      var text = new TextDecoder('utf-8').decode(b64ToBytes(b.content || ''));
      blobText[sha] = text; return text;
    });
  }
  function readDeckAt(h, id) {
    var sha = h.files['decks/' + id + '.json'];
    if (!sha) return Promise.resolve({ deck: cleanDeck(null, id), text: null });
    return readBlobText(sha).then(function (text) { return { deck: cleanDeck(JSON.parse(text), id), text: text }; });
  }
  function commit(h, changes, message) {
    return Promise.all(changes.map(function (c) {
      var body = c.bytes ? { content: bytesToB64(c.bytes), encoding: 'base64' } : { content: c.text, encoding: 'utf-8' };
      return gh('POST', repo('/git/blobs'), body).then(function (b) { return { path: c.path, mode: '100644', type: 'blob', sha: b.sha }; });
    })).then(function (entries) {
      return gh('POST', repo('/git/trees'), { base_tree: h.tree, tree: entries });
    }).then(function (tree) {
      return gh('POST', repo('/git/commits'), { message: message, tree: tree.sha, parents: [h.commit] });
    }).then(function (c) {
      return gh('PATCH', repo('/git/refs/heads/' + BRANCH), { sha: c.sha, force: false }).catch(function (e) {
        if (e.status === 422 || e.status === 409) e.race = true;
        throw e;
      });
    });
  }

  // ── The store: real (GitHub) or demo (memory) ────────────
  var ctx = {};
  var decks = {};          // id -> { deck, at, error, loading }
  var lastFiles = {};
  var pending = 0;         // writes in flight (busy())
  var picUrls = {};        // file (or demo key) -> object URL / data URL
  var picBytes = {};       // file -> Uint8Array, for export (filled as pictures load)

  function who() { return ctx.login || 'someone'; }

  function load(id, force) {
    var s = decks[id] || (decks[id] = {});
    if (s.loading) return s.loading;
    if (s.deck && !force && Date.now() - s.at < 60000) return Promise.resolve(s.deck);
    if (ctx.demo) { s.deck = s.deck || demoDeck(id); s.at = Date.now(); return Promise.resolve(s.deck); }
    s.loading = head().then(function (h) { return readDeckAt(h, id); }).then(function (r) {
      s.deck = r.deck; s.at = Date.now(); s.error = ''; s.loading = null; return s.deck;
    }, function (e) { s.error = e.message; s.loading = null; throw e; });
    return s.loading;
  }

  // One change: ops applied to the deck at the head, with any new pictures, in one commit.
  function change(id, ops, pics, message) {
    pending++;
    var at = now();
    if (ctx.demo) {
      var s = decks[id];
      (pics || []).forEach(function (p) { var u = URL.createObjectURL(new Blob([p.bytes], { type: p.type })); picUrls[p.path] = u; picBytes[p.path] = p.bytes; });
      return new Promise(function (res) { setTimeout(res, 150); }).then(function () {
        s.deck = applyOps(clone(s.deck), clone(ops), who(), at); s.at = Date.now();
        pending--; return s.deck;
      });
    }
    var tries = 0;
    function attempt() {
      return head().then(function (h) {
        return readDeckAt(h, id).then(function (r) {
          var next = applyOps(clone(r.deck), clone(ops), who(), at);
          var changes = (pics || []).map(function (p) { return { path: p.path, bytes: p.bytes }; });
          changes.push({ path: 'decks/' + id + '.json', text: serialize(next) });
          return commit(h, changes, message).then(function () { return next; });
        });
      }).catch(function (e) { if (e.race && ++tries < 5) return attempt(); throw e; });
    }
    return attempt().then(function (deck) {
      (pics || []).forEach(function (p) { picBytes[p.path] = p.bytes; picUrls[p.path] = URL.createObjectURL(new Blob([p.bytes], { type: p.type })); });
      decks[id] = { deck: deck, at: Date.now() };
      pending--; return deck;
    }, function (e) { pending--; throw e; });
  }

  // A picture's URL: blob from the repo (private, so through the API), cached for the page's life.
  var picLoading = {};
  function picUrl(file) {
    if (picUrls[file]) return Promise.resolve(picUrls[file]);
    if (ctx.demo) return Promise.resolve(DEMO_PICS[file] || '');
    if (picLoading[file]) return picLoading[file];
    var shaP = lastFiles[file] ? Promise.resolve(lastFiles[file]) : head().then(function (h) { return h.files[file]; });
    picLoading[file] = shaP.then(function (sha) {
      if (!sha) throw new Error('missing');
      return gh('GET', repo('/git/blobs/' + sha));
    }).then(function (b) {
      var bytes = b64ToBytes(b.content || ''), ext = file.split('.').pop();
      picBytes[file] = bytes;
      picUrls[file] = URL.createObjectURL(new Blob([bytes], { type: ext === 'jpg' ? 'image/jpeg' : 'image/' + ext }));
      delete picLoading[file];
      return picUrls[file];
    }, function (e) { delete picLoading[file]; throw e; });
    return picLoading[file];
  }
  function picBytesOf(file) {
    if (picBytes[file]) return Promise.resolve(picBytes[file]);
    return picUrl(file).then(function (u) { return picBytes[file] || fetch(u).then(function (r) { return r.arrayBuffer(); }).then(function (ab) { return (picBytes[file] = new Uint8Array(ab)); }); });
  }
  // Fill every <img data-pic> under root.
  function fillPics(root) {
    Array.prototype.forEach.call((root || document).querySelectorAll('img[data-pic]:not([src])'), function (img) {
      picUrl(img.getAttribute('data-pic')).then(function (u) { if (u) img.src = u; }, function () { img.alt = 'Picture not found'; img.classList.add('std-pic-missing'); });
    });
  }

  // A picked, pasted, or imported picture: PNG and JPEG kept as they are, anything else drawn into a PNG.
  function preparePic(blob, name) {
    if (blob.size > MAX_PIC * 4) return Promise.reject(new Error((name || 'That picture') + ' is over 32 MB.'));
    return createImageBitmap(blob).then(function (bmp) {
      var w = bmp.width, h = bmp.height;
      var keep = (blob.type === 'image/png' || blob.type === 'image/jpeg') && blob.size <= MAX_PIC;
      var big = Math.max(w, h) > 3000 ? 3000 / Math.max(w, h) : 1;
      if (keep && big === 1) return blob.arrayBuffer().then(function (ab) { bmp.close && bmp.close(); return { bytes: new Uint8Array(ab), type: blob.type, w: w, h: h, name: name || '' }; });
      var cw = Math.round(w * big), ch = Math.round(h * big);
      var cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
      cv.getContext('2d').drawImage(bmp, 0, 0, cw, ch);
      bmp.close && bmp.close();
      var type = blob.type === 'image/jpeg' ? 'image/jpeg' : 'image/png';
      return new Promise(function (res) { cv.toBlob(res, type, 0.9); }).then(function (b) {
        return b.arrayBuffer().then(function (ab) { return { bytes: new Uint8Array(ab), type: type, w: cw, h: ch, name: name || '' }; });
      });
    });
  }
  function picRecord(deckId, itemId, p) {
    var path = 'images/' + deckId + '/' + itemId + '-' + rid(6) + '.' + EXT[p.type];
    return { rec: { file: path, type: p.type, w: p.w, h: p.h, name: p.name || '' }, upload: { path: path, bytes: p.bytes, type: p.type } };
  }

  // ── State and routes ─────────────────────────────────────
  var el = null;
  var pick = null;            // the selected tool tile on the home page
  function route() {
    var m = /^#standards\/([a-z0-9-]+)(?:\/slides\/(\d+))?$/.exec(location.hash || '');
    if (!m || !deckDef(m[1])) return { deck: null };
    return { deck: m[1], slide: m[2] ? Math.max(1, +m[2]) : 0 };
  }
  function go(hash, replace) {
    var url = location.pathname + location.search + (hash || '');
    if (replace) history.replaceState(null, '', url); else history.pushState(null, '', url);
    draw(!replace);
  }
  window.addEventListener('hashchange', function () { onRoute(); });
  window.addEventListener('popstate', function () { onRoute(); });
  function onRoute() {
    if (route().deck && ctx.goHome && !(el && el.isConnected)) { ctx.goHome(); return; }   // Back into a deck while a board is open
    if (el && el.isConnected) draw();
  }

  // ── Drawing ──────────────────────────────────────────────
  function mount(target, c) {
    ctx = c || {};
    el = target;
    draw();
  }
  // top: a new page (scroll to the top); otherwise a redraw keeps the place.
  function draw(top) {
    if (!el || !el.isConnected) return;
    var r = route(), main = el.closest('#main');
    var y = main ? main.scrollTop : 0;
    el.innerHTML = r.deck ? deckPage(r) : homePage();
    if (r.deck) wireDeck(r); else wireHome();
    fillPics(el);
    if (main) main.scrollTop = top === true ? 0 : y;
  }

  var ARROW = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3l5 5-5 5"/></svg>';
  var TOOLS = [
    { id: 'fabcheck', cat: 'Fabrication', name: 'Fabcheck', href: '../pcb_dfm/index.html', art: 'art-fabcheck', dark: true,
      desc: 'Checks a PCB fab and assembly package the way a board house would, before you send it, and shows exactly where on the board each problem is. Send a checked package to a board here, where it becomes a revision.',
      chips: ['Gerbers', 'Drill', 'Pick-and-place', 'BOM', 'ODB++'], note: 'Files never leave the computer.' },
    { id: 'pincheck', cat: 'Schematic', name: 'Pincheck', proto: true, href: '../pincheck/index.html', art: 'art-pincheck',
      desc: 'Fabcheck’s companion for the schematic. Checks every IC against what its datasheet allows, from a library of part files: supply ranges, I/O levels across domains, pins that must be connected, pin functions, required capacitors, crystal load, and I2C addresses.',
      chips: ['Altium SchDoc', 'Protel2 netlist', 'KiCad netlist', 'Part library'], note: 'Files never leave the computer. Signed in, the part library syncs with Pincheck’s private data repo.' },
    { id: 'loom', cat: 'Harnesses', name: 'Loom', href: '../loom/index.html', art: 'art-loom',
      desc: 'Draws the harness a tech builds from: connector tables, cables, and wires in a wiring diagram, with connector faces, a wire list, and a BOM on one sheet. A board’s connectors come straight from its fab package here, with their pins and nets.',
      chips: ['Wiring diagram', 'Wire list', 'BOM', 'From a board'], note: 'Signed in, harnesses sync with Loom’s private data repo, where Signoff PL finds them.' },
    { id: 'flasher', cat: 'Firmware', name: 'Flasher', href: '../flasher/index.html', art: 'art-flasher',
      desc: 'Puts prebuilt firmware on a board from Chrome or Edge, with no Arduino IDE or ST programmer: pick the firmware, plug the board in by USB or a debug probe, and flash. It writes, reads the whole image back, and starts it.',
      chips: ['STM32 USB DFU', 'ST-LINK', 'Verify by read-back', 'Serial console'], note: 'Signed in, the firmware list comes from Flasher’s private data repo.' }
  ];
  // Versioned with EE, so a browser that cached an older copy of the hub's art fetches it again after an update.
  var ART = '../signoff/assets/tool-art.svg?v=' + encodeURIComponent(((window.SIGNOFF_VERSION || {}).hash) || '1');
  function link(href) { return href + (ctx.demo ? '?demo' : ''); }
  function art(id) { return '<svg viewBox="0 0 240 150" aria-hidden="true"><use href="' + ART + '#' + id + '"/></svg>'; }

  // Made-up art for the standards tiles: a footprint on its layers, and a schematic symbol with its pins.
  var DECK_ART = {
    footprints: '<svg viewBox="0 0 240 150" aria-hidden="true"><ellipse cx="120" cy="130" rx="86" ry="7" fill="#000" style="opacity:var(--art-shadow)"/>' +
      '<rect x="52" y="22" width="136" height="100" rx="4" fill="#3a3a3c"/>' +
      '<rect x="62" y="32" width="116" height="80" fill="none" stroke="#30c158" stroke-width="2" stroke-dasharray="5 3"/>' +
      '<rect x="84" y="46" width="72" height="52" fill="none" stroke="#ffd60a" stroke-width="2.5"/>' +
      '<g fill="#ff453a" fill-opacity=".9"><rect x="70" y="52" width="26" height="40" rx="3"/><rect x="144" y="52" width="26" height="40" rx="3"/></g>' +
      '<g fill="#8e8e93" fill-opacity=".55"><rect x="73" y="55" width="20" height="34" rx="2"/><rect x="147" y="55" width="20" height="34" rx="2"/></g>' +
      '<g stroke="#e5e5ea" stroke-width="1.4"><path d="M114 72h12M120 66v12"/></g><circle cx="120" cy="72" r="4" fill="none" stroke="#e5e5ea" stroke-width="1.4"/></svg>',
    schematics: '<svg viewBox="0 0 240 150" aria-hidden="true"><ellipse cx="120" cy="130" rx="86" ry="7" fill="#000" style="opacity:var(--art-shadow)"/>' +
      '<rect x="40" y="18" width="160" height="106" rx="5" fill="#f7f4ea" stroke="#c9c2ad"/>' +
      '<rect x="96" y="38" width="48" height="66" rx="2" fill="#fff6d6" stroke="#7a1c14" stroke-width="2"/>' +
      '<g stroke="#7a1c14" stroke-width="2" stroke-linecap="round"><path d="M84 50h12M84 64h12M84 78h12M84 92h12M144 50h12M144 64h12M144 78h12"/></g>' +
      '<g fill="none" stroke="#1f6f3a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M84 50H58v-14M84 78H64M84 92H54v12M156 50h26M156 64h18v20M156 78h10"/><path d="M50 104h8M52 108h4"/></g>' +
      '<g fill="#8a8370" fill-opacity=".75"><rect x="102" y="46" width="14" height="3" rx="1.5"/><rect x="102" y="60" width="10" height="3" rx="1.5"/><rect x="102" y="74" width="16" height="3" rx="1.5"/><rect x="124" y="60" width="14" height="3" rx="1.5"/></g>' +
      '<rect x="170" y="84" width="8" height="16" rx="1" fill="none" stroke="#1f6f3a" stroke-width="2"/><circle cx="64" cy="78" r="2.4" fill="#1f6f3a"/></svg>'
  };

  function homePage() {
    var t = TOOLS.filter(function (x) { return x.id === pick; })[0];
    return '<div class="page home-page">' +
      '<div class="eyebrow">Signoff EE</div><h1 class="page-title">Home</h1>' +
      (ctx.note ? '<div class="home-note">' + ctx.note + '</div>' : '<p class="home-lede">Tools for the electrical team, and the team’s own standards. Pick a board in the sidebar to review it.</p>') +
      '<section class="home-group" aria-labelledby="home-tools"><h2 class="home-group-title" id="home-tools">Tools</h2>' +
      '<div class="home-tiles">' + TOOLS.map(function (x) {
        return '<a class="pk-tile home-tile' + (x.id === pick ? ' sel' : '') + '" href="' + esc(link(x.href)) + '" data-home-tool="' + x.id + '">' +
          '<span class="pk-art' + (x.dark ? ' dark' : '') + '">' + art(x.art) + '</span><span class="pk-cat">' + esc(x.cat) + '</span>' +
          '<span class="pk-name">' + esc(x.name) + (x.proto ? ' <span class="pk-proto">Prototype</span>' : '') + '</span></a>';
      }).join('') + '</div>' +
      (t ? '<div class="home-about" aria-live="polite"><div class="home-about-text"><div class="pk-eyebrow">' + esc(t.cat) + '</div>' +
        '<h3>' + esc(t.name) + (t.proto ? ' <span class="pk-proto">Prototype</span>' : '') + '</h3><p>' + esc(t.desc) + '</p>' +
        '<div class="chips">' + t.chips.map(function (c) { return '<span class="chip">' + esc(c) + '</span>'; }).join('') + '</div>' +
        '<p class="note">' + esc(t.note) + '</p></div>' +
        '<div class="home-about-acts"><a class="btn btn-primary" href="' + esc(link(t.href)) + '">Open ' + esc(t.name) + ARROW + '</a>' +
        '<button class="btn btn-plain" data-home="unpick">Hide</button></div></div>'
        : '<p class="home-hint">Click a tool to read about it; click it again to open it.</p>') +
      '</section>' +
      '<section class="home-group" aria-labelledby="home-std"><h2 class="home-group-title" id="home-std">Internal standards</h2>' +
      '<p class="home-hint">How the electrical team draws parts and schematics. ' + (ctx.fte ? 'FTEs can add, edit, and import items.' : 'Read only.') + '</p>' +
      '<div class="home-tiles">' + DECKS.map(function (d) {
        var s = decks[d.id], n = s && s.deck ? s.deck.items.length : null;
        return '<a class="pk-tile home-tile" href="#standards/' + esc(d.id) + '" data-home-deck="' + esc(d.id) + '">' +
          '<span class="pk-art">' + (DECK_ART[d.id] || DECK_ART.footprints) + '</span><span class="pk-cat">' + esc(d.cat || 'Standards') + '</span>' +
          '<span class="pk-name">' + esc(d.title) + (n != null ? ' <span class="home-count">' + n + '</span>' : '') + '</span></a>';
      }).join('') + '</div></section></div>';
  }

  function wireHome() {
    DECKS.forEach(function (d) { if (!decks[d.id] || !decks[d.id].deck) load(d.id).then(function () { if (!route().deck) draw(); }, function () {}); });
    Array.prototype.forEach.call(el.querySelectorAll('[data-home-tool]'), function (a) {
      a.addEventListener('click', function (e) {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
        var id = a.getAttribute('data-home-tool');
        if (pick === id) return;   // a click on the selected tile follows the link
        e.preventDefault(); pick = id; draw();
      });
    });
    Array.prototype.forEach.call(el.querySelectorAll('[data-home-deck]'), function (a) {
      a.addEventListener('click', function (e) { if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) return; e.preventDefault(); go('#standards/' + a.getAttribute('data-home-deck')); });
    });
    var u = el.querySelector('[data-home="unpick"]');
    if (u) u.addEventListener('click', function () { pick = null; draw(); });
  }

  // Text: a line per paragraph, "- " lines as bullets.
  function bodyHtml(text) {
    var lines = String(text || '').split('\n'), out = '', list = false;
    lines.forEach(function (l) {
      var t = l.trim();
      if (!t) { if (list) { out += '</ul>'; list = false; } return; }
      var b = /^[-•*]\s+/.test(t);
      if (b && !list) { out += '<ul>'; list = true; }
      if (!b && list) { out += '</ul>'; list = false; }
      out += b ? '<li>' + esc(t.replace(/^[-•*]\s+/, '')) + '</li>' : '<p>' + esc(t) + '</p>';
    });
    return out + (list ? '</ul>' : '');
  }
  function picsHtml(it, cls) {
    return (it.pics || []).map(function (p, k) {
      return '<img class="' + cls + '" data-pic="' + esc(p.file) + '" alt="' + esc(it.title + (it.pics.length > 1 ? ' (' + (k + 1) + ')' : '')) + '"' + (p.w && p.h ? ' width="' + p.w + '" height="' + p.h + '"' : '') + ' loading="lazy">';
    }).join('');
  }

  var ICON = {
    back: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3L5 8l5 5"/></svg>',
    next: ARROW,
    plus: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M8 3v10M3 8h10"/></svg>',
    up: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10l4-4 4 4"/></svg>',
    down: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6l4 4 4-4"/></svg>',
    edit: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M11 2.5l2.5 2.5L6 12.5H3.5V10z"/></svg>',
    del: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5"/></svg>',
    imp: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v8M5 7l3 3 3-3M3 12.5h10"/></svg>',
    exp: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M8 10V2M5 5l3-3 3 3M3 12.5h10"/></svg>',
    full: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10"/></svg>',
    print: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M4.5 6V2.5h7V6M4.5 11H3a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1.5M4.5 9h7v4.5h-7z"/></svg>'
  };

  function deckPage(r) {
    var def = deckDef(r.deck), s = decks[r.deck] || {};
    if (!s.deck && !s.error) load(r.deck).then(draw, draw);
    var head = '<div class="std-crumbs"><a class="btn btn-plain std-back" href="#" data-std="home">' + ICON.back + 'Home</a></div>' +
      '<div class="eyebrow">Internal standards · ' + esc(def.cat || '') + '</div><h1 class="page-title">' + esc(def.title) + '</h1>';
    if (!s.deck) {
      return '<div class="page std-page">' + head + (s.error ? '<div class="std-empty"><p>' + esc(s.error) + '</p><button class="btn" data-std="retry">Try again</button></div>' : '<div class="std-empty"><p>Loading…</p></div>') + '</div>';
    }
    var d = s.deck, items = d.items, slides = !!r.slide && items.length > 0;
    var sub = items.length + ' item' + (items.length === 1 ? '' : 's') + (d.updatedAt ? ' · updated ' + esc(relTime(d.updatedAt)) + (d.updatedBy ? ' by ' + esc(d.updatedBy) : '') : '');
    var bar = '<div class="std-bar"><div class="seg" role="tablist"><button class="' + (slides ? '' : 'on') + '" data-std="list">List</button><button class="' + (slides ? 'on' : '') + '" data-std="slides"' + (items.length ? '' : ' disabled') + '>Slides</button></div>' +
      '<span class="std-spacer"></span>' +
      (ctx.fte ? '<button class="btn" data-std="add">' + ICON.plus + '<span>Add item</span></button><button class="btn" data-std="import">' + ICON.imp + '<span>Import .pptx</span></button>' : '') +
      '<button class="btn" data-std="export"' + (items.length ? '' : ' disabled') + '>' + ICON.exp + '<span>Export .pptx</span></button>' +
      '<button class="btn" data-std="print"' + (items.length ? '' : ' disabled') + '>' + ICON.print + '<span>Print</span></button></div>';
    var html = '<div class="page std-page' + (slides ? ' std-wide' : '') + '">' + head + '<div class="page-sub std-sub">' + sub + '</div>' + bar;
    if (!items.length) {
      html += '<div class="std-empty"><p>Nothing here yet.</p>' + (ctx.fte ? '<p class="note">Add an item by hand, or import the slides of a PowerPoint deck.</p><button class="btn btn-primary" data-std="add">' + ICON.plus + 'Add item</button> <button class="btn" data-std="import">' + ICON.imp + 'Import .pptx</button>' : '') + '</div>';
    } else if (slides) {
      var n = Math.min(r.slide, items.length), it = items[n - 1];
      html += '<div class="std-slides"><nav class="std-rail" aria-label="Slides">' + items.map(function (x, i) {
        return '<button class="std-thumb' + (i === n - 1 ? ' on' : '') + '" data-std-go="' + (i + 1) + '"><span class="std-thumb-n">' + (i + 1) + '</span><span class="std-thumb-t">' + esc(x.title || 'Untitled') + '</span></button>';
      }).join('') + '</nav>' +
        '<div class="std-stage-wrap"><div class="std-stage" tabindex="-1">' +
        '<div class="std-slide' + (it.pics.length ? '' : ' no-pic') + '"><div class="std-slide-text"><h2>' + esc(it.title || 'Untitled') + '</h2><div class="std-body">' + bodyHtml(it.body) + '</div></div>' +
        (it.pics.length ? '<div class="std-slide-pics n' + Math.min(it.pics.length, 4) + '">' + picsHtml(it, 'std-slide-pic') + '</div>' : '') + '</div>' +
        '<button class="std-nav prev" data-std-go="' + (n - 1) + '"' + (n > 1 ? '' : ' disabled') + ' aria-label="Previous">' + ICON.back + '</button>' +
        '<button class="std-nav next" data-std-go="' + (n + 1) + '"' + (n < items.length ? '' : ' disabled') + ' aria-label="Next">' + ICON.next + '</button></div>' +
        '<div class="std-stage-foot"><span class="std-counter">' + n + ' / ' + items.length + '</span><span class="std-spacer"></span>' +
        (ctx.fte ? '<button class="btn btn-plain" data-std-edit="' + esc(it.id) + '">' + ICON.edit + 'Edit</button>' : '') +
        '<button class="btn btn-plain" data-std="full">' + ICON.full + 'Full screen</button></div></div></div>';
    } else {
      html += '<ol class="std-list">' + items.map(function (it, i) {
        return '<li class="std-item card" data-item="' + esc(it.id) + '"><div class="std-item-head"><span class="std-n">' + (i + 1) + '</span><h3>' + esc(it.title || 'Untitled') + '</h3>' +
          (ctx.fte ? '<span class="std-acts"><button class="icon-btn" data-std-move="' + esc(it.id) + '" data-by="-1" title="Move up"' + (i ? '' : ' disabled') + '>' + ICON.up + '</button>' +
            '<button class="icon-btn" data-std-move="' + esc(it.id) + '" data-by="1" title="Move down"' + (i < items.length - 1 ? '' : ' disabled') + '>' + ICON.down + '</button>' +
            '<button class="icon-btn" data-std-edit="' + esc(it.id) + '" title="Edit">' + ICON.edit + '</button>' +
            '<button class="icon-btn" data-std-del="' + esc(it.id) + '" title="Delete">' + ICON.del + '</button></span>' : '') + '</div>' +
          '<div class="std-item-main' + (it.pics.length ? '' : ' no-pic') + '"><div class="std-body">' + (bodyHtml(it.body) || '<p class="note">No text.</p>') + '</div>' +
          (it.pics.length ? '<div class="std-item-pics">' + it.pics.map(function (p, k) { return '<button class="std-pic-btn" data-std-go="' + (i + 1) + '" title="Show as a slide">' + picsHtml({ title: it.title, pics: [p] }, 'std-item-pic') + '</button>'; }).join('') + '</div>' : '') + '</div></li>';
      }).join('') + '</ol>';
    }
    return html + '</div>';
  }

  function wireDeck(r) {
    var id = r.deck, items = decks[id] && decks[id].deck ? decks[id].deck.items : [];
    function on(sel, fn) { Array.prototype.forEach.call(el.querySelectorAll(sel), function (b) { b.addEventListener('click', function (e) { e.preventDefault(); fn(b, e); }); }); }
    on('[data-std="home"]', function () { go(''); });
    on('[data-std="retry"]', function () { decks[id] = {}; load(id).then(draw, draw); draw(); });
    on('[data-std="list"]', function () { go('#standards/' + id); });
    on('[data-std="slides"]', function () { go('#standards/' + id + '/slides/1'); });
    on('[data-std-go]', function (b) { var n = +b.getAttribute('data-std-go'); if (n >= 1 && n <= items.length) go('#standards/' + id + '/slides/' + n, !!r.slide); });
    on('[data-std="add"]', function () { editor(id, null, r.slide ? r.slide : null); });
    on('[data-std-edit]', function (b) { editor(id, b.getAttribute('data-std-edit')); });
    on('[data-std-move]', function (b) { run(id, [{ op: 'move', id: b.getAttribute('data-std-move'), by: +b.getAttribute('data-by') }], null, 'Move an item in ' + deckDef(id).title); });
    on('[data-std-del]', function (b) { removeItem(id, b.getAttribute('data-std-del')); });
    on('[data-std="import"]', function () { importSheet(id); });
    on('[data-std="export"]', function (b) { exportDeck(id, b); });
    on('[data-std="print"]', function () { printDeck(id); });
    on('[data-std="full"]', function () { var st = el.querySelector('.std-stage-wrap'); if (st && st.requestFullscreen) st.requestFullscreen().catch(function () {}); });
    var rail = el.querySelector('.std-thumb.on');
    if (rail) rail.scrollIntoView({ block: 'nearest' });
  }

  // ← and → step through slides (not while typing, and not under a sheet).
  document.addEventListener('keydown', function (e) {
    var r = route();
    if (!r.deck || !r.slide || !el || !el.isConnected) return;
    var a = document.activeElement;
    if (a && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable)) return;
    if (document.querySelector('.std-wrap, .sheet-wrap')) return;
    var n = decks[r.deck] && decks[r.deck].deck ? decks[r.deck].deck.items.length : 0;
    var to = e.key === 'ArrowRight' || e.key === 'PageDown' ? r.slide + 1 : e.key === 'ArrowLeft' || e.key === 'PageUp' ? r.slide - 1 : e.key === 'Home' ? 1 : e.key === 'End' ? n : 0;
    if (!to || to < 1 || to > n || e.metaKey || e.ctrlKey || e.altKey) return;
    e.preventDefault(); e.stopPropagation();
    go('#standards/' + r.deck + '/slides/' + to, true);
  }, true);

  function toast(text, action) { if (ctx.toast) ctx.toast(text, action); }
  function run(id, ops, pics, message, done) {
    return change(id, ops, pics, message).then(function (d) { draw(); if (done) done(d); return d; }, function (e) { toast('Couldn’t save: ' + e.message); draw(); throw e; });
  }
  function removeItem(id, itemId) {
    var d = decks[id].deck, i = d.items.map(function (x) { return x.id; }).indexOf(itemId);
    if (i < 0) return;
    var item = clone(d.items[i]);
    run(id, [{ op: 'remove', id: itemId }], null, 'Delete "' + (item.title || 'Untitled') + '" from ' + deckDef(id).title, function () {
      toast('Deleted ' + (item.title || 'the item'), { label: 'Undo', run: function () { run(id, [{ op: 'add', item: item, at: i }], null, 'Put back "' + (item.title || 'Untitled') + '" in ' + deckDef(id).title); } });
    }).catch(function () {});
  }

  // ── Sheets ───────────────────────────────────────────────
  function sheet(html, cls) {
    var w = document.createElement('div');
    w.className = 'std-wrap';
    w.innerHTML = '<div class="sheet std-sheet ' + (cls || '') + '" role="dialog" aria-modal="true">' + html + '</div>';
    document.body.appendChild(w);
    w.addEventListener('mousedown', function (e) { if (e.target === w && !w.dataset.busy) close(); });
    function key(e) { if (e.key === 'Escape' && !w.dataset.busy) { e.stopPropagation(); close(); } }
    document.addEventListener('keydown', key, true);
    function close() { document.removeEventListener('keydown', key, true); w.remove(); }
    w.close = close;
    return w;
  }

  // Add (itemId null) or edit an item: title, text, and pictures (pick, drop, or paste).
  function editor(deckId, itemId, after) {
    var d = decks[deckId].deck, it = itemId ? d.items.filter(function (x) { return x.id === itemId; })[0] : null;
    if (itemId && !it) return;
    var newId = it ? it.id : rid(8);
    var kept = it ? it.pics.slice() : [], added = [];
    var w = sheet('<div class="sheet-head"><h2>' + (it ? 'Edit item' : 'Add item') + '</h2><p>' + esc(deckDef(deckId).title) + '. A line of text is a paragraph; start a line with “- ” for a bullet.</p></div>' +
      '<div class="sheet-body"><div class="field"><label for="std-title">Title</label><input class="input" id="std-title" maxlength="200" value="' + esc(it ? it.title : '') + '"></div>' +
      '<div class="field"><label for="std-text">Text</label><textarea class="input" id="std-text" rows="7">' + esc(it ? it.body : '') + '</textarea></div>' +
      '<div class="field"><span class="field-label">Pictures</span><div class="std-edit-pics" id="std-pics"></div>' +
      '<label class="btn std-add-pic">' + ICON.plus + 'Add pictures<input type="file" accept="image/*" multiple hidden id="std-file"></label> <span class="note">or paste or drop them here</span></div></div>' +
      '<div class="sheet-foot"><span class="std-status note" id="std-status"></span><span class="spacer"></span><button class="btn" data-x="cancel">Cancel</button><button class="btn btn-primary" data-x="save">' + (it ? 'Save' : 'Add') + '</button></div>', 'wide');
    var box = $('#std-pics', w);
    function drawPics() {
      box.innerHTML = kept.map(function (p, k) { return '<figure><img data-pic="' + esc(p.file) + '" alt=""><button class="icon-btn" data-k="' + k + '" title="Remove">×</button></figure>'; }).join('') +
        added.map(function (p, k) { return '<figure><img src="' + p.url + '" alt=""><button class="icon-btn" data-a="' + k + '" title="Remove">×</button></figure>'; }).join('') ||
        '<p class="note">No pictures.</p>';
      fillPics(box);
      Array.prototype.forEach.call(box.querySelectorAll('[data-k]'), function (b) { b.onclick = function () { kept.splice(+b.dataset.k, 1); drawPics(); }; });
      Array.prototype.forEach.call(box.querySelectorAll('[data-a]'), function (b) { b.onclick = function () { URL.revokeObjectURL(added[+b.dataset.a].url); added.splice(+b.dataset.a, 1); drawPics(); }; });
    }
    function addFiles(files) {
      var list = Array.prototype.filter.call(files || [], function (f) { return /^image\//.test(f.type); });
      if (!list.length) return;
      $('#std-status', w).textContent = 'Reading ' + list.length + ' picture' + (list.length === 1 ? '' : 's') + '…';
      Promise.all(list.map(function (f) { return preparePic(f, f.name || 'pasted'); })).then(function (ps) {
        ps.forEach(function (p) { p.url = URL.createObjectURL(new Blob([p.bytes], { type: p.type })); added.push(p); });
        $('#std-status', w).textContent = ''; drawPics();
      }, function (e) { $('#std-status', w).textContent = e.message; });
    }
    drawPics();
    $('#std-file', w).addEventListener('change', function (e) { addFiles(e.target.files); e.target.value = ''; });
    w.addEventListener('paste', function (e) { var f = Array.prototype.map.call((e.clipboardData && e.clipboardData.items) || [], function (x) { return x.kind === 'file' ? x.getAsFile() : null; }).filter(Boolean); if (f.length) { e.preventDefault(); addFiles(f); } });
    w.addEventListener('dragover', function (e) { e.preventDefault(); });
    w.addEventListener('drop', function (e) { e.preventDefault(); addFiles(e.dataTransfer && e.dataTransfer.files); });
    $('[data-x="cancel"]', w).onclick = function () { added.forEach(function (p) { URL.revokeObjectURL(p.url); }); w.close(); };
    $('[data-x="save"]', w).onclick = function () {
      var title = $('#std-title', w).value.trim(), body = $('#std-text', w).value.replace(/\r/g, '').replace(/\s+$/, '');
      if (!title && !body && !kept.length && !added.length) { $('#std-status', w).textContent = 'Give it a title, some text, or a picture.'; return; }
      var ups = added.map(function (p) { return picRecord(deckId, newId, p); });
      var pics = kept.concat(ups.map(function (u) { return u.rec; }));
      var ops = it ? [{ op: 'update', id: it.id, fields: { title: title, body: body, pics: pics } }]
        : [{ op: 'add', item: { id: newId, title: title, body: body, pics: pics }, at: after == null ? null : after }];
      w.dataset.busy = '1';
      Array.prototype.forEach.call(w.querySelectorAll('button, input, textarea'), function (b) { b.disabled = true; });
      $('#std-status', w).textContent = 'Saving…';
      change(deckId, ops, ups.map(function (u) { return u.upload; }), (it ? 'Edit' : 'Add') + ' "' + (title || 'Untitled') + '" in ' + deckDef(deckId).title).then(function () {
        w.close(); toast(it ? 'Saved' : 'Added');
        if (!it && after != null) go('#standards/' + deckId + '/slides/' + (after + 1), true); else draw();
      }, function (e) {
        delete w.dataset.busy;
        Array.prototype.forEach.call(w.querySelectorAll('button, input, textarea'), function (b) { b.disabled = false; });
        $('#std-status', w).textContent = 'Couldn’t save: ' + e.message;
      });
    };
    setTimeout(function () { $('#std-title', w).focus(); }, 30);
  }

  // Import a .pptx: every slide listed with what it becomes; untick the ones to leave out.
  function importSheet(deckId) {
    var inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation';
    inp.onchange = function () {
      var f = inp.files && inp.files[0];
      if (!f) return;
      var w = sheet('<div class="sheet-head"><h2>Import ' + esc(f.name) + '</h2><p>Reading the slides…</p></div>', 'wide std-import');
      f.arrayBuffer().then(function (ab) { return window.SignoffPptx.read(new Uint8Array(ab)); }).then(function (deck) {
        var items = window.SignoffPptx.toItems(deck);
        return Promise.all(items.map(function (it) {
          return Promise.all(it.pics.map(function (p) { return preparePic(new Blob([p.bytes], { type: p.type }), p.name).catch(function () { return null; }); }))
            .then(function (ps) { it.ready = ps.filter(Boolean); it.ready.forEach(function (p) { p.url = URL.createObjectURL(new Blob([p.bytes], { type: p.type })); }); return it; });
        }));
      }).then(function (items) { importReview(w, deckId, f.name, items); }, function (e) {
        w.querySelector('.sheet').innerHTML = '<div class="sheet-head"><h2>Couldn’t read ' + esc(f.name) + '</h2><p>' + esc(e.message) + '</p></div><div class="sheet-foot"><button class="btn btn-primary" data-x="ok">OK</button></div>';
        $('[data-x="ok"]', w).onclick = w.close;
      });
    };
    inp.click();
  }
  function importReview(w, deckId, fileName, items) {
    var d = decks[deckId].deck;
    var left = items[0] && items[0].common && items[0].common.length ? '<p class="note">Left out, on most slides: ' + items[0].common.map(function (t) { return '“' + esc(t.length > 40 ? t.slice(0, 40) + '…' : t) + '”'; }).join(', ') + '.</p>' : '';
    w.querySelector('.sheet').innerHTML = '<div class="sheet-head"><h2>Import ' + esc(fileName) + '</h2><p>' + items.length + ' slides. Each ticked slide becomes an item; edit a title here or after.</p>' + left + '</div>' +
      '<div class="sheet-body"><ol class="std-imp">' + items.map(function (it, i) {
        return '<li class="std-imp-row' + (it.skip ? ' off' : '') + '"><label class="std-imp-tick"><input type="checkbox" data-i="' + i + '"' + (it.skip ? '' : ' checked') + '><span>Slide ' + it.slide + '</span></label>' +
          '<div class="std-imp-main"><input class="input std-imp-title" data-t="' + i + '" value="' + esc(it.title) + '" placeholder="Title (none found on this slide)">' +
          '<div class="std-body">' + (bodyHtml(it.body) || '<p class="note">No text.</p>') + '</div>' +
          (it.unshown ? '<p class="note">' + it.unshown + ' picture' + (it.unshown === 1 ? '' : 's') + ' in a format a browser can’t show (EMF, WMF, or TIFF) left out.</p>' : '') + '</div>' +
          '<div class="std-imp-pics">' + it.ready.map(function (p) { return '<img src="' + p.url + '" alt="">'; }).join('') + '</div></li>';
      }).join('') + '</ol></div>' +
      '<div class="sheet-foot"><label class="std-imp-mode"><select class="input" id="std-mode"><option value="add">Add to the end</option><option value="replace">Replace all ' + d.items.length + ' items</option></select></label>' +
      '<span class="std-status note" id="std-status"></span><span class="spacer"></span><button class="btn" data-x="cancel">Cancel</button><button class="btn btn-primary" data-x="go">Import</button></div>';
    var modeSel = $('#std-mode', w);
    if (!d.items.length) modeSel.parentNode.hidden = true;
    function count() {
      var n = w.querySelectorAll('[data-i]:checked').length;
      $('[data-x="go"]', w).textContent = 'Import ' + n + ' item' + (n === 1 ? '' : 's');
      $('[data-x="go"]', w).disabled = !n;
      Array.prototype.forEach.call(w.querySelectorAll('[data-i]'), function (c) { c.closest('.std-imp-row').classList.toggle('off', !c.checked); });
    }
    w.addEventListener('change', count); count();
    function release() { items.forEach(function (it) { it.ready.forEach(function (p) { URL.revokeObjectURL(p.url); }); }); }
    $('[data-x="cancel"]', w).onclick = function () { release(); w.close(); };
    $('[data-x="go"]', w).onclick = function () {
      var chosen = [], ups = [];
      Array.prototype.forEach.call(w.querySelectorAll('[data-i]:checked'), function (c) {
        var it = items[+c.dataset.i], itemId = rid(8);
        var u = it.ready.map(function (p) { return picRecord(deckId, itemId, p); });
        ups = ups.concat(u.map(function (x) { return x.upload; }));
        chosen.push({ id: itemId, title: $('[data-t="' + c.dataset.i + '"]', w).value.trim(), body: it.body, pics: u.map(function (x) { return x.rec; }) });
      });
      var replace = modeSel.value === 'replace' && d.items.length;
      if (replace && !w.dataset.sure) { w.dataset.sure = '1'; $('#std-status', w).textContent = 'This deletes the ' + d.items.length + ' items there now. Click Import again to go ahead.'; return; }
      var ops = replace ? [{ op: 'replaceAll', items: chosen }] : chosen.map(function (x) { return { op: 'add', item: x }; });
      w.dataset.busy = '1';
      Array.prototype.forEach.call(w.querySelectorAll('button, input, select'), function (b) { b.disabled = true; });
      $('#std-status', w).textContent = 'Saving ' + chosen.length + ' items…';
      change(deckId, ops, ups, 'Import ' + chosen.length + ' items into ' + deckDef(deckId).title + ' from ' + fileName).then(function () {
        release(); w.close(); toast('Imported ' + chosen.length + ' item' + (chosen.length === 1 ? '' : 's')); draw();
      }, function (e) {
        delete w.dataset.busy;
        Array.prototype.forEach.call(w.querySelectorAll('button, input, select'), function (b) { b.disabled = false; });
        $('#std-status', w).textContent = 'Couldn’t save: ' + e.message;
      });
    };
  }

  function exportDeck(deckId, btn) {
    var d = decks[deckId].deck, def = deckDef(deckId);
    btn.disabled = true;
    Promise.all(d.items.map(function (it) {
      return Promise.all(it.pics.map(function (p) { return picBytesOf(p.file).then(function (b) { return { bytes: b, type: p.type, w: p.w, h: p.h }; }, function () { return null; }); }))
        .then(function (ps) { return { title: it.title, body: it.body, pics: ps.filter(Boolean) }; });
    })).then(function (items) {
      var bytes = window.SignoffPptx.write({ title: def.title, sub: 'Dovetail · Signoff EE · ' + new Date().toISOString().slice(0, 10), items: items });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' }));
      a.download = def.title.replace(/[^\w.+-]+/g, '_') + '_' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '.pptx';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
      btn.disabled = false;
    }, function (e) { btn.disabled = false; toast('Couldn’t export: ' + e.message); });
  }

  // Print: one item per landscape page, in EE's report overlay (#report; its Print and Close buttons are app.js's,
  // and EE's print CSS prints only the report).
  function printDeck(deckId) {
    var d = decks[deckId].deck, def = deckDef(deckId), r = document.getElementById('report');
    if (!r) return;
    r.innerHTML = '<div class="report-bar"><b>' + esc(def.title) + '</b><div style="display:flex;gap:8px"><button class="btn" data-act="close-report">Close</button><button class="btn btn-primary" data-act="print">Print / Save PDF</button></div></div>' +
      d.items.map(function (it, i) {
        return '<div class="paper std-paper"><div class="std-paper-head"><span>' + esc(def.title) + '</span><span>' + (i + 1) + ' / ' + d.items.length + '</span></div>' +
          '<h2>' + esc(it.title || 'Untitled') + '</h2><div class="std-paper-main' + (it.pics.length ? '' : ' no-pic') + '"><div class="std-body">' + bodyHtml(it.body) + '</div>' +
          (it.pics.length ? '<div class="std-paper-pics">' + picsHtml(it, 'std-paper-pic').replace(/ loading="lazy"/g, '') + '</div>' : '') + '</div></div>';
      }).join('');
    r.hidden = false; r.scrollTop = 0;
    fillPics(r);
  }

  // ── Demo: two made-up decks (never the team's real standards) ──
  function svgUrl(svg) { return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); }
  function pads(highlight) {
    var c = { cu: '#d9534f', silk: '#f2d24b', crt: '#3fbf5f', asm: '#4f9de0' }[highlight] || '#d9534f';
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 260"><rect width="400" height="260" fill="#2b2b2e"/>' +
      '<rect x="60" y="40" width="280" height="180" fill="none" stroke="' + (highlight === 'crt' ? c : '#555') + '" stroke-width="' + (highlight === 'crt' ? 4 : 2) + '" stroke-dasharray="8 5"/>' +
      '<rect x="110" y="70" width="180" height="120" fill="none" stroke="' + (highlight === 'asm' ? c : '#555') + '" stroke-width="' + (highlight === 'asm' ? 4 : 2) + '"/>' +
      '<rect x="90" y="85" width="60" height="90" rx="6" fill="' + (highlight === 'cu' ? c : '#6b6b70') + '"/><rect x="250" y="85" width="60" height="90" rx="6" fill="' + (highlight === 'cu' ? c : '#6b6b70') + '"/>' +
      '<path d="M100 60h200M100 200h200" stroke="' + (highlight === 'silk' ? c : '#555') + '" stroke-width="' + (highlight === 'silk' ? 6 : 3) + '" stroke-linecap="round"/>' +
      '<path d="M188 130h24M200 118v24" stroke="#ddd" stroke-width="2"/></svg>';
  }
  var DEMO_PICS = {
    'images/footprints/demo1-a.png': svgUrl(pads('cu')), 'images/footprints/demo2-a.png': svgUrl(pads('asm')),
    'images/footprints/demo3-a.png': svgUrl(pads('crt')), 'images/footprints/demo4-a.png': svgUrl(pads('silk')),
    'images/schematics/demo6-a.png': svgUrl('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 260"><rect width="400" height="260" fill="#f7f4ea"/><rect x="150" y="60" width="100" height="140" fill="#fff6d6" stroke="#7a1c14" stroke-width="3"/><path d="M110 90h40M110 130h40M110 170h40M250 90h40M250 130h40" stroke="#7a1c14" stroke-width="3"/><g font-family="sans-serif" font-size="14" fill="#333"><text x="40" y="95">VDD</text><text x="40" y="135">SDA</text><text x="40" y="175">GND</text><text x="300" y="95">INT</text><text x="300" y="135">SCL</text></g></svg>')
  };
  function demoDeck(id) {
    var at = new Date(Date.now() - 3 * 86400000).toISOString(), by = 'Demo engineer';
    var mk = function (n, title, body, pic) { return { id: 'demo' + n + 'aa', title: title, body: body, pics: pic ? [{ file: pic, type: 'image/png', w: 400, h: 260, name: '' }] : [], updatedAt: at, updatedBy: by }; };
    if (id === 'schematics') return cleanDeck({ title: 'Schematics', updatedAt: at, updatedBy: by, items: [
      mk(5, 'Sheet order', 'Sheet 1 is the block diagram and revision history.\nPower comes next, then each subcircuit in signal-flow order.\n- One subcircuit per sheet where it fits'),
      mk(6, 'Symbols', 'Power pins on the left or top, grounds at the bottom.\nInputs on the left, outputs on the right.', 'images/schematics/demo6-a.png'),
      mk(7, 'Net names', 'Name every net that leaves a sheet.\n- Active-low nets end in _N\n- Rails name their voltage: 3V3, 5V0')
    ] }, id);
    return cleanDeck({ title: 'Footprints', updatedAt: at, updatedBy: by, items: [
      mk(1, 'Copper', 'The top copper layer holds the pads.\nUse the bottom layer only for parts with pads on both sides.', 'images/footprints/demo1-a.png'),
      mk(2, 'Assembly', 'Draw the body outline and the designator on the assembly layer, in 0.1 mm (4 mil) lines.', 'images/footprints/demo2-a.png'),
      mk(3, 'Courtyard', 'Draw the courtyard around pads and body with its clearance, and a cross at the part’s origin.', 'images/footprints/demo3-a.png'),
      mk(4, 'Silkscreen', 'Keep silkscreen off pads and out of the assembly outline.\n- Mark pin 1\n- Mark polarity on diodes and polarized capacitors', 'images/footprints/demo4-a.png')
    ] }, id);
  }

  window.SignoffHome = {
    mount: mount,
    // The logo: back to the home page itself, not a deck.
    reset: function () { pick = null; if (route().deck) history.pushState(null, '', location.pathname + location.search); },
    // A board opened: forget a deck route, so Back and reload don't land in it.
    leave: function () { if (route().deck) history.replaceState(null, '', location.pathname + location.search); el = null; },
    busy: function () { return pending > 0 || !!document.querySelector('.std-wrap'); },
    _test: { cleanDeck: cleanDeck, applyOps: applyOps, bodyHtml: bodyHtml, route: route, demoDeck: demoDeck }
  };
})();
