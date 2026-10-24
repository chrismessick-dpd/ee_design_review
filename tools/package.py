"""Make a copy of Signoff to send to a contractor.

    python tools/package.py        # writes dist/Signoff-<build>.zip

The zip holds only the tool (index.html and assets/), with the checklists bundled, plus a
short START HERE note. It contains no review data and no token: the contractor signs in
with their own GitHub token and syncs only the projects they're assigned in People.
"""
import pathlib
import re
import subprocess
import sys
import zipfile

ROOT = pathlib.Path(__file__).resolve().parent.parent

START_HERE = """Signoff - Dovetail design review
================================

1. Unzip this folder anywhere and open index.html in Chrome, Edge or Safari.
2. If you don't have one, create a free GitHub account at https://github.com/signup
   and send your username to your Dovetail contact.
3. In Signoff, click the gear (bottom left) and follow "New to GitHub? Set up in four
   steps" to create a token. Paste it in and click Save & sync.
4. Click Accept on the invitation that appears in the sidebar.

Your projects then appear in the sidebar. Click Sync (or press Ctrl+S) to get the latest
changes and send yours. When the sidebar says "Newer tool available", ask for a new copy.
"""


def main():
    if subprocess.call([sys.executable, str(ROOT / "tools" / "build.py"), "--check"]) != 0:
        print("Run python tools/build.py first.")
        return 1
    build = re.search(r"hash:\s*'([0-9a-f]+)'", (ROOT / "assets" / "version.js").read_text(encoding="utf-8")).group(1)
    out = ROOT / "dist" / f"Signoff-{build}.zip"
    out.parent.mkdir(exist_ok=True)
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        # Contractors don't get the other internal tools, so the sidebar link to them goes.
        html = re.sub(r"\s*<!-- tools-link:.*?<!-- /tools-link -->", "", (ROOT / "index.html").read_text(encoding="utf-8"), flags=re.S)
        z.writestr("Signoff/index.html", html)
        for p in sorted((ROOT / "assets").rglob("*")):
            if p.is_file():
                z.write(p, "Signoff/" + p.relative_to(ROOT).as_posix())
        z.writestr("Signoff/START HERE.txt", START_HERE)
    print(f"wrote {out.relative_to(ROOT).as_posix()}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
