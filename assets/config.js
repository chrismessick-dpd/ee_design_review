/* Signoff EE: everything that differs between the Signoff tools (EE, ME). The shared engine
   (model.js, github.js, workspace.js, app.js, demo.js, styles.css and tools/*.py) reads this.
   Keep the part after "=" strict JSON: tools/build.py, validate_templates.py and package.py
   parse it too.

   storage.ns:     localStorage namespace for this tool. The GitHub token (signoff.token) and
                   the theme (signoff.v1.settings -> theme) are shared by every Signoff tool.
   repos:          defaults for Settings -> Repositories. prefix must not be a prefix of
                   another tool's (contractors find their repos by name prefix).
   repos.suite:    other repositories every FTE is invited to, next to this tool's own:
                   the other discipline's tool and data repos, and the hub.
   ids:            prefixes for new project, comment and custom-check IDs.
   templatePrefixes: checklist id -> required prefix of its section and item IDs. */
window.SIGNOFF_CONFIG = {
  "product": "Signoff EE",
  "discipline": "EE",
  "tagline": "Electrical design review",
  "storage": { "ns": "signoff.v1.", "demoNs": "signoff.demo." },
  "repos": {
    "owner": "chrismessick-dpd",
    "toolRepo": "ee_design_review",
    "dataRepo": "ee_design_review_data",
    "prefix": "review-ee-",
    "suite": ["me_design_review", "me_design_review_data", "signoff", "pcb_dfm"]
  },
  "ids": { "project": "p", "comment": "c", "custom": "x" },
  "templateOrder": ["schematic", "interfaces", "pcb", "assembly", "fab", "bringup"],
  "templatePrefixes": {},
  "defaultChecklists": ["schematic", "interfaces", "pcb", "assembly", "fab"],
  "stages": ["Concept", "Schematic", "Layout", "Pre-fab", "Bring-up", "Released"],
  "defaultStage": "Schematic",
  "legacyTabs": ["schematic", "interfaces", "pcb", "assembly", "fab"],
  "words": {
    "thing": "board",
    "general": "General board",
    "profile": "Board profile",
    "number": "Board / PCBA number",
    "numberPlaceholder": "e.g. PCB-1042",
    "namePlaceholder": "e.g. Sensor hub main board"
  },
  "tags": [
    { "id": "battery", "label": "Battery", "desc": "Runs from or charges a battery" },
    { "id": "low-power", "label": "Low power", "desc": "Sleep / ultra-low-power budget" },
    { "id": "mains", "label": "Mains / HV", "desc": "AC mains or > 60 V DC, isolation" },
    { "id": "high-current", "label": "High current", "desc": "More than ~5 A, power stages" },
    { "id": "motor", "label": "Motors", "desc": "Motors, solenoids, inductive loads" },
    { "id": "rf", "label": "RF / Wireless", "desc": "Radio, antenna or RF front end" },
    { "id": "high-speed", "label": "High-speed", "desc": "Multi-Gb/s links, controlled impedance" },
    { "id": "ddr", "label": "DDR memory", "desc": "External DRAM" },
    { "id": "fpga", "label": "FPGA / SoC", "desc": "FPGA or application processor" },
    { "id": "bga", "label": "BGA", "desc": "BGA or fine-pitch area arrays" },
    { "id": "hdi", "label": "HDI", "desc": "Microvias, via-in-pad" },
    { "id": "flex", "label": "Flex / rigid-flex", "desc": "Flex or rigid-flex construction" },
    { "id": "precision-analog", "label": "Precision analog", "desc": "Low-noise measurement, sensors" },
    { "id": "audio", "label": "Audio", "desc": "Audio inputs or outputs" },
    { "id": "display", "label": "Display", "desc": "Display or touch panel" },
    { "id": "harsh-env", "label": "Harsh environment", "desc": "Industrial, outdoor, coated" },
    { "id": "automotive", "label": "Automotive", "desc": "AEC-Q parts, vehicle transients" },
    { "id": "medical", "label": "Medical", "desc": "IEC 60601 style requirements" },
    { "id": "regulatory", "label": "Certification", "desc": "EMC / radio certification" },
    { "id": "production", "label": "Volume production", "desc": "Test fixtures, cost, panels" }
  ],
  "demo": {
    "findings": [
      { "id": "sp3", "sev": "major", "who": "A. Rivera", "by": "Sam Patel", "ref": "U4, U7", "notes": [
        "U4 VDDA has only 100 nF. The datasheet asks for 1 µF + 100 nF per supply pin pair.",
        "Added C41 (1 µF 0402) next to pin 9. Will be in rev B."], "res": "fixed" },
      { "id": "usb2", "sev": "critical", "who": "J. Chen", "by": "Morgan Lee", "ref": "J3 USB-C", "notes": [
        "No ESD protection on the USB-C data lines. The connector is user-accessible.",
        "Suggest a low-capacitance TVS array (< 1 pF) close to J3."], "res": "" },
      { "id": "sd8", "sev": "major", "who": "A. Rivera", "by": "Sam Patel", "ref": "I2C1: R12, R13", "notes": [
        "I2C1 pull-ups are 10 kΩ with ~180 pF of bus capacitance. Rise time is too slow for 400 kHz.",
        "Changed to 2.2 kΩ."], "res": "fixed" },
      { "id": "pcb-hc-5", "sev": "major", "who": "J. Chen", "by": "Morgan Lee", "ref": "U2 buck", "notes": [
        "U2 dissipates ~0.9 W at full load. Only 4 vias under the exposed pad."], "res": "" },
      { "id": "pt1", "sev": "minor", "who": "", "by": "Sam Patel", "ref": "", "notes": [
        "No test points on 3V3_AUX or 1V8. Bring-up will be awkward."], "res": "" },
      { "id": "pm6", "sev": "minor", "who": "", "by": "Morgan Lee", "ref": "Panel", "notes": [
        "Only two board fiducials, and they are symmetric. The assembler asked for three, placed asymmetrically."], "res": "waived" },
      { "id": "pt4", "sev": "minor", "who": "A. Rivera", "by": "Morgan Lee", "ref": "D3, D4", "notes": [
        "Polarity marks for D3/D4 sit under the part bodies and won’t be visible after assembly."], "res": "" },
      { "id": "pcb-iso-1", "sev": "critical", "who": "J. Chen", "by": "Sam Patel", "ref": "K1 relay", "notes": [
        "Clearance between the K1 contact and the SELV ground pour is under the requirement for reinforced insulation.",
        "Moved the pour back and added a slot. Please re-check."], "res": "fixed" }
    ],
    "comments": [
      { "id": "sd3", "by": "Morgan Lee", "text": "Checked the supervisor threshold against the 3V3 rail tolerance. OK." },
      { "id": "sc7", "by": "Sam Patel", "text": "Load caps recalculated with 3 pF stray: 12 pF is right." },
      { "id": "sp8", "by": "Morgan Lee", "text": "Is the soft-start time OK with the 470 µF bulk on the 5 V rail? Can we confirm with a sim?" }
    ],
    "projects": [
      { "seed": 7, "users": ["Sam Patel", "Morgan Lee"],
        "ratios": { "schematic": 0.95, "interfaces": 0.9, "pcb": 0.62, "assembly": 0.3, "fab": 0.1 },
        "fields": { "name": "Smart Thermostat — Main PCBA", "client": "Acme Climate", "board": "DT-1042", "revision": "B", "stage": "Layout",
          "description": "Rev B layout review before release to fab. Wi-Fi module, mains-powered via an isolated AC/DC, relay outputs.",
          "profile": ["mains", "rf", "regulatory", "production"], "checklists": ["schematic", "interfaces", "pcb", "assembly", "fab"] } },
      { "seed": 11, "users": ["Morgan Lee", "Sam Patel"],
        "ratios": { "schematic": 0.45, "interfaces": 0.3 },
        "fields": { "name": "Handheld Scanner — Power Board", "client": "Northwind Instruments", "board": "DT-2210", "revision": "A", "stage": "Schematic",
          "description": "First schematic review. Li-ion pack, USB-C PD charging, 2 A motor driver for the scan head.",
          "profile": ["battery", "low-power", "motor", "high-current"], "checklists": ["schematic", "interfaces", "pcb"] } }
    ]
  }
};
