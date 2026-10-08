/* Kutu izdüşümlü tuval yerleşimi — shared/layout.lua ve tools/packbuilder/Layout.cs ile birebir aynı.
 * Aracın sınır kutusundan 5 yüzey (üst, sol, sağ, ön, arka) hesaplar; her yüzey kendi eksenine dik izdüşümdür. */
(function (root) {
    'use strict';

    const AX = { x: 0, y: 1, z: 2 };

    // mn, mx: [x, y, z] (GTA araç uzayı; +Y ön, +X sağ, +Z yukarı)
    function compute(mn, mx, size) {
        const pad = Math.floor(size / 85);
        const L = Math.max(0.5, mx[1] - mn[1]), W = Math.max(0.3, mx[0] - mn[0]), H = Math.max(0.3, mx[2] - mn[2]);
        const availW = size - 2 * pad, availH = size - 2 * pad;
        let s = Math.min(availW / L, Math.min((availW - pad) / (2 * W), (availH - 3 * pad) / (W + 3 * H)));
        s = Math.floor(s * 1000) / 1000;
        const contentH = (W + 3 * H) * s + 3 * pad;
        const y0 = pad + (availH - contentH) / 2;
        const Cx = w => Math.floor(pad + (availW - w) / 2);
        const Ls = L * s, Ws = W * s, Hs = H * s;
        const rowTop = Math.floor(y0);
        const rowLeft = Math.floor(rowTop + Ws + pad);
        const rowRight = Math.floor(rowLeft + Hs + pad);
        const rowEnds = Math.floor(rowRight + Hs + pad);
        const endsX = Cx(2 * Ws + pad);
        const C = (id, x, y, w, h, ua, us, uo, va, vs, vo, n, side) => ({
            id, rect: [x, y, w, h], s,
            u: { axis: ua, sign: us, origin: uo }, v: { axis: va, sign: vs, origin: vo }, n, side,
        });
        return [
            C('top', Cx(Ls), rowTop, Ls, Ws, 'y', 1, mn[1], 'x', 1, mn[0], [0, 0, 1], [0, 1, 0]),
            C('left', Cx(Ls), rowLeft, Ls, Hs, 'y', -1, mx[1], 'z', -1, mx[2], [-1, 0, 0], [0, -1, 0]),
            C('right', Cx(Ls), rowRight, Ls, Hs, 'y', 1, mn[1], 'z', -1, mx[2], [1, 0, 0], [0, 1, 0]),
            C('front', endsX, rowEnds, Ws, Hs, 'x', -1, mx[0], 'z', -1, mx[2], [0, 1, 0], [-1, 0, 0]),
            C('rear', endsX + Ws + pad, rowEnds, Ws, Hs, 'x', 1, mn[0], 'z', -1, mx[2], [0, -1, 0], [1, 0, 0]),
        ];
    }

    function chartIdForNormal(nx, ny, nz) {
        const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
        if (nz > 0 && az >= ax && az >= ay) return 'top';
        if (ax >= ay) return nx < 0 ? 'left' : 'right';
        return ny > 0 ? 'front' : 'rear';
    }

    function chartIndex(id) { return { top: 0, left: 1, right: 2, front: 3, rear: 4 }[id]; }

    // araç uzayı noktası → tuval noktası (px)
    function project(c, x, y, z) {
        const p = [x, y, z];
        return [
            c.rect[0] + c.u.sign * (p[AX[c.u.axis]] - c.u.origin) * c.s,
            c.rect[1] + c.v.sign * (p[AX[c.v.axis]] - c.v.origin) * c.s,
        ];
    }

    // tuval noktası → { [eksen]: değer } (yüzeye dik üçüncü eksen bilinmez)
    function unproject(c, px, py) {
        const r = {};
        r[c.u.axis] = (px - c.rect[0]) / (c.u.sign * c.s) + c.u.origin;
        r[c.v.axis] = (py - c.rect[1]) / (c.v.sign * c.s) + c.v.origin;
        return r;
    }

    function chartAt(charts, px, py) {
        for (const c of charts) {
            const r = c.rect;
            if (px >= r[0] && px <= r[0] + r[2] && py >= r[1] && py <= r[1] + r[3]) return c;
        }
        return null;
    }

    // Tuvaldaki bir noktanın araç eksenine göre aynası (Mirror X). Üç eksenli bilgi gerekmeyen düzlemde çalışır.
    function mirror(charts, bbox, c, px, py) {
        const cx = (bbox.min[0] + bbox.max[0]) / 2;
        const un = unproject(c, px, py);
        const get = (a, d) => (un[a] !== undefined ? un[a] : d);
        if (c.id === 'left' || c.id === 'right') {
            const o = charts[c.id === 'left' ? 2 : 1];
            const q = project(o, 0, get('y', 0), get('z', 0));
            return { chart: o, x: q[0], y: q[1] };
        }
        if (c.id === 'top') {
            const q = project(c, 0, get('y', 0), 0);
            const xv = get('x', cx);
            const nx = 2 * cx - xv;
            const pr = project(c, nx, get('y', 0), 0);
            return { chart: c, x: pr[0], y: pr[1] };
        }
        // ön / arka: x ekseni yatay
        const xv = get('x', cx);
        const pr = project(c, 2 * cx - xv, 0, get('z', 0));
        return { chart: c, x: pr[0], y: pr[1] };
    }

    const NAMES = { top: 'ÜST', left: 'SOL', right: 'SAĞ', front: 'ÖN', rear: 'ARKA' };

    root.VSLayout = { compute, chartIdForNormal, chartIndex, project, unproject, chartAt, mirror, NAMES };
})(window);
