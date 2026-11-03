# Ehsan Firouzi — Personal academic website

A dependency-free, responsive static website for GitHub Pages and other static hosts. News and publications are loaded from plain-text files at runtime; no build step, database, account, or third-party JavaScript is required.

## Add or edit news

Open `data/news.txt`. Each entry uses this format:

```txt
date: 2026-10-27
title: Your news headline
summary: A short description of the update.
tag: Announcement
link: https://example.com/details
featured: false
---
```

- Separate entries with `---` on its own line.
- `date` and `title` are required.
- Dates accept `YYYY`, `YYYY-MM`, or `YYYY-MM-DD`.
- `summary`, `tag`, `link`, and `featured` are optional.
- Set `featured: true` on at most one item. Without a featured item, the newest item is featured automatically.
- Lines beginning with `#` are comments.
- Use `#publications` for a local link or a full HTTPS URL for an external link.

## Add or edit papers

Open `data/papers.txt`. Each entry uses this format:

```txt
year: 2026
type: Conference
title: Your paper title
authors: First Author, Second Author
venue: Conference or journal name
pdf: https://example.com/paper.pdf
---
```

- `year`, `type`, `title`, `authors`, and `venue` are required.
- Supported types are `Journal`, `Conference`, and `Workshop`.
- `pdf` is optional and must be an HTTPS URL.
- Entries are automatically sorted by year. Search, year filters, type filters, the publication count, and citation text update automatically.

Invalid or incomplete entries are ignored. Invalid file syntax shows a friendly error with a retry action. Keep a backup before major edits.

## Preview locally

You can open `index.html` directly. Browsers block text-file requests on `file://` pages, so this mode uses the safe snapshot in `assets/js/content-fallback.js`.

After editing either text file, refresh that snapshot by running this command from the project directory:

```sh
python3 sync-content.py
```

For live text-file loading without the synchronization step, run:

```sh
python3 -m http.server 8000
```

Then open `http://localhost:8000`. Published sites always read `data/news.txt` and `data/papers.txt` directly.

## Publish on GitHub Pages

Copy the contents of this directory to the root of the `EhsanFir.github.io` repository and commit. The site requires no build command. News and papers can subsequently be edited directly in GitHub's text editor.

## Security model

- All text-file values are inserted with `textContent`; content is never interpreted as HTML.
- URLs are parsed and restricted to local anchors, same-origin relative links, or HTTPS links without embedded credentials.
- External links opened in a new tab use `noopener noreferrer`.
- A restrictive Content Security Policy permits only same-origin scripts, styles, fonts, images, and data requests. No inline scripts, `eval`, third-party trackers, or external JavaScript libraries are used.
- `_headers` adds CSP, anti-framing, MIME-sniffing, referrer, permissions, and cross-origin protections on hosts that support it. GitHub Pages ignores `_headers`; the HTML meta CSP still applies there, but HTTP-only headers such as `frame-ancestors` require hosting support.
- There are no cookies, user accounts, contact forms, or server-side data collection. Only the selected color theme is stored in the visitor's browser.

Static-site security also depends on repository access and hosting configuration. Keep GitHub account two-factor authentication enabled, protect the default branch, and review changes before publishing.

## Project structure

```txt
index.html                 Page structure and metadata
assets/css/styles.css      Responsive light/dark design and print styles
assets/js/app.js           Safe parsers, rendering, filters, and interactions
assets/js/content-fallback.js  Offline content snapshot for direct file opening
sync-content.py            Refreshes the offline snapshot after text edits
assets/images/             Optimized local images and favicon
assets/fonts/              Locally hosted typefaces and licenses
data/news.txt              Editable news entries
data/papers.txt            Editable publication entries
_headers                   Optional hosting security headers
.well-known/security.txt   Security contact information
```
