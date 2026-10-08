/* LOE Vehicle Designer — editör arayüzü.
 * Tasarımın tek doğruluk kaynağı bu dosyadaki S.design'dır. Lua yalnızca:
 *   - araca tıklanan noktayı (yerel koordinat + normal) bildirir (pick / equipPick),
 *   - gönderilen tasarımı araç dokusuna, ekipmanı prop'lara, modifiyeyi araca uygular.
 */
(function () {
    'use strict';

    const E = window.VDEngine;
    const $ = (s, r) => (r || document).querySelector(s);
    const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
    const IS_GAME = typeof window.GetParentResourceName === 'function';
    const RES = IS_GAME ? window.GetParentResourceName() : 'loe_vehicledesigner';

    // ================================================================== DURUM
    const S = {
        open: false,
        locale: 'tr',
        tool: 'tuning',
        veh: { name: '', label: '', plate: '', model: '', extras: [] },
        surface: { kind: 'none', charts: [], size: 4096, texture: 2048, pack: null, packs: 0 },
        design: emptyDesign(),
        meta: { id: null, name: '', mine: true },
        perms: { modelScope: false, ai: false },
        limits: { layers: 120, equipment: 30 },
        fonts: [],
        catalogue: [], categories: [],
        sel: null,
        selEquip: null,
        placing: null,
        testLights: false,
        tilt: false,
        equipCat: 'sirens', equipSearch: '',
        assetTab: 'recent', assetSearch: '', assetUrl: '',
        ai: { prompt: '', busy: false, result: null, removeBg: true },
        lib: { items: null, busy: false },
        closed: {},
        hist: [], future: [],
        dirty: false,
        drag: null,
        view2d: false, template: true,
        images: {},
        imageReq: {},
        textDefaults: { font: 'Impact', bold: true, italic: false, underline: false, strike: false, fsize: 160, spacing: 0, line: 1.16, align: 'left', color: '#ffffff' },
        shapeColor: '#ffffff',
        ratioLock: true,
        pickers: [],
    };

    function emptyDesign() {
        return { v: 1, size: 4096, base: { color: null }, layers: [], equipment: [], tuning: null };
    }

    // ================================================================== YARDIMCILAR
    function t(k, vars) {
        const pack = window.VDI18N[S.locale] || window.VDI18N.en;
        let s = pack[k] != null ? pack[k] : (window.VDI18N.en[k] != null ? window.VDI18N.en[k] : k);
        if (vars) for (const v in vars) s = s.split('{' + v + '}').join(vars[v]);
        return s;
    }
    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }
    function clamp(v, a, b) { v = Number(v); if (isNaN(v)) v = a; return Math.min(b, Math.max(a, v)); }
    function round(v, d) { const k = Math.pow(10, d || 0); return Math.round(v * k) / k; }
    function layer(id) { return S.design.layers.find(l => l.id === id) || null; }
    function selLayer() { return S.sel ? layer(S.sel) : null; }
    function equipItem(id) { return S.catalogue.find(i => i.id === id) || null; }
    function equipInst(uid) { return S.design.equipment.find(e => e.uid === uid) || null; }
    function nm(item) { return item ? (item[S.locale] || item.en || item.tr || item.id) : ''; }
    function lsGet(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } }
    function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* yok say */ } }

    // ================================================================== LUA KÖPRÜSÜ
    async function post(name, data) {
        if (!IS_GAME) return window.VDMock ? window.VDMock(name, data || {}) : {};
        try {
            const r = await fetch(`https://${RES}/${name}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json; charset=UTF-8' },
                body: JSON.stringify(data || {}),
            });
            const txt = await r.text();
            return txt ? JSON.parse(txt) : {};
        } catch (e) {
            return {};
        }
    }

    // Canlı önizleme: tasarım/ekipman/modifiye değişiklikleri sık gelir → kısılır
    function throttled(name, build, ms) {
        let timer = null, last = 0;
        return function (now) {
            if (timer) return;
            const wait = now ? 0 : Math.max(0, ms - (Date.now() - last));
            timer = setTimeout(() => { timer = null; last = Date.now(); post(name, build()); }, wait);
        };
    }
    const pushDesignRaw = throttled('design', () => ({ design: duiDesign() }), 70);
    function pushDesign(now) { pushDesignRaw(now); draw2d(); }
    const pushEquipment = throttled('equipment', () => ({ list: S.design.equipment, sel: S.selEquip, placing: S.placing, test: S.testLights, tilt: S.tilt }), 60);
    const pushTuning = throttled('tuning', () => ({ tuning: S.design.tuning }), 90);

    function duiDesign() {
        return { v: 1, size: S.design.size, base: S.design.base, layers: S.design.layers };
    }

    // ================================================================== GEÇMİŞ (geri al / yinele)
    function snapshot() {
        return JSON.stringify({ layers: S.design.layers, base: S.design.base, equipment: S.design.equipment, tuning: S.design.tuning });
    }
    function resetHistory() { S.hist = [snapshot()]; S.future = []; updateUndo(); }
    function commit() {
        const snap = snapshot();
        if (S.hist[S.hist.length - 1] === snap) return;
        S.hist.push(snap);
        if (S.hist.length > 120) S.hist.shift();
        S.future = [];
        setDirty(true);
        updateUndo();
    }
    let commitTimer = null;
    function commitSoon() { clearTimeout(commitTimer); commitTimer = setTimeout(commit, 350); }
    function restore(snap) {
        const o = JSON.parse(snap);
        S.design.layers = o.layers || [];
        S.design.base = o.base || { color: null };
        S.design.equipment = o.equipment || [];
        S.design.tuning = o.tuning || S.design.tuning;
        if (S.sel && !layer(S.sel)) S.sel = null;
        if (S.selEquip && !equipInst(S.selEquip)) S.selEquip = null;
        setDirty(true);
        renderAll();
        pushDesign(true); pushEquipment(true); pushTuning(true);
    }
    function undo() {
        if (S.hist.length < 2) return;
        S.future.push(S.hist.pop());
        restore(S.hist[S.hist.length - 1]);
        updateUndo();
    }
    function redo() {
        if (!S.future.length) return;
        const s = S.future.pop();
        S.hist.push(s);
        restore(s);
        updateUndo();
    }
    function updateUndo() {
        $('#btnUndo').disabled = S.hist.length < 2;
        $('#btnRedo').disabled = !S.future.length;
    }
    function setDirty(v) {
        S.dirty = v;
        const st = $('#fState');
        st.textContent = v ? t('unsaved') : t('saved');
        st.classList.toggle('dirty', v);
    }

    // ================================================================== BİLDİRİM / MEŞGUL / MODAL
    function toast(text, opts) {
        opts = opts || {};
        const el = document.createElement('div');
        el.className = 'toast' + (opts.error ? ' err' : '');
        el.innerHTML = `<b>${esc(opts.title || t('toast_livery'))}</b>${esc(text)}`;
        $('#toasts').prepend(el);
        while ($('#toasts').children.length > 4) $('#toasts').lastElementChild.remove();
        setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 260); }, opts.ms || 4200);
    }
    function busy(on, text, progress) {
        $('#busy').classList.toggle('hidden', !on);
        if (text != null) $('#busyText').textContent = text;
        $('#busyFill').style.width = (progress == null ? 0 : clamp(progress, 0, 1) * 100) + '%';
        $('#busyFill').parentElement.classList.toggle('hidden', progress == null);
    }
    function modal(html, bind) {
        const m = $('#modal');
        m.innerHTML = html;
        m.classList.remove('hidden');
        if (bind) bind(m);
    }
    function closeModal() { const m = $('#modal'); m.classList.add('hidden'); m.innerHTML = ''; }
    function modalOpen() { return !$('#modal').classList.contains('hidden'); }

    function confirmBox(title, text, okLabel, onOk, danger) {
        modal(`<div class="modal">
            <div class="modal-h"><span class="mi">${icon('alert')}</span><div><h3>${esc(title)}</h3></div>
                <button class="ib" data-x>${icon('x')}</button></div>
            <div class="modal-b"><p class="modal-p">${text}</p></div>
            <div class="modal-f"><button class="btn grow" data-x>${t('cancel')}</button>
                <button class="btn grow ${danger ? 'danger' : 'primary'}" data-ok>${esc(okLabel)}</button></div></div>`, m => {
            $$('[data-x]', m).forEach(b => b.onclick = closeModal);
            $('[data-ok]', m).onclick = () => { closeModal(); onOk(); };
        });
    }

    function promptBox(title, value, onOk, multiline) {
        modal(`<div class="modal">
            <div class="modal-h"><span class="mi">${icon('edit')}</span><div><h3>${esc(title)}</h3></div>
                <button class="ib" data-x>${icon('x')}</button></div>
            <div class="modal-b">${multiline
                ? `<textarea class="inp" data-v style="height:7rem">${esc(value || '')}</textarea>`
                : `<input class="inp" data-v value="${esc(value || '')}" maxlength="400">`}</div>
            <div class="modal-f"><button class="btn grow" data-x>${t('cancel')}</button><button class="btn grow primary" data-ok>OK</button></div></div>`, m => {
            const inp = $('[data-v]', m);
            inp.focus(); if (inp.select) inp.select();
            $$('[data-x]', m).forEach(b => b.onclick = closeModal);
            const ok = () => { const v = inp.value; closeModal(); onOk(v); };
            $('[data-ok]', m).onclick = ok;
            if (!multiline) inp.onkeydown = e => { if (e.key === 'Enter') ok(); };
        });
    }

    // ================================================================== ÇERÇEVE
    const TOOLS = [
        ['view', 'cursor'], ['text', 'type'], ['shapes', 'shapeRect'], ['layers', 'layers'], ['surfaces', 'surfaces'],
        ['assets', 'image'], ['ai', 'sparkles'], ['tuning', 'sliders'], ['equipment', 'siren'], ['library', 'library'],
    ];

    function renderFrame() {
        $('#t1').textContent = t('title1');
        $('#t2').textContent = t('title2');
        $('#crown').innerHTML = window.CROWN_SVG;
        $('#vehName').textContent = S.veh.label || S.veh.name || '—';
        $('#vehPlate').textContent = S.veh.plate || '—';
        $('#plateChip').textContent = S.veh.plate || '—';
        $('#btnSave').textContent = t('save_livery');
        $('#btnUndo').innerHTML = icon('undo'); $('#btnUndo').title = t('undo');
        $('#btnRedo').innerHTML = icon('redo'); $('#btnRedo').title = t('redo');
        $('#btnClose').innerHTML = icon('x'); $('#btnClose').title = t('close');
        $('#lblLayers').textContent = t('layers');
        $('#lblProps').textContent = t('layer_props');
        $('#fSize').textContent = `${S.design.size} × ${S.design.size}`;
        $('#toolbar').innerHTML = TOOLS.map(([id, ic]) =>
            `<button data-tool="${id}" class="${S.tool === id ? 'on' : ''}">${icon(ic)}<span>${t('tool_' + id)}</span></button>`).join('')
            + `<button class="del" data-tool="delete">${icon('trash')}<span>${t('tool_delete')}</span></button>`;
        $('#camBar').innerHTML = ['reset', 'front', 'side', 'rear', 'top'].map(c => `<button data-cam="${c}">${t('cam_' + c)}</button>`).join('');
        renderHints();
        $('#packsInfo').textContent = t('packs_loaded', { n: S.surface.packs || 0 });
        setDirty(S.dirty);
        updateUndo();
    }

    function renderHints() {
        const equip = S.tool === 'equipment';
        $('#hints').innerHTML = `
            <span><i class="kbd">LMB</i>${equip ? t('hint_equip') : t('hint_drag')}</span>
            <span><i class="kbd">RMB</i>${t('hint_orbit')}</span>
            <span><i class="kbd">${icon('mouse')}</i>${t('hint_zoom')}</span>`;
        $('#viewport').classList.toggle('place', !!S.placing);
    }

    function setTool(id) {
        if (id === 'delete') { deleteAction(); return; }
        if (S.tool === id) return;
        if (S.tool === 'equipment' && id !== 'equipment') { S.placing = null; S.selEquip = null; pushEquipment(true); }
        S.tool = id;
        if (id === 'library' && !S.lib.items) loadLibrary();
        post('tool', { tool: id });
        $$('#toolbar button[data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === id));
        renderHints();
        renderTool();
    }

    function renderAll() {
        renderLayers();
        renderProps();
        renderTool();
        draw2d();
    }

    // ================================================================== KATMANLAR
    function layerSub(L) {
        if (L.type === 'text') return (L.text || '').split('\n')[0] || t('sub_text');
        if (L.type === 'image') return t('sub_image');
        return t('sub_path');
    }
    function layerIcon(L) { return L.type === 'text' ? 'type' : (L.type === 'image' ? 'image' : 'shapeRect'); }

    function renderLayers() {
        const list = $('#layerList');
        const ls = S.design.layers;
        $('#layerCount').textContent = ls.length;
        if (!ls.length) {
            list.innerHTML = `<div class="empty">${icon('layers')}<b>${t('no_layers')}</b>${t('no_layers_hint')}</div>`;
        } else {
            list.innerHTML = ls.slice().reverse().map(L => `
                <div class="layer${L.id === S.sel ? ' sel' : ''}${L.visible ? '' : ' hid'}" data-id="${L.id}" draggable="true">
                    ${icon(layerIcon(L))}
                    <div class="meta"><div class="nm">${esc(L.name)}</div><div class="sb">${esc(layerSub(L))}</div></div>
                    <div class="acts">
                        <button data-la="vis" class="${L.visible ? 'on' : ''}" title="${t('act_visible')}">${icon(L.visible ? 'eye' : 'eyeOff')}</button>
                        <button data-la="lock" class="${L.locked ? 'on' : ''}" title="${t('act_lock')}">${icon(L.locked ? 'lock' : 'unlock')}</button>
                        <button data-la="dup" title="${t('act_dup')}">${icon('copy')}</button>
                        <button data-la="up" title="${t('act_up')}">${icon('up')}</button>
                        <button data-la="down" title="${t('act_down')}">${icon('down')}</button>
                        <button data-la="del" class="del" title="${t('act_del')}">${icon('trash')}</button>
                    </div>
                </div>`).join('');
        }
        $('#fSel').textContent = t('n_selected', { n: S.sel ? 1 : 0 });
    }

    function select(id) {
        if (S.sel === id) return;
        S.sel = id;
        renderLayers();
        renderProps();
        if (['view', 'text', 'shapes', 'layers'].includes(S.tool)) renderTool();
        draw2d();
        post('select', { id });
    }

    function nextName(base) {
        const names = new Set(S.design.layers.map(l => l.name));
        if (!names.has(base)) return base;
        let i = 2;
        while (names.has(`${base} ${i}`)) i++;
        return `${base} ${i}`;
    }

    function addLayer(L) {
        if (S.design.layers.length >= S.limits.layers) { toast(t('layer_limit'), { error: true }); return null; }
        S.design.layers.push(L);
        S.sel = L.id;
        renderLayers(); renderProps();
        pushDesign(true);
        commit();
        return L;
    }

    function duplicateLayer(id) {
        const L = layer(id);
        if (!L) return;
        const c = JSON.parse(JSON.stringify(L));
        c.id = E.uid();
        c.name = `${L.name} ${t('copy')}`;
        c.x += 60; c.y += 60;
        c.locked = false;
        const i = S.design.layers.indexOf(L);
        S.design.layers.splice(i + 1, 0, c);
        S.sel = c.id;
        renderLayers(); renderProps(); renderTool();
        pushDesign(true); commit();
    }

    function removeLayer(id) {
        const i = S.design.layers.findIndex(l => l.id === id);
        if (i < 0) return;
        S.design.layers.splice(i, 1);
        if (S.sel === id) S.sel = null;
        renderLayers(); renderProps(); renderTool();
        pushDesign(true); commit();
    }

    function moveLayer(id, dir) {
        const ls = S.design.layers;
        const i = ls.findIndex(l => l.id === id);
        const j = i + dir;
        if (i < 0 || j < 0 || j >= ls.length) return;
        [ls[i], ls[j]] = [ls[j], ls[i]];
        renderLayers();
        pushDesign(true); commit();
    }

    // Yeni katmanın yerleşeceği nokta: ekran ortasındaki araç yüzeyi (yoksa görünen yüzün ortası)
    async function focusPoint() {
        const charts = S.surface.charts || [];
        if (!charts.length) return { x: S.design.size / 2, y: S.design.size / 2, chart: null };
        const r = await post('centerPick', {});
        if (r && r.hit && r.lp && r.ln) {
            const p = E.pick(charts, r.lp, r.ln);
            if (p) return p;
        }
        let c = null;
        if (r && r.view) c = E.chartForNormal(charts, r.view.map(v => -v));
        c = c || charts.find(x => x.id === 'left') || charts[0];
        return { x: c.rect[0] + c.rect[2] / 2, y: c.rect[1] + c.rect[3] / 2, chart: c.id };
    }

    // Chart ölçeğine göre makul başlangıç boyutu (≈ 60 cm)
    function defaultScale(base) {
        const c = (S.surface.charts || [])[0];
        if (!c) return 100;
        const target = c.s * 0.6;
        return clamp(round(target / base * 100, 2), 5, 1000);
    }

    async function addShape(shape) {
        const def = E.SHAPES[shape];
        const p = await focusPoint();
        const sc = defaultScale(Math.max(def.w, def.h));
        addLayer({
            id: E.uid(), type: 'shape', shape, name: nextName(t('shape_' + shape)), visible: true, locked: false,
            x: Math.round(p.x), y: Math.round(p.y), rot: 0, sx: sc, sy: sc, opacity: 100, blend: 'normal',
            color: S.shapeColor, w: def.w, h: def.h,
        });
        renderTool();
    }

    async function addText(text) {
        const p = await focusPoint();
        const d = S.textDefaults;
        const L = {
            id: E.uid(), type: 'text', name: nextName(t('name_text')), visible: true, locked: false,
            x: Math.round(p.x), y: Math.round(p.y), rot: 0, sx: 100, sy: 100, opacity: 100, blend: 'normal',
            color: d.color, text: text != null ? text : t('text_default'), font: d.font, bold: d.bold, italic: d.italic,
            underline: d.underline, strike: d.strike, fsize: d.fsize, spacing: d.spacing, line: d.line, align: d.align,
        };
        const sc = defaultScale(E.baseSize(L).h * 2.2);
        L.sx = L.sy = sc;
        return addLayer(L);
    }

    async function addImage(src, natural) {
        const p = await focusPoint();
        let w = 512, h = 512;
        if (natural && natural.w && natural.h) {
            const k = 512 / Math.max(natural.w, natural.h);
            w = Math.round(natural.w * k); h = Math.round(natural.h * k);
        }
        const sc = defaultScale(Math.max(w, h));
        return addLayer({
            id: E.uid(), type: 'image', name: nextName(t('name_image')), visible: true, locked: false,
            x: Math.round(p.x), y: Math.round(p.y), rot: 0, sx: sc, sy: sc, opacity: 100, blend: 'normal',
            color: '#ffffff', tint: false, src, w, h,
        });
    }

    function updateLayer(L, patch, live) {
        Object.assign(L, patch);
        if (live) { pushDesign(); commitSoon(); } else { pushDesign(true); commit(); }
        const row = $(`#layerList .layer[data-id="${L.id}"]`);
        if (row) {
            $('.nm', row).textContent = L.name;
            $('.sb', row).textContent = layerSub(L);
        }
    }

    // ================================================================== KATMAN ÖZELLİKLERİ
    function propsHtml(L) {
        if (!L) return `<div class="empty">${icon('target')}<b>${t('no_sel')}</b>${t('no_sel_hint')}</div>`;
        const op = L.opacity == null ? 100 : L.opacity;
        return `<div class="card"><div class="card-b" style="padding-top:.7rem">
            <div class="val-head"><span>${t('opacity')}</span><span class="mono" data-o="opv">${Math.round(op)}%</span></div>
            <input type="range" class="rng" min="0" max="100" step="1" value="${op}" data-p="opacity" style="--p:${op}%">
            <label class="lbl caps">${t('blend')}</label>
            <select class="sel" data-p="blend">${E.BLEND_ORDER.map(b => `<option value="${b}"${L.blend === b ? ' selected' : ''}>${t('blend_' + b)}</option>`).join('')}</select>
            <label class="lbl caps">${t('position')}</label>
            <div class="xy">
                <label><i>X</i><input class="inp" type="number" step="1" data-p="x" value="${Math.round(L.x)}"></label>
                <label><i>Y</i><input class="inp" type="number" step="1" data-p="y" value="${Math.round(L.y)}"></label>
            </div>
            <label class="lbl caps">${t('rotation')}</label>
            <div class="xy" style="grid-template-columns:1fr">
                <label><i>°</i><input class="inp" type="number" step="1" data-p="rot" value="${round(L.rot || 0, 2)}"></label>
            </div>
            <label class="lbl caps">${t('scale')}</label>
            <div class="xy">
                <label><i>X</i><input class="inp has-unit" type="number" step="1" data-p="sx" value="${round(L.sx, 2)}"><span class="unit">%</span></label>
                <label><i>Y</i><input class="inp has-unit" type="number" step="1" data-p="sy" value="${round(L.sy, 2)}"><span class="unit">%</span></label>
            </div>
        </div></div>`;
    }

    function renderProps() {
        $('#layerProps').innerHTML = propsHtml(selLayer());
    }

    // Sürükleme sırasında yalnızca sayıları güncelle (odak kaybolmasın)
    function refreshPropInputs() {
        const L = selLayer();
        if (!L) return;
        $$('[data-p]').forEach(inp => {
            if (document.activeElement === inp) return;
            const k = inp.dataset.p;
            if (k === 'x' || k === 'y') inp.value = Math.round(L[k]);
            else if (k === 'rot') inp.value = round(L.rot || 0, 2);
            else if (k === 'sx' || k === 'sy') inp.value = round(L[k], 2);
            else if (k === 'opacity') { inp.value = L.opacity; inp.style.setProperty('--p', L.opacity + '%'); }
        });
        $$('[data-o="opv"]').forEach(e => e.textContent = Math.round(L.opacity) + '%');
    }

    function onPropInput(inp, final) {
        const L = selLayer();
        if (!L) return;
        const k = inp.dataset.p;
        let v = inp.value;
        if (k === 'blend') { updateLayer(L, { blend: v }); return; }
        v = parseFloat(v);
        if (isNaN(v)) return;
        const patch = {};
        if (k === 'opacity') {
            patch.opacity = clamp(v, 0, 100);
            inp.style.setProperty('--p', patch.opacity + '%');
            $$('[data-o="opv"]').forEach(e => e.textContent = Math.round(patch.opacity) + '%');
        } else if (k === 'x' || k === 'y') patch[k] = clamp(v, -S.design.size, S.design.size * 2);
        else if (k === 'rot') patch.rot = ((v % 360) + 360) % 360;
        else if (k === 'sx' || k === 'sy') {
            v = clamp(v, -5000, 5000);
            if (Math.abs(v) < 1) v = v < 0 ? -1 : 1;
            if (S.ratioLock && L[k] && inp.closest('.xy')) {
                const other = k === 'sx' ? 'sy' : 'sx';
                const ratio = L[other] / L[k];
                patch[other] = round(v * ratio, 2);
            }
            patch[k] = v;
        } else if (k === 'w' || k === 'h') patch[k] = clamp(v, 4, 20000);
        updateLayer(L, patch, !final);
        if (final) refreshPropInputs();
        else if (patch.sx != null || patch.sy != null) refreshPropInputs();
        draw2d();
    }

    // ================================================================== SOL PANEL (araçlar)
    function card(id, title, body, opts) {
        opts = opts || {};
        return `<section class="card${S.closed[id] ? ' closed' : ''}${opts.accent ? ' accent' : ''}" data-card="${id}">
            <header class="card-h" data-toggle="${id}">${opts.icon ? icon(opts.icon, 'ic-lead') : ''}<span>${title}</span>${icon('chevUp', 'chev')}<span class="right">${opts.right || ''}</span></header>
            <div class="card-b">${body}</div></section>`;
    }

    function renderTool() {
        S.pickers = [];
        $('#toolTitle').textContent = t('head_' + S.tool);
        const body = $('#toolBody');
        const fn = PANELS[S.tool] || PANELS.view;
        body.innerHTML = fn();
        if (AFTER[S.tool]) AFTER[S.tool](body);
    }

    function mountPicker(host, value, onInput, onCommit) {
        const cp = new window.ColorPicker(host, { value, t, onInput, onCommit });
        S.pickers.push(cp);
        return cp;
    }

    function colorTargetLayer() {
        const L = selLayer();
        return L && (L.type === 'shape' || L.type === 'text' || (L.type === 'image' && L.tint)) ? L : null;
    }

    const PANELS = {};
    const AFTER = {};

    // ---------------------------------------------------- GÖRÜNÜM / STİL
    PANELS.view = () => {
        const L = selLayer();
        if (!L) return `<div class="empty">${icon('cursor')}<b>${t('no_sel')}</b>${t('no_sel_hint')}</div>`;
        let html = '';
        if (L.type === 'image') {
            html += card('imgtint', t('style'), `<div class="opt-row"><span>${t('image_tint')}</span><button class="sw${L.tint ? ' on' : ''}" data-act="imgTint"></button></div>`);
        }
        if (L.type !== 'image' || L.tint) html += card('color', t('color'), '<div data-cp="layer"></div>');
        return html;
    };
    AFTER.view = (body) => {
        const host = $('[data-cp="layer"]', body);
        const L = selLayer();
        if (host && L) mountPicker(host, L.color || '#ffffff', c => updateLayer(L, { color: c }, true), () => commit());
    };

    // ---------------------------------------------------- METİN
    PANELS.text = () => {
        const L = selLayer();
        const d = L && L.type === 'text' ? L : S.textDefaults;
        const isSel = L && L.type === 'text';
        const fonts = S.fonts.length ? S.fonts : [{ family: 'Impact', label: 'Impact' }];
        const fontOpts = fonts.map(f => `<option value="${esc(f.family)}"${d.font === f.family ? ' selected' : ''} style="font-family:'${esc(f.family)}'">${esc(f.label || f.family)}</option>`).join('');
        const tg = (k, label, style) => `<button class="btn${d[k] ? ' on' : ''}" data-tstyle="${k}" style="${style}">${label}</button>`;
        const al = (a, ic) => `<button class="btn${d.align === a ? ' on' : ''}" data-talign="${a}">${icon(ic)}</button>`;
        return card('text', t('text'), `
            <label class="lbl">${t('text_label')}</label>
            <textarea class="inp" data-t="text" maxlength="200" placeholder="${esc(t('text_default'))}">${isSel ? esc(d.text) : ''}</textarea>
            <label class="lbl">${t('font')}</label>
            <select class="sel" data-t="font">${fontOpts}</select>
            <div class="tog-grid" style="margin-top:.65rem">
                ${tg('bold', 'B', 'font-weight:800')}${tg('italic', 'I', 'font-style:italic')}${tg('underline', 'U', 'text-decoration:underline')}${tg('strike', 'S', 'text-decoration:line-through')}
            </div>
            <div class="grid2">
                <div><label class="lbl">${t('font_size')}</label><input class="inp mono" type="number" min="8" max="2000" data-t="fsize" value="${d.fsize}"></div>
                <div><label class="lbl">${t('letter_spacing')}</label><input class="inp mono" type="number" min="-200" max="2000" data-t="spacing" value="${d.spacing}"></div>
            </div>
            <div class="grid2">
                <div><label class="lbl">${t('line_spacing')}</label><input class="inp mono" type="number" min="0.5" max="4" step="0.01" data-t="line" value="${d.line}"></div>
            </div>
            <label class="lbl caps">${t('alignment')}</label>
            <div class="tog-grid">${al('left', 'alignLeft')}${al('center', 'alignCenter')}${al('right', 'alignRight')}${al('justify', 'alignJustify')}</div>
            ${isSel ? '' : `<button class="btn primary full" data-act="addText" style="margin-top:.8rem">${icon('plus')}${t('add_text')}</button>`}
        `) + card('tcolor', t('color'), '<div data-cp="text"></div>');
    };
    AFTER.text = (body) => {
        const host = $('[data-cp="text"]', body);
        const L = selLayer();
        const target = L && L.type === 'text' ? L : null;
        mountPicker(host, target ? target.color : S.textDefaults.color, c => {
            if (target) updateLayer(target, { color: c }, true); else S.textDefaults.color = c;
        }, () => { if (target) commit(); });
    };

    async function onTextInput(el, final) {
        const k = el.dataset.t;
        let v = el.value;
        if (k === 'fsize' || k === 'spacing' || k === 'line') {
            v = parseFloat(v);
            if (isNaN(v)) return;
            v = k === 'fsize' ? clamp(v, 8, 2000) : k === 'spacing' ? clamp(v, -200, 2000) : clamp(v, 0.5, 4);
        }
        const L = selLayer();
        if (L && L.type === 'text') {
            updateLayer(L, { [k]: v }, !final);
            if (k === 'font') warmFont(L);
            return;
        }
        if (k === 'text') {
            if (!String(v).trim()) return;
            // seçili metin yokken yazmaya başlamak yeni metin katmanı oluşturur
            const nl = await addText(v);
            if (nl) {
                renderTool();
                const ta = $('[data-t="text"]');
                if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
            }
            return;
        }
        S.textDefaults[k] = v;
    }

    function warmFont(L) {
        if (!document.fonts) return;
        document.fonts.load(`${L.italic ? 'italic ' : ''}${L.bold ? 700 : 400} 64px "${L.font}"`).then(() => { pushDesign(true); draw2d(); }).catch(() => {});
    }

    // ---------------------------------------------------- ŞEKİLLER
    PANELS.shapes = () => {
        const grid = E.SHAPE_ORDER.map(s => {
            // önizleme şeklin varsayılan en/boy oranını gösterir (dikdörtgen, elips...)
            const def = E.SHAPES[s];
            const a = def.w / def.h;
            const sx = a < 1 ? a : 1, sy = a > 1 ? 1 / a : 1;
            return `<button class="shape-btn" data-shape="${s}"><svg viewBox="-6 -6 112 112"><path transform="translate(50 50) scale(${sx.toFixed(3)} ${sy.toFixed(3)}) translate(-50 -50)" d="${def.d}"/></svg><span>${t('shape_' + s)}</span></button>`;
        }).join('');
        return card('shapes', t('shapes'), `<div class="shape-grid">${grid}</div>`) + card('scolor', t('color'), '<div data-cp="shape"></div>');
    };
    AFTER.shapes = (body) => {
        const L = selLayer();
        const target = L && L.type === 'shape' ? L : null;
        mountPicker($('[data-cp="shape"]', body), target ? target.color : S.shapeColor, c => {
            S.shapeColor = c;
            if (target) updateLayer(target, { color: c }, true);
        }, () => { if (target) commit(); });
    };

    // ---------------------------------------------------- KATMANLAR (seçili katmanın ayrıntıları)
    PANELS.layers = () => {
        const L = selLayer();
        if (!L) return `<div class="empty">${icon('layers')}<b>${t('no_sel')}</b>${t('no_sel_hint')}</div>`;
        let size = '';
        if (L.type !== 'text') {
            size = `<label class="lbl caps">${t('size')}</label>
                <div class="xy"><label><i>W</i><input class="inp" type="number" data-p="w" value="${Math.round(L.w)}"></label>
                <label><i>H</i><input class="inp" type="number" data-p="h" value="${Math.round(L.h)}"></label></div>`;
        }
        return propsHtml(L).replace('</div></div>', `${size}
            <div class="opt-row" style="margin-top:.6rem"><span>${t('lock_ratio')}</span><button class="sw${S.ratioLock ? ' on' : ''}" data-act="ratio"></button></div>
            <div class="grid2" style="margin-top:.4rem">
                <button class="btn" data-act="flipH">${icon('flipH')}${t('flip_h')}</button>
                <button class="btn" data-act="flipV">${icon('flipV')}${t('flip_v')}</button>
            </div>
            <button class="btn full" data-act="centerChart" style="margin-top:.55rem">${icon('target')}${t('center_chart')}</button>
        </div></div>`);
    };

    // ---------------------------------------------------- YÜZEYLER
    PANELS.surfaces = () => {
        const sf = S.surface;
        const kind = sf.kind || 'none';
        const charts = (sf.charts || []).map(c => `<button class="chart-item" data-chart="${c.id}" title="${t('chart_focus')}"><span>${t('chart_' + c.id)}</span><span class="mono">${Math.round(c.rect[2])}×${Math.round(c.rect[3])}</span></button>`).join('');
        const base = S.design.base && S.design.base.color;
        return card('skind', t('surface_kind'), `
                <div class="surface-kind"><i class="dot ${kind}"></i><div><b>${t('kind_' + kind)}</b>
                <small>${sf.pack ? `${t('pack')}: ${esc(sf.pack)} · ` : ''}${t('resolution')}: ${sf.texture || 0}px</small></div></div>
                <p class="card-note">${t('kind_' + kind + '_desc')}</p>`)
            + card('s2d', t('editor2d'), `
                <button class="btn full ${S.view2d ? 'on' : ''}" data-act="view2d">${icon('grid')}${S.view2d ? t('editor2d_close') : t('editor2d_open')}</button>
                <div class="opt-row" style="margin-top:.5rem"><span>${t('template')}</span><button class="sw${S.template ? ' on' : ''}" data-act="template"></button></div>
                ${charts ? `<div class="chart-list" style="margin-top:.5rem">${charts}</div>` : ''}`)
            + card('sbase', t('base_coat'), `
                <div class="opt-row"><span>${t('base_on')}</span><button class="sw${base ? ' on' : ''}" data-act="base"></button></div>
                ${base ? '<div data-cp="base" style="margin-top:.5rem"></div>' : `<p class="card-note">${t('base_none')}</p>`}`);
    };
    AFTER.surfaces = (body) => {
        const host = $('[data-cp="base"]', body);
        if (host) mountPicker(host, S.design.base.color, c => { S.design.base.color = c; pushDesign(); commitSoon(); }, () => commit());
    };

    // ---------------------------------------------------- GÖRSELLER
    function assetsList() {
        const recent = lsGet('lvd_assets_recent', []);
        const fav = lsGet('lvd_assets_fav', []);
        let list = S.assetTab === 'fav' ? fav : recent;
        const q = S.assetSearch.trim().toLowerCase();
        if (q) list = list.filter(u => u.toLowerCase().includes(q));
        return { list, fav };
    }
    PANELS.assets = () => {
        const { list, fav } = assetsList();
        const grid = list.length
            ? `<div class="asset-grid">${list.map(u => `<div class="asset" data-asset="${esc(u)}" style="background-image:url('${esc(u).replace(/'/g, '%27')}')">
                    <button class="fav${fav.includes(u) ? ' on' : ''}" data-fav="${esc(u)}">${icon('star', fav.includes(u) ? 'on' : '')}</button></div>`).join('')}</div>`
            : `<p class="card-note" style="text-align:center;padding:.8rem 0">${S.assetTab === 'fav' ? t('no_fav') : t('no_recent')}</p>`;
        return card('aadd', t('add_image'), `
                <p class="card-note" style="margin-top:0">${t('add_image_desc')}</p>
                <div class="row" style="margin-top:.7rem"><input class="inp" data-a="url" placeholder="https://i.imgur.com/..." value="${esc(S.assetUrl)}" style="flex:3">
                <button class="btn primary" data-act="addUrl" style="flex:1">${t('add')}</button></div>`, { icon: 'image' })
            + `<section class="card"><div class="card-b" style="padding-top:.9rem">
                <div class="search">${icon('search')}<input class="inp" data-a="search" placeholder="${t('search_url')}" value="${esc(S.assetSearch)}"></div>
                <div class="seg" style="margin-top:.6rem"><button class="${S.assetTab === 'recent' ? 'on' : ''}" data-atab="recent">${t('tab_recent')}</button>
                <button class="${S.assetTab === 'fav' ? 'on' : ''}" data-atab="fav">${t('tab_fav')}</button></div>
                ${grid}</div></section>`;
    };

    function rememberAsset(url) {
        const recent = lsGet('lvd_assets_recent', []).filter(u => u !== url);
        recent.unshift(url);
        lsSet('lvd_assets_recent', recent.slice(0, 30));
    }

    function addFromUrl(url) {
        url = (url || '').trim();
        // tasarım kodu da yapıştırılabilir (Kütüphane > Kodu kopyala)
        if (url.startsWith('LVD1:')) { importCode(url); return; }
        if (!/^https:\/\/\S+$/i.test(url)) { toast(t('bad_url'), { error: true }); return; }
        const img = new Image();
        img.onload = () => {
            rememberAsset(url);
            S.assetUrl = '';
            addImage(url, { w: img.naturalWidth, h: img.naturalHeight }).then(() => { if (S.tool === 'assets') renderTool(); });
        };
        img.onerror = () => toast(t('img_bad'), { error: true });
        img.src = url;
    }

    // ---------------------------------------------------- YAPAY ZEKA
    PANELS.ai = () => {
        if (!S.perms.ai) return `<div class="empty">${icon('sparkles')}<b>${t('ai_disabled')}</b></div>`;
        const ex = ['ai_ex1', 'ai_ex2', 'ai_ex3'].map(k => `<button class="example" data-ex="${esc(t(k))}">${esc(t(k))}</button>`).join('');
        const r = S.ai.result;
        const res = S.ai.busy
            ? `<div class="ph-empty"><i class="spinner"></i>${t('ai_generating')}</div>`
            : r ? `<img src="${r.view || r.data}" data-act="aiAdd" alt="">`
                : `<div class="ph-empty">${icon('image')}${t('no_image')}</div>`;
        return card('aigen', t('generate'), `
                <textarea class="inp" data-ai="prompt" maxlength="600" placeholder="${esc(t('ai_placeholder'))}" style="height:5.6rem">${esc(S.ai.prompt)}</textarea>
                <div class="examples">${ex}</div>
                <div class="opt-row"><span>${t('ai_removebg')}</span><button class="sw${S.ai.removeBg ? ' on' : ''}" data-act="aiBg"></button></div>
                <button class="btn primary full" data-act="aiGen" ${S.ai.busy ? 'disabled' : ''}>${icon('sparkles')}${S.ai.busy ? t('ai_generating') : t('ai_generate')}</button>`,
                { icon: 'sparkles', right: `<span class="pro">${t('pro')}</span>` })
            + card('aires', t('result'), `<div class="ai-result">${res}</div>
                ${r && !S.ai.busy ? `<button class="btn primary full" data-act="aiAdd" style="margin-top:.6rem">${icon('plus')}${t('ai_add')}</button>` : ''}`, { icon: 'image' });
    };

    async function aiGenerate() {
        const prompt = S.ai.prompt.trim();
        if (!prompt || S.ai.busy) return;
        S.ai.busy = true; renderTool();
        const r = await post('ai', { prompt });
        S.ai.busy = false;
        if (!r || !r.ok) {
            toast(r && r.error ? r.error : 'AI', { error: true });
            renderTool();
            return;
        }
        S.images[r.id] = r.data;
        S.ai.result = { id: r.id, data: r.data, view: null };
        if (S.ai.removeBg) {
            try { S.ai.result.view = await removeBackground(r.data); } catch (e) { S.ai.result.view = null; }
        }
        renderTool();
    }

    // Kenarlardan erişilen düz arka planı (beyaz/siyah) şeffaf yapar. Şeffaf PNG'lere dokunmaz.
    function removeBackground(dataUri) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                const w = img.naturalWidth, h = img.naturalHeight;
                const c = document.createElement('canvas'); c.width = w; c.height = h;
                const x = c.getContext('2d');
                x.drawImage(img, 0, 0);
                const d = x.getImageData(0, 0, w, h);
                const px = d.data;
                const corner = i => [px[i], px[i + 1], px[i + 2], px[i + 3]];
                const cs = [corner(0), corner((w - 1) * 4), corner((h - 1) * w * 4), corner(((h - 1) * w + w - 1) * 4)];
                if (cs.every(c4 => c4[3] < 10)) { resolve(null); return; } // zaten şeffaf
                const bg = cs[0];
                const tol = 48;
                const near = i => Math.abs(px[i] - bg[0]) + Math.abs(px[i + 1] - bg[1]) + Math.abs(px[i + 2] - bg[2]) < tol * 3 && px[i + 3] > 0;
                const seen = new Uint8Array(w * h);
                const stack = [];
                for (let xx = 0; xx < w; xx++) { stack.push(xx, (h - 1) * w + xx); }
                for (let yy = 0; yy < h; yy++) { stack.push(yy * w, yy * w + w - 1); }
                while (stack.length) {
                    const p = stack.pop();
                    if (seen[p]) continue;
                    seen[p] = 1;
                    const i = p * 4;
                    if (!near(i)) continue;
                    px[i + 3] = 0;
                    const xx = p % w, yy = (p / w) | 0;
                    if (xx > 0) stack.push(p - 1);
                    if (xx < w - 1) stack.push(p + 1);
                    if (yy > 0) stack.push(p - w);
                    if (yy < h - 1) stack.push(p + w);
                }
                x.putImageData(d, 0, 0);
                resolve(c.toDataURL('image/png'));
            };
            img.onerror = reject;
            img.src = dataUri;
        });
    }

    async function aiAdd() {
        const r = S.ai.result;
        if (!r) return;
        let id = r.id;
        if (r.view) {
            // arka planı temizlenmiş sürümü sunucuya yeni görsel olarak kaydet
            const up = await post('uploadImage', { data: r.view });
            if (up && up.ok) { id = up.id; S.images[id] = r.view; }
        }
        post('image', { id, data: S.images[id] });
        const img = new Image();
        img.onload = () => addImage('img:' + id, { w: img.naturalWidth, h: img.naturalHeight });
        img.src = S.images[id];
    }

    // ---------------------------------------------------- MODİFİYE
    PANELS.tuning = () => {
        const tu = S.design.tuning;
        const custom = tu.paint === 'custom';
        const tints = [0, 1, 2, 3, 4, 5, 6].map(i => `<option value="${i}"${tu.tint === i ? ' selected' : ''}>${t('tint_' + i)}</option>`).join('');
        const extras = (S.veh.extras || []);
        const extraBtns = [];
        const maxExtra = Math.max(10, ...extras.map(e => e.id));
        for (let i = 1; i <= Math.min(14, maxExtra); i++) {
            const ex = extras.find(e => e.id === i);
            const on = ex && (tu.extras[i] != null ? tu.extras[i] : ex.on);
            extraBtns.push(`<button class="btn${on ? ' on' : ''}${ex ? '' : ' na'}" data-extra="${i}">${i}</button>`);
        }
        return card('paint', t('paint'), `
                <div class="grid2"><button class="btn${custom ? '' : ' on'}" data-paint="keep">${t('keep_current')}</button>
                <button class="btn${custom ? ' on' : ''}" data-paint="custom">${t('custom_paint')}</button></div>
                <div class="grid2" style="margin-top:.45rem">
                    <button class="swatch-btn${custom ? '' : ' dis'}" data-swatch="primary" style="--c:${tu.primary}"><i></i>${t('primary')}</button>
                    <button class="swatch-btn${custom ? '' : ' dis'}" data-swatch="secondary" style="--c:${tu.secondary}"><i></i>${t('secondary')}</button>
                </div><div data-pop="paint"></div>`)
            + card('win', t('windows'), `<select class="sel" data-tune="tint">${tints}</select>`)
            + card('neon', t('neon'), `
                <button class="swatch-btn" data-swatch="neon" style="--c:${tu.neon.color}"><i></i>${t('neon_color')}</button><div data-pop="neon"></div>`,
                { right: `<button class="sw${tu.neon.on ? ' on' : ''}" data-act="neon"></button>` })
            + card('extras', t('extras'), extras.length ? `<div class="extras">${extraBtns.join('')}</div>` : `<p class="card-note" style="margin-top:0">${t('no_extras')}</p>`);
    };

    let openSwatch = null;
    function toggleSwatch(which) {
        openSwatch = openSwatch === which ? null : which;
        $$('[data-pop]').forEach(p => { p.innerHTML = ''; });
        if (!openSwatch) return;
        const tu = S.design.tuning;
        const host = $(`[data-pop="${which === 'neon' ? 'neon' : 'paint'}"]`);
        if (!host) return;
        host.innerHTML = '<div class="pop-picker"></div>';
        const cur = which === 'neon' ? tu.neon.color : tu[which];
        mountPicker($('.pop-picker', host), cur, c => {
            if (which === 'neon') tu.neon.color = c; else tu[which] = c;
            const sb = $(`[data-swatch="${which}"]`);
            if (sb) sb.style.setProperty('--c', c);
            pushTuning();
        }, () => commit());
    }

    // ---------------------------------------------------- EKİPMAN
    const COLOR_HEX = { red: '#ff2b2b', blue: '#2e6bff', amber: '#ff9a00', white: '#f2f2f2', green: '#19ff7a' };

    function equipThumb(item) {
        const cols = (item.colors || []).map(c => COLOR_HEX[c] || '#ccc');
        const glow = c => `<circle r="7" fill="${c}" opacity=".35"/>`;
        switch (item.icon) {
            case 'bar': {
                const n = cols.length || 4, w = 84 / n;
                const segs = cols.map((c, i) => `<rect x="${8 + i * w}" y="28" width="${w - 2}" height="9" rx="2" fill="${c}"/><rect x="${8 + i * w}" y="28" width="${w - 2}" height="3" rx="1.5" fill="#fff" opacity=".55"/>`).join('');
                return `<svg viewBox="0 0 100 60"><rect x="5" y="25" width="90" height="15" rx="5" fill="#26262c" stroke="#3a3a42"/>${segs}<rect x="10" y="40" width="6" height="6" fill="#222"/><rect x="84" y="40" width="6" height="6" fill="#222"/></svg>`;
            }
            case 'beacon': {
                const c = cols[0] || '#f33';
                return `<svg viewBox="0 0 100 60"><rect x="36" y="44" width="28" height="8" rx="2" fill="#2a2a30"/><path d="M38 44 V30 a12 12 0 0 1 24 0 V44z" fill="${c}"/><path d="M42 30 a8 8 0 0 1 8 -8" stroke="#fff" stroke-width="3" fill="none" opacity=".6"/><circle cx="50" cy="32" r="22" fill="${c}" opacity=".18"/></svg>`;
            }
            case 'led': case 'pair': case 'strip': {
                const n = cols.length, gap = 80 / Math.max(1, n);
                return `<svg viewBox="0 0 100 60">${cols.map((c, i) => `<g transform="translate(${10 + gap * (i + 0.5)} 30)">${glow(c)}<rect x="-${Math.min(9, gap / 2 - 1)}" y="-4" width="${Math.min(18, gap - 2)}" height="8" rx="2" fill="${c}"/></g>`).join('')}</svg>`;
            }
            case 'text':
                return `<svg viewBox="0 0 100 60"><rect x="14" y="14" width="72" height="32" rx="4" fill="none" stroke="#666" stroke-dasharray="4 3"/><text x="50" y="37" font-size="16" font-weight="700" fill="#ddd" text-anchor="middle" font-family="Oswald, Impact">1-A-12</text></svg>`;
            case 'decal':
                return `<img src="decals/${esc(item.decal)}.svg" alt="">`;
            default:
                return `<svg viewBox="0 0 100 60"><rect x="30" y="16" width="40" height="30" rx="4" fill="#2c2c33" stroke="#4a4a52"/><path d="M38 24h24M38 31h24M38 38h14" stroke="#7d7d86" stroke-width="2.5" stroke-linecap="round"/></svg>`;
        }
    }

    PANELS.equipment = () => {
        const q = S.equipSearch.trim().toLowerCase();
        const items = S.catalogue.filter(i => (q ? nm(i).toLowerCase().includes(q) : i.cat === S.equipCat));
        const chips = S.categories.map(c => `<button class="chip${S.equipCat === c.id && !q ? ' on' : ''}" data-ecat="${c.id}">${esc(nm(c))}</button>`).join('');
        const placing = S.placing ? equipItem(S.placing) : null;
        const placeBox = placing ? `<div class="place-box">${t('place_hint', { name: esc(nm(placing)) })}
                <div class="row">${placing.roof ? `<button class="btn primary" data-act="equipRoof">${t('add_roof')}</button>` : ''}<button class="btn" data-act="equipCancel">${t('cancel')}</button></div></div>` : '';
        const grid = `<div class="equip-grid">${items.map(i => `<button class="equip${S.placing === i.id ? ' on' : ''}" data-eitem="${i.id}" title="${esc(nm(i))}"><div class="th">${equipThumb(i)}</div><span>${esc(nm(i))}</span></button>`).join('')}</div>`;

        const list = S.design.equipment;
        const onVeh = list.length
            ? `<div class="on-veh">${list.map(e => {
                const it = equipItem(e.item);
                const dots = ((it && it.colors) || []).slice(0, 6).map(c => `<i style="background:${COLOR_HEX[c] || '#999'}"></i>`).join('');
                return `<div class="on-item${S.selEquip === e.uid ? ' on' : ''}" data-einst="${e.uid}"><span class="dots">${dots}</span><span class="nm">${esc(it ? nm(it) : e.item)}</span><button data-edel="${e.uid}">${icon('trash')}</button></div>`;
            }).join('')}</div>`
            : `<p class="card-note" style="margin-top:0">${t('no_equipment')}</p>`;

        const sel = S.selEquip ? equipInst(S.selEquip) : null;
        let selCard = '';
        if (sel) {
            const it = equipItem(sel.item);
            const sr = (k, i, min, max, step, val) => `<div class="slider-row"><span>${'XYZ'[i]}</span>
                <input type="range" class="rng thin" min="${min}" max="${max}" step="${step}" value="${val}" data-eq="${k}" data-i="${i}" style="--p:${(val - min) / (max - min) * 100}%">
                <input class="inp" type="number" step="${step}" value="${val}" data-eqn="${k}" data-i="${i}"></div>`;
            const b = S.veh.bounds || { min: [-1.2, -2.6, -0.6], max: [1.2, 2.6, 1.6] };
            const posRows = [0, 1, 2].map(i => sr('pos', i, round(b.min[i] - 0.6, 2), round(b.max[i] + 0.6, 2), 0.005, round(sel.pos[i], 3))).join('');
            const rotRows = [0, 1, 2].map(i => sr('rot', i, -180, 180, 1, round(sel.rot[i], 1))).join('');
            selCard = card('esel', esc(it ? nm(it) : sel.item), `
                <label class="lbl caps" style="margin-top:.2rem">${t('pos_m')}</label>${posRows}
                <label class="lbl caps">${t('rot_deg')}</label>${rotRows}
                <div class="grid2" style="margin-top:.7rem">
                    <button class="btn" data-act="eDup">${icon('copy')}${t('duplicate')}</button>
                    <button class="btn" data-act="eMirror">${icon('mirror')}${t('mirror')}</button>
                    <button class="btn" data-act="eFocus">${icon('info')}${t('focus')}</button>
                    <button class="btn" data-act="eRemove">${icon('trash')}${t('remove')}</button>
                </div>
                <p class="card-note">${t('equip_keys')}</p>`, { accent: true });
        }

        return card('ecat', t('catalogue'), `
                <div class="search">${icon('search')}<input class="inp" data-e="search" placeholder="${t('search_equipment')}" value="${esc(S.equipSearch)}"></div>
                <div class="chips">${chips}</div>${placeBox}${grid}`, { accent: true })
            + card('eon', t('on_vehicle', { n: list.length, max: S.limits.equipment }), onVeh)
            + selCard
            + card('eopt', t('options'), `
                <div class="opt-row"><span>${t('test_lights')}</span><button class="sw${S.testLights ? ' on' : ''}" data-act="eTest"></button></div>
                <div class="opt-row"><span>${t('tilt')}</span><button class="sw${S.tilt ? ' on' : ''}" data-act="eTilt"></button></div>
                <p class="card-note">${t('equip_saved_note')}</p><p class="card-note">${t('equip_drive_note')}</p>`, { accent: true });
    };

    function addEquipment(itemId, pos, rot, keepPlacing) {
        if (S.design.equipment.length >= S.limits.equipment) { toast(t('equip_full'), { error: true }); S.placing = null; renderTool(); return; }
        const inst = { uid: E.uid('e'), item: itemId, pos: pos.map(v => round(v, 3)), rot: (rot || [0, 0, 0]).map(v => round(v, 1)) };
        S.design.equipment.push(inst);
        S.selEquip = inst.uid;
        if (!keepPlacing) S.placing = null;
        renderTool(); renderHints();
        pushEquipment(true);
        commit();
    }

    async function pickEquipItem(id) {
        const it = equipItem(id);
        if (!it) return;
        if (it.cat === 'callsigns' && it.text) { addCallsign(it); return; }
        if (it.decal) {
            // hazır çıkartma: tasarıma görsel katmanı olarak eklenir
            const img = new Image();
            img.onload = () => addImage('decal:' + it.decal, { w: img.naturalWidth || 512, h: img.naturalHeight || 512 })
                .then(L => { if (L) { L.name = nextName(nm(it)); renderLayers(); toast(t('decal_added')); } });
            img.src = 'decals/' + it.decal + '.svg';
            return;
        }
        S.placing = S.placing === id ? null : id;
        renderTool(); renderHints();
        pushEquipment(true);
    }

    function addCallsign(it) {
        const tx = it.text;
        const c = (S.surface.charts || []).find(x => x.id === tx.chart);
        const x = c ? c.rect[0] + c.rect[2] / 2 : S.design.size / 2;
        const y = c ? c.rect[1] + c.rect[3] / 2 : S.design.size / 2;
        addLayer({
            id: E.uid(), type: 'text', name: nextName(nm(it)), visible: true, locked: false, x: Math.round(x), y: Math.round(y),
            rot: tx.rot || 0, sx: 100, sy: 100, opacity: 100, blend: 'normal', color: '#ffffff', text: tx.value,
            font: tx.font || 'Oswald', bold: !!tx.bold, italic: false, underline: false, strike: false, fsize: tx.size || 160, spacing: 40, line: 1.1, align: 'center',
        });
        toast(t('callsign_added'));
    }

    function equipSet(uid, patch, live) {
        const e = equipInst(uid);
        if (!e) return;
        Object.assign(e, patch);
        pushEquipment();
        if (live) commitSoon(); else commit();
    }

    function equipNudge(key, shift) {
        const e = equipInst(S.selEquip);
        if (!e) return false;
        const st = shift ? 0.05 : 0.01, rs = shift ? 15 : 5;
        const p = e.pos.slice(), r = e.rot.slice();
        switch (key) {
            case 'ArrowLeft': p[0] -= st; break;
            case 'ArrowRight': p[0] += st; break;
            case 'ArrowUp': p[1] += st; break;
            case 'ArrowDown': p[1] -= st; break;
            case 'PageUp': p[2] += st; break;
            case 'PageDown': p[2] -= st; break;
            case 'q': case 'Q': r[2] = ((r[2] + rs + 180) % 360) - 180; break;
            case 'e': case 'E': r[2] = ((r[2] - rs + 540) % 360) - 180; break;
            default: return false;
        }
        e.pos = p.map(v => round(v, 3));
        e.rot = r.map(v => round(v, 1));
        pushEquipment();
        commitSoon();
        refreshEquipInputs();
        return true;
    }

    function refreshEquipInputs() {
        const e = equipInst(S.selEquip);
        if (!e) return;
        $$('[data-eq]').forEach(r => {
            const k = r.dataset.eq, i = +r.dataset.i;
            r.value = e[k][i];
            r.style.setProperty('--p', ((e[k][i] - r.min) / (r.max - r.min) * 100) + '%');
        });
        $$('[data-eqn]').forEach(n => { if (document.activeElement !== n) n.value = e[n.dataset.eqn][+n.dataset.i]; });
    }

    // ---------------------------------------------------- KÜTÜPHANE
    PANELS.library = () => {
        const items = S.lib.items;
        const top = `<div class="grid2" style="margin-bottom:.7rem">
                <button class="btn" data-act="libNew">${icon('plus')}${t('new_design')}</button>
                <button class="btn" data-act="libImport">${icon('upload')}${t('import_code')}</button>
                <button class="btn" data-act="libExport" style="grid-column:span 2">${icon('copy')}${t('copy_code')}</button></div>`;
        let body;
        if (!items) body = `<p class="card-note" style="text-align:center">${t('loading')}</p>`;
        else if (!items.length) body = `<p class="card-note" style="text-align:center;margin-top:0">${t('no_designs')}</p>`;
        else body = `<div class="lib-list">${items.map(d => {
            const tags = (d.assigned || []).map(a => `<span class="tag">${esc(a.scope === 'plate' ? t('assigned_plate', { p: a.key }) : t('assigned_model', { m: a.label || a.key }))}</span>`).join('');
            const cur = S.meta.id === d.id;
            return `<div class="lib${cur ? ' cur' : ''}"><div class="th" style="background-image:url('${d.thumb || ''}')"></div>
                <div class="meta"><div class="nm">${esc(d.name)}</div><div class="sb">${esc(d.modelLabel || '')} · ${esc(d.updated || '')}</div>
                <div class="tags">${cur ? `<span class="tag">${t('on_this')}</span>` : ''}${tags}</div>
                <div class="acts"><button class="btn primary" data-lib="open" data-id="${d.id}">${t('open')}</button>
                ${d.mine ? `<button class="btn" data-lib="rename" data-id="${d.id}">${t('rename')}</button><button class="btn danger" data-lib="delete" data-id="${d.id}">${t('del')}</button>` : ''}
                ${d.onVehicle ? `<button class="btn" data-lib="unassign" data-id="${d.id}">${t('unassign')}</button>` : ''}</div></div></div>`;
        }).join('')}</div>`;
        return top + card('lib', t('my_designs'), body);
    };

    async function loadLibrary() {
        S.lib.items = null;
        if (S.tool === 'library') renderTool();
        const r = await post('library', { op: 'list' });
        S.lib.items = (r && r.items) || [];
        if (S.tool === 'library') renderTool();
    }

    async function libAction(op, id) {
        const d = (S.lib.items || []).find(x => x.id === id);
        if (op === 'open') {
            const go = async () => {
                busy(true, t('loading'));
                const r = await post('library', { op: 'get', id });
                busy(false);
                if (!r || !r.design) return;
                loadDesign(r.design, { id: r.id, name: r.name, mine: r.mine });
                toast(t('loaded'));
            };
            if (S.dirty) confirmBox(t('close_title'), t('close_desc'), t('open'), go, true); else go();
        } else if (op === 'rename' && d) {
            promptBox(t('rename'), d.name, async v => {
                v = v.trim(); if (!v) return;
                await post('library', { op: 'rename', id, name: v });
                if (S.meta.id === id) S.meta.name = v;
                loadLibrary();
            });
        } else if (op === 'delete' && d) {
            confirmBox(t('del'), t('confirm_delete', { name: esc(d.name) }), t('del'), async () => {
                await post('library', { op: 'delete', id });
                if (S.meta.id === id) { S.meta.id = null; setDirty(true); }
                loadLibrary();
            }, true);
        } else if (op === 'unassign') {
            await post('library', { op: 'unassign', id });
            loadLibrary();
        }
    }

    function exportCode() {
        const payload = { v: 1, size: S.design.size, base: S.design.base, layers: S.design.layers, equipment: S.design.equipment, tuning: S.design.tuning };
        const code = 'LVD1:' + btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
        copyText(code);
        toast(t('code_copied'));
    }
    function copyText(text) {
        const ta = document.createElement('textarea');
        ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); } catch (e) { /* yok say */ }
        ta.remove();
    }
    function importCode(code) {
        try {
            const json = decodeURIComponent(escape(atob(code.trim().replace(/^LVD1:/, ''))));
            const d = JSON.parse(json);
            if (!d || !Array.isArray(d.layers)) throw new Error('bad');
            loadDesign(d, { id: null, name: '', mine: true }, true);
            toast(t('design_code'));
        } catch (e) { toast(t('code_bad'), { error: true }); }
    }

    // ================================================================== TASARIM YÜKLE
    function normalizeDesign(d) {
        const out = emptyDesign();
        if (!d) return out;
        out.size = d.size || 4096;
        out.base = d.base && typeof d.base === 'object' ? { color: d.base.color || null } : { color: null };
        out.layers = Array.isArray(d.layers) ? d.layers.filter(l => l && l.id && l.type) : [];
        for (const L of out.layers) {
            if (L.visible == null) L.visible = true;
            if (L.opacity == null) L.opacity = 100;
            if (!L.blend) L.blend = 'normal';
            if (L.sx == null) L.sx = 100;
            if (L.sy == null) L.sy = 100;
            if (L.rot == null) L.rot = 0;
        }
        out.equipment = Array.isArray(d.equipment) ? d.equipment.filter(e => e && e.item && Array.isArray(e.pos)) : [];
        for (const e of out.equipment) { if (!e.uid) e.uid = E.uid('e'); if (!Array.isArray(e.rot)) e.rot = [0, 0, 0]; }
        out.tuning = d.tuning || null;
        return out;
    }

    function defaultTuning() {
        const c = S.veh.current || {};
        const extras = {};
        for (const e of S.veh.extras || []) extras[e.id] = !!e.on;
        return {
            paint: 'keep',
            primary: c.primary || '#ffffff',
            secondary: c.secondary || '#111111',
            tint: c.tint != null && c.tint >= 0 ? c.tint : 0,
            neon: { on: !!c.neonOn, color: c.neonColor || '#ff00ff' },
            extras,
        };
    }

    function loadDesign(d, meta, keepMeta) {
        const nd = normalizeDesign(d);
        if (!nd.tuning) nd.tuning = defaultTuning();
        if (!nd.tuning.neon || Array.isArray(nd.tuning.neon)) nd.tuning.neon = { on: false, color: '#ff00ff' };
        // Lua boş tabloyu [] olarak kodlar; ekstralar her zaman nesne olmalı
        if (!nd.tuning.extras || Array.isArray(nd.tuning.extras)) nd.tuning.extras = {};
        S.design = nd;
        if (!keepMeta) S.meta = meta || { id: null, name: '', mine: true };
        S.sel = null; S.selEquip = null; S.placing = null;
        requestImages();
        renderAll();
        pushDesign(true); pushEquipment(true); pushTuning(true);
        if (keepMeta) { commit(); } else { resetHistory(); setDirty(false); }
    }

    // img:<id> görselleri editörde de lazım
    function requestImages() {
        for (const L of S.design.layers) {
            if (L.type !== 'image' || typeof L.src !== 'string' || !L.src.startsWith('img:')) continue;
            const id = L.src.slice(4);
            if (S.images[id] || S.imageReq[id]) continue;
            S.imageReq[id] = true;
            post('getImage', { id }).then(r => {
                if (r && r.data) { S.images[id] = r.data; pushDesign(true); draw2d(); }
            });
        }
    }

    // ================================================================== KAYDET
    function thumbnail() {
        if (E.isTainted(S.design)) return null;
        try {
            const c = document.createElement('canvas');
            c.width = c.height = 320;
            const x = c.getContext('2d');
            x.fillStyle = '#101015'; x.fillRect(0, 0, 320, 320);
            const k = 320 / S.design.size;
            x.strokeStyle = 'rgba(255,255,255,.12)'; x.lineWidth = 1;
            for (const ch of S.surface.charts || []) x.strokeRect(ch.rect[0] * k, ch.rect[1] * k, ch.rect[2] * k, ch.rect[3] * k);
            E.render(x, duiDesign(), { clear: false, charts: S.surface.charts });
            return c.toDataURL('image/jpeg', 0.78);
        } catch (e) { return null; }
    }

    function openSave() {
        const model = S.veh.label || S.veh.name || '';
        let scope = 'plate';
        const name = S.meta.name || `${model} ${S.veh.plate || ''}`.trim();
        const html = () => `<div class="modal">
            <div class="modal-h"><span class="mi">${icon('save')}</span><div><h3>${t('save_title')}</h3><small>${esc(model)} · ${esc(S.veh.plate || '')}</small></div>
                <button class="ib" data-x>${icon('x')}</button></div>
            <div class="modal-b">
                <label class="lbl caps">${t('who_gets')}</label>
                <div class="choice${scope === 'plate' ? ' on' : ''}" data-scope="plate">${icon('car')}<div class="ct"><b>${t('this_only')}</b>
                    <p>${t('this_only_desc', { plate: esc(S.veh.plate || ''), model: esc(model) })}</p></div><i class="radio"></i></div>
                <div class="choice${scope === 'model' ? ' on' : ''}${S.perms.modelScope ? '' : ' dis'}" data-scope="model">${icon('grid')}<div class="ct"><b>${t('all_model', { model: esc(model) })}</b>
                    <p>${S.perms.modelScope ? t('all_model_desc', { model: esc(model) }) : t('no_model_perm')}</p></div><i class="radio"></i></div>
                <label class="lbl">${t('design_name')}</label>
                <input class="inp" data-name maxlength="40" value="${esc(name)}">
            </div>
            <div class="modal-f"><button class="btn" data-x>${t('cancel')}</button>
                <button class="btn primary grow" data-save>${icon('save')}${scope === 'plate' ? t('save_this') : t('save_all', { model: esc(model.toUpperCase()) })}</button></div></div>`;
        const bind = m => {
            $$('[data-x]', m).forEach(b => b.onclick = closeModal);
            $$('[data-scope]', m).forEach(c => c.onclick = () => {
                const nv = $('[data-name]', m).value;
                scope = c.dataset.scope;
                modal(html(), bind);
                $('[data-name]').value = nv;
            });
            $('[data-save]', m).onclick = async () => {
                const btn = $('[data-save]', m);
                btn.disabled = true; btn.textContent = t('saving');
                const nm2 = $('[data-name]', m).value.trim().slice(0, 40) || name;
                const r = await post('save', {
                    scope, name: nm2, id: S.meta.mine ? S.meta.id : null,
                    design: { v: 1, size: S.design.size, base: S.design.base, layers: S.design.layers, equipment: S.design.equipment, tuning: S.design.tuning },
                    thumb: thumbnail(),
                });
                if (r && r.ok) {
                    closeModal();
                    S.meta = { id: r.id, name: nm2, mine: true };
                    setDirty(false);
                    S.hist = [snapshot()]; S.future = []; updateUndo();
                    S.lib.items = null;
                    toast(r.message || t('save_ok'));
                } else {
                    btn.disabled = false;
                    btn.innerHTML = icon('save') + (scope === 'plate' ? t('save_this') : t('save_all', { model: esc(model.toUpperCase()) }));
                    toast((r && r.error) || 'Error', { error: true });
                }
            };
        };
        modal(html(), bind);
    }

    // ================================================================== SİL / KAPAT
    function deleteAction() {
        if (S.tool === 'equipment' && S.selEquip) { removeEquip(S.selEquip); return; }
        if (S.sel) { removeLayer(S.sel); return; }
        if (!S.design.layers.length) return;
        confirmBox(t('delete_title'), t('delete_desc'), t('delete_all'), () => {
            S.design.layers = [];
            S.sel = null;
            renderAll(); pushDesign(true); commit();
        }, true);
    }

    function removeEquip(uid) {
        S.design.equipment = S.design.equipment.filter(e => e.uid !== uid);
        if (S.selEquip === uid) S.selEquip = null;
        renderTool(); pushEquipment(true); commit();
    }

    function requestClose() {
        if (modalOpen()) { closeModal(); return; }
        if (S.dirty) {
            confirmBox(t('close_title'), t('close_desc'), t('discard'), () => post('close', { discard: true }), true);
            const keep = $('#modal [data-x].btn');
            if (keep) keep.textContent = t('keep_editing');
        } else {
            post('close', {});
        }
    }

    // ================================================================== 2B DÜZENLEYİCİ
    const cv = () => $('#cv2d');
    function draw2d() {
        if (!S.view2d) return;
        const c = cv();
        const r = c.getBoundingClientRect();
        const px = Math.max(256, Math.round(r.width));
        if (c.width !== px) { c.width = px; c.height = px; }
        const x = c.getContext('2d');
        x.setTransform(1, 0, 0, 1, 0, 0);
        x.fillStyle = '#0d0d12';
        x.fillRect(0, 0, px, px);
        const k = px / S.design.size;
        if (S.template && S.surface.template) {
            // paket şablonu: aracın yüzeylerdeki silueti (tools/packbuilder üretir)
            const tpl = E.getImage(S.surface.template);
            if (tpl) x.drawImage(tpl, 0, 0, px, px);
        }
        if (S.template) {
            x.font = `${Math.round(12 * px / 700)}px Chakra Petch, sans-serif`;
            for (const ch of S.surface.charts || []) {
                x.fillStyle = 'rgba(255,255,255,.035)';
                x.fillRect(ch.rect[0] * k, ch.rect[1] * k, ch.rect[2] * k, ch.rect[3] * k);
                x.strokeStyle = 'rgba(255,255,255,.18)';
                x.setLineDash([6, 5]);
                x.strokeRect(ch.rect[0] * k + .5, ch.rect[1] * k + .5, ch.rect[2] * k, ch.rect[3] * k);
                x.setLineDash([]);
                x.fillStyle = 'rgba(255,255,255,.35)';
                x.fillText(t('chart_' + ch.id).toUpperCase(), ch.rect[0] * k + 6, ch.rect[1] * k + 16 * px / 700);
            }
        }
        E.render(x, duiDesign(), { clear: false, charts: S.surface.charts, width: px, height: px });
        const L = selLayer();
        if (L) {
            const pts = E.corners(L);
            x.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#ff2e93';
            x.lineWidth = 2;
            x.beginPath();
            pts.forEach((p, i) => i ? x.lineTo(p[0] * k, p[1] * k) : x.moveTo(p[0] * k, p[1] * k));
            x.closePath();
            x.stroke();
        }
    }

    function setView2d(on) {
        S.view2d = on;
        $('#view2d').classList.toggle('hidden', !on);
        post('view2d', { on });
        if (on) requestAnimationFrame(draw2d);
        if (S.tool === 'surfaces') renderTool();
    }

    function canvasPoint(ev) {
        const r = cv().getBoundingClientRect();
        return { x: (ev.clientX - r.left) / r.width * S.design.size, y: (ev.clientY - r.top) / r.height * S.design.size };
    }

    function bind2d() {
        const c = cv();
        c.addEventListener('pointerdown', ev => {
            if (ev.button !== 0) return;
            const p = canvasPoint(ev);
            const L = E.hitTest(S.design, p.x, p.y);
            select(L ? L.id : null);
            if (!L) return;
            c.setPointerCapture(ev.pointerId);
            const off = { x: L.x - p.x, y: L.y - p.y };
            let moved = false;
            const mv = e2 => {
                const q = canvasPoint(e2);
                L.x = Math.round(q.x + off.x); L.y = Math.round(q.y + off.y);
                moved = true;
                refreshPropInputs(); pushDesign();
            };
            const up = () => {
                c.removeEventListener('pointermove', mv);
                c.removeEventListener('pointerup', up);
                if (moved) commit();
            };
            c.addEventListener('pointermove', mv);
            c.addEventListener('pointerup', up);
        });
        c.addEventListener('wheel', ev => {
            const L = selLayer();
            if (!L || L.locked) return;
            ev.preventDefault();
            if (ev.shiftKey) L.rot = (((L.rot || 0) + (ev.deltaY > 0 ? 5 : -5)) % 360 + 360) % 360;
            else { const f = ev.deltaY > 0 ? 0.95 : 1.05; L.sx = round(L.sx * f, 2); L.sy = round(L.sy * f, 2); }
            refreshPropInputs(); pushDesign(); commitSoon();
        }, { passive: false });
        window.addEventListener('resize', draw2d);
    }

    // ================================================================== 3B GÖRÜNÜM (viewport)
    let vpButtons = 0, moveQueued = null;
    function vpPos(ev) { return { x: ev.clientX / window.innerWidth, y: ev.clientY / window.innerHeight }; }

    function bindViewport() {
        const vp = $('#viewport');
        vp.addEventListener('contextmenu', e => e.preventDefault());
        vp.addEventListener('mousedown', ev => {
            if (S.view2d) return;
            vpButtons |= (1 << ev.button);
            const p = vpPos(ev);
            if (ev.button === 2) vp.classList.add('grab');
            post('viewport', { type: 'down', btn: ev.button, x: p.x, y: p.y, shift: ev.shiftKey, mode: S.tool === 'equipment' ? 'equip' : 'design' });
        });
        window.addEventListener('mousemove', ev => {
            if (!S.open || !vpButtons) return;
            const p = vpPos(ev);
            if (moveQueued) { moveQueued.x = p.x; moveQueued.y = p.y; moveQueued.shift = ev.shiftKey; return; }
            moveQueued = { type: 'move', x: p.x, y: p.y, shift: ev.shiftKey, buttons: vpButtons, mode: S.tool === 'equipment' ? 'equip' : 'design' };
            requestAnimationFrame(() => { const m = moveQueued; moveQueued = null; post('viewport', m); });
        });
        window.addEventListener('mouseup', ev => {
            if (!vpButtons) return;
            vpButtons &= ~(1 << ev.button);
            if (ev.button === 2) vp.classList.remove('grab');
            const p = vpPos(ev);
            post('viewport', { type: 'up', btn: ev.button, x: p.x, y: p.y, shift: ev.shiftKey, mode: S.tool === 'equipment' ? 'equip' : 'design' });
        });
        vp.addEventListener('wheel', ev => {
            if (S.view2d) return;
            post('viewport', { type: 'wheel', delta: Math.sign(ev.deltaY) });
        }, { passive: true });
    }

    // Lua: araca tıklanan nokta (tasarım modu)
    function onPick(m) {
        const charts = S.surface.charts || [];
        if (!charts.length) return;
        if (m.phase === 'down') {
            if (!m.hit) { select(null); S.drag = null; return; }
            const p = E.pick(charts, m.lp, m.ln);
            if (!p) return;
            const L = E.hitTest(S.design, p.x, p.y);
            if (L) {
                select(L.id);
                S.drag = { id: L.id, chart: p.chart, dx: L.x - p.x, dy: L.y - p.y, moved: false };
            } else {
                select(null);
                S.drag = null;
            }
        } else if (m.phase === 'drag' && S.drag) {
            if (!m.hit) return;
            const L = layer(S.drag.id);
            if (!L || L.locked) return;
            const p = E.pick(charts, m.lp, m.ln);
            if (!p) return;
            if (p.chart !== S.drag.chart) { S.drag.chart = p.chart; S.drag.dx = 0; S.drag.dy = 0; }
            L.x = Math.round(p.x + S.drag.dx);
            L.y = Math.round(p.y + S.drag.dy);
            S.drag.moved = true;
            refreshPropInputs();
            pushDesign();
        } else if (m.phase === 'up') {
            if (S.drag && S.drag.moved) commit();
            S.drag = null;
        }
    }

    // Lua: ekipman modu tıklamaları
    function onEquipPick(m) {
        if (m.phase === 'place' && S.placing) {
            addEquipment(S.placing, m.pos, m.rot, !!m.shift);
        } else if (m.phase === 'select') {
            S.selEquip = m.uid || null;
            if (m.uid) S.placing = null;
            renderTool(); renderHints();
            pushEquipment(true);
        } else if (m.phase === 'move' && m.uid) {
            const e = equipInst(m.uid);
            if (!e) return;
            e.pos = m.pos.map(v => round(v, 3));
            if (m.rot) e.rot = m.rot.map(v => round(v, 1));
            refreshEquipInputs();
            pushEquipment();
        } else if (m.phase === 'up') {
            commit();
        }
    }

    // ================================================================== OLAYLAR
    function bindUi() {
        $('#toolbar').addEventListener('click', e => { const b = e.target.closest('[data-tool]'); if (b) setTool(b.dataset.tool); });
        $('#camBar').addEventListener('click', e => { const b = e.target.closest('[data-cam]'); if (b) post('cam', { preset: b.dataset.cam }); });
        $('#btnUndo').onclick = undo;
        $('#btnRedo').onclick = redo;
        $('#btnClose').onclick = requestClose;
        $('#btnSave').onclick = openSave;

        // katman listesi
        const list = $('#layerList');
        list.addEventListener('click', e => {
            const row = e.target.closest('.layer');
            if (!row) return;
            const id = row.dataset.id;
            const L = layer(id);
            const act = e.target.closest('[data-la]');
            if (!act) { select(id); return; }
            switch (act.dataset.la) {
                case 'vis': updateLayer(L, { visible: !L.visible }); renderLayers(); break;
                case 'lock': updateLayer(L, { locked: !L.locked }); renderLayers(); break;
                case 'dup': duplicateLayer(id); break;
                case 'up': moveLayer(id, 1); break;
                case 'down': moveLayer(id, -1); break;
                case 'del': removeLayer(id); break;
            }
        });
        list.addEventListener('dblclick', e => {
            const nmEl = e.target.closest('.nm');
            const row = e.target.closest('.layer');
            if (!nmEl || !row) return;
            const L = layer(row.dataset.id);
            const inp = document.createElement('input');
            inp.className = 'inp nm-edit'; inp.value = L.name; inp.maxLength = 40;
            nmEl.replaceWith(inp); inp.focus(); inp.select();
            const done = () => { const v = inp.value.trim(); if (v && v !== L.name) updateLayer(L, { name: v }); renderLayers(); };
            inp.onblur = done;
            inp.onkeydown = ev => { if (ev.key === 'Enter') inp.blur(); if (ev.key === 'Escape') { inp.value = L.name; inp.blur(); } ev.stopPropagation(); };
        });
        // sürükle-bırak sıralama
        let dragId = null;
        list.addEventListener('dragstart', e => { const r = e.target.closest('.layer'); if (r) { dragId = r.dataset.id; e.dataTransfer.effectAllowed = 'move'; } });
        list.addEventListener('dragover', e => { const r = e.target.closest('.layer'); if (r && dragId) { e.preventDefault(); $$('.layer', list).forEach(x => x.classList.toggle('drag-over', x === r)); } });
        list.addEventListener('drop', e => {
            e.preventDefault();
            const r = e.target.closest('.layer');
            $$('.layer', list).forEach(x => x.classList.remove('drag-over'));
            if (!r || !dragId || r.dataset.id === dragId) { dragId = null; return; }
            const ls = S.design.layers;
            const from = ls.findIndex(l => l.id === dragId);
            const moved = ls.splice(from, 1)[0];
            const to = ls.findIndex(l => l.id === r.dataset.id);
            ls.splice(to + 1, 0, moved); // liste ters sırada gösterildiği için hedefin "üstüne"
            dragId = null;
            renderLayers(); pushDesign(true); commit();
        });

        // özellik girdileri (sağ panel + sol "katmanlar" sekmesi)
        document.addEventListener('input', e => {
            const el = e.target;
            if (el.dataset.p) onPropInput(el, false);
            else if (el.dataset.t) onTextInput(el, false);
            else if (el.dataset.ai === 'prompt') S.ai.prompt = el.value;
            else if (el.dataset.a === 'url') S.assetUrl = el.value;
            else if (el.dataset.a === 'search') { S.assetSearch = el.value; refreshAssets(); }
            else if (el.dataset.e === 'search') { S.equipSearch = el.value; refreshEquipGrid(); }
            else if (el.dataset.eq) {
                const eI = equipInst(S.selEquip);
                if (!eI) return;
                const v = parseFloat(el.value);
                eI[el.dataset.eq][+el.dataset.i] = v;
                el.style.setProperty('--p', ((v - el.min) / (el.max - el.min) * 100) + '%');
                const n = $(`[data-eqn="${el.dataset.eq}"][data-i="${el.dataset.i}"]`);
                if (n) n.value = v;
                pushEquipment(); commitSoon();
            }
        });
        document.addEventListener('change', e => {
            const el = e.target;
            if (el.dataset.p) onPropInput(el, true);
            else if (el.dataset.t) onTextInput(el, true);
            else if (el.dataset.tune === 'tint') { S.design.tuning.tint = parseInt(el.value, 10) || 0; pushTuning(true); commit(); }
            else if (el.dataset.eqn) {
                const eI = equipInst(S.selEquip);
                if (!eI) return;
                const v = parseFloat(el.value);
                if (isNaN(v)) return;
                eI[el.dataset.eqn][+el.dataset.i] = v;
                refreshEquipInputs(); pushEquipment(true); commit();
            }
        });
        document.addEventListener('keydown', e => {
            if (e.target.dataset && e.target.dataset.a === 'url' && e.key === 'Enter') addFromUrl(e.target.value);
        });

        // sol panel tıklamaları
        $('#toolBody').addEventListener('click', onToolClick);
        bind2d();
        bindViewport();
        window.addEventListener('keydown', onKey);
    }

    // Arama kutusunda yazarken paneli yeniden çiz, odağı ve imleci koru
    function rerenderKeepFocus(selector) {
        const a = document.activeElement;
        const pos = a && typeof a.selectionStart === 'number' ? a.selectionStart : null;
        const scroll = $('#toolBody').scrollTop;
        renderTool();
        $('#toolBody').scrollTop = scroll;
        const n = $(selector);
        if (n) { n.focus(); if (pos != null) { try { n.setSelectionRange(pos, pos); } catch (e) { /* yok say */ } } }
    }
    function refreshAssets() { rerenderKeepFocus('[data-a="search"]'); }
    function refreshEquipGrid() { rerenderKeepFocus('[data-e="search"]'); }

    async function onToolClick(e) {
        const tg = e.target.closest('[data-toggle]');
        if (tg && !e.target.closest('.right button')) {
            const id = tg.dataset.toggle;
            S.closed[id] = !S.closed[id];
            tg.parentElement.classList.toggle('closed', S.closed[id]);
            return;
        }
        const el = e.target.closest('[data-act],[data-shape],[data-tstyle],[data-talign],[data-paint],[data-swatch],[data-extra],[data-ecat],[data-eitem],[data-einst],[data-edel],[data-atab],[data-asset],[data-fav],[data-ex],[data-lib],[data-chart]');
        if (!el) return;
        const d = el.dataset;
        const L = selLayer();

        if (d.shape) { addShape(d.shape); return; }
        if (d.tstyle) {
            const k = d.tstyle;
            if (L && L.type === 'text') { updateLayer(L, { [k]: !L[k] }); warmFont(L); } else S.textDefaults[k] = !S.textDefaults[k];
            el.classList.toggle('on');
            return;
        }
        if (d.talign) {
            if (L && L.type === 'text') updateLayer(L, { align: d.talign }); else S.textDefaults.align = d.talign;
            $$('[data-talign]').forEach(b => b.classList.toggle('on', b === el));
            return;
        }
        if (d.paint) {
            S.design.tuning.paint = d.paint;
            if (d.paint === 'keep' && (openSwatch === 'primary' || openSwatch === 'secondary')) openSwatch = null;
            renderTool(); pushTuning(true); commit();
            return;
        }
        if (d.swatch) { toggleSwatch(d.swatch); return; }
        if (d.extra) {
            const i = +d.extra;
            const ex = (S.veh.extras || []).find(x => x.id === i);
            const cur = S.design.tuning.extras[i] != null ? S.design.tuning.extras[i] : !!(ex && ex.on);
            S.design.tuning.extras[i] = !cur;
            el.classList.toggle('on', !cur);
            pushTuning(true); commit();
            return;
        }
        if (d.ecat) { S.equipCat = d.ecat; S.equipSearch = ''; renderTool(); return; }
        if (d.eitem) { pickEquipItem(d.eitem); return; }
        if (d.edel) { e.stopPropagation(); removeEquip(d.edel); return; }
        if (d.einst) { S.selEquip = d.einst; S.placing = null; renderTool(); pushEquipment(true); return; }
        if (d.atab) { S.assetTab = d.atab; renderTool(); return; }
        if (d.fav) {
            e.stopPropagation();
            let fav = lsGet('lvd_assets_fav', []);
            fav = fav.includes(d.fav) ? fav.filter(u => u !== d.fav) : [d.fav, ...fav];
            lsSet('lvd_assets_fav', fav.slice(0, 60));
            renderTool();
            return;
        }
        if (d.asset) {
            const img = new Image();
            img.onload = () => { rememberAsset(d.asset); addImage(d.asset, { w: img.naturalWidth, h: img.naturalHeight }); };
            img.onerror = () => toast(t('img_bad'), { error: true });
            img.src = d.asset;
            return;
        }
        if (d.ex) { S.ai.prompt = d.ex; const ta = $('[data-ai="prompt"]'); if (ta) ta.value = d.ex; return; }
        if (d.lib) { libAction(d.lib, +d.id); return; }
        if (d.chart) { post('cam', { chart: d.chart }); return; }

        switch (d.act) {
            case 'addText': {
                const ta = $('[data-t="text"]');
                await addText(ta && ta.value.trim() ? ta.value : null);
                renderTool();
                break;
            }
            case 'imgTint': if (L) { updateLayer(L, { tint: !L.tint }); renderTool(); } break;
            case 'ratio': S.ratioLock = !S.ratioLock; el.classList.toggle('on', S.ratioLock); break;
            case 'flipH': if (L) { updateLayer(L, { sx: -L.sx }); refreshPropInputs(); } break;
            case 'flipV': if (L) { updateLayer(L, { sy: -L.sy }); refreshPropInputs(); } break;
            case 'centerChart': {
                if (!L) break;
                const c = E.chartAt(S.surface.charts, L.x, L.y);
                if (c) { updateLayer(L, { x: Math.round(c.rect[0] + c.rect[2] / 2), y: Math.round(c.rect[1] + c.rect[3] / 2) }); refreshPropInputs(); }
                break;
            }
            case 'view2d': setView2d(!S.view2d); break;
            case 'template': S.template = !S.template; el.classList.toggle('on', S.template); draw2d(); break;
            case 'base': S.design.base.color = S.design.base.color ? null : '#ffffff'; renderTool(); pushDesign(true); commit(); break;
            case 'addUrl': addFromUrl($('[data-a="url"]').value); break;
            case 'aiGen': aiGenerate(); break;
            case 'aiAdd': aiAdd(); break;
            case 'aiBg': S.ai.removeBg = !S.ai.removeBg; el.classList.toggle('on', S.ai.removeBg); break;
            case 'neon': S.design.tuning.neon.on = !S.design.tuning.neon.on; el.classList.toggle('on', S.design.tuning.neon.on); pushTuning(true); commit(); break;
            case 'equipRoof': {
                const r = await post('equipRoof', { item: S.placing });
                if (r && r.pos) addEquipment(S.placing, r.pos, r.rot, false);
                break;
            }
            case 'equipCancel': S.placing = null; renderTool(); renderHints(); pushEquipment(true); break;
            case 'eDup': {
                const s = equipInst(S.selEquip);
                if (s) addEquipment(s.item, [s.pos[0] + 0.15, s.pos[1], s.pos[2]], s.rot.slice(), false);
                break;
            }
            case 'eMirror': {
                const s = equipInst(S.selEquip);
                if (s) addEquipment(s.item, [-s.pos[0], s.pos[1], s.pos[2]], [s.rot[0], -s.rot[1], -s.rot[2]], false);
                break;
            }
            case 'eFocus': { const s = equipInst(S.selEquip); if (s) post('cam', { focus: s.pos }); break; }
            case 'eRemove': if (S.selEquip) removeEquip(S.selEquip); break;
            case 'eTest': S.testLights = !S.testLights; el.classList.toggle('on', S.testLights); pushEquipment(true); break;
            case 'eTilt': S.tilt = !S.tilt; el.classList.toggle('on', S.tilt); pushEquipment(true); break;
            case 'libNew':
                if (S.design.layers.length || S.design.equipment.length) confirmBox(t('new_design'), t('new_confirm'), t('new_design'), () => loadDesign(null, { id: null, name: '', mine: true }), true);
                break;
            case 'libImport': promptBox(t('code_prompt'), '', v => importCode(v), true); break;
            case 'libExport': exportCode(); break;
        }
    }

    function isTyping(el) {
        return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
    }

    function onKey(e) {
        if (!S.open) return;
        if (e.key === 'Escape') {
            e.preventDefault();
            if (modalOpen()) { closeModal(); return; }
            if (isTyping(document.activeElement)) { document.activeElement.blur(); return; }
            if (S.placing) { S.placing = null; renderTool(); renderHints(); pushEquipment(true); return; }
            if (S.view2d) { setView2d(false); return; }
            requestClose();
            return;
        }
        if (isTyping(document.activeElement) || modalOpen()) return;
        const ctrl = e.ctrlKey || e.metaKey;
        if (ctrl && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
        if (ctrl && (e.key === 'y' || e.key === 'Y')) { e.preventDefault(); redo(); return; }
        if (S.tool === 'equipment' && S.selEquip) {
            if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeEquip(S.selEquip); return; }
            if (equipNudge(e.key, e.shiftKey)) { e.preventDefault(); return; }
        }
        const L = selLayer();
        if (!L) return;
        if (ctrl && (e.key === 'd' || e.key === 'D')) { e.preventDefault(); duplicateLayer(L.id); return; }
        if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeLayer(L.id); return; }
        const st = e.shiftKey ? 40 : 4;
        const mv = { ArrowLeft: [-st, 0], ArrowRight: [st, 0], ArrowUp: [0, -st], ArrowDown: [0, st] }[e.key];
        if (mv && !L.locked) {
            e.preventDefault();
            L.x += mv[0]; L.y += mv[1];
            refreshPropInputs(); pushDesign(); commitSoon();
        }
    }

    // ================================================================== AÇ / KAPA
    function applyAccent(hex) {
        const rgb = window.VDColor.hexToRgb(hex) || [255, 46, 147];
        const r = document.documentElement.style;
        r.setProperty('--accent', hex);
        r.setProperty('--accent-rgb', rgb.join(', '));
        const lighten = rgb.map(v => Math.round(v + (255 - v) * 0.35));
        r.setProperty('--accent-2', window.VDColor.rgbToHex(...lighten));
    }

    function loadFontLinks(fonts) {
        const fams = (fonts || []).filter(f => f.google).map(f => 'family=' + f.google);
        if (!fams.length || document.getElementById('lvdFonts')) return;
        const l = document.createElement('link');
        l.id = 'lvdFonts'; l.rel = 'stylesheet';
        l.href = 'https://fonts.googleapis.com/css2?' + fams.join('&') + '&display=swap';
        document.head.appendChild(l);
    }

    function open(m) {
        S.locale = m.locale || 'tr';
        document.documentElement.lang = S.locale;
        applyAccent(m.accent || '#ff2e93');
        S.veh = m.vehicle || S.veh;
        S.surface = Object.assign({ kind: 'none', charts: [], size: 4096, texture: 2048, packs: 0 }, m.surface || {});
        S.perms = m.perms || S.perms;
        S.limits = m.limits || S.limits;
        S.fonts = m.fonts || [];
        S.catalogue = m.catalogue || [];
        S.categories = m.categories || [];
        if (S.categories.length && !S.categories.find(c => c.id === S.equipCat)) S.equipCat = S.categories[0].id;
        loadFontLinks(S.fonts);
        S.tool = 'tuning';
        S.view2d = false;
        $('#view2d').classList.add('hidden');
        S.lib.items = null;
        S.ai = { prompt: '', busy: false, result: null, removeBg: true };
        S.testLights = false; S.placing = null;
        S.open = true;
        renderFrame();
        loadDesign(m.design, m.meta || { id: null, name: '', mine: true });
        $('#app').classList.remove('hidden');
        requestAnimationFrame(() => $('#app').classList.add('on'));
        if (m.notice) toast(m.notice);
    }

    function close() {
        S.open = false;
        closeModal();
        busy(false);
        $('#app').classList.remove('on');
        setTimeout(() => { if (!S.open) $('#app').classList.add('hidden'); }, 200);
    }

    E.setImageResolver(id => S.images[id] || null);
    E.setOnImageLoad(() => draw2d());

    window.addEventListener('message', ev => {
        const m = ev.data;
        if (!m || !m.action) return;
        switch (m.action) {
            case 'open': open(m); break;
            case 'close': close(); break;
            case 'pick': onPick(m); break;
            case 'equipPick': onEquipPick(m); break;
            case 'toast': toast(m.text, { error: m.error, title: m.title }); break;
            case 'busy': busy(!!m.on, m.text, m.progress); break;
            case 'surface':
                S.surface = Object.assign(S.surface, m.surface || {});
                $('#packsInfo').textContent = t('packs_loaded', { n: S.surface.packs || 0 });
                if (S.tool === 'surfaces') renderTool();
                draw2d();
                break;
            case 'image': if (m.id && m.data) { S.images[m.id] = m.data; draw2d(); } break;
        }
    });

    bindUi();
    window.VDApp = { S, open, close, onPick, onEquipPick, post };
    post('nuiReady', {});
})();
