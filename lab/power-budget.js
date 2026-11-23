/* Power budget lab (Scribe EE, branch power-budget). Not an engine file.
   Power parameters live in each block's Power line, as extra words in a rail's brackets:
     Power: 5V (sink, 4.5–5.5 V, 72 mA, max 144 mA), 3V3 (source, 3.25–3.35 V, up to 2 A, buck 88%)
   The engine's specPowerItems reads rail, role, and "no tree" from the same text; this file reads the rest
   (parsePower) and writes it back (writePower), keeping any word it doesn't know. The budget is derived by
   rail name, as the power tree draws it: a rail's load is the sum of what its sinks draw, a converter's input
   is worked out from its outputs (efficiency, quiescent current when linear, or pass-through), and the
   blocks that make a rail and use none are the input. */
(function () {
  'use strict';
  var S = window.Signoff || {}, M = S.model, C = S.config || {};
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  // ── The demo: the Main PCBA's blocks from config.js, with made-up numbers on their Power lines ──
  var NUMBERS = {
    'Mains input': 'AC (source, 100–240 V, pass-through, limit 1.5 W), AC line (source, 100–240 V, pass-through)',
    'Isolated supply': 'AC (sink, 85–264 V), 5V (source, 4.85–5.15 V, up to 400 mA, 72%)',
    '3V3 buck': '5V (sink, 2.7–5.5 V), 3V3 (source, 3.25–3.35 V, up to 2 A, buck 88%)',
    'MCU': '3V3 (sink, 1.8–3.6 V, 12 mA, max 25 mA)',
    'Wi-Fi module': '3V3 (sink, 3.0–3.6 V, 80 mA, max 350 mA)',
    'Relay outputs': 'AC line (sink, no budget), 5V (sink, 4.5–5.5 V, 72 mA, max 144 mA)',
    'Status LEDs': '3V3 (sink, 2 mA, max 6 mA)',
    'Display connector': '3V3 (sink, 3.0–3.6 V, 40 mA, max 90 mA)'
  };
  function demoBlocks() {
    var proj = ((C.demo || {}).projects || []).filter(function (p) { return (p.spec || []).some(function (l) { return l === '# Main PCBA'; }); })[0];
    var out = [], cur = null;
    (proj ? proj.spec : []).forEach(function (l) {
      var h = /^#+\s+(.*)$/.exec(l);
      if (h) { cur = { title: h[1].trim(), power: '', engine: '' }; return; }
      var p = /^\s*power\s*:\s*(.*)$/i.exec(l);
      if (p && cur) { cur.engine = p[1]; cur.power = NUMBERS[cur.title] || p[1]; out.push(cur); }
    });
    return out;
  }

  // ── Numbers and units ──
  function num(s) { var x = parseFloat(String(s).replace(',', '.')); return isFinite(x) ? x : null; }
  function tidy(x, p) { return String(+(+x).toPrecision(p || 4)); }
  function toMa(v, u) { u = String(u || '').toLowerCase(); return u === 'a' ? v * 1000 : u === 'µa' || u === 'ua' ? v / 1000 : v; }
  function toW(v, u) { return String(u).toLowerCase() === 'mw' ? v / 1000 : v; }
  function fmtI(ma) {
    if (ma == null || !isFinite(ma)) return '—';
    var a = Math.abs(ma);
    return a >= 1000 ? tidy(ma / 1000, 3) + ' A' : a < 1 && a > 0 ? tidy(ma * 1000, 3) + ' µA' : tidy(ma, 3) + ' mA';
  }
  function fmtP(w) {
    if (w == null || !isFinite(w)) return '—';
    return Math.abs(w) >= 1 ? tidy(w, 3) + ' W' : tidy(w * 1000, 3) + ' mW';
  }
  function fmtV(a, b) { return a == null && b == null ? '' : a === b || b == null ? tidy(a) + ' V' : a == null ? tidy(b) + ' V' : tidy(a) + '–' + tidy(b) + ' V'; }
  function pct(x) { return Math.round(x * 100) + '%'; }

  // ── Parse and write a Power line ──
  // Words in a rail's brackets: source | sink, a voltage or range ("3.0–3.6 V", "3.3 V"), a current ("80 mA",
  // "max 350 mA"), a power ("0.2 W", "max 0.5 W"), "up to 2 A" (a source's capacity), a converter ("buck 88%",
  // "88%", "switching", "linear", "Iq 50 µA", "pass-through"), "limit 1.5 W" (an input's budget), "no budget",
  // and "no tree". Anything else is kept as written (extra).
  var CONV = /^(buck|boost|buck-boost|sepic|flyback|switching|switcher|converter|dc-dc)$/i;
  function parseWords(label) {
    var o = { role: 'sink', tree: true, budget: true, vmin: null, vmax: null, ityp: null, imax: null, ptyp: null, pmax: null, cap: null, conv: '', convWord: '', eff: null, iq: null, limit: null, extra: [] };
    o.toks = [];
    String(label || '').split(',').map(function (w) { return w.trim(); }).filter(Boolean).forEach(function (w) {
      var before = JSON.stringify(groupVals(o)), nx = o.extra.length;
      word(w);
      var after = groupVals(o), b0 = JSON.parse(before), g = GROUPS.filter(function (k) { return JSON.stringify(after[k]) !== JSON.stringify(b0[k]); });
      // "Iq …" also sets the converter to linear; it belongs to iq. A word that changes nothing is still its group's.
      var grp = o.extra.length > nx ? 'extra' : g.indexOf('iq') >= 0 ? 'iq' : g[0] || wordGroup(w);
      o.toks.push({ w: w, g: grp });
    });
    o.toks.forEach(function (t) { t.snap = t.g === 'extra' ? null : JSON.stringify(groupVals(o)[t.g]); });
    return o;
    function word(w) {
      var l = w.toLowerCase().replace(/\s+/g, ' '), m;
      if (l === 'source' || l === 'sink') o.role = l;
      else if (l === 'no tree') o.tree = false;
      else if (l === 'tree') o.tree = true;
      else if (l === 'no budget') o.budget = false;
      else if ((m = /^([\d.]+)\s*(?:–|—|-|to)\s*([\d.]+)\s*v$/.exec(l))) { o.vmin = num(m[1]); o.vmax = num(m[2]); }
      else if ((m = /^([\d.]+)\s*v\s*±\s*([\d.]+)\s*%$/.exec(l))) { var v = num(m[1]), t = num(m[2]) / 100; o.vmin = +(v * (1 - t)).toPrecision(4); o.vmax = +(v * (1 + t)).toPrecision(4); }
      else if ((m = /^([\d.]+)\s*v$/.exec(l))) { o.vmin = o.vmax = num(m[1]); }
      else if ((m = /^up to ([\d.]+)\s*(µa|ua|ma|a)$/.exec(l))) o.cap = toMa(num(m[1]), m[2]);
      else if ((m = /^max ([\d.]+)\s*(µa|ua|ma|a)$/.exec(l))) o.imax = toMa(num(m[1]), m[2]);
      else if ((m = /^max ([\d.]+)\s*(mw|w)$/.exec(l))) o.pmax = toW(num(m[1]), m[2]);
      else if ((m = /^limit ([\d.]+)\s*(mw|w)$/.exec(l))) o.limit = toW(num(m[1]), m[2]);
      else if ((m = /^iq ([\d.]+)\s*(µa|ua|ma|a)$/.exec(l))) { o.iq = toMa(num(m[1]), m[2]); o.conv = 'linear'; }
      else if ((m = /^([\d.]+)\s*(µa|ua|ma|a)$/.exec(l))) o.ityp = toMa(num(m[1]), m[2]);
      else if ((m = /^([\d.]+)\s*(mw|w)$/.exec(l))) o.ptyp = toW(num(m[1]), m[2]);
      else if ((m = /^(?:([a-z-]+)\s+)?([\d.]+)\s*%$/.exec(l)) && (!m[1] || CONV.test(m[1]))) { o.eff = num(m[2]); o.conv = 'switch'; o.convWord = m[1] || ''; }
      else if (CONV.test(l)) { o.conv = 'switch'; o.convWord = l; }
      else if (l === 'linear' || l === 'ldo') { o.conv = 'linear'; o.convWord = l === 'ldo' ? 'LDO' : ''; }
      else if (l === 'pass-through' || l === 'pass through') o.conv = 'pass';
      else o.extra.push(w);
    }
  }
  // The fields a word can set, by group: a word is written back as it was unless its group changed.
  var GROUPS = ['role', 'v', 'ityp', 'imax', 'ptyp', 'pmax', 'cap', 'conv', 'iq', 'limit', 'budget', 'tree'];
  function groupVals(o) {
    return { role: o.role, v: [o.vmin, o.vmax], ityp: o.ityp, imax: o.imax, ptyp: o.ptyp, pmax: o.pmax, cap: o.cap, conv: [o.conv, o.eff, o.convWord], iq: o.iq, limit: o.limit, budget: o.budget, tree: o.tree };
  }
  function wordGroup(w) { var l = w.toLowerCase(); return l === 'source' || l === 'sink' ? 'role' : l === 'tree' || l === 'no tree' ? 'tree' : 'extra'; }
  function parsePower(text) {
    var engine = M.specPowerItems(text);   // rail, role, and tree, as the engine reads them
    return M.specLinkItems(text).filter(function (it) { return it.name.trim(); }).map(function (it, i) {
      var o = parseWords(it.label);
      o.rail = it.name.trim();
      if (engine[i]) { o.engineRole = engine[i].role; o.engineTree = engine[i].tree; }
      return o;
    });
  }
  function itemWords(o) {
    var canon = {}, want = canonWords(o);
    want.forEach(function (x) { (canon[x.g] = canon[x.g] || []).push(x.w); });
    var out = [], done = {}, vals = groupVals(o);
    (o.toks || []).forEach(function (t) {
      if (t.g === 'extra') { if ((o.extra || []).indexOf(t.w) >= 0) out.push(t.w); return; }
      if (done[t.g]) return;
      done[t.g] = 1;
      if (JSON.stringify(vals[t.g]) === t.snap && (canon[t.g] || []).length) out.push(t.w);
      else out = out.concat(canon[t.g] || []);
    });
    want.forEach(function (x) { if (!done[x.g]) { out.push(x.w); } });
    (o.extra || []).forEach(function (w) { if (out.indexOf(w) < 0) out.push(w); });
    return out;
  }
  function canonWords(o) {
    var w = [], add = function (g, x) { w.push({ g: g, w: x }); };
    add('role', o.role);
    var v = fmtV(o.vmin, o.vmax); if (v) add('v', v);
    if (o.role === 'sink') {
      if (o.ityp != null) add('ityp', fmtI(o.ityp));
      if (o.imax != null) add('imax', 'max ' + fmtI(o.imax));
      if (o.ptyp != null) add('ptyp', fmtP(o.ptyp));
      if (o.pmax != null) add('pmax', 'max ' + fmtP(o.pmax));
    } else {
      if (o.cap != null) add('cap', 'up to ' + fmtI(o.cap));
      if (o.conv === 'switch') add('conv', o.eff != null ? (o.convWord ? o.convWord + ' ' : '') + tidy(o.eff, 3) + '%' : o.convWord || 'switching');
      if (o.conv === 'linear') { add('conv', o.convWord || 'linear'); if (o.iq != null) add('iq', 'Iq ' + fmtI(o.iq)); }
      if (o.conv === 'pass') add('conv', 'pass-through');
      if (o.limit != null) add('limit', 'limit ' + fmtP(o.limit));
    }
    if (o.budget === false) add('budget', 'no budget');
    if (o.tree === false) add('tree', 'no tree');
    return w;
  }
  function writePower(items) {
    return items.map(function (o) { return (/[,()"]/.test(o.rail) ? '"' + o.rail.replace(/"/g, '') + '"' : o.rail) + ' (' + itemWords(o).join(', ') + ')'; }).join(', ');
  }

  // ── State ──
  var state = { blocks: demoBlocks(), sel: 2, open: {}, scn: 'typ', margin: 20, cap: 'panel', view: 'tree', tableEdit: false };
  try { var saved = JSON.parse(localStorage.getItem('pb-lab') || 'null'); if (saved && saved.blocks) Object.assign(state, saved, { open: {} }); } catch (e) { /* no storage */ }
  function save() { try { localStorage.setItem('pb-lab', JSON.stringify({ blocks: state.blocks, sel: state.sel, scn: state.scn, margin: state.margin, cap: state.cap, view: state.view })); } catch (e) { /* no storage */ } }

  // ── The budget ──
  function railNameV(name) {
    var m = /^(\d+)V(\d+)$/i.exec(name); if (m) return num(m[1] + '.' + m[2]);
    m = /(\d+(?:\.\d+)?)\s*V\b/i.exec(name); return m ? num(m[1]) : null;
  }
  function analyse(scn) {
    var B = state.blocks.map(function (b, bi) { return { bi: bi, title: b.title, items: parsePower(b.power) }; });
    var rails = {}, order = [], issues = [];
    B.forEach(function (b) {
      b.items.forEach(function (it, ii) {
        it.b = b; it.ii = ii;
        var k = it.rail.toLowerCase();
        if (!rails[k]) { rails[k] = { key: k, name: it.rail, sources: [], sinks: [] }; order.push(k); }
        (it.role === 'source' ? rails[k].sources : rails[k].sinks).push(it);
        it.r = rails[k];
      });
      b.outs = b.items.filter(function (x) { return x.role === 'source' && x.budget; });
      b.ins = b.items.filter(function (x) { return x.role === 'sink' && x.budget && !b.items.some(function (y) { return y.role === 'source' && y.r === x.r; }); });
      b.conv = b.outs.length > 0 && b.ins.length > 0;
      b.root = b.outs.length > 0 && b.ins.length === 0;
      b.input = b.conv ? b.ins[0] : null;
      if (b.conv && b.ins.length > 1) issues.push({ sev: 'na', text: b.title + ' uses ' + b.ins.map(function (x) { return x.rail; }).join(' and ') + '; its outputs are charged to ' + b.input.rail + ' only.' });
    });
    function srcs(r) { return r.sources.filter(function (s) { return s.budget; }); }
    // Typical: the middle of the source's range. Worst case: its top for a load's power (P = V·I) and its
    // bottom for a converter's input current (low line draws the most).
    function railV(r, end) {
      var s = srcs(r)[0] || r.sources[0];
      if (s && s.vmin != null) return scn !== 'max' ? (s.vmin + s.vmax) / 2 : end === 'lo' ? s.vmin : s.vmax;
      return railNameV(r.name);
    }
    var memo = {}, busy = {};
    function sinkLoad(it) {
      if (!it.budget) return { i: 0, p: 0, off: true };
      if (it.b.conv && it === it.b.input) { var d = convIn(it.b); return { i: d.iin, p: d.pin, derived: true, assumed: d.assumed }; }
      var V = railV(it.r);
      var i = scn === 'max' ? (it.imax != null ? it.imax : it.ityp) : (it.ityp != null ? it.ityp : it.imax);
      var p = scn === 'max' ? (it.pmax != null ? it.pmax : it.ptyp) : (it.ptyp != null ? it.ptyp : it.pmax);
      if (i != null) p = V != null ? V * i / 1000 : p;
      else if (p != null && V) i = p / V * 1000;
      return { i: i, p: p, missing: i == null && p == null };
    }
    function railOut(r) {
      if (memo['r' + r.key]) return memo['r' + r.key];
      if (busy['r' + r.key]) return { i: 0, p: 0, loop: true };
      busy['r' + r.key] = 1;
      var o = { i: 0, p: 0, missing: [] };
      r.sinks.forEach(function (k) {
        if (r.sources.some(function (s) { return s.b === k.b; })) return;
        var l = sinkLoad(k);
        if (l.missing) { o.missing.push(k); return; }
        o.i += l.i || 0; o.p += l.p || 0;
      });
      return (memo['r' + r.key] = o);
    }
    function convIn(b) {
      if (memo['b' + b.bi]) return memo['b' + b.bi];
      if (busy['b' + b.bi]) return { pin: 0, iin: 0, loss: 0 };
      busy['b' + b.bi] = 1;
      var vin = b.input ? railV(b.input.r, 'lo') : null, vinP = b.input ? railV(b.input.r, 'hi') : null, pin = 0, pout = 0, iin = 0, assumed = false;
      b.outs.forEach(function (s) {
        var n = srcs(s.r).length || 1, o = railOut(s.r);
        s.iout = o.i / n; s.pout = o.p / n;
        var V = railV(s.r);
        if (s.conv === 'linear') { s.iin = s.iout + (s.iq || 0); s.pin = vinP != null ? vinP * s.iin / 1000 : s.pout; }
        else if (s.conv === 'pass' || b.root) { s.pin = s.pout; s.iin = vin ? s.pin / vin * 1000 : null; }
        else { var e = s.eff != null ? s.eff : 85; if (s.eff == null) { assumed = true; s.effAssumed = true; } s.pin = s.pout / (e / 100); s.iin = vin ? s.pin / vin * 1000 : null; }
        if (s.iin != null) iin += s.iin;
        s.loss = s.pin - s.pout;
        if (s.conv === 'linear' && vin != null && V != null && vin < V) s.dropout = true;
        pin += s.pin; pout += s.pout;
      });
      return (memo['b' + b.bi] = { pin: pin, pout: pout, loss: pin - pout, iin: vin ? iin : null, assumed: assumed });
    }
    B.forEach(function (b) { if (b.outs.length) b.res = convIn(b); });
    B.forEach(function (b) { b.items.forEach(function (it) { if (it.role === 'sink') it.load = sinkLoad(it); }); });

    // Totals: what the inputs deliver, what the loads take, what the converters lose.
    var t = { input: 0, loads: 0, losses: 0, limit: null };
    B.forEach(function (b) {
      if (b.root) { t.input += b.res.pout; b.outs.forEach(function (s) { if (s.limit != null) t.limit = (t.limit || 0) + s.limit; }); }
      else if (b.conv) t.losses += b.res.loss;
      b.items.forEach(function (it) { if (it.role === 'sink' && it.budget && !it.load.derived && !it.load.missing && !b.root && !(b.conv && it === b.input)) t.loads += it.load.p || 0; });
    });
    t.eff = t.input ? t.loads / t.input : null;

    // Checks
    var m = state.margin / 100;
    B.forEach(function (b) { b.flags = 0; });
    B.forEach(function (b) {
      b.outs.forEach(function (s) {
        if (s.cap != null) {
          s.util = s.iout / s.cap;
          if (s.util > 1) { issues.push({ sev: 'bad', b: b.bi, text: b.title + ': ' + s.rail + ' loads ' + fmtI(s.iout) + ', over the ' + fmtI(s.cap) + ' it can supply.' }); b.flags++; }
          else if (s.util > 1 - m) { issues.push({ sev: 'warn', b: b.bi, text: b.title + ': ' + s.rail + ' at ' + pct(s.util) + ' of ' + fmtI(s.cap) + ', under the ' + state.margin + '% margin.' }); b.flags++; }
        } else if (!b.root) issues.push({ sev: 'na', b: b.bi, text: b.title + ': no capacity for ' + s.rail + ' ("up to …").' });
        if (s.effAssumed) issues.push({ sev: 'na', b: b.bi, text: b.title + ': no efficiency for ' + s.rail + '; 85% assumed.' });
        if (s.dropout) { issues.push({ sev: 'bad', b: b.bi, text: b.title + ': a linear regulator making ' + s.rail + ' from a lower input.' }); b.flags++; }
        if (srcs(s.r).length > 1) issues.push({ sev: 'na', b: b.bi, text: s.rail + ' has ' + srcs(s.r).length + ' sources; its load is split evenly.' });
        s.r.sinks.forEach(function (k) {
          if (k.b === b || s.vmin == null || k.vmin == null) return;
          if (k.vmin > s.vmin + 1e-9 || k.vmax < s.vmax - 1e-9) {
            k.vbad = true;
            issues.push({ sev: 'bad', b: k.b.bi, text: k.b.title + ' accepts ' + fmtV(k.vmin, k.vmax) + ' on ' + k.rail + ', but ' + b.title + ' makes ' + fmtV(s.vmin, s.vmax) + '.' }); k.b.flags++;
          }
        });
      });
      b.items.forEach(function (it) {
        if (it.role !== 'sink' || !it.budget) return;
        if (it.load.missing) issues.push({ sev: 'warn', b: b.bi, text: b.title + ': no current or power for ' + it.rail + '.' });
        if (!it.r.sources.length) issues.push({ sev: 'warn', b: b.bi, text: 'No block makes ' + it.rail + ' (used by ' + b.title + ').' });
        if (it.vmin == null && !(b.conv && it === b.input)) issues.push({ sev: 'na', b: b.bi, text: b.title + ': no voltage range for ' + it.rail + ', so it isn\'t checked.' });
      });
    });
    if (t.limit != null) {
      if (t.input > t.limit) issues.unshift({ sev: 'bad', text: 'The board draws ' + fmtP(t.input) + ', over its ' + fmtP(t.limit) + ' limit.' });
      else if (t.input > t.limit * (1 - m)) issues.unshift({ sev: 'warn', text: 'The board draws ' + fmtP(t.input) + ', within ' + state.margin + '% of its ' + fmtP(t.limit) + ' limit.' });
    }
    // Depths for the drawings: a block sits one column right of the blocks that make the rails it uses.
    B.forEach(function (b) { b.depth = 0; });
    for (var n = 0; n < B.length; n++) {
      B.forEach(function (b) {
        b.items.forEach(function (it) {
          if (it.role !== 'sink') return;
          it.r.sources.forEach(function (s) { if (s.b !== b) b.depth = Math.max(b.depth, Math.min(s.b.depth + 1, B.length)); });
        });
      });
    }
    var rank = { bad: 0, warn: 1, na: 2 };
    issues.sort(function (a, c) { return rank[a.sev] - rank[c.sev]; });
    return { B: B, rails: rails, order: order, t: t, issues: issues, railV: railV, srcs: srcs, scn: scn };
  }

  // ── Capture: the block panel ──
  var CHEV = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3.5l4.5 4.5L6 12.5"/></svg>';
  function inp(bi, ii, k, v, opts) {
    opts = opts || {};
    var shown = v == null ? '' : opts.scale ? tidy(v * opts.scale) : tidy(v);
    return '<input class="input" type="number" step="any" min="0" data-b="' + bi + '" data-i="' + ii + '" data-k="' + k + '"' + (opts.scale ? ' data-scale="' + opts.scale + '"' : '') + ' value="' + esc(shown) + '" placeholder="' + esc(opts.ph || '') + '" aria-label="' + esc(opts.label || k) + '">';
  }
  function gist(it, A) {
    var b = it.b, bits = [];
    if (it.role === 'sink') {
      if (b.conv && it === b.input) {
        var ty = A.typ.B[b.bi].input.load, mx = A.max.B[b.bi].input.load;
        bits.push('draws ' + fmtI(ty.i) + ', max ' + fmtI(mx.i) + ' (from its outputs)');
      } else {
        var v = fmtV(it.vmin, it.vmax); if (v) bits.push('<span' + (it.vbad ? ' class="bad"' : '') + '>accepts ' + esc(v) + '</span>');
        if (it.ityp != null || it.imax != null) bits.push(fmtI(it.ityp) + (it.imax != null ? ', max ' + fmtI(it.imax) : ''));
        else if (it.ptyp != null || it.pmax != null) bits.push(fmtP(it.ptyp) + (it.pmax != null ? ', max ' + fmtP(it.pmax) : ''));
        else if (it.budget) bits.push('<span class="bad">no current yet</span>');
      }
    } else {
      var v2 = fmtV(it.vmin, it.vmax); if (v2) bits.push(esc(v2));
      if (it.cap != null) {
        var s2 = A[state.scn].B[b.bi].items[it.ii];
        bits.push('up to ' + fmtI(it.cap) + (s2.util != null ? ' · <span' + (s2.util > 1 ? ' class="bad"' : '') + '>' + pct(s2.util) + ' used</span>' : ''));
      }
      if (it.conv === 'switch') bits.push(it.eff != null ? tidy(it.eff, 3) + '%' : 'switching');
      if (it.conv === 'linear') bits.push('linear');
      if (it.conv === 'pass') bits.push('pass-through');
      if (it.limit != null) bits.push('limit ' + fmtP(it.limit));
    }
    if (!it.budget) bits.push('not in the budget');
    if (!it.tree) bits.push('not in the tree');
    return bits.join(' · ');
  }
  function detail(it, A) {
    var bi = it.b.bi, ii = it.ii, h = '';
    var f = function (label, body, note) { return '<div class="pb-f"><span>' + label + '</span><div class="pb-in">' + body + (note ? ' <small>' + note + '</small>' : '') + '</div></div>'; };
    if (it.role === 'sink') {
      if (it.b.conv && it === it.b.input) {
        var ty = A.typ.B[bi].input.load, mx = A.max.B[bi].input.load;
        h += '<div class="pb-derived">Worked out from its outputs: <b>' + fmtI(ty.i) + '</b> typical, <b>' + fmtI(mx.i) + '</b> worst case (' + fmtP(ty.p) + ', ' + fmtP(mx.p) + ').</div>';
        h += f('Accepts', inp(bi, ii, 'vmin', it.vmin, { ph: 'min', label: 'Minimum input' }) + '–' + inp(bi, ii, 'vmax', it.vmax, { ph: 'max', label: 'Maximum input' }) + ' V');
      } else {
        h += f('Accepts', inp(bi, ii, 'vmin', it.vmin, { ph: 'min', label: 'Minimum voltage' }) + '–' + inp(bi, ii, 'vmax', it.vmax, { ph: 'max', label: 'Maximum voltage' }) + ' V');
        h += f('Current', inp(bi, ii, 'ityp', it.ityp, { ph: 'typical', label: 'Typical current' }) + inp(bi, ii, 'imax', it.imax, { ph: 'max', label: 'Maximum current' }) + ' mA', 'typical, max');
        h += f('Or power', inp(bi, ii, 'ptyp', it.ptyp, { ph: 'typical', label: 'Typical power' }) + inp(bi, ii, 'pmax', it.pmax, { ph: 'max', label: 'Maximum power' }) + ' W', it.ityp != null || it.imax != null ? 'current wins' : '');
      }
    } else {
      h += f('Output', inp(bi, ii, 'vmin', it.vmin, { ph: 'min', label: 'Minimum output' }) + '–' + inp(bi, ii, 'vmax', it.vmax, { ph: 'max', label: 'Maximum output' }) + ' V');
      h += f('Can supply', inp(bi, ii, 'cap', it.cap, { ph: 'max', label: 'Capacity' }) + ' mA');
      h += f('Converter', '<div class="seg">' + [['switch', 'Switching'], ['linear', 'Linear'], ['pass', 'Pass-through']].map(function (o) {
        return '<button class="' + (it.conv === o[0] ? 'on' : '') + '" data-b="' + bi + '" data-i="' + ii + '" data-k="conv" data-v="' + o[0] + '">' + o[1] + '</button>';
      }).join('') + '</div>');
      if (it.conv === 'switch' || !it.conv) h += f('Efficiency', inp(bi, ii, 'eff', it.eff, { ph: '85', label: 'Efficiency' }) + ' %', it.eff == null ? '85% assumed' : '');
      if (it.conv === 'linear') h += f('Quiescent', inp(bi, ii, 'iq', it.iq, { ph: 'Iq', label: 'Quiescent current', scale: 1000 }) + ' µA');
      if (it.b.root) h += f('Input limit', inp(bi, ii, 'limit', it.limit, { ph: 'none', label: 'Input limit' }) + ' W', 'the most the board may draw');
      var st = A.typ.B[bi].items[ii], sm = A.max.B[bi].items[ii];
      h += '<div class="pb-derived">Load now: <b>' + fmtI(st.iout) + '</b>' + (st.util != null ? ' (' + pct(st.util) + ')' : '') + ' typical, <b>' + fmtI(sm.iout) + '</b>' + (sm.util != null ? ' (' + pct(sm.util) + ')' : '') + ' worst case' +
        (it.b.root ? '' : '; it loses ' + fmtP(st.loss) + ' and ' + fmtP(sm.loss)) + '.</div>';
    }
    h += '<div class="pb-checks"><label><input type="checkbox" data-b="' + bi + '" data-i="' + ii + '" data-k="budget"' + (it.budget ? ' checked' : '') + '> Count in budget</label>' +
      '<label><input type="checkbox" data-b="' + bi + '" data-i="' + ii + '" data-k="tree"' + (it.tree ? ' checked' : '') + '> Show in power tree</label></div>';
    return '<div class="pb-detail">' + h + '</div>';
  }
  function panelHtml(A) {
    var a = A[state.scn], b = a.B[state.sel];
    if (!b) return '';
    var text = state.blocks[b.bi].power, items = b.items;
    var rows = items.map(function (it, ii) {
      var key = b.bi + '|' + ii, open = !!state.open[key];
      return '<div class="pb-row"><span class="pb-rail">' + esc(it.rail) + '</span><div class="seg">' + [['source', 'Source'], ['sink', 'Sink'], ['', 'N/A']].map(function (o) {
        return '<button class="' + (it.role === o[0] ? 'on' : '') + '" data-b="' + b.bi + '" data-i="' + ii + '" data-k="role" data-v="' + o[0] + '">' + o[1] + '</button>';
      }).join('') + '</div><button class="pb-chev' + (open ? ' open' : '') + '" data-open="' + key + '" title="' + (open ? 'Fold' : 'Power details for ' + esc(it.rail)) + '" aria-expanded="' + open + '">' + CHEV + '</button>' +
        '<div class="pb-gist">' + gist(it, A) + '</div>' + (open ? detail(it, A) : '') + '</div>';
    }).join('');
    // Round trip: the engine reads the same rails and roles, and writing what was read changes nothing.
    var rt = writePower(parsePower(text)) === text;
    var eng = M.specPowerItems(text), same = eng.length === items.length && eng.every(function (e, i) { return e.rail === items[i].rail && e.role === items[i].role && e.tree === items[i].tree; });
    var extra = [].concat.apply([], items.map(function (x) { return x.extra; }));
    return '<div class="field"><span class="field-label">' + esc(b.title) + ' · Power</span><div class="pb-power">' + rows + '</div>' +
      '<input class="input" id="add-rail" placeholder="Add a rail it uses, e.g. 3V3 (Enter)" autocomplete="off" style="margin-top:8px"></div>' +
      '<div class="pb-line"><span class="field-label">The Power line it writes</span><code style="display:block;white-space:normal;padding:6px 8px">Power: ' + esc(text) + '</code>' +
      '<div class="' + (rt && same ? 'pb-ok' : 'pb-err') + '">' + (rt ? 'Reads back unchanged.' : 'Doesn\'t read back the same.') + ' ' + (same ? 'The engine reads the same rails, roles, and tree flags.' : 'The engine reads it differently.') + '</div>' +
      (extra.length ? '<div class="note">Kept as written: ' + extra.map(esc).join(', ') + '</div>' : '') +
      '<div class="note" style="margin-top:4px">Today\'s engine writes this line back as <code>' + esc(M.specPowerText(M.specPowerItems(text))) + '</code>, dropping the numbers.</div></div>';
  }
  function textHtml(A) {
    return '<div class="pb-textall">' + state.blocks.map(function (b, bi) {
      return '<div><label for="t' + bi + '">' + esc(b.title) + '</label><textarea class="input pb-text" id="t' + bi + '" data-text="' + bi + '">Power: ' + esc(b.power) + '</textarea></div>';
    }).join('') + '</div>';
  }

  // ── Display: the annotated tree (after LTpowerPlanner) ──
  var DEFS = '<defs><pattern id="hb" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)"><rect width="1.4" height="5" fill="rgba(255,255,255,0.55)"/></pattern>' +
    '<pattern id="hw" width="4" height="4" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="0.8" fill="rgba(0,0,0,0.45)"/></pattern></defs>';
  function bar(x, y, w, h, util) {
    var cls = util > 1 ? 'bad' : util > 1 - state.margin / 100 ? 'warn' : '';
    var fw = Math.max(1, Math.min(1, util) * w);
    return '<rect class="barbg" x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="2"/><rect class="barfill ' + cls + '" x="' + x + '" y="' + y + '" width="' + fw + '" height="' + h + '" rx="2"/>' +
      (cls ? '<rect x="' + x + '" y="' + y + '" width="' + fw + '" height="' + h + '" fill="url(#' + (cls === 'bad' ? 'hb' : 'hw') + ')"/>' : '');
  }
  function treeSvg(a) {
    var nodes = a.B.filter(function (b) { return b.items.some(function (it) { return it.tree; }); });
    var W = 200, GAP = 130, cols = {};
    nodes.forEach(function (b) { (cols[b.depth] = cols[b.depth] || []).push(b); });
    var maxY = 0;
    Object.keys(cols).forEach(function (d) {
      var y = 20;
      cols[d].forEach(function (b) {
        var outs = b.items.filter(function (it) { return it.role === 'source' && it.tree; });
        var ins = b.items.filter(function (it) { return it.role === 'sink' && it.tree; });
        b.x = 20 + d * (W + GAP); b.y = y;
        b.h = Math.max(30 + outs.length * 30 + 16, 26 + ins.length * 18 + 8);
        outs.forEach(function (s, j) { s.py = b.y + 38 + j * 30; });
        ins.forEach(function (k, j) { k.py = b.y + (b.h * (j + 1)) / (ins.length + 1); });
        y += b.h + 34; maxY = Math.max(maxY, y);
      });
    });
    var wires = '', labels = '', boxes = '', maxD = Math.max.apply(null, nodes.map(function (b) { return b.depth; }).concat([0]));
    nodes.forEach(function (b) {
      b.items.forEach(function (s) {
        if (s.role !== 'source' || !s.tree) return;
        var sinks = s.r.sinks.filter(function (k) { return k.tree && k.b !== b && nodes.indexOf(k.b) >= 0; });
        if (!sinks.length) return;
        var x1 = b.x + W, trunk = x1 + 28 + (s.ii % 3) * 10;
        sinks.forEach(function (k) {
          var x2 = k.b.x, y2 = k.py, off = !k.budget || !s.budget;
          wires += '<path class="wire' + (off ? ' nobudget' : '') + '" d="M' + x1 + ' ' + s.py + ' H' + trunk + ' V' + y2 + ' H' + x2 + '"/>';
          var l = k.load || {};
          var t = off ? 'not counted' : l.missing ? 'no current' : fmtI(l.i) + ' · ' + fmtP(l.p);
          labels += '<text class="t2" x="' + (x2 - 8) + '" y="' + (y2 - 5) + '" text-anchor="end">' + esc(t) + '</text>';
        });
        labels += '<text class="tb" x="' + (x1 + 6) + '" y="' + (s.py - 6) + '">' + esc(s.rail) + '</text>' +
          (s.budget ? '<text class="t3" x="' + (x1 + 6) + '" y="' + (s.py + 13) + '">' + esc(fmtI(s.iout)) + '</text>' : '');
      });
    });
    nodes.forEach(function (b) {
      var sel = b.bi === state.sel, h = '<g class="hit" data-sel="' + b.bi + '"><rect class="blk' + (sel ? ' sel' : '') + '" x="' + b.x + '" y="' + b.y + '" width="' + W + '" height="' + b.h + '" rx="9"/>';
      h += '<text class="tb" x="' + (b.x + 12) + '" y="' + (b.y + 19) + '">' + esc(b.title) + '</text>';
      var outs = b.items.filter(function (it) { return it.role === 'source' && it.tree; });
      outs.forEach(function (s) {
        h += '<text class="t2" x="' + (b.x + 12) + '" y="' + (s.py + 4) + '">' + esc(s.rail) + '</text>';
        if (s.cap != null && s.budget) h += bar(b.x + 56, s.py - 5, 56, 10, s.util) + '<text class="t3" x="' + (b.x + 118) + '" y="' + (s.py + 4) + '">' + esc(pct(s.util)) + ' of ' + esc(fmtI(s.cap)) + '</text>';
        else if (s.budget) h += '<text class="t3" x="' + (b.x + 62) + '" y="' + (s.py + 4) + '">' + esc(fmtV(s.vmin, s.vmax) || 'no range') + '</text>';
      });
      var foot = '';
      if (b.conv) foot = b.outs.map(function (s) { return s.conv === 'linear' ? 'linear' : s.conv === 'pass' ? 'pass-through' : 'η ' + (s.eff != null ? tidy(s.eff, 3) : '85?') + '%'; }).join(', ') + ' · loss ' + fmtP(b.res.loss);
      else if (b.root) foot = 'delivers ' + fmtP(b.res.pout) + (b.outs.some(function (s) { return s.limit != null; }) ? ' of ' + fmtP(a.t.limit) : '');
      else { var p = 0, miss = false; b.items.forEach(function (it) { if (it.role === 'sink' && it.budget) { if (it.load.missing) miss = true; else p += it.load.p || 0; } }); foot = (miss ? 'some current missing · ' : '') + 'draws ' + fmtP(p); }
      h += '<text class="t3" x="' + (b.x + 12) + '" y="' + (b.y + b.h - 9) + '">' + esc(foot) + '</text>';
      if (b.flags) h += '<text x="' + (b.x + W - 14) + '" y="' + (b.y + 19) + '" style="fill:var(--issue);font-weight:700">△</text>';
      boxes += h + '</g>';
    });
    var w = 20 + (maxD + 1) * (W + GAP), hgt = maxY + 10;
    return '<svg style="width:100%;max-width:' + w + 'px;height:auto" viewBox="0 0 ' + w + ' ' + hgt + '">' + DEFS + wires + boxes + labels + '</svg>' +
      '<div class="pb-legend"><span><span class="pb-sw ok"></span>Load against what the source can supply</span><span><span class="pb-sw warn"></span>Under the margin</span><span><span class="pb-sw bad"></span>Over</span><span>- - - not in the budget</span></div>';
  }

  // ── Display: the budget table (after FPGA estimators and design-note spreadsheets) ──
  function tableHtml(A) {
    var ty = A.typ, mx = A.max, edit = state.tableEdit, rowsH = '';
    var order = ty.order.slice().sort(function (p, q) {
      var sp = ty.rails[p].sources[0], sq = ty.rails[q].sources[0];
      return (sp ? sp.b.depth : 99) - (sq ? sq.b.depth : 99) || ty.order.indexOf(p) - ty.order.indexOf(q);
    });
    function cell(it, k, v, fmt) {
      if (!edit) return fmt(v);
      return inp(it.b.bi, it.ii, k, v, { label: k });
    }
    order.forEach(function (k) {
      var r = ty.rails[k], rm = mx.rails[k], s = ty.srcs(r)[0], sm = s && mx.B[s.b.bi].items[s.ii];
      var sinks = r.sinks.filter(function (x) { return !r.sources.some(function (y) { return y.b === x.b; }); });
      if (!sinks.length) return;
      var head = s ? 'from ' + esc(s.b.title) + (fmtV(s.vmin, s.vmax) ? ' · ' + esc(fmtV(s.vmin, s.vmax)) : '') + (s.cap != null ? ' · up to ' + (edit ? inp(s.b.bi, s.ii, 'cap', s.cap, { label: 'capacity' }) + ' mA' : esc(fmtI(s.cap))) : '') : 'no block makes it';
      rowsH += '<tr class="rail"><td colspan="8">' + esc(r.name) + '<small>' + head + '</small></td></tr>';
      var sum = { it: 0, im: 0, pt: 0, pm: 0 };
      sinks.forEach(function (x) {
        var xm = mx.B[x.b.bi].items[x.ii], lt = x.load, lm = xm.load, der = lt.derived;
        if (x.budget && !lt.missing) { sum.it += lt.i || 0; sum.pt += lt.p || 0; }
        if (x.budget && !lm.missing) { sum.im += lm.i || 0; sum.pm += lm.p || 0; }
        var vchip = x.vmin == null ? '<span class="chip na">no range</span>' : x.vbad ? '<span class="chip bad">out of range</span>' : s && s.vmin != null ? '<span class="chip ok">in range</span>' : '';
        rowsH += '<tr class="hit" data-sel="' + x.b.bi + '"><td>' + esc(x.b.title) + (der ? ' <span class="muted">(its outputs)</span>' : '') + (!x.budget ? ' <span class="muted">(not counted)</span>' : '') + '</td>' +
          '<td>' + esc(fmtV(x.vmin, x.vmax) || '—') + '</td>' +
          '<td class="n">' + (der || !x.budget ? (x.budget ? '<i>' + fmtI(lt.i) + '</i>' : '—') : cell(x, 'ityp', x.ityp, fmtI)) + '</td>' +
          '<td class="n">' + (der || !x.budget ? (x.budget ? '<i>' + fmtI(lm.i) + '</i>' : '—') : cell(x, 'imax', x.imax, fmtI)) + '</td>' +
          '<td class="n">' + (x.budget ? fmtP(lt.p) : '—') + '</td><td class="n">' + (x.budget ? fmtP(lm.p) : '—') + '</td><td>' + vchip + '</td></tr>';
      });
      function marg(u) { if (u == null) return '<span class="chip na">no capacity</span>'; var left = 1 - u; return '<span class="chip ' + (u > 1 ? 'bad' : u > 1 - state.margin / 100 ? 'warn' : 'ok') + '">' + (left >= 0 ? pct(left) + ' left' : pct(-left) + ' over') + '</span>'; }
      rowsH += '<tr class="sub"><td>Load on ' + esc(r.name) + '</td><td></td><td class="n">' + fmtI(sum.it) + '</td><td class="n">' + fmtI(sum.im) + '</td><td class="n">' + fmtP(sum.pt) + '</td><td class="n">' + fmtP(sum.pm) + '</td><td>' + (s && !s.b.root ? marg(s.util) + ' ' + marg(sm && sm.util) : '') + '</td></tr>';
    });
    function lim(t) { if (t.limit == null) return ''; return '<span class="chip ' + (t.input > t.limit ? 'bad' : t.input > t.limit * (1 - state.margin / 100) ? 'warn' : 'ok') + '">' + fmtP(t.input) + ' of ' + fmtP(t.limit) + '</span>'; }
    rowsH += '<tr class="total"><td>Input power</td><td></td><td></td><td></td><td class="n">' + fmtP(ty.t.input) + '</td><td class="n">' + fmtP(mx.t.input) + '</td><td>' + lim(ty.t) + ' ' + lim(mx.t) + '</td></tr>' +
      '<tr><td>Converter losses</td><td></td><td></td><td></td><td class="n">' + fmtP(ty.t.losses) + '</td><td class="n">' + fmtP(mx.t.losses) + '</td><td></td></tr>' +
      '<tr><td>To the loads</td><td></td><td></td><td></td><td class="n">' + fmtP(ty.t.loads) + ' <span class="muted">' + (ty.t.eff != null ? pct(ty.t.eff) : '') + '</span></td><td class="n">' + fmtP(mx.t.loads) + ' <span class="muted">' + (mx.t.eff != null ? pct(mx.t.eff) : '') + '</span></td><td></td></tr>';
    return '<div style="display:flex;justify-content:flex-end;margin-bottom:8px"><button class="btn' + (edit ? ' btn-primary' : '') + '" data-act="tedit">' + (edit ? 'Done editing' : 'Edit in the table') + '</button></div>' +
      '<table class="pb-t"><thead><tr><th>Block</th><th>Accepts</th><th class="n">Current, typical</th><th class="n">Current, worst</th><th class="n">Power, typical</th><th class="n">Power, worst</th><th>Check</th></tr></thead><tbody>' + rowsH + '</tbody></table>';
  }

  // ── Display: headroom bars per source ──
  function headHtml(A) {
    var h = '', any = false;
    A.typ.B.forEach(function (b) {
      b.outs.forEach(function (s) {
        if (b.root) return;
        any = true;
        var sm = A.max.B[b.bi].items[s.ii];
        var loads = function (a) { return a.rails[s.r.key].sinks.filter(function (k) { return k.b !== a.B[b.bi] && k.budget && !k.load.missing; }).map(function (k) { return { name: k.b.title, i: (k.load.i || 0) / (a.srcs(k.r).length || 1) }; }); };
        var lt = loads(A.typ), lm = loads(A.max);
        var scale = Math.max(s.cap || 0, sm.iout || 0, s.iout || 0) * 1.12 || 1;
        function row(label, list, tot, util) {
          var x = 0, segs = list.map(function (l, j) {
            var w = l.i / scale * 100, seg = '<div class="pb-hr-seg' + (j % 2 ? ' alt' : '') + '" style="left:' + x + '%;width:' + w + '%" title="' + esc(l.name + ': ' + fmtI(l.i)) + '">' + esc(l.name) + '</div>';
            x += w; return seg;
          }).join('');
          if (s.cap != null && tot > s.cap) segs += '<div class="pb-hr-seg over" style="left:' + (s.cap / scale * 100) + '%;width:' + ((tot - s.cap) / scale * 100) + '%" title="Over by ' + esc(fmtI(tot - s.cap)) + '"></div>';
          var marks = s.cap != null ? '<div class="pb-hr-cap" style="left:' + (s.cap / scale * 100) + '%" title="Can supply ' + esc(fmtI(s.cap)) + '"></div><div class="pb-hr-marg" style="left:' + (s.cap * (1 - state.margin / 100) / scale * 100) + '%" title="' + state.margin + '% margin"></div>' : '';
          return '<div class="pb-hr-row"><span>' + label + '</span><div class="pb-hr-bar">' + segs + marks + '</div><span>' + fmtI(tot) + (util != null ? ' · ' + pct(util) : '') + '</span></div>';
        }
        h += '<div class="pb-hr-rail"><h3>' + esc(s.rail) + ' <small>from ' + esc(b.title) + (s.cap != null ? ', up to ' + esc(fmtI(s.cap)) : ', no capacity given') + '</small></h3>' +
          row('Typical', lt, s.iout, s.util) + row('Worst case', lm, sm.iout, sm.util) + '</div>';
      });
    });
    var t = A.typ.t, tm = A.max.t;
    if (t.limit != null) {
      var sc = Math.max(t.limit, tm.input) * 1.12;
      var r2 = function (label, x) { return '<div class="pb-hr-row"><span>' + label + '</span><div class="pb-hr-bar"><div class="pb-hr-seg" style="left:0;width:' + (Math.min(x.input, t.limit) / sc * 100) + '%">loads ' + esc(fmtP(x.loads)) + ' + losses ' + esc(fmtP(x.losses)) + '</div>' +
        (x.input > t.limit ? '<div class="pb-hr-seg over" style="left:' + (t.limit / sc * 100) + '%;width:' + ((x.input - t.limit) / sc * 100) + '%"></div>' : '') +
        '<div class="pb-hr-cap" style="left:' + (t.limit / sc * 100) + '%"></div><div class="pb-hr-marg" style="left:' + (t.limit * (1 - state.margin / 100) / sc * 100) + '%"></div></div><span>' + fmtP(x.input) + ' · ' + pct(x.input / t.limit) + '</span></div>'; };
      h = '<div class="pb-hr-rail"><h3>Input power <small>limit ' + esc(fmtP(t.limit)) + '</small></h3>' + r2('Typical', t) + r2('Worst case', tm) + '</div>' + h;
    }
    return '<div class="pb-hr">' + (any ? h : '<p class="note">No sources yet.</p>') + '</div>' +
      '<div class="pb-legend"><span><span class="pb-sw" style="background:var(--text);width:3px"></span>What it can supply</span><span><span class="pb-sw" style="border-left:2px dashed var(--warn);border-radius:0;width:3px"></span>Margin</span><span><span class="pb-sw bad"></span>Over</span></div>';
  }

  // ── Display: voltage windows ──
  function voltHtml(a) {
    var h = '';
    a.order.forEach(function (k) {
      var r = a.rails[k], s = r.sources.filter(function (x) { return x.vmin != null; })[0];
      var sinks = r.sinks.filter(function (x) { return x.vmin != null && !r.sources.some(function (y) { return y.b === x.b; }); });
      if (!s && !sinks.length) return;
      var lo = Math.min.apply(null, sinks.map(function (x) { return x.vmin; }).concat(s ? [s.vmin] : [])), hi = Math.max.apply(null, sinks.map(function (x) { return x.vmax; }).concat(s ? [s.vmax] : []));
      var pad = (hi - lo) * 0.08 || hi * 0.05 || 1; lo -= pad; hi += pad;
      var X = function (v) { return ((v - lo) / (hi - lo) * 100); };
      var win = s ? '<div style="position:absolute;top:-4px;bottom:-4px;left:' + X(s.vmin) + '%;width:' + Math.max(0.4, X(s.vmax) - X(s.vmin)) + '%;background:var(--accent-soft);border-left:1px solid var(--accent);border-right:1px solid var(--accent)"></div>' : '';
      h += '<div class="pb-hr-rail"><h3>' + esc(r.name) + ' <small>' + (s ? esc(s.b.title) + ' makes ' + esc(fmtV(s.vmin, s.vmax)) : 'no source range') + '</small></h3>';
      if (s) h += '<div class="pb-hr-row"><span>Made</span><div class="pb-hr-bar">' + win + '<div class="pb-hr-seg" style="left:' + X(s.vmin) + '%;width:' + Math.max(0.6, X(s.vmax) - X(s.vmin)) + '%"></div></div><span>' + esc(fmtV(s.vmin, s.vmax)) + '</span></div>';
      sinks.forEach(function (x) {
        h += '<div class="pb-hr-row"><span title="' + esc(x.b.title) + '">' + esc(x.b.title) + '</span><div class="pb-hr-bar">' + win +
          '<div class="pb-hr-seg' + (x.vbad ? ' over' : ' alt') + '" style="left:' + X(x.vmin) + '%;width:' + (X(x.vmax) - X(x.vmin)) + '%;opacity:.85"></div></div><span>' + esc(fmtV(x.vmin, x.vmax)) + (x.vbad ? ' <span class="chip bad">out</span>' : '') + '</span></div>';
      });
      h += '<div class="pb-hr-row pb-hr-scale"><span></span><div style="display:flex;justify-content:space-between"><span>' + tidy(lo, 3) + ' V</span><span>' + tidy(hi, 3) + ' V</span></div><span></span></div></div>';
    });
    return '<div class="pb-hr">' + (h || '<p class="note">No voltage ranges yet.</p>') + '</div>' +
      '<div class="pb-legend"><span><span class="pb-sw" style="background:var(--accent-soft);box-shadow:inset 0 0 0 1px var(--accent)"></span>What its source makes, across every row</span><span><span class="pb-sw" style="background:var(--accent-ink)"></span>What a load accepts</span><span><span class="pb-sw bad"></span>Doesn\'t cover the source</span></div>';
  }

  // ── Display: power flow (a Sankey, losses as branches) ──
  function sankeySvg(a) {
    var nodes = [], flows = [];
    a.B.forEach(function (b) {
      var v = b.root ? b.res.pout : b.conv ? b.res.pin : b.items.reduce(function (s, it) { return s + (it.role === 'sink' && it.budget && !it.load.missing ? it.load.p || 0 : 0); }, 0);
      if (v > 0) { b.v = v; nodes.push(b); }
    });
    nodes.forEach(function (b) {
      if (b.root) return;
      b.items.forEach(function (it) {
        if (it.role !== 'sink' || !it.budget || it.load.missing) return;
        a.srcs(it.r).forEach(function (s) { if (s.b !== b && nodes.indexOf(s.b) >= 0) flows.push({ from: s.b, to: b, v: (it.load.p || 0) / a.srcs(it.r).length, rail: it.rail }); });
      });
    });
    var maxD = Math.max.apply(null, nodes.map(function (b) { return b.depth; }).concat([0]));
    var loss = { title: 'Losses', depth: maxD + 1, v: 0, loss: true };
    nodes.forEach(function (b) { if (b.conv && b.res.loss > 0) { flows.push({ from: b, to: loss, v: b.res.loss, isLoss: true }); loss.v += b.res.loss; } });
    if (loss.v > 0) nodes.push(loss);
    var cols = {}, H = 340, NW = 14, CW = 190, G = 22;
    nodes.forEach(function (b) { (cols[b.depth] = cols[b.depth] || []).push(b); });
    var maxSum = 0;
    Object.keys(cols).forEach(function (d) { maxSum = Math.max(maxSum, cols[d].reduce(function (s, b) { return s + b.v; }, 0) + (cols[d].length - 1) * 0); });
    var k = maxSum ? H / maxSum : 1, top = 20;
    Object.keys(cols).forEach(function (d) {
      var tot = cols[d].reduce(function (s, b) { return s + b.v * k; }, 0) + (cols[d].length - 1) * G, y = top + Math.max(0, (H + 60 - tot) / 2);
      cols[d].forEach(function (b) { b.sx = 30 + d * CW; b.sy = y; b.sh = Math.max(2, b.v * k); b.oy = y; b.iy = y; y += b.sh + G; });
    });
    if (loss.v > 0) { loss.sy = loss.oy = loss.iy = top + H + 60 - loss.sh; }   // losses sit at the bottom, out of the way
    var bands = '';
    flows.sort(function (p, q) { return p.from.sy - q.from.sy || (p.isLoss ? 1 : 0) - (q.isLoss ? 1 : 0) || p.to.sy - q.to.sy; });
    flows.forEach(function (f) {
      var h = Math.max(1, f.v * k), x0 = f.from.sx + NW, x1 = f.to.sx, y0 = f.from.oy, y1 = f.to.iy, xm = (x0 + x1) / 2;
      f.from.oy += h; f.to.iy += h;
      bands += '<path d="M' + x0 + ' ' + y0 + ' C' + xm + ' ' + y0 + ' ' + xm + ' ' + y1 + ' ' + x1 + ' ' + y1 + ' L' + x1 + ' ' + (y1 + h) + ' C' + xm + ' ' + (y1 + h) + ' ' + xm + ' ' + (y0 + h) + ' ' + x0 + ' ' + (y0 + h) + 'Z" style="fill:' + (f.isLoss ? 'var(--na)' : 'var(--accent)') + ';opacity:' + (f.isLoss ? 0.3 : 0.28) + '"><title>' + esc((f.isLoss ? f.from.title + ' loses ' : f.from.title + ' → ' + f.to.title + ' (' + f.rail + '): ') + fmtP(f.v)) + '</title></path>';
    });
    var boxes = nodes.map(function (b) {
      return '<g' + (b.loss ? '' : ' class="hit" data-sel="' + b.bi + '"') + '><rect x="' + b.sx + '" y="' + b.sy + '" width="' + NW + '" height="' + b.sh + '" rx="2" style="fill:' + (b.loss ? 'var(--na)' : 'var(--accent-ink)') + '"/>' +
        '<text class="tb" x="' + (b.sx + NW + 6) + '" y="' + (b.sy + Math.min(b.sh / 2, 12) + 4) + '">' + esc(b.title) + '</text><text class="t3" x="' + (b.sx + NW + 6) + '" y="' + (b.sy + Math.min(b.sh / 2, 12) + 18) + '">' + esc(fmtP(b.v)) + '</text></g>';
    }).join('');
    var w = 30 + (maxD + 1) * CW + 170, hgt = H + 100;
    return '<svg style="width:100%;max-width:' + w + 'px;height:auto" viewBox="0 0 ' + w + ' ' + hgt + '">' + bands + boxes + '</svg>' +
      '<div class="pb-legend"><span><span class="pb-sw ok" style="opacity:.4"></span>Power on a rail, as wide as it is</span><span><span class="pb-sw loss"></span>Lost in a converter</span></div>';
  }

  // ── Summary strip and checks ──
  function summaryHtml(a) {
    var t = a.t, m = state.margin / 100;
    var limCls = t.limit == null ? '' : t.input > t.limit ? ' bad' : t.input > t.limit * (1 - m) ? ' warn' : '';
    var bad = a.issues.filter(function (x) { return x.sev === 'bad'; }).length, warn = a.issues.filter(function (x) { return x.sev === 'warn'; }).length;
    return '<div class="pb-stat' + limCls + '"><b>' + fmtP(t.input) + '</b><span>Input' + (t.limit != null ? ', limit ' + fmtP(t.limit) : '') + (limCls === ' bad' ? ': over' : '') + '</span></div>' +
      '<div class="pb-stat"><b>' + fmtP(t.loads) + '</b><span>To the loads</span></div>' +
      '<div class="pb-stat"><b>' + fmtP(t.losses) + '</b><span>Converter losses</span></div>' +
      '<div class="pb-stat"><b>' + (t.eff != null ? pct(t.eff) : '—') + '</b><span>Overall efficiency</span></div>' +
      '<div class="pb-stat' + (bad ? ' bad' : warn ? ' warn' : '') + '"><b>' + bad + ' · ' + warn + '</b><span>Problems · warnings (' + (state.scn === 'max' ? 'worst case' : 'typical') + ')</span></div>';
  }
  function issuesHtml(a) {
    if (!a.issues.length) return '<li><span class="chip ok">OK</span> Nothing to flag.</li>';
    return a.issues.map(function (x) { return '<li><span class="chip ' + x.sev + '">' + (x.sev === 'bad' ? 'Problem' : x.sev === 'warn' ? 'Warning' : 'Note') + '</span><span>' + esc(x.text) + '</span></li>'; }).join('');
  }

  // ── Render ──
  var HELP = {
    panel: 'The block panel\'s Power rows, with a chevron where the Power tree box was. Open a row for its numbers; the box moves inside. Pick a block above or in a drawing.',
    text: 'The same numbers typed straight into each block\'s Power line, as in the document or the command line\'s scribe.md. Changes apply when you leave a box.',
    tree: 'The power tree with each line\'s current and power, each source\'s load against what it can supply, and each converter\'s efficiency and loss (after ADI LTpowerPlanner).',
    table: 'One row per load, grouped by rail, both scenarios side by side, with margin per rail (after FPGA power estimators and design-note spreadsheets). Edit in the table is a second way to capture.',
    head: 'Each source\'s load, stacked by what draws it, against what it can supply, with the margin line.',
    volt: 'Each rail\'s output range against the range each load accepts. A load whose range doesn\'t cover the source\'s is flagged.',
    sankey: 'Power from the input through each converter to the loads, as wide as it is, with each converter\'s loss as a branch. Hover a band for its number.'
  };
  function render() {
    var A = { typ: analyse('typ'), max: analyse('max') }, a = A[state.scn];
    document.querySelectorAll('#scn button').forEach(function (b) { b.classList.toggle('on', b.dataset.scn === state.scn); });
    document.querySelectorAll('#cap button').forEach(function (b) { b.classList.toggle('on', b.dataset.cap === state.cap); });
    document.querySelectorAll('#view button').forEach(function (b) { b.classList.toggle('on', b.dataset.view === state.view); });
    $('margin').value = state.margin;
    $('cap-help').textContent = HELP[state.cap];
    $('view-help').textContent = HELP[state.view];
    $('blocks').innerHTML = state.cap === 'panel' ? a.B.map(function (b) { return '<button class="' + (b.bi === state.sel ? 'on' : '') + (b.flags ? ' flag' : '') + '" data-sel="' + b.bi + '">' + esc(b.title) + '</button>'; }).join('') : '';
    var ae = document.activeElement, keep = ae && ae.id && ae.tagName === 'TEXTAREA' ? { id: ae.id, s: ae.selectionStart } : null;
    $('panel').innerHTML = state.cap === 'panel' ? panelHtml(A) : textHtml(A);
    if (keep && $(keep.id)) { $(keep.id).focus(); try { $(keep.id).setSelectionRange(keep.s, keep.s); } catch (e) { /* ignore */ } }
    $('summary').innerHTML = summaryHtml(a);
    $('out').innerHTML = state.view === 'tree' ? treeSvg(a) : state.view === 'table' ? tableHtml(A) : state.view === 'head' ? headHtml(A) : state.view === 'volt' ? voltHtml(a) : sankeySvg(a);
    $('issues').innerHTML = issuesHtml(a);
    save();
  }

  // ── Edits ──
  function setItem(bi, ii, k, v) {
    var b = state.blocks[bi], items = parsePower(b.power);
    if (k === 'role') { if (!v) items.splice(ii, 1); else items[ii].role = v; }
    else items[ii][k] = v;
    if (k === 'conv' && v !== 'switch') items[ii].eff = null;
    if (k === 'conv' && v !== 'linear') items[ii].iq = null;
    if (k === 'conv') items[ii].convWord = '';
    b.power = writePower(items);
    render();
  }
  document.addEventListener('click', function (e) {
    var t = e.target.closest('button, [data-sel]'); if (!t) return;
    if (t.dataset.scn) { state.scn = t.dataset.scn; return render(); }
    if (t.dataset.cap) { state.cap = t.dataset.cap; return render(); }
    if (t.dataset.view) { state.view = t.dataset.view; return render(); }
    if (t.dataset.open) { state.open[t.dataset.open] = !state.open[t.dataset.open]; return render(); }
    if (t.dataset.act === 'tedit') { state.tableEdit = !state.tableEdit; return render(); }
    if (t.id === 'reset') { state.blocks = demoBlocks(); state.open = {}; state.margin = 20; return render(); }
    if (t.dataset.k && t.dataset.v != null) return setItem(+t.dataset.b, +t.dataset.i, t.dataset.k, t.dataset.v);
    if (t.dataset.sel != null) { state.sel = +t.dataset.sel; if (state.cap !== 'panel') state.cap = 'panel'; return render(); }
  });
  document.addEventListener('change', function (e) {
    var t = e.target;
    if (t.id === 'margin') { state.margin = Math.max(0, Math.min(90, num(t.value) || 0)); return render(); }
    if (t.dataset.text != null) { state.blocks[+t.dataset.text].power = t.value.replace(/^\s*power\s*:\s*/i, '').replace(/\s+/g, ' ').trim(); return render(); }
    if (!t.dataset.k) return;
    if (t.type === 'checkbox') return setItem(+t.dataset.b, +t.dataset.i, t.dataset.k, t.checked);
    var v = t.value === '' ? null : num(t.value);
    if (v != null && t.dataset.scale) v = v / +t.dataset.scale;
    setItem(+t.dataset.b, +t.dataset.i, t.dataset.k, v);
  });
  document.addEventListener('keydown', function (e) {
    if (e.target.id !== 'add-rail' || e.key !== 'Enter') return;
    var rail = e.target.value.trim(); if (!rail) return;
    var b = state.blocks[state.sel], items = parsePower(b.power);
    if (items.some(function (x) { return x.rail.toLowerCase() === rail.toLowerCase(); })) return;
    items.push(parseWords('sink')); items[items.length - 1].rail = rail;
    b.power = writePower(items);
    state.open[state.sel + '|' + (items.length - 1)] = true;
    render();
    var n = document.getElementById('add-rail'); if (n) n.focus();
  });
  render();
  window.PB = { parsePower: parsePower, writePower: writePower, analyse: analyse, state: state };
})();
