/* Sirenler: polis / acil durum araçlarının oyundaki LED'leri (carcols.meta siren ayarları).
 *  - "LED'ler": aracın kendi LED'leri + sonradan takılan kit LED'leri tek tek listelenir, açılıp kapatılır, boyanır, gerçek desenle önizlenir.
 *  - "Kit tak": oyundaki herhangi bir siren düzeni (41 araç) başka bir araca (ör. Adder) takılır; tavan / ön / arka bölgeleri araç yüzeyine oturur.
 * Veri: data/sirens.json (tools/packbuilder/build_sirens.py). Kit LED'leri S.mod.sirenKit içinde projeyle birlikte saklanır. */
(function () {
    'use strict';
    const VS = window.VS, S = VS.S, T = VS.tools;
    const { clamp } = VS;
    const { h, slider, colorField, select, lbl } = VS.ui;

    const state = () => S.mod.sirens || (S.mod.sirens = { off: {}, col: {} });
    const ZONE_TR = { roof: 'Tavan', front: 'Ön', rear: 'Arka' };
    const ZONES = ['roof', 'front', 'rear'];
    const r4 = (v) => Math.round(v * 10000) / 10000;

    VS.sirenSetFor = function (id) {
        const db = VS.sirenDB;
        if (!db || !id) return null;
        const sid = db.veh[id];
        return sid ? db.sets[sid] : null;
    };

    // Kit LED'inin araç uzayındaki son konumu
    VS.kitPos = function (kit, rec) {
        const z = (kit.zo && kit.zo[rec.zone]) || [0, 0, 0], l = (kit.lo && kit.lo[rec.n]) || [0, 0, 0];
        return [r4(rec.p[0] + z[0] + l[0]), r4(rec.p[1] + z[1] + l[1]), r4(rec.p[2] + z[2] + l[2])];
    };

    // Çizim modu: animasyon yalnızca Sirenler aracı seçiliyken ve "Yanıp sönme" açıkken çalışır
    VS.syncSirenMode = function () {
        const sc = VS.scene;
        if (!sc) return;
        const on = S.tool === 'sirens';
        sc.setSirenMode(on && S.siren.play, on, S.siren.speed);
    };

    VS.applySirens = function () {
        const sc = VS.scene;
        if (!sc || !sc.vd) return;
        const m = state();
        if (!m.off) m.off = {};
        if (!m.col) m.col = {};
        const kit = S.mod.sirenKit && S.mod.sirenKit.leds && S.mod.sirenKit.leds.length ? S.mod.sirenKit : null;
        sc.setSirens(VS.sirenSetFor(S.veh && S.veh.id), m, kit);
        sc.selectSiren(S.siren.sel);
        VS.syncSirenMode();
    };

    VS.selectSiren = function (n, focus) {
        S.siren.sel = n;
        VS.scene.selectSiren(n);
        if (focus) VS.scene.focusSiren(n);
        if (S.tool === 'sirens') T.renderOpts();
    };

    // ------------------------------------------------------------------ yardımcılar
    function hexRgb(hex) { const v = parseInt(hex.slice(1), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; }
    function ledClass(hex) {
        const [r, g, b] = hexRgb(hex);
        if (r >= 150 && r >= g * 1.8 && r >= b * 1.8) return 'red';
        if (b >= 150 && b >= r * 1.5 && b >= g * 1.15) return 'blue';
        return 'other';
    }
    const CLS_TR = { red: 'Kırmızı', blue: 'Mavi', other: 'Diğer' };
    const pattern = (led) => (led.f ? 'yanıp söner' : led.r ? 'döner' : 'sabit');

    // bb: [[minx,miny,minz],[maxx,maxy,maxz]]; p: araç uzayında LED konumu (GTA: +X sağ, +Y ön, +Z yukarı)
    function zoneOf(bb, p) {
        const Ln = bb[1][1] - bb[0][1], Hh = bb[1][2] - bb[0][2];
        const yn = (p[1] - (bb[0][1] + bb[1][1]) / 2) / (Ln / 2);
        const hi = p[2] > bb[0][2] + 0.62 * Hh;
        if (hi) return yn > 0.35 ? 'front' : yn < -0.35 ? 'rear' : 'roof';
        return yn > 0 ? 'front' : 'rear';
    }
    const sideOf = (x, W) => (x < -0.035 * W ? 'Sol' : x > 0.035 * W ? 'Sağ' : 'Orta');
    function placeText(sc, s) {
        const bb = sc.bbox, W = bb.max[0] - bb.min[0];
        if (s.kit) {
            const q = s.sprite.position;
            return ZONE_TR[s.zone] + ' · ' + sideOf(q.x, W);
        }
        const t = sc.vd.header.bones[s.bone].t;
        return ZONE_TR[zoneOf([bb.min, bb.max], t)] + ' · ' + sideOf(t[0], W);
    }

    // Kaynak aracın LED'ini hedef araca eşle: x genişliğe, y/z gövde ölçüsüne göre ölçeklenir, sonra yüzeye oturtulur
    function mapLed(sc, ks, n, peak) {
        const sb = ks.bb, tb = sc.bbox, p = ks.p[n];
        const Ws = sb[1][0] - sb[0][0], Ls = sb[1][1] - sb[0][1], Hs = sb[1][2] - sb[0][2];
        const Wt = tb.max[0] - tb.min[0], Lt = tb.max[1] - tb.min[1], Ht = tb.max[2] - tb.min[2];
        const rw = clamp(Wt / Ws, 0.6, 1.4), zone = zoneOf(sb, p), hi = p[2] > sb[0][2] + 0.62 * Hs;
        const roofIdx = Object.keys(ks.p).filter(k => zoneOf(sb, ks.p[k]) === 'roof');
        const roofCy = roofIdx.length ? roofIdx.reduce((a, k) => a + ks.p[k][1], 0) / roofIdx.length : (sb[0][1] + sb[1][1]) / 2;
        const x = p[0] * (zone === 'roof' ? clamp(rw, 0.85, 1.15) : rw);
        const up = (h) => (h ? sc.toLocal(h.point) : null);
        let y, z;
        if (zone === 'roof') {
            y = peak.y + (p[1] - roofCy);
            const q = up(sc.surfaceAt(x, y));
            z = (q ? q[2] : peak.z) + 0.02;
        } else {
            y = zone === 'front' ? tb.max[1] - (sb[1][1] - p[1]) * (Lt / Ls) : tb.min[1] + (p[1] - sb[0][1]) * (Lt / Ls);
            if (hi) {                       // cam kenarı / bagaj üstü: yüzeyin üstüne
                const q = up(sc.surfaceAt(x, y));
                z = q ? q[2] + 0.02 : tb.min[2] + (p[2] - sb[0][2]) * (Ht / Hs);
            } else {                        // tampon / ızgara: yatay ışınla dış yüzeye
                z = tb.min[2] + (p[2] - sb[0][2]) * (Ht / Hs);
                const q = up(zone === 'front' ? sc.surfaceFront(x, z) : sc.surfaceRear(x, z));
                if (q) y = q[1] + (zone === 'front' ? 0.012 : -0.012);
            }
        }
        return { zone, p: [r4(x), r4(y), r4(z)] };
    }

    function newKit() { return { leds: [], zo: {}, lo: {}, housing: {}, next: 101 }; }

    function addFromSource(kit, src, n, peak) {
        const db = VS.sirenDB, ks = db.kits[src], set = db.sets[ks.s];
        const l = set.L.find(x => x.n === n);
        if (!l || !ks.p[n]) return null;
        const m = mapLed(VS.scene, ks, n, peak);
        const led = Object.assign({}, l); delete led.n;
        const rec = { n: kit.next++, sn: n, src, zone: m.zone, p: m.p, led };
        kit.leds.push(rec);
        if (!kit.zo[m.zone]) kit.zo[m.zone] = [0, 0, 0];
        return rec;
    }

    function installKit(partial) {
        const db = VS.sirenDB, sr = S.siren, ks = db.kits[sr.kitSrc];
        if (!ks) return;
        const sc = VS.scene, peak = sc.roofPeak();
        const kit = newKit();
        const set = db.sets[ks.s];
        for (const l of set.L) {
            if (!ks.p[l.n]) continue;
            if (!sr.zones[zoneOf(ks.bb, ks.p[l.n])]) continue;
            addFromSource(kit, sr.kitSrc, l.n, peak);
        }
        if (!kit.leds.length) { VS.toast('Seçili bölgelerde LED yok', 'err'); return; }
        kit.src = sr.kitSrc;
        kit.housing.roof = !!sr.housing && kit.leds.filter(r => r.zone === 'roof').length >= 4;
        S.mod.sirenKit = kit;
        const st = state(); st.off = {}; st.col = {};
        S.siren.sel = kit.leds[0].n; S.siren.tab = 'led';
        VS.applySirens(); VS.setDirty(true); VS.commit();
        sc.view('iso');
        T.renderOpts();
        VS.toast(kit.leds.length + ' LED araca takıldı', 'ok');
    }

    // Takılı kitin tüm LED'lerini kaynak eşlemesinden yeniden oturt (bölge kaydırması sıfırlanır)
    function reseat(zone) {
        const kit = S.mod.sirenKit, db = VS.sirenDB;
        if (!kit) return;
        const peak = VS.scene.roofPeak();
        for (const rec of kit.leds) {
            if (zone && rec.zone !== zone) continue;
            const ks = db.kits[rec.src];
            if (!ks) continue;
            rec.p = mapLed(VS.scene, ks, rec.sn, peak).p;
            delete kit.lo[rec.n];
        }
        if (zone) kit.zo[zone] = [0, 0, 0]; else kit.zo = Object.fromEntries(Object.keys(kit.zo).map(k => [k, [0, 0, 0]]));
    }

    // ------------------------------------------------------------------ siren yapılandırmasını dışa aktar (.json)
    VS.exportSirens = async function () {
        const sc = VS.scene, id = S.veh && S.veh.id, set = VS.sirenSetFor(id), st = state(), kit = S.mod.sirenKit;
        const info = (s) => ({ color: st.col[s.n] || s.led.c, enabled: !st.off[s.n], pattern: pattern(s.led), flashSequencer: s.led.q, rotate: !!s.led.r, rotationStart: s.led.a, rotationSpeed: s.led.s, coronaSize: s.led.z, coronaIntensity: s.led.i, lightGroup: s.led.g, realLight: !!s.led.l });
        const out = { app: 'loe-vehicle-studio', type: 'siren-config', vehicle: id, units: 'metre, GTA araç uzayı (+X sağ, +Y ön, +Z yukarı)', bpm: set ? set.b : (kit && VS.sirenDB.sets[VS.sirenDB.kits[kit.src].s].b) || 200,
            native: set ? { setName: set.n, leds: sc.sirens.filter(s => !s.kit).map(s => Object.assign({ n: s.n, bone: 'siren' + s.n }, info(s))) } : null,
            kit: kit ? { source: kit.src, leds: sc.sirens.filter(s => s.kit).map(s => Object.assign({ n: s.n - 100, zone: s.zone, position: VS.kitPos(kit, s.rec) }, info(s))) } : null };
        if (!out.native && !out.kit) { VS.toast('Bu araçta siren yok', 'err'); return; }
        const safe = (v) => String(v || 'proje').replace(/[^\w\-]+/g, '_');
        await VS.saveBlob(new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' }), `${safe(S.projName)}_${id}_sirenler.json`, [{ name: 'JSON', extensions: ['json'] }]);
    };

    // ------------------------------------------------------------------ panel
    T.OPTS.sirens = function (b) {
        const sc = VS.scene, id = S.veh && S.veh.id, set = VS.sirenSetFor(id), db = VS.sirenDB;
        const st = state(), sr = S.siren;
        const note = (txt, extra) => h('div', { class: 'card-note', style: Object.assign({ fontSize: '10.5px', color: 'var(--dim)', lineHeight: '1.5', marginTop: '8px' }, extra || {}), text: txt });
        if (!db) { b.append(note('Siren verisi bulunamadı (data/sirens.json).')); return; }
        const apply = () => { VS.applySirens(); VS.setDirty(true); };
        const commit = () => { apply(); VS.commit(); };
        const rerender = () => T.renderOpts();
        const kit = S.mod.sirenKit && S.mod.sirenKit.leds.length ? S.mod.sirenKit : null;
        const leds = sc.sirens || [];
        const tab = sr.tab || (leds.length ? 'led' : 'kit');

        // siren'li araçlar (oyundaki orijinaller): polis önce
        const police = /^(pol|police|sheriff|fbi|riot|pranger)/;
        const ids = Object.keys(db.veh).filter(v => S.vmap[v]).sort((a, c) => (police.test(c) - police.test(a)) || a.localeCompare(c));
        b.append(lbl('Siren\'li araçlar · ' + ids.length),
            select([['', 'Araç seç…']].concat(ids.map(v => [v, v.toUpperCase() + ' — ' + db.sets[db.veh[v]].n])), set ? id : '', v => { if (v) VS.selectVehicle(v); }));

        b.append(h('div', { style: { marginTop: '8px' } }, VS.ui.seg([['led', 'LED\'ler · ' + leds.length], ['kit', 'Kit tak']], tab, v => { sr.tab = v; rerender(); })));

        // ================================================================== KİT TAK
        if (tab === 'kit') {
            const kids = Object.keys(db.kits).sort((a, c) => (police.test(c) - police.test(a)) || a.localeCompare(c));
            if (!db.kits[sr.kitSrc]) sr.kitSrc = kids[0];
            const ks = db.kits[sr.kitSrc], kset = db.sets[ks.s];
            b.append(lbl('Kit kaynağı — oyundaki siren düzeni'),
                select(kids.map(v => [v, v.toUpperCase() + ' — ' + db.sets[db.kits[v].s].n + ' (' + Object.keys(db.kits[v].p).length + ')']), sr.kitSrc, v => { sr.kitSrc = v; rerender(); }));
            const cnt = { roof: 0, front: 0, rear: 0 };
            for (const n of Object.keys(ks.p)) cnt[zoneOf(ks.bb, ks.p[n])]++;
            b.append(lbl('Takılacak bölgeler'));
            const zg = h('div', { class: 'grid3' });
            for (const z of ZONES) zg.append(h('button', { class: 'btn sm' + (sr.zones[z] && cnt[z] ? ' on' : ''), disabled: cnt[z] ? null : true, text: ZONE_TR[z] + ' (' + cnt[z] + ')',
                onclick: function () { sr.zones[z] = !sr.zones[z]; this.classList.toggle('on', sr.zones[z]); } }));
            b.append(zg);
            b.append(h('div', { class: 'row', style: { marginTop: '6px' } },
                h('button', { class: 'btn sm' + (sr.housing ? ' on' : ''), text: 'Işık çubuğu gövdesi', title: 'Tavan LED\'lerinin altına koyu taban ekler', onclick: function () { sr.housing = !sr.housing; this.classList.toggle('on', sr.housing); } })));
            b.append(h('div', { class: 'row', style: { marginTop: '8px' } },
                h('button', { class: 'btn pri', html: icon('siren') + (kit ? ' Kiti değiştir' : ' Bu araca tak'), onclick: () => installKit() })));
            b.append(note(kit ? 'Mevcut kit yeni kitle değiştirilir. Aracın kendi LED\'leri varsa LED\'ler sekmesinden kapatabilirsin.' : (id ? id.toUpperCase() : 'Araç') + ' üzerine ' + kset.n + ' düzeni takılır; LED\'ler tavana, ızgaraya ve arkaya yüzeye oturur. Sonra bölge ve LED konumlarını ince ayarla.'));

            // takılı kit: bölge ayarları
            if (kit) {
                b.append(h('div', { class: 'sir-sum' }, h('b', { text: 'Takılı kit · ' + kit.leds.length + ' LED' }), h('span', { text: 'Kaynak: ' + (kit.src || '').toUpperCase() })));
                for (const z of ZONES) {
                    const recs = kit.leds.filter(r => r.zone === z);
                    if (!recs.length) continue;
                    const zo = kit.zo[z] || (kit.zo[z] = [0, 0, 0]);
                    const sl = (lab, i) => slider(lab, -1.5, 1.5, zo[i], { step: 0.005, unit: ' m', onInput: v => { zo[i] = v; apply(); }, onChange: () => VS.commit() });
                    b.append(h('div', { class: 'sir-edit', style: { marginTop: '8px' } },
                        h('div', { style: { fontSize: '11px', fontWeight: 700, marginBottom: '4px' }, text: ZONE_TR[z] + ' bölgesi · ' + recs.length + ' LED' }),
                        sl('X', 0), sl('Y', 1), sl('Z', 2),
                        h('div', { class: 'grid2', style: { marginTop: '6px' } },
                            h('button', { class: 'btn sm', text: 'Yüzeye oturt', onclick: () => { reseat(z); commit(); rerender(); } }),
                            h('button', { class: 'btn sm' + (kit.housing[z] ? ' on' : ''), text: 'Gövde', onclick: () => { kit.housing[z] = !kit.housing[z]; commit(); rerender(); } }))));
                }
                b.append(h('div', { class: 'grid2', style: { marginTop: '8px' } },
                    h('button', { class: 'btn sm', text: 'Hepsini oturt', onclick: () => { reseat(null); commit(); rerender(); } }),
                    h('button', { class: 'btn sm dan', html: icon('trash') + ' Kiti kaldır', onclick: () => { S.mod.sirenKit = null; S.siren.sel = 0; S.siren.tab = null; commit(); rerender(); } })));
            }

            // tek LED ekle
            b.append(lbl('Tek LED ekle — kaynak düzenden'));
            const list = h('div', { class: 'sir-list' });
            for (const l of kset.L) {
                if (!ks.p[l.n]) continue;
                const z = zoneOf(ks.bb, ks.p[l.n]);
                list.append(h('div', { class: 'sir-row', style: { cursor: 'default' } },
                    h('i', { class: 'dot', style: { '--c': l.c } }),
                    h('div', { class: 'meta' }, h('div', { class: 'nm', text: 'LED ' + l.n + ' · ' + CLS_TR[ledClass(l.c)] }), h('div', { class: 'sb', text: ZONE_TR[z] + ' · ' + pattern(l) })),
                    h('button', { class: 'pw on', title: 'Araca ekle', html: icon('plus'), onclick: () => {
                        const k = S.mod.sirenKit || (S.mod.sirenKit = newKit());
                        if (!k.src) k.src = sr.kitSrc;
                        const rec = addFromSource(k, sr.kitSrc, l.n, sc.roofPeak());
                        if (rec) { S.siren.sel = rec.n; commit(); rerender(); }
                    } })));
            }
            b.append(list);
            return;
        }

        // ================================================================== LED'LER
        if (!leds.length) {
            b.append(note('Bu araçta siren (LED) yok. Yukarıdan polis / acil durum aracı seç ya da "Kit tak" sekmesinden bir siren düzeni tak.'));
            return;
        }
        const colOf = (s) => st.col[s.n] || s.led.c;
        const groups = { red: [], blue: [], other: [] };
        leds.forEach(s => groups[ledClass(colOf(s))].push(s));
        const nat = leds.filter(s => !s.kit).length;
        b.append(h('div', { class: 'sir-sum' }, h('b', { text: (set && nat ? set.n : 'Siren kiti') + (kit && nat ? ' + kit' : '') }),
            h('span', { text: leds.length + ' LED · ' + groups.red.length + ' kırmızı · ' + groups.blue.length + ' mavi' + (groups.other.length ? ' · ' + groups.other.length + ' diğer' : '') })));

        b.append(h('div', { class: 'row', style: { marginTop: '8px' } },
            h('button', { class: 'btn' + (sr.play ? ' on' : ''), html: icon('play') + ' Yanıp sönme', onclick: function () { sr.play = !sr.play; this.classList.toggle('on', sr.play); VS.syncSirenMode(); } })));
        b.append(lbl('Hız'), slider('', 0.25, 3, sr.speed, { step: 0.05, unit: '×', onInput: v => { sr.speed = v; VS.syncSirenMode(); } }));

        // renk grubuna göre toplu aç/kapat
        b.append(lbl('Gruplar'));
        const gr = h('div', { class: 'grid3' });
        for (const k of ['red', 'blue', 'other']) {
            const list = groups[k];
            const anyOn = list.some(s => !st.off[s.n]);
            gr.append(h('button', {
                class: 'btn sm' + (list.length && anyOn ? ' on' : ''), disabled: list.length ? null : true, text: CLS_TR[k] + ' (' + list.length + ')',
                title: 'Gruptaki tüm LED\'leri aç / kapat',
                onclick: () => { list.forEach(s => { if (anyOn) st.off[s.n] = true; else delete st.off[s.n]; }); commit(); rerender(); },
            }));
        }
        b.append(gr);
        b.append(h('div', { class: 'grid3', style: { marginTop: '6px' } },
            h('button', { class: 'btn sm', text: 'Hepsi açık', onclick: () => { st.off = {}; commit(); rerender(); } }),
            h('button', { class: 'btn sm', text: 'Hepsi kapalı', onclick: () => { leds.forEach(s => { st.off[s.n] = true; }); commit(); rerender(); } }),
            h('button', { class: 'btn sm', text: 'Orijinal', title: 'Renkleri oyundaki haline döndür', onclick: () => { st.col = {}; st.off = {}; commit(); rerender(); } })));

        // LED listesi
        b.append(lbl('LED\'ler · tıkla: seç, çift tık: odaklan'));
        const list = h('div', { class: 'sir-list' });
        for (const s of leds) {
            const col = colOf(s), off = !!st.off[s.n], sel = sr.sel === s.n;
            const dot = h('i', { class: 'dot', style: { '--c': col } });
            const row = h('div', { class: 'sir-row' + (sel ? ' sel' : '') + (off ? ' off' : ''), 'data-n': s.n },
                dot,
                h('div', { class: 'meta' }, h('div', { class: 'nm', text: (s.kit ? 'Kit LED ' + (s.n - 100) : 'LED ' + s.n) + ' · ' + CLS_TR[ledClass(col)] }), h('div', { class: 'sb', text: placeText(sc, s) + ' · ' + pattern(s.led) })),
                h('button', { class: 'pw' + (off ? '' : ' on'), 'data-a': 'pw', title: off ? 'Aç' : 'Kapat', html: icon(off ? 'eyeOff' : 'eye') }));
            row.addEventListener('click', e => {
                if (e.target.closest('[data-a="pw"]')) { if (off) delete st.off[s.n]; else st.off[s.n] = true; commit(); rerender(); return; }
                VS.selectSiren(s.n, false);
            });
            row.addEventListener('dblclick', () => VS.scene.focusSiren(s.n));
            list.append(row);
            if (sel) {
                const ed = h('div', { class: 'sir-edit' },
                    colorField('LED rengi', col, c => { st.col[s.n] = c; dot.style.setProperty('--c', c); apply(); }, () => { VS.commit(); rerender(); }));
                if (s.kit) {
                    const lo = kit.lo[s.n] || (kit.lo[s.n] = [0, 0, 0]);
                    const sl = (lab, i) => slider(lab, -0.6, 0.6, lo[i], { step: 0.002, unit: ' m', onInput: v => { lo[i] = v; apply(); }, onChange: () => VS.commit() });
                    ed.append(h('div', { style: { marginTop: '6px' } }, sl('X', 0), sl('Y', 1), sl('Z', 2)));
                }
                ed.append(h('div', { class: 'grid2', style: { marginTop: '6px' } },
                    h('button', { class: 'btn sm', html: icon('target') + ' Odaklan', onclick: () => VS.scene.focusSiren(s.n) }),
                    h('button', { class: 'btn sm', text: 'Orijinal renk', onclick: () => { delete st.col[s.n]; commit(); rerender(); } })));
                if (s.kit) ed.append(h('div', { style: { marginTop: '6px' } }, h('button', { class: 'btn sm dan', style: { width: '100%' }, html: icon('trash') + ' Bu LED\'i sil', onclick: () => {
                    const i = kit.leds.findIndex(r => r.n === s.n); if (i >= 0) kit.leds.splice(i, 1);
                    delete kit.lo[s.n]; delete st.col[s.n]; delete st.off[s.n];
                    if (!kit.leds.length) S.mod.sirenKit = null;
                    S.siren.sel = 0; commit(); rerender();
                } })));
                list.append(ed);
            }
        }
        b.append(list);
        b.append(note('LED\'ler oyundaki siren ayarlarından alınmıştır; renk ve desen aracın gerçek ışık çubuğunu yansıtır. Değişiklikler projeyle kaydedilir. Dışa aktar sekmesinden siren yapılandırması (.json) alınabilir.'));
    };
})();
