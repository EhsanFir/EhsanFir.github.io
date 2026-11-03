(() => {
  'use strict';

  const MAX_CONTENT_LENGTH = 1_000_000;
  const MAX_ENTRIES = 500;
  const NEWS_FIELDS = new Set(['date', 'title', 'summary', 'tag', 'link', 'featured']);
  const PAPER_FIELDS = new Set(['year', 'type', 'title', 'authors', 'venue', 'pdf']);
  const state = { papers: [], type: 'all', year: 'all', query: '' };
  let toastTimer;

  const byId = (id) => document.getElementById(id);

  function makeElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function cleanText(value, maxLength = 4000) {
    return String(value ?? '')
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
      .trim()
      .slice(0, maxLength);
  }

  function parseRecords(source, allowedFields) {
    if (typeof source !== 'string' || source.length > MAX_CONTENT_LENGTH) {
      throw new Error('Content file is empty or too large.');
    }

    const blocks = source.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split(/^---\s*$/m);
    if (blocks.length > MAX_ENTRIES) throw new Error('Too many content entries.');

    return blocks.map((block, blockIndex) => {
      const record = {};
      const lines = block.split('\n');
      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;
        const match = rawLine.match(/^\s*([A-Za-z][A-Za-z0-9]*):[\t ]*(.*)$/);
        if (!match) throw new Error(`Invalid content syntax in entry ${blockIndex + 1}.`);
        const key = match[1].toLowerCase();
        if (!allowedFields.has(key)) throw new Error(`Unsupported field in entry ${blockIndex + 1}.`);
        if (Object.hasOwn(record, key)) throw new Error(`Duplicate ${key} field in entry ${blockIndex + 1}.`);
        record[key] = cleanText(match[2]);
      }
      return record;
    }).filter((record) => Object.keys(record).length > 0);
  }

  function safeUrl(value) {
    const raw = cleanText(value, 2048);
    if (!raw || /[\u0000-\u0020\u007F]/.test(raw)) return '';
    if (/^#[A-Za-z][A-Za-z0-9_-]*$/.test(raw)) {
      return document.getElementById(raw.slice(1)) ? raw : '';
    }
    try {
      if (raw.startsWith('//') || raw.includes('\\')) return '';
      const url = new URL(raw, window.location.href);
      const hasScheme = /^[A-Za-z][A-Za-z0-9+.-]*:/.test(raw);
      if (!hasScheme && url.origin === window.location.origin) return raw;
      if (url.protocol === 'https:' && !url.username && !url.password) return url.href;
      return '';
    } catch {
      return '';
    }
  }

  async function fetchText(path) {
    if (window.location.protocol === 'file:') {
      const key = path.endsWith('/news.txt') ? 'news' : path.endsWith('/papers.txt') ? 'papers' : '';
      const snapshot = window.__SITE_CONTENT__;
      if (!key || !snapshot || typeof snapshot[key] !== 'string') {
        throw new Error('Offline content snapshot is unavailable.');
      }
      return snapshot[key];
    }

    const response = await fetch(path, {
      headers: { Accept: 'text/plain' },
      credentials: 'same-origin',
      cache: 'no-cache',
      redirect: 'error'
    });
    if (!response.ok) throw new Error('Content request failed.');
    const length = Number(response.headers.get('content-length') || 0);
    if (length > MAX_CONTENT_LENGTH) throw new Error('Content file is too large.');
    const text = await response.text();
    if (text.length > MAX_CONTENT_LENGTH) throw new Error('Content file is too large.');
    return text;
  }

  function normalizeNews(record) {
    const date = cleanText(record.date, 10);
    const title = cleanText(record.title, 300);
    if (!/^\d{4}(?:-\d{2}(?:-\d{2})?)?$/.test(date) || !title) return null;
    return {
      date,
      title,
      summary: cleanText(record.summary, 1600),
      tag: cleanText(record.tag, 60) || 'Update',
      link: safeUrl(record.link),
      featured: String(record.featured).toLowerCase() === 'true'
    };
  }

  function normalizePaper(record) {
    const year = cleanText(record.year, 4);
    const title = cleanText(record.title, 400);
    const type = cleanText(record.type, 40).toLowerCase();
    if (!/^\d{4}$/.test(year) || !title || !['journal', 'conference', 'workshop'].includes(type)) return null;
    return {
      year,
      type,
      title,
      authors: cleanText(record.authors, 700),
      venue: cleanText(record.venue, 600),
      pdf: safeUrl(record.pdf)
    };
  }

  function formatNewsDate(date) {
    if (date.length === 4) return date;
    const normalized = date.length === 7 ? `${date}-01` : date;
    const parsed = new Date(`${normalized}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime())) return date;
    return new Intl.DateTimeFormat('en', {
      year: 'numeric',
      month: date.length === 7 ? 'long' : 'short',
      day: date.length === 10 ? 'numeric' : undefined,
      timeZone: 'UTC'
    }).format(parsed);
  }

  function appendSafeLink(parent, url, label, className) {
    if (!url) return;
    const link = makeElement('a', className, label);
    link.href = url;
    if (!url.startsWith('#') && !url.startsWith('/') && !url.startsWith('./')) {
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
    }
    parent.append(link);
  }

  function showToast(message) {
    const toast = byId('toast');
    toast.textContent = message;
    toast.classList.add('visible');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove('visible'), 2400);
  }

  async function copyText(text, successMessage) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = makeElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.append(textarea);
        textarea.select();
        const copied = document.execCommand('copy');
        textarea.remove();
        if (!copied) throw new Error('Copy command unavailable.');
      }
      showToast(successMessage);
    } catch {
      showToast('Copy is unavailable in this browser. Please copy the text manually.');
    }
  }

  function showContentError(container, filename, retry) {
    const wrapper = makeElement('div', 'error-state');
    const message = makeElement('p', '', `Unable to load ${filename}. Check the file and try again.`);
    const button = makeElement('button', 'text-button', 'Retry');
    button.type = 'button';
    button.addEventListener('click', retry);
    wrapper.append(message, button);
    container.replaceChildren(wrapper);
    container.setAttribute('aria-busy', 'false');
  }

  function renderNews(news) {
    const container = byId('news-list');
    container.replaceChildren();
    if (!news.length) {
      container.append(makeElement('p', 'empty-state', 'No news has been added yet.'));
      container.setAttribute('aria-busy', 'false');
      return;
    }

    const sorted = [...news].sort((a, b) => b.date.localeCompare(a.date));
    const featuredIndex = sorted.findIndex((item) => item.featured);
    const primary = featuredIndex >= 0 ? sorted.splice(featuredIndex, 1)[0] : sorted.shift();
    byId('hero-news-title').textContent = primary.title;
    byId('hero-news').hidden = false;

    function newsArticle(item, featured = false) {
      const article = makeElement('article', featured ? 'news-item news-featured' : 'news-item');
      const meta = makeElement('div', 'news-meta');
      meta.append(makeElement('span', 'news-tag', item.tag), makeElement('time', '', formatNewsDate(item.date)));
      const title = makeElement('h3', '', item.title);
      article.append(meta, title);
      if (item.summary) article.append(makeElement('p', '', item.summary));
      if (item.link) appendSafeLink(article, item.link, 'Read more ↗', 'news-link');
      return article;
    }

    container.append(newsArticle(primary, true));
    if (sorted.length) {
      const secondary = makeElement('div', 'news-secondary');
      sorted.forEach((item) => secondary.append(newsArticle(item)));
      container.append(secondary);
    }
    container.setAttribute('aria-busy', 'false');
  }

  async function loadNews() {
    byId('hero-news').hidden = true;
    const container = byId('news-list');
    container.setAttribute('aria-busy', 'true');
    container.replaceChildren(makeElement('p', 'loading-state', 'Loading news…'));
    try {
      const text = await fetchText('data/news.txt');
      const news = parseRecords(text, NEWS_FIELDS).map(normalizeNews).filter(Boolean);
      renderNews(news);
    } catch {
      showContentError(container, 'data/news.txt', loadNews);
    }
  }

  function paperCitation(paper) {
    return `${paper.authors} (${paper.year}). ${paper.title}. ${paper.venue}.`;
  }

  function filteredPapers() {
    const query = state.query.toLocaleLowerCase('en');
    return state.papers.filter((paper) => {
      const typeMatch = state.type === 'all' || paper.type === state.type;
      const yearMatch = state.year === 'all' || paper.year === state.year;
      const haystack = `${paper.title} ${paper.authors} ${paper.venue}`.toLocaleLowerCase('en');
      return typeMatch && yearMatch && (!query || haystack.includes(query));
    });
  }

  function updateClearButton() {
    byId('clear-filters').hidden = state.type === 'all' && state.year === 'all' && !state.query;
  }

  function renderPapers() {
    const container = byId('publication-list');
    const papers = filteredPapers();
    container.replaceChildren();

    papers.forEach((paper) => {
      const article = makeElement('article', 'paper');
      const meta = makeElement('div', 'paper-meta');
      meta.append(
        makeElement('span', 'paper-year', paper.year),
        makeElement('span', 'paper-type', paper.type)
      );

      const main = makeElement('div', 'paper-main');
      main.append(
        makeElement('h3', '', paper.title),
        makeElement('p', 'paper-authors', paper.authors),
        makeElement('p', 'paper-venue', paper.venue)
      );

      const actions = makeElement('div', 'paper-actions');
      appendSafeLink(actions, paper.pdf, 'PDF ↗', 'paper-link');
      const citation = makeElement('button', 'citation-button', 'Copy citation');
      citation.type = 'button';
      citation.addEventListener('click', () => copyText(paperCitation(paper), 'Citation copied to clipboard.'));
      actions.append(citation);
      article.append(meta, main, actions);
      container.append(article);
    });

    if (!papers.length) {
      const empty = makeElement('div', 'empty-state');
      empty.append(makeElement('p', '', state.papers.length ? 'No publications match these filters.' : 'No publications have been added yet.'));
      container.append(empty);
    }

    const total = state.papers.length;
    byId('publication-status').textContent = papers.length === total
      ? `${total} publication${total === 1 ? '' : 's'}`
      : `${papers.length} of ${total} publications`;
    container.setAttribute('aria-busy', 'false');
    updateClearButton();
  }

  function setFiltersEnabled(enabled) {
    byId('publication-search').disabled = !enabled;
    byId('year-filter').disabled = !enabled;
    document.querySelectorAll('[data-type]').forEach((button) => { button.disabled = !enabled; });
  }

  function populateYears() {
    const select = byId('year-filter');
    select.replaceChildren(makeElement('option', '', 'All years'));
    select.firstElementChild.value = 'all';
    const years = [...new Set(state.papers.map((paper) => paper.year))].sort().reverse();
    years.forEach((year) => {
      const option = makeElement('option', '', year);
      option.value = year;
      select.append(option);
    });
  }

  async function loadPapers() {
    const container = byId('publication-list');
    container.setAttribute('aria-busy', 'true');
    byId('publication-status').textContent = 'Loading publications…';
    setFiltersEnabled(false);
    try {
      const text = await fetchText('data/papers.txt');
      state.papers = parseRecords(text, PAPER_FIELDS)
        .map(normalizePaper)
        .filter(Boolean)
        .sort((a, b) => b.year.localeCompare(a.year));
      populateYears();
      setFiltersEnabled(true);
      renderPapers();
      document.querySelectorAll('[data-publication-count]').forEach((element) => {
        element.textContent = String(state.papers.length);
      });
    } catch {
      state.papers = [];
      container.setAttribute('aria-busy', 'false');
      byId('publication-status').textContent = 'Publications unavailable';
      showContentError(container, 'data/papers.txt', loadPapers);
    }
  }

  function clearFilters() {
    state.type = 'all';
    state.year = 'all';
    state.query = '';
    byId('publication-search').value = '';
    byId('year-filter').value = 'all';
    document.querySelectorAll('[data-type]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.type === 'all'));
    });
    renderPapers();
    byId('publication-search').focus();
  }

  function initializeFilters() {
    byId('publication-search').addEventListener('input', (event) => {
      state.query = cleanText(event.target.value, 120);
      renderPapers();
    });
    byId('year-filter').addEventListener('change', (event) => {
      state.year = event.target.value;
      renderPapers();
    });
    document.querySelectorAll('[data-type]').forEach((button) => {
      button.addEventListener('click', () => {
        state.type = button.dataset.type;
        document.querySelectorAll('[data-type]').forEach((item) => {
          item.setAttribute('aria-pressed', String(item === button));
        });
        renderPapers();
      });
    });
    byId('clear-filters').addEventListener('click', clearFilters);
  }

  function initializeTheme() {
    const toggle = byId('theme-toggle');
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    let savedTheme = '';
    try { savedTheme = localStorage.getItem('ef-theme') || ''; } catch { /* Storage can be unavailable. */ }
    const preferred = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    const initial = ['light', 'dark'].includes(savedTheme) ? savedTheme : preferred;

    function applyTheme(theme) {
      document.documentElement.dataset.theme = theme;
      const dark = theme === 'dark';
      toggle.setAttribute('aria-pressed', String(dark));
      toggle.setAttribute('aria-label', `Switch to ${dark ? 'light' : 'dark'} theme`);
      themeMeta.setAttribute('content', dark ? '#0f172a' : '#f8fafc');
    }

    applyTheme(initial);
    toggle.addEventListener('click', () => {
      const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      try { localStorage.setItem('ef-theme', next); } catch { /* Theme still works for this visit. */ }
    });
  }

  function initializeMenu() {
    const header = byId('site-header');
    const toggle = byId('menu-toggle');
    const links = [...document.querySelectorAll('.nav-links a')];

    function closeMenu(returnFocus = false) {
      header.classList.remove('nav-open');
      document.body.classList.remove('menu-open');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-label', 'Open navigation');
      if (returnFocus) toggle.focus();
    }

    toggle.addEventListener('click', () => {
      const open = !header.classList.contains('nav-open');
      header.classList.toggle('nav-open', open);
      document.body.classList.toggle('menu-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
      if (open) links[0]?.focus();
    });
    links.forEach((link) => link.addEventListener('click', () => closeMenu()));
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && header.classList.contains('nav-open')) closeMenu(true);
    });
    document.addEventListener('click', (event) => {
      if (header.classList.contains('nav-open') && !header.contains(event.target)) closeMenu();
    });
    window.addEventListener('resize', () => {
      if (window.innerWidth >= 900) closeMenu();
    });
  }

  function initializeScrollFeatures() {
    const backToTop = byId('back-to-top');
    function updateBackToTop() { backToTop.hidden = window.scrollY < 650; }
    window.addEventListener('scroll', updateBackToTop, { passive: true });
    updateBackToTop();
    backToTop.addEventListener('click', () => window.scrollTo({
      top: 0,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
    }));

    if ('IntersectionObserver' in window) {
      const links = [...document.querySelectorAll('.nav-links a')];
      const sections = links.map((link) => document.querySelector(link.getAttribute('href'))).filter(Boolean);
      const observer = new IntersectionObserver((entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!visible) return;
        links.forEach((link) => {
          const active = link.getAttribute('href') === `#${visible.target.id}`;
          if (active) link.setAttribute('aria-current', 'true');
          else link.removeAttribute('aria-current');
        });
      }, { rootMargin: '-20% 0px -65% 0px', threshold: [0, 0.1, 0.5] });
      sections.forEach((section) => observer.observe(section));
    }
  }

  function initializeDialog() {
    const dialog = byId('content-guide');
    byId('content-guide-open').addEventListener('click', () => dialog.showModal());
    byId('content-guide-close').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', (event) => {
      const bounds = dialog.getBoundingClientRect();
      const inside = event.clientX >= bounds.left && event.clientX <= bounds.right && event.clientY >= bounds.top && event.clientY <= bounds.bottom;
      if (!inside) dialog.close();
    });
  }

  function initializeUtilities() {
    byId('current-year').textContent = String(new Date().getFullYear());
    byId('print-profile').addEventListener('click', () => window.print());
    byId('copy-email').addEventListener('click', (event) => {
      copyText(event.currentTarget.dataset.email, 'Email address copied to clipboard.');
    });
  }

  initializeTheme();
  initializeMenu();
  initializeFilters();
  initializeScrollFeatures();
  initializeDialog();
  initializeUtilities();
  loadNews();
  loadPapers();
})();
