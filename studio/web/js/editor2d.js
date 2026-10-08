/* 2B tuval düzenleyici: kaydır/yakınlaştır, X-ışını (UV tel kafes), katman seçimi + dönüştürme tutamaçları, fırça girdisi. */
(function () {
    'use strict';
    const VS = window.VS, S = VS.S, E = VDEngine, L2 = VSLayout;
    const { $, clamp } = VS;

    const PART_TR = {
        bodyshell: 'GÖVDE', chassis: 'ŞASİ', bonnet: 'KAPUT', boot: 'BAGAJ', door_dside_f: 'SÜRÜCÜ KAPISI', door_pside_f: 'YOLCU KAPISI',
        door_dside_r: 'SOL ARKA KAPI', door_pside_r: 'SAĞ ARKA KAPI', wing_lf: 'ÇAMURLUK', wing_rf: 'ÇAMURLUK', bumper_f: 'ÖN TAMPON', bumper_r: 'ARKA TAMPON',
    };
    function partName(bone, chart) {
        if (bone === 'bodyshell' && chart === 'top') return 'ÇATI';
        if (PART_TR[bone]) return PART_TR[bone];
        if (bone.startsWith('extra_')) return 'EKSTRA ' + bone.slice(6);
        if (bone.startsWith('misc_')) return 'PARÇA';
        return bone.toUpperCase();
    }

    class Editor2D {
        constructor(stage, canvas) {
            this.stage = stage; this.cv = canvas;
            this.ctx = canvas.getContext('2d');
            this.scale = 0.2; this.ox = 0; this.oy = 0;
            this.dirty = true;
            this.wireFill = this.wireLine = this.wireFull = null; this.labels = [];
            this.drag = null;
            this.hover = null;
            this.spaceDown = false;
            new ResizeObserver(() => this.resize()).observe(stage);
            this.bind();
            const loop = () => { requestAnimationFrame(loop); if (this.dirty) { this.dirty = false; this.draw(); } };
            loop();
        }

        invalidate() { this.dirty = true; }

        resize() {
            const r = this.stage.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
            this.cv.width = Math.max(1, Math.round(r.width * dpr));
            this.cv.height = Math.max(1, Math.round(r.height * dpr));
            this.dpr = dpr; this.W = r.width; this.H = r.height;
            if (!this.fitted) this.fit();
            this.invalidate();
        }

        fit() {
            const size = S.design.size;
            const s = Math.min(this.W / size, this.H / size) * 0.96;
            this.scale = s || 0.1;
            this.fitScale = this.scale;
            this.ox = (this.W - size * this.scale) / 2;
            this.oy = (this.H - size * this.scale) / 2;
            this.fitted = true;
            this.invalidate();
            this.updateZoomText();
        }

        updateZoomText() {
            const el = $('#zoomTxt');
            if (el) el.textContent = Math.round(this.scale / (this.fitScale || this.scale) * 100) + '%';
        }

        // ekran ↔ tuval
        toDesign(px, py) { return [(px - this.ox) / this.scale, (py - this.oy) / this.scale]; }
        eventPt(e) {
            const r = this.cv.getBoundingClientRect();
            return [e.clientX - r.left, e.clientY - r.top];
        }

        // ------------------------------------------------------------------ TEL KAFES (UV)
        // temiz mod: parça içi yumuşak dolgu (tasarımın ALTINDA) + yalnızca parça sınır çizgileri (üstünde); detay modu: tüm üçgen kenarları
        buildWire() {
            this.wireFill = this.wireLine = this.wireFull = null; this.labels = [];
            const sc = VS.scene;
            if (!sc || !sc.paintMeshes) return;
            const size = S.design.size, N = 2048, k = N / size;
            const colors = ['#38bdf8', '#ff2e93', '#34d399', '#fb923c', '#a855f7'];
            const mk = () => { const c = document.createElement('canvas'); c.width = c.height = N; return c; };
            const fillC = mk(), lineC = mk();
            const fx = fillC.getContext('2d'), lx = lineC.getContext('2d');
            const acc = {}, bones = sc.vd.header.bones;
            const tris = [];
            const fillPaths = colors.map(() => new Path2D());
            const lineBuckets = [[], [], [], [], []];
            const vk = (x, y) => Math.round(x * 2) * 4099 + Math.round(y * 2);
            for (const m of sc.paintMeshes) {
                const uv = m.geometry.attributes.uv.array, ch = m.geometry.attributes.chart.array;
                const nt = ch.length / 3, bn = bones[m.userData.bone].n;
                const edges = new Map();
                for (let t = 0; t < nt; t++) {
                    const c = ch[t * 3] | 0;
                    const P = [];
                    for (let q = 0; q < 3; q++) P.push(uv[t * 6 + q * 2] * size * k, (1 - uv[t * 6 + q * 2 + 1]) * size * k);
                    tris.push([c, P[0], P[1], P[2], P[3], P[4], P[5]]);
                    const path = fillPaths[c];
                    path.moveTo(P[0], P[1]); path.lineTo(P[2], P[3]); path.lineTo(P[4], P[5]); path.closePath();
                    for (let q = 0; q < 3; q++) {
                        const x1 = P[q * 2], y1 = P[q * 2 + 1], x2 = P[((q + 1) % 3) * 2], y2 = P[((q + 1) % 3) * 2 + 1];
                        const a1 = vk(x1, y1), b1 = vk(x2, y2);
                        const key = a1 < b1 ? a1 * 16800000 + b1 : b1 * 16800000 + a1;
                        const e = edges.get(key);
                        if (e) e.n++; else edges.set(key, { n: 1, c, x1, y1, x2, y2 });
                    }
                    const key2 = c + '|' + bn;
                    const e2 = acc[key2] || (acc[key2] = { c, bn, n: 0, sx: 0, sy: 0 });
                    e2.n++; e2.sx += (P[0] + P[2] + P[4]) / 3; e2.sy += (P[1] + P[3] + P[5]) / 3;
                }
                for (const e of edges.values()) if (e.n === 1) lineBuckets[e.c].push(e);
            }
            for (let c = 0; c < 5; c++) {
                fx.fillStyle = colors[c]; fx.globalAlpha = 0.13; fx.fill(fillPaths[c]);
                lx.strokeStyle = colors[c]; lx.globalAlpha = 0.9; lx.lineWidth = 1.5; lx.lineCap = 'round';
                lx.beginPath();
                for (const e of lineBuckets[c]) { lx.moveTo(e.x1, e.y1); lx.lineTo(e.x2, e.y2); }
                lx.stroke();
            }
            this.wireFill = fillC; this.wireLine = lineC; this._tris = tris;
            const cid = ['top', 'left', 'right', 'front', 'rear'];
            this.labels = Object.values(acc).filter(e => e.n >= 80).map(e => ({ chart: e.c, text: partName(e.bn, cid[e.c]), x: e.sx / e.n / k, y: e.sy / e.n / k, n: e.n }));
            this.invalidate();
        }

        // detay modu (tüm kenarlar) ihtiyaç olunca çizilir
        ensureFull() {
            if (this.wireFull || !this._tris) return;
            const N = 2048, colors = ['#38bdf8', '#ff2e93', '#34d399', '#fb923c', '#a855f7'];
            const c = document.createElement('canvas'); c.width = c.height = N;
            const x = c.getContext('2d'); x.lineWidth = 1;
            for (let ch = 0; ch < 5; ch++) {
                x.strokeStyle = colors[ch]; x.globalAlpha = 0.5; x.beginPath();
                for (const t of this._tris) if (t[0] === ch) { x.moveTo(t[1], t[2]); x.lineTo(t[3], t[4]); x.lineTo(t[5], t[6]); x.closePath(); }
                x.stroke();
            }
            this.wireFull = c;
        }

        // ------------------------------------------------------------------ ÇİZİM
        draw() {
            const ctx = this.ctx, dpr = this.dpr || 1, size = S.design.size;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.fillStyle = '#060608';
            ctx.fillRect(0, 0, this.W, this.H);
            ctx.save();
            ctx.translate(this.ox, this.oy);
            ctx.scale(this.scale, this.scale);
            // zemin
            ctx.fillStyle = '#0a0a0e';
            ctx.fillRect(0, 0, size, size);
            const charts = S.charts;
            if (charts) {
                // gövde rengi önizlemesi
                if (S.v2.paint) {
                    ctx.fillStyle = S.mod.body;
                    ctx.globalAlpha = 0.9;
                    for (const c of charts) ctx.fillRect(c.rect[0], c.rect[1], c.rect[2], c.rect[3]);
                    ctx.globalAlpha = 1;
                }
            }
            const mode = S.v2.xray;
            if (mode && this.wireFill) ctx.drawImage(this.wireFill, 0, 0, size, size);
            if (S.v2.paint) ctx.drawImage(VS.cv, 0, 0, size, size);
            if (mode === 'full') { this.ensureFull(); if (this.wireFull) ctx.drawImage(this.wireFull, 0, 0, size, size); }
            else if (mode && this.wireLine) { ctx.globalAlpha = 0.8; ctx.drawImage(this.wireLine, 0, 0, size, size); ctx.globalAlpha = 1; }
            if (S.v2.grid) this.drawGrid(ctx, size);
            if (charts) {
                const cols = VS3D.CHART_COLORS;
                ctx.lineWidth = 2 / this.scale;
                for (const c of charts) {
                    ctx.strokeStyle = '#' + cols[c.id].toString(16).padStart(6, '0');
                    ctx.globalAlpha = 0.55;
                    ctx.strokeRect(c.rect[0], c.rect[1], c.rect[2], c.rect[3]);
                    ctx.globalAlpha = 1;
                }
                if (S.v2.xray) this.drawLabels(ctx);
            }
            ctx.strokeStyle = 'rgba(255,255,255,0.18)';
            ctx.lineWidth = 1.5 / this.scale;
            ctx.strokeRect(0, 0, size, size);
            ctx.restore();
            this.drawSelection(ctx);
        }

        drawGrid(ctx, size) {
            ctx.strokeStyle = 'rgba(255,255,255,0.07)';
            ctx.lineWidth = 1 / this.scale;
            ctx.beginPath();
            for (let v = 0; v <= size; v += 256) { ctx.moveTo(v, 0); ctx.lineTo(v, size); ctx.moveTo(0, v); ctx.lineTo(size, v); }
            ctx.stroke();
        }

        drawLabels(ctx) {
            const cols = ['#38bdf8', '#ff2e93', '#34d399', '#fb923c', '#a855f7'];
            const fs = clamp(15 / this.scale, 22, 80);
            ctx.font = `700 ${fs}px "Chakra Petch", Impact, sans-serif`;
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            const placed = [];
            for (const l of this.labels.slice().sort((a, b) => b.n - a.n)) {
                const w = ctx.measureText(l.text).width + fs * 0.4, h = fs * 1.15;
                const r = [l.x - w / 2, l.y - h / 2, l.x + w / 2, l.y + h / 2];
                if (placed.some(p => r[0] < p[2] && r[2] > p[0] && r[1] < p[3] && r[3] > p[1])) continue;
                placed.push(r);
                ctx.lineWidth = fs * 0.22; ctx.strokeStyle = 'rgba(6,6,8,.85)'; ctx.lineJoin = 'round';
                ctx.strokeText(l.text, l.x, l.y);
                ctx.globalAlpha = 0.9; ctx.fillStyle = cols[l.chart];
                ctx.fillText(l.text, l.x, l.y);
                ctx.globalAlpha = 1;
            }
        }

        // ekran uzayında seçim tutamaçları
        handles(L) {
            const b = E.baseSize(L);
            const sx = (L.sx || 100) / 100, sy = (L.sy || 100) / 100;
            const a = (L.rot || 0) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
            const P = (kx, ky, extra) => {
                const x = kx * b.w / 2 * sx, y = ky * b.h / 2 * sy + (extra || 0);
                return [L.x + x * c - y * s, L.y + x * s + y * c];
            };
            return [
                { k: 'nw', kx: -1, ky: -1, p: P(-1, -1) }, { k: 'ne', kx: 1, ky: -1, p: P(1, -1) },
                { k: 'se', kx: 1, ky: 1, p: P(1, 1) }, { k: 'sw', kx: -1, ky: 1, p: P(-1, 1) },
                { k: 'n', kx: 0, ky: -1, p: P(0, -1) }, { k: 's', kx: 0, ky: 1, p: P(0, 1) },
                { k: 'w', kx: -1, ky: 0, p: P(-1, 0) }, { k: 'e', kx: 1, ky: 0, p: P(1, 0) },
                { k: 'rot', kx: 0, ky: -1, p: P(0, -1, -48 / this.scale * (sy ? 1 / sy : 1)) },
            ];
        }

        drawSelection(ctx) {
            const L = VS.selLayer();
            if (!L || L.type === 'paint' || !L.visible) return;
            const cs = E.corners(L).map(p => [p[0] * this.scale + this.ox, p[1] * this.scale + this.oy]);
            ctx.save();
            ctx.strokeStyle = '#ff2e93'; ctx.lineWidth = 1.5;
            ctx.beginPath(); cs.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath(); ctx.stroke();
            if (!L.locked) {
                const hs = this.handles(L).map(h => ({ k: h.k, x: h.p[0] * this.scale + this.ox, y: h.p[1] * this.scale + this.oy }));
                const top = hs.find(h => h.k === 'n'), rot = hs.find(h => h.k === 'rot');
                ctx.beginPath(); ctx.moveTo(top.x, top.y); ctx.lineTo(rot.x, rot.y); ctx.stroke();
                for (const h of hs) {
                    ctx.fillStyle = h.k === 'rot' ? '#ff2e93' : '#fff';
                    ctx.beginPath();
                    if (h.k === 'rot') ctx.arc(h.x, h.y, 5.5, 0, 7); else ctx.rect(h.x - 4.5, h.y - 4.5, 9, 9);
                    ctx.fill(); ctx.strokeStyle = '#ff2e93'; ctx.stroke();
                }
            }
            ctx.restore();
        }

        hitHandle(px, py) {
            const L = VS.selLayer();
            if (!L || L.locked || L.type === 'paint') return null;
            for (const h of this.handles(L)) {
                const sx = h.p[0] * this.scale + this.ox, sy = h.p[1] * this.scale + this.oy;
                if (Math.hypot(sx - px, sy - py) <= 9) return h;
            }
            return null;
        }

        // ------------------------------------------------------------------ GİRDİ
        bind() {
            const cv = this.cv;
            cv.addEventListener('wheel', e => {
                e.preventDefault();
                const [px, py] = this.eventPt(e);
                const f = Math.exp(-e.deltaY * 0.0015);
                const ns = clamp(this.scale * f, 0.03, 3);
                const [dx, dy] = this.toDesign(px, py);
                this.scale = ns;
                this.ox = px - dx * ns; this.oy = py - dy * ns;
                this.updateZoomText(); this.invalidate();
            }, { passive: false });
            cv.addEventListener('contextmenu', e => e.preventDefault());
            cv.addEventListener('pointerdown', e => this.down(e));
            cv.addEventListener('pointermove', e => this.move(e));
            cv.addEventListener('pointerup', e => this.up(e));
            cv.addEventListener('pointercancel', e => this.up(e));
            window.addEventListener('keydown', e => { if (e.code === 'Space' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { this.spaceDown = true; } });
            window.addEventListener('keyup', e => { if (e.code === 'Space') this.spaceDown = false; });
        }

        zoomBy(f) {
            const cx = this.W / 2, cy = this.H / 2;
            const ns = clamp(this.scale * f, 0.03, 3);
            const [dx, dy] = this.toDesign(cx, cy);
            this.scale = ns; this.ox = cx - dx * ns; this.oy = cy - dy * ns;
            this.updateZoomText(); this.invalidate();
        }

        down(e) {
            this.cv.setPointerCapture(e.pointerId);
            const [px, py] = this.eventPt(e);
            const [dx, dy] = this.toDesign(px, py);
            if (e.button === 1 || e.button === 2 || this.spaceDown) {
                this.drag = { k: 'pan', px, py, ox: this.ox, oy: this.oy };
                return;
            }
            const chart = S.charts ? L2.chartAt(S.charts, dx, dy) : null;
            if (S.tool !== 'select') {
                this.drag = { k: 'tool' };
                VS.tools.down2d({ x: dx, y: dy, chart, e });
                return;
            }
            const h = this.hitHandle(px, py);
            const L = VS.selLayer();
            if (h && L) {
                this.drag = { k: h.k === 'rot' ? 'rot' : 'scale', h, L, sx: L.sx, sy: L.sy, rot: L.rot, x: L.x, y: L.y };
                return;
            }
            const hit = E.hitTest(S.design, dx, dy, false);
            if (hit) {
                if (S.sel !== hit.id) { S.sel = hit.id; VS.renderPanel(); this.invalidate(); }
                this.drag = { k: 'move', L: hit, dx: hit.x - dx, dy: hit.y - dy, moved: false };
            } else {
                if (S.sel) { S.sel = null; VS.renderPanel(); this.invalidate(); }
                this.drag = { k: 'pan', px, py, ox: this.ox, oy: this.oy };
            }
        }

        move(e) {
            const [px, py] = this.eventPt(e);
            const [dx, dy] = this.toDesign(px, py);
            this.hover = [dx, dy];
            const d = this.drag;
            if (!d) {
                if (S.tool === 'select') this.cv.style.cursor = this.hitHandle(px, py) ? 'pointer' : 'default';
                else this.cv.style.cursor = 'crosshair';
                return;
            }
            if (d.k === 'pan') {
                this.ox = d.ox + (px - d.px); this.oy = d.oy + (py - d.py);
                this.invalidate();
            } else if (d.k === 'move') {
                const L = d.L;
                if (L.locked) return;
                L.x = dx + d.dx; L.y = dy + d.dy;
                d.moved = true;
                VS.designChanged(); VS.syncProps && VS.syncProps();
            } else if (d.k === 'rot') {
                const L = d.L;
                let a = Math.atan2(dy - L.y, dx - L.x) * 180 / Math.PI + 90;
                if (e.shiftKey) a = Math.round(a / 15) * 15;
                L.rot = Math.round(a * 10) / 10;
                VS.designChanged(); VS.syncProps && VS.syncProps();
            } else if (d.k === 'scale') {
                const L = d.L, h = d.h;
                const b = E.baseSize(L);
                const a = -(L.rot || 0) * Math.PI / 180;
                const rx = (dx - L.x) * Math.cos(a) - (dy - L.y) * Math.sin(a);
                const ry = (dx - L.x) * Math.sin(a) + (dy - L.y) * Math.cos(a);
                let nsx = d.sx, nsy = d.sy;
                if (h.kx !== 0) nsx = Math.max(2, Math.abs(rx) / (b.w / 2) * 100);
                if (h.ky !== 0) nsy = Math.max(2, Math.abs(ry) / (b.h / 2) * 100);
                if (h.kx !== 0 && h.ky !== 0 && !e.shiftKey) {
                    const f = Math.max(nsx / d.sx, nsy / d.sy);
                    nsx = d.sx * f; nsy = d.sy * f;
                }
                L.sx = Math.round(nsx * 10) / 10; L.sy = Math.round(nsy * 10) / 10;
                VS.designChanged(); VS.syncProps && VS.syncProps();
            } else if (d.k === 'tool') {
                const chart = S.charts ? L2.chartAt(S.charts, dx, dy) : null;
                VS.tools.move2d({ x: dx, y: dy, chart, e });
            }
        }

        up(e) {
            const d = this.drag;
            this.drag = null;
            if (!d) return;
            if (d.k === 'tool') {
                const [px, py] = this.eventPt(e);
                const [dx, dy] = this.toDesign(px, py);
                VS.tools.up2d({ x: dx, y: dy, chart: S.charts ? L2.chartAt(S.charts, dx, dy) : null, e });
            } else if (d.k === 'move' || d.k === 'rot' || d.k === 'scale') {
                VS.commit();
                VS.renderPanel(true);
            }
        }
    }

    VS.Editor2D = Editor2D;
})();
