/* store.js — where you've been, kept in this browser and nowhere else.
 *
 * Everything lives in localStorage. A share link carries the same thing
 * packed into the URL fragment, which browsers never send to a server, so a
 * shared map is readable by whoever has the link and by nobody else.
 */
window.Bean2Store = (function () {
  const KEY = 'bean2.v1';
  const BEEN = 1, WANT = 2;
  const ORDER = window.BEAN2_ORDER || [];          // frozen slot order for links

  let data = { v: 1, name: '', places: {}, updated: 0 };

  // Years come in from backup files and share links, and end up in the page.
  // Anything that is not a plain year in range is dropped here, once, rather
  // than trusted by every screen that shows it.
  const YEAR_MIN = 1900, YEAR_MAX = 2155;
  function cleanYear(y) {
    const n = Math.trunc(Number(y));
    return Number.isFinite(n) && n >= YEAR_MIN && n <= YEAR_MAX ? n : null;
  }
  function cleanPlace(p) {
    if (!p || (p.s !== 'been' && p.s !== 'want')) return null;
    const y = p.s === 'been' ? cleanYear(p.y) : null;
    return y ? { s: p.s, y } : { s: p.s };
  }

  /* ── persistence ─────────────────────────────────────────────── */
  // Someone's map can be years of travelling. If this build cannot make sense
  // of every entry it finds, it keeps the original exactly as it was under a
  // second key before carrying on — nothing is ever only in the version this
  // build happens to understand.
  let rescued = false;
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const d = JSON.parse(raw);
        if (d && d.places) {
          data = Object.assign(data, d);
          data.name = String(data.name || '').slice(0, 40);
          const clean = {};
          for (const id in d.places) {
            const p = cleanPlace(d.places[id]);
            if (p) clean[id] = p;
          }
          if (JSON.stringify(clean) !== JSON.stringify(d.places)) {
            rescued = true;
            try { if (!localStorage.getItem(KEY + '.rescued')) localStorage.setItem(KEY + '.rescued', raw); }
            catch (e) { /* no room for a copy; the original is still in memory */ }
          }
          data.places = clean;
        }
      }
    } catch (e) { /* private mode, disabled storage — run in memory */ }
    return data;
  }
  function save() {
    data.updated = Date.now();
    try { localStorage.setItem(KEY, JSON.stringify(data)); }
    catch (e) { return false; }
    return true;
  }

  /* ── reading / writing one place ─────────────────────────────── */
  const get = id => data.places[id] || null;
  const statusOf = id => (data.places[id] ? data.places[id].s : null);
  const yearOf = id => (data.places[id] && data.places[id].y) || null;

  function set(id, status, year) {
    if (!status) delete data.places[id];
    else {
      const p = data.places[id] || {};
      p.s = status;
      if (year === undefined) { if (status !== 'been') delete p.y; }
      else { const y = cleanYear(year); if (y) p.y = y; else delete p.y; }
      data.places[id] = p;
    }
    save();
  }
  function toggle(id, status) {
    set(id, statusOf(id) === status ? null : status);
    return statusOf(id);
  }
  function setYear(id, year) {
    const p = data.places[id];
    if (!p || p.s !== 'been') return;
    const y = cleanYear(year);
    if (y) p.y = y; else delete p.y;
    save();
  }

  const name = v => { if (v === undefined) return data.name || ''; data.name = v.slice(0, 40); save(); };
  const all = () => data.places;
  const clear = () => { data = { v: 1, name: data.name, places: {}, updated: Date.now() }; save(); };

  function merge(places) {
    let added = 0;
    for (const id in places) {
      const p = cleanPlace(places[id]);
      if (!p) continue;
      const mine = data.places[id];
      if (!mine) { data.places[id] = p; added++; }
      else if (mine.s === 'want' && p.s === 'been') { data.places[id] = p; added++; }
      else if (mine.s === 'been' && !mine.y && p.y) mine.y = p.y;
    }
    save();
    return added;
  }

  /* ── share codes ─────────────────────────────────────────────── */
  // [version][N lo][N hi][2 bits per slot][one year byte per "been" slot][name]
  //
  // A year byte of 0 means "no year given", so the epoch has to sit one year
  // below the earliest year anyone can pick or 1900 would be indistinguishable
  // from blank. Version 1 got that wrong and used 1900 itself; links written
  // then are still read with the old epoch, which is what the version is for.
  const VERSION = 2, EPOCH = { 1: 1900, 2: 1899 };

  function encode(places, who) {
    const N = ORDER.length;
    const bits = new Uint8Array(Math.ceil(N / 4));
    const years = [];
    for (let i = 0; i < N; i++) {
      const p = places[ORDER[i]];
      if (!p) continue;
      const code = p.s === 'been' ? BEEN : p.s === 'want' ? WANT : 0;
      if (!code) continue;
      bits[i >> 2] |= code << ((i & 3) * 2);
      if (code === BEEN) years.push(p.y ? Math.max(1, Math.min(255, p.y - EPOCH[VERSION])) : 0);
    }
    const nm = new TextEncoder().encode((who || '').slice(0, 40));
    const out = new Uint8Array(3 + bits.length + years.length + 1 + nm.length);
    out[0] = VERSION; out[1] = N & 255; out[2] = N >> 8;
    out.set(bits, 3);
    out.set(years, 3 + bits.length);
    out[3 + bits.length + years.length] = nm.length;
    out.set(nm, 4 + bits.length + years.length);
    return b64url(out);
  }

  function decode(code) {
    let raw;
    try { raw = unb64url(code); } catch (e) { return null; }
    const epoch = EPOCH[raw && raw[0]];
    if (!raw || !epoch || raw.length < 4) return null;
    const N = raw[1] | (raw[2] << 8);
    const nBits = Math.ceil(N / 4);
    if (raw.length < 3 + nBits) return null;
    const places = {};
    const beens = [];
    for (let i = 0; i < N; i++) {
      const code2 = (raw[3 + (i >> 2)] >> ((i & 3) * 2)) & 3;
      if (!code2) continue;
      // A slot can be unreadable here: null for a place this build retired, or
      // undefined for one a newer build appended. Such a slot still carries a
      // year byte, so it has to keep its place in `beens` — dropping it would
      // shift every later year by one and swallow the name at the end.
      const id = ORDER[i] || null;
      if (code2 === BEEN) { beens.push(id); if (id) places[id] = { s: 'been' }; }
      else if (code2 === WANT && id) places[id] = { s: 'want' };
    }
    // year bytes line up with the "been" slots we just walked, in order
    let at = 3 + nBits;
    for (const id of beens) {
      const y = raw[at++];
      if (y === undefined) break;
      if (y && id) { const yr = cleanYear(epoch + y); if (yr) places[id].y = yr; }
    }
    let who = '';
    if (at < raw.length) {
      const len = raw[at++];
      if (len && at + len <= raw.length) who = new TextDecoder().decode(raw.slice(at, at + len));
    }
    return { places, name: who };
  }

  function b64url(bytes) {
    let s = '';
    for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function unb64url(s) {
    s = String(s).replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(s + '==='.slice((s.length + 3) % 4));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  /* ── backup files ────────────────────────────────────────────── */
  function toJSON() {
    return JSON.stringify({ app: 'bean2', v: 1, exported: new Date().toISOString(), name: data.name, places: data.places }, null, 2);
  }
  function fromJSON(text) {
    const d = JSON.parse(text);
    const places = d && (d.places || d);
    if (!places || typeof places !== 'object') throw new Error('not a bean2 backup');
    return { places, name: d && d.name };
  }

  return { load, save, get, statusOf, yearOf, set, toggle, setYear, name, all, clear,
           merge, encode, decode, toJSON, fromJSON, cleanPlace,
           wasRescued: () => rescued, rescuedKey: KEY + '.rescued' };
})();
