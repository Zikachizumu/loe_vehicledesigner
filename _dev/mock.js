/* Tarayıcı önizlemesi: Lua tarafını taklit eder. Yalnızca geliştirme içindir (resource'a dahil değildir). */
(function () {
    'use strict';
    const frame = document.getElementById('ui');
    let kind = 'shell', lang = 'tr';

    // shared/layout.lua ile aynı algoritma
    function compute(mn, mx, size, pad) {
        size = size || 4096; pad = pad || Math.floor(size / 85);
        const L = Math.max(0.5, mx.y - mn.y), W = Math.max(0.3, mx.x - mn.x), H = Math.max(0.3, mx.z - mn.z);
        const availW = size - 2 * pad, availH = size - 2 * pad;
        let s = Math.min(availW / L, (availW - pad) / (2 * W), (availH - 3 * pad) / (W + 3 * H));
        s = Math.floor(s * 1000) / 1000;
        const contentH = (W + 3 * H) * s + 3 * pad;
        const y0 = pad + (availH - contentH) / 2;
        const cx = w => Math.floor(pad + (availW - w) / 2);
        const Ls = L * s, Ws = W * s, Hs = H * s;
        const rowTop = Math.floor(y0), rowLeft = Math.floor(rowTop + Ws + pad), rowRight = Math.floor(rowLeft + Hs + pad), rowEnds = Math.floor(rowRight + Hs + pad);
        const endsX = cx(2 * Ws + pad);
        const c = (id, x, y, w, h, u, v, n, side) => ({ id, rect: [x, y, w, h], s, u, v, n, side });
        return [
            c('top', cx(Ls), rowTop, Ls, Ws, { axis: 'y', sign: 1, origin: mn.y }, { axis: 'x', sign: 1, origin: mn.x }, [0, 0, 1], [0, 1, 0]),
            c('left', cx(Ls), rowLeft, Ls, Hs, { axis: 'y', sign: -1, origin: mx.y }, { axis: 'z', sign: -1, origin: mx.z }, [-1, 0, 0], [0, -1, 0]),
            c('right', cx(Ls), rowRight, Ls, Hs, { axis: 'y', sign: 1, origin: mn.y }, { axis: 'z', sign: -1, origin: mx.z }, [1, 0, 0], [0, 1, 0]),
            c('front', endsX, rowEnds, Ws, Hs, { axis: 'x', sign: -1, origin: mx.x }, { axis: 'z', sign: -1, origin: mx.z }, [0, 1, 0], [-1, 0, 0]),
            c('rear', endsX + Ws + pad, rowEnds, Ws, Hs, { axis: 'x', sign: 1, origin: mn.x }, { axis: 'z', sign: -1, origin: mx.z }, [0, -1, 0], [1, 0, 0]),
        ];
    }

    const bbox = { min: { x: -1.05, y: -2.55, z: -0.55 }, max: { x: 1.05, y: 2.6, z: 0.85 } };
    const charts = compute(bbox.min, bbox.max, 4096);

    const C = (id, cat, tr, en, icon, colors, roof) => ({ id, cat, tr, en, icon, colors, roof });
    const catalogue = [
        C('bar_rb', 'sirens', 'Kırmızı-mavi tepe lambası', 'Red-blue roof siren', 'bar', ['red', 'red', 'blue', 'blue'], true),
        C('bar_bb', 'sirens', 'Mavi-mavi tepe lambası', 'Blue-blue roof siren', 'bar', ['blue', 'blue', 'blue', 'blue'], true),
        C('bar_rr', 'sirens', 'Kırmızı-kırmızı tepe lambası', 'Red-red roof siren', 'bar', ['red', 'red', 'red', 'red'], true),
        C('bar_aa', 'sirens', 'Amber tepe lambası', 'Amber-amber roof siren', 'bar', ['amber', 'amber', 'amber', 'amber'], true),
        C('bar_rb2', 'sirens', 'Kırmızı-mavi tepe lambası 2', 'Red-blue roof siren 2', 'bar', ['red', 'red', 'red', 'blue', 'blue', 'blue'], true),
        C('bar_ba2', 'sirens', 'Mavi-amber tepe lambası', 'Blue-amber roof siren', 'bar', ['blue', 'blue', 'amber', 'amber'], true),
        C('led_r', 'leds', 'Kırmızı LED', 'Red LED', 'led', ['red']),
        C('led_b', 'leds', 'Mavi LED', 'Blue LED', 'led', ['blue']),
        C('led_rb', 'leds', 'Kırmızı-mavi LED çifti', 'Red-blue LED pair', 'pair', ['red', 'blue']),
        C('led_long_rb', 'leds', 'Kırmızı-mavi uzun LED', 'Red-blue long LEDs', 'strip', ['red', 'red', 'red', 'blue', 'blue', 'blue']),
        C('beacon_red', 'beacons', 'Kırmızı tepe fener', 'Red roof beacon', 'beacon', ['red'], true),
        C('beacon_amber', 'beacons', 'Amber tepe fener', 'Amber roof beacon', 'beacon', ['amber'], true),
        C('spotlight', 'gear', 'Yan projektör', 'Side spotlight', 'gear', []),
        C('alpr', 'gear', 'ALPR cihazı', 'ALPR device', 'gear', []),
        C('antenna', 'gear', 'Anten', 'Antenna', 'gear', []),
        C('laptop', 'gear', 'Laptop ünitesi', 'Laptop unit', 'gear', []),
        Object.assign(C('cs_roof', 'callsigns', 'Tavan çağrı kodu', 'Roof callsign', 'text', []), { text: { chart: 'top', value: '1-ADAM-12', size: 260, font: 'Oswald', bold: true, rot: 90 } }),
    ];
    const categories = [
        { id: 'sirens', tr: 'Sirenler', en: 'Sirens' }, { id: 'leds', tr: 'LED', en: 'LEDs' },
        { id: 'beacons', tr: 'Döner lamba', en: 'Beacons' }, { id: 'gear', tr: 'Ekipman', en: 'Equipment' },
        { id: 'callsigns', tr: 'Çağrı kodu', en: 'Callsigns' },
    ];
    const fonts = [
        { family: 'Impact', label: 'Impact' }, { family: 'Oswald', label: 'Oswald', google: 'Oswald:wght@400;700' },
        { family: 'Chakra Petch', label: 'Chakra Petch', google: 'Chakra+Petch:ital,wght@0,400;0,700;1,400;1,700' },
        { family: 'Dancing Script', label: 'Dancing Script', google: 'Dancing+Script:wght@400;700' },
    ];

    const images = {};
    let imgSeq = 100;
    const saved = [];

    function send(msg) { frame.contentWindow.postMessage(msg, '*'); }

    // Ekrandaki tıklamayı aracın sol yüzüne düşen sahte bir isabete çevir
    function fakeHit(x, y) {
        if (x < 0.22 || x > 0.78 || y < 0.3 || y > 0.75) return null;
        const u = (x - 0.22) / 0.56, v = (y - 0.3) / 0.45;
        const ly = bbox.max.y - u * (bbox.max.y - bbox.min.y);
        const lz = bbox.max.z - v * (bbox.max.z - bbox.min.z);
        return { lp: [bbox.min.x, ly, lz], ln: [-1, 0, 0] };
    }

    let lmb = false;
    window.VDMock = function (name, data) {
        switch (name) {
            case 'viewport': {
                if (data.type === 'down' && data.btn === 0) {
                    lmb = true;
                    const h = fakeHit(data.x, data.y);
                    send(h ? { action: 'pick', phase: 'down', hit: true, lp: h.lp, ln: h.ln } : { action: 'pick', phase: 'down', hit: false });
                } else if (data.type === 'move' && lmb) {
                    const h = fakeHit(data.x, data.y);
                    if (h) send({ action: 'pick', phase: 'drag', hit: true, lp: h.lp, ln: h.ln });
                } else if (data.type === 'up' && data.btn === 0) {
                    lmb = false;
                    send({ action: 'pick', phase: 'up' });
                }
                return {};
            }
            case 'centerPick': return { hit: true, lp: [bbox.min.x, 0.1, 0.15], ln: [-1, 0, 0], view: [1, 0, 0] };
            case 'equipRoof': return { pos: [0, -0.2, 0.85], rot: [0, 0, 0] };
            case 'save':
                saved.unshift({ id: saved.length + 1, name: data.name, modelLabel: 'Gauntlet Classic', updated: new Date().toLocaleString('tr-TR'), thumb: data.thumb, mine: true, assigned: [{ scope: data.scope, key: data.scope === 'plate' ? 'LOE1907' : 'gauntlet3', label: 'Gauntlet Classic' }], design: data.design });
                return { ok: true, id: saved[0].id, rev: 1, message: data.scope === 'plate' ? 'Tasarım bu araca kaydedildi.' : 'Tasarım tüm Gauntlet Classic araçlarına kaydedildi.' };
            case 'library':
                if (data.op === 'list') return { items: saved.map(s => Object.assign({}, s, { design: undefined })) };
                if (data.op === 'get') { const s = saved.find(x => x.id === data.id); return s ? { id: s.id, name: s.name, mine: true, design: s.design } : {}; }
                if (data.op === 'delete') { const i = saved.findIndex(x => x.id === data.id); if (i >= 0) saved.splice(i, 1); return { ok: true }; }
                if (data.op === 'rename') { const s = saved.find(x => x.id === data.id); if (s) s.name = data.name; return { ok: true }; }
                return {};
            case 'ai': {
                const c = document.createElement('canvas'); c.width = c.height = 512;
                const x = c.getContext('2d');
                x.fillStyle = '#fff'; x.fillRect(0, 0, 512, 512);
                x.fillStyle = '#ff2e93'; x.beginPath(); x.arc(256, 256, 170, 0, Math.PI * 2); x.fill();
                x.fillStyle = '#111'; x.font = 'bold 120px Impact'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('LOE', 256, 262);
                const id = String(imgSeq++); images[id] = c.toDataURL('image/png');
                return new Promise(r => setTimeout(() => r({ ok: true, id, data: images[id] }), 900));
            }
            case 'uploadImage': { const id = String(imgSeq++); images[id] = data.data; return { ok: true, id }; }
            case 'getImage': return { data: images[data.id] || null };
            case 'close': setTimeout(() => send({ action: 'close' }), 50); return {};
            default: return {};
        }
    };

    // Paket üreticisinin gerçek çıktısı (police4) varsa onu kullan
    let sample = null;
    fetch('sample_police4.json').then(r => r.ok ? r.json() : null).then(j => { sample = j; }).catch(() => {});

    function open() {
        const sCharts = sample && kind === 'shell' ? sample.charts : charts;
        send({
            action: 'open', locale: lang, accent: '#ff2e93',
            vehicle: {
                label: 'Gauntlet Classic', name: 'GAUNTLET3', plate: 'LOE 1907',
                extras: [{ id: 1, on: true }, { id: 2, on: false }, { id: 5, on: false }],
                current: { primary: '#1d1d1f', secondary: '#111111', tint: 0, neonOn: false, neonColor: '#ff00ff' },
                bounds: { min: [bbox.min.x, bbox.min.y, bbox.min.z], max: [bbox.max.x, bbox.max.y, bbox.max.z] },
            },
            surface: { kind, charts: kind === 'livery' ? [] : sCharts, size: 4096, texture: 2048, pack: kind === 'shell' ? 'loe_vd_pack_emergency' : null, packs: kind === 'shell' ? 2 : 0,
                template: sample && kind === 'shell' ? '/_dev/sample_police4.png' : null },
            design: null, meta: { id: null, name: '', mine: true },
            perms: { modelScope: true, ai: true },
            limits: { layers: 120, equipment: 30 },
            fonts, catalogue, categories,
            notice: 'Boya yüzeyleri yükleniyor. Aracı park hâlinde tut.',
        });
    }

    function boot() {
        frame.contentWindow.VDMock = window.VDMock;
        setTimeout(open, 400);
    }
    frame.addEventListener('load', boot);
    try { if (frame.contentDocument && frame.contentDocument.readyState === 'complete' && frame.contentWindow.VDApp) boot(); } catch (e) { /* yok say */ }

    document.querySelector('.dev').addEventListener('click', e => {
        const b = e.target.closest('button');
        if (!b) return;
        if (b.dataset.k === 'kind') { kind = { shell: 'decal', decal: 'livery', livery: 'none', none: 'shell' }[kind]; b.textContent = 'yüzey: ' + kind; open(); }
        if (b.dataset.k === 'lang') { lang = lang === 'tr' ? 'en' : 'tr'; b.textContent = 'dil: ' + lang; open(); }
        if (b.dataset.k === 'reopen') open();
    });

    const probe = new Image();
    probe.onload = () => document.body.classList.add('has-bg');
    probe.src = 'bg.jpg';
})();
