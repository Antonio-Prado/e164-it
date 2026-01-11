#!/usr/bin/env python3
from __future__ import annotations
from pathlib import Path
import re
import argparse

RE_BODY = re.compile(r"(<body\b[^>]*>)(.*?)(</body>)", re.I | re.S)
RE_MAIN = re.compile(r"<main\b[^>]*>.*?</main>", re.I | re.S)
RE_SCRIPT = re.compile(r"<script\b[^>]*>.*?</script\s*>|<script\b[^>]*/\s*>", re.I | re.S)
RE_HEADER = re.compile(r"<header\b[^>]*>.*?</header>", re.I | re.S)
RE_FOOTER = re.compile(r"<footer\b[^>]*>.*?</footer>", re.I | re.S)
RE_CLASS = re.compile(r'\bclass\s*=\s*"([^"]*)"', re.I)

def merge_body_classes(dst_body_open: str, src_body_open: str) -> str:
    src_m = RE_CLASS.search(src_body_open)
    if not src_m:
        return dst_body_open
    src_classes = [c for c in src_m.group(1).split() if c.strip()]

    dst_m = RE_CLASS.search(dst_body_open)
    if dst_m:
        dst_classes = [c for c in dst_m.group(1).split() if c.strip()]
        merged, seen = [], set()
        for c in dst_classes + src_classes:
            if c not in seen:
                seen.add(c)
                merged.append(c)
        return RE_CLASS.sub(f'class="{" ".join(merged)}"', dst_body_open, count=1)
    else:
        return dst_body_open[:-1] + f' class="{" ".join(src_classes)}">'

def extract_docs_shell(docs_html: str) -> tuple[str, str, str]:
    m = RE_BODY.search(docs_html)
    if not m:
        raise SystemExit("Docs: <body> not found")
    docs_body_open, docs_body, _ = m.group(1), m.group(2), m.group(3)

    mm = RE_MAIN.search(docs_body)
    if not mm:
        raise SystemExit("Docs: <main>...</main> not found (required to rebuild the page)")
    prefix = docs_body[:mm.start()]
    suffix = docs_body[mm.end():]

    suffix_struct = RE_SCRIPT.sub("", suffix)
    suffix_struct = RE_FOOTER.sub("", suffix_struct)
    return docs_body_open, prefix, suffix_struct

def extract_target_payload(target_body: str) -> tuple[str, str]:
    scripts = "".join(RE_SCRIPT.findall(target_body))
    body_wo_scripts = RE_SCRIPT.sub("", target_body)

    mm = RE_MAIN.search(body_wo_scripts)
    if not mm:
        hh = RE_HEADER.search(body_wo_scripts)
        content = body_wo_scripts[hh.end():] if hh else body_wo_scripts
        content = content.strip()
        main = "<main>\n" + content + "\n</main>"
    else:
        main = mm.group(0)

    return main, scripts

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--docs", default="public/docs/index.html")
    ap.add_argument("--root", default="public")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    docs_path = Path(args.docs)
    root = Path(args.root)

    docs_html = docs_path.read_text(encoding="utf-8")
    docs_body_open, docs_prefix, docs_suffix_struct = extract_docs_shell(docs_html)

    changed = 0
    scanned = 0

    for p in sorted(root.rglob("index.html")):
        if p.resolve() == docs_path.resolve():
            continue

        s = p.read_text(encoding="utf-8")
        m = RE_BODY.search(s)
        if not m:
            continue

        scanned += 1
        tgt_body_open, tgt_body, _ = m.group(1), m.group(2), m.group(3)

        main_block, scripts = extract_target_payload(tgt_body)

        new_body_open = merge_body_classes(tgt_body_open, docs_body_open)
        new_body = docs_prefix + main_block + docs_suffix_struct + "\n" + scripts

        out = s[:m.start()] + new_body_open + new_body + "</body>" + s[m.end():]

        if out != s:
            changed += 1
            print("updated:", p)
            if not args.dry_run:
                p.write_text(out, encoding="utf-8")

    print(f"done: scanned={scanned} changed={changed}")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
