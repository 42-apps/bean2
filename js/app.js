/* app.js — bean2 */
(function () {
  const VERSION = '0.1.2';
  const PLACES = window.BEAN2_PLACES || [];
  const BY_ID = Object.fromEntries(PLACES.map(p => [p.id, p]));
  const TOTAL = PLACES.length;
  const UN_TOTAL = PLACES.filter(p => p.status === 'un').length;
  const S = window.Bean2Store;
  const M = window.Bean2Maps;
  const el = id => document.getElementById(id);
  const $ = (sel, root) => (root || document).querySelector(sel);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const YEAR_NOW = new Date().getFullYear();

  const REGION_ORDER = ['Europe', 'Asia', 'Africa', 'North America', 'South America', 'Oceania', 'Antarctica'];
  const STATUS_LABEL = { un: 'UN member state', observer: 'UN observer state', disputed: 'Disputed / partly recognised', territory: 'Territory' };

  /* guest mode: someone else's map, loaded from the link */
  let guest = null;                       // { places, name }
  const live = () => (guest ? guest.places : S.all());
  const colourOf = id => { const p = live()[id]; return p ? p.s : ''; };

  let ui = { tab: 'places', filter: 'all', group: 'region', selected: null, q: '' };


  /* ─────────────────────────── link handling ─────────────────────────── */
  function readLink() {
    const m = /[#&?]b=([A-Za-z0-9\-_]+)/.exec(location.hash + location.search);
    if (!m) return;
    const got = S.decode(m[1]);
    if (!got) { toast('That share link looks broken.'); return; }
    guest = got;
    showGuestBar();
  }

  function showGuestBar() {
    if (el('guest')) return;
    const n = Object.values(guest.places).filter(p => p.s === 'been').length;
    const who = guest.name ? esc(guest.name) + '’s' : 'Someone’s';
    const bar = document.createElement('div');
    bar.id = 'guest';
    bar.innerHTML = `<span>👀 You’re looking at <b>${who} bean2</b> — ${n} place${n === 1 ? '' : 's'}.</span>
      <span class="g-sp"></span>
      <button id="gMerge">Add to mine</button>
      <button class="go" id="gMine">My map</button>`;
    document.body.insertBefore(bar, el('main'));
    el('main').style.height = 'calc(100% - 58px - ' + bar.offsetHeight + 'px)';
    $('#gMerge').addEventListener('click', () => {
      const added = S.merge(guest.places);
      leaveGuest();
      toast(added ? `Added ${added} new place${added === 1 ? '' : 's'} to your map.` : 'You’d already been everywhere on that map.');
    });
    $('#gMine').addEventListener('click', () => { leaveGuest(); toast('Back to your own map.'); });
  }
  function leaveGuest() {
    guest = null;
    const bar = el('guest');
    if (bar) { bar.remove(); el('main').style.height = ''; }
    history.replaceState(null, '', location.pathname);
    renderAll(); M.paint();
  }

  /* ─────────────────────────── counting ─────────────────────────── */
  function counts() {
    const d = live();
    let been = 0, want = 0, un = 0, terr = 0, disp = 0, pop = 0, area = 0;
    const regions = {}, years = {};
    for (const p of PLACES) {
      const rec = d[p.id];
      const r = regions[p.region] || (regions[p.region] = { been: 0, want: 0, total: 0 });
      r.total++;
      if (!rec) continue;
      if (rec.s === 'want') { want++; r.want++; continue; }
      if (rec.s !== 'been') continue;
      been++; r.been++; pop += p.pop || 0; area += p.area || 0;
      if (p.status === 'un') un++;
      else if (p.status === 'disputed') disp++;
      else terr++;
      if (rec.y) (years[rec.y] || (years[rec.y] = [])).push(p);
    }
    return { been, want, un, terr, disp, pop, area, regions, years,
             left: TOTAL - been, pct: TOTAL ? been / TOTAL * 100 : 0 };
  }
  const WORLD_POP = PLACES.reduce((a, p) => a + (p.pop || 0), 0);
  const WORLD_AREA = PLACES.reduce((a, p) => a + (p.area || 0), 0);

  const RANKS = [
    [0, 'Pack your bags'], [1, 'First stamp in the passport'], [3, 'Finding your feet'],
    [6, 'Weekend wanderer'], [11, 'Getting the hang of this'], [21, 'Seasoned traveller'],
    [36, 'Frequent flyer'], [51, 'A quarter of the world'], [76, 'Serious explorer'],
    [101, 'Century club'], [131, 'Half the planet'], [171, 'Hard to impress'],
    [201, 'Running out of world'], [241, 'Nearly everywhere'], [257, 'Everywhere.'],
  ];
  const rankFor = n => { let r = RANKS[0][1]; for (const [at, label] of RANKS) if (n >= at) r = label; return r; };

  /* ─────────────────────────── scoreboard ─────────────────────────── */
  function renderScore() {
    const c = counts();
    const C = 2 * Math.PI * 52;
    el('ringBeen').setAttribute('stroke-dasharray', `${(C * c.been / TOTAL).toFixed(1)} ${C}`);
    el('ringWant').setAttribute('stroke-dasharray', `${(C * (c.been + c.want) / TOTAL).toFixed(1)} ${C}`);
    const pct = c.pct;
    el('pctBig').innerHTML = (pct >= 10 ? Math.round(pct) : pct.toFixed(1).replace(/\.0$/, '')) + '<small>%</small>';
    el('nBeen').textContent = c.been;
    el('nWant').textContent = c.want;
    el('nLeft').textContent = c.left;
    el('ptCount').textContent = c.been;
    el('rank').textContent = guest ? (guest.name ? guest.name + '’s map' : 'A shared map') : rankFor(c.been);
    el('pctSub').textContent = `${c.been} of ${TOTAL}`;
  }

  /* ─────────────────────────── the list ─────────────────────────── */
  function visible() {
    const d = live();
    const q = ui.q.trim().toLowerCase();
    return PLACES.filter(p => {
      const rec = d[p.id];
      if (ui.filter === 'been' && (!rec || rec.s !== 'been')) return false;
      if (ui.filter === 'want' && (!rec || rec.s !== 'want')) return false;
      if (ui.filter === 'todo' && rec) return false;
      if (q && !matches(p, q)) return false;
      return true;
    });
  }
  const matches = (p, q) => p.name.toLowerCase().includes(q) || p.id.toLowerCase() === q ||
    (p.sov || '').toLowerCase().includes(q) || (p.sub || '').toLowerCase().includes(q) || p.region.toLowerCase().includes(q);

  function renderList() {
    const d = live();
    const rows = visible();
    const box = el('list');
    if (!rows.length) {
      box.innerHTML = `<div class="empty">Nothing here yet.<br>${ui.filter === 'been' ? 'Tap a country on the map to add your first one.' : 'Try another filter.'}</div>`;
      return;
    }
    const groups = new Map();
    for (const p of rows) {
      const key = ui.group === 'region' ? p.region
        : ui.group === 'status' ? STATUS_LABEL[p.status]
        : 'All places';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(p);
    }
    const order = ui.group === 'region'
      ? REGION_ORDER.filter(r => groups.has(r))
      : [...groups.keys()];
    let html = '';
    for (const key of order) {
      const list = groups.get(key).slice().sort((a, b) => a.name.localeCompare(b.name));
      const been = list.filter(p => d[p.id] && d[p.id].s === 'been').length;
      const all = PLACES.filter(p => (ui.group === 'region' ? p.region : STATUS_LABEL[p.status]) === key).length;
      html += `<div class="grp"><b>${esc(key)}</b><span class="bar"><i style="width:${(been / all * 100).toFixed(1)}%"></i></span><span>${been}/${all}</span></div>`;
      for (const p of list) html += rowHTML(p, d[p.id]);
    }
    box.innerHTML = html;
  }

  function rowHTML(p, rec) {
    const s = rec ? rec.s : '';
    const tag = p.status === 'un' ? '' : `<span class="tag">${p.status === 'territory' ? (p.sov ? esc(shortSov(p.sov)) : 'terr.') : p.status === 'observer' ? 'observer' : 'disputed'}</span>`;
    return `<div class="row ${s === 'been' ? 'is-been' : ''} ${ui.selected === p.id ? 'sel' : ''}" data-id="${p.id}" role="button" tabindex="0" aria-label="${esc(p.name)}${s === 'been' ? ', been there' : s === 'want' ? ', want to go' : ''}">
      <span class="fl">${p.flag || '🏳️'}</span>
      <span class="nm">${esc(p.name)}</span>
      ${rec && rec.y ? `<span class="yr">${rec.y}</span>` : ''}${tag}
      <button class="mk been ${s === 'been' ? 'on' : ''}" data-mark="been" title="Been there">✓</button>
      <button class="mk want ${s === 'want' ? 'on' : ''}" data-mark="want" title="Want to go">★</button>
    </div>`;
  }
  const shortSov = s => s.replace('United Kingdom', 'UK').replace('United States of America', 'US').replace('United States', 'US').replace('New Zealand', 'NZ').replace('Netherlands', 'NL');

  /* ─────────────────────────── detail card ─────────────────────────── */
  function openDetail(id, ev) {
    const p = BY_ID[id]; if (!p) return;
    ui.selected = id;
    const rec = live()[id] || {};
    const card = el('detail');
    const num = n => n >= 1e9 ? (n / 1e9).toFixed(1) + 'bn' : n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? Math.round(n / 1e3) + 'k' : String(n);
    const facts = [
      STATUS_LABEL[p.status] + (p.sov ? ' of ' + esc(p.sov) : ''),
      esc(p.sub || p.region),
      p.pop ? num(p.pop) + ' people' : null,
      p.area ? p.area.toLocaleString('en') + ' km²' : null,
    ].filter(Boolean);

    card.innerHTML = `
      <div class="d-top">
        <span class="d-fl">${p.flag || '🏳️'}</span>
        <span class="d-nm"><b>${esc(p.name)}</b><span>${esc(p.region)}</span></span>
        <button class="d-x" id="dX" aria-label="Close">×</button>
      </div>
      <div class="d-facts">${facts.map(f => `<span class="fact">${f}</span>`).join('')}</div>
      ${p.note ? `<p class="d-note">${esc(p.note)}</p>` : ''}
      ${guest ? `<p class="d-note">On this shared map: <b style="color:${rec.s === 'been' ? 'var(--been)' : rec.s === 'want' ? 'var(--want)' : 'var(--dim)'}">${rec.s === 'been' ? 'been here' + (rec.y ? ' in ' + rec.y : '') : rec.s === 'want' ? 'wants to go' : 'not yet'}</b>.</p>`
      : `<div class="d-acts">
        <button class="act been ${rec.s === 'been' ? 'on' : ''}" data-act="been">✓ Been there</button>
        <button class="act want ${rec.s === 'want' ? 'on' : ''}" data-act="want">★ Want to go</button>
      </div>
      <div class="d-year ${rec.s === 'been' ? '' : 'hidden'}" id="dYear">
        <label for="yearSel">First visit</label>
        <button class="ystep" data-step="-1" aria-label="Earlier">−</button>
        <select id="yearSel">${yearOptions(rec.y)}</select>
        <button class="ystep" data-step="1" aria-label="Later">+</button>
      </div>`}`;

    card.classList.remove('hidden');
    document.body.classList.add('card-open');
    placeCard(card, ev);

    $('#dX', card).addEventListener('click', closeDetail);
    card.querySelectorAll('.act').forEach(b => b.addEventListener('click', () => {
      const want = b.dataset.act;
      S.toggle(id, want);
      openDetail(id, ev); renderAll(); M.paint();
    }));
    const sel = $('#yearSel', card);
    if (sel) {
      sel.addEventListener('change', () => { S.setYear(id, sel.value ? +sel.value : null); renderAll(); M.paint(); });
      card.querySelectorAll('.ystep').forEach(b => b.addEventListener('click', () => {
        const cur = +sel.value || YEAR_NOW;
        const next = Math.max(1900, Math.min(YEAR_NOW, cur + (+b.dataset.step)));
        sel.value = String(next); S.setYear(id, next); renderAll(); M.paint();
      }));
    }
    M.highlight(id);
    renderList();
  }
  function yearOptions(y) {
    let html = `<option value="">— add a year —</option>`;
    for (let i = YEAR_NOW; i >= 1940; i--) html += `<option value="${i}"${y === i ? ' selected' : ''}>${i}</option>`;
    for (let i = 1930; i >= 1900; i -= 10) html += `<option value="${i}"${y === i ? ' selected' : ''}>${i}s</option>`;
    return html;
  }
  // The card is absolutely positioned against the document, and the document
  // never scrolls, so viewport coordinates can be used as they are — just
  // kept inside the map area.
  function placeCard(card, ev) {
    if (window.matchMedia('(max-width:760px)').matches) return;   // CSS pins it
    const stage = el('stage').getBoundingClientRect();
    const pos = M.screenPos(ui.selected, ev);
    const w = card.offsetWidth || 340, h = card.offsetHeight || 220;
    let x = pos.x + 18;
    if (x + w > stage.right - 12) x = pos.x - w - 18;
    card.style.left = Math.round(Math.max(stage.left + 12, Math.min(stage.right - w - 12, x))) + 'px';
    card.style.top = Math.round(Math.max(stage.top + 12, Math.min(stage.bottom - h - 12, pos.y - h / 2))) + 'px';
  }
  function closeDetail() {
    el('detail').classList.add('hidden');
    document.body.classList.remove('card-open');
    ui.selected = null; M.highlight(null); renderList();
  }

  /* ─────────────────────────── timeline ─────────────────────────── */
  function renderTimeline() {
    const c = counts();
    const box = el('tabTimeline');
    const years = Object.keys(c.years).map(Number).sort((a, b) => b - a);
    const dated = years.reduce((a, y) => a + c.years[y].length, 0);
    const undated = c.been - dated;
    if (!c.been) {
      box.innerHTML = `<div class="empty">No trips yet.<br>Mark somewhere as <b style="color:var(--been)">been</b> and add the year you first went — the story builds itself.</div>`;
      return;
    }
    if (!years.length) {
      box.innerHTML = `<div class="empty">You’ve been to ${c.been} place${c.been === 1 ? '' : 's'}, but no years yet.<br>Open any of them and pick a year to start a timeline.</div>`;
      return;
    }
    const span = years.length > 1 ? `${years[years.length - 1]}–${years[0]}` : String(years[0]);
    let html = `<div class="tl">
      <div class="st-card" style="margin-bottom:14px">
        <div class="st-grid">
          <div class="st-num"><b>${dated}</b><span>trips dated</span></div>
          <div class="st-num"><b>${span}</b><span>your travelling years</span></div>
        </div>
      </div>`;
    for (const y of years) {
      const list = c.years[y].slice().sort((a, b) => a.name.localeCompare(b.name));
      html += `<div class="tl-yr">
        <div class="tl-rail"><b>${y}</b><span>${list.length} new</span></div>
        <div class="tl-line"></div>
        <div class="tl-items">${list.map(p => `<button class="tl-chip" data-id="${p.id}">${p.flag || '🏳️'} ${esc(p.name)}</button>`).join('')}</div>
      </div>`;
    }
    if (undated) {
      const list = PLACES.filter(p => { const r = live()[p.id]; return r && r.s === 'been' && !r.y; });
      html += `<div class="tl-yr">
        <div class="tl-rail"><b>—</b><span>${undated} undated</span></div>
        <div class="tl-line"></div>
        <div class="tl-items">${list.map(p => `<button class="tl-chip plain" data-id="${p.id}">${p.flag || '🏳️'} ${esc(p.name)}</button>`).join('')}</div>
      </div>`;
    }
    box.innerHTML = html + '</div>';
    box.querySelectorAll('.tl-chip').forEach(b => b.addEventListener('click', () => select(b.dataset.id)));
  }

  /* ─────────────────────────── stats ─────────────────────────── */
  function renderStats() {
    const c = counts();
    const pct = (a, b) => b ? (a / b * 100) : 0;
    const fmtPct = v => v >= 10 ? Math.round(v) + '%' : v.toFixed(1).replace(/\.0$/, '') + '%';
    const regions = REGION_ORDER.filter(r => c.regions[r]);
    const conts = regions.filter(r => c.regions[r].been > 0).length;
    const best = regions.slice().sort((a, b) => pct(c.regions[b].been, c.regions[b].total) - pct(c.regions[a].been, c.regions[a].total))[0];

    el('tabStats').innerHTML = `<div class="st">
      <div class="st-card">
        <h4>The count</h4>
        <div class="st-grid">
          <div class="st-num"><b style="color:var(--been)">${c.been}<span style="font-size:13px;color:var(--dimmer);font-weight:600"> / ${TOTAL}</span></b><span>places, everything included</span></div>
          <div class="st-num"><b>${c.un}<span style="font-size:13px;color:var(--dimmer);font-weight:600"> / ${UN_TOTAL}</span></b><span>UN member states</span></div>
          <div class="st-num"><b>${c.terr}</b><span>territories</span></div>
          <div class="st-num"><b>${c.disp}</b><span>disputed places</span></div>
        </div>
      </div>

      <div class="st-card">
        <h4>Continents — ${conts} of ${regions.length}</h4>
        ${regions.map(r => {
          const g = c.regions[r];
          return `<div class="st-row"><span class="lab">${esc(r)}</span>
            <span class="bar"><i style="width:${pct(g.been, g.total).toFixed(1)}%"></i><i class="w" style="width:${pct(g.want, g.total).toFixed(1)}%"></i></span>
            <span class="val">${g.been}/${g.total}</span></div>`;
        }).join('')}
      </div>

      <div class="st-card">
        <h4>How much world is that?</h4>
        <div class="st-grid">
          <div class="st-num"><b>${fmtPct(pct(c.pop, WORLD_POP))}</b><span>of everyone alive</span></div>
          <div class="st-num"><b>${fmtPct(pct(c.area, WORLD_AREA))}</b><span>of the land</span></div>
        </div>
        <p class="st-note" style="margin-top:11px">You’ve set foot in countries home to about ${(c.pop / 1e9).toFixed(2)} billion people and ${Math.round(c.area).toLocaleString('en')} km² of land${best && c.regions[best].been ? `. ${esc(best)} is your strongest suit.` : '.'}</p>
      </div>

      ${c.want ? `<div class="st-card">
        <h4>On the wishlist</h4>
        <p class="st-note">${PLACES.filter(p => { const r = live()[p.id]; return r && r.s === 'want'; }).slice(0, 40).map(p => (p.flag || '') + ' ' + esc(p.name)).join(' · ')}</p>
      </div>` : ''}
    </div>`;
  }

  /* ─────────────────────────── render + events ─────────────────────────── */
  function renderAll() {
    renderScore();
    if (ui.tab === 'places') renderList();
    else if (ui.tab === 'timeline') renderTimeline();
    else renderStats();
  }

  function select(id, ev) {
    openDetail(id, ev);
    M.focus(id);
  }

  function onMapClick(id, ev) { if (id) openDetail(id, ev); }
  function onMapHover(id, ev) {
    if (matchMedia('(hover:none)').matches) return;   // a tap isn't a hover
    const tt = el('tooltip');
    if (!id) { tt.classList.add('hidden'); document.body.style.cursor = ''; return; }
    const p = BY_ID[id]; if (!p) return;
    const rec = live()[id];
    tt.innerHTML = `${p.flag || '🏳️'} ${esc(p.name)}<span class="tt-s">${rec ? (rec.s === 'been' ? '✓ been' + (rec.y ? ' · ' + rec.y : '') : '★ want to go') : 'not yet'}</span>`;
    tt.classList.remove('hidden');
    const e = ev || {};
    tt.style.left = (e.clientX || window.innerWidth / 2) + 'px';
    tt.style.top = (e.clientY || 100) + 'px';
    document.body.style.cursor = 'pointer';
    el('stageHint').classList.add('gone');
  }

  function wire() {
    /* list clicks */
    el('list').addEventListener('click', e => {
      const row = e.target.closest('.row'); if (!row) return;
      const id = row.dataset.id;
      const mark = e.target.closest('.mk');
      if (mark) {
        if (guest) { toast('This is a shared map — add it to yours first.'); return; }
        S.toggle(id, mark.dataset.mark);
        renderAll(); M.paint();
        if (ui.selected === id) openDetail(id);
        return;
      }
      select(id);
    });

    el('list').addEventListener('keydown', e => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const row = e.target.closest('.row');
      if (!row || e.target.closest('.mk')) return;
      e.preventDefault();
      select(row.dataset.id);
    });

    /* tabs */
    document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => {
      ui.tab = t.dataset.tab;
      document.querySelectorAll('.tab').forEach(x => x.classList.toggle('on', x === t));
      el('tabPlaces').classList.toggle('hidden', ui.tab !== 'places');
      el('tabTimeline').classList.toggle('hidden', ui.tab !== 'timeline');
      el('tabStats').classList.toggle('hidden', ui.tab !== 'stats');
      renderAll();
    }));

    /* filters + grouping */
    document.querySelectorAll('.chip[data-filter]').forEach(c => c.addEventListener('click', () => {
      ui.filter = c.dataset.filter;
      document.querySelectorAll('.chip[data-filter]').forEach(x => x.classList.toggle('on', x === c));
      renderList();
    }));
    el('sortBtn').addEventListener('click', () => {
      ui.group = ui.group === 'region' ? 'status' : ui.group === 'status' ? 'none' : 'region';
      el('sortBtn').textContent = ui.group === 'region' ? 'By region' : ui.group === 'status' ? 'By kind' : 'A–Z';
      renderList();
    });

    /* view toggle */
    el('viewGlobe').addEventListener('click', () => setView('globe'));
    el('viewFlat').addEventListener('click', () => setView('flat'));
    function setView(v) {
      M.setMode(v);
      el('viewGlobe').classList.toggle('on', v === 'globe');
      el('viewFlat').classList.toggle('on', v === 'flat');
      el('viewGlobe').setAttribute('aria-pressed', v === 'globe');
      el('viewFlat').setAttribute('aria-pressed', v === 'flat');
      try { localStorage.setItem('bean2.view', v); } catch (e) {}
    }
    // The globe is the default everywhere — it suits a phone's tall screen,
    // where a Robinson world map can only ever be a thin strip.
    try { if (localStorage.getItem('bean2.view') === 'flat') setView('flat'); } catch (e) {}

    /* search */
    const search = el('search'), results = el('searchResults');
    search.placeholder = `Search ${TOTAL} places…`;
    let cur = -1;
    const closeResults = () => { results.classList.add('hidden'); cur = -1; };
    search.addEventListener('input', () => {
      ui.q = search.value;
      renderList();
      const q = ui.q.trim().toLowerCase();
      if (!q) { closeResults(); return; }
      const hits = PLACES.filter(p => matches(p, q)).slice(0, 12);
      if (!hits.length) { results.innerHTML = `<div class="empty" style="padding:14px">Nothing matches “${esc(ui.q)}”.</div>`; results.classList.remove('hidden'); return; }
      const d = live();
      results.innerHTML = hits.map(p => `<button class="sr" data-id="${p.id}">
        <span class="fl">${p.flag || '🏳️'}</span>
        <span class="nm">${esc(p.name)}<br><span class="rg">${esc(p.sub || p.region)}</span></span>
        <span class="dot ${d[p.id] ? d[p.id].s : ''}"></span></button>`).join('');
      results.classList.remove('hidden');
      cur = -1;
    });
    results.addEventListener('click', e => {
      const b = e.target.closest('.sr'); if (!b) return;
      select(b.dataset.id); closeResults(); search.blur();
    });
    search.addEventListener('keydown', e => {
      const items = [...results.querySelectorAll('.sr')];
      if (e.key === 'Escape') { search.value = ''; ui.q = ''; closeResults(); renderList(); return; }
      if (!items.length) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        cur = (cur + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length;
        items.forEach((n, i) => n.classList.toggle('cur', i === cur));
        items[cur].scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const pick = items[cur < 0 ? 0 : cur];
        if (pick) { select(pick.dataset.id); closeResults(); search.blur(); }
      }
    });
    document.addEventListener('click', e => { if (!el('searchWrap').contains(e.target)) closeResults(); });

    /* menu */
    const menu = el('menu');
    el('menuBtn').addEventListener('click', e => { e.stopPropagation(); menu.classList.toggle('hidden'); });
    document.addEventListener('click', e => { if (!menu.contains(e.target) && e.target !== el('menuBtn')) menu.classList.add('hidden'); });
    menu.addEventListener('click', e => {
      const b = e.target.closest('.mi'); if (!b) return;
      menu.classList.add('hidden');
      ({ about: showAbout, help: showHelp, export: doExport, import: doImport, reset: doReset }[b.dataset.act] || (() => {}))();
    });

    el('shareBtn').addEventListener('click', showShare);

    /* mobile drawer */
    el('panelToggle').addEventListener('click', () => el('panel').classList.toggle('open'));

    /* keyboard */
    document.addEventListener('keydown', e => {
      if (e.target.matches('input,select,textarea')) return;
      if (e.key === 'Escape') { closeDetail(); el('modal').classList.add('hidden'); }
      if (e.key === '/') { e.preventDefault(); search.focus(); }
      if (e.key === 'g') el('viewGlobe').click();
      if (e.key === 'm') el('viewFlat').click();
      if (e.key === 'r') M.reset();
      if (ui.selected && !guest) {
        if (e.key === 'b') { S.toggle(ui.selected, 'been'); openDetail(ui.selected); renderAll(); M.paint(); }
        if (e.key === 'w') { S.toggle(ui.selected, 'want'); openDetail(ui.selected); renderAll(); M.paint(); }
      }
    });

    /* click on empty map closes the card */
    el('stage').addEventListener('click', e => {
      if (e.target.closest('#detail') || e.target.closest('.flat-hit') || e.target.closest('.gdot')) return;
      if (e.target.id === 'flatViz' || e.target.tagName === 'CANVAS') closeDetail();
    });

    el('modalX').addEventListener('click', () => el('modal').classList.add('hidden'));
    el('modal').addEventListener('click', e => { if (e.target === el('modal')) el('modal').classList.add('hidden'); });
  }

  /* ─────────────────────────── modals ─────────────────────────── */
  function modal(html) {
    el('modalBody').innerHTML = html;
    el('modal').classList.remove('hidden');
  }

  function showShare() {
    const src = guest ? guest.places : S.all();
    const n = Object.values(src).filter(p => p.s === 'been').length;
    const who = guest ? guest.name : S.name();
    const code = S.encode(src, who);
    const url = location.origin + location.pathname + '#b=' + code;
    modal(`<h2>Share your bean2</h2>
      <p>This link carries your whole map inside it. It never touches a server — the part after the <code>#</code> stays in the browser — so anyone with the link can see your map, and nobody else can.</p>
      <div class="share-pv"><span class="pv-n">${n}</span><span class="pv-t">place${n === 1 ? '' : 's'} visited${who ? ', shared as <b>' + esc(who) + '</b>' : ''}<br><span style="color:var(--dimmer)">${url.length} characters — fits in a message</span></span></div>
      <div class="namebox"><input id="shareName" type="text" placeholder="Your name (optional)" value="${esc(who || '')}" maxlength="40"><button class="btn" id="nameSave">Save</button></div>
      <div class="sharebox"><input id="shareUrl" readonly value="${esc(url)}"><button class="btn primary" id="copyUrl">Copy</button></div>
      <p style="font-size:12px;color:var(--dimmer);margin-top:14px">Whoever opens it sees your map with an <b>Add to mine</b> button — their own map stays untouched until they press it.</p>`);
    $('#copyUrl').addEventListener('click', () => {
      const input = $('#shareUrl');
      navigator.clipboard.writeText(input.value).then(() => toast('Link copied.'), () => { input.select(); toast('Press ⌘C / Ctrl+C to copy.'); });
    });
    $('#nameSave').addEventListener('click', () => { S.name($('#shareName').value); showShare(); toast('Saved.'); });
  }

  function showAbout() {
    const c = counts();
    modal(`<h2>About bean2</h2>
      <p><b>bean2</b> is a map of everywhere you've been. Tick a country green when you've been there, purple when you want to go. That's the whole idea.</p>
      <h3>What counts as a place</h3>
      <p>${TOTAL} of them, and the rule is:</p>
      <ul>
        <li>the <b>${UN_TOTAL} UN member states</b>;</li>
        <li>the UN observer states — the Vatican, and Palestine as <b>Gaza</b> and the <b>West Bank</b> separately, because travellers reach them separately;</li>
        <li>every other territory with an ISO country code — Greenland, Hong Kong, Puerto Rico, Réunion, Svalbard, Tokelau and the rest;</li>
        <li>places that run themselves without a seat at the UN: Taiwan, Kosovo, Western Sahara, Somaliland, Northern Cyprus, Abkhazia, South Ossetia, Transnistria;</li>
        <li>and <b>Tibet</b>, which travellers have always counted on its own.</li>
      </ul>
      <p>Uninhabited rocks, buffer zones and military leases are left out. Borders come from Natural Earth and are drawn as that dataset has them — a map this size can't settle an argument, and isn't trying to.</p>
      <h3>Where your data lives</h3>
      <p>In this browser, in <code>localStorage</code>, and nowhere else. No account, no server, no analytics. Clear your browser data and it's gone — so <b>export a backup</b> from the menu if you've filled a lot in. A share link carries a copy inside the link itself.</p>
      <h3>Credits</h3>
      <p>Borders: <a href="https://www.naturalearthdata.com/" target="_blank" rel="noopener">Natural Earth</a> (public domain). Globe: <a href="https://globe.gl" target="_blank" rel="noopener">globe.gl</a>. Populations are World Bank estimates via Natural Earth, so they're a few years old — they're here for the "how much of the world" number, not for quoting.</p>
      <p style="color:var(--dimmer);font-size:12px">You've been to ${c.been} of ${TOTAL}. ${c.been ? 'Keep going.' : 'Better start.'}<br>bean2 v${VERSION} · <a href="https://github.com/42-apps" target="_blank" rel="noopener">42-apps</a></p>`);
  }

  function showHelp() {
    modal(`<h2>How to use it</h2>
      <ul>
        <li><b>Click a country</b> — on the globe, on the flat map, or in the list — then mark it <b>Been there</b> or <b>Want to go</b>.</li>
        <li><b>Add a year</b> when you first went. Years build the <b>Timeline</b> tab. A year is optional; the count works without one.</li>
        <li>Tiny places (Monaco, Nauru, Tokelau…) are drawn as <b>dots</b> so you can still hit them.</li>
        <li><b>Search</b> with <code>/</code>. Arrow keys and Enter pick a result.</li>
        <li>With a place open: <code>b</code> = been, <code>w</code> = want. <code>g</code> / <code>m</code> switch globe and map, <code>r</code> resets the view.</li>
        <li><b>Share</b> makes a link that carries your map. <b>Export</b> saves a backup file.</li>
      </ul>`);
  }

  function doExport() {
    const blob = new Blob([S.toJSON()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `bean2-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast('Backup saved.');
  }
  function doImport() {
    const input = el('fileIn');
    input.value = '';
    input.onchange = () => {
      const f = input.files[0]; if (!f) return;
      f.text().then(t => {
        const got = S.fromJSON(t);
        const added = S.merge(got.places);
        if (got.name && !S.name()) S.name(got.name);
        if (guest) leaveGuest(); else { renderAll(); M.paint(); }
        toast(added ? `Imported ${added} place${added === 1 ? '' : 's'}.` : 'Nothing new in that file.');
      }).catch(() => toast('That file isn’t a bean2 backup.'));
    };
    input.click();
  }
  function doReset() {
    const c = counts();
    modal(`<h2>Clear everything?</h2>
      <p>This wipes all ${c.been + c.want} marks from this browser. There's no undo, and no copy anywhere else.</p>
      <div class="d-acts" style="margin-top:18px">
        <button class="act" id="rNo">Keep my map</button>
        <button class="act" id="rYes" style="background:#a13a3a;border-color:transparent;color:#fff">Yes, clear it</button>
      </div>
      <p style="font-size:12px;color:var(--dimmer);margin-top:14px">Want a copy first? Close this and choose <b>Export my data</b>.</p>`);
    $('#rNo').addEventListener('click', () => el('modal').classList.add('hidden'));
    $('#rYes').addEventListener('click', () => {
      S.clear(); el('modal').classList.add('hidden'); closeDetail(); renderAll(); M.paint(); toast('Cleared.');
    });
  }

  let toastTimer = null;
  function toast(msg) {
    const t = el('toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.add('hidden'), 2600);
  }

  /* ─────────────────────────── boot ─────────────────────────── */
  S.load();
  readLink();

  fetch('data/world.json?v=1')
    .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(geoms => {
      M.init({
        geoms, places: PLACES, colourOf,
        on: { click: onMapClick, hover: onMapHover },
      });
      M.paint();
    })
    .catch(err => {
      el('mapMsg').classList.remove('hidden');
      el('mapMsg').innerHTML = 'The map data didn’t load.<br><small style="color:var(--dimmer)">' + esc(err.message) + ' — the list on the right still works.</small>';
    });

  renderAll();
  wire();

  /* a globe that spins on its own is exactly what "reduce motion" means */
  if (matchMedia('(prefers-reduced-motion:reduce)').matches) {
    const stop = setInterval(() => { if (window.globe) { window.globe.controls().autoRotate = false; clearInterval(stop); } }, 200);
    setTimeout(() => clearInterval(stop), 8000);
  }

  /* on a touch screen you tap, you don't click */
  if (matchMedia('(hover:none)').matches) {
    const h = el('stageHint'); if (h) h.textContent = 'Tap any country or territory';
  }

  /* a first-timer nudge */
  if (!guest && !Object.keys(S.all()).length) {
    setTimeout(() => { const h = el('stageHint'); if (h) h.textContent = 'Click a country to mark it — or search below'; }, 1200);
  }
})();
