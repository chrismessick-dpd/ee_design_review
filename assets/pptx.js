/* Signoff EE: slide decks in and out (.pptx), for the home page's Internal standards (assets/home.js).
   Not an engine file: only EE loads it (ME and FW have no home page).

   window.SignoffPptx:
     unzip(bytes)            -> Promise<{ names, get(name) -> Promise<Uint8Array> }>   (stored and deflated entries)
     zip(entries)            -> Uint8Array   entries: [{ path, bytes | text }], stored (no compression), CRC-32 checked
     read(bytes)             -> Promise<{ cx, cy, slides: [{ n, texts: [...], pics: [...] }] }>
     toItems(deck)           -> [{ slide, title, body, pics: [{ name, type, bytes }], skip }]
     write({ title, sub, items: [{ title, body, pics: [{ bytes, type, w, h }] }] }) -> Uint8Array (.pptx)

   Import: a slide's item title is its title placeholder, or (decks exported from Google Slides have no
   placeholders) its first text box from the top; the other text boxes are the body, a line per paragraph,
   "- " before bulleted ones. Text that repeats on most slides (the deck's own title, a footer, a
   classification line) and footer, date, and slide-number placeholders are left out, and so is a picture
   on most slides (a logo). Export writes one title slide, then a slide per item: its title, its text on the
   left, and its pictures on the right (the whole width without pictures). The CSP allows only this site's
   scripts, so there is no zip library: deflate comes from the browser's DecompressionStream, and the
   writer stores entries uncompressed (pictures are compressed already). */
