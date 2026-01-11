#!/usr/bin/env python3
from __future__ import annotations
from pathlib import Path
import re

RE_HEADER = re.compile(r"<header\b[^>]*>.*?</header>", re.I | re.S)
RE_NAV    = re.compile(r"<nav\b[^>]*>.*?</nav>", re.I | re.S)
RE_A      = re.compile(r"<a\b[^>]*>.*?</a>", re.I | re.S)
RE_HREF   = re.compile(r'\bhref="[^"]*"', re.I)

TARGETS = {
    "single":  "/",
    "batch":   "/batch/",
    "docs":    "/docs/",
    "api":     "/api/",
    "privacy": "/privacy/",
    "samples": "/samples/",
}

def strip_tags(s: str) -> str:
    s = re.sub(r"<[^>]+>", "", s)
    return " ".join(s.split()).strip().lower()

def set_href(a_tag: str, href: str) -> str:
    if RE_HREF.search(a_tag):
        return RE_HREF.sub(f'href="{href}"', a_tag, count=1)
    return a_tag.replace("<a", f'<a href="{href}"', 1)

def rewrite_nav(nav_html: str) -> tuple[str, int]:
    changed = 0

    def repl(m: re.Match) -> str:
        nonlocal changed
        a = m.group(0)
        label = strip_tags(a)
        for key, href in TARGETS.items():
            if key in label:
                new_a = set_href(a, href)
                if new_a != a:
                    changed += 1
                return new_a
        return a

    out = RE_A.sub(repl, nav_html)
    return out, changed

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
    new_nav, n = rewrite_nav(nav)
    if n == 0:
        return False

    new_header = header[:mn.start()] + new_nav + header[mn.end():]
    out = s[:mh.start()] + new_header + s[mh.end():]

    if out != s:
        p.write_text(out, encoding="utf-8")
        return True
    return False

def main() -> None:
    changed = 0
    for p in sorted(Path("public").rglob("index.html")):
        if process_file(p):
            print("updated:", p)
            changed += 1
    print("done. changed_files =", changed)

if __name__ == "__main__":
    main()
