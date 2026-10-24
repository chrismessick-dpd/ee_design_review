/* Sample projects for demo mode (index.html?demo). Built from whatever templates are
   loaded, so the demo always matches the current checklists. Nothing here is real. */
(function (S) {
  'use strict';

  // Deterministic pseudo-random numbers, so every visitor sees the same demo.
  function rng(seed) { return function () { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; }; }

  // Findings and comments are pinned to specific checks. Any whose check isn't in a
  // project's checklists, or is outside its profile, is skipped for that project.
  var FINDINGS = [
    { id: 'sp3', sev: 'major', who: 'A. Rivera', by: 'Sam Patel', ref: 'U4, U7', notes: [
      'U4 VDDA has only 100 nF. The datasheet asks for 1 µF + 100 nF per supply pin pair.',
      'Added C41 (1 µF 0402) next to pin 9. Will be in rev B.'], res: 'fixed' },
    { id: 'usb2', sev: 'critical', who: 'J. Chen', by: 'Morgan Lee', ref: 'J3 USB-C', notes: [
      'No ESD protection on the USB-C data lines. The connector is user-accessible.',
      'Suggest a low-capacitance TVS array (< 1 pF) close to J3.'], res: '' },
    { id: 'sd8', sev: 'major', who: 'A. Rivera', by: 'Sam Patel', ref: 'I2C1: R12, R13', notes: [
      'I2C1 pull-ups are 10 kΩ with ~180 pF of bus capacitance. Rise time is too slow for 400 kHz.',
      'Changed to 2.2 kΩ.'], res: 'fixed' },
    { id: 'pcb-hc-5', sev: 'major', who: 'J. Chen', by: 'Morgan Lee', ref: 'U2 buck', notes: [
      'U2 dissipates ~0.9 W at full load. Only 4 vias under the exposed pad.'], res: '' },
    { id: 'pt1', sev: 'minor', who: '', by: 'Sam Patel', ref: '', notes: [
      'No test points on 3V3_AUX or 1V8. Bring-up will be awkward.'], res: '' },
    { id: 'pm6', sev: 'minor', who: '', by: 'Morgan Lee', ref: 'Panel', notes: [
      'Only two board fiducials, and they are symmetric. The assembler asked for three, placed asymmetrically.'], res: 'waived' },
    { id: 'pt4', sev: 'minor', who: 'A. Rivera', by: 'Morgan Lee', ref: 'D3, D4', notes: [
      'Polarity marks for D3/D4 sit under the part bodies and won’t be visible after assembly.'], res: '' },
    { id: 'pcb-iso-1', sev: 'critical', who: 'J. Chen', by: 'Sam Patel', ref: 'K1 relay', notes: [
      'Clearance between the K1 contact and the SELV ground pour is under the requirement for reinforced insulation.',
      'Moved the pour back and added a slot. Please re-check.'], res: 'fixed' }
  ];

  var COMMENTS = [
    { id: 'sd3', by: 'Morgan Lee', text: 'Checked the supervisor threshold against the 3V3 rail tolerance. OK.' },
    { id: 'sc7', by: 'Sam Patel', text: 'Load caps recalculated with 3 pF stray: 12 pF is right.' },
    { id: 'sp8', by: 'Morgan Lee', text: 'Is the soft-start time OK with the 470 µF bulk on the 5 V rail? Can we confirm with a sim?' }
  ];

  function build(fields, templates, seed, passRatio, users) {
    var M = S.model, rand = rng(seed);
    var p = M.newProject(fields, users[0], templates);
    var day = 86400000, start = Date.now() - 12 * day;
    p.createdAt = new Date(start).toISOString();
    function at(frac) { return new Date(start + frac * 11 * day).toISOString(); }
    templates.forEach(function (t) {
      if (p.meta.checklists.indexOf(t.id) < 0) return;
      var ratio = passRatio[t.id] || 0;
      M.checklistRows(p, t).forEach(function (g) {
        g.rows.forEach(function (r) {
          if (r.hidden || rand() > ratio) return;
          var who = users[Math.floor(rand() * users.length)];
          p.items[r.id] = { status: rand() < 0.04 ? 'na' : 'pass', text: r.def.text, checklist: t.id, updatedAt: at(rand()), updatedBy: who };
        });
      });
    });
    function findRow(id) {
      var hit = null;
      templates.forEach(function (t) {
        if (hit || !passRatio[t.id] || p.meta.checklists.indexOf(t.id) < 0) return;
        M.checklistRows(p, t).forEach(function (g) {
          g.rows.forEach(function (r) { if (r.id === id && !r.hidden) hit = { r: r, t: t }; });
        });
      });
      return hit;
    }
    FINDINGS.forEach(function (f, i) {
      var h = findRow(f.id); if (!h) return;
      var t0 = 0.2 + 0.07 * i;
      p.items[h.r.id] = { status: 'issue', severity: f.sev, resolution: f.res, assignee: f.who, ref: f.ref, text: h.r.def.text, checklist: h.t.id, updatedAt: at(t0 + 0.2), updatedBy: f.by };
      f.notes.forEach(function (n, j) {
        var id = 'c' + seed + '-' + i + '-' + j, when = at(t0 + 0.1 * j);
        p.comments[id] = { id: id, item: h.r.id, author: j ? (f.who || users[1]) : f.by, at: when, text: n, updatedAt: when, updatedBy: f.by };
      });
    });
    COMMENTS.forEach(function (c, i) {
      var h = findRow(c.id); if (!h) return;
      var id = 'n' + seed + '-' + i, when = at(0.5 + 0.1 * i);
      p.comments[id] = { id: id, item: h.r.id, author: c.by, at: when, text: c.text, updatedAt: when, updatedBy: c.by };
    });
    p.meta.updatedAt = at(1);
    return p;
  }

  S.demo = {
    projects: function (templates) {
      return [
        build({ name: 'Smart Thermostat — Main PCBA', client: 'Acme Climate', board: 'DT-1042', revision: 'B', stage: 'Layout',
          description: 'Rev B layout review before release to fab. Wi-Fi module, mains-powered via an isolated AC/DC, relay outputs.',
          profile: ['mains', 'rf', 'regulatory', 'production'], checklists: ['schematic', 'interfaces', 'pcb', 'assembly', 'fab'] },
          templates, 7, { schematic: 0.95, interfaces: 0.9, pcb: 0.62, assembly: 0.3, fab: 0.1 }, ['Sam Patel', 'Morgan Lee']),
        build({ name: 'Handheld Scanner — Power Board', client: 'Northwind Instruments', board: 'DT-2210', revision: 'A', stage: 'Schematic',
          description: 'First schematic review. Li-ion pack, USB-C PD charging, 2 A motor driver for the scan head.',
          profile: ['battery', 'low-power', 'motor', 'high-current'], checklists: ['schematic', 'interfaces', 'pcb'] },
          templates, 11, { schematic: 0.45, interfaces: 0.3 }, ['Morgan Lee', 'Sam Patel'])
      ];
    }
  };
})(window.Signoff = window.Signoff || {});
