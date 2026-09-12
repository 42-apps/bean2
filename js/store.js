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

  /* ── persistence ─────────────────────────────────────────────── */
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const d = JSON.parse(raw);
        if (d && d.places) data = Object.assign(data, d);
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
      else if (year) p.y = year; else delete p.y;
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
    if (year) p.y = year; else delete p.y;
    save();
  }

  const name = v => { if (v === undefined) return data.name || ''; data.name = v.slice(0, 40); save(); };
  const all = () => data.places;
  const clear = () => { data = { v: 1, name: data.name, places: {}, updated: Date.now() }; save(); };

  function merge(places) {
    let added = 0;
    for (const id in places) {
      const p = places[id];
      if (!p || (p.s !== 'been' && p.s !== 'want')) continue;
      const mine = data.places[id];
      if (!mine) { data.places[id] = p.y ? { s: p.s, y: p.y } : { s: p.s }; added++; }
      else if (mine.s === 'want' && p.s === 'been') { data.places[id] = p.y ? { s: 'been', y: p.y } : { s: 'been' }; added++; }
      else if (mine.s === 'been' && !mine.y && p.y) mine.y = p.y;
    }
    save();
    return added;
  }

  /* ── share codes ─────────────────────────────────────────────── */
  // [1][N lo][N hi][2 bits per slot][one year byte per "been" slot][name]
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
      if (code === BEEN) years.push(p.y ? Math.max(0, Math.min(255, p.y - 1900)) : 0);
    }
    const nm = new TextEncoder().encode((who || '').slice(0, 40));
    const out = new Uint8Array(3 + bits.length + years.length + 1 + nm.length);
    out[0] = 1; out[1] = N & 255; out[2] = N >> 8;
    out.set(bits, 3);
    out.set(years, 3 + bits.length);
    out[3 + bits.length + years.length] = nm.length;
    out.set(nm, 4 + bits.length + years.length);
    return b64url(out);
  }

  function decode(code) {
    let raw;
    try { raw = unb64url(code); } catch (e) { return null; }
    if (!raw || raw[0] !== 1 || raw.length < 4) return null;
    const N = raw[1] | (raw[2] << 8);
    const nBits = Math.ceil(N / 4);
    if (raw.length < 3 + nBits) return null;
    const places = {};
    const beens = [];
    for (let i = 0; i < N; i++) {
      const code2 = (raw[3 + (i >> 2)] >> ((i & 3) * 2)) & 3;
      if (!code2) continue;
      const id = ORDER[i];
      if (!id) continue;                                  // slot from a newer build
      if (code2 === BEEN) { places[id] = { s: 'been' }; beens.push(id); }
      else if (code2 === WANT) places[id] = { s: 'want' };
    }
    // year bytes line up with the "been" slots we just walked, in order
    let at = 3 + nBits;
    for (const id of beens) {
      const y = raw[at++];
      if (y === undefined) break;
      if (y) places[id].y = 1900 + y;
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
           merge, encode, decode, toJSON, fromJSON };
})();
