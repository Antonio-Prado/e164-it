#!/usr/bin/env python3
from __future__ import annotations
from pathlib import Path
import re

RE_HEADER = re.compile(r"(<header\b[^>]*>)(.*?)(</header>)", re.I | re.S)
RE_NAV    = re.compile(r"(<nav\b[^>]*>)(.*?)(</nav>)", re.I | re.S)
RE_A      = re.compile(r"<a\b[^>]*>.*?</a>", re.I | re.S)
RE_HREF   = re.compile(r'\bhref="[^"]*"', re.I)

TARGETS = [
    ("single",  "/"),
    ("batch",   "/batch/"),
    ("docs",    "/docs/"),
    ("api",     "/api/"),
    ("privacy", "/privacy/"),
    ("samples", "/samples/"),
]

def strip_tags(s: str) -> str:
    s = re.sub(r"<[^>]+>", "", s)
    return " ".join(s.split()).strip().lower()

def set_href(a_tag: str, href: str) -> str:
    if RE_HREF.search(a_tag):
        return RE_HREF.sub(f'href="{href}"', a_tag, count=1)
    # se per qualche motivo manca href, lo aggiungo
    return a_tag.replace("<a", f'<a href="{href}"', 1)

def fix_one_file(p: Path) -> bool:
    s = p.read_text(encoding="utf-8")

    mh = RE_HEADER.search(s)
    if not mh:
        return False

    header_open, header_inner, header_close = mh.group(1), mh.group(2), mh.group(3)
    mn = RE_NAV.search(header_inner)
    if not mn:
        return False

    nav_open, nav_inner, nav_close = mn.group(1), mn.group(2), mn.group(3)

    def repl_anchor(m: re.Match) -> str:
        a = m.group(0)
        label = strip_tags(a)
        for key, href in TARGETS:
            if key in label:
                return set_href(a, href)
        return a

    new_nav_inner = RE_A.sub(repl_anchor, nav_inner)

    if new_nav_inner == nav_inner:
        return False

    new_header_inner = header_inner[:mn.start()] + nav_open + new_nav_inner + nav_close + header_inner[mn.end():]
    out = s[:mh.start()] + header_open + new_header_inner + header_close + s[mh.end():]

    if out != s:
        p.write_text(out, encoding="utf-8")
        return True
    return False

def main() -> None:
    changed = 0
    for p in sorted(Path("public").rglob("index.html")):
        if fix_one_file(p):
            print("updated:", p)
            changed += 1
    print("done. changed_files =", changed)

if __name__ == "__main__":
    main()
