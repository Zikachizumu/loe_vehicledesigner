/* LOE Vehicle Studio — çekirdek: durum, geçmiş (geri al / yinele), tasarım dokusu, yardımcılar. */
(function (root) {
    'use strict';
    const VS = root.VS = {};
    const E = VDEngine;

    const $ = (s, r) => (r || document).querySelector(s);
    const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
    VS.$ = $; VS.$$ = $$; VS.esc = esc; VS.clamp = clamp;

    // ------------------------------------------------------------------ DURUM
    function newDesign() { return { v: 1, size: 4096, base: { color: null }, layers: [] }; }
    function newMod() {
        return { body: '#2b2f36', finish: 'gloss', tint: 3, rim: '#b9bec6', neon: { on: false, color: '#ff2e93' }, parts: {}, hidden: [], open: {}, extras: {}, props: [] };
    }

    const S = VS.S = {
        ready: false,
        vehicles: [], vmap: {}, cat: 'all', search: '', vlimit: 80,
        veh: null, vd: null, charts: null, bbox: null,
        design: newDesign(),
        mod: newMod(),
        sel: null,
        tool: 'select', tab: 'layers',
        res: 2048,
        projName: 'Adsız proje',
        dirty: false,
        selBone: -1,
        selProp: null, propType: 'lightbar',
        brush: { size: 90, hard: 0.65, opacity: 100, color: '#ff2e93', strength: 55, mirror: false },
        text: { text: 'LOE', font: 'Anton', size: 260, bold: false, italic: false, color: '#ffffff', align: 'center', spacing: 20 },
        shape: { id: 'rounded', color: '#ff2e93' },
        fill: { color: '#ff2e93', mode: 'chart' },
        grad: { c1: '#ff2e93', c2: '#1a0b3d', angle: 90 },
        patt: { id: 'checker', c1: '#ffffff', c2: '#111111', scale: 1 },
        race: { num: '07', font: 'Anton', color: '#ffffff', outline: '#111111', size: 520, disc: true },
        stripes: { id: 'racing', c1: '#ffffff', c2: '#ff2e93', width: 1 },
        img: { recents: [] },
        v2: { zoom: 1, ox: 0, oy: 0, xray: true, paint: true, grid: false },
        picked: null,
        saving: false,
    };
    VS.newDesign = newDesign; VS.newMod = newMod;

    // ------------------------------------------------------------------ BİLDİRİMLER
    VS.toast = function (msg, kind) {
        const box = $('#toasts');
        const t = document.createElement('div');
        t.className = 'toast ' + (kind || '');
        t.textContent = msg;
        box.appendChild(t);
        setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; setTimeout(() => t.remove(), 320); }, kind === 'err' ? 5200 : 2800);
    };
    let busyEl = null;
    VS.busy = function (text) {
        if (!text) { if (busyEl) { busyEl.remove(); busyEl = null; } return; }
        if (!busyEl) {
            busyEl = document.createElement('div');
            busyEl.className = 'busy';
            busyEl.innerHTML = '<div class="busy-card"><i class="spinner"></i><span></span></div>';
            document.body.appendChild(busyEl);
        }
        busyEl.querySelector('span').textContent = text;
    };
    VS.modal = function (html, onReady) {
        const ov = document.createElement('div');
        ov.className = 'overlay';
        ov.innerHTML = '<div class="modal">' + html + '</div>';
        document.body.appendChild(ov);
        const close = () => ov.remove();
        ov.addEventListener('mousedown', e => { if (e.target === ov) close(); });
        if (onReady) onReady(ov.querySelector('.modal'), close);
        return close;
    };
    VS.confirm = function (title, text, okLabel) {
        return new Promise(res => {
            VS.modal(`<h3>${icon('alert')} ${esc(title)}</h3><p>${esc(text)}</p>
                <div class="row"><button class="btn" data-k="n">Vazgeç</button><button class="btn pri" data-k="y">${esc(okLabel || 'Tamam')}</button></div>`, (m, close) => {
                m.addEventListener('click', e => {
                    const b = e.target.closest('[data-k]');
                    if (!b) return;
                    close(); res(b.dataset.k === 'y');
                });
            });
        });
    };

    // ------------------------------------------------------------------ KATMAN YARDIMCILARI
    VS.layer = (id) => S.design.layers.find(l => l.id === id) || null;
    VS.selLayer = () => VS.layer(S.sel);
    VS.mkLayer = function (type, props) {
        const n = S.design.layers.filter(l => l.type === type).length + 1;
        const base = { id: E.uid('l'), type, name: '', visible: true, locked: false, x: 2048, y: 2048, rot: 0, sx: 100, sy: 100, opacity: 100, blend: 'normal', color: '#ffffff' };
        const L = Object.assign(base, props || {});
        if (!L.name) L.name = ({ shape: 'Şekil', text: 'Metin', image: 'Görsel', paint: 'Boya', gradient: 'Degrade', pattern: 'Desen' }[type] || 'Katman') + ' ' + n;
        return L;
    };
    VS.addLayer = function (L, opts) {
        opts = opts || {};
        S.design.layers.push(L);
        if (opts.select !== false) S.sel = L.id;
        VS.designChanged();
        if (!opts.nocommit) VS.commit();
        VS.renderPanel();
        return L;
    };
    VS.removeLayer = function (id) {
        const i = S.design.layers.findIndex(l => l.id === id);
        if (i < 0) return;
        S.design.layers.splice(i, 1);
        if (S.sel === id) S.sel = null;
        VS.designChanged(); VS.commit(); VS.renderPanel();
    };

    // ------------------------------------------------------------------ TASARIM DOKUSU
    const cv = document.createElement('canvas');
    const cx = cv.getContext('2d', { willReadFrequently: false });
    VS.cv = cv;
    let designDirty = true, texTimer = 0;

    function sizeCanvas() {
        if (cv.width !== S.res) { cv.width = cv.height = S.res; }
        if (VS.scene) VS.scene.setCanvas(cv, S.design.size);
    }
    VS.sizeCanvas = sizeCanvas;

    VS.designChanged = function () {
        designDirty = true;
        setDirty(true);
        if (!texTimer) texTimer = requestAnimationFrame(flush);
    };
    function flush() {
        texTimer = 0;
        if (!designDirty) return;
        designDirty = false;
        E.render(cx, S.design, { width: cv.width, height: cv.height, clear: true });
        if (VS.scene) VS.scene.touchTexture();
        if (VS.v2) VS.v2.invalidate();
        VS.updateLayerThumbs && VS.updateLayerThumbs();
    }
    VS.flushNow = function () { if (designDirty) { designDirty = false; flush(); } };
    E.setOnImageLoad(() => { VS.designChanged(); });

    function setDirty(v) {
        S.dirty = v;
        const el = $('#stDirty');
        if (el) el.textContent = v ? 'Kaydedilmedi' : 'Kaydedildi';
    }
    VS.setDirty = setDirty;

    // ------------------------------------------------------------------ GEÇMİŞ
    // Girdiler kendi tersini üretir: 'j' = tasarım JSON'u, 'px' = boya katmanı yaması
    let undoSt = [], redoSt = [], curJson = '';

    function snapshot() {
        return JSON.stringify({ design: S.design, mod: S.mod });
    }
    VS.resetHistory = function () { undoSt = []; redoSt = []; curJson = snapshot(); updateUndoUi(); };
    VS.commit = function () {
        const s = snapshot();
        if (s === curJson) return;
        undoSt.push({ t: 'j', s: curJson });
        if (undoSt.length > 150) undoSt.shift();
        curJson = s;
        redoSt = [];
        setDirty(true);
        updateUndoUi();
    };
    VS.commitPatch = function (patch) {
        undoSt.push(patch);
        if (undoSt.length > 150) undoSt.shift();
        redoSt = [];
        setDirty(true);
        updateUndoUi();
    };
    function applyEntry(e) {
        if (e.t === 'j') {
            const inv = { t: 'j', s: curJson };
            const o = JSON.parse(e.s);
            S.design = o.design;
            S.mod = o.mod;
            curJson = e.s;
            if (S.sel && !VS.layer(S.sel)) S.sel = null;
            VS.applyMod && VS.applyMod();
            VS.designChanged();
            return inv;
        }
        const c = E.paintCanvas({ id: e.id });
        if (!c) return e;
        const x = c.getContext('2d');
        const inv = { t: 'px', id: e.id, x: e.x, y: e.y, data: x.getImageData(e.x, e.y, e.data.width, e.data.height) };
        x.putImageData(e.data, e.x, e.y);
        VS.designChanged();
        return inv;
    }
    VS.undo = function () {
        const e = undoSt.pop();
        if (!e) return;
        redoSt.push(applyEntry(e));
        updateUndoUi(); VS.renderPanel();
    };
    VS.redo = function () {
        const e = redoSt.pop();
        if (!e) return;
        undoSt.push(applyEntry(e));
        updateUndoUi(); VS.renderPanel();
    };
    function updateUndoUi() {
        const u = $('#btnUndo'), r = $('#btnRedo');
        if (u) u.disabled = !undoSt.length;
        if (r) r.disabled = !redoSt.length;
    }

    // ------------------------------------------------------------------ PROJE (seri hale getirme)
    VS.serializeDesign = function () {
        const d = JSON.parse(JSON.stringify(S.design));
        for (const L of d.layers) {
            if (L.type === 'paint') {
                const c = E.paintCanvas(L);
                L.src = c ? c.toDataURL('image/png') : null;
            }
        }
        return d;
    };
    VS.project = function (withThumb) {
        return {
            app: 'loe-vehicle-studio', v: 1, name: S.projName, vehicle: S.veh ? S.veh.id : null,
            design: VS.serializeDesign(), mod: S.mod, updated: Date.now(),
            thumb: withThumb && VS.scene ? VS.scene.capture(360, 200) : undefined,
        };
    };
    VS.loadDesign = async function (design) {
        S.design = JSON.parse(JSON.stringify(design || newDesign()));
        S.design.size = S.design.size || 4096;
        S.design.layers = S.design.layers || [];
        for (const L of S.design.layers) {
            if (L.type === 'paint') {
                const c = document.createElement('canvas');
                c.width = c.height = L.res || 2048;
                if (L.src) {
                    await new Promise(res => {
                        const im = new Image();
                        im.onload = () => { c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); res(); };
                        im.onerror = res;
                        im.src = L.src;
                    });
                }
                L.src = null;
                E.setPaintCanvas(L, c);
            }
        }
        S.sel = null;
    };

    // ------------------------------------------------------------------ TUVAL YARDIMCILARI
    VS.fontsReady = function () { return document.fonts ? document.fonts.ready : Promise.resolve(); };
    VS.warmFont = function (family, bold, italic) {
        if (!document.fonts || !document.fonts.load) return Promise.resolve();
        return document.fonts.load(`${italic ? 'italic ' : ''}${bold ? 700 : 400} 40px "${family}"`, 'AaBb0123ĞÜŞİÖÇ').then(() => VS.designChanged()).catch(() => { });
    };

    VS.FONTS = ['Impact', 'Anton', 'Bebas Neue', 'Oswald', 'Chakra Petch', 'Montserrat', 'Russo One', 'Orbitron', 'Teko', 'Black Ops One',
        'Racing Sans One', 'Bangers', 'Permanent Marker', 'Dancing Script', 'Pacifico', 'Roboto Condensed'];
})(window);
