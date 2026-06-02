/* =========================================================
   Quantum Vendor Tracker — App Logic
   ========================================================= */

const state = {
  vendors: [],
  i18n: {},
  lang: localStorage.getItem('qvt-lang') || 'en',
  theme: localStorage.getItem('qvt-theme') || 'dark',
  view: localStorage.getItem('qvt-view') || 'card',
  filters: { physics: new Set(), stack: new Set(), region: new Set() },
  search: '',
  sort: 'name',
  lastUpdated: '',
};

const PHYSICS_OPTIONS = ['superconducting','iontrap','photonic','neutralatom','topological','siliconspin','nvcenter','agnostic'];
const STACK_OPTIONS   = ['full','qubit','control','software','cloud'];
const REGION_OPTIONS  = ['usa','europe','asia','canada'];

/* ---------- Boot ---------- */
async function boot() {
  applyTheme();
  applyView();

  try {
    // Cache-bust by day so daily updates to vendors.json are picked up immediately,
    // but cache within the same day so repeat visits are fast.
    const day = new Date().toISOString().slice(0, 10);
    const [v, i] = await Promise.all([
      fetch(`vendors.json?d=${day}`).then(r => r.json()),
      fetch(`i18n.json?d=${day}`).then(r => r.json()),
    ]);
    state.vendors = v.vendors;
    state.lastUpdated = v.lastUpdated;
    state.i18n = i;
  } catch (e) {
    console.error('Failed to load data:', e);
    document.body.innerHTML = '<div style="padding:40px;text-align:center;color:#fff">Failed to load data. If you opened the file directly, please serve via a local web server (see README).</div>';
    return;
  }

  buildFilters();
  bindEvents();
  applyLanguage();
  render();
  loadRSS();
}

/* ---------- Filter UI ---------- */
function buildFilters() {
  const physBox = document.getElementById('filter-physics');
  const stackBox = document.getElementById('filter-stack');
  const regionBox = document.getElementById('filter-region');

  const countBy = (key, val) => state.vendors.filter(v => {
    if (key === 'stack') return v.stack.includes(val);
    return v[key] === val;
  }).length;

  const makeItem = (group, val) => {
    const id = `f-${group}-${val}`;
    const div = document.createElement('label');
    div.className = 'filter-item';
    div.innerHTML = `
      <input type="checkbox" id="${id}" data-group="${group}" data-val="${val}" />
      <span data-i18n="${group}_${val}">${val}</span>
      <span class="count">${countBy(group, val)}</span>
    `;
    div.querySelector('input').addEventListener('change', onFilterChange);
    return div;
  };

  PHYSICS_OPTIONS.forEach(p => physBox.appendChild(makeItem('physics', p)));
  STACK_OPTIONS.forEach(s => stackBox.appendChild(makeItem('stack', s)));
  REGION_OPTIONS.forEach(r => regionBox.appendChild(makeItem('region', r)));
}

function onFilterChange(e) {
  const { group, val } = e.target.dataset;
  if (e.target.checked) state.filters[group].add(val);
  else state.filters[group].delete(val);
  render();
}

/* ---------- Event binding ---------- */
function bindEvents() {
  document.getElementById('search').addEventListener('input', (e) => {
    state.search = e.target.value.toLowerCase().trim();
    render();
  });
  document.getElementById('sortSelect').addEventListener('change', (e) => {
    state.sort = e.target.value;
    render();
  });
  document.getElementById('clearFilters').addEventListener('click', () => {
    Object.keys(state.filters).forEach(k => state.filters[k].clear());
    document.querySelectorAll('.filter-item input').forEach(cb => cb.checked = false);
    render();
  });
  document.getElementById('viewCard').addEventListener('click', () => setView('card'));
  document.getElementById('viewTable').addEventListener('click', () => setView('table'));
  document.getElementById('langToggle').addEventListener('click', () => {
    state.lang = state.lang === 'en' ? 'zh' : 'en';
    localStorage.setItem('qvt-lang', state.lang);
    applyLanguage();
    render();
  });
  document.getElementById('themeToggle').addEventListener('click', () => {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('qvt-theme', state.theme);
    applyTheme();
  });

  // Table header sort
  document.querySelectorAll('.vendor-table th[data-sort]').forEach(th => {
    th.addEventListener('click', () => {
      state.sort = th.dataset.sort;
      document.getElementById('sortSelect').value = state.sort;
      render();
    });
  });
}

