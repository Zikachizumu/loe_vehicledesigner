/* Aksesuar (prop) modelleri: araca tıklayarak yerleştirilen, kemiğe bağlı prosedürel 3B parçalar.
 * Modeller GTA eksenlerinde (+Z yukarı, +Y ön) metre cinsinden üretilir; üst grup (araç kökü) üç.js eksenine çevirir. */
(function (root) {
    'use strict';
    const T = THREE;

    const dark = (c) => new T.MeshStandardMaterial({ color: c || 0x15161a, metalness: 0.55, roughness: 0.45 });
    const lensMat = (col) => {
        const m = new T.MeshStandardMaterial({ color: 0x111111, emissive: new T.Color(col), emissiveIntensity: 0.55, roughness: 0.25, metalness: 0, transparent: true, opacity: 0.96 });
        m.userData.base = 0.55;
        return m;
    };
    const box = (w, d, h, mat, x, y, z) => { const m = new T.Mesh(new T.BoxGeometry(w, d, h), mat); m.position.set(x || 0, y || 0, z || 0); m.castShadow = true; return m; };
    const cyl = (r1, r2, h, mat, seg) => { const m = new T.Mesh(new T.CylinderGeometry(r1, r2, h, seg || 20), mat); m.rotation.x = Math.PI / 2; m.castShadow = true; return m; };   // Y ekseni → Z ekseni
    const sph = (r, mat, sx, sy, sz) => { const m = new T.Mesh(new T.SphereGeometry(r, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat); m.rotation.x = Math.PI / 2; m.scale.set(sx || 1, sz || 1, sy || 1); return m; };

    // Işık camları: p.color (sol/ilk), p.color2 (sağ/ikinci). userData.lens = 0/1 → test modunda sırayla yanıp söner
    function lens(g, w, d, h, x, y, z, col, idx) {
        const m = box(w, d, h, lensMat(col), x, y, z);
        m.userData.lens = idx;
        g.add(m);
        return m;
    }

    const TYPES = [
        {
            id: 'lightbar', label: 'Tepe lambası (büyük)', icon: 'siren', lights: true, build(p) {
                const g = new T.Group(), L = 1.15, base = dark();
                g.add(box(L, 0.3, 0.045, base, 0, 0, 0.022));
                lens(g, L * 0.44, 0.26, 0.075, -L * 0.25, 0, 0.08, p.color, 0);
                lens(g, L * 0.44, 0.26, 0.075, L * 0.25, 0, 0.08, p.color2, 1);
                g.add(box(L * 0.06, 0.2, 0.06, dark(0x2a2c31), 0, 0, 0.075));
                const dome = box(L, 0.28, 0.02, new T.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.12, roughness: 0.05 }), 0, 0, 0.125);
                g.add(dome);
                return g;
            },
        },
        {
            id: 'lightbar_mini', label: 'Tepe lambası (küçük)', icon: 'siren', lights: true, build(p) {
                const g = new T.Group(), L = 0.62;
                g.add(box(L, 0.2, 0.04, dark(), 0, 0, 0.02));
                lens(g, L * 0.46, 0.17, 0.06, -L * 0.25, 0, 0.06, p.color, 0);
                lens(g, L * 0.46, 0.17, 0.06, L * 0.25, 0, 0.06, p.color2, 1);
                return g;
            },
        },
        {
            id: 'beacon', label: 'Çakar (kubbe)', icon: 'siren', lights: true, build(p) {
                const g = new T.Group();
                g.add(cyl(0.085, 0.095, 0.03, dark(0x222428), 24).translateY(0));
                const d = sph(0.075, lensMat(p.color), 1, 1, 1.15); d.position.z = 0.015; d.userData.lens = 0; g.add(d);
                return g;
            },
        },
        {
            id: 'spot', label: 'Spot lamba', icon: 'sun', lights: false, build(p) {
                const g = new T.Group();
                const h = cyl(0.045, 0.05, 0.16, dark(0x1c1d21), 20); h.rotation.set(0, 0, 0); h.rotation.x = Math.PI / 2; h.rotation.z = 0;
                g.add(box(0.05, 0.16, 0.05, dark(), 0, 0, 0.02));
                const body = new T.Mesh(new T.CylinderGeometry(0.05, 0.055, 0.17, 20), dark(0x202226)); body.position.set(0, 0.03, 0.09); body.castShadow = true; g.add(body);
                const face = new T.Mesh(new T.CircleGeometry(0.043, 20), new T.MeshStandardMaterial({ color: 0xffffff, emissive: new T.Color(p.color), emissiveIntensity: 0.6, roughness: 0.1 }));
                face.rotation.x = -Math.PI / 2; face.position.set(0, 0.116, 0.09); g.add(face);
                return g;
            },
        },
        {
            id: 'antenna', label: 'Anten', icon: 'minus', lights: false, align: 'up', build(p) {
                const g = new T.Group();
                g.add(cyl(0.035, 0.04, 0.05, dark(0x1a1b1e), 16).translateZ(0));
                const rod = new T.Mesh(new T.CylinderGeometry(0.006, 0.01, 0.62, 8), dark(p.color === '#ff2e93' ? 0x222428 : new T.Color(p.color).getHex()));
                rod.rotation.x = Math.PI / 2; rod.position.z = 0.34; g.add(rod);
                return g;
            },
        },
        {
            id: 'spoiler', label: 'Spoiler (GT kanat)', icon: 'arrow', lights: false, build(p) {
                const g = new T.Group(), c = new T.Color(p.color);
                const m = new T.MeshStandardMaterial({ color: c, metalness: 0.4, roughness: 0.35 });
                g.add(box(1.5, 0.3, 0.035, m, 0, 0, 0.26));
                g.add(box(0.03, 0.34, 0.14, m, -0.75, 0, 0.27)); g.add(box(0.03, 0.34, 0.14, m, 0.75, 0, 0.27));
                g.add(box(0.05, 0.1, 0.26, dark(0x1a1b1e), -0.45, 0, 0.13)); g.add(box(0.05, 0.1, 0.26, dark(0x1a1b1e), 0.45, 0, 0.13));
                return g;
            },
        },
        {
            id: 'roofbox', label: 'Çatı kutusu', icon: 'square', lights: false, build(p) {
                const g = new T.Group();
                const m = new T.MeshStandardMaterial({ color: new T.Color(p.color), metalness: 0.2, roughness: 0.5 });
                g.add(box(1.5, 0.78, 0.3, m, 0, 0, 0.17));
                g.add(box(1.4, 0.7, 0.04, dark(0x111214), 0, 0, 0.33));
                g.add(box(0.06, 0.9, 0.03, dark(), -0.5, 0, 0.015)); g.add(box(0.06, 0.9, 0.03, dark(), 0.5, 0, 0.015));
                return g;
            },
        },
        {
            id: 'bullbar', label: 'Ön koruma (bullbar)', icon: 'minus', lights: false, align: 'up', build(p) {
                const g = new T.Group(), m = new T.MeshStandardMaterial({ color: new T.Color(p.color), metalness: 0.85, roughness: 0.28 });
                const tube = (len, x, y, z, rx, ry, rz) => { const t = new T.Mesh(new T.CylinderGeometry(0.03, 0.03, len, 14), m); t.position.set(x, y, z); t.rotation.set(rx || 0, ry || 0, rz || 0); t.castShadow = true; g.add(t); };
                tube(1.5, 0, 0, 0.02, 0, 0, Math.PI / 2); tube(1.3, 0, 0, 0.3, 0, 0, Math.PI / 2);
                tube(0.28, -0.55, 0, 0.16); tube(0.28, 0.55, 0, 0.16); tube(0.28, 0, 0, 0.16);
                tube(0.3, -0.72, -0.12, 0.02, Math.PI / 2, 0, 0); tube(0.3, 0.72, -0.12, 0.02, Math.PI / 2, 0, 0);
                return g;
            },
        },
        {
            id: 'rack', label: 'Çatı sepeti', icon: 'grid', lights: false, build(p) {
                const g = new T.Group(), m = new T.MeshStandardMaterial({ color: new T.Color(p.color), metalness: 0.7, roughness: 0.4 });
                const bar = (w, d, h, x, y, z) => g.add(box(w, d, h, m, x, y, z));
                bar(1.5, 0.04, 0.04, 0, -0.4, 0.15); bar(1.5, 0.04, 0.04, 0, 0.4, 0.15); bar(0.04, 0.84, 0.04, -0.73, 0, 0.15); bar(0.04, 0.84, 0.04, 0.73, 0, 0.15);
                for (const x of [-0.5, 0, 0.5]) bar(0.03, 0.84, 0.03, x, 0, 0.1);
                for (const x of [-0.73, 0.73]) for (const y of [-0.4, 0.4]) bar(0.04, 0.04, 0.14, x, y, 0.08);
                return g;
            },
        },
    ];
    const byId = {}; TYPES.forEach(t => { byId[t.id] = t; });

    function build(p) {
        const t = byId[p.type];
        if (!t) return new T.Group();
        const g = t.build(p);
        g.userData.prop = p.id;
        return g;
    }

    root.VSProps = { TYPES, byId, build };
})(window);
