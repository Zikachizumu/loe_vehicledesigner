/* LOE Vehicle Studio — açılış, araç yükleme, kısayollar, dosya işlemleri, dışa aktarma. */
(function () {
    'use strict';
    const VS = window.VS, S = VS.S, E = VDEngine, L2 = VSLayout;
    const { $, $$, clamp, esc, ui } = VS;
    const { h } = ui;
    const DATA = '../data/vehicles/';
    VS.bridge = window.loe || null;        // Electron preload (sınamalarda null yapılabilir)

    // ------------------------------------------------------------------ DURUM / İPUCU
    VS.updateStatus = function () {
        const v = S.veh;
        $('#stVeh').textContent = v ? v.id.toUpperCase() : '—';
        $('#stInfo').textContent = v ? `${v.tris.toLocaleString('tr')} üçgen · ${v.bones} kemik` : '';
        $('#stSize').textContent = S.res;
        $('#vChip').innerHTML = icon('car') + `<span>${v ? esc(v.id.toUpperCase()) : 'Araç seç'}</span>`;
        $('#texName').textContent = v ? `${v.id}_livery · ${S.design.size}` : 'Tuval';
        $('#stDirty').textContent = S.dirty ? 'Kaydedilmedi' : 'Kaydedildi';
    };

    VS.updateHint = function () {
        const t = S.tool;
        let s = 'Sürükle: döndür • Tekerlek: yakınlaştır • Sağ tık: kaydır';
        if (S.skeletonOn && t === 'select') s = 'Kemik noktasına tıkla: seç • çift tık (listede): odaklan';
        if (VS.tools.byId[t] && VS.tools.byId[t].paint) s = 'Araç üzerinde sol tık + sürükle: boya • [ ] boyut';
        if (VS.tools.byId[t] && VS.tools.byId[t].place) s = t === 'image' && !S.img.pending ? 'Önce soldaki panelden bir görsel seç' : 'Araca ya da tuvale tıkla: yerleştir • Esc: vazgeç';
        if (t === 'picker') s = 'Araca ya da tuvale tıkla: rengi al';
        $('#hint').textContent = s;
    };

    // ------------------------------------------------------------------ ARAÇ
    VS.loadVehicle = async function (id) {
        const info = S.vmap[id];
        if (!info) { VS.toast('Araç bulunamadı: ' + id, 'err'); return false; }
        VS.busy('Araç yükleniyor: ' + id.toUpperCase());
        try {
            const vd = await VSVehicle.load(DATA + id + '.lvm.gz');
            S.veh = info; S.vd = vd; S.bbox = vd.header.bbox;
            S.charts = L2.compute(S.bbox.min, S.bbox.max, S.design.size);
            S.mod.parts = {}; S.mod.hidden = []; S.mod.open = {}; S.mod.extras = {}; S.mod.props = []; S.selProp = null;
            S.selBone = -1; S.boneOpen = {};
            vd.header.bones.forEach((b, i) => { if (b.p < 0 || b.p >= vd.header.bones.length || b.p === i || b.p === 0) S.boneOpen[i] = true; });
            VS.scene.setVehicle(vd, S.charts, S.design.size);
            VS.sizeCanvas();
            VS.v2.buildWire(); VS.v2.fit();
            VS.applyMod();
            VS.designChanged();
            VS.flushNow();
            try { localStorage.setItem('lvs_last', id); } catch (e) { /* yok say */ }
            VS.updateBoneLabels();
        } catch (e) {
            console.error(e);
            VS.toast('Araç yüklenemedi: ' + e.message, 'err');
            VS.busy(null);
            return false;
        }
        VS.busy(null);
        VS.updateStatus();
        return true;
    };

    VS.selectVehicle = async function (id) {
        if (S.veh && S.veh.id === id) return;
        if (await VS.loadVehicle(id)) { VS.commit(); VS.renderPanel(); VS.toast(id.toUpperCase() + ' yüklendi', 'ok'); }
    };

    // ------------------------------------------------------------------ İSKELET / X-IŞINI
    VS.setSkeleton = function (on) {
        S.skeletonOn = !!on;
        VS.scene.setSkeleton(S.skeletonOn, S.labelsOn);
        syncChips(); VS.updateHint(); VS.updateBoneLabels();
        if (S.tab === 'skeleton') VS.renderPanel();
    };
    VS.setXray = function (on) {
        VS.scene.setXray(on);
        syncChips();
        if (S.tab === 'skeleton') VS.renderPanel();
    };
    VS.selectBone = function (i) {
        S.selBone = i;
        VS.scene.highlightBone(i);
        if (S.tab !== 'skeleton') { S.tab = 'skeleton'; VS.renderTabs(); }
        // seçili kemiğin üst zincirini aç
        const b = VS.scene.vd.header.bones;
        for (let p = b[i].p, g = 0; p >= 0 && p < b.length && g < 40; p = b[p].p, g++) S.boneOpen[p] = true;
        VS.renderPanel();
        VS.updateBoneLabels();
        const row = $(`.bnode[data-b="${i}"]`);
        if (row) row.scrollIntoView({ block: 'nearest' });
    };
    VS.focusBone = function (i) {
        const sc = VS.scene, v = new THREE.Vector3();
        sc.boneGroups[i].getWorldPosition(v);
        sc.controls.target.copy(v);
        sc.controls.update();
        sc.invalidate();
    };

    VS.updateBoneLabels = function () {
        const box = $('#labels'), sc = VS.scene;
        if (!sc || !sc.vd) { box.innerHTML = ''; return; }
        const want = new Set();
        if (S.skeletonOn) {
            if (S.labelsOn) {
                const gs = {};
                sc.vd.header.groups.forEach(g => { gs[g.b] = (gs[g.b] || 0) + g.n / 3; });
                sc.vd.header.bones.forEach((b, i) => { if (!sc.far[i] && ((gs[i] || 0) >= 60 || VSVehicle.boneRole(b.n))) want.add(i); });
            }
            if (S.selBone >= 0 && !sc.far[S.selBone]) want.add(S.selBone);
            if (sc.hoverBone >= 0) want.add(sc.hoverBone);
        }
        const have = {};
        $$('.blabel', box).forEach(el => { const i = +el.dataset.b; if (!want.has(i)) el.remove(); else have[i] = el; });
        want.forEach(i => {
            let el = have[i];
            if (!el) { el = h('div', { class: 'blabel', 'data-b': i, text: sc.vd.header.bones[i].n }); box.append(el); }
            el.classList.toggle('sel', i === S.selBone);
            el.classList.toggle('hov', i === sc.hoverBone && i !== S.selBone);
        });
        VS.placeBoneLabels();
    };
    VS.placeBoneLabels = function () {
        const sc = VS.scene;
        if (!sc || !sc.vd || !S.skeletonOn || !sc.boneWorld) return;
        $$('#labels .blabel').forEach(el => {
            const p = sc.boneScreen(+el.dataset.b);
            el.style.display = p.behind ? 'none' : '';
            el.style.left = p.x + 'px'; el.style.top = p.y + 'px';
        });
    };

    VS.setTurntable = function (on) {
        VS.turn = !!on;
        VS.scene.controls.autoRotate = VS.turn;
        VS.scene.controls.autoRotateSpeed = 1.6;
        VS.scene.invalidate();
    };

    function syncChips() {
        const sc = VS.scene;
        $('#chXray') && $('#chXray').classList.toggle('on', !!sc.xray);
        $('#chSkel') && $('#chSkel').classList.toggle('on', !!S.skeletonOn);
        $('#chLbl') && $('#chLbl').classList.toggle('on', !!S.labelsOn);
        { const b = $('#cXray'); b.classList.toggle('on', !!S.v2.xray); b.innerHTML = '<i></i>' + (S.v2.xray === 'full' ? 'UV: DETAY' : S.v2.xray ? 'UV: TEMİZ' : 'UV: KAPALI'); }
    }

    // ------------------------------------------------------------------ DOSYA
    VS.saveBlob = async function (blob, name, filters) {
        if (VS.bridge && VS.bridge.saveFile) {
            const buf = await blob.arrayBuffer();
            const r = await VS.bridge.saveFile(name, buf, filters);
            if (r) VS.toast('Kaydedildi: ' + r, 'ok');
            return r;
        }
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = name;
        document.body.append(a); a.click();
        setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
        VS.toast('İndirildi: ' + name, 'ok');
        return name;
    };
    const safe = (s) => String(s || 'proje').replace(/[^\w\-]+/g, '_').slice(0, 40);

    VS.saveProject = async function () {
        VS.busy('Proje kaydediliyor…');
        try {
            await new Promise(r => setTimeout(r, 30));
            const p = VS.project(true);
            const blob = new Blob([JSON.stringify(p)], { type: 'application/json' });
            const r = await VS.saveBlob(blob, `${safe(S.projName)}_${p.vehicle}.lvs`, [{ name: 'LOE Vehicle Studio projesi', extensions: ['lvs'] }]);
            if (r) VS.setDirty(false);
        } finally { VS.busy(null); }
    };

    VS.openProject = async function () {
        let text = null;
        if (VS.bridge && VS.bridge.openFile) {
            const r = await VS.bridge.openFile([{ name: 'LOE Vehicle Studio projesi', extensions: ['lvs', 'json'] }]);
            if (!r) return;
            text = new TextDecoder().decode(r.data);
        } else {
            text = await new Promise(res => {
                const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.lvs,.json';
                inp.onchange = async () => res(inp.files[0] ? await inp.files[0].text() : null);
                inp.click();
            });
        }
        if (text) VS.loadProjectText(text);
    };

    VS.loadProjectText = async function (text) {
        let p;
        try { p = JSON.parse(text); } catch (e) { VS.toast('Dosya okunamadı', 'err'); return; }
        if (!p || p.app !== 'loe-vehicle-studio') { VS.toast('Bu bir LOE Vehicle Studio projesi değil', 'err'); return; }
        VS.busy('Proje açılıyor…');
        try {
            S.projName = p.name || 'Proje'; $('#projName').value = S.projName;
            await VS.loadDesign(p.design);
            const m = Object.assign(VS.newMod(), p.mod || {});
            if (p.vehicle && S.vmap[p.vehicle]) {
                S.mod = m;
                const keep = JSON.parse(JSON.stringify(m));
                await VS.loadVehicle(p.vehicle);
                S.mod = keep;
            } else { S.mod = m; }
            VS.applyMod(); VS.designChanged(); VS.resetHistory(); VS.setDirty(false);
            VS.renderPanel(); VS.updateStatus();
            VS.toast('Proje açıldı', 'ok');
        } finally { VS.busy(null); }
    };

    VS.newProject = async function () {
        if (S.dirty && !(await VS.confirm('Yeni proje', 'Kaydedilmemiş değişiklikler silinecek. Devam edilsin mi?', 'Yeni proje'))) return;
        await VS.loadDesign(VS.newDesign());
        S.mod = Object.assign(VS.newMod(), { body: S.mod.body, finish: S.mod.finish });
        S.projName = 'Adsız proje'; $('#projName').value = S.projName;
        VS.applyMod(); VS.designChanged(); VS.resetHistory(); VS.setDirty(false); VS.renderPanel(); VS.updateStatus();
    };

    // ------------------------------------------------------------------ DIŞA AKTARMA
    function renderAt(size) {
        const c = document.createElement('canvas');
        c.width = c.height = size;
        E.render(c.getContext('2d'), S.design, { width: size, height: size, clear: true });
        return c;
    }
    const toBlob = (c, type) => new Promise(res => c.toBlob(res, type || 'image/png'));

    VS.exportDesignPng = async function (withWire) {
        if (!S.veh) return;
        VS.busy('PNG hazırlanıyor…');
        await new Promise(r => setTimeout(r, 30));
        try {
            const size = 4096;
            let out = renderAt(size);
            if (withWire) {
                const o = document.createElement('canvas'); o.width = o.height = size;
                const x = o.getContext('2d');
                x.fillStyle = '#0a0a0e'; x.fillRect(0, 0, size, size);
                x.fillStyle = S.mod.body; x.globalAlpha = 0.9;
                for (const c of S.charts) x.fillRect(c.rect[0], c.rect[1], c.rect[2], c.rect[3]);
                x.globalAlpha = 1;
                if (VS.v2.wireFill) x.drawImage(VS.v2.wireFill, 0, 0, size, size);
                x.drawImage(out, 0, 0);
                if (VS.v2.wireLine) { x.globalAlpha = 0.85; x.drawImage(VS.v2.wireLine, 0, 0, size, size); x.globalAlpha = 1; }
                x.font = '700 70px "Chakra Petch", Impact, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
                for (const l of VS.v2.labels) { x.lineWidth = 12; x.strokeStyle = 'rgba(0,0,0,.7)'; x.strokeText(l.text, l.x, l.y); x.fillStyle = ['#38bdf8', '#ff2e93', '#34d399', '#fb923c', '#a855f7'][l.chart]; x.fillText(l.text, l.x, l.y); }
                out = o;
            }
            await VS.saveBlob(await toBlob(out), `${safe(S.projName)}_${S.veh.id}_${withWire ? 'sablon' : 'tasarim'}.png`, [{ name: 'PNG', extensions: ['png'] }]);
        } finally { VS.busy(null); }
    };

    VS.exportCharts = async function () {
        if (!S.veh) return;
        VS.busy('Yüzeyler hazırlanıyor…');
        await new Promise(r => setTimeout(r, 30));
        try {
            const full = renderAt(4096);
            const files = [];
            for (const c of S.charts) {
                const [x, y, w, hh] = c.rect.map(Math.round);
                const o = document.createElement('canvas'); o.width = w; o.height = hh;
                o.getContext('2d').drawImage(full, x, y, w, hh, 0, 0, w, hh);
                files.push({ name: `${safe(S.projName)}_${S.veh.id}_${c.id}.png`, blob: await toBlob(o) });
            }
            if (VS.bridge && VS.bridge.saveFiles) {
                const r = await VS.bridge.saveFiles(await Promise.all(files.map(async f => ({ name: f.name, data: await f.blob.arrayBuffer() }))));
                if (r) VS.toast('5 dosya kaydedildi: ' + r, 'ok');
            } else for (const f of files) await VS.saveBlob(f.blob, f.name);
        } finally { VS.busy(null); }
    };

    VS.exportRender = async function () {
        const sc = VS.scene;
        sc.updateSkeleton(); sc.renderer.render(sc.scene, sc.camera);
        const b = await toBlob(sc.renderer.domElement);
        await VS.saveBlob(b, `${safe(S.projName)}_${S.veh.id}_render.png`, [{ name: 'PNG', extensions: ['png'] }]);
    };

    VS.exportObj = async function () {
        const sc = VS.scene;
        if (!sc.vd) return;
        VS.busy('OBJ hazırlanıyor…');
        await new Promise(r => setTimeout(r, 30));
        try {
            const lines = ['# LOE Vehicle Studio — ' + S.veh.id, '# +Y ön, +X sağ, +Z yukarı (GTA V araç uzayı), metre'];
            let vo = 1, to = 1, no = 1;
            const bones = sc.vd.header.bones;
            const f3 = (v) => (Math.round(v * 10000) / 10000);
            for (const m of sc.meshes) {
                if (!m.visible) continue;
                const g = m.geometry, pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv;
                const cls = ['paint', 'glass', 'metal', 'tire', 'light', 'interior', 'detail', 'other'][m.userData.cls];
                lines.push(`o ${bones[m.userData.bone].n}_${cls}`);
                // yalnızca kullanılan köşeleri yaz (paylaşılan öznitelikler tüm aracı içerir)
                const idx = g.index ? g.index.array : null;
                const used = new Map(), order = [];
                const cnt = idx ? idx.length : pos.count;
                const tri = new Array(cnt);
                for (let i = 0; i < cnt; i++) {
                    const k = idx ? idx[i] : i;
                    let r = used.get(k);
                    if (r === undefined) { r = order.length; used.set(k, r); order.push(k); }
                    tri[i] = r;
                }
                for (const i of order) lines.push(`v ${f3(pos.getX(i))} ${f3(pos.getY(i))} ${f3(pos.getZ(i))}`);
                for (const i of order) lines.push(`vn ${f3(nor.getX(i))} ${f3(nor.getY(i))} ${f3(nor.getZ(i))}`);
                if (uv) for (const i of order) lines.push(`vt ${f3(uv.getX(i))} ${f3(uv.getY(i))}`);
                for (let i = 0; i + 2 < cnt; i += 3) {
                    const a = tri[i], b = tri[i + 1], c = tri[i + 2];
                    if (uv) lines.push(`f ${vo + a}/${to + a}/${no + a} ${vo + b}/${to + b}/${no + b} ${vo + c}/${to + c}/${no + c}`);
                    else lines.push(`f ${vo + a}//${no + a} ${vo + b}//${no + b} ${vo + c}//${no + c}`);
                }
                vo += order.length; no += order.length; if (uv) to += order.length;
            }
            await VS.saveBlob(new Blob([lines.join('\n')], { type: 'text/plain' }), `${S.veh.id}.obj`, [{ name: 'Wavefront OBJ', extensions: ['obj'] }]);
        } finally { VS.busy(null); }
    };

    // ------------------------------------------------------------------ YARDIM
    function help() {
        VS.modal(`<h3>${icon('question')} LOE Vehicle Studio</h3>
            <p>GTA V araçlarını 3B görüntüle, iskeletini incele, boya ve livery tasarla.</p>
            <ul>
                <li><b>Garaj</b>: ${S.vehicles.length} vanilla araç. Model adıyla ara.</li>
                <li><b>İskelet</b>: kemikleri göster, adlarını gör, kapı/kaput aç, parçayı gizle ya da ayrı boya.</li>
                <li><b>X-ışını</b>: araç şeffaflaşır; 2B tuvalde UV tel kafes ve parça adları görünür.</li>
                <li><b>Araçlar</b>: fırça, metin, şekil, görsel, degrade, şerit, numara, desen, şablon.</li>
                <li>Araç üzerinde ya da tuvalde sol tık: yerleştir/boya. Sağ tık: kaydır. Tekerlek: yakınlaştır.</li>
                <li>Kısayollar: V B E T H I F G N D P K • Ctrl+Z/Y • Del • Ctrl+D • [ ] boyut • Ctrl+S kaydet</li>
            </ul>
            <div class="row"><button class="btn pri" data-k="ok">Tamam</button></div>`, (m, close) => { m.querySelector('[data-k=ok]').onclick = close; });
    }

    // ------------------------------------------------------------------ KISAYOLLAR
    function typing() { const t = document.activeElement && document.activeElement.tagName; return t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT'; }
    window.addEventListener('keydown', e => {
        if (typing()) return;
        const k = e.key, ctrl = e.ctrlKey || e.metaKey;
        if (ctrl && k.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? VS.redo() : VS.undo(); return; }
        if (ctrl && k.toLowerCase() === 'y') { e.preventDefault(); VS.redo(); return; }
        if (ctrl && k.toLowerCase() === 's') { e.preventDefault(); VS.saveProject(); return; }
        if (ctrl && k.toLowerCase() === 'd') {
            e.preventDefault();
            const L = VS.selLayer();
            if (L && L.type !== 'paint') { const c = JSON.parse(JSON.stringify(L)); c.id = E.uid('l'); c.name = L.name + ' kopya'; c.x += 80; c.y += 80; VS.addLayer(c); }
            return;
        }
        if (k === 'Delete' || k === 'Backspace') { const L = VS.selLayer(); if (L) { e.preventDefault(); VS.removeLayer(L.id); } return; }
        if (k === 'Escape') { S.img.pending = null; VS.tools.set('select'); return; }
        if (k === '[') { S.brush.size = clamp(S.brush.size - 10, 4, 600); VS.tools.renderOpts(); return; }
        if (k === ']') { S.brush.size = clamp(S.brush.size + 10, 4, 600); VS.tools.renderOpts(); return; }
        if (k.startsWith('Arrow') && !ctrl) {
            const L = VS.selLayer();
            if (L && L.type !== 'paint' && !L.locked) {
                e.preventDefault();
                const d = e.shiftKey ? 20 : 2;
                if (k === 'ArrowLeft') L.x -= d; else if (k === 'ArrowRight') L.x += d; else if (k === 'ArrowUp') L.y -= d; else L.y += d;
                VS.designChanged(); VS.syncProps(); clearTimeout(VS._nudge); VS._nudge = setTimeout(() => VS.commit(), 400);
            }
            return;
        }
        if (!ctrl && k.length === 1) {
            const t = VS.tools.list.find(x => x !== 'sep' && x.key.toLowerCase() === k.toLowerCase());
            if (t) { e.preventDefault(); VS.tools.set(t.id); }
        }
    });

    document.addEventListener('paste', e => {
        if (typing()) return;
        const items = e.clipboardData && e.clipboardData.items;
        if (!items) return;
        for (const it of items) if (it.type.startsWith('image/')) { VS.imageFromBlob(it.getAsFile(), 'Pano'); e.preventDefault(); return; }
    });
    window.addEventListener('dragover', e => e.preventDefault());
    window.addEventListener('drop', async e => {
        e.preventDefault();
        const f = e.dataTransfer.files && e.dataTransfer.files[0];
        if (!f) return;
        if (/\.(lvs|json)$/i.test(f.name)) VS.loadProjectText(await f.text());
        else if (f.type.startsWith('image/')) VS.imageFromBlob(f, f.name.replace(/\.[^.]+$/, ''));
    });
    window.addEventListener('beforeunload', () => { try { autosave(); } catch (e) { /* yok say */ } });

    // ------------------------------------------------------------------ OTOMATİK KAYIT
    function autosave() {
        if (!S.ready || !S.dirty) return;
        const p = VS.project(false);
        const txt = JSON.stringify(p);
        if (VS.bridge && VS.bridge.autosave) VS.bridge.autosave(txt);
        else try { localStorage.setItem('lvs_auto', txt.length < 4.5e6 ? txt : ''); } catch (e) { /* yok say */ }
    }
    setInterval(autosave, 20000);

    // ------------------------------------------------------------------ AÇILIŞ
    async function boot() {
        $('#splashCrown').innerHTML = CROWN_SVG;
        $('#brandCrown').innerHTML = CROWN_SVG;
        $('#btnExport').innerHTML = icon('download') + ' Dışa aktar';
        $('#btnSave').innerHTML = icon('save') + ' Kaydet';
        $('#btnOpen').innerHTML = icon('folder') + ' Aç';
        $('#btnNew').innerHTML = icon('plus') + ' Yeni';
        $('#btnHelp').innerHTML = icon('question') + ' Nasıl çalışır?';
        $('#btnUndo').innerHTML = icon('undo'); $('#btnRedo').innerHTML = icon('redo');
        $('#zOut').innerHTML = icon('zoomOut'); $('#zIn').innerHTML = icon('zoomIn'); $('#zFit').innerHTML = icon('ratio');

        VS.scene = new Scene3D($('#gl'));
        VS.v2 = new VS.Editor2D($('#stage'), $('#c2d'));
        VS.scene.onFrame = VS.placeBoneLabels;
        VS.scene.controls.addEventListener('start', () => { });
        VS.sizeCanvas();

        // 3B girdisi (yörünge kontrolünden önce yakala)
        const host = $('#gl');
        for (const [dom, type] of [['pointerdown', 'down'], ['pointermove', 'move'], ['pointerup', 'up']]) {
            host.addEventListener(dom, e => {
                if (VS.tools.pointer3d(type, e)) {
                    if (type === 'down') { try { host.setPointerCapture(e.pointerId); } catch (err) { /* yapay olay */ } }
                    e.stopPropagation();
                }
            }, true);
        }
        host.addEventListener('pointerleave', () => { if (VS.scene.hoverBone >= 0) { VS.scene.hoverBone = -1; VS.scene.invalidate(); VS.updateBoneLabels(); } });

        // görünüm çubuğu
        const vbar = $('#vbar');
        const chip = (id, ic, text, fn) => { const b = h('button', { class: 'chip', id, html: icon(ic) + ' ' + text }); b.addEventListener('click', fn); vbar.append(b); return b; };
        chip('chXray', 'scan', 'X-ışını', () => VS.setXray(!VS.scene.xray));
        chip('chSkel', 'bone', 'İskelet', () => VS.setSkeleton(!S.skeletonOn));
        chip('chLbl', 'type', 'İsimler', () => { S.labelsOn = !S.labelsOn; if (S.labelsOn && !S.skeletonOn) { VS.setSkeleton(true); } VS.scene.setSkeleton(S.skeletonOn, S.labelsOn); syncChips(); VS.updateBoneLabels(); });
        chip('chTurn', 'play', 'Döndür', function () { VS.setTurntable(!VS.turn); this.classList.toggle('on', VS.turn); });
        const cube = $('#vcube');
        for (const [k, t] of [['iso', 'İzo'], ['front', 'Ön'], ['rear', 'Arka'], ['left', 'Sol'], ['right', 'Sağ'], ['top', 'Üst']]) {
            const b = h('button', { text: t }); b.addEventListener('click', () => VS.scene.view(k)); cube.append(b);
        }

        // 2B başlık
        $('#zIn').onclick = () => VS.v2.zoomBy(1.25); $('#zOut').onclick = () => VS.v2.zoomBy(0.8); $('#zFit').onclick = () => VS.v2.fit();
        $('#cXray').onclick = function () { S.v2.xray = S.v2.xray === 'clean' ? 'full' : S.v2.xray === 'full' ? false : 'clean'; syncChips(); VS.v2.invalidate(); };
        $('#cPaint').onclick = function () { S.v2.paint = !S.v2.paint; this.classList.toggle('on', S.v2.paint); VS.v2.invalidate(); };
        $('#cGrid').onclick = function () { S.v2.grid = !S.v2.grid; this.classList.toggle('on', S.v2.grid); VS.v2.invalidate(); };
        $('#cMirror').onclick = function () { S.brush.mirror = !S.brush.mirror; this.classList.toggle('on', S.brush.mirror); VS.tools.renderOpts(); };

        // üst çubuk
        $('#btnSave').onclick = () => VS.saveProject();
        $('#btnExport').onclick = () => { S.tab = 'export'; VS.renderTabs(); VS.renderPanel(); };
        $('#btnOpen').onclick = () => VS.openProject();
        $('#btnNew').onclick = () => VS.newProject();
        $('#btnHelp').onclick = help;
        $('#btnUndo').onclick = () => VS.undo(); $('#btnRedo').onclick = () => VS.redo();
        $('#vChip').onclick = () => { S.tab = 'garage'; VS.renderTabs(); VS.renderPanel(); };
        $('#projName').addEventListener('input', e => { S.projName = e.target.value; VS.setDirty(true); });

        VS.tools.renderRail();
        VS.renderTabs();

        // araç listesi
        const idx = await (await fetch(DATA + 'index.json')).json();
        S.vehicles = idx.map(v => Object.assign(v, { cat: VSVehicle.category(v) })).sort((a, b) => a.id.localeCompare(b.id));
        S.vehicles.forEach(v => { S.vmap[v.id] = v; });

        await VS.fontsReady();
        let last = null;
        try { last = localStorage.getItem('lvs_last'); } catch (e) { /* yok say */ }
        const first = (last && S.vmap[last]) ? last : (S.vmap.police3 ? 'police3' : S.vehicles[0].id);
        await VS.loadVehicle(first);

        // son oturumu geri yükle
        let auto = null;
        try { auto = VS.bridge && VS.bridge.autoload ? await VS.bridge.autoload() : localStorage.getItem('lvs_auto'); } catch (e) { /* yok say */ }
        if (auto) { try { const p = JSON.parse(auto); if (p && p.app === 'loe-vehicle-studio' && p.design && p.design.layers && p.design.layers.length) { await VS.loadProjectText(auto); VS.toast('Son oturum geri yüklendi (' + (p.name || 'proje') + ')', 'ok'); } } catch (e) { /* yok say */ } }

        VS.tools.set('select');
        VS.resetHistory();
        VS.setDirty(false);
        S.ready = true;
        VS.renderPanel();
        VS.updateStatus(); VS.updateHint(); syncChips();
        const sp = $('#splash'); sp.classList.add('off'); setTimeout(() => sp.remove(), 600);
        window.__studioReady = true;
    }
    boot().catch(e => { console.error(e); const s = $('#splash'); if (s) s.querySelector('p').textContent = 'HATA: ' + e.message; });
})();