/* ---------- Filter & sort ---------- */
function getFiltered() {
  const { filters, search } = state;
  return state.vendors.filter(v => {
    if (filters.physics.size && !filters.physics.has(v.physics)) return false;
    if (filters.stack.size && !v.stack.some(s => filters.stack.has(s))) return false;
    if (filters.region.size && !filters.region.has(v.region)) return false;
    if (search) {
      const desc = (v.desc[state.lang] || '').toLowerCase();
      const milestone = (v.milestone[state.lang] || '').toLowerCase();
      const hay = [v.name, v.physics, v.hq, desc, milestone, ...v.stack].join(' ').toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  }).sort((a, b) => {
    if (state.sort === 'founded') return a.founded - b.founded;
    if (state.sort === 'physics') return a.physics.localeCompare(b.physics);
    return a.name.localeCompare(b.name);
  });
}

/* ---------- Render ---------- */
function render() {
  const list = getFiltered();
  document.getElementById('vendorCount').textContent = list.length;
  document.getElementById('vendorCountFoot').textContent = state.vendors.length;
  document.getElementById('lastUpdated').textContent = state.lastUpdated;

  const noResults = document.getElementById('noResults');
  if (list.length === 0) noResults.classList.remove('hidden');
  else noResults.classList.add('hidden');

  if (state.view === 'card') renderCards(list);
  else renderTable(list);
}

function chipForStack(stack) {
  const cls = `chip chip-${stack}`;
  const label = t(`stack_${stack}`);
  return `<span class="${cls}">${label}</span>`;
}

function renderCards(list) {
  const grid = document.getElementById('cardView');
  grid.innerHTML = list.map(v => `
    <article class="vendor-card" data-id="${v.id}">
      <div class="card-header">
        <h3 class="card-name">${v.name}</h3>
        <div>${v.stack.map(chipForStack).join('')}</div>
      </div>
      <div class="card-meta-row">
        <span class="chip chip-physics">${t('physics_' + v.physics)}</span>
        <span><b>${t('founded')}:</b> ${v.founded}</span>
        <span><b>${t('hq')}:</b> ${v.hq}</span>
      </div>
      <p class="card-desc">${v.desc[state.lang] || v.desc.en}</p>
      <div class="card-milestone"><b>${t('milestone')}:</b> ${v.milestone[state.lang] || v.milestone.en}</div>
      <div class="card-links">
        ${v.links.site ? `<a href="${v.links.site}" target="_blank" rel="noopener">🔗 ${t('website')}</a>` : ''}
        ${v.links.roadmap ? `<a href="${v.links.roadmap}" target="_blank" rel="noopener">🗺 ${t('roadmap')}</a>` : ''}
        <a href="https://news.google.com/search?q=${encodeURIComponent(v.newsQuery)}" target="_blank" rel="noopener">📰 ${t('latest')}</a>
      </div>
    </article>
  `).join('');
}

function renderTable(list) {
  const tbody = document.getElementById('tableBody');
  tbody.innerHTML = list.map(v => `
    <tr data-id="${v.id}">
      <td class="name">${v.name}</td>
      <td>${t('physics_' + v.physics)}</td>
      <td>${v.stack.map(chipForStack).join(' ')}</td>
      <td>${t('region_' + v.region)}</td>
      <td>${v.founded}</td>
      <td>${v.milestone[state.lang] || v.milestone.en}</td>
      <td><a href="https://news.google.com/search?q=${encodeURIComponent(v.newsQuery)}" target="_blank" rel="noopener">📰</a></td>
    </tr>
  `).join('');
}

/* ---------- View toggle ---------- */
function setView(v) {
  state.view = v;
  localStorage.setItem('qvt-view', v);
  applyView();
  render();
}
function applyView() {
  const card = document.getElementById('cardView');
  const table = document.getElementById('tableView');
  const cardBtn = document.getElementById('viewCard');
  const tableBtn = document.getElementById('viewTable');
  if (!card) return;
  if (state.view === 'card') {
    card.classList.remove('hidden');
    table.classList.add('hidden');
    cardBtn.classList.add('active');
    tableBtn.classList.remove('active');
  } else {
    card.classList.add('hidden');
    table.classList.remove('hidden');
    tableBtn.classList.add('active');
    cardBtn.classList.remove('active');
  }
}

/* ---------- Theme & i18n ---------- */
function applyTheme() {
  document.body.dataset.theme = state.theme;
  const btn = document.getElementById('themeToggle');
  if (btn) btn.textContent = state.theme === 'dark' ? '🌙' : '☀️';
}

function t(key) {
  const dict = state.i18n[state.lang] || {};
  return dict[key] || key;
}

function applyLanguage() {
  document.documentElement.lang = state.lang === 'zh' ? 'zh-Hant' : 'en';
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    const val = t(key);
    if (val) el.textContent = val;
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.dataset.i18nPlaceholder;
    const val = t(key);
    if (val) el.placeholder = val;
  });
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    const v = t(el.dataset.i18nTitle);
    if (v) el.title = v;
  });
  const langLabel = document.getElementById('langLabel');
  if (langLabel) langLabel.textContent = state.lang === 'en' ? '中文' : 'EN';
}

/* ---------- RSS (Google News aggregate) ---------- */
async function loadRSS() {
  const box = document.getElementById('rssFeed');
  // Aggregate query across all vendors — pull top headlines via rss2json proxy
  const query = '("quantum computing" OR "quantum computer" OR qubit)';
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
  // Note: `count` param requires an rss2json API key; we omit it and slice client-side.
  const api = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(url)}`;

  try {
    const res = await fetch(api);
    const data = await res.json();
    if (!data.items || !data.items.length) {
      box.innerHTML = `<p class="rss-error">${t('noNews')}</p>`;
      return;
    }
    box.innerHTML = data.items.slice(0, 8).map(item => {
      const date = new Date(item.pubDate).toLocaleDateString();
      const src = item.author || (item.source && item.source.name) || '';
      return `
        <a class="rss-item" href="${item.link}" target="_blank" rel="noopener">
          ${item.title}
          <span class="src">${date}${src ? ' · ' + src : ''}</span>
        </a>
      `;
    }).join('');
  } catch (e) {
    console.warn('RSS load failed:', e);
    box.innerHTML = `<p class="rss-error">${t('newsError')}</p>`;
  }
}

/* ---------- Go ---------- */
document.addEventListener('DOMContentLoaded', boot);
