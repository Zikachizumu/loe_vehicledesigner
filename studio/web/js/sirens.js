/* Sirenler: polis / acil durum araçlarının oyundaki LED'leri (carcols.meta siren ayarları) tek tek listelenir, açılıp kapatılır,
 * boyanır ve gerçek yanıp sönme desenleriyle önizlenir. Veri: data/sirens.json (tools/packbuilder/build_sirens.py). */
(function () {
    'use strict';
    const VS = window.VS, S = VS.S, T = VS.tools;
    const { $, esc } = VS;
    const { h, slider, colorField, select, lbl } = VS.ui;

    const state = () => S.mod.sirens || (S.mod.sirens = { off: {}, col: {} });

    VS.sirenSetFor = function (id) {
        const db = VS.sirenDB;
        if (!db || !id) return null;
        const sid = db.veh[id];
        return sid ? db.sets[sid] : null;
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
        sc.setSirens(VS.sirenSetFor(S.veh && S.veh.id), m);
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

    // Kemik konumundan okunur yer adı (GTA: +X aracın sağı, +Y önü)
    function ledPlace(sc, s) {
        const bb = sc.bbox, t = sc.vd.header.bones[s.bone].t;
        const W = bb.max[0] - bb.min[0], Ln = bb.max[1] - bb.min[1], Hh = bb.max[2] - bb.min[2];
        const side = t[0] < -0.035 * W ? 'Sol' : t[0] > 0.035 * W ? 'Sağ' : 'Orta';
        const yn = (t[1] - (bb.min[1] + bb.max[1]) / 2) / (Ln / 2);
        const hi = t[2] > bb.min[2] + 0.62 * Hh;
        const zone = hi ? (yn > 0.35 ? 'Ön tavan' : yn < -0.35 ? 'Arka tavan' : 'Tavan') : (yn > 0.2 ? 'Ön' : 'Arka');
        return zone + ' · ' + side;
    }
    const pattern = (led) => (led.f ? 'yanıp söner' : led.r ? 'döner' : 'sabit');

    // ------------------------------------------------------------------ panel
    T.OPTS.sirens = function (b) {
        const sc = VS.scene, id = S.veh && S.veh.id, set = VS.sirenSetFor(id), db = VS.sirenDB;
        const st = state(), sr = S.siren;
        const note = (txt, extra) => h('div', { class: 'card-note', style: Object.assign({ fontSize: '10.5px', color: 'var(--dim)', lineHeight: '1.5', marginTop: '8px' }, extra || {}), text: txt });
        if (!db) { b.append(note('Siren verisi bulunamadı (data/sirens.json).')); return; }

        // siren'li araçlar: polis önce
        const police = /^(pol|police|sheriff|fbi|riot|pranger)/;
        const ids = Object.keys(db.veh).filter(v => S.vmap[v]).sort((a, c) => (police.test(c) - police.test(a)) || a.localeCompare(c));
        b.append(lbl('Siren\'li araçlar · ' + ids.length),
            select([['', 'Araç seç…']].concat(ids.map(v => [v, v.toUpperCase() + ' — ' + db.sets[db.veh[v]].n])), set ? id : '', v => { if (v) VS.selectVehicle(v); }));

        const leds = sc.sirens || [];
        if (!set || !leds.length) {
            b.append(note('Bu araçta siren (LED) yok. Yukarıdan bir polis ya da acil durum aracı seç.'));
            return;
        }
        const colOf = (s) => st.col[s.n] || s.led.c;
        const groups = { red: [], blue: [], other: [] };
        leds.forEach(s => groups[ledClass(colOf(s))].push(s));
        const apply = () => { VS.applySirens(); VS.setDirty(true); };
        const commit = () => { apply(); VS.commit(); };
        const rerender = () => T.renderOpts();

        b.append(h('div', { class: 'sir-sum' }, h('b', { text: set.n }), h('span', { text: leds.length + ' LED · ' + groups.red.length + ' kırmızı · ' + groups.blue.length + ' mavi' + (groups.other.length ? ' · ' + groups.other.length + ' diğer' : '') })));

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
                h('div', { class: 'meta' }, h('div', { class: 'nm', text: 'LED ' + s.n + ' · ' + CLS_TR[ledClass(col)] }), h('div', { class: 'sb', text: ledPlace(sc, s) + ' · ' + pattern(s.led) })),
                h('button', { class: 'pw' + (off ? '' : ' on'), 'data-a': 'pw', title: off ? 'Aç' : 'Kapat', html: icon(off ? 'eyeOff' : 'eye') }));
            row.addEventListener('click', e => {
                if (e.target.closest('[data-a="pw"]')) { if (off) delete st.off[s.n]; else st.off[s.n] = true; commit(); rerender(); return; }
                VS.selectSiren(s.n, false);
            });
            row.addEventListener('dblclick', () => VS.scene.focusSiren(s.n));
            list.append(row);
            if (sel) {
                list.append(h('div', { class: 'sir-edit' },
                    colorField('LED rengi', col, c => { st.col[s.n] = c; dot.style.setProperty('--c', c); apply(); }, () => { VS.commit(); rerender(); }),
                    h('div', { class: 'grid2', style: { marginTop: '6px' } },
                        h('button', { class: 'btn sm', html: icon('target') + ' Odaklan', onclick: () => VS.scene.focusSiren(s.n) }),
                        h('button', { class: 'btn sm', text: 'Orijinal renk', onclick: () => { delete st.col[s.n]; commit(); rerender(); } }))));
            }
        }
        b.append(list);
        b.append(note('LED\'ler oyundaki siren ayarlarından (kemik: siren1…) alınmıştır; renk ve desen aracın gerçek ışık çubuğunu yansıtır. Değişiklikler projeyle kaydedilir.'));
    };
})();
