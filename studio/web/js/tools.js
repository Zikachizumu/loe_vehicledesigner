/* Araçlar: seçenek panelleri, fırça motoru, yerleştirme, şablonlar. 2B ve 3B girdisi aynı kodu kullanır. */
(function () {
    'use strict';
    const VS = window.VS, S = VS.S, E = VDEngine, L2 = VSLayout;
    const { $, $$, clamp, esc, ui } = VS;
    const { h, slider, colorField, seg, select, swatches, lbl } = ui;

    const TOOLS = [
        { id: 'select', icon: 'cursor', tr: 'Seç', key: 'V' },
        { id: 'brush', icon: 'brush', tr: 'Fırça', key: 'B', paint: true },
        { id: 'eraser', icon: 'eraser', tr: 'Silgi', key: 'E', paint: true },
        { id: 'smudge', icon: 'smudge', tr: 'Parmak', key: 'S', paint: true },
        { id: 'blur', icon: 'blur', tr: 'Bulanık', key: 'U', paint: true },
        'sep',
        { id: 'image', icon: 'image', tr: 'Görsel', key: 'I', place: true },
        { id: 'text', icon: 'type', tr: 'Metin', key: 'T', place: true },
        { id: 'shape', icon: 'square', tr: 'Şekil', key: 'H', place: true },
        { id: 'fill', icon: 'bucket', tr: 'Doldur', key: 'F', place: true },
        { id: 'gradient', icon: 'gradient', tr: 'Degrade', key: 'G', place: true },
        { id: 'stripes', icon: 'stripes', tr: 'Şerit', key: 'L' },
        { id: 'racenum', icon: 'hash', tr: 'Numara', key: 'N', place: true },
        { id: 'pattern', icon: 'pattern', tr: 'Desen', key: 'D', place: true },
        { id: 'presets', icon: 'layout', tr: 'Şablon', key: 'P' },
        { id: 'picker', icon: 'pipette', tr: 'Damlalık', key: 'K' },
    ];
    const byId = {}; TOOLS.forEach(t => { if (t !== 'sep') byId[t.id] = t; });

    const T = VS.tools = { list: TOOLS, byId };

    // ------------------------------------------------------------------ ARAÇ ÇUBUĞU
    T.renderRail = function () {
        const rail = $('#rail');
        rail.innerHTML = '';
        for (const t of TOOLS) {
            if (t === 'sep') { rail.append(h('div', { class: 'rail-sep' })); continue; }
            const b = h('button', { class: 'tool' + (S.tool === t.id ? ' on' : ''), title: `${t.tr} (${t.key})`, 'data-t': t.id, html: icon(t.icon) + `<span>${t.tr}</span>` });
            b.addEventListener('click', () => T.set(t.id));
            rail.append(b);
        }
    };

    T.set = function (id) {
        if (!byId[id]) return;
        S.tool = id;
        $$('#rail .tool').forEach(b => b.classList.toggle('on', b.dataset.t === id));
        const gl = $('#gl');
        gl.classList.toggle('paint', !!byId[id].paint);
        gl.classList.toggle('picking', !!byId[id].place || id === 'picker');
        if (VS.v2) VS.v2.cv.style.cursor = id === 'select' ? 'default' : 'crosshair';
        T.renderOpts();
        VS.updateHint();
    };

    // ------------------------------------------------------------------ YERLEŞTİRME YARDIMCILARI
    const chartOf = (id) => S.charts && S.charts.find(c => c.id === id);
    const chartCenter = (id) => { const c = chartOf(id); return c ? [c.rect[0] + c.rect[2] / 2, c.rect[1] + c.rect[3] / 2] : [S.design.size / 2, S.design.size / 2]; };
    T.chartOf = chartOf;

    // Tıklanan noktaya göre yüzey: 3B'den gelen chart id ya da 2B'deki chart nesnesi
    function resolveChart(chart, x, y) {
        if (typeof chart === 'string') return chartOf(chart);
        return chart || L2.chartAt(S.charts || [], x, y);
    }

    T.place = function (x, y, chart) {
        chart = resolveChart(chart, x, y);
        const id = S.tool;
        let made = null;
        if (id === 'text') {
            const t = S.text;
            made = VS.mkLayer('text', { x, y, text: t.text || 'Metin', font: t.font, bold: t.bold, italic: t.italic, fsize: t.size, spacing: t.spacing, line: 1.1, align: t.align, color: t.color });
            VS.warmFont(t.font, t.bold, t.italic);
        } else if (id === 'shape') {
            const def = E.SHAPES[S.shape.id];
            const f = chart ? (Math.min(chart.rect[2], chart.rect[3]) * 0.3) / Math.min(def.w, def.h) : 1;
            made = VS.mkLayer('shape', { x, y, shape: S.shape.id, w: Math.round(def.w * f), h: Math.round(def.h * f), color: S.shape.color });
        } else if (id === 'image') {
            const p = S.img.pending;
            if (!p) { VS.toast('Önce soldaki listeden bir görsel seç', 'err'); return null; }
            const f = chart ? Math.min(1, (Math.min(chart.rect[2], chart.rect[3]) * 0.5) / Math.max(p.w, p.h) * 1.0) : 1;
            made = VS.mkLayer('image', { x, y, src: p.src, w: Math.round(p.w * Math.max(f, 0.05)), h: Math.round(p.h * Math.max(f, 0.05)), name: p.name || 'Görsel' });
        } else if (id === 'fill') {
            if (S.fill.mode === 'body') { S.mod.body = S.fill.color; VS.applyMod(); VS.commit(); VS.renderPanel(); return null; }
            if (!chart) return null;
            made = VS.mkLayer('shape', { shape: 'square', x: chart.rect[0] + chart.rect[2] / 2, y: chart.rect[1] + chart.rect[3] / 2, w: chart.rect[2] + 4, h: chart.rect[3] + 4, color: S.fill.color, name: 'Dolgu ' + L2.NAMES[chart.id] });
        } else if (id === 'gradient') {
            if (!chart) return null;
            made = VS.mkLayer('gradient', { x: chart.rect[0] + chart.rect[2] / 2, y: chart.rect[1] + chart.rect[3] / 2, w: chart.rect[2] + 4, h: chart.rect[3] + 4, color: S.grad.c1, color2: S.grad.c2, angle: S.grad.angle, name: 'Degrade ' + L2.NAMES[chart.id] });
        } else if (id === 'pattern') {
            if (!chart) return null;
            made = VS.mkLayer('pattern', { x: chart.rect[0] + chart.rect[2] / 2, y: chart.rect[1] + chart.rect[3] / 2, w: chart.rect[2] + 4, h: chart.rect[3] + 4, pattern: S.patt.id, color: S.patt.c1, color2: S.patt.c2, pscale: S.patt.scale, name: 'Desen ' + L2.NAMES[chart.id] });
        } else if (id === 'racenum') {
            T.placeRaceNumber(x, y, chart);
            return null;
        }
        if (!made) return null;
        VS.addLayer(made);
        T.set('select');
        VS.renderPanel();
        return made;
    };

    T.placeRaceNumber = function (x, y, chart) {
        const r = S.race;
        const size = r.size;
        if (r.disc) VS.addLayer(VS.mkLayer('shape', { shape: 'circle', x, y, w: size * 1.05, h: size * 1.05, color: r.outline, name: 'Numara zemini' }), { nocommit: true });
        const t = VS.mkLayer('text', { x, y, text: String(r.num), font: r.font, bold: false, fsize: size * 0.72, spacing: 0, line: 1, align: 'center', color: r.color, name: 'Numara ' + r.num });
        VS.addLayer(t, { nocommit: true });
        VS.warmFont(r.font, false, false);
        VS.commit();
        T.set('select');
        VS.renderPanel();
    };

    // Yüzeylerin ortasına ekle (düğmeler)
    T.addAtChart = function (cid) {
        const [x, y] = chartCenter(cid);
        if (S.tool === 'racenum') return T.place(x, y, cid);
        return T.place(x, y, cid);
    };

    // ------------------------------------------------------------------ FIRÇA MOTORU
    const tips = {};
    function getTip(d, hard, color) {
        d = Math.max(2, Math.round(d));
        const key = d + '|' + Math.round(hard * 100) + '|' + color;
        if (tips[key]) return tips[key];
        const pad = 2, n = d + pad * 2;
        const c = document.createElement('canvas'); c.width = c.height = n;
        const x = c.getContext('2d');
        const g = x.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, d / 2);
        const rgb = VDColor.hexToRgb(color) || [255, 255, 255];
        const col = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},`;
        g.addColorStop(0, col + '1)');
        g.addColorStop(Math.min(0.98, hard), col + '1)');
        g.addColorStop(1, col + '0)');
        x.fillStyle = g; x.beginPath(); x.arc(n / 2, n / 2, d / 2, 0, 7); x.fill();
        if (Object.keys(tips).length > 60) for (const k in tips) delete tips[k];
        return (tips[key] = c);
    }

    let backup = null, tempCv = null;
    function paintTarget() {
        let L = VS.selLayer();
        if (L && L.type === 'paint' && !L.locked && L.visible) return L;
        const ls = S.design.layers;
        for (let i = ls.length - 1; i >= 0; i--) if (ls[i].type === 'paint' && ls[i].visible && !ls[i].locked) return ls[i];
        L = VS.mkLayer('paint', { res: 2048 });
        E.paintCanvas(L, true);
        VS.addLayer(L, { select: true });
        return L;
    }

    let st = null;   // etkin fırça darbesi

    function beginStroke(x, y, chart) {
        const L = paintTarget();
        if (S.sel !== L.id) { S.sel = L.id; VS.renderPanel(); }
        const canvas = E.paintCanvas(L, true);
        const k = canvas.width / S.design.size;
        const kind = S.tool;
        st = { L, canvas, ctx: canvas.getContext('2d'), k, kind, last: null, lastM: null, b: [1e9, 1e9, -1e9, -1e9], carry: null };
        if (!backup) backup = document.createElement('canvas');
        backup.width = canvas.width; backup.height = canvas.height;
        backup.getContext('2d').drawImage(canvas, 0, 0);
        if (kind === 'brush' || kind === 'eraser') {
            if (!tempCv) tempCv = document.createElement('canvas');
            tempCv.width = canvas.width; tempCv.height = canvas.height;
            st.tctx = tempCv.getContext('2d');
        }
        strokeTo(x, y, chart);
    }

    function mirrorPt(chart, x, y) {
        if (!S.brush.mirror || !chart || !S.bbox) return null;
        return L2.mirror(S.charts, S.bbox, chart, x, y);
    }

    function stampOne(x, y) {
        const k = st.k, d = S.brush.size * k;
        const r = d / 2 + 3;
        st.b[0] = Math.min(st.b[0], x * k - r); st.b[1] = Math.min(st.b[1], y * k - r);
        st.b[2] = Math.max(st.b[2], x * k + r); st.b[3] = Math.max(st.b[3], y * k + r);
        if (st.kind === 'brush' || st.kind === 'eraser') {
            const tip = getTip(d, S.brush.hard, st.kind === 'eraser' ? '#ffffff' : S.brush.color);
            st.tctx.drawImage(tip, x * k - tip.width / 2, y * k - tip.height / 2);
        } else if (st.kind === 'smudge') {
            const dd = Math.max(4, Math.ceil(d)), rr = dd / 2, px = x * k, py = y * k;
            if (!st.carry) {
                st.carry = document.createElement('canvas'); st.carry.width = st.carry.height = dd;
                st.carry.getContext('2d').drawImage(st.canvas, px - rr, py - rr, dd, dd, 0, 0, dd, dd);
            } else {
                const c = st.ctx;
                c.save(); c.beginPath(); c.arc(px, py, rr, 0, 7); c.clip();
                c.globalAlpha = clamp(S.brush.strength / 100, 0.05, 1) * 0.85;
                c.drawImage(st.carry, px - rr, py - rr, dd, dd);
                c.restore();
                const cc = st.carry.getContext('2d');
                cc.clearRect(0, 0, dd, dd);
                cc.drawImage(st.canvas, px - rr, py - rr, dd, dd, 0, 0, dd, dd);
            }
        } else if (st.kind === 'blur') {
            const dd = Math.max(4, Math.ceil(d)), rr = dd / 2, px = x * k, py = y * k;
            const tmp = st.tmp || (st.tmp = document.createElement('canvas'));
            tmp.width = tmp.height = dd;
            tmp.getContext('2d').drawImage(st.canvas, px - rr, py - rr, dd, dd, 0, 0, dd, dd);
            const c = st.ctx;
            c.save(); c.beginPath(); c.arc(px, py, rr, 0, 7); c.clip();
            c.filter = `blur(${Math.max(1, S.brush.strength / 100 * 7 * k)}px)`;
            c.clearRect(px - rr, py - rr, dd, dd);
            c.drawImage(tmp, px - rr, py - rr);
            c.restore();
        }
    }

    function strokeTo(x, y, chart) {
        if (!st) return;
        const cid = chart ? chart.id : null;
        const step = Math.max(2, S.brush.size * (st.kind === 'brush' || st.kind === 'eraser' ? 0.1 : 0.18));
        const m = mirrorPt(chart, x, y);
        if (st.last && st.lastChart === cid) {
            const dx = x - st.last[0], dy = y - st.last[1];
            const dist = Math.hypot(dx, dy);
            const n = Math.max(1, Math.floor(dist / step));
            for (let i = 1; i <= n; i++) {
                const t = i / n;
                stampOne(st.last[0] + dx * t, st.last[1] + dy * t);
                if (m && st.lastM) stampOne(st.lastM[0] + (m.x - st.lastM[0]) * t, st.lastM[1] + (m.y - st.lastM[1]) * t);
            }
        } else {
            stampOne(x, y);
            if (m) stampOne(m.x, m.y);
        }
        st.last = [x, y]; st.lastChart = cid; st.lastM = m ? [m.x, m.y] : null;
        if (st.kind === 'brush' || st.kind === 'eraser') {
            const c = st.ctx;
            c.save();
            c.globalCompositeOperation = 'copy';
            c.drawImage(backup, 0, 0);
            c.globalAlpha = clamp(S.brush.opacity / 100, 0.02, 1);
            c.globalCompositeOperation = st.kind === 'eraser' ? 'destination-out' : 'source-over';
            c.drawImage(tempCv, 0, 0);
            c.restore();
        }
        VS.designChanged();
    }

    function endStroke() {
        if (!st) return;
        const s = st; st = null;
        const w = s.canvas.width, hgt = s.canvas.height;
        const x0 = clamp(Math.floor(s.b[0]), 0, w), y0 = clamp(Math.floor(s.b[1]), 0, hgt);
        const x1 = clamp(Math.ceil(s.b[2]), 0, w), y1 = clamp(Math.ceil(s.b[3]), 0, hgt);
        if (x1 <= x0 || y1 <= y0) return;
        const before = backup.getContext('2d').getImageData(x0, y0, x1 - x0, y1 - y0);
        VS.commitPatch({ t: 'px', id: s.L.id, x: x0, y: y0, data: before });
        VS.updateLayerThumbs && VS.updateLayerThumbs(true);
    }

    // ------------------------------------------------------------------ DAMLALIK
    function sampleAt(x, y) {
        const k = VS.cv.width / S.design.size;
        const px = clamp(Math.floor(x * k), 0, VS.cv.width - 1), py = clamp(Math.floor(y * k), 0, VS.cv.height - 1);
        const d = VS.cv.getContext('2d').getImageData(px, py, 1, 1).data;
        if (d[3] < 12) return S.mod.body;
        const hex = (v) => v.toString(16).padStart(2, '0');
        if (d[3] === 255) return '#' + hex(d[0]) + hex(d[1]) + hex(d[2]);
        const rgb = VDColor.hexToRgb(S.mod.body) || [0, 0, 0], a = d[3] / 255;
        return '#' + [0, 1, 2].map(i => hex(Math.round(d[i] * a + rgb[i] * (1 - a)))).join('');
    }
    function pickColor(x, y) {
        const c = sampleAt(x, y);
        S.brush.color = c; S.text.color = c; S.shape.color = c; S.fill.color = c; S.grad.c1 = c;
        S.picked = c;
        VS.toast('Renk alındı: ' + c, 'ok');
        T.set('brush');
    }

    // ------------------------------------------------------------------ 2B GİRDİ
    T.down2d = function (p) {
        const id = S.tool, def = byId[id];
        if (def && def.paint) { if (p.chart) beginStroke(p.x, p.y, p.chart); else beginStroke(p.x, p.y, null); return; }
        if (id === 'picker') { pickColor(p.x, p.y); return; }
        if (def && def.place) { T.place(p.x, p.y, p.chart); }
    };
    T.move2d = function (p) { if (st) strokeTo(p.x, p.y, p.chart); };
    T.up2d = function () { endStroke(); };

    // ------------------------------------------------------------------ 3B GİRDİ
    // Dönüş: true → olay tüketildi (yörünge kontrolü başlamasın)
    let drag3 = null, down3 = null;
    T.pointer3d = function (type, e) {
        const sc = VS.scene;
        if (!sc || !sc.vd) return false;
        const id = S.tool, def = byId[id];
        if (type === 'down') {
            if (e.button !== 0) return false;
            down3 = { x: e.clientX, y: e.clientY, moved: false };
            const hit = sc.pick(e.clientX, e.clientY, false);
            if (def && def.paint) {
                if (hit && hit.chart) { beginStroke(hit.px, hit.py, chartOf(hit.chart)); drag3 = { k: 'stroke' }; return true; }
                return false;
            }
            if (id === 'picker') { if (hit && hit.chart) { pickColor(hit.px, hit.py); return true; } return false; }
            if (def && def.place) { if (hit && hit.chart) { T.place(hit.px, hit.py, hit.chart); return true; } return false; }
            if (id === 'select') {
                if (S.skeletonOn) {
                    const nb = sc.nearestBone(e.clientX, e.clientY, 13);
                    if (nb >= 0) { VS.selectBone(nb); down3.bone = true; return true; }
                }
                if (hit && hit.chart) {
                    const L = VS.selLayer();
                    if (L && !L.locked && E.hitLayer(L, hit.px, hit.py)) {
                        drag3 = { k: 'move', L, dx: L.x - hit.px, dy: L.y - hit.py };
                        return true;
                    }
                }
            }
            return false;
        }
        if (type === 'move') {
            if (down3 && Math.hypot(e.clientX - down3.x, e.clientY - down3.y) > 4) down3.moved = true;
            if (drag3 && drag3.k === 'stroke') {
                const hit = sc.pick(e.clientX, e.clientY, true);
                if (hit && hit.chart) strokeTo(hit.px, hit.py, chartOf(hit.chart));
                else if (st) { st.last = null; }
                return true;
            }
            if (drag3 && drag3.k === 'move') {
                const hit = sc.pick(e.clientX, e.clientY, true);
                if (hit && hit.chart) {
                    drag3.L.x = hit.px + drag3.dx; drag3.L.y = hit.py + drag3.dy;
                    VS.designChanged(); VS.syncProps && VS.syncProps();
                }
                return true;
            }
            // üzerine gelme: iskelet kemiği vurgusu
            if (S.skeletonOn && !down3) {
                const nb = sc.nearestBone(e.clientX, e.clientY, 11);
                if (nb !== sc.hoverBone) { sc.hoverBone = nb; sc.invalidate(); VS.updateBoneLabels && VS.updateBoneLabels(); }
            }
            return false;
        }
        if (type === 'up') {
            const wasClick = down3 && !down3.moved;
            const hadDrag = drag3;
            if (drag3 && drag3.k === 'stroke') endStroke();
            if (drag3 && drag3.k === 'move') { VS.commit(); VS.renderPanel(true); }
            drag3 = null;
            const d = down3; down3 = null;
            // seç aracıyla tıklama: katman seçimi
            if (wasClick && id === 'select' && !hadDrag && !(d && d.bone)) {
                const hit = sc.pick(e.clientX, e.clientY, false);
                if (hit && hit.chart) {
                    const L = E.hitTest(S.design, hit.px, hit.py, false);
                    S.sel = L ? L.id : null;
                    VS.renderPanel(); if (VS.v2) VS.v2.invalidate();
                }
                if (hit && !hit.chart && S.skeletonOn) VS.selectBone(hit.bone);
            }
            return false;
        }
        return false;
    };

    // ------------------------------------------------------------------ SEÇENEK PANELİ
    T.renderOpts = function () {
        const box = $('#opts');
        const id = S.tool;
        const def = byId[id];
        box.innerHTML = '';
        if (id === 'select') { box.classList.add('hidden'); return; }
        box.classList.remove('hidden');
        box.append(h('h4', { html: icon(def.icon) + def.tr.toUpperCase() }));
        const body = h('div');
        box.append(body);
        const R = OPTS[id];
        if (R) R(body);
    };

    const brushOpts = (body, withColor) => {
        if (withColor) body.append(colorField('Renk', S.brush.color, c => { S.brush.color = c; }, c => { S.brush.color = c; }));
        body.append(lbl('Boyut'), slider('', 4, 600, S.brush.size, { unit: ' px', onInput: v => { S.brush.size = v; } }));
        if (withColor) body.append(lbl('Sertlik'), slider('', 0, 100, Math.round(S.brush.hard * 100), { unit: '%', onInput: v => { S.brush.hard = v / 100; } }),
            lbl('Opaklık'), slider('', 2, 100, S.brush.opacity, { unit: '%', onInput: v => { S.brush.opacity = v; } }));
        else body.append(lbl('Güç'), slider('', 5, 100, S.brush.strength, { unit: '%', onInput: v => { S.brush.strength = v; } }));
        body.append(h('div', { class: 'row', style: { marginTop: '10px' } },
            h('button', { class: 'btn' + (S.brush.mirror ? ' on' : ''), html: icon('mirror') + ' Ayna X', onclick: function () { S.brush.mirror = !S.brush.mirror; this.classList.toggle('on', S.brush.mirror); } })));
        body.append(h('div', { class: 'card-note', style: { marginTop: '8px', fontSize: '10.5px', color: 'var(--dim)', lineHeight: '1.5' }, text: 'Araç üzerinde ya da 2B tuvalde boya. [ ve ] boyutu değiştirir.' }));
    };

    const chartButtons = (body, label) => {
        body.append(lbl(label || 'Yüzeyin ortasına ekle'));
        const g = h('div', { class: 'grid3' });
        for (const cid of ['top', 'left', 'right', 'front', 'rear']) {
            g.append(h('button', { class: 'btn sm', text: L2.NAMES[cid], onclick: () => T.addAtChart(cid) }));
        }
        body.append(g);
    };

    const OPTS = {
        brush: (b) => brushOpts(b, true),
        eraser: (b) => brushOpts(b, false),
        smudge: (b) => brushOpts(b, false),
        blur: (b) => brushOpts(b, false),

        text(b) {
            const t = S.text;
            const ta = h('textarea', { class: 'inp', value: t.text, placeholder: 'Metin…' });
            ta.value = t.text;
            ta.addEventListener('input', () => { t.text = ta.value; });
            b.append(lbl('İçerik'), ta,
                lbl('Yazı tipi'), select(VS.FONTS, t.font, v => { t.font = v; VS.warmFont(v, t.bold, t.italic); }),
                lbl('Boyut'), slider('', 40, 1200, t.size, { onInput: v => { t.size = v; } }),
                lbl('Harf aralığı'), slider('', -50, 400, t.spacing, { onInput: v => { t.spacing = v; } }),
                colorField('Renk', t.color, c => { t.color = c; }),
                h('div', { class: 'row', style: { marginTop: '6px' } },
                    h('button', { class: 'btn' + (t.bold ? ' on' : ''), text: 'B', style: { fontWeight: 900 }, onclick: function () { t.bold = !t.bold; this.classList.toggle('on', t.bold); } }),
                    h('button', { class: 'btn' + (t.italic ? ' on' : ''), text: 'I', style: { fontStyle: 'italic' }, onclick: function () { t.italic = !t.italic; this.classList.toggle('on', t.italic); } }),
                    seg([['left', 'Sol'], ['center', 'Orta'], ['right', 'Sağ']], t.align, v => { t.align = v; })));
            chartButtons(b);
            b.append(h('div', { class: 'card-note', style: { marginTop: '8px', fontSize: '10.5px', color: 'var(--dim)' }, text: 'Ya da araca / tuvale tıklayarak yerleştir.' }));
        },

        shape(b) {
            const grid = h('div', { class: 'shape-grid' });
            for (const sid of E.SHAPE_ORDER) {
                const sh = E.SHAPES[sid];
                const btn = h('button', { class: 'shape-btn' + (S.shape.id === sid ? ' on' : ''), title: sid, html: `<svg viewBox="0 0 100 100"><path d="${sh.d}"/></svg>` });
                btn.addEventListener('click', () => { S.shape.id = sid; grid.querySelectorAll('.shape-btn').forEach(x => x.classList.toggle('on', x === btn)); });
                grid.append(btn);
            }
            b.append(grid, colorField('Renk', S.shape.color, c => { S.shape.color = c; }));
            chartButtons(b);
        },

        fill(b) {
            b.append(seg([['chart', 'Yüzey'], ['body', 'Gövde rengi']], S.fill.mode, v => { S.fill.mode = v; }),
                colorField('Renk', S.fill.color, c => { S.fill.color = c; }));
            b.append(h('div', { class: 'card-note', style: { marginTop: '8px', fontSize: '10.5px', color: 'var(--dim)', lineHeight: '1.5' }, text: 'Yüzey: tıklanan yüzeyin tamamını boyar. Gövde rengi: aracın ana boyasını değiştirir.' }));
        },

        gradient(b) {
            b.append(colorField('Renk A', S.grad.c1, c => { S.grad.c1 = c; }), colorField('Renk B', S.grad.c2, c => { S.grad.c2 = c; }),
                lbl('Açı'), slider('', 0, 360, S.grad.angle, { unit: '°', onInput: v => { S.grad.angle = v; } }));
            b.append(h('div', { class: 'card-note', style: { marginTop: '8px', fontSize: '10.5px', color: 'var(--dim)' }, text: 'Tıklanan yüzeye degrade uygular.' }));
        },

        pattern(b) {
            b.append(lbl('Desen'), select(E.PATTERNS.map(p => [p, ({ checker: 'Dama', stripes: 'Yatay çizgi', vstripes: 'Dikey çizgi', diag: 'Çapraz', dots: 'Nokta', hex: 'Petek', camo: 'Kamuflaj' })[p]]), S.patt.id, v => { S.patt.id = v; }),
                colorField('Renk 1', S.patt.c1, c => { S.patt.c1 = c; }), colorField('Renk 2', S.patt.c2, c => { S.patt.c2 = c; }),
                lbl('Ölçek'), slider('', 0.3, 4, S.patt.scale, { step: 0.1, onInput: v => { S.patt.scale = v; } }));
            b.append(h('div', { class: 'card-note', style: { marginTop: '8px', fontSize: '10.5px', color: 'var(--dim)' }, text: 'Tıklanan yüzeyi desenle kaplar.' }));
        },

        racenum(b) {
            const r = S.race;
            const inp = h('input', { class: 'inp', value: r.num, maxlength: 4 });
            inp.addEventListener('input', () => { r.num = inp.value; });
            b.append(lbl('Numara'), inp, lbl('Yazı tipi'), select(VS.FONTS, r.font, v => { r.font = v; VS.warmFont(v, false, false); }),
                lbl('Boyut'), slider('', 150, 1000, r.size, { onInput: v => { r.size = v; } }),
                colorField('Rakam rengi', r.color, c => { r.color = c; }), colorField('Zemin rengi', r.outline, c => { r.outline = c; }),
                h('div', { class: 'row', style: { marginTop: '6px' } }, h('button', { class: 'btn' + (r.disc ? ' on' : ''), text: 'Zemin diski', onclick: function () { r.disc = !r.disc; this.classList.toggle('on', r.disc); } })));
            b.append(lbl('Hızlı yerleştir'));
            b.append(h('div', { class: 'grid2' },
                h('button', { class: 'btn sm', text: 'Her iki kapı', onclick: () => { T.addAtChart('left'); S.tool = 'racenum'; T.addAtChart('right'); } }),
                h('button', { class: 'btn sm', text: 'Kaput + çatı', onclick: () => { const c = chartOf('top'); if (!c) return; const [x, y] = [c.rect[0] + c.rect[2] * 0.42, c.rect[1] + c.rect[3] / 2]; T.placeRaceNumber(x, y, c); } })));
        },

        image(b) {
            const p = S.img.pending;
            b.append(h('div', { class: 'row' },
                h('button', { class: 'btn pri', html: icon('upload') + ' Dosyadan', onclick: () => VS.pickImageFile() }),
                h('button', { class: 'btn', html: icon('link') + ' Panodan', onclick: () => VS.pasteImage() })));
            const url = h('input', { class: 'inp', placeholder: 'https://… görsel adresi', style: { marginTop: '6px' } });
            url.addEventListener('keydown', e => { if (e.key === 'Enter') VS.addImageFromUrl(url.value); });
            b.append(url);
            b.append(lbl('Hazır çıkartmalar'));
            const grid = h('div', { class: 'asset-grid' });
            for (const d of VS.DECALS) {
                const a = h('button', { class: 'asset', title: d, style: { backgroundImage: `url(decals/${d}.svg)` } });
                a.addEventListener('click', () => VS.setPendingImage('decal:' + d, 512, 512, d));
                grid.append(a);
            }
            b.append(grid);
            if (S.img.recents.length) {
                b.append(lbl('Son kullanılanlar'));
                const g2 = h('div', { class: 'asset-grid' });
                for (const r of S.img.recents) {
                    const a = h('button', { class: 'asset', style: { backgroundImage: `url(${r.src})` } });
                    a.addEventListener('click', () => VS.setPendingImage(r.src, r.w, r.h, r.name));
                    g2.append(a);
                }
                b.append(g2);
            }
            b.append(h('div', { class: 'card-note', id: 'pendingNote', style: { marginTop: '8px', fontSize: '10.5px', color: p ? 'var(--accent-2)' : 'var(--dim)', lineHeight: '1.5' }, text: p ? 'Seçili: ' + (p.name || 'görsel') + ' — araca ya da tuvale tıkla.' : 'Bir görsel seç, sonra araca/tuvale tıkla. Sürükle-bırak ve Ctrl+V de çalışır.' }));
            chartButtons(b);
        },

        stripes(b) {
            const s = S.stripes;
            b.append(lbl('Şerit türü'), select([['racing', 'Yarış (çift şerit)'], ['center', 'Tek orta şerit'], ['sill', 'Eşik çizgisi'], ['belt', 'Kemer çizgisi'], ['wave', 'Yan dalga'], ['hood', 'Kaput + çatı bloğu']], s.id, v => { s.id = v; }),
                colorField('Ana renk', s.c1, c => { s.c1 = c; }), colorField('Vurgu rengi', s.c2, c => { s.c2 = c; }),
                lbl('Kalınlık'), slider('', 0.4, 2.2, s.width, { step: 0.05, onInput: v => { s.width = v; } }));
            b.append(h('div', { class: 'row', style: { marginTop: '10px' } }, h('button', { class: 'btn pri', html: icon('check') + ' Uygula', onclick: () => T.applyStripes() })));
        },

        presets(b) {
            const list = h('div', { class: 'tpl' });
            for (const t of VS.TEMPLATES) {
                const btn = h('button', { html: `<i style="--c1:${t.c1};--c2:${t.c2}"></i><span>${esc(t.name)}<small>${esc(t.desc)}</small></span>` });
                btn.addEventListener('click', async () => {
                    const ok = !S.design.layers.length || await VS.confirm('Şablon uygula', 'Mevcut katmanlar silinip şablon uygulanacak. Devam edilsin mi?', 'Uygula');
                    if (ok) T.applyTemplate(t);
                });
                list.append(btn);
            }
            b.append(list);
        },

        picker(b) {
            b.append(h('div', { class: 'card-note', style: { fontSize: '11px', color: 'var(--mut)', lineHeight: '1.6' }, text: 'Araca ya da tuvale tıkla; o noktanın rengi fırçaya, metne ve şekle atanır.' }));
            if (S.picked) b.append(colorField('Son alınan', S.picked, () => { }));
        },
    };

    // ------------------------------------------------------------------ ŞERİTLER
    T.applyStripes = function () {
        const s = S.stripes, W = s.width;
        const rect = (c, fx, fy, fw, fh, color, name) => {
            const r = c.rect;
            VS.addLayer(VS.mkLayer('shape', { shape: 'square', x: r[0] + r[2] * fx, y: r[1] + r[3] * fy, w: Math.max(2, r[2] * fw), h: Math.max(2, r[3] * fh), color, name }), { nocommit: true, select: false });
        };
        const top = chartOf('top'), left = chartOf('left'), right = chartOf('right'), front = chartOf('front'), rear = chartOf('rear');
        if (!top) return;
        switch (s.id) {
            case 'racing':
                for (const dy of [-0.12, 0.12]) rect(top, 0.5, 0.5 + dy, 1, 0.14 * W, s.c1, 'Şerit');
                for (const dy of [-0.22, 0.22]) rect(top, 0.5, 0.5 + dy, 1, 0.025 * W, s.c2, 'Vurgu');
                for (const c of [front, rear]) if (c) { for (const dx of [-0.12, 0.12]) rect(c, 0.5 + dx, 0.5, 0.1 * W, 1, s.c1, 'Şerit'); }
                break;
            case 'center':
                rect(top, 0.5, 0.5, 1, 0.2 * W, s.c1, 'Şerit'); rect(top, 0.5, 0.5, 1, 0.05 * W, s.c2, 'Vurgu');
                for (const c of [front, rear]) if (c) rect(c, 0.5, 0.5, 0.18 * W, 1, s.c1, 'Şerit');
                break;
            case 'sill':
                for (const c of [left, right]) if (c) { rect(c, 0.5, 0.86, 0.9, 0.07 * W, s.c1, 'Eşik'); rect(c, 0.5, 0.8, 0.9, 0.02 * W, s.c2, 'Vurgu'); }
                break;
            case 'belt':
                for (const c of [left, right]) if (c) { rect(c, 0.5, 0.52, 1, 0.07 * W, s.c1, 'Kemer'); rect(c, 0.5, 0.6, 1, 0.025 * W, s.c2, 'Vurgu'); }
                break;
            case 'wave':
                for (const c of [left, right]) if (c) {
                    const r = c.rect;
                    VS.addLayer(VS.mkLayer('shape', { shape: 'chevron', x: r[0] + r[2] * 0.55, y: r[1] + r[3] * 0.62, w: r[2] * 0.62, h: r[3] * 0.34 * W, color: s.c1, name: 'Dalga' }), { nocommit: true, select: false });
                    VS.addLayer(VS.mkLayer('shape', { shape: 'chevron', x: r[0] + r[2] * 0.62, y: r[1] + r[3] * 0.62, w: r[2] * 0.62, h: r[3] * 0.34 * W, color: s.c2, name: 'Dalga' }), { nocommit: true, select: false });
                }
                break;
            case 'hood':
                rect(top, 0.86, 0.5, 0.26, 0.82 * W, s.c1, 'Kaput');
                rect(top, 0.58, 0.5, 0.2, 0.7 * W, s.c1, 'Çatı');
                rect(top, 0.1, 0.5, 0.2, 0.78 * W, s.c1, 'Bagaj');
                break;
        }
        VS.commit(); VS.renderPanel();
    };

    // ------------------------------------------------------------------ ŞABLONLAR
    VS.TEMPLATES = [
        { id: 'police', name: 'Polis (siyah-beyaz)', desc: 'Beyaz gövde, siyah kapı ve kaput, POLICE yazısı', c1: '#f4f5f7', c2: '#101114' },
        { id: 'ems', name: 'Ambulans (EMS)', desc: 'Beyaz gövde, turuncu şerit, hayat yıldızı', c1: '#f4f5f7', c2: '#ff6a00' },
        { id: 'fire', name: 'İtfaiye', desc: 'Kırmızı gövde, beyaz şerit, FIRE DEPT', c1: '#c4161c', c2: '#ffffff' },
        { id: 'sheriff', name: 'Şerif', desc: 'Bej gövde, kahverengi şerit, yıldız', c1: '#c9b78a', c2: '#4a3418' },
        { id: 'taxi', name: 'Taksi', desc: 'Sarı gövde, dama şeridi, TAXI', c1: '#f7c21a', c2: '#111111' },
        { id: 'racing', name: 'Yarış', desc: 'Çift şerit, numara diski, sponsor blokları', c1: '#13151a', c2: '#ff2e93' },
        { id: 'loe', name: 'LOE Özel', desc: 'Magenta degrade, taç, LEGENDS OF EMPIRE', c1: '#ff2e93', c2: '#1a0b3d' },
    ];

    T.applyTemplate = function (t) {
        S.design.layers = [];
        S.sel = null;
        const C = (id) => chartOf(id);
        const R = (id, fx, fy, fw, fh, color, name, shape) => {
            const c = C(id); if (!c) return;
            const r = c.rect;
            VS.addLayer(VS.mkLayer('shape', { shape: shape || 'square', x: r[0] + r[2] * fx, y: r[1] + r[3] * fy, w: Math.max(2, r[2] * fw), h: Math.max(2, r[3] * fh), color, name }), { nocommit: true, select: false });
        };
        const TX = (id, fx, fy, text, fsize, color, font, extra) => {
            const c = C(id); if (!c) return;
            const r = c.rect;
            VS.addLayer(VS.mkLayer('text', Object.assign({ x: r[0] + r[2] * fx, y: r[1] + r[3] * fy, text, fsize: fsize * r[3], font: font || 'Anton', color, align: 'center', spacing: 40, line: 1.05, name: text }, extra || {})), { nocommit: true, select: false });
            VS.warmFont(font || 'Anton', false, false);
        };
        const DC = (id, fx, fy, decal, fw, rot) => {
            const c = C(id); if (!c) return;
            const r = c.rect;
            const sz = Math.min(r[2], r[3]) * fw;
            VS.addLayer(VS.mkLayer('image', { x: r[0] + r[2] * fx, y: r[1] + r[3] * fy, w: sz, h: sz, src: 'decal:' + decal, rot: rot || 0, name: decal }), { nocommit: true, select: false });
        };
        const sides = ['left', 'right'];
        S.mod.body = t.c1; S.mod.finish = 'gloss';
        if (t.id === 'police') {
            sides.forEach(s => { R(s, 0.5, 0.64, 0.62, 0.26, '#101114', 'Kapı paneli'); TX(s, 0.5, 0.64, 'POLICE', 0.17, '#ffffff'); DC(s, 0.3, 0.52, 'police_shield', 0.2); TX(s, 0.86, 0.5, '911', 0.12, '#101114'); });
            R('top', 0.86, 0.5, 0.22, 0.84, '#101114', 'Kaput'); R('top', 0.07, 0.5, 0.14, 0.78, '#101114', 'Bagaj');
            DC('top', 0.5, 0.5, 'police_shield', 0.5, 90);
            TX('front', 0.5, 0.35, 'POLICE', 0.14, '#101114', 'Anton', { fsize: 150 }); R('rear', 0.5, 0.45, 0.8, 0.12, '#101114', 'Bagaj bandı'); TX('rear', 0.5, 0.45, 'POLICE', 0.1, '#ffffff');
        } else if (t.id === 'ems') {
            sides.forEach(s => { R(s, 0.5, 0.72, 0.92, 0.1, '#ff6a00', 'Şerit'); R(s, 0.5, 0.82, 0.92, 0.03, '#ff6a00', 'Şerit 2'); DC(s, 0.28, 0.48, 'star_of_life', 0.26); TX(s, 0.62, 0.5, 'AMBULANCE', 0.15, '#c4161c'); TX(s, 0.88, 0.5, 'EMS', 0.11, '#ff6a00'); });
            DC('top', 0.5, 0.5, 'star_of_life', 0.6, 90); R('top', 0.86, 0.5, 0.2, 0.15, '#ff6a00', 'Kaput şeridi');
            TX('front', 0.5, 0.4, 'EMS', 0.18, '#c4161c');
        } else if (t.id === 'fire') {
            sides.forEach(s => { R(s, 0.5, 0.5, 0.96, 0.06, '#ffffff', 'Beyaz şerit'); TX(s, 0.5, 0.3, 'FIRE DEPT', 0.17, '#ffffff'); DC(s, 0.18, 0.62, 'star_of_life', 0.2); TX(s, 0.82, 0.62, 'ENGINE 01', 0.1, '#ffffff'); });
            R('top', 0.5, 0.5, 1, 0.12, '#ffffff', 'Çatı şeridi'); TX('front', 0.5, 0.45, 'FD', 0.2, '#ffffff');
        } else if (t.id === 'sheriff') {
            sides.forEach(s => { R(s, 0.5, 0.58, 0.96, 0.1, '#4a3418', 'Şerit'); R(s, 0.5, 0.7, 0.96, 0.03, '#4a3418', 'Şerit 2'); DC(s, 0.3, 0.38, 'sheriff_star', 0.22); TX(s, 0.64, 0.4, "SHERIFF", 0.15, '#4a3418'); TX(s, 0.88, 0.85, 'SO-04', 0.08, '#4a3418'); });
            R('top', 0.86, 0.5, 0.24, 0.8, '#4a3418', 'Kaput'); DC('top', 0.45, 0.5, 'sheriff_star', 0.5, 90);
        } else if (t.id === 'taxi') {
            sides.forEach(s => { R(s, 0.5, 0.58, 0.96, 0.06, '#111111', 'Şerit'); TX(s, 0.5, 0.38, 'TAXI', 0.2, '#111111'); TX(s, 0.88, 0.8, 'CAB 17', 0.08, '#111111'); });
            R('top', 0.5, 0.5, 0.3, 0.3, '#111111', 'Çatı tabelası'); TX('top', 0.5, 0.5, 'TAXI', 0.12, '#f7c21a');
            const c = C('left'); if (c) for (const s of sides) { const r = C(s).rect; VS.addLayer(VS.mkLayer('pattern', { x: r[0] + r[2] * 0.5, y: r[1] + r[3] * 0.585, w: r[2] * 0.96, h: r[3] * 0.045, pattern: 'checker', color: '#111111', color2: '#f7c21a', pscale: 0.35, name: 'Dama' }), { nocommit: true, select: false }); }
        } else if (t.id === 'racing') {
            S.mod.body = '#13151a';
            for (const dy of [-0.12, 0.12]) R('top', 0.5, 0.5 + dy, 1, 0.12, t.c2, 'Şerit');
            sides.forEach(s => { R(s, 0.5, 0.82, 0.92, 0.07, t.c2, 'Eşik'); R(s, 0.5, 0.48, 0.2, 0.3, '#ffffff', 'Zemin disk', 'circle'); TX(s, 0.5, 0.48, '07', 0.26, '#13151a'); TX(s, 0.78, 0.62, 'LOE', 0.1, '#ffffff'); TX(s, 0.2, 0.62, 'RACING', 0.1, t.c2); });
            DC('top', 0.28, 0.5, 'racing_stripes', 0.5, 90);
        } else if (t.id === 'loe') {
            const w = (id) => { const c = C(id); if (!c) return; const r = c.rect; VS.addLayer(VS.mkLayer('gradient', { x: r[0] + r[2] / 2, y: r[1] + r[3] / 2, w: r[2] + 4, h: r[3] + 4, color: '#ff2e93', color2: '#1a0b3d', angle: 90, name: 'Degrade' }), { nocommit: true, select: false }); };
            ['top', 'left', 'right', 'front', 'rear'].forEach(w);
            sides.forEach(s => { DC(s, 0.3, 0.45, 'loe_crown', 0.3); TX(s, 0.65, 0.42, 'LEGENDS OF', 0.12, '#ffffff', 'Chakra Petch', { bold: true }); TX(s, 0.65, 0.58, 'EMPIRE', 0.15, '#ff2e93', 'Chakra Petch', { bold: true }); });
            DC('top', 0.5, 0.5, 'loe_crown', 0.55, 90);
        }
        S.sel = null;
        VS.applyMod();
        VS.designChanged(); VS.commit(); VS.renderPanel();
        T.set('select');
        VS.toast('Şablon uygulandı: ' + t.name, 'ok');
    };

    // ------------------------------------------------------------------ GÖRSEL İÇE AKTARMA
    VS.DECALS = ['battenburg', 'checker_bw', 'chevrons_rw', 'ems_stripe', 'flames', 'hazard', 'loe_crown', 'number_disc', 'police_shield', 'racing_stripes', 'sheriff_star', 'star_of_life', 'swoosh'];

    VS.setPendingImage = function (src, w, h, name) {
        S.img.pending = { src, w, h, name };
        if (src.startsWith('data:')) {
            S.img.recents = [{ src, w, h, name }, ...S.img.recents.filter(r => r.src !== src)].slice(0, 8);
        }
        if (S.tool !== 'image') T.set('image'); else T.renderOpts();
        VS.updateHint();
    };

    // Büyük görselleri küçült (en çok 2048 px), data URI üret
    function shrink(img) {
        const max = 2048;
        let w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
        const f = Math.min(1, max / Math.max(w, h));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(w * f)); c.height = Math.max(1, Math.round(h * f));
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        return { src: c.toDataURL('image/png'), w: c.width, h: c.height };
    }
    VS.imageFromBlob = function (blob, name) {
        return new Promise((res, rej) => {
            const url = URL.createObjectURL(blob);
            const im = new Image();
            im.onload = () => { const o = shrink(im); URL.revokeObjectURL(url); VS.setPendingImage(o.src, o.w, o.h, name || 'Görsel'); res(); };
            im.onerror = () => { URL.revokeObjectURL(url); VS.toast('Görsel okunamadı', 'err'); rej(); };
            im.src = url;
        });
    };
    VS.pickImageFile = function () {
        const inp = document.createElement('input');
        inp.type = 'file'; inp.accept = 'image/*';
        inp.onchange = () => { const f = inp.files[0]; if (f) VS.imageFromBlob(f, f.name.replace(/\.[^.]+$/, '')); };
        inp.click();
    };
    VS.pasteImage = async function () {
        try {
            const items = await navigator.clipboard.read();
            for (const it of items) {
                const t = it.types.find(x => x.startsWith('image/'));
                if (t) { await VS.imageFromBlob(await it.getType(t), 'Pano'); return; }
            }
            VS.toast('Panoda görsel yok', 'err');
        } catch (e) { VS.toast('Panoya erişilemedi (Ctrl+V dene)', 'err'); }
    };
    VS.addImageFromUrl = async function (url) {
        url = (url || '').trim();
        if (!/^https?:\/\//i.test(url)) { VS.toast('Geçerli bir adres gir', 'err'); return; }
        try {
            const r = await fetch(url);
            await VS.imageFromBlob(await r.blob(), 'Web görseli');
        } catch (e) { VS.toast('Adres okunamadı (CORS?) — dosyayı indirip yükle', 'err'); }
    };
})();
