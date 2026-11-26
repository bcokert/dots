#!/usr/bin/env python3
"""Inline a page's local stylesheets and fonts into one self-contained HTML file.

    python3 modules/design/bundle.py modules/design/specimen.html OUT.html

For previews that can't load sibling files (bb's inline previews, a page sent around). The source page stays the
truth; re-run after changing it, tokens.css or the fonts."""
import base64, os, re, sys

src, out = sys.argv[1], sys.argv[2]
base = os.path.dirname(os.path.abspath(src))

def inline_urls(css, css_dir):
    def rep(m):
        ref = m.group(1)
        if ref.startswith(("data:", "http:", "https:", "#")):
            return m.group(0)
        path = os.path.join(css_dir, ref)
        mime = "font/woff2" if path.endswith(".woff2") else "application/octet-stream"
        return 'url("data:%s;base64,%s")' % (mime, base64.b64encode(open(path, "rb").read()).decode())
    return re.sub(r'url\("?([^")]+)"?\)', rep, css)

def link(m):
    href = m.group(1)
    path = os.path.join(base, href)
    css = inline_urls(open(path).read(), os.path.dirname(path))
    return "<style>/* %s */\n%s</style>" % (href, css)

html = re.sub(r'<link rel="stylesheet" href="([^"]+\.css)">', link, open(src).read())
open(out, "w").write(html)
print(out, len(html) // 1024, "KB")
