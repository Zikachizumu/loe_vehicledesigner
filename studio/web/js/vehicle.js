/* Araç verisi: .lvm.gz yükleme + çözme, kemik yardımcıları.
 * Biçim: tools/packbuilder/Mesh3D.cs  ("LVM1" | u32 başlık | JSON | u16 konum x3 | i8 normal x4 | indeks). */
(function (root) {
    'use strict';

    const CLASS = { PAINT: 0, GLASS: 1, METAL: 2, TIRE: 3, LIGHT: 4, INTERIOR: 5, DETAIL: 6, OTHER: 7 };

    async function gunzip(buf) {
        const ds = new DecompressionStream('gzip');
        const stream = new Blob([buf]).stream().pipeThrough(ds);
        return await new Response(stream).arrayBuffer();
    }

    async function load(url) {
        const res = await fetch(url);
        if (!res.ok) throw new Error('araç dosyası bulunamadı: ' + url);
        const raw = await gunzip(await res.arrayBuffer());
        const dv = new DataView(raw);
        const magic = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3));
        if (magic !== 'LVM1') throw new Error('geçersiz araç dosyası');
        const hl = dv.getUint32(4, true);
        const header = JSON.parse(new TextDecoder().decode(new Uint8Array(raw, 8, hl)));
        let off = 8 + hl;
        const n = header.vcount;
        const pos = new Float32Array(n * 3);
        const pmin = header.pmin, ps = header.psize;
        const u16 = new Uint16Array(raw, off, n * 3);
        for (let i = 0; i < n; i++) {
            pos[i * 3] = pmin[0] + u16[i * 3] / 65535 * ps[0];
            pos[i * 3 + 1] = pmin[1] + u16[i * 3 + 1] / 65535 * ps[1];
            pos[i * 3 + 2] = pmin[2] + u16[i * 3 + 2] / 65535 * ps[2];
        }
        off += n * 6;
        if ((n * 6) % 4 !== 0) off += 2;
        const nrm = new Float32Array(n * 3);
        const i8 = new Int8Array(raw, off, n * 4);
        for (let i = 0; i < n; i++) {
            let x = i8[i * 4] / 127, y = i8[i * 4 + 1] / 127, z = i8[i * 4 + 2] / 127;
            const l = Math.hypot(x, y, z) || 1;
            nrm[i * 3] = x / l; nrm[i * 3 + 1] = y / l; nrm[i * 3 + 2] = z / l;
        }
        off += n * 4;
        const ic = header.icount;
        const idx = new Uint32Array(ic);
        if (header.wide) idx.set(new Uint32Array(raw, off, ic));
        else idx.set(new Uint16Array(raw, off, ic));
        return { header, pos, nrm, idx, id: header.model };
    }

    // Kemik adına göre rol
    function boneRole(name) {
        const n = (name || '').toLowerCase();
        if (n.startsWith('door_dside_f')) return { kind: 'door', label: 'Sürücü kapısı', side: -1 };
        if (n.startsWith('door_pside_f')) return { kind: 'door', label: 'Yolcu kapısı', side: 1 };
        if (n.startsWith('door_dside_r')) return { kind: 'door', label: 'Sol arka kapı', side: -1 };
        if (n.startsWith('door_pside_r')) return { kind: 'door', label: 'Sağ arka kapı', side: 1 };
        if (n === 'bonnet') return { kind: 'hood', label: 'Kaput' };
        if (n === 'boot') return { kind: 'boot', label: 'Bagaj' };
        if (n.startsWith('wheel_')) return { kind: 'wheel', label: 'Tekerlek' };
        if (n.startsWith('extra_')) return { kind: 'extra', label: 'Ekstra ' + n.slice(6) };
        return null;
    }

    // Tekerlek kemikleri (araç uzayı konumları)
    function wheels(vd) {
        const out = [];
        vd.header.bones.forEach((b, i) => {
            if (/^wheel_[lr][fmr]$/.test(b.n)) out.push({ i, name: b.n, p: b.t });
        });
        return out;
    }

    // Kemiğin alt ağacındaki tüm kemikler (kendisi dahil)
    function subtree(vd, root) {
        const bones = vd.header.bones;
        const kids = {};
        bones.forEach((b, i) => { (kids[b.p] = kids[b.p] || []).push(i); });
        const out = [], st = [root];
        while (st.length) {
            const i = st.pop();
            out.push(i);
            (kids[i] || []).forEach(k => st.push(k));
        }
        return out;
    }

    // Garaj sınıflandırması (ad + boyut sezgisi)
    const EMERGENCY = /^(police|polic|sheriff|fbi|riot|pbus|ambulance|firetruk|lguard|pranger|polgauntlet|poldominator|poldorado|polgreenwood|polimpaler|polcaracara|polfaction|polterminus|polcoquette|polbuffalo|policeold|policet|polmav|pol)/;
    function category(info) {
        const id = info.id;
        if (EMERGENCY.test(id)) return 'emergency';
        if (info.doors === 0 && info.wid < 1.1) return 'bike';
        if (/(heli|maverick|cargobob|buzzard|annihilator|swift|valkyrie|savage|hunter|frogger|skylift|akula|havok|seasparrow|volatus|supervolito|conada|polmav|sparrow)/.test(id)) return 'air';
        if (/(plane|jet|luxor|shamal|cuban|duster|mammatus|velum|vestra|titan|cargoplane|besra|lazer|hydra|nimbus|miljet|stunt|dodo|tula|mogul|nokota|pyro|rogue|starling|molotok|bombushka|volatol|alkonost|avenger|streamer216|howard|microlight|strikeforce|blimp|seabreeze|alphaz1|raiju|oppressor)/.test(id)) return 'air';
        if (/(boat|dinghy|jetmax|marquis|seashark|speeder|squalo|suntrap|toro|tropic|tug|submersible|kosatka|avisa|patrolboat|longfin|predator)/.test(id)) return 'sea';
        if (info.len > 7 || /(trailer|truck|bus|mule|pounder|phantom|hauler|packer|benson|biff|rubble|mixer|tiptruck|flatbed|dump|handler|forklift|tractor|cutter|bulldozer|airtug|tanker|barracks|apc|rhino|khanjali|scarab|thruster)/.test(id)) return 'heavy';
        if (info.hei > 1.8 || /(sandking|bison|bobcat|rebel|guardian|mesa|ranger|dubsta|baller|granger|landstalker|cavalcade|patriot|seminole|fq2|rocoto|huntley|habanero|bjxl|xls|contender|everon|caracara|yosemite|sadler|kamacho|hellion|vetir)/.test(id)) return 'suv';
        if (/(van|burrito|rumpo|speedo|minivan|youga|pony|boxville|surfer|bison|camper|journey|taco|gburrito|paradise)/.test(id)) return 'van';
        return 'car';
    }

    root.VSVehicle = { load, CLASS, boneRole, wheels, subtree, category };
})(window);
