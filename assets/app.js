/* Signoff app: state, storage, rendering and interaction. */
(function (S) {
  'use strict';
  var M = S.model;

  // ── Storage ──────────────────────────────────────────────
  var DEMO = /[?&]demo\b/.test(location.search) || location.hash === '#demo';
  var NS = DEMO ? 'signoff.demo.' : 'signoff.v1.';
  var TOKEN_KEY = 'signoff.token';

  function load(key, fallback) {
    try { var v = localStorage.getItem(NS + key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; }
  }
  function save(key, value) {
    try { localStorage.setItem(NS + key, JSON.stringify(value)); } catch (e) { toast('Couldn’t save in this browser: ' + e.message); }
  }
  function getToken() {
    try { return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; }
  }
  function setToken(token, remember) {
    try {
      sessionStorage.removeItem(TOKEN_KEY); localStorage.removeItem(TOKEN_KEY);
      if (token) (remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, token);
    } catch (e) { /* storage blocked */ }
  }

  var DEFAULT_SETTINGS = { user: '', owner: 'chrismessick-dpd', repo: 'ee_design_review', branch: 'main', dataPath: 'data', templatePath: 'templates', theme: 'auto' };
  var settings = Object.assign({}, DEFAULT_SETTINGS, load('settings', {}));
  var projects = load('projects', {});      // slug -> project document (working copy)
  var dirty = load('dirty', {});            // project id (or 'roster') -> time of last unsynced edit
  var cache = load('cache', {});            // repo path -> { sha } as of the last sync
  var roster = load('roster', M.emptyRoster());   // data/users.json: who sees which projects
  Object.keys(dirty).forEach(function (k) { if (projects[k]) { dirty[projects[k].id] = dirty[k]; delete dirty[k]; } });
  var pulledTemplates = load('templates', []);
  var lastSync = load('lastSync', null);    // { at, version }
  var ui = Object.assign({ slug: '', view: 'overview', filter: 'all', query: '', showArchived: false }, load('ui', {}));

  var TEMPLATES, INDEX;
  function refreshTemplates() {
    TEMPLATES = M.resolveTemplates(window.SIGNOFF_TEMPLATES || [], pulledTemplates);
    INDEX = M.indexTemplates(TEMPLATES);
  }
  refreshTemplates();

  if (DEMO && !Object.keys(projects).length && S.demo) {
    S.demo.projects(TEMPLATES).forEach(function (p) { projects[p.slug] = p; });
    settings.user = settings.user || 'Demo Reviewer';
    save('projects', projects); save('settings', settings);
  }

  function persist() { save('projects', projects); save('dirty', dirty); save('roster', roster); }

  // ── People and access ────────────────────────────────────
  // Who you are comes from your GitHub token (settings.login, set on sync). FTEs see every
  // project; contractors see the projects they're assigned in People. Before a first sync
  // (no login yet) everything local is shown.
  function myRole() { return DEMO ? 'fte' : M.roleOf(settings.login, roster, settings.owner); }
  function isFte() { return myRole() === 'fte'; }
  function visible(p) { return DEMO || !settings.login || M.canSee(p.id, settings.login, roster, settings.owner); }
  function visibleProjects() { return Object.keys(projects).map(function (k) { return projects[k]; }).filter(visible); }
  function touchRoster() { dirty.roster = M.now(); persist(); renderSyncState(); renderToolbar(); }
  function setPerson(login, fields) {
    login = String(login || '').trim().replace(/^@/, '').toLowerCase();
    if (!login) return;
    var prev = roster.users[login] || { login: login, name: '', role: 'contractor', projects: [] };
    roster.users[login] = M.stamp(Object.assign({}, prev, fields, { login: login }), me());
    touchRoster();
  }
  function assignedContractors(projectId) {
    return M.liveUsers(roster).filter(function (u) { return u.role === 'contractor' && (u.projects || []).indexOf(projectId) >= 0; });
  }
  function saveUi() { save('ui', { slug: ui.slug, view: ui.view, filter: ui.filter, showArchived: ui.showArchived }); }

  // ── Small helpers ────────────────────────────────────────
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  function plural(n, word, many) { return n + ' ' + (n === 1 ? word : (many || word + 's')); }
  function relTime(iso) {
    if (!iso) return '';
    var s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (s < 45) return 'just now';
    if (s < 3600) return Math.round(s / 60) + ' min ago';
    if (s < 86400) return Math.round(s / 3600) + ' h ago';
    if (s < 86400 * 7) return Math.round(s / 86400) + ' d ago';
    return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  }
  function fmtDate(iso) { return iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : ''; }
  function initials(name) {
    var parts = String(name || '?').trim().split(/\s+/);
    return ((parts[0] || '?')[0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
  }
  function hue(name) { var h = 0; for (var i = 0; i < (name || '').length; i++) h = (h * 31 + name.charCodeAt(i)) % 360; return h; }
  function me() { return settings.user || 'Anonymous'; }

  var ICON = {
    check: '<svg class="i-check" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 6.2l2.3 2.3 4.7-5"/></svg>',
    bang: '<svg class="i-bang" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 2.5v4.2M6 9.3v.1"/></svg>',
    dash: '<svg class="i-dash" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M3 6h6"/></svg>',
    chev: '<svg class="sec-chev" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 5.2L7 8.8l3.5-3.6"/></svg>',
    bubble: '<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M2.2 3.2a1.5 1.5 0 011.5-1.5h6.6a1.5 1.5 0 011.5 1.5v4.6a1.5 1.5 0 01-1.5 1.5H6l-2.8 2.4V9.3h0a1.5 1.5 0 01-1-1.5z" stroke-linejoin="round"/></svg>',
    search: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="7" cy="7" r="5"/><path d="M11 11l3.5 3.5" stroke-linecap="round"/></svg>',
    close: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg>',
    more: '<svg viewBox="0 0 20 20" fill="currentColor"><circle cx="5" cy="10" r="1.5"/><circle cx="10" cy="10" r="1.5"/><circle cx="15" cy="10" r="1.5"/></svg>',
    doc: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M5 2.5h6.5L15 6v11.5H5z"/><path d="M11.5 2.5V6H15M7.5 10h5M7.5 13h5"/></svg>',
    sync: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M16 8a6 6 0 00-10.6-2.6L4 7M4 12a6 6 0 0010.6 2.6L16 13"/><path d="M4 3.5V7h3.5M16 16.5V13h-3.5"/></svg>',
    moon: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M16.2 12.4A6.6 6.6 0 017.6 3.8a6.6 6.6 0 108.6 8.6z"/></svg>',
    sun: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="10" cy="10" r="3.4"/><path d="M10 2v1.8M10 16.2V18M2 10h1.8M16.2 10H18M4.3 4.3l1.3 1.3M14.4 14.4l1.3 1.3M15.7 4.3l-1.3 1.3M5.6 14.4l-1.3 1.3"/></svg>',
    clipboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="4" width="14" height="17" rx="2.5"/><path d="M9 4.5V3h6v1.5M8.5 11l2 2 4-4.5M8.5 17h7"/></svg>'
  };

  function ring(pct, size, stroke, label, sub) {
    var r = (size - stroke) / 2, c = 2 * Math.PI * r;
    return '<div class="ring" style="width:' + size + 'px;height:' + size + 'px">' +
      '<svg width="' + size + '" height="' + size + '"><circle class="ring-track" cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" stroke-width="' + stroke + '"/>' +
      '<circle class="ring-val" cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" stroke-width="' + stroke + '" stroke-linecap="round" stroke-dasharray="' + c + '" stroke-dashoffset="' + (c * (1 - pct / 100)) + '"/></svg>' +
      (label != null ? '<div class="ring-label"><div><b>' + label + '</b>' + (sub ? '<span>' + sub + '</span>' : '') + '</div></div>' : '') + '</div>';
  }
  function bar(c) {
    if (!c.total) return '<div class="bar"></div>';
    return '<div class="bar"><i class="b-pass" style="width:' + (100 * c.pass / c.total) + '%"></i><i class="b-issue" style="width:' + (100 * c.issue / c.total) + '%"></i><i class="b-na" style="width:' + (100 * c.na / c.total) + '%"></i></div>';
  }

  // ── Current project helpers ──────────────────────────────
  function current() { var p = projects[ui.slug]; return p && visible(p) ? p : null; }
  function templateById(id) { return TEMPLATES.filter(function (t) { return t.id === id; })[0]; }
  function projectTemplates(p) { return TEMPLATES.filter(function (t) { return p.meta.checklists.indexOf(t.id) >= 0; }); }

  function touch(p) {
    dirty[p.id] = M.now();
    persist();
    renderSidebar();
    renderSyncState();
  }

  function itemDef(p, id) {
    if (INDEX.items[id]) return { def: INDEX.items[id].item, section: INDEX.items[id].section, template: INDEX.items[id].template };
    var c = p.custom[id];
    if (c) return { def: c, section: (INDEX.sections[c.section] || {}).section, template: templateById(c.checklist), custom: true };
    var st = p.items[id] || {};
    return { def: { id: id, text: st.text || '(retired item ' + id + ')', severity: 'minor' }, retired: true };
  }

  // ── Mutations ────────────────────────────────────────────
  function setItem(id, fields) {
    var p = current(); if (!p) return;
    var prev = p.items[id] || {};
    var next = Object.assign({}, prev, fields);
    // Keep the wording with the state, so a retired item still reads sensibly.
    var d = itemDef(p, id);
    if (!d.retired) { next.text = d.def.text; if (d.template) next.checklist = d.template.id; }
    p.items[id] = M.stamp(next, me());
    touch(p);
    renderPage(); renderInspector();
  }
  function setStatus(id, status) {
    var p = current(); if (!p) return;
    var prev = p.items[id] || {};
    var fields = { status: status };
    if (status === 'issue' && !prev.resolution) fields.resolution = '';
    setItem(id, fields);
  }
  function toggleSectionNA(secId) {
    var p = current(); if (!p) return;
    var prev = p.sections[secId] || {};
    p.sections[secId] = M.stamp(Object.assign({}, prev, { na: !prev.na }), me());
    touch(p); renderPage();
  }
  function addComment(itemId, text) {
    var p = current(); if (!p || !text.trim()) return;
    var id = M.uid('c');
    p.comments[id] = M.stamp({ id: id, item: itemId || null, author: me(), at: M.now(), text: text.trim() }, me());
    touch(p); renderPage(); renderInspector();
  }
  function deleteComment(id) {
    var p = current(); if (!p || !p.comments[id]) return;
    p.comments[id] = M.stamp(Object.assign({}, p.comments[id], { deleted: true, text: '' }), me());
    touch(p); renderPage(); renderInspector();
  }
  function addCustom(checklist, section, text) {
    var p = current(); if (!p || !text.trim()) return;
    var id = M.uid('x');
    p.custom[id] = M.stamp({ id: id, checklist: checklist, section: section, text: text.trim(), hint: '', severity: 'major', createdAt: M.now() }, me());
    touch(p); renderPage();
    return id;
  }
  function updateMeta(fields) {
    var p = current(); if (!p) return;
    p.meta = M.stamp(Object.assign({}, p.meta, fields), me());
    touch(p); render();
  }

  // ── Sidebar ──────────────────────────────────────────────
  function renderSidebar() {
    var q = ($('#project-search').value || '').toLowerCase();
    var list = visibleProjects()
      .filter(function (p) { return !q || [p.meta.name, p.meta.client, p.meta.board].join(' ').toLowerCase().indexOf(q) >= 0; })
      .sort(function (a, b) { return (b.meta.updatedAt || '').localeCompare(a.meta.updatedAt || ''); });
    var active = list.filter(function (p) { return !p.meta.archived; });
    var archived = list.filter(function (p) { return p.meta.archived; });
    function row(p) {
      var st = M.projectStats(p, TEMPLATES);
      return '<button class="proj' + (p.slug === ui.slug ? ' active' : '') + '" data-act="open-project" data-slug="' + esc(p.slug) + '">' +
        ring(st.pct, 26, 3.5) +
        '<span class="proj-body"><span class="proj-name">' + esc(p.meta.name) + '</span>' +
        '<span class="proj-sub">' + esc([p.meta.board, p.meta.revision && 'Rev ' + p.meta.revision].filter(Boolean).join(' · ') || p.meta.stage) + '</span></span>' +
        (dirty[p.id] ? '<span class="proj-dirty" title="Not synced yet"></span>' : '') + '</button>';
    }
    var html = active.map(row).join('') || '<div class="side-empty">' + (q ? 'No matching projects.' : myRole() === 'fte' ? 'No projects yet.' : 'No projects shared with you yet.') + '</div>';
    if (archived.length) {
      html += '<div class="side-archived"><div class="side-head"><span class="side-label">Archived</span><button class="btn-plain btn" style="padding:2px 6px;font-size:12px" data-act="toggle-archived">' + (ui.showArchived ? 'Hide' : 'Show ' + archived.length) + '</button></div>' +
        (ui.showArchived ? archived.map(row).join('') : '') + '</div>';
    }
    $('#project-list').innerHTML = html;
    $('[data-act="new-project"]').hidden = !isFte();
    var people = $('#people-link');
    people.hidden = DEMO || !isFte();
    people.classList.toggle('active', ui.page === 'people');
  }

  function renderSyncState(state) {
    var dot = $('#sync-dot'), title = $('#sync-title'), sub = $('#sync-sub');
    var n = Object.keys(dirty).length;
    if (DEMO) { dot.dataset.tone = 'idle'; title.textContent = 'Demo mode'; sub.textContent = 'Changes stay in this browser'; return; }
    if (state === 'busy') { dot.dataset.tone = 'busy'; title.textContent = 'Syncing…'; sub.textContent = settings.owner + '/' + settings.repo; return; }
    if (state === 'error') { dot.dataset.tone = 'error'; title.textContent = 'Sync failed'; sub.textContent = 'Click for details'; return; }
    if (!getToken()) { dot.dataset.tone = n ? 'warn' : 'idle'; title.textContent = n ? plural(n, 'unsynced change') : 'Local only'; sub.textContent = 'Set up Git sync'; return; }
    if (n) { dot.dataset.tone = 'warn'; title.textContent = plural(n, 'unsynced change'); sub.textContent = 'Click to sync'; return; }
    var outdated = lastSync && lastSync.version && window.SIGNOFF_VERSION && lastSync.version.hash !== window.SIGNOFF_VERSION.hash;
    dot.dataset.tone = outdated ? 'warn' : 'ok';
    title.textContent = outdated ? 'Newer tool available' : 'Synced';
    sub.textContent = outdated ? 'Get the latest from ' + settings.repo : (lastSync ? relTime(lastSync.at) : 'Ready') +
      (settings.login ? ' \u00b7 ' + settings.login + (myRole() === 'contractor' ? ' (contractor)' : myRole() === 'none' ? ' (no access yet)' : '') : '');
  }

  // ── Toolbar ──────────────────────────────────────────────
  function renderToolbar() {
    var p = current();
    $('#toolbar-title').textContent = p ? p.meta.name : '';
    var seg = $('#view-seg'), acts = $('#toolbar-actions');
    if (!p || ui.page === 'people') {
      seg.innerHTML = '';
      var dn = Object.keys(dirty).length;
      acts.innerHTML = DEMO ? '' : '<button class="btn" data-act="sync" title="Sync with GitHub (Ctrl+S)">' + ICON.sync + '<span class="btn-label">Sync</span>' + (dn ? '<span class="badge">' + dn + '</span>' : '') + '</button>';
      return;
    }
    var st = M.projectStats(p, TEMPLATES);
    var views = [{ id: 'overview', label: 'Overview' }].concat(projectTemplates(p).map(function (t) {
      var c = st.per[t.id];
      return { id: t.id, label: t.short, extra: c && c.issuesOpen ? '<span class="dot"></span>' : '' };
    }));
    views.push({ id: 'findings', label: 'Findings', extra: st.issue ? '<span class="count">' + st.issue + '</span>' : '' });
    if (views.map(function (v) { return v.id; }).indexOf(ui.view) < 0) ui.view = 'overview';
    seg.innerHTML = views.map(function (v) {
      return '<button role="tab" class="' + (v.id === ui.view ? 'on' : '') + '" data-act="view" data-view="' + v.id + '">' + esc(v.label) + (v.extra || '') + '</button>';
    }).join('');
    var n = Object.keys(dirty).length;
    acts.innerHTML =
      '<button class="btn" data-act="sync" title="Sync with GitHub (Ctrl+S)">' + ICON.sync + '<span class="btn-label">Sync</span>' + (n && !DEMO ? '<span class="badge">' + n + '</span>' : '') + '</button>' +
      '<button class="btn" data-act="report" title="Review report">' + ICON.doc + '<span class="btn-label">Report</span></button>' +
      '<button class="icon-btn" data-act="project-menu" title="More" aria-label="More">' + ICON.more + '</button>';
  }

  // ── Pages ────────────────────────────────────────────────
  function renderPage() {
    var p = current();
    var page = $('#page');
    var scroll = $('#main').scrollTop;
    if (ui.page === 'people' && isFte() && !DEMO) { page.innerHTML = peoplePage(); renderToolbar(); return; }
    ui.page = '';
    if (!p) { page.innerHTML = emptyPage(); renderToolbar(); return; }
    renderToolbar();
    if (ui.view === 'overview') page.innerHTML = overviewPage(p);
    else if (ui.view === 'findings') page.innerHTML = findingsPage(p);
    else page.innerHTML = checklistPage(p, templateById(ui.view));
    $('#main').scrollTop = scroll;
  }

  function emptyPage() {
    if (!isFte()) {
      return '<div class="page"><div class="empty"><div class="empty-art">' + ICON.clipboard + '</div>' +
        '<h2>' + (myRole() === 'none' ? 'You\u2019re not on a project yet' : 'Pick a project') + '</h2>' +
        '<p>' + (myRole() === 'none' ? 'Signed in as <b>' + esc(settings.login) + '</b>. Ask your Dovetail contact to add you to a project, then sync.' : 'Choose a project from the sidebar.') + '</p>' +
        '<button class="btn btn-primary" data-act="sync">Sync now</button></div></div>';
    }
    var none = !visibleProjects().length;
    return '<div class="page"><div class="empty"><div class="empty-art">' + ICON.clipboard + '</div>' +
      '<h2>' + (none ? 'Start a design review' : 'Pick a project') + '</h2>' +
      '<p>' + (none ? 'Create a project, choose the checklists and what kind of board it is, and Signoff builds a review tailored to it.' : 'Choose a project from the sidebar, or start a new one.') + '</p>' +
      '<button class="btn btn-primary" data-act="new-project">New project</button>' +
      (none && !DEMO ? ' <button class="btn" data-act="sync">Pull from GitHub</button>' : '') +
      (none ? '<p class="note" style="margin-top:18px">' + TEMPLATES.length + ' checklists · ' + Object.keys(INDEX.items).length + ' checks available</p>' : '') +
      '</div></div>';
  }

  function headBlock(p, eyebrow) {
    var m = p.meta;
    var sub = [m.client, m.board, m.revision && 'Rev ' + m.revision].filter(Boolean).map(esc).join('<span class="sep">·</span>');
    return '<div class="eyebrow">' + esc(eyebrow) + '</div><h1 class="page-title">' + esc(m.name) + '</h1>' +
      '<div class="page-sub">' + (sub ? '<span>' + sub + '</span>' : '') + '<span class="chip accent">' + esc(m.stage) + '</span></div>';
  }

  function overviewPage(p) {
    var st = M.projectStats(p, TEMPLATES);
    var tpls = projectTemplates(p);
    var people = {};
    M.liveComments(p).forEach(function (c) { people[c.author] = 1; });
    Object.keys(p.items).forEach(function (k) { if (p.items[k].updatedBy) people[p.items[k].updatedBy] = 1; });
    var recent = M.liveComments(p).slice(-6).reverse();
    var profile = (p.meta.profile || []).map(function (t) {
      var tag = M.TAGS.filter(function (x) { return x.id === t; })[0];
      return '<span class="chip">' + esc(tag ? tag.label : t) + '</span>';
    }).join('');
    var html = '<div class="page">' +
      '<div class="page-head"><div class="page-head-text">' + headBlock(p, 'Design review') +
      (p.meta.description ? '<p style="color:var(--text-2);margin:14px 0 0;max-width:62ch">' + esc(p.meta.description) + '</p>' : '') +
      '<div class="chips" style="margin-top:14px">' + (profile || '<span class="chip">General board</span>') +
      '<button class="btn btn-plain" style="padding:2px 8px;font-size:12px" data-act="edit-project">Edit profile</button></div></div>' +
      ring(st.pct, 132, 11, st.pct + '%', 'reviewed') + '</div>' +
      '<div class="grid grid-4">' +
      stat(st.pass, 'Passed', 'pass') + stat(st.issue, plural(st.issue, 'Issue').replace(/^\d+ /, '') + (st.issuesOpen ? ' · ' + st.issuesOpen + ' open' : ''), 'issue') +
      stat(st.open, 'To review', '') + stat(st.na, 'Not applicable', '') + '</div>' +
      (st.outside ? '<p class="note" style="margin-top:10px">' + plural(st.outside, 'check') + ' outside this board’s profile ' + (st.outside === 1 ? 'is' : 'are') + ' set aside and not counted.</p>' : '') +
      '<div class="section-title">Checklists</div><div class="grid grid-3">' +
      tpls.map(function (t) {
        var c = st.per[t.id];
        return '<button class="card cl-card" data-act="view" data-view="' + t.id + '">' +
          '<div class="cl-card-top"><div><div class="cl-card-title">' + esc(t.title) + '</div><div class="cl-card-desc">' + esc(t.description) + '</div></div>' + ring(c.pct, 46, 5, c.pct, '') + '</div>' +
          bar(c) + '<div class="cl-card-foot"><span><b>' + c.reviewed + '</b>/' + c.total + ' reviewed</span>' + (c.issue ? '<span style="color:var(--issue)"><b>' + c.issue + '</b> ' + (c.issue === 1 ? 'issue' : 'issues') + '</span>' : '') + '</div></button>';
      }).join('') + '</div>';
    if (recent.length) {
      html += '<div class="section-title">Recent discussion</div><div class="card" style="padding:16px 18px 2px">' +
        recent.map(function (c) {
          var d = c.item ? itemDef(p, c.item) : null;
          return '<div class="cmt" style="cursor:pointer" data-act="goto-item" data-id="' + esc(c.item || '') + '">' + avatar(c.author) + '<div><div class="cmt-head"><b>' + esc(c.author) + '</b><span>' + relTime(c.at) + '</span></div>' +
            (d ? '<div class="muted" style="font-size:12px;color:var(--text-3)">' + esc(d.def.text) + '</div>' : '') +
            '<div class="cmt-text">' + esc(c.text) + '</div></div></div>';
        }).join('') + '</div>';
    }
    html += '<p class="note" style="margin-top:28px">Created ' + fmtDate(p.createdAt) + (p.createdBy ? ' by ' + esc(p.createdBy) : '') +
      (Object.keys(people).length ? ' · Reviewers: ' + Object.keys(people).map(esc).join(', ') : '') + '</p></div>';
    return html;
  }
  function stat(n, label, cls) { return '<div class="card stat ' + cls + '"><div class="stat-num">' + n + '</div><div class="stat-label">' + esc(label) + '</div></div>'; }
  function avatar(name) { return '<div class="avatar" style="background:hsl(' + hue(name) + ' 45% 42%)">' + esc(initials(name)) + '</div>'; }

  var showHidden = {};   // section id -> show profile-hidden items
  var collapsed = load('collapsed', {});

  function commentCounts(p) {
    var n = {};
    M.liveComments(p).forEach(function (c) { if (c.item) n[c.item] = (n[c.item] || 0) + 1; });
    return n;
  }

  function matches(r, counts) {
    if (ui.query) {
      var q = ui.query.toLowerCase();
      if ((r.def.text + ' ' + (r.def.hint || '')).toLowerCase().indexOf(q) < 0) return false;
    }
    if (ui.filter === 'open') return r.status === 'open';
    if (ui.filter === 'issue') return r.status === 'issue';
    if (ui.filter === 'comments') return !!counts[r.id];
    return true;
  }

  function checklistPage(p, t) {
    if (!t) return emptyPage();
    var groups = M.checklistRows(p, t);
    var counts = commentCounts(p);
    var all = [];
    groups.forEach(function (g) { all = all.concat(g.rows); });
    var c = M.countStatuses(all);
    var filters = [['all', 'All', c.total], ['open', 'To review', c.open], ['issue', 'Issues', c.issue], ['comments', 'Discussed', Object.keys(counts).filter(function (k) { return all.some(function (r) { return r.id === k; }); }).length]];
    var html = '<div class="page">' +
      '<div class="cl-head"><div>' + '<div class="eyebrow">' + esc(p.meta.name) + '</div><h1 class="page-title">' + esc(t.title) + '</h1>' +
      '<div class="page-sub"><span>' + c.reviewed + ' of ' + c.total + ' reviewed</span>' + (c.issue ? '<span class="sep">·</span><span style="color:var(--issue)">' + plural(c.issue, 'issue') + '</span>' : '') + '</div></div>' +
      ring(c.pct, 64, 6, c.pct + '%', '') + '</div>' +
      '<div class="filters"><div class="seg">' + filters.map(function (f) {
        return '<button class="' + (ui.filter === f[0] ? 'on' : '') + '" data-act="filter" data-filter="' + f[0] + '">' + f[1] + ' <span class="count">' + f[2] + '</span></button>';
      }).join('') + '</div>' +
      '<div class="search">' + ICON.search + '<input id="item-search" type="search" placeholder="Filter checks  /" value="' + esc(ui.query) + '" autocomplete="off"></div>' +
      '<span style="flex:1"></span><button class="btn btn-plain" data-act="collapse-all">' + (groups.every(function (g) { return collapsed[g.section.id]; }) ? 'Expand all' : 'Collapse all') + '</button></div>';

    var shown = 0;
    groups.forEach(function (g) {
      var rows = g.rows.filter(function (r) { return matches(r, counts); });
      var visible = rows.filter(function (r) { return !r.hidden || showHidden[g.section.id] || ui.filter !== 'all' || ui.query; });
      var hiddenCount = rows.length - visible.length;
      if (!rows.length && (ui.filter !== 'all' || ui.query)) return;
      shown += rows.length;
      var gc = M.countStatuses(g.rows);
      var isCollapsed = collapsed[g.section.id] && ui.filter === 'all' && !ui.query;
      html += '<section class="card sec' + (isCollapsed ? ' collapsed' : '') + (g.state.na ? ' is-na' : '') + '" data-sec="' + esc(g.section.id) + '">' +
        '<div class="sec-head" data-act="toggle-sec" data-sec="' + esc(g.section.id) + '">' + ICON.chev +
        '<div class="sec-title">' + esc(g.section.title) + (!g.applies ? '<small>Not in profile</small>' : '') + '</div>' +
        '<div class="sec-meta">' + (gc.issue ? '<span style="color:var(--issue)">' + gc.issue + ' !</span>' : '') + '<span>' + gc.reviewed + '/' + gc.total + '</span>' + bar(gc) +
        '<button class="sec-na' + (g.state.na ? ' on' : '') + '" data-act="sec-na" data-sec="' + esc(g.section.id) + '" title="Mark the whole section not applicable">N/A</button></div></div>' +
        '<div class="sec-body">' + visible.map(function (r) { return itemRow(r, counts); }).join('') +
        (hiddenCount ? '<div class="hidden-rows"><span>' + plural(hiddenCount, 'check') + ' not applicable to this board’s profile</span><button data-act="show-hidden" data-sec="' + esc(g.section.id) + '">Show</button></div>' :
          (showHidden[g.section.id] && g.rows.some(function (r) { return r.hidden; }) ? '<div class="hidden-rows"><span>Showing checks outside the profile</span><button data-act="show-hidden" data-sec="' + esc(g.section.id) + '">Hide</button></div>' : '')) +
        (ui.filter === 'all' && !ui.query ? '<div class="add-row"><input data-add="' + esc(t.id) + '|' + esc(g.section.id) + '" placeholder="+ Add a check for this project" maxlength="400"></div>' : '') +
        '</div></section>';
    });
    if (!shown) html += '<div class="empty"><h2>Nothing here</h2><p>No checks match this filter.</p></div>';

    // Item state left over from checks this template no longer has.
    var retired = M.retiredItems(p, INDEX).filter(function (id) { return (p.items[id] || {}).checklist === t.id; });
    if (retired.length) {
      html += '<div class="retired"><div class="section-title">Retired checks</div><section class="card sec"><div class="sec-body" style="border:none">' +
        retired.map(function (id) { var r = { id: id, def: itemDef(p, id).def, state: p.items[id] || {}, status: (p.items[id] || {}).status || 'open', severity: 'minor' }; return itemRow(r, counts); }).join('') + '</div></section></div>';
    }
    return html + '</div>';
  }

  function itemRow(r, counts) {
    var n = counts[r.id] || 0;
    var sub = '';
    if (r.severity !== 'minor' || r.status === 'issue') sub += '<span class="sev ' + r.severity + '">' + r.severity[0].toUpperCase() + r.severity.slice(1) + '</span>';
    if (r.status === 'issue') {
      var res = r.state.resolution;
      sub += '<span class="res ' + (res || 'open') + '">' + (res === 'fixed' ? 'Fixed' : res === 'waived' ? 'Waived' : 'Open') + '</span>';
      if (r.state.assignee) sub += '<span>→ ' + esc(r.state.assignee) + '</span>';
    }
    if (r.auto === 'profile') sub += '<span class="tag">Outside profile</span>';
    if (r.custom) sub += '<span class="tag">Project check</span>';
    (r.def.tags || []).forEach(function (tg) { sub += '<span class="tag">' + esc(tg) + '</span>'; });
    var stCls = r.status === 'open' ? '' : r.status;
    return '<div class="item st-' + r.status + (r.auto ? ' auto-na' : '') + (selected === r.id ? ' sel' : '') + '" data-act="select" data-id="' + esc(r.id) + '">' +
      '<button class="status ' + stCls + '" data-act="cycle" data-id="' + esc(r.id) + '" title="Pass (P) · Issue (I) · N/A (N)" aria-label="Status: ' + r.status + '">' + ICON.check + ICON.bang + ICON.dash + '</button>' +
      '<div><div class="item-text">' + esc(r.def.text) + '</div><div class="item-sub">' + sub + '</div></div>' +
      '<div class="item-right"><div class="quick">' +
      '<button class="q-pass" data-act="set" data-status="pass" data-id="' + esc(r.id) + '">Pass</button>' +
      '<button class="q-issue" data-act="set" data-status="issue" data-id="' + esc(r.id) + '">Issue</button>' +
      '<button data-act="set" data-status="na" data-id="' + esc(r.id) + '">N/A</button></div>' +
      (n ? '<span class="cmt-count">' + ICON.bubble + n + '</span>' : '') + '</div></div>';
  }

  function allFindings(p) {
    var out = [];
    projectTemplates(p).forEach(function (t) {
      M.checklistRows(p, t).forEach(function (g) {
        g.rows.forEach(function (r) { if (r.status === 'issue') out.push({ row: r, template: t, section: g.section }); });
      });
    });
    var rank = { critical: 0, major: 1, minor: 2 };
    var resRank = { '': 0, fixed: 1, waived: 2 };
    return out.sort(function (a, b) {
      return (resRank[a.row.state.resolution || ''] - resRank[b.row.state.resolution || '']) || (rank[a.row.severity] - rank[b.row.severity]);
    });
  }

  function findingsPage(p) {
    var f = allFindings(p);
    var counts = commentCounts(p);
    var open = f.filter(function (x) { return !x.row.state.resolution; }).length;
    var html = '<div class="page"><div class="cl-head"><div><div class="eyebrow">' + esc(p.meta.name) + '</div><h1 class="page-title">Findings</h1>' +
      '<div class="page-sub"><span>' + plural(f.length, 'issue') + '</span><span class="sep">·</span><span>' + open + ' open</span></div></div>' +
      '<button class="btn" data-act="export-csv">Export CSV</button></div>';
    if (!f.length) return html + '<div class="card empty"><div class="empty-art">' + ICON.clipboard + '</div><h2>No issues raised</h2><p>Mark a check as an Issue to add it here, with its severity, owner and resolution.</p></div></div>';
    html += '<div class="card" style="overflow:hidden"><table class="table"><thead><tr><th>Severity</th><th>Check</th><th>Owner</th><th>Status</th><th></th></tr></thead><tbody>' +
      f.map(function (x) {
        var r = x.row, res = r.state.resolution;
        var last = M.liveComments(p, r.id).slice(-1)[0];
        return '<tr data-act="goto-item" data-id="' + esc(r.id) + '"><td><span class="sev ' + r.severity + '">' + r.severity[0].toUpperCase() + r.severity.slice(1) + '</span></td>' +
          '<td>' + esc(r.def.text) + '<div class="muted">' + esc(x.template.short + ' › ' + x.section.title) + '</div>' + (last ? '<div class="muted" style="margin-top:4px">“' + esc(last.text.slice(0, 140)) + (last.text.length > 140 ? '…' : '') + '” — ' + esc(last.author) + '</div>' : '') + '</td>' +
          '<td class="muted">' + esc(r.state.assignee || '—') + '</td>' +
          '<td><span class="res ' + (res || 'open') + '">' + (res === 'fixed' ? 'Fixed' : res === 'waived' ? 'Waived' : 'Open') + '</span></td>' +
          '<td class="muted">' + (counts[r.id] ? '<span class="cmt-count">' + ICON.bubble + counts[r.id] + '</span>' : '') + '</td></tr>';
      }).join('') + '</tbody></table></div></div>';
    return html;
  }

  // ── Inspector ────────────────────────────────────────────
  var selected = null;

  function select(id, open) {
    selected = id;
    document.querySelectorAll('.item.sel').forEach(function (el) { el.classList.remove('sel'); });
    var el = document.querySelector('.item[data-id="' + CSS.escape(id) + '"]');
    if (el) { el.classList.add('sel'); el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
    if (open) { $('#inspector').classList.add('open'); renderInspector(); }
    else if ($('#inspector').classList.contains('open')) renderInspector();
  }
  function closeInspector() { $('#inspector').classList.remove('open'); }

  function renderInspector() {
    var el = $('#inspector'), p = current();
    if (!p || !selected || !el.classList.contains('open')) return;
    var d = itemDef(p, selected);
    var st = p.items[selected] || {};
    var row = null;
    if (d.template) {
      M.checklistRows(p, d.template).forEach(function (g) { g.rows.forEach(function (r) { if (r.id === selected) row = r; }); });
    }
    var status = row ? row.status : (st.status || 'open');
    var sev = st.severity || d.def.severity || 'minor';
    var comments = M.liveComments(p, selected);
    var draft = el.querySelector('#comment-input');
    var draftText = draft ? draft.value : '';
    var statusBtn = function (s, label) { return '<button class="s-' + s + (status === s ? ' on' : '') + '" data-act="set" data-status="' + s + '" data-id="' + esc(selected) + '">' + label + '</button>'; };
    el.innerHTML = '<div class="insp-head"><div class="insp-crumb">' + esc(d.template ? d.template.short + ' › ' + (d.section ? d.section.title : '') : 'Retired check') + '</div>' +
      '<button class="icon-btn" data-act="close-insp" aria-label="Close">' + ICON.close + '</button></div>' +
      '<div class="insp-body">' +
      '<div class="insp-title"' + (d.custom ? ' contenteditable="true" data-edit-custom="' + esc(selected) + '"' : '') + '>' + esc(d.def.text) + '</div>' +
      (d.def.hint ? '<div class="hint"><b>Guidance</b>' + esc(d.def.hint) + '</div>' : '') +
      (row && row.auto ? '<div class="note" style="margin:-4px 0 12px">' + (row.auto === 'section' ? 'Counted as N/A because the section is marked N/A.' : 'Counted as N/A: outside this board’s profile (' + esc((d.def.tags || d.section.tags || []).join(', ')) + '). Set a status to review it anyway.') + '</div>' : '') +
      '<div class="field"><span class="field-label">Status</span><div class="seg full">' + statusBtn('open', 'To review') + statusBtn('pass', 'Pass') + statusBtn('issue', 'Issue') + statusBtn('na', 'N/A') + '</div></div>' +
      (status === 'issue' ? '<div class="issue-box">' +
        '<div class="field"><span class="field-label">Severity</span><div class="seg full">' + M.SEVERITIES.map(function (s) {
          return '<button class="' + (sev === s ? 'on' : '') + '" data-act="item-field" data-key="severity" data-val="' + s + '"><span class="sev ' + s + '">' + s[0].toUpperCase() + s.slice(1) + '</span></button>';
        }).join('') + '</div></div>' +
        '<div class="field"><span class="field-label">Resolution</span><div class="seg full">' + [['', 'Open'], ['fixed', 'Fixed'], ['waived', 'Waived']].map(function (r) {
          return '<button class="' + ((st.resolution || '') === r[0] ? 'on' : '') + '" data-act="item-field" data-key="resolution" data-val="' + r[0] + '">' + r[1] + '</button>';
        }).join('') + '</div></div>' +
        '<div class="field"><label for="assignee">Owner</label><input class="input" id="assignee" value="' + esc(st.assignee || '') + '" placeholder="Who will fix it" data-item-input="assignee"></div>' +
        '<div class="field"><label for="ref">Reference</label><input class="input" id="ref" value="' + esc(st.ref || '') + '" placeholder="Designators, sheet, net, ticket…" data-item-input="ref"></div>' +
        '</div>' : '') +
      (st.updatedAt ? '<div class="meta-line">Last changed by ' + esc(st.updatedBy || 'someone') + ', ' + relTime(st.updatedAt) + '</div>' : '') +
      (d.custom ? '<button class="btn btn-danger" data-act="delete-custom" data-id="' + esc(selected) + '" style="margin-bottom:10px">Delete project check</button>' : '') +
      '<div class="thread"><div class="thread-title">Discussion <span class="note" style="margin:0">' + (comments.length || '') + '</span></div>' +
      (comments.length ? comments.map(function (c) {
        return '<div class="cmt">' + avatar(c.author) + '<div><div class="cmt-head"><b>' + esc(c.author) + '</b><span title="' + esc(new Date(c.at).toLocaleString()) + '">' + relTime(c.at) + '</span>' +
          (c.author === me() ? '<button class="cmt-del" data-act="del-comment" data-id="' + esc(c.id) + '">Delete</button>' : '') + '</div><div class="cmt-text">' + esc(c.text) + '</div></div></div>';
      }).join('') : '<p class="note">No comments yet. Note what you checked, what you found, or ask the designer a question.</p>') +
      '</div></div>' +
      '<div class="composer"><textarea class="input" id="comment-input" placeholder="Add a comment…" rows="2">' + esc(draftText) + '</textarea>' +
      '<div class="composer-foot"><span><kbd>Ctrl</kbd> + <kbd>Enter</kbd> to post</span><button class="btn btn-primary" data-act="post-comment">Comment</button></div></div>';
  }

  // ── Sheets ───────────────────────────────────────────────
  function sheet(html, opts) {
    closeSheet();
    var wrap = document.createElement('div');
    wrap.className = 'sheet-wrap';
    wrap.id = 'sheet';
    wrap.innerHTML = '<div class="sheet' + (opts && opts.wide ? ' wide' : '') + '" role="dialog" aria-modal="true">' + html + '</div>';
    wrap.addEventListener('mousedown', function (e) { if (e.target === wrap && !(opts && opts.sticky)) closeSheet(); });
    document.body.appendChild(wrap);
    var first = wrap.querySelector('input:not([type=checkbox]),textarea');
    if (first) setTimeout(function () { first.focus(); }, 30);
    return wrap;
  }
  function closeSheet() { var s = $('#sheet'); if (s) s.remove(); }

  function projectSheet(p) {
    var editing = !!p;
    var contractors = M.liveUsers(roster).filter(function (u) { return u.role === 'contractor'; });
    var m = p ? p.meta : { name: '', client: '', board: '', revision: '', stage: 'Schematic', description: '', profile: [], checklists: TEMPLATES.map(function (t) { return t.id; }).filter(function (id) { return id !== 'bringup'; }) };
    var w = sheet('<div class="sheet-head"><h2>' + (editing ? 'Project details' : 'New design review') + '</h2><p>' + (editing ? 'Changes sync to everyone on this project.' : 'Pick the checklists and describe the board. Checks that don’t fit its profile are set aside as N/A, and you can still bring any of them back.') + '</p></div>' +
      '<div class="sheet-body">' +
      '<div class="field"><label for="f-name">Project name</label><input class="input" id="f-name" value="' + esc(m.name) + '" placeholder="e.g. Sensor hub main board" maxlength="120"></div>' +
      '<div class="row2"><div class="field"><label for="f-client">Client</label><input class="input" id="f-client" value="' + esc(m.client) + '" placeholder="Optional"></div>' +
      '<div class="field"><label for="f-board">Board / PCBA number</label><input class="input" id="f-board" value="' + esc(m.board) + '" placeholder="e.g. PCB-1042"></div></div>' +
      '<div class="row2"><div class="field"><label for="f-rev">Revision</label><input class="input" id="f-rev" value="' + esc(m.revision) + '" placeholder="e.g. 03"></div>' +
      '<div class="field"><label for="f-stage">Stage</label><select class="input" id="f-stage">' + M.STAGES.map(function (s) { return '<option' + (s === m.stage ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select></div></div>' +
      '<div class="field"><label for="f-desc">Scope / notes</label><textarea class="input" id="f-desc" placeholder="What is being reviewed, which documents, anything reviewers should know">' + esc(m.description) + '</textarea></div>' +
      '<div class="field"><span class="field-label">Checklists</span><div class="pick-grid" id="f-checklists">' + TEMPLATES.map(function (t) {
        var n = 0; t.sections.forEach(function (s) { n += s.items.length; });
        return '<button type="button" class="pick' + (m.checklists.indexOf(t.id) >= 0 ? ' on' : '') + '" data-pick="' + t.id + '"><b>' + esc(t.short) + '</b><span>' + n + ' checks</span></button>';
      }).join('') + '</div></div>' +
      '<div class="field"><span class="field-label">Board profile — select everything that applies</span><div class="pick-grid" id="f-profile">' + M.TAGS.map(function (t) {
        return '<button type="button" class="pick' + (m.profile.indexOf(t.id) >= 0 ? ' on' : '') + '" data-pick="' + t.id + '"><b>' + esc(t.label) + '</b><span>' + esc(t.desc) + '</span></button>';
      }).join('') + '</div><p class="note" id="f-count"></p></div>' +
      (!DEMO && contractors.length ? '<div class="field"><span class="field-label">Contractors on this project \u2014 FTEs always see it</span><div class="pick-grid" id="f-people">' + contractors.map(function (u) {
        return '<button type="button" class="pick' + (editing && (u.projects || []).indexOf(p.id) >= 0 ? ' on' : '') + '" data-pick="' + esc(u.login) + '"><b>' + esc(u.name || u.login) + '</b><span>@' + esc(u.login) + '</span></button>';
      }).join('') + '</div></div>' : '') +
      '</div><div class="sheet-foot">' +
      (editing ? '<button class="btn btn-danger" data-sheet="archive">' + (m.archived ? 'Unarchive' : 'Archive') + '</button><span class="spacer"></span>' : '') +
      '<button class="btn" data-sheet="cancel">Cancel</button><button class="btn btn-primary" data-sheet="ok">' + (editing ? 'Save' : 'Create review') + '</button></div>', { wide: true });

    function picked(id) { return Array.prototype.map.call(w.querySelectorAll('#' + id + ' .pick.on'), function (b) { return b.dataset.pick; }); }
    function updateCount() {
      var profile = picked('f-profile'), lists = picked('f-checklists'), total = 0, apply = 0;
      TEMPLATES.forEach(function (t) {
        if (lists.indexOf(t.id) < 0) return;
        t.sections.forEach(function (s) { s.items.forEach(function (it) { total++; if (M.applies(s.tags, profile) && M.applies(it.tags, profile)) apply++; }); });
      });
      w.querySelector('#f-count').textContent = apply + ' of ' + total + ' checks apply to this profile.';
    }
    updateCount();
    w.addEventListener('click', function (e) {
      var pk = e.target.closest('.pick');
      if (pk) { pk.classList.toggle('on'); updateCount(); return; }
      var b = e.target.closest('[data-sheet]');
      if (!b) return;
      if (b.dataset.sheet === 'cancel') return closeSheet();
      if (b.dataset.sheet === 'archive') { updateMeta({ archived: !m.archived }); closeSheet(); toast(m.archived ? 'Project restored' : 'Project archived'); return; }
      var name = w.querySelector('#f-name').value.trim();
      if (!name) { w.querySelector('#f-name').focus(); return; }
      var fields = {
        name: name, client: w.querySelector('#f-client').value.trim(), board: w.querySelector('#f-board').value.trim(),
        revision: w.querySelector('#f-rev').value.trim(), stage: w.querySelector('#f-stage').value,
        description: w.querySelector('#f-desc').value.trim(), profile: picked('f-profile'), checklists: picked('f-checklists')
      };
      if (!fields.checklists.length) { toast('Pick at least one checklist'); return; }
      var people = w.querySelector('#f-people') ? picked('f-people') : null;
      function assign(projectId) {
        if (!people) return;
        contractors.forEach(function (u) {
          var has = (u.projects || []).indexOf(projectId) >= 0, want = people.indexOf(u.login) >= 0;
          if (has === want) return;
          setPerson(u.login, { projects: want ? (u.projects || []).concat([projectId]) : u.projects.filter(function (x) { return x !== projectId; }) });
        });
      }
      if (editing) { assign(p.id); updateMeta(fields); closeSheet(); return; }
      var doc = M.newProject(fields, me(), TEMPLATES);
      var slug = doc.slug, n = 2;
      while (projects[slug]) slug = doc.slug + '-' + n++;
      doc.slug = slug;
      projects[slug] = doc;
      ui.slug = slug; ui.view = 'overview'; ui.page = '';
      assign(doc.id);
      touch(doc); saveUi(); closeSheet(); render();
      toast('Review created');
    });
  }

  function settingsSheet() {
    var token = getToken();
    var remembered = false;
    try { remembered = !!localStorage.getItem(TOKEN_KEY); } catch (e) { /* ignore */ }
    var w = sheet('<div class="sheet-head"><h2>Settings</h2><p>Your name goes on comments and changes. Git sync keeps reviews in a GitHub repository so the whole team sees the same thing.</p></div>' +
      '<div class="sheet-body">' +
      '<div class="field"><label for="s-user">Your name</label><input class="input" id="s-user" value="' + esc(settings.user) + '" placeholder="First Last"></div>' +
      '<div class="field"><span class="field-label">Appearance</span><div class="seg full" id="s-theme">' + [['auto', 'Automatic'], ['light', 'Light'], ['dark', 'Dark']].map(function (t) {
        return '<button type="button" class="' + (settings.theme === t[0] ? 'on' : '') + '" data-theme="' + t[0] + '">' + t[1] + '</button>';
      }).join('') + '</div></div>' +
      (DEMO ? '<p class="note">Git sync is off in demo mode. <a href="' + esc(location.pathname) + '">Open the full tool</a>.</p>' :
        '<div class="field-label" style="margin-top:20px;font-size:13px;color:var(--text);font-weight:600">GitHub sync</div>' +
        '<div class="row2"><div class="field"><label for="s-owner">Owner</label><input class="input" id="s-owner" value="' + esc(settings.owner) + '"></div>' +
        '<div class="field"><label for="s-repo">Repository</label><input class="input" id="s-repo" value="' + esc(settings.repo) + '"></div></div>' +
        '<div class="row2"><div class="field"><label for="s-branch">Branch</label><input class="input" id="s-branch" value="' + esc(settings.branch) + '"></div>' +
        '<div class="field"><label for="s-path">Data folder</label><input class="input" id="s-path" value="' + esc(settings.dataPath) + '"></div></div>' +
        (settings.login ? '<p class="note" style="margin:0 0 12px">Signed in to GitHub as <b>' + esc(settings.login) + '</b> \u00b7 ' +
          { fte: 'FTE: sees every project', contractor: 'Contractor: sees assigned projects', none: 'Not on a project yet' }[myRole()] + '</p>' : '') +
        '<details class="guide"' + (getToken() ? '' : ' open') + '><summary>New to GitHub? Set up in four steps</summary><ol>' +
        '<li>Create a free account at <a href="https://github.com/signup" target="_blank" rel="noopener">github.com/signup</a>.</li>' +
        '<li>Send your username to your Dovetail contact and accept the invitation email from GitHub.</li>' +
        '<li><a href="https://github.com/settings/tokens/new?scopes=repo&amp;description=Dovetail%20Signoff" target="_blank" rel="noopener">Create a token</a> (the link fills in the settings; pick an expiry and click <i>Generate token</i>).</li>' +
        '<li>Paste the token below and click <b>Save &amp; sync</b>.</li></ol></details>' +
        '<div class="field"><label for="s-token">Access token</label><input class="input" id="s-token" type="password" value="' + esc(token) + '" placeholder="github_pat_…" autocomplete="off">' +
        '<p class="note">The repo owner can use a fine-grained token with <b>Contents: read and write</b> on this repository. Collaborators need a classic token with the <b>repo</b> scope (fine-grained tokens can’t target someone else’s personal repo). The token is sent only to api.github.com and kept in this browser.</p></div>' +
        '<label class="check"><input type="checkbox" id="s-remember"' + (remembered ? ' checked' : '') + '> Remember the token after closing the browser (avoid on shared computers)</label>' +
        '<div class="log" id="s-log" hidden></div>') +
      '</div><div class="sheet-foot">' + (DEMO ? '' : '<button class="btn" data-sheet="test">Test connection</button>') + '<span class="spacer"></span>' +
      '<button class="btn" data-sheet="cancel">Cancel</button><button class="btn btn-primary" data-sheet="ok">' + (DEMO ? 'Done' : 'Save & sync') + '</button></div>');

    var theme = settings.theme;
    function read() {
      var s = Object.assign({}, settings, { user: w.querySelector('#s-user').value.trim(), theme: theme });
      if (!DEMO) {
        s.owner = w.querySelector('#s-owner').value.trim(); s.repo = w.querySelector('#s-repo').value.trim();
        s.branch = w.querySelector('#s-branch').value.trim() || 'main'; s.dataPath = w.querySelector('#s-path').value.trim().replace(/^\/+|\/+$/g, '');
      }
      return s;
    }
    function log(text, cls) { var l = w.querySelector('#s-log'); l.hidden = false; l.innerHTML += '<div class="' + (cls || '') + '">' + esc(text) + '</div>'; l.scrollTop = 1e6; }
    w.addEventListener('click', function (e) {
      var t = e.target.closest('[data-theme]');
      if (t) { theme = t.dataset.theme; w.querySelectorAll('#s-theme button').forEach(function (b) { b.classList.toggle('on', b === t); }); applyTheme(theme); return; }
      var b = e.target.closest('[data-sheet]');
      if (!b) return;
      if (b.dataset.sheet === 'cancel') { applyTheme(settings.theme); return closeSheet(); }
      var s = read();
      var tok = DEMO ? '' : w.querySelector('#s-token').value.trim();
      if (b.dataset.sheet === 'test') {
        var store = new S.GitHubStore(Object.assign({}, s, { token: tok }));
        log('Checking ' + s.owner + '/' + s.repo + '@' + s.branch + '…');
        store.user().then(function (u) { log('Signed in as ' + u.login, 'ok'); if (!w.querySelector('#s-user').value.trim()) w.querySelector('#s-user').value = u.name || u.login; return store.snapshot(); })
          .then(function (snap) {
            var dir = store.projectsDir();
            var n = snap.entries.filter(function (x) { return x.path.indexOf(dir) === 0 && /\.json$/.test(x.path); }).length;
            log('Repository OK — ' + plural(n, 'project') + ' in ' + dir, 'ok');
          })
          .catch(function (err) { log(err.message, 'err'); });
        return;
      }
      if (!s.user) { w.querySelector('#s-user').focus(); toast('Add your name so others know who commented'); return; }
      if (!DEMO) {
        // A different token may be a different person: learn the login again on the next sync.
        if (tok !== getToken() || s.owner !== settings.owner || s.repo !== settings.repo) { s.login = ''; access.loaded = false; }
        setToken(tok, w.querySelector('#s-remember').checked);
      }
      settings = s; save('settings', settings);
      closeSheet(); render();
      if (!DEMO && tok) sync();
    });
  }

  // ── People & access (FTEs only) ──────────────────────────
  var access = { loaded: false, loading: false, collaborators: null, invited: null, error: '' };

  function loadAccess(force) {
    if (DEMO || !getToken() || access.loading || (access.loaded && !force)) return;
    access.loading = true;
    var store = new S.GitHubStore(Object.assign({}, settings, { token: getToken() }));
    Promise.all([store.collaborators(), store.invitations().catch(function () { return null; })])
      .then(function (r) { access.collaborators = r[0]; access.invited = r[1]; access.error = ''; })
      .catch(function (err) { access.collaborators = null; access.error = err.status === 403 ? 'Your token can’t read the repo’s collaborators (it needs Administration access).' : err.message; })
      .then(function () { access.loading = false; access.loaded = true; if (ui.page === 'people') renderPage(); });
  }

  function accessBadge(login) {
    if (!access.collaborators) return '';
    if (settings.owner && login === settings.owner.toLowerCase()) return '<span class="res fixed">Owner</span>';
    if (access.collaborators.indexOf(login) >= 0) return '<span class="res fixed">Has repo access</span>';
    if (access.invited && access.invited.indexOf(login) >= 0) return '<span class="res waived">Invite pending</span>';
    return '<span class="res open">No repo access</span> <button class="btn btn-plain" style="padding:2px 8px;font-size:12px" data-act="invite" data-login="' + esc(login) + '">Invite</button>';
  }

  function peoplePage() {
    loadAccess(false);
    var people = M.liveUsers(roster);
    var byId = {};
    Object.keys(projects).forEach(function (k) { byId[projects[k].id] = projects[k]; });
    var html = '<div class="page"><div class="cl-head"><div><div class="eyebrow">' + esc(settings.owner + '/' + settings.repo) + '</div><h1 class="page-title">People &amp; access</h1>' +
      '<div class="page-sub"><span>FTEs see every project. Contractors see only the projects they’re added to.</span></div></div>' +
      '<button class="btn btn-primary" data-act="add-person">Add person</button></div>';
    if (!people.length) {
      html += '<div class="card" style="padding:18px 20px;margin-bottom:14px"><b>No one is listed yet.</b> Until someone is, everyone who can sync is treated as an FTE. ' +
        'Add yourself and the other FTEs first, then contractors.' +
        (settings.login ? ' <button class="btn btn-plain" data-act="add-self">Add me (' + esc(settings.login) + ') as FTE</button>' : '') + '</div>';
    }
    if (people.length) {
      html += '<div class="card" style="overflow:hidden"><table class="table people"><thead><tr><th>Person</th><th>Role</th><th>Projects</th><th>GitHub</th><th></th></tr></thead><tbody>' +
        people.map(function (u) {
          var projs = u.role === 'fte' ? '<span class="muted">All projects</span>' :
            ((u.projects || []).map(function (id) { return byId[id] ? '<span class="chip">' + esc(byId[id].meta.name) + '</span>' : ''; }).join(' ') || '<span class="muted">None yet</span>') +
            ' <button class="btn btn-plain" style="padding:2px 8px;font-size:12px" data-act="person-projects" data-login="' + esc(u.login) + '">Edit</button>';
          return '<tr><td><div style="display:flex;gap:10px;align-items:center">' + avatar(u.name || u.login) + '<div><div>' + esc(u.name || u.login) + (u.login === settings.login ? ' <span class="muted">(you)</span>' : '') + '</div><div class="muted">@' + esc(u.login) + '</div></div></div></td>' +
            '<td><div class="seg">' + [['fte', 'FTE'], ['contractor', 'Contractor']].map(function (r) {
              return '<button class="' + (u.role === r[0] ? 'on' : '') + '" data-act="person-role" data-login="' + esc(u.login) + '" data-role="' + r[0] + '">' + r[1] + '</button>';
            }).join('') + '</div></td>' +
            '<td style="max-width:320px">' + projs + '</td>' +
            '<td>' + (access.loading ? '<span class="muted">Checking…</span>' : accessBadge(u.login)) + '</td>' +
            '<td><button class="cmt-del" style="opacity:1" data-act="remove-person" data-login="' + esc(u.login) + '">Remove</button></td></tr>';
        }).join('') + '</tbody></table></div>';
    }
    html += '<p class="note" style="margin-top:14px">' + (access.error ? esc(access.error) + ' ' : '') +
      'This list decides what Signoff shows and downloads for each person. GitHub itself grants access to the whole repository, so a contractor who browses the repo on github.com can still open other projects there. ' +
      'On a personal account only the owner can invite people; once the repo moves to the company organization, any FTE admin can.</p></div>';
    return html;
  }

  function personSheet(login) {
    var u = login ? roster.users[login] : null;
    var list = visibleProjects().filter(function (p) { return !p.meta.archived; }).sort(function (a, b) { return a.meta.name.localeCompare(b.meta.name); });
    var role = u ? u.role : 'contractor';
    var picked = u ? (u.projects || []).slice() : [];
    var w = sheet('<div class="sheet-head"><h2>' + (u ? esc(u.name || u.login) : 'Add person') + '</h2><p>' + (u ? 'Choose the projects this contractor can see.' : 'They’ll need a free GitHub account. Use their GitHub username here.') + '</p></div>' +
      '<div class="sheet-body">' +
      (u ? '' : '<div class="row2"><div class="field"><label for="p-name">Name</label><input class="input" id="p-name" placeholder="First Last"></div>' +
        '<div class="field"><label for="p-login">GitHub username</label><input class="input" id="p-login" placeholder="username" autocomplete="off"></div></div>' +
        '<div class="field"><span class="field-label">Role</span><div class="seg full" id="p-role"><button type="button" data-role="fte">FTE — sees everything</button><button type="button" class="on" data-role="contractor">Contractor — chosen projects</button></div></div>') +
      '<div class="field" id="p-projects-field"' + (role === 'fte' ? ' hidden' : '') + '><span class="field-label">Projects</span><div class="pick-grid" id="p-projects">' +
      (list.length ? list.map(function (p) {
        return '<button type="button" class="pick' + (picked.indexOf(p.id) >= 0 ? ' on' : '') + '" data-pick="' + esc(p.id) + '"><b>' + esc(p.meta.name) + '</b><span>' + esc([p.meta.client, p.meta.board].filter(Boolean).join(' · ') || p.meta.stage) + '</span></button>';
      }).join('') : '<p class="note">No projects yet.</p>') + '</div></div>' +
      '</div><div class="sheet-foot"><span class="spacer"></span><button class="btn" data-sheet="cancel">Cancel</button><button class="btn btn-primary" data-sheet="ok">' + (u ? 'Save' : 'Add') + '</button></div>');
    w.addEventListener('click', function (e) {
      var rb = e.target.closest('[data-role]');
      if (rb) {
        role = rb.dataset.role;
        w.querySelectorAll('#p-role button').forEach(function (b) { b.classList.toggle('on', b === rb); });
        w.querySelector('#p-projects-field').hidden = role === 'fte';
        return;
      }
      var pk = e.target.closest('.pick');
      if (pk) { pk.classList.toggle('on'); return; }
      var b = e.target.closest('[data-sheet]');
      if (!b) return;
      if (b.dataset.sheet === 'cancel') return closeSheet();
      var chosen = Array.prototype.map.call(w.querySelectorAll('#p-projects .pick.on'), function (x) { return x.dataset.pick; });
      if (u) { setPerson(login, { projects: chosen }); closeSheet(); renderPage(); return; }
      var l = w.querySelector('#p-login').value.trim().replace(/^@/, '').toLowerCase();
      if (!/^[a-z0-9](?:[a-z0-9-]{0,38})$/.test(l)) { w.querySelector('#p-login').focus(); toast('Enter their GitHub username'); return; }
      setPerson(l, { name: w.querySelector('#p-name').value.trim() || l, role: role, projects: role === 'fte' ? [] : chosen, deleted: false });
      closeSheet(); renderPage();
      toast('Added. Sync to share the change' + (access.collaborators && access.collaborators.indexOf(l) < 0 ? ', and invite them to the repo' : ''));
    });
  }

  function inviteAccess(login) {
    if (!confirm('Send ' + login + ' a GitHub invitation to ' + settings.owner + '/' + settings.repo + '?\n\nOn a personal repository every collaborator can push to it.')) return;
    var store = new S.GitHubStore(Object.assign({}, settings, { token: getToken() }));
    store.invite(login).then(function () { toast('Invitation sent to ' + login); loadAccess(true); })
      .catch(function (err) {
        toast(err.status === 403 || err.status === 404 ? 'Only the repo owner (or an org admin) can invite — or the token needs Administration: write' : 'Invite failed: ' + err.message);
      });
  }

  // ── Sync ─────────────────────────────────────────────────
  var syncing = false, lastError = '';
  function sync() {
    if (DEMO) { toast('Demo mode keeps everything in this browser'); return; }
    if (syncing) return;
    if (!getToken() || !settings.owner || !settings.repo) { settingsSheet(); return; }
    if (!settings.user) { settingsSheet(); return; }
    syncing = true; renderSyncState('busy');
    var started = Object.assign({}, dirty);
    var store = new S.GitHubStore(Object.assign({}, settings, { token: getToken() }));
    var byId = {};
    Object.keys(projects).forEach(function (k) { byId[projects[k].id] = projects[k]; });
    var names = Object.keys(dirty).map(function (k) { return k === 'roster' ? 'people' : byId[k] ? byId[k].meta.name : k; });
    var message = names.length ? 'Review update: ' + names.join(', ') + ' (' + me() + ')' : 'Review update (' + me() + ')';
    var currentId = projects[ui.slug] && projects[ui.slug].id;
    // Who is syncing decides what is downloaded, so learn the GitHub login first.
    (settings.login ? Promise.resolve() : store.user().then(function (u) {
      settings.login = u.login.toLowerCase();
      if (!settings.user) settings.user = u.name || u.login;
      save('settings', settings);
    })).then(function () {
      return store.sync(byId, roster, cache, {
        message: message,
        canSee: function (id, r) { return M.canSee(id, settings.login, r, settings.owner); },
        onRetry: function () { toast('Someone else just synced \u2014 merging their changes'); }
      });
    })
      .then(function (res) {
        // Edits made while the sync ran are merged on top, and stay unsynced.
        var mergedById = {};
        Object.keys(projects).forEach(function (k) { byId[projects[k].id] = projects[k]; });
        Object.keys(res.projects).forEach(function (id) {
          mergedById[id] = byId[id] ? M.mergeProjects(byId[id], res.projects[id]) : res.projects[id];
        });
        // Slugs are only local handles for the sidebar; two projects with one name get a suffix.
        var next = {};
        Object.keys(mergedById).forEach(function (id) {
          var doc = mergedById[id], slug = doc.slug || M.slugify(doc.meta.name), n = 2;
          while (next[slug]) slug = (doc.slug || M.slugify(doc.meta.name)) + '-' + n++;
          next[slug] = doc;
        });
        projects = next;
        roster = M.mergeRosters(roster, res.roster);
        (res.removed || []).forEach(function (id) { delete dirty[id]; });
        Object.keys(started).forEach(function (k) { if (dirty[k] === started[k]) delete dirty[k]; });
        ui.slug = Object.keys(projects).filter(function (k) { return projects[k].id === currentId; })[0] || '';
        cache = res.cache;
        if (res.templates && res.templates.length) { pulledTemplates = res.templates; save('templates', pulledTemplates); refreshTemplates(); }
        lastSync = { at: M.now(), version: res.version };
        save('cache', cache); save('lastSync', lastSync); persist();
        lastError = '';
        syncing = false;
        render();
        toast(res.pushed ? 'Synced \u2014 ' + plural(res.pushed, 'file') + ' pushed' : 'Up to date');
      })
      .catch(function (err) {
        syncing = false; lastError = err.message;
        renderSyncState('error');
        toast('Sync failed: ' + err.message + (err.status === 403 || err.status === 404 ? ' — check the token’s access to ' + settings.repo : ''));
      });
  }

  // ── Report ───────────────────────────────────────────────
  function openReport() {
    var p = current(); if (!p) return;
    var st = M.projectStats(p, TEMPLATES);
    var f = allFindings(p);
    var reviewers = {};
    M.liveComments(p).forEach(function (c) { reviewers[c.author] = 1; });
    Object.keys(p.items).forEach(function (k) { if (p.items[k].updatedBy) reviewers[p.items[k].updatedBy] = 1; });
    var m = p.meta;
    var html = '<div class="report-bar"><b>Review report</b><div style="display:flex;gap:8px"><button class="btn" data-act="close-report">Close</button><button class="btn btn-primary" data-act="print">Print / Save PDF</button></div></div>' +
      '<div class="paper">' +
      '<div class="r-head"><div><div class="r-brand"><svg width="14" height="16" viewBox="0 0 16 18"><path d="M0 0h6v7.6L0 8.4zM0 9.6l6 .8V18H0z" fill="#004952"/><path d="M7 0l9 3v12l-9 3v-7.4l5-.9V8.3l-5-.9z" fill="#004952"/></svg>DOVETAIL · DESIGN REVIEW</div>' +
      '<h1 style="margin-top:14px">' + esc(m.name) + '</h1><div style="color:#515154">' + esc([m.client, m.board, m.revision && 'Rev ' + m.revision].filter(Boolean).join(' · ')) + '</div></div>' +
      '<div style="text-align:right"><div style="font:600 30px var(--display);color:#004952">' + st.pct + '%</div><div style="color:#86868b;font-size:11px">reviewed</div></div></div>' +
      '<div class="r-meta"><div><span>Stage</span>' + esc(m.stage) + '</div><div><span>Date</span>' + fmtDate(M.now()) + '</div><div><span>Open issues</span>' + st.issuesOpen + '</div><div><span>Reviewers</span>' + (Object.keys(reviewers).map(esc).join(', ') || '—') + '</div></div>' +
      (m.description ? '<p style="color:#515154">' + esc(m.description) + '</p>' : '') +
      '<h2>Summary</h2><table><thead><tr><th>Checklist</th><th class="num">Checks</th><th class="num">Pass</th><th class="num">Issues</th><th class="num">N/A</th><th class="num">To review</th><th class="num">Reviewed</th></tr></thead><tbody>' +
      projectTemplates(p).map(function (t) {
        var c = st.per[t.id];
        return '<tr><td>' + esc(t.title) + '</td><td class="num">' + c.total + '</td><td class="num">' + c.pass + '</td><td class="num">' + c.issue + '</td><td class="num">' + c.na + '</td><td class="num">' + c.open + '</td><td class="num">' + c.pct + '%</td></tr>';
      }).join('') +
      '<tr><td><b>Total</b></td><td class="num"><b>' + st.total + '</b></td><td class="num"><b>' + st.pass + '</b></td><td class="num"><b>' + st.issue + '</b></td><td class="num"><b>' + st.na + '</b></td><td class="num"><b>' + st.open + '</b></td><td class="num"><b>' + st.pct + '%</b></td></tr></tbody></table>' +
      (st.outside ? '<p class="r-cmt">' + plural(st.outside, 'further check') + ' did not apply to this board’s profile (' + esc((m.profile || []).join(', ') || 'general board') + ') and ' + (st.outside === 1 ? 'is' : 'are') + ' not counted.</p>' : '') +
      '<h2>Findings</h2>' + (f.length ? '<table><thead><tr><th>#</th><th>Severity</th><th>Finding</th><th>Owner</th><th>Status</th></tr></thead><tbody>' +
        f.map(function (x, i) {
          var r = x.row, res = r.state.resolution;
          var cm = M.liveComments(p, r.id);
          return '<tr><td>' + (i + 1) + '</td><td><span class="sev ' + r.severity + '">' + r.severity[0].toUpperCase() + r.severity.slice(1) + '</span></td><td><b style="font-weight:500">' + esc(r.def.text) + '</b><div class="r-cmt">' + esc(x.template.short + ' › ' + x.section.title) + (r.state.ref ? ' · ' + esc(r.state.ref) : '') + '</div>' +
            cm.map(function (c) { return '<div class="r-cmt">' + esc(c.author) + ' (' + fmtDate(c.at) + '): ' + esc(c.text) + '</div>'; }).join('') + '</td>' +
            '<td>' + esc(r.state.assignee || '—') + '</td><td>' + (res === 'fixed' ? 'Fixed' : res === 'waived' ? 'Waived' : 'Open') + '</td></tr>';
        }).join('') + '</tbody></table>' : '<p>No issues were raised.</p>') +
      '<div class="sign"><div>Reviewed by</div><div>Approved by</div></div>' +
      '<div class="r-foot"><span>Generated by Signoff ' + esc((window.SIGNOFF_VERSION || {}).hash || '') + '</span><span>' + esc(m.name) + '</span></div></div>';
    var r = $('#report'); r.innerHTML = html; r.hidden = false;
  }

  function exportCsv() {
    var p = current(); if (!p) return;
    var rows = [['Severity', 'Checklist', 'Section', 'Check', 'Reference', 'Owner', 'Status', 'Comments']];
    allFindings(p).forEach(function (x) {
      var r = x.row;
      rows.push([r.severity, x.template.title, x.section.title, r.def.text, r.state.ref || '', r.state.assignee || '',
        r.state.resolution || 'open', M.liveComments(p, r.id).map(function (c) { return c.author + ': ' + c.text; }).join(' | ')]);
    });
    download(p.slug + '-findings.csv', rows.map(function (r) { return r.map(function (v) { return '"' + String(v).replace(/"/g, '""') + '"'; }).join(','); }).join('\r\n'), 'text/csv');
  }
  function download(name, text, type) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: type || 'application/json' }));
    a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  function importFile(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var data;
      try { data = JSON.parse(reader.result); } catch (e) { toast('That file isn’t JSON'); return; }
      var doc;
      if (M.isLegacy(data)) doc = M.importLegacy(data, me(), TEMPLATES);
      else if (data && data.meta && data.items) doc = data;
      else { toast('Not a Signoff project or old checklist export'); return; }
      var slug = doc.slug || M.slugify(doc.meta.name);
      if (projects[slug] && projects[slug].id !== doc.id) { var n = 2; while (projects[slug + '-' + n]) n++; slug = slug + '-' + n; }
      doc.slug = slug;
      projects[slug] = M.mergeProjects(projects[slug], doc);
      ui.slug = slug; ui.view = 'overview';
      touch(projects[slug]); saveUi(); render();
      toast(M.isLegacy(data) ? 'Imported from the old checklist' : 'Project imported');
    };
    reader.readAsText(file);
  }

  // ── Menus & toasts ───────────────────────────────────────
  function menu(anchor, entries) {
    closeMenu();
    var m = document.createElement('div');
    m.className = 'menu'; m.id = 'menu';
    m.innerHTML = entries.map(function (e) { return e === '-' ? '<hr>' : '<button data-menu="' + e[0] + '"' + (e[2] ? ' class="danger"' : '') + '>' + esc(e[1]) + '</button>'; }).join('');
    document.body.appendChild(m);
    var r = anchor.getBoundingClientRect();
    m.style.top = (r.bottom + 6) + 'px';
    m.style.left = Math.max(8, Math.min(window.innerWidth - m.offsetWidth - 8, r.right - m.offsetWidth)) + 'px';
    return new Promise(function (resolve) {
      m.addEventListener('click', function (e) { var b = e.target.closest('[data-menu]'); if (b) { closeMenu(); resolve(b.dataset.menu); } });
    });
  }
  function closeMenu() { var m = $('#menu'); if (m) m.remove(); }

  function toast(text) {
    var t = document.createElement('div');
    t.className = 'toast'; t.textContent = text;
    $('#toasts').appendChild(t);
    setTimeout(function () { t.style.transition = 'opacity .3s'; t.style.opacity = '0'; setTimeout(function () { t.remove(); }, 320); }, 3200);
  }

  var darkQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  function isDark(theme) { return theme === 'dark' || (theme !== 'light' && !!(darkQuery && darkQuery.matches)); }
  function applyTheme(theme) {
    if (theme === 'light' || theme === 'dark') document.documentElement.setAttribute('data-theme', theme);
    else document.documentElement.removeAttribute('data-theme');
    var btn = $('#theme-btn');
    if (btn) {
      var dark = isDark(theme);
      btn.innerHTML = dark ? ICON.sun : ICON.moon;
      btn.title = dark ? 'Light mode' : 'Dark mode';
    }
  }
  // The sidebar button flips whatever is showing now; Settings can set it back to Automatic.
  function toggleTheme() {
    settings.theme = isDark(settings.theme) ? 'light' : 'dark';
    save('settings', settings);
    applyTheme(settings.theme);
  }
  if (darkQuery && darkQuery.addEventListener) darkQuery.addEventListener('change', function () { applyTheme(settings.theme); });

  // ── Events ───────────────────────────────────────────────
  function visibleItemIds() {
    return Array.prototype.map.call(document.querySelectorAll('#page .item'), function (el) { return el.dataset.id; });
  }

  document.addEventListener('click', function (e) {
    if (!e.target.closest('#menu')) closeMenu();
    var el = e.target.closest('[data-act]');
    if (!el) return;
    var act = el.dataset.act, id = el.dataset.id;
    switch (act) {
      case 'new-project': if (isFte()) projectSheet(null); break;
      case 'people': ui.page = 'people'; selected = null; closeInspector(); renderSidebar(); renderPage(); $('#app').classList.remove('nav-open'); break;
      case 'edit-project': projectSheet(current()); break;
      case 'open-project':
        ui.slug = el.dataset.slug; ui.view = 'overview'; ui.page = ''; ui.query = ''; ui.filter = 'all'; selected = null;
        closeInspector(); saveUi(); render(); $('#app').classList.remove('nav-open'); $('#main').scrollTop = 0; break;
      case 'toggle-archived': ui.showArchived = !ui.showArchived; saveUi(); renderSidebar(); break;
      case 'view':
        ui.view = el.dataset.view; ui.query = ''; selected = null; closeInspector(); saveUi(); renderPage(); $('#main').scrollTop = 0; break;
      case 'filter': ui.filter = el.dataset.filter; saveUi(); renderPage(); break;
      case 'toggle-sec':
        if (e.target.closest('[data-act="sec-na"]')) return;
        collapsed[el.dataset.sec] = !collapsed[el.dataset.sec]; save('collapsed', collapsed);
        el.closest('.sec').classList.toggle('collapsed'); break;
      case 'collapse-all': {
        var secs = Array.prototype.map.call(document.querySelectorAll('.sec[data-sec]'), function (s) { return s.dataset.sec; });
        var all = secs.every(function (s) { return collapsed[s]; });
        secs.forEach(function (s) { collapsed[s] = !all; }); save('collapsed', collapsed); renderPage(); break;
      }
      case 'sec-na': e.stopPropagation(); toggleSectionNA(el.dataset.sec); break;
      case 'show-hidden': showHidden[el.dataset.sec] = !showHidden[el.dataset.sec]; renderPage(); break;
      case 'select':
        if (e.target.closest('button')) return;
        select(id, true); break;
      case 'cycle': {
        e.stopPropagation();
        var p = current(), cur = (p.items[id] || {}).status || 'open';
        setStatus(id, cur === 'open' ? 'pass' : 'open');
        select(id, false); break;
      }
      case 'set': e.stopPropagation(); setStatus(id, el.dataset.status); select(id, el.closest('.inspector') ? true : false); break;
      case 'item-field': { var f = {}; f[el.dataset.key] = el.dataset.val; setItem(selected, f); break; }
      case 'close-insp': closeInspector(); break;
      case 'post-comment': { var ta = $('#comment-input'); addComment(selected, ta.value); var t2 = $('#comment-input'); if (t2) { t2.value = ''; t2.focus(); } break; }
      case 'del-comment': if (confirm('Delete this comment?')) deleteComment(id); break;
      case 'delete-custom':
        if (confirm('Delete this project check?')) { var pp = current(); pp.custom[id] = M.stamp(Object.assign({}, pp.custom[id], { deleted: true }), me()); touch(pp); closeInspector(); renderPage(); }
        break;
      case 'goto-item': {
        if (!id) break;
        var d = itemDef(current(), id);
        if (d.template) { ui.view = d.template.id; ui.filter = 'all'; ui.query = ''; collapsed[(d.section || {}).id] = false; showHidden[(d.section || {}).id] = true; saveUi(); renderPage(); }
        select(id, true); break;
      }
      case 'sync': if (!DEMO && lastError && el.id === 'sync-pill' && !syncing) toast(lastError); sync(); break;
      case 'settings': settingsSheet(); break;
      case 'theme': toggleTheme(); break;
      case 'add-person': personSheet(null); break;
      case 'add-self': setPerson(settings.login, { name: settings.user || settings.login, role: 'fte', projects: [], deleted: false }); renderPage(); break;
      case 'person-projects': personSheet(el.dataset.login); break;
      case 'person-role':
        if (el.dataset.login === settings.login && el.dataset.role !== 'fte' && !confirm('Make yourself a contractor? You would stop seeing most projects.')) break;
        setPerson(el.dataset.login, { role: el.dataset.role }); renderPage(); break;
      case 'remove-person':
        if (confirm('Remove ' + el.dataset.login + ' from People? This doesn\u2019t remove their GitHub access to the repo.')) { setPerson(el.dataset.login, { deleted: true }); renderPage(); }
        break;
      case 'invite': inviteAccess(el.dataset.login); break;
      case 'report': openReport(); break;
      case 'close-report': $('#report').hidden = true; break;
      case 'print': window.print(); break;
      case 'export-csv': exportCsv(); break;
      case 'nav': $('#app').classList.toggle('nav-open'); break;
      case 'project-menu':
        menu(el, (isFte() ? [['edit', 'Project details\u2026']] : []).concat([['report', 'Review report'], ['csv', 'Export findings (CSV)'], ['json', 'Export project (JSON)']],
          isFte() ? ['-', ['import', 'Import project or old checklist\u2026'], '-', ['archive', current().meta.archived ? 'Unarchive project' : 'Archive project', true]] : []))
          .then(function (choice) {
            if (choice === 'edit') projectSheet(current());
            else if (choice === 'report') openReport();
            else if (choice === 'csv') exportCsv();
            else if (choice === 'json') download(current().slug + '.json', M.stableStringify(current()));
            else if (choice === 'import') $('#import-file').click();
            else if (choice === 'archive') { updateMeta({ archived: !current().meta.archived }); }
          });
        break;
    }
  });

  document.addEventListener('keydown', function (e) {
    var inField = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName) || document.activeElement.isContentEditable;
    if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); sync(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && document.activeElement.id === 'comment-input') { e.preventDefault(); $('[data-act="post-comment"]').click(); return; }
    if (e.key === 'Escape') {
      if ($('#sheet')) { closeSheet(); applyTheme(settings.theme); return; }
      if (!$('#report').hidden) { $('#report').hidden = true; return; }
      if (inField) { document.activeElement.blur(); return; }
      if ($('#inspector').classList.contains('open')) { closeInspector(); return; }
    }
    if (inField || e.ctrlKey || e.metaKey || e.altKey || $('#sheet')) return;
    var ids = visibleItemIds();
    var i = ids.indexOf(selected);
    if (e.key === 'j' || e.key === 'ArrowDown') { if (ids.length) { e.preventDefault(); select(ids[Math.min(ids.length - 1, i + 1)], false); } }
    else if (e.key === 'k' || e.key === 'ArrowUp') { if (ids.length) { e.preventDefault(); select(ids[Math.max(0, i - 1)], false); } }
    else if (e.key === 'Enter' && selected) { select(selected, true); }
    else if (selected && ids.indexOf(selected) >= 0 && 'pino'.indexOf(e.key) >= 0) {
      setStatus(selected, { p: 'pass', i: 'issue', n: 'na', o: 'open' }[e.key]);
      // Passing or N/A moves on to the next check; an issue opens the detail to describe it.
      if (e.key === 'i') select(selected, true);
      else if (e.key !== 'o') { var nx = visibleItemIds(); select(nx[Math.min(nx.length - 1, nx.indexOf(selected) + 1)], false); }
      else select(selected, false);
    }
    else if (e.key === 'c' && selected) { select(selected, true); setTimeout(function () { var t = $('#comment-input'); if (t) t.focus(); }, 50); e.preventDefault(); }
    else if (e.key === '/') { var s = $('#item-search') || $('#project-search'); if (s) { e.preventDefault(); s.focus(); } }
    else if (e.key === 'N' && isFte()) { projectSheet(null); }
  });

  document.addEventListener('input', function (e) {
    if (e.target.id === 'project-search') renderSidebar();
    if (e.target.id === 'item-search') {
      ui.query = e.target.value;
      var pos = e.target.selectionStart;
      renderPage();
      var s = $('#item-search'); s.focus(); s.setSelectionRange(pos, pos);
    }
  });
  document.addEventListener('change', function (e) {
    var k = e.target.dataset && e.target.dataset.itemInput;
    if (k && selected) { var f = {}; f[k] = e.target.value.trim(); setItem(selected, f); }
    if (e.target.id === 'import-file' && e.target.files[0]) { importFile(e.target.files[0]); e.target.value = ''; }
  });
  document.addEventListener('keydown', function (e) {
    if (e.target.dataset && e.target.dataset.add && e.key === 'Enter') {
      var parts = e.target.dataset.add.split('|');
      var id = addCustom(parts[0], parts[1], e.target.value);
      if (id) { toast('Check added to this project'); var inp = document.querySelector('[data-add="' + parts[0] + '|' + parts[1] + '"]'); if (inp) inp.focus(); }
    }
  });
  document.addEventListener('focusout', function (e) {
    var id = e.target.dataset && e.target.dataset.editCustom;
    if (!id) return;
    var p = current(), text = e.target.textContent.trim();
    if (p && p.custom[id] && text && text !== p.custom[id].text) {
      p.custom[id] = M.stamp(Object.assign({}, p.custom[id], { text: text }), me());
      touch(p); renderPage();
    }
  });
  $('#main').addEventListener('scroll', function () { $('#toolbar').classList.toggle('scrolled', $('#main').scrollTop > 60); }, { passive: true });

  // ── Boot ─────────────────────────────────────────────────
  function render() { renderSidebar(); renderSyncState(); renderPage(); renderInspector(); }

  applyTheme(settings.theme);
  if (DEMO) {
    var banner = $('#demo-banner');
    banner.hidden = false;
    document.body.classList.add('has-banner');
    banner.innerHTML = 'You’re exploring a demo of Signoff, Dovetail’s design review tool. Changes stay in this browser.<button data-act="reset-demo" id="reset-demo">Reset demo</button>';
    banner.querySelector('#reset-demo').addEventListener('click', function () {
      Object.keys(localStorage).forEach(function (k) { if (k.indexOf('signoff.demo.') === 0) localStorage.removeItem(k); });
      location.reload();
    });
  }
  if (!projects[ui.slug]) ui.slug = Object.keys(projects).filter(function (k) { return !projects[k].meta.archived; })[0] || '';
  render();
  if (!settings.user && !DEMO) settingsSheet();
  else if (!DEMO && getToken()) sync();
  setInterval(function () { renderSyncState(syncing ? 'busy' : undefined); }, 60000);

  S.app = { sync: sync, render: render };
})(window.Signoff = window.Signoff || {});
