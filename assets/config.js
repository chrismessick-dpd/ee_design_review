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
  "hostedBase": "https://chrismessick-dpd.github.io",
  "repos": {
    "owner": "chrismessick-dpd",
    "toolRepo": "ee_design_review",
    "dataRepo": "ee_design_review_data",
    "prefix": "review-ee-",
    "suite": ["me_design_review", "me_design_review_data", "signoff", "pcb_dfm", "signoff_pl", "signoff_pl_data"]
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
      { "id": "pt1", "sev": "minor", "who": "", "by": "Sam Patel", "ref": "", "notes": [
        "No test points on 3V3_AUX or 1V8. Bring-up will be awkward."], "res": "" },
      { "id": "pm6", "sev": "minor", "who": "", "by": "Morgan Lee", "ref": "Panel", "notes": [
        "Only two board fiducials, and they are symmetric. The assembler asked for three, placed asymmetrically."], "res": "waived" },
      { "id": "pt4", "sev": "minor", "who": "A. Rivera", "by": "Morgan Lee", "ref": "D3, D4", "notes": [
        "Polarity marks for D3/D4 sit under the part bodies and won’t be visible after assembly."], "res": "" },
      { "id": "pcb-iso-1", "sev": "critical", "who": "J. Chen", "by": "Sam Patel", "ref": "K1 relay", "notes": [
        "Clearance between the K1 contact and the SELV ground pour is under the requirement for reinforced insulation.",
        "Moved the pour back and added a slot. Please re-check."], "res": "fixed" },
      { "id": "disp8", "sev": "critical", "who": "J. Chen", "by": "Morgan Lee", "ref": "J2, touch keys", "notes": [
        "The touch-key and display connector lines at J2 have no ESD protection, and the front face is touched every day.",
        "Suggest a low-capacitance TVS array next to J2. Check the touch controller's input capacitance budget first."], "res": "" },
      { "id": "ifc-touch-4", "sev": "major", "who": "J. Chen", "by": "Sam Patel", "ref": "U3 supply", "notes": [
        "The touch controller's supply shares a ground return with the backlight boost. Expect false touches while the backlight dims."], "res": "" },
      { "id": "disp6", "sev": "minor", "who": "A. Rivera", "by": "Morgan Lee", "ref": "Backlight PWM", "notes": [
        "Backlight PWM at 200 Hz flickers on camera and at the edge of vision.",
        "Raised to 20 kHz. The driver supports it."], "res": "fixed" },
      { "id": "sch-therm-4", "sev": "major", "who": "A. Rivera", "by": "Sam Patel", "ref": "U5 temperature sensor", "notes": [
        "The temperature and humidity sensor sits 6 mm (236 mil) from the backlight boost inductor. Self-heating will bias the room reading.",
        "Moving U5 to the bottom edge, next to the enclosure's intake vents. Coordinating the vent position with ME."], "res": "" }
    ],
    "comments": [
      { "id": "sd3", "by": "Morgan Lee", "text": "Checked the supervisor threshold against the 3V3 rail tolerance. OK." },
      { "id": "sc7", "by": "Sam Patel", "text": "Load caps recalculated with 3 pF stray: 12 pF is right." },
      { "id": "sp8", "by": "Morgan Lee", "text": "Is the soft-start time OK with the 470 µF bulk on the 5 V rail? Can we confirm with a sim?" },
      { "id": "disp5", "by": "Sam Patel", "text": "Checked the power-up order against the panel datasheet: VDDIO, then VDD, then backlight enable 20 ms later. OK." }
    ],
    "projects": [
      { "seed": 7, "users": ["Sam Patel", "Morgan Lee"],
        "findings": ["sp3", "usb2", "sd8", "pt1", "pm6", "pt4", "pcb-iso-1"], "comments": ["sd3", "sc7", "sp8"],
        "requirements": [{"ref": "REQ-001", "text": "The thermostat shall run from 100–240 V AC, 50/60 Hz mains.", "category": "Power", "source": "Acme DT-SPEC-12 §3.1", "method": "test", "status": "approved", "verify": "pass", "evidence": "Bring-up report BR-02: full function at 90 and 264 V AC, 47 and 63 Hz.", "links": ["sp2", "sp8"], "by": "Sam Patel"}, {"ref": "REQ-002", "text": "Mains circuits shall be separated from user-accessible low-voltage circuits by reinforced insulation.", "category": "Safety", "source": "Acme DT-SPEC-12 §5.2", "method": "inspection", "status": "approved", "verify": "open", "links": ["sch-iso-3", "pcb-iso-1"], "by": "Morgan Lee"}, {"ref": "REQ-003", "text": "The USB-C service port shall withstand ±8 kV contact and ±15 kV air ESD without damage.", "category": "Interfaces", "source": "Acme DT-SPEC-12 §6.4", "method": "test", "status": "approved", "verify": "open", "links": ["usb2", "spr4"], "by": "Morgan Lee"}, {"ref": "REQ-004", "text": "Wi-Fi shall use a pre-certified radio module so system-level certification needs only intentional-radiator spot checks.", "kind": "should", "category": "Regulatory", "source": "Kickoff notes 2026-09-02", "method": "inspection", "status": "draft", "verify": "open", "links": [], "by": "Sam Patel"}, {"ref": "REQ-005", "text": "Relay outputs shall switch 2 A at 250 V AC resistive for at least 100,000 cycles.", "category": "Outputs", "source": "Acme DT-SPEC-12 §4.3", "method": "analysis", "status": "changed", "verify": "open", "links": [], "by": "Sam Patel"}],
        "ratios": { "schematic": 0.95, "interfaces": 0.9, "pcb": 0.62, "assembly": 0.3, "fab": 0.1 },
        "fields": { "name": "Smart Thermostat — Main PCBA", "client": "Acme Climate", "board": "DT-1042", "revision": "B", "stage": "Layout",
          "description": "Rev B layout review before release to fab. Wi-Fi module, mains-powered via an isolated AC/DC, relay outputs.",
          "profile": ["mains", "rf", "regulatory", "production"], "checklists": ["schematic", "interfaces", "pcb", "assembly", "fab"] } },
      { "seed": 11, "users": ["Morgan Lee", "Sam Patel"],
        "findings": ["disp8", "ifc-touch-4", "disp6", "sch-therm-4"], "comments": ["disp5"],
        "requirements": [{"ref": "REQ-001", "text": "The thermostat shall measure room temperature to within ±0.5 °C from 5 to 35 °C.", "category": "Sensing", "source": "Acme DT-SPEC-12 §2.3", "method": "test", "status": "approved", "verify": "open", "links": ["sch-therm-4", "pcb-pl-8"], "by": "Sam Patel"}, {"ref": "REQ-002", "text": "The touch keys shall withstand ±8 kV contact ESD without a reset or a false press.", "category": "Interfaces", "source": "Acme DT-SPEC-12 §6.4", "method": "test", "status": "approved", "verify": "open", "links": ["disp8", "ifc-gpio-5"], "by": "Morgan Lee"}, {"ref": "REQ-003", "text": "The board shall draw no more than 15 mA on average from the 3V3 rail with the backlight dimmed.", "category": "Power", "source": "Acme DT-SPEC-12 §3.4", "method": "analysis", "status": "approved", "verify": "pass", "evidence": "Power budget rev A: 11.8 mA average at 10% backlight.", "links": [], "by": "Sam Patel"}, {"ref": "REQ-004", "text": "The display should be readable from 2 m in 500 lux room lighting.", "kind": "should", "category": "Display", "source": "Kickoff notes 2026-09-02", "method": "demonstration", "status": "draft", "verify": "open", "links": [], "by": "Morgan Lee"}],
        "ratios": { "schematic": 0.6, "interfaces": 0.45, "pcb": 0.2 },
        "fields": { "name": "Smart Thermostat — Display & Sensor Board", "client": "Acme Climate", "board": "DT-1043", "revision": "A", "stage": "Schematic",
          "description": "First schematic review of the front board: 2.8\" TFT display, capacitive touch keys, temperature and humidity sensor, ambient light sensor. Connects to the main PCBA over a 24-pin FFC.",
          "profile": ["low-power", "display", "precision-analog"], "checklists": ["schematic", "interfaces", "pcb"] } }
    ]
  }
};
