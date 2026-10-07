/* Araç dokusu sayfası (DUI). Lua, SendDuiMessage ile tasarımı gönderir; sayfa tasarımı tuvale çizer,
 * oyun bu sayfayı çalışma zamanı dokusu olarak araca basar. */
(function () {
    'use strict';
    const E = window.VDEngine;
    const canvas = document.getElementById('c');
    const ctx = canvas.getContext('2d');

    const imageData = {};       // img:<id> → data URI
    const fontLinks = {};
    let design = null;
    let rect = null;            // decal yüzeyi için tuval kırpması
    let charts = null;
    let pending = false;

    E.setImageResolver(id => imageData[id] || null);
    E.setOnImageLoad(() => schedule());

    function resize() {
        const w = Math.max(16, window.innerWidth | 0), h = Math.max(16, window.innerHeight | 0);
        if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    }

    function draw() {
        pending = false;
        resize();
        if (!design) { ctx.clearRect(0, 0, canvas.width, canvas.height); return; }
        E.render(ctx, design, { rect: rect || undefined, charts: charts || undefined });
    }

    function schedule() {
        if (pending) return;
        pending = true;
        requestAnimationFrame(draw);
    }

    function loadFonts(list) {
        for (const f of list || []) {
            if (!f.google || fontLinks[f.google]) continue;
            fontLinks[f.google] = true;
            const l = document.createElement('link');
            l.rel = 'stylesheet';
            l.href = 'https://fonts.googleapis.com/css2?family=' + f.google + '&display=block';
            document.head.appendChild(l);
        }
    }

    // Tasarımda kullanılan fontları önceden yükle (yoksa ilk çizim yedek fontla olur)
    function warmFonts(d) {
        if (!document.fonts || !d) return;
        const seen = {};
        for (const L of d.layers || []) {
            if (L.type !== 'text') continue;
            const key = `${L.italic ? 'italic ' : ''}${L.bold ? 700 : 400} 64px "${L.font || 'Impact'}"`;
            if (seen[key]) continue;
            seen[key] = true;
            document.fonts.load(key).then(schedule).catch(() => {});
        }
    }

    if (document.fonts) document.fonts.addEventListener('loadingdone', schedule);

    window.addEventListener('message', (ev) => {
        let m = ev.data;
        if (typeof m === 'string') { try { m = JSON.parse(m); } catch (e) { return; } }
        if (!m || !m.action) return;
        switch (m.action) {
            case 'fonts':
                loadFonts(m.fonts);
                break;
            case 'design':
                design = m.design || null;
                rect = m.rect || null;
                charts = m.charts || null;
                warmFonts(design);
                schedule();
                break;
            case 'image':
                if (m.id && m.data) { imageData[m.id] = m.data; schedule(); }
                break;
            case 'clear':
                design = null;
                schedule();
                break;
        }
    });

    window.addEventListener('resize', schedule);
    schedule();
})();
