/* LOE Vehicle Designer — katman çizim motoru.
 * Hem editör (index.html) hem araç dokusu (dui.html) bu dosyayı kullanır; çizim iki yerde de birebir aynıdır.
 *
 * Tasarım biçimi (design):
 *   { v:1, size:4096, base:{color}, layers:[Layer], tuning:{...}, equipment:[...] }
 * Layer:
 *   ortak : id, type('shape'|'text'|'image'), name, visible, locked, x, y (merkez, tuval px), rot (derece),
 *           sx, sy (yüzde), opacity (0-100), blend, color
 *   shape : shape, w, h (taban boyut, px)
 *   text  : text, font, bold, italic, underline, strike, fsize, spacing (em/1000), line, align
 *   image : src ('https://..' | 'data:..' | 'img:<id>'), w, h
 */
(function (root) {
    'use strict';

    // ------------------------------------------------------------------ ŞEKİLLER (0..100 kutusunda)
    function poly(n, rot, inner, points) {
        // düzgün çokgen / yıldız
        const pts = [];
        const total = points ? n * 2 : n;
        for (let i = 0; i < total; i++) {
            const a = (rot + (i * 360) / total) * Math.PI / 180;
            const r = points ? (i % 2 === 0 ? 50 : 50 * inner) : 50;
            pts.push([50 + r * Math.cos(a), 50 + r * Math.sin(a)]);
        }
        return 'M' + pts.map(p => p[0].toFixed(2) + ' ' + p[1].toFixed(2)).join('L') + 'Z';
    }

    const SHAPES = {
        square:    { d: 'M0 0H100V100H0Z', w: 400, h: 400 },
        rectangle: { d: 'M0 0H100V100H0Z', w: 640, h: 320 },
        rounded:   { d: 'M18 0H82A18 18 0 0 1 100 18V82A18 18 0 0 1 82 100H18A18 18 0 0 1 0 82V18A18 18 0 0 1 18 0Z', w: 520, h: 360 },
        circle:    { d: 'M50 0A50 50 0 1 1 50 100A50 50 0 1 1 50 0Z', w: 400, h: 400 },
        ellipse:   { d: 'M50 0A50 50 0 1 1 50 100A50 50 0 1 1 50 0Z', w: 600, h: 360 },
        triangle:  { d: 'M50 0L100 100H0Z', w: 420, h: 380 },
        right_tri: { d: 'M0 0L100 100H0Z', w: 400, h: 400 },
        diamond:   { d: 'M50 0L100 50L50 100L0 50Z', w: 400, h: 400 },
        pentagon:  { d: poly(5, -90), w: 400, h: 400 },
        hexagon:   { d: poly(6, -90), w: 400, h: 400 },
        octagon:   { d: poly(8, -112.5), w: 400, h: 400 },
        star:      { d: poly(5, -90, 0.42, true), w: 420, h: 420 },
        spark:     { d: 'M50 0Q55 45 100 50Q55 55 50 100Q45 55 0 50Q45 45 50 0Z', w: 400, h: 400 },
        burst:     { d: poly(16, -90, 0.78, true), w: 420, h: 420 },
        heart:     { d: 'M50 94C20 72 0 54 0 31C0 14 13 3 28 3C38 3 46 9 50 17C54 9 62 3 72 3C87 3 100 14 100 31C100 54 80 72 50 94Z', w: 420, h: 400 },
        arrow:     { d: 'M0 34H58V10L100 50L58 90V66H0Z', w: 560, h: 320 },
        chevron:   { d: 'M0 0H36L76 50L36 100H0L40 50Z', w: 300, h: 400 },
        cross:     { d: 'M35 0H65V35H100V65H65V100H35V65H0V35H35Z', w: 400, h: 400 },
        lightning: { d: 'M60 0L8 58H44L34 100L92 36H56L70 0Z', w: 320, h: 440 },
        shield:    { d: 'M50 0L95 14V48C95 74 75 92 50 100C25 92 5 74 5 48V14Z', w: 380, h: 420 },
    };
    const SHAPE_ORDER = ['square', 'rectangle', 'rounded', 'circle', 'ellipse', 'triangle', 'right_tri', 'diamond',
        'pentagon', 'hexagon', 'octagon', 'star', 'spark', 'burst', 'heart', 'arrow', 'chevron', 'cross', 'lightning', 'shield'];

    const pathCache = {};
    function shapePath(id) {
        if (!pathCache[id]) pathCache[id] = new Path2D((SHAPES[id] || SHAPES.square).d);
        return pathCache[id];
    }

    const BLENDS = {
        normal: 'source-over', multiply: 'multiply', screen: 'screen', overlay: 'overlay', darken: 'darken',
        lighten: 'lighten', 'color-dodge': 'color-dodge', 'color-burn': 'color-burn', 'hard-light': 'hard-light',
        'soft-light': 'soft-light', difference: 'difference', exclusion: 'exclusion', hue: 'hue',
        saturation: 'saturation', color: 'color', luminosity: 'luminosity',
    };
    const BLEND_ORDER = Object.keys(BLENDS);

    // ------------------------------------------------------------------ GÖRSELLER
    // resolver(id) → data URI ya da null (img:<id> için). onLoad: bir görsel yüklendiğinde yeniden çizim.
    const images = {};
    let resolver = null;
    let onImageLoad = null;

    function setImageResolver(fn) { resolver = fn; }
    function setOnImageLoad(fn) { onImageLoad = fn; }

    function srcOf(src) {
        if (typeof src !== 'string') return null;
        if (src.startsWith('img:')) return resolver ? resolver(src.slice(4)) : null;
        // hazır çıkartmalar: html/decals/<ad>.svg (editör ve DUI sayfası aynı klasörde)
        if (src.startsWith('decal:')) return /^decal:[a-z0-9_]+$/.test(src) ? 'decals/' + src.slice(6) + '.svg' : null;
        return src;
    }

    function getImage(src) {
        const real = srcOf(src);
        if (!real) return null;
        let e = images[real];
        if (!e) {
            e = images[real] = { img: new Image(), ok: false, err: false, tainted: false };
            const tryLoad = (cors) => {
                const img = new Image();
                if (cors && !real.startsWith('data:')) img.crossOrigin = 'anonymous';
                img.onload = () => {
                    e.img = img; e.ok = true; e.tainted = !cors && !real.startsWith('data:');
                    if (onImageLoad) onImageLoad(src);
                };
                img.onerror = () => {
                    if (cors && !real.startsWith('data:')) tryLoad(false);
                    else { e.err = true; if (onImageLoad) onImageLoad(src); }
                };
                img.src = real;
            };
            tryLoad(true);
        }
        return e.ok ? e.img : null;
    }

    function imageState(src) {
        const real = srcOf(src);
        if (!real) return 'pending';
        const e = images[real];
        if (!e) return 'pending';
        return e.ok ? 'ok' : (e.err ? 'error' : 'pending');
    }

    function isTainted(design) {
        for (const L of design.layers || []) {
            if (L.type !== 'image') continue;
            const real = srcOf(L.src);
            if (real && images[real] && images[real].tainted) return true;
        }
        return false;
    }

    // ------------------------------------------------------------------ METİN
    const measureCtx = document.createElement('canvas').getContext('2d');

    function fontString(L, size) {
        return `${L.italic ? 'italic ' : ''}${L.bold ? 700 : 400} ${size}px "${L.font || 'Impact'}", Impact, sans-serif`;
    }

    function textLines(L) { return String(L.text == null ? '' : L.text).split('\n'); }

    function lineWidth(ctx, line, spacingPx) {
        if (!line.length) return 0;
        return ctx.measureText(line).width + spacingPx * Math.max(0, line.length - 1);
    }

    // Metin kutusu boyutu (ölçeksiz, tuval px)
    function textBox(L) {
        const size = L.fsize || 64;
        measureCtx.font = fontString(L, size);
        const sp = (L.spacing || 0) / 1000 * size;
        const lines = textLines(L);
        let w = 0;
        for (const ln of lines) w = Math.max(w, lineWidth(measureCtx, ln, sp));
        const lh = size * (L.line || 1.16);
        return { w: Math.max(w, size * 0.3), h: Math.max(lh * lines.length, size), lh, sp, lines, size };
    }

    function drawSpaced(ctx, text, x, y, sp) {
        if (!sp) { ctx.fillText(text, x, y); return; }
        let cx = x;
        for (const ch of text) {
            ctx.fillText(ch, cx, y);
            cx += ctx.measureText(ch).width + sp;
        }
    }

    function drawText(ctx, L) {
        const box = textBox(L);
        ctx.font = fontString(L, box.size);
        ctx.fillStyle = L.color || '#ffffff';
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        const top = -box.h / 2;
        box.lines.forEach((ln, i) => {
            const y = top + box.lh * (i + 0.5);
            let w = lineWidth(ctx, ln, box.sp);
            let x;
            let sp = box.sp;
            if (L.align === 'center') x = -w / 2;
            else if (L.align === 'right') x = box.w / 2 - w;
            else x = -box.w / 2;
            if (L.align === 'justify' && i < box.lines.length - 1 && ln.length > 1) {
                sp = box.sp + (box.w - w) / (ln.length - 1);
                w = box.w;
                x = -box.w / 2;
            }
            drawSpaced(ctx, ln, x, y, sp);
            const t = Math.max(2, box.size * 0.06);
            if (L.underline) ctx.fillRect(x, y + box.size * 0.42, w, t);
            if (L.strike) ctx.fillRect(x, y - t / 2, w, t);
        });
    }

    // ------------------------------------------------------------------ KATMAN GEOMETRİSİ
    function baseSize(L) {
        if (L.type === 'text') { const b = textBox(L); return { w: b.w, h: b.h }; }
        return { w: L.w || 400, h: L.h || 400 };
    }

    // Tuval noktası → katman yerel (ölçeksiz) koordinatı
    function toLocal(L, px, py) {
        const a = -(L.rot || 0) * Math.PI / 180;
        const dx = px - L.x, dy = py - L.y;
        const rx = dx * Math.cos(a) - dy * Math.sin(a);
        const ry = dx * Math.sin(a) + dy * Math.cos(a);
        return { x: rx / ((L.sx || 100) / 100), y: ry / ((L.sy || 100) / 100) };
    }

    function hitLayer(L, px, py) {
        if (!L.visible) return false;
        const b = baseSize(L);
        const p = toLocal(L, px, py);
        const tol = 6 / Math.max(0.05, Math.min(Math.abs(L.sx || 100), Math.abs(L.sy || 100)) / 100);
        return Math.abs(p.x) <= b.w / 2 + tol && Math.abs(p.y) <= b.h / 2 + tol;
    }

    // Üstten alta ilk vurulan katman
    function hitTest(design, px, py, includeLocked) {
        const ls = design.layers || [];
        for (let i = ls.length - 1; i >= 0; i--) {
            const L = ls[i];
            if (!includeLocked && L.locked) continue;
            if (hitLayer(L, px, py)) return L;
        }
        return null;
    }

    // Katmanın döndürülmüş köşe noktaları (seçim çerçevesi için)
    function corners(L) {
        const b = baseSize(L);
        const sx = (L.sx || 100) / 100, sy = (L.sy || 100) / 100;
        const a = (L.rot || 0) * Math.PI / 180;
        const c = Math.cos(a), s = Math.sin(a);
        return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([kx, ky]) => {
            const x = kx * b.w / 2 * sx, y = ky * b.h / 2 * sy;
            return [L.x + x * c - y * s, L.y + x * s + y * c];
        });
    }

    // ------------------------------------------------------------------ ÇİZİM
    function drawLayer(ctx, L) {
        if (!L.visible) return;
        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, (L.opacity == null ? 100 : L.opacity) / 100));
        ctx.globalCompositeOperation = BLENDS[L.blend] || 'source-over';
        ctx.translate(L.x, L.y);
        ctx.rotate((L.rot || 0) * Math.PI / 180);
        ctx.scale((L.sx || 100) / 100, (L.sy || 100) / 100);
        if (L.type === 'shape') {
            const w = L.w || 400, h = L.h || 400;
            ctx.scale(w / 100, h / 100);
            ctx.translate(-50, -50);
            ctx.fillStyle = L.color || '#ffffff';
            ctx.fill(shapePath(L.shape));
        } else if (L.type === 'text') {
            drawText(ctx, L);
        } else if (L.type === 'image') {
            const img = getImage(L.src);
            const w = L.w || 400, h = L.h || 400;
            if (img) {
                if (L.tint) {
                    // renk tonlu görsel: yalnızca alfa kullanılır
                    const off = tintCanvas(img, L.color || '#ffffff');
                    ctx.drawImage(off, -w / 2, -h / 2, w, h);
                } else {
                    ctx.drawImage(img, -w / 2, -h / 2, w, h);
                }
            }
        }
        ctx.restore();
    }

    const tintCache = new WeakMap();
    function tintCanvas(img, color) {
        let m = tintCache.get(img);
        if (!m) { m = {}; tintCache.set(img, m); }
        if (m[color]) return m[color];
        const c = document.createElement('canvas');
        c.width = img.naturalWidth || img.width; c.height = img.naturalHeight || img.height;
        const x = c.getContext('2d');
        x.drawImage(img, 0, 0);
        x.globalCompositeOperation = 'source-in';
        x.fillStyle = color;
        x.fillRect(0, 0, c.width, c.height);
        m[color] = c;
        return c;
    }

    /**
     * render(ctx, design, opts)
     *   opts.width/height : hedef tuval boyutu (px)
     *   opts.rect         : [x,y,w,h] yalnızca tuvalin bu bölgesi (decal yüzeyleri için)
     *   opts.charts       : chart listesi (temel rengi yalnızca yüzeylere boyamak için)
     *   opts.clear        : true → önce temizle
     *   opts.background   : arka plan rengi (editör önizlemesi)
     */
    function render(ctx, design, opts) {
        opts = opts || {};
        const size = design.size || 4096;
        const W = opts.width || ctx.canvas.width, H = opts.height || ctx.canvas.height;
        const rect = opts.rect || [0, 0, size, size];
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        if (opts.clear !== false) ctx.clearRect(0, 0, W, H);
        if (opts.background) { ctx.fillStyle = opts.background; ctx.fillRect(0, 0, W, H); }
        ctx.scale(W / rect[2], H / rect[3]);
        ctx.translate(-rect[0], -rect[1]);
        const base = design.base && design.base.color;
        if (base) {
            ctx.fillStyle = base;
            if (opts.charts && opts.charts.length) {
                for (const c of opts.charts) ctx.fillRect(c.rect[0] - 2, c.rect[1] - 2, c.rect[2] + 4, c.rect[3] + 4);
            } else {
                ctx.fillRect(0, 0, size, size);
            }
        }
        for (const L of design.layers || []) drawLayer(ctx, L);
        ctx.restore();
    }

    // ------------------------------------------------------------------ CHART (yüzey) MATEMATİĞİ
    // shared/layout.lua ile birebir aynı. charts Lua'dan gelir.
    function chartForNormal(charts, n) {
        const ax = Math.abs(n[0]), ay = Math.abs(n[1]), az = Math.abs(n[2]);
        let id;
        if (n[2] > 0 && az >= ax && az >= ay) id = 'top';
        else if (ax >= ay) id = n[0] < 0 ? 'left' : 'right';
        else id = n[1] > 0 ? 'front' : 'rear';
        return charts.find(c => c.id === id) || null;
    }

    const AXI = { x: 0, y: 1, z: 2 };
    function project(c, p) {
        return {
            x: c.rect[0] + c.u.sign * (p[AXI[c.u.axis]] - c.u.origin) * c.s,
            y: c.rect[1] + c.v.sign * (p[AXI[c.v.axis]] - c.v.origin) * c.s,
        };
    }

    function chartAt(charts, px, py) {
        for (const c of charts || []) {
            const r = c.rect;
            if (px >= r[0] && px <= r[0] + r[2] && py >= r[1] && py <= r[1] + r[3]) return c;
        }
        return null;
    }

    // Seçilen yerel nokta + normal → tuval noktası
    function pick(charts, lp, ln) {
        const c = chartForNormal(charts, ln);
        if (!c) return null;
        const p = project(c, lp);
        return { chart: c.id, x: p.x, y: p.y };
    }

    // ------------------------------------------------------------------ YARDIMCILAR
    function uid(prefix) {
        return (prefix || 'l') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    }

    root.VDEngine = {
        SHAPES, SHAPE_ORDER, BLENDS, BLEND_ORDER,
        render, drawLayer, hitTest, hitLayer, baseSize, corners, textBox, toLocal,
        getImage, imageState, isTainted, setImageResolver, setOnImageLoad,
        chartForNormal, project, chartAt, pick, uid,
    };
})(window);
