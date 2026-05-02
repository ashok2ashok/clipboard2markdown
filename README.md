# clipboard2markdown

> Paste richly formatted text — get clean Markdown instantly.

**[Live demo →](https://ashok2ashok.github.io/clipboard2markdown/)**

![Landing page](screenshot-home.png)

![App view](screenshot-app.png)

---

## Usage

### Desktop
1. Copy formatted text from anywhere (`Ctrl+C` / `⌘C`)
2. Paste into the app (`Ctrl+V` / `⌘V`)
3. Markdown appears — already selected, ready to copy

Paste again to replace. Switch flavors to re-convert on the fly.

### Mobile
1. Long-press text anywhere → **Copy**
2. Tap **Paste from Clipboard** in the app  
   *(or long-press in the dashed zone → tap **Paste**)*
3. Markdown appears — tap **Copy** to grab it

If the app detects clipboard content on load, a banner appears to paste with one tap.

---

## Features

- **Split-panel live preview** — rendered with the same stack as [markdownlivepreview.com](https://markdownlivepreview.com)
- **Markdown flavors** — GitHub (GFM), CommonMark, Pandoc, R Markdown, MultiMarkdown
- **Prettify** — normalizes heading spacing, collapses blank lines, trims trailing whitespace
- **Raw HTML accordion** — inspect the original pasted HTML below the editor
- **Dark mode** — follows system preference automatically
- **Mobile support** — tap button to paste via Clipboard API, or long-press the paste zone; auto-detects clipboard content on load
- **No server** — runs entirely in the browser

---

## Tech stack

| Library | Version | Role |
| --- | --- | --- |
| [Turndown](https://github.com/mixmark-io/turndown) | 7.2.0 | HTML → Markdown |
| [turndown-plugin-gfm](https://github.com/mixmark-io/turndown-plugin-gfm) | 1.0.2 | GFM strikethrough + task lists |
| [marked](https://github.com/markedjs/marked) | 15.0.7 | Markdown → HTML preview |
| [DOMPurify](https://github.com/cure53/DOMPurify) | 3.2.4 | Sanitize preview HTML |
| [github-markdown-css](https://github.com/sindresorhus/github-markdown-css) | 5.8.1 | Preview styling |
| [Bootstrap](https://getbootstrap.com) | 5.3.3 | UI |

All loaded via CDN — no build step required.

---

## License

Released under the [MIT License](LICENSE).

Original project by [Euan Goddard](https://github.com/euangoddard).
