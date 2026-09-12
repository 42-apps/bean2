/* maps.js — the two ways of looking at the world.
 *
 * Flat:  an SVG in the Robinson projection, pan/zoom by viewBox.
 * Globe: globe.gl, same geometry, same colours.
 *
 * Both share one contract: colourOf(id) -> 'been' | 'want' | '' and the
 * callbacks in `on`.  Places too small to hit at world scale (Monaco, Nauru,
 * Tokelau…) also get a dot drawn at their anchor point.
 */
window.Bean2Maps = (function () {

  /* ── Robinson ─────────────────────────────────────────────────
   * The published table of parallel lengths and spacings, one row per 5° of
   * latitude, smoothed between rows so coastlines don't kink. */
  const RT = [
    [1.0000, 0.0000], [0.9986, 0.0620], [0.9954, 0.1240], [0.9900, 0.1860],
    [0.9822, 0.2480], [0.9730, 0.3100], [0.9600, 0.3720], [0.9427, 0.4340],
    [0.9216, 0.4958], [0.8962, 0.5571], [0.8679, 0.6176], [0.8350, 0.6769],
    [0.7986, 0.7346], [0.7597, 0.7903], [0.7186, 0.8435], [0.6732, 0.8936],
    [0.6213, 0.9394], [0.5722, 0.9761], [0.5322, 1.0000],
  ];
  function rob(lat) {
    const a = Math.min(Math.abs(lat), 90) / 5;
    const i = Math.min(Math.floor(a), 17), t = a - i;
    const p0 = RT[Math.max(i - 1, 0)], p1 = RT[i], p2 = RT[i + 1], p3 = RT[Math.min(i + 2, 18)];
    const cr = (y0, y1, y2, y3) => y1 + 0.5 * t * ((y2 - y0) + t * ((2 * y0 - 5 * y1 + 4 * y2 - y3) + t * (3 * (y1 - y2) + y3 - y0)));
    return [cr(p0[0], p1[0], p2[0], p3[0]), cr(p0[1], p1[1], p2[1], p3[1]) * (lat < 0 ? -1 : 1)];
  }
  const FW = 2000, FH = Math.round(FW * (2 * 1.3523) / (2 * 0.8487 * Math.PI));   // 1014
  const KX = FW / (2 * 0.8487 * Math.PI), KY = FH / (2 * 1.3523);
  const px = (lng, lat) => FW / 2 + 0.8487 * KX * rob(lat)[0] * (lng * Math.PI / 180);
  const py = (lng, lat) => FH / 2 - 1.3523 * KY * rob(lat)[1];

  /* ── state ── */
  let geoms = {}, places = [], byId = {}, on = {}, colourOf = () => '';
  let mode = 'globe', globe = null, flatBuilt = false, hi = null;
  const nodes = {};                            // id -> { cell, dot } in the flat map
  const DOT_MAX = 12000;                       // km² — below this, add a dot

  const el = id => document.getElementById(id);
  const isTiny = p => p.area < DOT_MAX;

  /* ─────────────────────────── flat map ─────────────────────────── */
  function pathOf(id) {
    const g = geoms[id]; if (!g) return '';
    let d = '';
    for (const poly of g.coordinates) for (const ring of poly) {
      d += 'M' + ring.map(pt => px(pt[0], pt[1]).toFixed(1) + ',' + py(pt[0], pt[1]).toFixed(1)).join('L') + 'Z';
    }
    return d;
  }

  function graticule() {
    let d = '';
    for (let lng = -180; lng <= 180; lng += 30) {
      d += 'M' + [...Array(37)].map((_, i) => { const lat = -90 + i * 5; return px(lng, lat).toFixed(1) + ',' + py(lng, lat).toFixed(1); }).join('L');
    }
    for (let lat = -60; lat <= 80; lat += 30) {
      d += 'M' + [...Array(73)].map((_, i) => { const lng = -180 + i * 5; return px(lng, lat).toFixed(1) + ',' + py(lng, lat).toFixed(1); }).join('L');
    }
    // the frame
    let f = 'M';
    for (let lat = -90; lat <= 90; lat += 2) f += px(-180, lat).toFixed(1) + ',' + py(-180, lat).toFixed(1) + 'L';
    for (let lat = 90; lat >= -90; lat -= 2) f += px(180, lat).toFixed(1) + ',' + py(180, lat).toFixed(1) + 'L';
    return { lines: d, frame: f.slice(0, -1) + 'Z' };
  }

  function buildFlat() {
    if (flatBuilt || !places.length) return;   // geometry hasn't arrived yet
    const svg = el('flatViz');
    const g = graticule();
    let cells = '', dots = '', hits = '';
    for (const p of places) {
      const d = pathOf(p.id);
      if (!d) continue;
      cells += `<path class="flat-cell" data-id="${p.id}" vector-effect="non-scaling-stroke" d="${d}"/>`;
      hits += `<path class="flat-hit" data-id="${p.id}" d="${d}"/>`;
      if (isTiny(p)) {
        const x = px(p.lng, p.lat).toFixed(1), y = py(p.lng, p.lat).toFixed(1);
        dots += `<circle class="flat-dot" data-id="${p.id}" cx="${x}" cy="${y}" r="4"/>`
              + `<circle class="flat-hit" data-id="${p.id}" cx="${x}" cy="${y}" r="9"/>`;
      }
    }
    svg.setAttribute('viewBox', `0 0 ${FW} ${FH}`);
    svg.innerHTML =
      `<defs><clipPath id="frameClip"><path d="${g.frame}"/></clipPath></defs>` +
      `<path class="flat-ocean" d="${g.frame}"/>` +
      `<path class="flat-graticule" d="${g.lines}" clip-path="url(#frameClip)"/>` +
      `<g id="flatCells">${cells}</g><g id="flatDots">${dots}</g><g id="flatHits">${hits}</g>`;

    for (const p of places) {
      nodes[p.id] = {
        cell: svg.querySelector(`.flat-cell[data-id="${p.id}"]`),
        dot: svg.querySelector(`.flat-dot[data-id="${p.id}"]`),
      };
    }
    svg.querySelectorAll('.flat-hit').forEach(node => {
      const id = node.dataset.id;
      node.addEventListener('mousemove', e => { if (!dragging) on.hover && on.hover(id, e); });
      node.addEventListener('mouseleave', () => on.hover && on.hover(null));
      node.addEventListener('click', e => { if (panned) return; e.stopPropagation(); on.click && on.click(id, e); });
    });
    bindPan(svg);
    flatBuilt = true;
    paintFlat();
    fitView();
  }

  function paintFlat() {
    if (!flatBuilt) return;
    for (const p of places) {
      const n = nodes[p.id]; if (!n) continue;
      const c = colourOf(p.id);
      if (n.cell) { n.cell.classList.toggle('been', c === 'been'); n.cell.classList.toggle('want', c === 'want'); n.cell.classList.toggle('hi', hi === p.id); }
      if (n.dot) { n.dot.classList.toggle('been', c === 'been'); n.dot.classList.toggle('want', c === 'want'); }
    }
  }

  /* pan / zoom */
  const view = { x: 0, y: 0, w: FW, h: FH };
  let dragging = false, panned = false;
  // The viewBox is matched to the shape of the stage, so the map fills it
  // instead of sitting in a letterbox.
  function aspect() {
    const r = el('flatViz').getBoundingClientRect();
    return r.width && r.height ? r.width / r.height : FW / FH;
  }
  function clampView() {
    const a = aspect();
    view.w = Math.max(FW / 22, Math.min(FW * 1.15, view.w));
    view.h = view.w / a;
    const padX = Math.max(0, (view.w - FW) / 2) + FW * 0.03;
    const padY = Math.max(0, (view.h - FH) / 2) + FH * 0.03;
    view.x = Math.max(-padX, Math.min(FW + padX - view.w, view.x));
    view.y = Math.max(-padY, Math.min(FH + padY - view.h, view.y));
  }
  // Default framing: the whole world on a wide stage, a sensible crop on a
  // tall one — never a sliver of map floating in an empty panel.
  function fitView() {
    const a = aspect();
    view.w = Math.min(FW, Math.max(FW * 0.62, FH * a));
    view.h = view.w / a;
    view.x = (FW - view.w) / 2;
    view.y = (FH - view.h) / 2 - FH * 0.035;
    clampView(); applyView();
  }
  function applyView() {
    const svg = el('flatViz'); if (!svg) return;
    svg.setAttribute('viewBox', `${view.x.toFixed(1)} ${view.y.toFixed(1)} ${view.w.toFixed(1)} ${view.h.toFixed(1)}`);
    // Dots keep a constant size on screen; strokes do it themselves with
    // vector-effect, so nothing else has to be touched here.
    const k = view.w / FW;
    svg.querySelectorAll('.flat-dot').forEach(d => d.setAttribute('r', (4 * k).toFixed(2)));
    svg.querySelectorAll('circle.flat-hit').forEach(d => d.setAttribute('r', (9 * k).toFixed(2)));
  }
  function toSvg(cx, cy) {
    const svg = el('flatViz'), r = svg.getBoundingClientRect();
    const sc = Math.min(r.width / view.w, r.height / view.h);
    return { x: view.x + (cx - r.left - (r.width - view.w * sc) / 2) / sc,
             y: view.y + (cy - r.top - (r.height - view.h * sc) / 2) / sc };
  }
  let userMoved = false;
  function zoomAt(cx, cy, factor) {
    userMoved = true;
    const p = toSvg(cx, cy);
    const nw = Math.max(FW / 22, Math.min(FW, view.w * factor)), k = nw / view.w;
    view.x = p.x - (p.x - view.x) * k; view.y = p.y - (p.y - view.y) * k; view.w = nw;
    clampView(); applyView();
  }
  function bindPan(svg) {
    svg.addEventListener('wheel', e => { e.preventDefault(); zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 0.82 : 1 / 0.82); }, { passive: false });
    svg.addEventListener('pointerdown', e => {
      if (e.pointerType === 'touch' && touches.size) return;
      // No setPointerCapture here: it would retarget the click away from the
      // country path and every tap would land on the <svg> instead.
      dragging = true; panned = false; svg.style.cursor = 'grabbing';
      const r = svg.getBoundingClientRect(), sc = Math.min(r.width / view.w, r.height / view.h);
      const sx = e.clientX, sy = e.clientY, ox = view.x, oy = view.y;
      const move = ev => {
        if (Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) > 5) { panned = true; userMoved = true; on.hover && on.hover(null); }
        view.x = ox - (ev.clientX - sx) / sc; view.y = oy - (ev.clientY - sy) / sc; clampView(); applyView();
      };
      const up = () => { dragging = false; svg.style.cursor = ''; window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); setTimeout(() => { panned = false; }, 40); };
      window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
    });
    // pinch
    const touches = new Map();
    let pinch = 0;
    svg.addEventListener('touchstart', e => { if (e.touches.length === 2) { pinch = dist(e.touches); dragging = false; } }, { passive: true });
    svg.addEventListener('touchmove', e => {
      if (e.touches.length !== 2) return;
      e.preventDefault();
      const d = dist(e.touches);
      if (pinch) {
        const mx = (e.touches[0].clientX + e.touches[1].clientX) / 2, my = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        zoomAt(mx, my, pinch / d); panned = true;
      }
      pinch = d;
    }, { passive: false });
    svg.addEventListener('touchend', () => { pinch = 0; setTimeout(() => { panned = false; }, 60); });
    const dist = t => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  }

  function flyFlat(p, zoom) {
    userMoved = true;
    const z = zoom || Math.max(FW / 14, Math.min(FW / 2.2, Math.sqrt(Math.max(p.area, 900)) * 2.6));
    view.w = z; view.h = z / aspect();
    view.x = px(p.lng, p.lat) - view.w / 2; view.y = py(p.lng, p.lat) - view.h / 2;
    clampView(); applyView();
  }
  const resetFlat = () => { userMoved = false; fitView(); };

  /* ─────────────────────────── globe ─────────────────────────── */
  const FILL = { been: '#2ee6a0', want: '#b28cff', '': '#3a5078' };
  const capColor = f => {
    const c = colourOf(f.__id);
    if (hi === f.__id) return c === 'been' ? '#7ef7c8' : c === 'want' ? '#d0b6ff' : '#46608a';
    return FILL[c] || FILL[''];
  };
  const altOf = f => (f.__overlay ? 0.014 : 0.01) + (hi === f.__id ? 0.02 : 0);

  function features() {
    return places.filter(p => geoms[p.id]).map(p => ({
      type: 'Feature', __id: p.id, __overlay: !!p.overlay,
      properties: {}, geometry: geoms[p.id],
    }));
  }

  function initGlobe() {
    if (globe || !places.length || typeof Globe !== 'function') return;
    const host = el('globeViz');
    globe = Globe()(host)
      .backgroundColor('rgba(0,0,0,0)')
      .showAtmosphere(true).atmosphereColor('#6fe3c0').atmosphereAltitude(0.17)
      .polygonsData(features())
      .polygonCapColor(capColor)
      .polygonSideColor(() => 'rgba(9,18,32,.75)')
      .polygonStrokeColor(() => 'rgba(7,12,21,.9)')
      .polygonAltitude(altOf)
      .polygonsTransitionDuration(260)
      .onPolygonHover(f => on.hover && on.hover(f ? f.__id : null, lastMove))
      .onPolygonClick((f, e) => on.click && on.click(f.__id, e || lastMove))
      .htmlElementsData(places.filter(isTiny))
      .htmlLat(d => d.lat).htmlLng(d => d.lng).htmlAltitude(0.014)
      .htmlElement(d => {
        const n = document.createElement('div');
        n.className = 'gdot ' + (colourOf(d.id) || '');   // painted on creation too
        n.dataset.id = d.id;
        n.title = d.name;
        n.addEventListener('click', e => { e.stopPropagation(); on.click && on.click(d.id, e); });
        n.addEventListener('mousemove', e => on.hover && on.hover(d.id, e));
        n.addEventListener('mouseleave', () => on.hover && on.hover(null));
        return n;
      });

    const mat = globe.globeMaterial();
    mat.color.set('#0a1526'); mat.emissive.set('#050c17'); mat.emissiveIntensity = 0.9; mat.shininess = 4;
    const c = globe.controls();
    c.autoRotate = true; c.autoRotateSpeed = 0.4; c.enableDamping = true; c.dampingFactor = 0.14;
    c.minDistance = 130; c.maxDistance = 520;
    globe.pointOfView({ lat: 22, lng: 8, altitude: 2.5 }, 0);
    window.globe = globe;                       // handy from the console
    host.addEventListener('pointerdown', () => { c.autoRotate = false; });
    size();
    if (window.ResizeObserver) new ResizeObserver(size).observe(host);
    paintGlobeDots();
    hideBackDots();
  }

  /* This build of globe.gl draws its HTML markers whether or not they are on
   * the far side of the planet, so Barbados ends up floating over the Sahara.
   * A point on a sphere of radius R is in front of a camera at c when
   * p·c > R², which is cheap enough to run whenever the camera moves. */
  function hideBackDots() {
    const R2 = 100 * 100;
    let dots = [], last = null;
    const collect = () => {
      dots = [...document.querySelectorAll('.gdot')].map(n => {
        const p = byId[n.dataset.id];
        return p ? { n, v: globe.getCoords(p.lat, p.lng, 0.014) } : null;
      }).filter(Boolean);
    };
    const tick = () => {
      requestAnimationFrame(tick);
      if (!globe || mode !== 'globe') return;
      const c = globe.camera().position;
      const key = c.x.toFixed(1) + ',' + c.y.toFixed(1) + ',' + c.z.toFixed(1);
      if (key === last) return;
      last = key;
      if (dots.length !== document.querySelectorAll('.gdot').length) collect();
      for (const d of dots) {
        const front = d.v.x * c.x + d.v.y * c.y + d.v.z * c.z > R2;
        d.n.style.visibility = front ? '' : 'hidden';
      }
    };
    setTimeout(collect, 60);
    requestAnimationFrame(tick);
  }
  let lastMove = null;
  window.addEventListener('mousemove', e => { lastMove = e; }, { passive: true });

  function size() {
    const host = el('globeViz');
    if (globe && host) globe.width(host.clientWidth || window.innerWidth).height(host.clientHeight || window.innerHeight);
    if (flatBuilt) { if (userMoved) { clampView(); applyView(); } else fitView(); }
  }
  function paintGlobeDots() {
    document.querySelectorAll('.gdot').forEach(n => {
      const c = colourOf(n.dataset.id);
      n.classList.toggle('been', c === 'been');
      n.classList.toggle('want', c === 'want');
    });
  }
  function paintGlobe() {
    if (!globe) return;
    globe.polygonCapColor(capColor).polygonAltitude(altOf);
    paintGlobeDots();
  }

  /* ─────────────────────────── public ─────────────────────────── */
  function init(opts) {
    geoms = opts.geoms; places = opts.places; on = opts.on || {}; colourOf = opts.colourOf;
    byId = Object.fromEntries(places.map(p => [p.id, p]));
    setMode(mode);
    window.addEventListener('resize', size);
  }
  function setMode(next) {
    mode = next;
    el('globeViz').classList.toggle('hidden', mode !== 'globe');
    el('flatViz').classList.toggle('hidden', mode !== 'flat');
    if (mode === 'globe') { initGlobe(); paintGlobe(); size(); }
    else { buildFlat(); paintFlat(); }
  }
  function paint() { if (mode === 'globe') paintGlobe(); else paintFlat(); }
  function highlight(id) { hi = id; paint(); }
  function focus(id) {
    const p = byId[id]; if (!p) return;
    if (mode === 'globe') {
      if (globe) { globe.controls().autoRotate = false; globe.pointOfView({ lat: p.lat, lng: p.lng, altitude: Math.max(0.42, Math.min(1.9, Math.sqrt(Math.max(p.area, 400)) / 900)) }, 850); }
    } else { buildFlat(); flyFlat(p); }
  }
  function reset() {
    if (mode === 'globe') { if (globe) globe.pointOfView({ lat: 22, lng: 8, altitude: 2.5 }, 700); }
    else resetFlat();
  }
  function screenPos(id, ev) {
    if (ev && ev.clientX != null) return { x: ev.clientX, y: ev.clientY };
    const r = el('stage').getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  return { init, setMode, paint, highlight, focus, reset, screenPos, get mode() { return mode; } };
})();
