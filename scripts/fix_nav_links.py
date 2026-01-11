#!/usr/bin/env python3
from __future__ import annotations
from pathlib import Path
import re

NAV_TARGETS = ["/", "/batch/", "/docs/", "/api/", "/privacy/", "/samples/"]

RE_HEADER = re.compile(r"<header\b[^>]*>.*?</header>", re.I | re.S)
RE_NAV = re.compile(r"<nav\b[^>]*>.*?</nav>", re.I | re.S)

# trova <a ... href="..."> ... </a> (non perfetto HTML parser, ma sufficiente per nav semplice)
RE_A = re.compile(r"<a\b[^>]*\bhref=\"[^\"]*\"[^>]*>.*?</a>", re.I | re.S)
RE_HREF = re.compile(r'(\bhref=")[^"]*(")', re.I)

def rewrite_nav_by_order(nav_html: str) -> tuple[str, int]:
    anchors = list(RE_A.finditer(nav_html))
    if len(anchors) < 6:
        return nav_html, 0

    out = []
    last = 0
    changed = 0

    for i, m in enumerate(anchors):
        seg = nav_html[m.start():m.end()]
        new_seg = seg
        if i < len(NAV_TARGETS):
            new_seg2, n = RE_HREF.subn(rf'\1{NAV_TARGETS[i]}\2', new_seg, count=1)
            if n and new_seg2 != new_seg:
                new_seg = new_seg2
                changed += 1

        out.append(nav_html[last:m.start()])
        out.append(new_seg)
        last = m.end()

    out.append(nav_html[last:])
    return "".join(out), changed

def process_file(p: Path) -> bool:
    s = p.read_text(encoding="utf-8")
    mh = RE_HEADER.search(s)
    if not mh:
        return False

    header = mh.group(0)
    mn = RE_NAV.search(header)
    if not mn:
        return False

    nav = mn.group(0)
    new_nav, changed = rewrite_nav_by_order(nav)
    if changed == 0:
        return False

    new_header = header[:mn.start()] + new_nav + header[mn.end():]
    out = s[:mh.start()] + new_header + s[mh.end():]

    if out != s:
        p.write_text(out, encoding="utf-8")
        return True
    return False

def main() -> None:
    root = Path("public")
    changed_files = 0
    for p in sorted(root.rglob("index.html")):
        if process_file(p):
            print("updated:", p)
            changed_files += 1
    print("done. changed_files =", changed_files)

if __name__ == "__main__":
    main()