(function () {
  'use strict';

  // ── Zip ──────────────────────────────────────────────────
  var CRC = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })();
  function crc32(b) { var c = 0xffffffff; for (var i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
  var enc = new TextEncoder(), dec = new TextDecoder('utf-8');

  function inflate(bytes) {
    if (typeof DecompressionStream === 'undefined') return Promise.reject(new Error('This browser can’t read compressed zip entries (no DecompressionStream). Use a current Chrome, Edge, Firefox, or Safari.'));
    var ds = new DecompressionStream('deflate-raw');
    var out = new Response(new Blob([bytes]).stream().pipeThrough(ds)).arrayBuffer();
    return out.then(function (ab) { return new Uint8Array(ab); });
  }

  function unzip(bytes) {
    bytes = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    var dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    var e = -1;
    for (var i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { e = i; break; }
    if (e < 0) return Promise.reject(new Error('Not a zip file (a .pptx is one).'));
    var count = dv.getUint16(e + 10, true), off = dv.getUint32(e + 16, true);
    var entries = {};
    for (var n = 0; n < count; n++) {
      if (dv.getUint32(off, true) !== 0x02014b50) return Promise.reject(new Error('The zip’s directory is damaged.'));
      var method = dv.getUint16(off + 10, true), csize = dv.getUint32(off + 20, true);
      var nlen = dv.getUint16(off + 28, true), xlen = dv.getUint16(off + 30, true), clen = dv.getUint16(off + 32, true);
      var local = dv.getUint32(off + 42, true);
      var name = dec.decode(bytes.subarray(off + 46, off + 46 + nlen));
      entries[name] = { method: method, csize: csize, local: local };
      off += 46 + nlen + xlen + clen;
    }
    return Promise.resolve({
      names: Object.keys(entries),
      get: function (name) {
        var x = entries[name];
        if (!x) return Promise.resolve(null);
        var start = x.local + 30 + dv.getUint16(x.local + 26, true) + dv.getUint16(x.local + 28, true);
        var data = bytes.subarray(start, start + x.csize);
        if (x.method === 0) return Promise.resolve(data);
        if (x.method === 8) return inflate(data);
        return Promise.reject(new Error('Unsupported zip compression (' + x.method + ') in ' + name));
      }
    });
  }

  function zip(entries) {
    var parts = [], dir = [], off = 0;
    var d = new Date(), dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    var dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    entries.forEach(function (en) {
      var name = enc.encode(en.path), data = en.bytes || enc.encode(en.text || ''), crc = crc32(data);
      var h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
      h.setUint16(10, dosTime, true); h.setUint16(12, dosDate, true); h.setUint32(14, crc, true);
      h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
      var c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true);
      c.setUint16(12, dosTime, true); c.setUint16(14, dosDate, true); c.setUint32(16, crc, true);
      c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true);
      c.setUint32(42, off, true);
      parts.push(new Uint8Array(h.buffer), name, data);
      dir.push(new Uint8Array(c.buffer), name);
      off += 30 + name.length + data.length;
    });
    var dirSize = dir.reduce(function (s, a) { return s + a.length; }, 0);
    var end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true);
    end.setUint32(12, dirSize, true); end.setUint32(16, off, true);
    var all = parts.concat(dir, [new Uint8Array(end.buffer)]);
    var out = new Uint8Array(off + dirSize + 22), p = 0;
    all.forEach(function (a) { out.set(a, p); p += a.length; });
    return out;
  }

  // ── Reading a deck ───────────────────────────────────────
  function xml(text) { return new DOMParser().parseFromString(text, 'application/xml'); }
  function kids(el, local) { return Array.prototype.filter.call(el.children || [], function (c) { return c.localName === local; }); }
  function kid(el, local) { return kids(el, local)[0] || null; }
  function all(el, local) { return Array.prototype.slice.call(el.getElementsByTagNameNS('*', local)); }
  function attrR(el, name) { return el.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', name) || el.getAttribute('r:' + name) || ''; }
  function resolve(base, target) {
    if (target.charAt(0) === '/') return target.slice(1);
    var parts = base.split('/'); parts.pop();
    target.split('/').forEach(function (s) { if (s === '..') parts.pop(); else if (s !== '.') parts.push(s); });
    return parts.join('/');
  }
  function rels(z, path) {
    var dirn = path.split('/'); var file = dirn.pop();
    var rp = (dirn.length ? dirn.join('/') + '/' : '') + '_rels/' + file + '.rels';
    return z.get(rp).then(function (b) {
      var map = {};
      if (b) all(xml(dec.decode(b)), 'Relationship').forEach(function (r) { map[r.getAttribute('Id')] = { target: resolve(path, r.getAttribute('Target') || ''), type: r.getAttribute('Type') || '', external: r.getAttribute('TargetMode') === 'External' }; });
      return map;
    });
  }
  function box(el) {
    var x = all(el, 'off')[0], e = all(el, 'ext')[0];
    return { x: x ? +x.getAttribute('x') || 0 : 0, y: x ? +x.getAttribute('y') || 0 : 0, cx: e ? +e.getAttribute('cx') || 0 : 0, cy: e ? +e.getAttribute('cy') || 0 : 0 };
  }
  function paraText(p) {
    var s = '';
    Array.prototype.forEach.call(p.children, function (c) {
      if (c.localName === 'r' || c.localName === 'fld') { var t = kid(c, 't'); if (t) s += t.textContent; }
      else if (c.localName === 'br') s += '\n';
    });
    return s.replace(/ /g, ' ').replace(/[ \t]+$/gm, '');
  }
  function bulleted(p) { var pr = kid(p, 'pPr'); return !!(pr && (kid(pr, 'buChar') || kid(pr, 'buAutoNum'))); }
  function mimeOf(name) {
    var ext = (name.split('.').pop() || '').toLowerCase();
    return { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', webp: 'image/webp', svg: 'image/svg+xml', tif: 'image/tiff', tiff: 'image/tiff', emf: 'image/emf', wmf: 'image/wmf' }[ext] || 'application/octet-stream';
  }

  function read(bytes) {
    return unzip(bytes).then(function (z) {
      var pres = 'ppt/presentation.xml';
      return Promise.all([z.get(pres), rels(z, pres)]).then(function (r) {
        if (!r[0]) throw new Error('Not a PowerPoint file: it has no ppt/presentation.xml.');
        var doc = xml(dec.decode(r[0])), prels = r[1];
        var sz = all(doc, 'sldSz')[0];
        var cx = sz ? +sz.getAttribute('cx') : 12192000, cy = sz ? +sz.getAttribute('cy') : 6858000;
        var paths = all(doc, 'sldId').map(function (s) { var x = prels[attrR(s, 'id')]; return x && x.target; }).filter(Boolean);
        return Promise.all(paths.map(function (path, i) { return readSlide(z, path, i + 1); })).then(function (slides) {
          return { cx: cx, cy: cy, slides: slides };
        });
      });
    });
  }

  function readSlide(z, path, n) {
    return Promise.all([z.get(path), rels(z, path)]).then(function (r) {
      var doc = xml(dec.decode(r[0])), srels = r[1];
      var texts = [], picRefs = [];
      var tree = all(doc, 'spTree')[0];
      (function walk(el) {
        Array.prototype.forEach.call(el.children, function (c) {
          if (c.localName === 'grpSp') walk(c);
          else if (c.localName === 'sp') {
            var ph = all(c, 'ph')[0], body = kid(c, 'txBody');
            if (!body) return;
            var paras = kids(body, 'p').map(function (p) { var t = paraText(p).trim(); return t ? (bulleted(p) ? '- ' : '') + t : ''; }).filter(Boolean);
            if (!paras.length) return;
            texts.push({ text: paras.join('\n'), paras: paras, ph: ph ? (ph.getAttribute('type') || 'body') : '', b: box(c) });
          } else if (c.localName === 'pic') {
            var blip = all(c, 'blip')[0], rel = blip && srels[attrR(blip, 'embed')];
            if (rel && !rel.external) picRefs.push({ name: rel.target, b: box(c) });
          }
        });
      })(tree || doc.documentElement);
      return Promise.all(picRefs.map(function (p) {
        return z.get(p.name).then(function (b) { return b ? { name: p.name.split('/').pop(), path: p.name, type: mimeOf(p.name), bytes: b, b: p.b } : null; });
      })).then(function (pics) { return { n: n, texts: texts, pics: pics.filter(Boolean) }; });
    });
  }

  function byPlace(a, b) { return (a.b.y - b.b.y) || (a.b.x - b.b.x); }
  var FOOT = { ftr: 1, dt: 1, sldNum: 1 };
  var SHOWN = { 'image/png': 1, 'image/jpeg': 1, 'image/gif': 1, 'image/webp': 1, 'image/bmp': 1, 'image/svg+xml': 1 };

  function toItems(deck) {
    var slides = deck.slides, many = slides.length >= 3, need = Math.ceil(slides.length * 0.6);
    var seen = {}, shown = {}, picSeen = {};
    slides.forEach(function (s) {
      var once = {};
      s.texts.forEach(function (t) { var k = t.text.toLowerCase(); if (!once[k]) { once[k] = 1; seen[k] = (seen[k] || 0) + 1; shown[k] = shown[k] || t.text; } });
      var ponce = {};
      s.pics.forEach(function (p) { if (!ponce[p.path]) { ponce[p.path] = 1; picSeen[p.path] = (picSeen[p.path] || 0) + 1; } });
    });
    var repeated = function (t) { return many && seen[t.text.toLowerCase()] >= need; };
    var common = Object.keys(seen).filter(function (k) { return many && seen[k] >= need; }).map(function (k) { return shown[k]; });
    return slides.map(function (s) {
      var texts = s.texts.filter(function (t) { return !FOOT[t.ph] && !repeated(t); }).sort(byPlace);
      var titled = texts.filter(function (t) { return t.ph === 'title' || t.ph === 'ctrTitle'; })[0] || texts[0];
      var lines = [], title = '';
      if (titled) {
        title = titled.paras[0].replace(/^- /, '');
        lines = titled.paras.slice(1);
      }
      texts.forEach(function (t) { if (t !== titled) lines = lines.concat(t.paras); });
      var pics = s.pics.filter(function (p) { return !(many && picSeen[p.path] >= need) && SHOWN[p.type]; }).sort(byPlace)
        .map(function (p) { return { name: p.name, type: p.type, bytes: p.bytes }; });
      var skipped = s.pics.length - pics.length;
      return { slide: s.n, title: title, body: lines.join('\n'), pics: pics, unshown: s.pics.filter(function (p) { return !SHOWN[p.type]; }).length, logos: skipped };
    }).map(function (it, i) { it.skip = i === 0 && slides.length > 1; it.common = common; return it; });   // the first slide is usually the deck's title
  }

  // ── Writing a deck ───────────────────────────────────────
  var NS_P = 'http://schemas.openxmlformats.org/presentationml/2006/main';
  var NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
  var NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  var REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
  var HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  var W = 12192000, H = 6858000, M = 457200;
  function x(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ''); }
  function relsXml(list) {
    return HEAD + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      list.map(function (r, i) { return '<Relationship Id="rId' + (i + 1) + '" Type="' + REL + r[0] + '" Target="' + x(r[1]) + '"/>'; }).join('') + '</Relationships>';
  }
  function xfrm(b) { return '<a:xfrm><a:off x="' + Math.round(b.x) + '" y="' + Math.round(b.y) + '"/><a:ext cx="' + Math.round(b.cx) + '" cy="' + Math.round(b.cy) + '"/></a:xfrm>'; }
  function textBox(id, name, b, paras, sz, bold, color) {
    var ps = paras.length ? paras : [''];
    return '<p:sp><p:nvSpPr><p:cNvPr id="' + id + '" name="' + x(name) + '"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>' +
      '<p:spPr>' + xfrm(b) + '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr>' +
      '<p:txBody><a:bodyPr wrap="square" lIns="0" tIns="0" rIns="0" bIns="0" anchor="t"><a:normAutofit/></a:bodyPr><a:lstStyle/>' +
      ps.map(function (t) {
        var bullet = /^[-•]\s+/.test(t), text = t.replace(/^[-•]\s+/, '');
        return '<a:p><a:pPr' + (bullet ? ' marL="285750" indent="-285750"><a:buFont typeface="Arial"/><a:buChar char="•"/></a:pPr>' : '><a:buNone/></a:pPr>') +
          (text ? '<a:r><a:rPr lang="en-US" sz="' + sz + '"' + (bold ? ' b="1"' : '') + ' dirty="0"><a:solidFill><a:srgbClr val="' + color + '"/></a:solidFill></a:rPr><a:t>' + x(text) + '</a:t></a:r>' : '') +
          '<a:endParaRPr lang="en-US" sz="' + sz + '" dirty="0"/></a:p>';
      }).join('') + '</p:txBody></p:sp>';
  }
  function picShape(id, rid, b, name) {
    return '<p:pic><p:nvPicPr><p:cNvPr id="' + id + '" name="' + x(name) + '"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>' +
      '<p:blipFill><a:blip r:embed="' + rid + '"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>' +
      '<p:spPr>' + xfrm(b) + '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>';
  }
  function slideXml(shapes) {
    return HEAD + '<p:sld xmlns:a="' + NS_A + '" xmlns:r="' + NS_R + '" xmlns:p="' + NS_P + '"><p:cSld><p:spTree>' +
      '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>' +
      shapes.join('') + '</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>';
  }
  // Fit w × h into a box, centered.
  function fit(w, h, b) {
    w = w || 4; h = h || 3;
    var s = Math.min(b.cx / w, b.cy / h);
    return { x: b.x + (b.cx - w * s) / 2, y: b.y + (b.cy - h * s) / 2, cx: w * s, cy: h * s };
  }
  // n pictures in a grid inside a box.
  function grid(n, b) {
    var cols = Math.ceil(Math.sqrt(n)), rows = Math.ceil(n / cols), gap = 182880;
    var cw = (b.cx - gap * (cols - 1)) / cols, ch = (b.cy - gap * (rows - 1)) / rows, out = [];
    for (var i = 0; i < n; i++) out.push({ x: b.x + (i % cols) * (cw + gap), y: b.y + Math.floor(i / cols) * (ch + gap), cx: cw, cy: ch });
    return out;
  }
  var EXT = { 'image/png': 'png', 'image/jpeg': 'jpeg', 'image/gif': 'gif', 'image/bmp': 'bmp', 'image/svg+xml': 'svg' };

  function write(deck) {
    var files = [], media = [], slides = [];
    var titleShapes = [
      textBox(2, 'Title', { x: M * 2, y: H * 0.36, cx: W - M * 4, cy: 914400 }, [deck.title || 'Standards'], 4000, true, '1D1D1F'),
      textBox(3, 'Subtitle', { x: M * 2, y: H * 0.36 + 1005840, cx: W - M * 4, cy: 640080 }, [deck.sub || ''], 1800, false, '6E6E73')
    ];
    slides.push({ xml: slideXml(titleShapes), rels: [] });
    (deck.items || []).forEach(function (it, i) {
      var shapes = [], rels = [], id = 2;
      var pics = (it.pics || []).filter(function (p) { return EXT[p.type]; });
      shapes.push(textBox(id++, 'Title', { x: M, y: 365760, cx: W - 2 * M, cy: 640080 }, [it.title || 'Untitled'], 2800, true, '1D1D1F'));
      var top = 1188720, bottom = H - M;
      var bodyBox = pics.length ? { x: M, y: top, cx: 4206240, cy: bottom - top } : { x: M, y: top, cx: W - 2 * M, cy: bottom - top };
      var lines = String(it.body || '').split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
      if (lines.length) shapes.push(textBox(id++, 'Text', bodyBox, lines, 1600, false, '3A3A3C'));
      var area = { x: M + 4206240 + 365760, y: top, cx: W - M - (M + 4206240 + 365760), cy: bottom - top };
      grid(pics.length, area).forEach(function (cell, k) {
        var p = pics[k], name = 'image' + (media.length + 1) + '.' + EXT[p.type];
        media.push({ path: 'ppt/media/' + name, bytes: p.bytes, ext: EXT[p.type] });
        rels.push(['image', '../media/' + name]);
        shapes.push(picShape(id++, 'rId' + (rels.length + 1), fit(p.w, p.h, cell), 'Picture ' + (k + 1)));
      });
      slides.push({ xml: slideXml(shapes), rels: rels });
    });

    var exts = {}; media.forEach(function (m) { exts[m.ext] = 1; });
    var MIME = { png: 'image/png', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', svg: 'image/svg+xml' };
    files.push({ path: '[Content_Types].xml', text: HEAD + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
      Object.keys(exts).map(function (e) { return '<Default Extension="' + e + '" ContentType="' + MIME[e] + '"/>'; }).join('') +
      '<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>' +
      '<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>' +
      '<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>' +
      '<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>' +
      '<Override PartName="/ppt/presProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presProps+xml"/>' +
      '<Override PartName="/ppt/viewProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.viewProps+xml"/>' +
      '<Override PartName="/ppt/tableStyles.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.tableStyles+xml"/>' +
      slides.map(function (s, i) { return '<Override PartName="/ppt/slides/slide' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>'; }).join('') +
      '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
      '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>' });
    files.push({ path: '_rels/.rels', text: HEAD + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="' + REL + 'officeDocument" Target="ppt/presentation.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
      '<Relationship Id="rId3" Type="' + REL + 'extended-properties" Target="docProps/app.xml"/></Relationships>' });
    var stamp = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    files.push({ path: 'docProps/core.xml', text: HEAD + '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
      '<dc:title>' + x(deck.title || '') + '</dc:title><dc:creator>Signoff EE</dc:creator>' +
      '<dcterms:created xsi:type="dcterms:W3CDTF">' + stamp + '</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">' + stamp + '</dcterms:modified></cp:coreProperties>' });
    files.push({ path: 'docProps/app.xml', text: HEAD + '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Signoff EE</Application><Slides>' + slides.length + '</Slides></Properties>' });

    var pRels = [['slideMaster', 'slideMasters/slideMaster1.xml']];
    slides.forEach(function (s, i) { pRels.push(['slide', 'slides/slide' + (i + 1) + '.xml']); });
    pRels.push(['presProps', 'presProps.xml'], ['viewProps', 'viewProps.xml'], ['theme', 'theme/theme1.xml'], ['tableStyles', 'tableStyles.xml']);
    files.push({ path: 'ppt/_rels/presentation.xml.rels', text: relsXml(pRels) });
    files.push({ path: 'ppt/presentation.xml', text: HEAD + '<p:presentation xmlns:a="' + NS_A + '" xmlns:r="' + NS_R + '" xmlns:p="' + NS_P + '" saveSubsetFonts="1">' +
      '<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>' +
      slides.map(function (s, i) { return '<p:sldId id="' + (256 + i) + '" r:id="rId' + (i + 2) + '"/>'; }).join('') +
      '</p:sldIdLst><p:sldSz cx="' + W + '" cy="' + H + '"/><p:notesSz cx="6858000" cy="9144000"/>' +
      '<p:defaultTextStyle><a:defPPr><a:defRPr lang="en-US"/></a:defPPr></p:defaultTextStyle></p:presentation>' });
    files.push({ path: 'ppt/presProps.xml', text: HEAD + '<p:presentationPr xmlns:a="' + NS_A + '" xmlns:r="' + NS_R + '" xmlns:p="' + NS_P + '"/>' });
    files.push({ path: 'ppt/viewProps.xml', text: HEAD + '<p:viewPr xmlns:a="' + NS_A + '" xmlns:r="' + NS_R + '" xmlns:p="' + NS_P + '"><p:normalViewPr><p:restoredLeft sz="15620"/><p:restoredTop sz="94660"/></p:normalViewPr><p:gridSpacing cx="76200" cy="76200"/></p:viewPr>' });
    files.push({ path: 'ppt/tableStyles.xml', text: HEAD + '<a:tblStyleLst xmlns:a="' + NS_A + '" def="{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}"/>' });
    files.push({ path: 'ppt/slideMasters/slideMaster1.xml', text: HEAD + '<p:sldMaster xmlns:a="' + NS_A + '" xmlns:r="' + NS_R + '" xmlns:p="' + NS_P + '">' +
      '<p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld>' +
      '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>' +
      '<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>' +
      '<p:txStyles><p:titleStyle><a:lvl1pPr><a:defRPr sz="3200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mj-lt"/></a:defRPr></a:lvl1pPr></p:titleStyle>' +
      '<p:bodyStyle><a:lvl1pPr><a:defRPr sz="1800"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/></a:defRPr></a:lvl1pPr></p:bodyStyle>' +
      '<p:otherStyle><a:lvl1pPr><a:defRPr sz="1800"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/></a:defRPr></a:lvl1pPr></p:otherStyle></p:txStyles></p:sldMaster>' });
    files.push({ path: 'ppt/slideMasters/_rels/slideMaster1.xml.rels', text: relsXml([['slideLayout', '../slideLayouts/slideLayout1.xml'], ['theme', '../theme/theme1.xml']]) });
    files.push({ path: 'ppt/slideLayouts/slideLayout1.xml', text: HEAD + '<p:sldLayout xmlns:a="' + NS_A + '" xmlns:r="' + NS_R + '" xmlns:p="' + NS_P + '" type="blank" preserve="1">' +
      '<p:cSld name="Blank"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld>' +
      '<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>' });
    files.push({ path: 'ppt/slideLayouts/_rels/slideLayout1.xml.rels', text: relsXml([['slideMaster', '../slideMasters/slideMaster1.xml']]) });
    files.push({ path: 'ppt/theme/theme1.xml', text: THEME });
    slides.forEach(function (s, i) {
      files.push({ path: 'ppt/slides/slide' + (i + 1) + '.xml', text: s.xml });
      files.push({ path: 'ppt/slides/_rels/slide' + (i + 1) + '.xml.rels', text: relsXml([['slideLayout', '../slideLayouts/slideLayout1.xml']].concat(s.rels)) });
    });
    media.forEach(function (m) { files.push({ path: m.path, bytes: m.bytes }); });
    return zip(files);
  }

  function solid(c) { return '<a:solidFill><a:schemeClr val="' + c + '"/></a:solidFill>'; }
  function ln(w) { return '<a:ln w="' + w + '" cap="flat" cmpd="sng" algn="ctr">' + solid('phClr') + '<a:prstDash val="solid"/><a:miter lim="800000"/></a:ln>'; }
  var THEME = HEAD + '<a:theme xmlns:a="' + NS_A + '" name="Signoff"><a:themeElements>' +
    '<a:clrScheme name="Signoff"><a:dk1><a:srgbClr val="1D1D1F"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="004952"/></a:dk2><a:lt2><a:srgbClr val="F5F5F7"/></a:lt2>' +
    '<a:accent1><a:srgbClr val="00727F"/></a:accent1><a:accent2><a:srgbClr val="0A84FF"/></a:accent2><a:accent3><a:srgbClr val="30C158"/></a:accent3><a:accent4><a:srgbClr val="FFD60A"/></a:accent4>' +
    '<a:accent5><a:srgbClr val="FF9F0A"/></a:accent5><a:accent6><a:srgbClr val="FF453A"/></a:accent6><a:hlink><a:srgbClr val="00727F"/></a:hlink><a:folHlink><a:srgbClr val="004952"/></a:folHlink></a:clrScheme>' +
    '<a:fontScheme name="Signoff"><a:majorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme>' +
    '<a:fmtScheme name="Signoff"><a:fillStyleLst>' + solid('phClr') + solid('phClr') + solid('phClr') + '</a:fillStyleLst>' +
    '<a:lnStyleLst>' + ln(6350) + ln(12700) + ln(19050) + '</a:lnStyleLst>' +
    '<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>' +
    '<a:bgFillStyleLst>' + solid('phClr') + solid('phClr') + solid('phClr') + '</a:bgFillStyleLst></a:fmtScheme></a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>';

  window.SignoffPptx = { unzip: unzip, zip: zip, crc32: crc32, read: read, toItems: toItems, write: write };
})();
