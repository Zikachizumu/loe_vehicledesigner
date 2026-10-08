/* Sağ panel: Katmanlar, Garaj, Modifiye (boya), İskelet, Dışa aktar. */
(function () {
    'use strict';
    const VS = window.VS, S = VS.S, E = VDEngine, L2 = VSLayout;
    const { $, $$, clamp, esc, ui } = VS;
    const { h, slider, colorField, seg, select, card, lbl, swatches } = ui;

    const TABS = [
        ['layers', 'layers', 'KATMAN'],
        ['garage', 'car', 'GARAJ'],
        ['paint', 'palette', 'MODİFİYE'],
        ['skeleton', 'bone', 'İSKELET'],
        ['export', 'download', 'DIŞA AKTAR'],
    ];

    VS.renderTabs = function () {
        const box = $('#tabs');
        box.innerHTML = '';
        for (const [id, ic, tr] of TABS) {
            const b = h('button', { class: 'tab' + (S.tab === id ? ' on' : ''), 'data-t': id, html: icon(ic) + `<span>${tr}</span>` });
            b.addEventListener('click', () => { S.tab = id; VS.renderTabs(); VS.renderPanel(); });
            box.append(b);
        }
    };

    let propsRefs = null;
    VS.renderPanel = function (keep) {
        const body = $('#tabBody');
        const sc = body.scrollTop;
        body.innerHTML = '';
        propsRefs = null;
        const f = { layers: renderLayers, garage: renderGarage, paint: renderPaint, skeleton: renderSkeleton, export: renderExport }[S.tab];
        if (f) f(body);
        if (keep !== false) body.scrollTop = sc;
        VS.updateStatus && VS.updateStatus();
    };

    // ------------------------------------------------------------------ KATMANLAR
    const TYPE_ICON = { shape: 'square', text: 'type', image: 'image', paint: 'brush', gradient: 'gradient', pattern: 'pattern' };
    const TYPE_TR = { shape: 'Şekil', text: 'Metin', image: 'Görsel', paint: 'Boya', gradient: 'Degrade', pattern: 'Desen' };

    function chartName(L) {
        const c = S.charts && L2.chartAt(S.charts, L.x, L.y);
        return c ? L2.NAMES[c.id] : '—';
    }

    function renderLayers(body) {
        const ls = S.design.layers;
        body.append(h('div', { class: 'sh' }, h('i'), h('h3', { text: 'Katmanlar' }),
            h('div', { class: 'acts' },
                h('button', { class: 'btn sm', title: 'Yeni boya katmanı', html: icon('brush') + ' Boya', onclick: () => { const L = VS.mkLayer('paint', { res: 2048 }); E.paintCanvas(L, true); VS.addLayer(L); } }),
                h('span', { class: 'count', text: String(ls.length) }))));
        const list = h('div', { class: 'layer-list', id: 'layerList' });
        if (!ls.length) {
            list.append(h('div', { class: 'empty', html: icon('layers') + '<b>Henüz katman yok</b>Soldan metin, şekil, görsel ya da fırça seç; ya da bir şablon uygula.' }));
        }
        for (let i = ls.length - 1; i >= 0; i--) {
            const L = ls[i];
            const th = h('div', { class: 'thumb' });
            if (L.type === 'image') { const r = L.src && L.src.startsWith('decal:') ? `decals/${L.src.slice(6)}.svg` : L.src; th.style.backgroundImage = `url("${r}")`; }
            else if (L.type === 'shape') th.innerHTML = `<svg viewBox="0 0 100 100" style="width:70%;height:70%;fill:${esc(L.color)}"><path d="${(E.SHAPES[L.shape] || E.SHAPES.square).d}"/></svg>`;
            else if (L.type === 'gradient') th.style.background = `linear-gradient(135deg, ${L.color}, ${L.color2})`;
            else if (L.type === 'text') { th.textContent = 'T'; th.style.color = L.color; th.style.fontWeight = 700; th.style.fontFamily = `"${L.font}"`; }
            else if (L.type === 'pattern') th.style.background = L.color2 || '#222', th.innerHTML = `<i style="width:60%;height:60%;background:${L.color};display:block;border-radius:2px"></i>`;
            else if (L.type === 'paint') { th.innerHTML = '<canvas width="30" height="30"></canvas>'; th.dataset.paint = L.id; }
            const it = h('div', { class: 'layer' + (S.sel === L.id ? ' sel' : '') + (L.visible ? '' : ' hid'), draggable: 'true', 'data-id': L.id },
                th,
                h('div', { class: 'meta' }, h('div', { class: 'nm', text: L.name }), h('div', { class: 'sb', text: TYPE_TR[L.type] + (L.type === 'paint' ? ' · ' + (L.locked ? 'kilitli' : 'fırça') : ' · ' + chartName(L)) })),
                h('div', { class: 'acts' },
                    h('button', { title: 'Göster/gizle', class: L.visible ? '' : 'on', html: icon(L.visible ? 'eye' : 'eyeOff'), 'data-a': 'vis' }),
                    h('button', { title: 'Kilitle', class: L.locked ? 'on' : '', html: icon(L.locked ? 'lock' : 'unlock'), 'data-a': 'lock' }),
                    h('button', { title: 'Sil', class: 'del', html: icon('trash'), 'data-a': 'del' })));
            it.addEventListener('click', e => {
                const a = e.target.closest('[data-a]');
                if (a) {
                    e.stopPropagation();
                    if (a.dataset.a === 'vis') { L.visible = !L.visible; VS.designChanged(); VS.commit(); VS.renderPanel(); }
                    else if (a.dataset.a === 'lock') { L.locked = !L.locked; VS.commit(); VS.renderPanel(); }
                    else if (a.dataset.a === 'del') VS.removeLayer(L.id);
                    return;
                }
                S.sel = L.id; VS.renderPanel(); VS.v2.invalidate();
            });
            it.querySelector('.nm').addEventListener('dblclick', e => {
                e.stopPropagation();
                const inp = h('input', { class: 'inp', value: L.name });
                e.target.replaceWith(inp); inp.focus(); inp.select();
                const done = () => { L.name = inp.value.trim() || L.name; VS.commit(); VS.renderPanel(); };
                inp.addEventListener('blur', done);
                inp.addEventListener('keydown', ev => { if (ev.key === 'Enter') inp.blur(); if (ev.key === 'Escape') { inp.value = L.name; inp.blur(); } });
            });
            // sürükle-bırak ile sıralama
            it.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', L.id); e.dataTransfer.effectAllowed = 'move'; });
            it.addEventListener('dragover', e => { e.preventDefault(); it.classList.add('dragover'); });
            it.addEventListener('dragleave', () => it.classList.remove('dragover'));
            it.addEventListener('drop', e => {
                e.preventDefault(); it.classList.remove('dragover');
                const id = e.dataTransfer.getData('text/plain');
                const from = ls.findIndex(l => l.id === id), to = ls.findIndex(l => l.id === L.id);
                if (from < 0 || to < 0 || from === to) return;
                const [m] = ls.splice(from, 1); ls.splice(to, 0, m);
                VS.designChanged(); VS.commit(); VS.renderPanel();
            });
            list.append(it);
        }
        body.append(list);
        VS.updateLayerThumbs(true);

        const L = VS.selLayer();
        if (L) body.append(h('div', { class: 'sh', style: { marginTop: '16px' } }, h('i'), h('h3', { text: 'Katman özellikleri' })), propsCard(L));
    }

    VS.updateLayerThumbs = function (force) {
        $$('.thumb[data-paint]').forEach(t => {
            const L = VS.layer(t.dataset.paint); if (!L) return;
            const c = E.paintCanvas(L); const cv = t.querySelector('canvas');
            if (!c || !cv) return;
            const x = cv.getContext('2d'); x.clearRect(0, 0, 30, 30); x.drawImage(c, 0, 0, 30, 30);
        });
    };

    function propsCard(L) {
        const wrap = h('div');
        const refs = propsRefs = {};
        const commitSoon = (() => { let t; return () => { clearTimeout(t); t = setTimeout(() => VS.commit(), 350); }; })();
        const upd = (k, v, now) => { L[k] = v; VS.designChanged(); if (now) VS.commit(); else commitSoon(); };
        const num = (label, key, min, max, step) => {
            const inp = h('input', { class: 'inp mono', type: 'number', min, max, step: step || 1, value: Math.round((L[key] || 0) * 10) / 10 });
            inp.addEventListener('input', () => { const v = parseFloat(inp.value); if (!isNaN(v)) upd(key, v); });
            refs[key] = inp;
            return h('div', null, lbl(label), inp);
        };

        if (L.type === 'paint') {
            wrap.append(h('div', { class: 'card' }, h('div', { class: 'card-b', style: { paddingTop: '11px' } },
                h('div', { class: 'card-note', style: { fontSize: '11px', color: 'var(--mut)', lineHeight: '1.6' }, text: 'Raster boya katmanı. Fırça, silgi, parmak ve bulanık araçlarıyla araç üzerinde ya da tuvalde çizin.' }),
                h('div', { class: 'row', style: { marginTop: '10px' } },
                    h('button', { class: 'btn dan', html: icon('trash') + ' Katmanı temizle', onclick: async () => {
                        const c = E.paintCanvas(L); if (!c) return;
                        const x = c.getContext('2d'); const d = x.getImageData(0, 0, c.width, c.height);
                        x.clearRect(0, 0, c.width, c.height);
                        VS.commitPatch({ t: 'px', id: L.id, x: 0, y: 0, data: d }); VS.designChanged(); VS.updateLayerThumbs(true);
                    } })),
                lbl('Opaklık'), slider('', 0, 100, L.opacity, { unit: '%', onInput: v => upd('opacity', v) }),
                lbl('Karışım'), select(E.BLEND_ORDER, L.blend, v => upd('blend', v, true)))));
            return wrap;
        }

        const tr = card('Dönüşüm', 'target', h('div', null,
            h('div', { class: 'grid2' }, num('X', 'x', -2000, 6200), num('Y', 'y', -2000, 6200)),
            h('div', { class: 'grid2' }, num('Ölçek X %', 'sx', -2000, 2000, 1), num('Ölçek Y %', 'sy', -2000, 2000, 1)),
            lbl('Döndür'), slider('', -180, 180, L.rot || 0, { unit: '°', onInput: v => { upd('rot', v); } }),
            lbl('Opaklık'), slider('', 0, 100, L.opacity, { unit: '%', onInput: v => upd('opacity', v) }),
            lbl('Karışım'), select(E.BLEND_ORDER, L.blend, v => upd('blend', v, true))));
        wrap.append(tr);

        // türe özel
        if (L.type === 'shape') {
            const g = h('div', { class: 'shape-grid' });
            for (const sid of E.SHAPE_ORDER) {
                const b = h('button', { class: 'shape-btn' + (L.shape === sid ? ' on' : ''), html: `<svg viewBox="0 0 100 100"><path d="${E.SHAPES[sid].d}"/></svg>` });
                b.addEventListener('click', () => { upd('shape', sid, true); g.querySelectorAll('.shape-btn').forEach(x => x.classList.toggle('on', x === b)); });
                g.append(b);
            }
            wrap.append(card('Şekil', 'square', h('div', null, g, colorField('Renk', L.color, c => upd('color', c), () => VS.commit()))));
        } else if (L.type === 'text') {
            const ta = h('textarea', { class: 'inp' }); ta.value = L.text;
            ta.addEventListener('input', () => { L.text = ta.value; VS.designChanged(); commitSoon(); VS.syncName && 0; });
            wrap.append(card('Metin', 'type', h('div', null,
                ta, lbl('Yazı tipi'), select(VS.FONTS, L.font, v => { L.font = v; VS.warmFont(v, L.bold, L.italic); upd('font', v, true); }),
                lbl('Boyut'), slider('', 20, 1600, L.fsize, { onInput: v => upd('fsize', v) }),
                lbl('Harf aralığı'), slider('', -80, 500, L.spacing || 0, { onInput: v => upd('spacing', v) }),
                lbl('Satır aralığı'), slider('', 0.6, 2.4, L.line || 1.1, { step: 0.05, onInput: v => upd('line', v) }),
                colorField('Renk', L.color, c => upd('color', c), () => VS.commit()),
                h('div', { class: 'grid4', style: { marginTop: '6px' } },
                    ...[['bold', 'B', 'font-weight:900'], ['italic', 'I', 'font-style:italic'], ['underline', 'U', 'text-decoration:underline'], ['strike', 'S', 'text-decoration:line-through']].map(([k, t, st]) =>
                        h('button', { class: 'btn' + (L[k] ? ' on' : ''), style: st, text: t, onclick: function () { L[k] = !L[k]; this.classList.toggle('on', L[k]); if (k === 'bold' || k === 'italic') VS.warmFont(L.font, L.bold, L.italic); VS.designChanged(); VS.commit(); } }))),
                seg([['left', 'Sol'], ['center', 'Orta'], ['right', 'Sağ'], ['justify', 'İki yana']], L.align || 'center', v => upd('align', v, true)))));
        } else if (L.type === 'image') {
            wrap.append(card('Görsel', 'image', h('div', null,
                h('div', { class: 'row' },
                    h('button', { class: 'btn' + (L.tint ? ' on' : ''), text: 'Renk tonu', onclick: function () { L.tint = !L.tint; this.classList.toggle('on', L.tint); VS.designChanged(); VS.commit(); } }),
                    h('button', { class: 'btn', html: icon('flipH') + ' Yatay', onclick: () => { L.sx = -(L.sx || 100); VS.designChanged(); VS.commit(); VS.renderPanel(); } }),
                    h('button', { class: 'btn', html: icon('flipV') + ' Dikey', onclick: () => { L.sy = -(L.sy || 100); VS.designChanged(); VS.commit(); VS.renderPanel(); } })),
                colorField('Ton rengi', L.color || '#ffffff', c => upd('color', c), () => VS.commit()))));
        } else if (L.type === 'gradient') {
            wrap.append(card('Degrade', 'gradient', h('div', null,
                colorField('Renk A', L.color, c => upd('color', c), () => VS.commit()), colorField('Renk B', L.color2 || '#000000', c => upd('color2', c), () => VS.commit()),
                lbl('Açı'), slider('', 0, 360, L.angle || 0, { unit: '°', onInput: v => upd('angle', v) }),
                h('div', { class: 'grid2' }, num('Genişlik', 'w', 10, 6000), num('Yükseklik', 'h', 10, 6000)))));
        } else if (L.type === 'pattern') {
            wrap.append(card('Desen', 'pattern', h('div', null,
                select(E.PATTERNS.map(p => [p, ({ checker: 'Dama', stripes: 'Yatay çizgi', vstripes: 'Dikey çizgi', diag: 'Çapraz', dots: 'Nokta', hex: 'Petek', camo: 'Kamuflaj' })[p]]), L.pattern, v => upd('pattern', v, true)),
                colorField('Renk 1', L.color, c => upd('color', c), () => VS.commit()), colorField('Renk 2', L.color2 || '#000000', c => upd('color2', c), () => VS.commit()),
                lbl('Ölçek'), slider('', 0.3, 4, L.pscale || 1, { step: 0.1, onInput: v => upd('pscale', v) }),
                h('div', { class: 'grid2' }, num('Genişlik', 'w', 10, 6000), num('Yükseklik', 'h', 10, 6000)))));
        }

        // eylemler
        const idx = S.design.layers.findIndex(l => l.id === L.id);
        wrap.append(h('div', { class: 'card' }, h('div', { class: 'card-b', style: { paddingTop: '11px' } },
            h('div', { class: 'grid3' },
                h('button', { class: 'btn sm', html: icon('copy') + ' Çoğalt', onclick: () => dup(L) }),
                h('button', { class: 'btn sm', html: icon('mirror') + ' Aynala', title: 'Karşı tarafa kopyala', onclick: () => mirrorCopy(L) }),
                h('button', { class: 'btn sm', html: icon('target') + ' Ortala', title: 'Bulunduğu yüzeyin ortasına al', onclick: () => centerLayer(L) })),
            h('div', { class: 'grid3', style: { marginTop: '6px' } },
                h('button', { class: 'btn sm', html: icon('up') + ' Öne', onclick: () => moveLayer(L, 1) }),
                h('button', { class: 'btn sm', html: icon('down') + ' Arkaya', onclick: () => moveLayer(L, -1) }),
                h('button', { class: 'btn sm dan', html: icon('trash') + ' Sil', onclick: () => VS.removeLayer(L.id) })))));
        return wrap;
    }

    VS.syncProps = function () {
        const L = VS.selLayer();
        if (!L || !propsRefs) return;
        for (const k in propsRefs) {
            if (document.activeElement !== propsRefs[k]) propsRefs[k].value = Math.round((L[k] || 0) * 10) / 10;
        }
    };

    function dup(L) {
        const c = JSON.parse(JSON.stringify(L));
        c.id = E.uid('l'); c.name = L.name + ' kopya'; c.x += 80; c.y += 80;
        VS.addLayer(c);
    }
    function moveLayer(L, d) {
        const ls = S.design.layers, i = ls.findIndex(l => l.id === L.id), j = i + d;
        if (j < 0 || j >= ls.length) return;
        [ls[i], ls[j]] = [ls[j], ls[i]];
        VS.designChanged(); VS.commit(); VS.renderPanel();
    }
    function centerLayer(L) {
        const c = S.charts && L2.chartAt(S.charts, L.x, L.y);
        if (!c) { VS.toast('Katman bir yüzeyin içinde değil', 'err'); return; }
        L.x = c.rect[0] + c.rect[2] / 2; L.y = c.rect[1] + c.rect[3] / 2;
        VS.designChanged(); VS.commit(); VS.syncProps();
    }
    function mirrorCopy(L) {
        const c = S.charts && L2.chartAt(S.charts, L.x, L.y);
        if (!c) { VS.toast('Katman bir yüzeyin içinde değil', 'err'); return; }
        const m = L2.mirror(S.charts, S.bbox, c, L.x, L.y);
        const n = JSON.parse(JSON.stringify(L));
        n.id = E.uid('l'); n.name = L.name + ' (ayna)'; n.x = m.x; n.y = m.y; n.rot = -(L.rot || 0);
        VS.addLayer(n);
        VS.toast('Karşı yüzeye kopyalandı', 'ok');
    }

    // ------------------------------------------------------------------ GARAJ
    const CATS = [['all', 'Tümü'], ['emergency', 'Acil'], ['car', 'Otomobil'], ['suv', 'SUV'], ['van', 'Van'], ['heavy', 'Ağır'], ['bike', 'Motor'], ['air', 'Hava'], ['sea', 'Deniz']];
    function filteredVehicles() {
        const q = S.search.trim().toLowerCase();
        return S.vehicles.filter(v => (S.cat === 'all' || v.cat === S.cat) && (!q || v.id.includes(q)));
    }
    function renderGarage(body) {
        const v = S.veh;
        if (v) body.append(h('div', { class: 'cur-card' }, h('div', { class: 'ico', html: icon('car') }),
            h('div', null, h('div', { class: 't', text: v.id.toUpperCase() }), h('div', { class: 's', text: `${v.tris.toLocaleString('tr')} üçgen · ${v.bones} kemik · ${v.len.toFixed(2)}×${v.wid.toFixed(2)}×${v.hei.toFixed(2)} m` }))));
        body.append(h('div', { class: 'sh' }, h('i'), h('h3', { text: 'Araç seç' }), h('span', { class: 'count', text: String(S.vehicles.length) })));
        const sr = h('div', { class: 'search', html: icon('search') });
        const inp = h('input', { class: 'inp', placeholder: 'Model ara (adder, police…)', value: S.search });
        sr.append(inp);
        body.append(sr);
        const chips = h('div', { class: 'chips' });
        for (const [k, t] of CATS) {
            const b = h('button', { class: S.cat === k ? 'on' : '', text: t });
            b.addEventListener('click', () => { S.cat = k; S.vlimit = 80; VS.renderPanel(false); });
            chips.append(b);
        }
        body.append(chips);
        const list = h('div', { class: 'vlist' });
        body.append(list);
        const fill = () => {
            const items = filteredVehicles();
            list.innerHTML = '';
            for (const it of items.slice(0, S.vlimit)) {
                const row = h('div', { class: 'vitem' + (S.veh && S.veh.id === it.id ? ' cur' : ''), html: icon(it.cat === 'bike' ? 'target' : 'car') + `<span class="nm">${esc(it.id)}</span><span class="md">${it.len.toFixed(1)}m<br>${(it.tris / 1000).toFixed(0)}k</span>` });
                row.addEventListener('click', () => VS.selectVehicle(it.id));
                list.append(row);
            }
            if (items.length > S.vlimit) {
                const more = h('button', { class: 'btn', style: { width: '100%', marginTop: '6px' }, text: `Daha fazla göster (${items.length - S.vlimit})` });
                more.addEventListener('click', () => { S.vlimit += 120; fill(); });
                list.append(more);
            }
            if (!items.length) list.append(h('div', { class: 'more', text: 'Araç bulunamadı' }));
        };
        inp.addEventListener('input', () => { S.search = inp.value; S.vlimit = 80; fill(); });
        fill();
    }

    // ------------------------------------------------------------------ MODİFİYE
    const GTA_COLORS = ['#0d1116', '#1c1d21', '#32383d', '#515b62', '#b6b6b6', '#f4f4f4', '#7b0f14', '#c4161c', '#d66a1f', '#f7c21a', '#2c6e49', '#123c2a', '#0f2a5c', '#1d56c4', '#3a9bd9', '#5a2d7a', '#d63f8a', '#8a6b3d', '#c9b78a', '#ff2e93'];
    const TINTS = ['Şeffaf', 'Hafif', 'Orta', 'Koyu', 'Çok koyu', 'Limo', 'Tam siyah'];

    VS.applyMod = function () {
        const sc = VS.scene, m = S.mod;
        if (!sc || !sc.vd) return;
        sc.setBody(m.body, m.finish);
        sc.setTint(m.tint);
        sc.setRimColor(m.rim);
        sc.setNeon(m.neon.on, m.neon.color);
        // parça renkleri
        sc.boneColors = {};
        for (const k in m.parts) sc.boneColors[k] = m.parts[k];
        sc.rebuildBoneMats();
        // gizli kemikler / açıklık / ekstralar
        sc.showAllBones();
        for (const b of m.hidden) sc.setBoneVisible(b, false, false);
        for (const k in m.open) sc.setOpen(+k, m.open[k]);
        const bones = sc.vd.header.bones;
        for (const k in m.extras) {
            const i = bones.findIndex(b => b.n === 'extra_' + k);
            if (i >= 0) sc.setBoneVisible(i, !!m.extras[k], true);
        }
        sc.applyXray();
        if (VS.v2) VS.v2.invalidate();
    };

    function renderPaint(body) {
        const m = S.mod, sc = VS.scene;
        const commit = () => VS.commit();
        const apply = () => { VS.applyMod(); VS.v2.invalidate(); VS.setDirty(true); };
        body.append(h('div', { class: 'sh' }, h('i'), h('h3', { text: 'Modifiye' })));

        body.append(card('Gövde boyası', 'palette', h('div', null,
            colorField('Gövde rengi', m.body, c => { m.body = c; apply(); }, commit),
            swatches(GTA_COLORS, m.body, c => { m.body = c; apply(); commit(); renderTop(); }),
            lbl('Boya türü'),
            h('div', { class: 'finish' }, ...[['gloss', 'Parlak'], ['metallic', 'Metalik'], ['matte', 'Mat'], ['satin', 'Saten'], ['chrome', 'Krom'], ['pearl', 'İnci']].map(([k, t]) => {
                const b = h('button', { class: 'btn' + (m.finish === k ? ' on' : ''), text: t });
                b.addEventListener('click', () => { m.finish = k; apply(); commit(); VS.renderPanel(); });
                return b;
            })))));
        function renderTop() { VS.renderPanel(); }

        body.append(card('Camlar', 'eye', h('div', null,
            slider('', 0, 6, m.tint, { fmt: v => TINTS[v], onInput: v => { m.tint = v; sc.setTint(v); VS.setDirty(true); }, onChange: commit }))));

        body.append(card('Jantlar', 'target', h('div', null,
            colorField('Jant rengi', m.rim, c => { m.rim = c; sc.setRimColor(c); VS.setDirty(true); }, commit),
            swatches(['#b9bec6', '#e8e9ec', '#15161a', '#c9a227', '#ff2e93', '#c4161c', '#1d56c4', '#2c6e49'], m.rim, c => { m.rim = c; sc.setRimColor(c); commit(); VS.renderPanel(); }))));

        body.append(card('Neon (alt ışık)', 'sparkles', h('div', null,
            h('div', { class: 'row' }, h('button', { class: 'btn' + (m.neon.on ? ' on' : ''), text: m.neon.on ? 'Açık' : 'Kapalı', onclick: function () { m.neon.on = !m.neon.on; this.classList.toggle('on', m.neon.on); this.textContent = m.neon.on ? 'Açık' : 'Kapalı'; sc.setNeon(m.neon.on, m.neon.color); commit(); } })),
            colorField('Neon rengi', m.neon.color, c => { m.neon.color = c; sc.setNeon(m.neon.on, c); VS.setDirty(true); }, commit))));

        // ekstralar
        const bones = sc.vd ? sc.vd.header.bones : [];
        const extras = bones.map((b, i) => ({ n: b.n, i })).filter(x => /^extra_\d+$/.test(x.n)).map(x => +x.n.slice(6));
        const eg = h('div', { class: 'extras' });
        for (let n = 1; n <= 12; n++) {
            const has = extras.includes(n);
            const on = m.extras[n] !== false;
            const b = h('button', { class: 'btn' + (has && on ? ' on' : ''), text: String(n), style: has ? null : { opacity: .3, pointerEvents: 'none' } });
            b.addEventListener('click', () => {
                m.extras[n] = !(m.extras[n] !== false);
                const i = bones.findIndex(x => x.n === 'extra_' + n);
                if (i >= 0) sc.setBoneVisible(i, m.extras[n], true);
                b.classList.toggle('on', m.extras[n]);
                VS.setDirty(true); commit();
            });
            eg.append(b);
        }
        body.append(card('Ekstralar', 'wrench', h('div', null, eg, h('div', { class: 'card-note', style: { marginTop: '8px', fontSize: '10.5px', color: 'var(--dim)' }, text: extras.length ? 'Araçtaki ekstra parçaları aç/kapat.' : 'Bu araçta ekstra parça yok.' }))));

        // sahne
        body.append(card('Sahne', 'sun', h('div', null,
            h('div', { class: 'row' },
                h('button', { class: 'btn' + (sc.grid.visible ? ' on' : ''), text: 'Izgara', onclick: function () { sc.setGrid(!sc.grid.visible); this.classList.toggle('on', sc.grid.visible); } }),
                h('button', { class: 'btn' + (VS.turn ? ' on' : ''), text: 'Döner platform', onclick: function () { VS.setTurntable(!VS.turn); this.classList.toggle('on', VS.turn); } })),
            lbl('Pozlama'), slider('', 0.4, 2, sc.renderer.toneMappingExposure, { step: 0.05, onInput: v => { sc.renderer.toneMappingExposure = v; sc.invalidate(); } }))));
    }

    // ------------------------------------------------------------------ İSKELET
    function boneRows() {
        const bones = VS.scene.vd.header.bones;
        const kids = {};
        const roots = [];
        bones.forEach((b, i) => {
            if (b.p >= 0 && b.p < bones.length && b.p !== i) (kids[b.p] = kids[b.p] || []).push(i); else roots.push(i);
        });
        return { kids, roots };
    }
    S.boneOpen = S.boneOpen || {};
    S.boneFilter = '';

    function renderSkeleton(body) {
        const sc = VS.scene;
        if (!sc.vd) { body.append(h('div', { class: 'empty', text: 'Araç yüklenmedi' })); return; }
        const bones = sc.vd.header.bones;
        body.append(h('div', { class: 'sh' }, h('i'), h('h3', { text: 'İskelet' }), h('span', { class: 'count', text: bones.length + ' kemik' })));

        body.append(h('div', { class: 'grid2' },
            h('button', { class: 'btn' + (S.skeletonOn ? ' on' : ''), html: icon('bone') + ' İskeleti göster', onclick: function () { VS.setSkeleton(!S.skeletonOn); } }),
            h('button', { class: 'btn' + (S.labelsOn ? ' on' : ''), html: icon('type') + ' İsimler', onclick: function () { S.labelsOn = !S.labelsOn; sc.setSkeleton(S.skeletonOn, S.labelsOn); this.classList.toggle('on', S.labelsOn); VS.updateBoneLabels(); } }),
            h('button', { class: 'btn' + (sc.xray ? ' on' : ''), html: icon('scan') + ' X-ışını', onclick: function () { VS.setXray(!sc.xray); } }),
            h('button', { class: 'btn', html: icon('eye') + ' Hepsini göster', onclick: () => { S.mod.hidden = []; sc.showAllBones(); VS.applyMod(); VS.commit(); VS.renderPanel(); } })));

        // hareketli parçalar
        if (sc.movables && sc.movables.length) {
            const mv = h('div');
            for (const m of sc.movables) {
                const val = (S.mod.open[m.bone] || 0);
                mv.append(h('div', { style: { marginBottom: '4px' } }, slider(m.label, 0, 100, Math.round(val * 100), { unit: '%', onInput: v => { S.mod.open[m.bone] = v / 100; sc.setOpen(m.bone, v / 100); VS.setDirty(true); }, onChange: () => VS.commit() })));
            }
            mv.append(h('div', { class: 'grid2', style: { marginTop: '6px' } },
                h('button', { class: 'btn sm', text: 'Hepsini aç', onclick: () => { sc.movables.forEach(m => { S.mod.open[m.bone] = 1; sc.setOpen(m.bone, 1); }); VS.commit(); VS.renderPanel(); } }),
                h('button', { class: 'btn sm', text: 'Hepsini kapat', onclick: () => { sc.movables.forEach(m => { S.mod.open[m.bone] = 0; sc.setOpen(m.bone, 0); }); VS.commit(); VS.renderPanel(); } })));
            body.append(card('Kapılar, kaput, bagaj', 'door', mv));
        }

        // seçili kemik
        if (S.selBone >= 0 && bones[S.selBone]) {
            const b = bones[S.selBone];
            const info = [];
            const gs = sc.vd.header.groups.filter(g => g.b === S.selBone);
            const cls = ['Boya', 'Cam', 'Metal', 'Lastik', 'Işık', 'İç mekan', 'Detay', 'Diğer'];
            const tri = {}; gs.forEach(g => { tri[g.c] = (tri[g.c] || 0) + g.n / 3; });
            const hasPaint = !!tri[0];
            const sel = h('div', null,
                h('div', { class: 'card-note', style: { fontSize: '11px', color: 'var(--mut)', lineHeight: '1.7' }, html:
                    `<b class="mono">${esc(b.n)}</b> · #${S.selBone}<br>Üst: <span class="mono">${b.p >= 0 && bones[b.p] ? esc(bones[b.p].n) : '—'}</span><br>Konum: <span class="mono">${b.t.map(v => v.toFixed(2)).join(', ')}</span><br>` +
                    (Object.keys(tri).length ? Object.entries(tri).map(([c, n]) => `${cls[c]}: ${Math.round(n)} üçgen`).join(' · ') : 'Bu kemikte geometri yok') }),
                h('div', { class: 'grid2', style: { marginTop: '8px' } },
                    h('button', { class: 'btn sm', html: icon('target') + ' Odaklan', onclick: () => VS.focusBone(S.selBone) }),
                    h('button', { class: 'btn sm', html: icon('eye') + ' Yalnız bu', onclick: () => { sc.isolateBone(S.selBone); S.mod.hidden = [...sc.hidden]; VS.commit(); VS.renderPanel(); } })));
            if (hasPaint) {
                sel.append(colorField('Parça boyası', S.mod.parts[S.selBone] || S.mod.body, c => { S.mod.parts[S.selBone] = c; sc.setBoneColor(S.selBone, c); VS.setDirty(true); }, () => VS.commit()));
                sel.append(h('button', { class: 'btn sm', style: { marginTop: '6px' }, text: 'Parça rengini sıfırla', onclick: () => { delete S.mod.parts[S.selBone]; sc.setBoneColor(S.selBone, null); VS.commit(); VS.renderPanel(); } }));
            }
            body.append(card('Seçili kemik', 'bone', sel));
        }

        // ağaç
        const inp = h('input', { class: 'inp', placeholder: 'Kemik ara…', value: S.boneFilter });
        body.append(h('div', { class: 'search', html: icon('search') }, inp));
        const tree = h('div', { class: 'btree' });
        body.append(tree);
        const { kids, roots } = boneRows();
        const q = () => S.boneFilter.trim().toLowerCase();
        const matches = (i) => !q() || bones[i].n.toLowerCase().includes(q()) || (kids[i] || []).some(matches);
        const rowFor = (i, depth) => {
            const b = bones[i], role = VSVehicle.boneRole(b.n);
            const kidsN = (kids[i] || []).length;
            const open = q() ? true : !!S.boneOpen[i];
            const hasGeo = sc.boneMeshes[i] && sc.boneMeshes[i].length;
            const row = h('div', { class: 'bnode' + (S.selBone === i ? ' sel' : '') + (sc.hidden.has(i) ? ' hid' : ''), style: { paddingLeft: (4 + depth * 12) + 'px' }, 'data-b': i },
                h('span', { class: 'tg', text: kidsN ? (open ? '▾' : '▸') : '' }),
                S.mod.parts[i] ? h('span', { class: 'dot', style: { background: S.mod.parts[i] } }) : null,
                h('span', { class: 'bn', text: b.n }),
                role ? h('span', { class: 'rl', text: role.kind === 'door' ? 'kapı' : role.kind === 'hood' ? 'kaput' : role.kind === 'boot' ? 'bagaj' : role.kind === 'wheel' ? 'teker' : 'ekstra' }) : null,
                hasGeo ? h('span', { class: 'eye', title: 'Göster/gizle', html: icon(sc.hidden.has(i) ? 'eyeOff' : 'eye') }) : null);
            row.addEventListener('click', e => {
                if (e.target.closest('.eye')) {
                    const vis = sc.hidden.has(i);
                    sc.setBoneVisible(i, vis, false);
                    S.mod.hidden = [...sc.hidden]; VS.commit(); VS.renderPanel();
                    return;
                }
                if (e.target.closest('.tg') && kidsN) { S.boneOpen[i] = !S.boneOpen[i]; VS.renderPanel(); return; }
                VS.selectBone(i);
            });
            row.addEventListener('dblclick', () => VS.focusBone(i));
            return row;
        };
        const walk = (i, depth) => {
            if (!matches(i)) return;
            tree.append(rowFor(i, depth));
            const open = q() ? true : !!S.boneOpen[i];
            if (open) for (const k of kids[i] || []) walk(k, depth + 1);
        };
        roots.forEach(r => walk(r, 0));
        inp.addEventListener('input', () => {
            S.boneFilter = inp.value;
            tree.innerHTML = '';
            roots.forEach(r => walk(r, 0));
        });
    }

    // ------------------------------------------------------------------ DIŞA AKTAR
    function renderExport(body) {
        body.append(h('div', { class: 'sh' }, h('i'), h('h3', { text: 'Dışa aktar' })));
        body.append(card('Proje', 'save', h('div', null,
            h('div', { class: 'grid2' },
                h('button', { class: 'btn pri', html: icon('save') + ' Kaydet', onclick: () => VS.saveProject() }),
                h('button', { class: 'btn', html: icon('folder') + ' Aç…', onclick: () => VS.openProject() })),
            h('div', { class: 'card-note', style: { marginTop: '8px', fontSize: '10.5px', color: 'var(--dim)', lineHeight: '1.5' }, text: 'Proje dosyası (.lvs) araç, katmanlar, boya ve iskelet ayarlarını içerir.' }))));
        body.append(card('Görüntüler', 'image', h('div', null,
            lbl('Doku çözünürlüğü (canlı önizleme)'),
            seg([['1024', '1024'], ['2048', '2048'], ['4096', '4096']], String(S.res), v => { S.res = +v; VS.sizeCanvas(); VS.designChanged(); VS.updateStatus(); }),
            h('div', { class: 'grid2', style: { marginTop: '10px' } },
                h('button', { class: 'btn', html: icon('download') + ' Tasarım PNG', title: 'Şeffaf, 4096', onclick: () => VS.exportDesignPng(false) }),
                h('button', { class: 'btn', html: icon('scan') + ' Şablon + tel kafes', onclick: () => VS.exportDesignPng(true) }),
                h('button', { class: 'btn', html: icon('grid') + ' Yüzey başına 5 PNG', onclick: () => VS.exportCharts() }),
                h('button', { class: 'btn', html: icon('cube') + ' 3B görüntü PNG', onclick: () => VS.exportRender() })))));
        body.append(card('Model', 'cube', h('div', null,
            h('button', { class: 'btn', style: { width: '100%' }, html: icon('cube') + ' OBJ (araç + UV) dışa aktar', onclick: () => VS.exportObj() }),
            h('div', { class: 'card-note', style: { marginTop: '8px', fontSize: '10.5px', color: 'var(--dim)', lineHeight: '1.5' }, text: 'Boya yüzeyleri kutu izdüşümüyle UV alır; tasarım PNG’si bu UV’ye birebir oturur.' }))));
        body.append(h('div', { class: 'footer-brand', text: 'LEGENDS OF EMPIRE ROLEPLAY' }));
    }
})();
