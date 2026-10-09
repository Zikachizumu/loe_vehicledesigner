// LOE Vehicle Studio — uçtan uca otomatik sınama. tools/smoke.sh ile çalıştırılır:  smoke.sh out.png tools/selftest.js
(async () => {
  const res = [];
  try {
    const S = VS.S, sc = VS.scene, E = VDEngine;
    const wait = (ms) => new Promise(r => setTimeout(r, ms));
    const ok = (name, cond, extra) => { res.push((cond ? 'OK   ' : 'HATA ') + name + (extra ? ' — ' + extra : '')); console.log(res[res.length - 1]); };
    const errs = []; window.addEventListener('error', e => errs.push(e.message));
    VS.bridge = null; const saved = {}; VS.saveBlob = async (blob, name) => { saved[name] = blob; return name; };
    const px = (L) => { const c = E.paintCanvas(L); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 10) n++; return n; };

    await VS.loadVehicle('police4'); await wait(700);
    ok('araç yükle', S.veh.id === 'police4' && sc.paintMeshes.length > 3, 'boya mesh=' + sc.paintMeshes.length);
    ok('tekerlek', sc.wheelMeshes.length === 4);
    ok('kapı/kaput', sc.movables.length >= 6, sc.movables.length + ' parça');

    // 3B fırça darbesi (gerçek işaretçi olayları)
    const el = sc.renderer.domElement, r = el.getBoundingClientRect();
    VS.tools.set('brush'); S.brush.color = '#00e5ff'; S.brush.size = 150;
    let hit = null;
    for (let fy = 0.3; fy < 0.85 && !hit; fy += 0.04) for (let fx = 0.15; fx < 0.85 && !hit; fx += 0.04) { const x = r.left + r.width * fx, y = r.top + r.height * fy, h = sc.pick(x, y, true); if (h && h.chart) hit = { x, y }; }
    ok('araç üzerinde nokta bulundu', !!hit);
    const ev = (t, x, y, b) => el.dispatchEvent(new PointerEvent(t, { clientX: x, clientY: y, button: 0, buttons: b, pointerId: 5, bubbles: true, cancelable: true }));
    const stroke = async (k) => { ev('pointerdown', hit.x, hit.y, 1); for (let i = 1; i <= 10; i++) ev('pointermove', hit.x + i * 5 * k, hit.y + i * 2 * k, 1); ev('pointerup', hit.x + 50 * k, hit.y + 20 * k, 0); await wait(300); };
    await stroke(1);
    const pl = S.design.layers.find(l => l.type === 'paint'); ok('boya katmanı oluştu', !!pl);
    const n1 = px(pl); ok('fırça piksel boyadı', n1 > 1000, n1 + ' piksel');
    VS.undo(); await wait(100); const n2 = px(pl); ok('geri al (boya darbesi)', n2 === 0, n2 + ' piksel');
    VS.redo(); await wait(100); const n3 = px(pl); ok('yinele (boya darbesi)', n3 === n1, n3 + ' piksel');

    // şablon + katman işlemleri
    VS.tools.applyTemplate(VS.TEMPLATES[0]); await wait(300);
    ok('şablon katmanları', S.design.layers.length > 10, S.design.layers.length + ' katman');
    const t0 = S.design.layers.length; VS.removeLayer(S.design.layers[S.design.layers.length - 1].id); ok('katman sil', S.design.layers.length === t0 - 1);
    VS.undo(); ok('katman silmeyi geri al', S.design.layers.length === t0);

    // şerit / numara / desen / degrade / fill
    S.tool = 'stripes'; VS.tools.applyStripes();
    S.tool = 'racenum'; S.race.num = '88'; VS.tools.place(S.charts[0].rect[0] + 600, S.charts[0].rect[1] + 300, 'top');
    S.tool = 'pattern'; VS.tools.place(0, 0, 'rear'); S.tool = 'gradient'; VS.tools.place(0, 0, 'front'); S.tool = 'fill'; S.fill.mode = 'chart'; VS.tools.place(0, 0, 'right');
    ok('şerit/numara/desen/degrade/fill', S.design.layers.length > t0 + 5, S.design.layers.length + ' katman');
    await wait(300);

    // şablon sonrası yeni boya darbesi (proje geri yükleme sınaması için)
    VS.tools.set('brush'); await stroke(1.2);
    const nPaint = px(S.design.layers.find(l => l.type === 'paint')); ok('ikinci boya darbesi', nPaint > 500, nPaint + ' piksel');

    // modifiye / iskelet
    S.mod.body = '#c4161c'; S.mod.finish = 'metallic'; S.mod.tint = 5; S.mod.neon = { on: true, color: '#00e5ff' }; VS.applyMod();
    ok('modifiye uygulandı', sc.paintMat.color.getHexString() === new THREE.Color('#c4161c').getHexString());
    VS.setSkeleton(true); VS.setXray(true); await wait(200); VS.setXray(false); VS.setSkeleton(false);
    const bi = sc.vd.header.bones.findIndex(b => b.n === 'door_dside_f'); VS.selectBone(bi); ok('kemik seç', S.selBone === bi);
    sc.setBoneVisible(bi, false, true); ok('kemik gizle', sc.hidden.has(bi)); sc.setBoneVisible(bi, true, true);
    sc.setBoneColor(bi, '#ffd34d'); ok('parça boyası', !!sc.boneColors[bi]); S.mod.parts[bi] = '#ffd34d';
    sc.setOpen(bi, 1); S.mod.open[bi] = 1; ok('kapı aç', Math.abs(sc.boneGroups[bi].rotation.z) > 0.5);
    // aksesuarlar
    S.propType = 'lightbar'; VS.addPropAtSpot('roof'); S.propType = 'beacon'; VS.addPropAtSpot('hood'); S.propType = 'bullbar'; VS.addPropAtSpot('front'); S.propType = 'antenna'; VS.addPropAtSpot('trunk');
    ok('aksesuar eklendi', S.mod.props.length === 4 && sc.propObjs.size === 4, S.mod.props.length + ' adet');
    sc.setPropTest(true); await wait(300); sc.setPropTest(false);
    VS.undo(); ok('aksesuarı geri al', S.mod.props.length === 3 && sc.propObjs.size === 3); VS.redo(); ok('aksesuarı yinele', S.mod.props.length === 4 && sc.propObjs.size === 4);
    VS.flushNow(); await wait(500);

    // dışa aktarma
    await VS.exportDesignPng(false); const b1 = Object.values(saved)[0];
    ok('tasarım PNG', b1 && b1.size > 5000, b1 && b1.size + ' bayt');
    await VS.exportDesignPng(true); ok('şablon PNG', Object.keys(saved).some(k => k.includes('sablon')));
    await VS.exportCharts(); ok('5 yüzey PNG', Object.keys(saved).filter(k => /_(top|left|right|front|rear)\.png$/.test(k)).length === 5, Object.keys(saved).length + ' dosya');
    await VS.exportObj(); const obj = Object.keys(saved).find(k => k.endsWith('.obj')); ok('OBJ', obj && saved[obj].size > 100000, obj && saved[obj].size + ' bayt');
    await VS.exportRender(); ok('3B PNG', Object.keys(saved).some(k => k.includes('render')));

    // proje döngüsü
    const proj = JSON.stringify(VS.project(true)); ok('proje serileştir', proj.length > 1000, Math.round(proj.length / 1024) + ' KB');
    const nl = S.design.layers.length, body = S.mod.body;
    S.dirty = false; await VS.newProject(); await VS.loadDesign(VS.newDesign()); ok('yeni proje boş', S.design.layers.length === 0);
    await VS.loadProjectText(proj); await wait(500);
    ok('proje geri yüklendi', S.design.layers.length === nl && S.mod.body === body && S.mod.open[bi] === 1 && S.mod.props.length === 4 && sc.propObjs.size === 4, S.design.layers.length + '/' + nl);
    const pl2 = S.design.layers.find(l => l.type === 'paint'); ok('boya katmanı geri yüklendi', pl2 && px(pl2) === nPaint, pl2 && (px(pl2) + '/' + nPaint));
    ok('kapı durumu geri yüklendi', Math.abs(sc.boneGroups[bi].rotation.z) > 0.5);

    // sirenler (LED) — Damlalık altındaki "Sirenler" aracı
    await VS.loadVehicle('police4'); await wait(500);
    VS.tools.set('sirens'); await wait(300);
    ok('siren verisi', !!VS.sirenDB && Object.keys(VS.sirenDB.veh).length >= 30, VS.sirenDB && (Object.keys(VS.sirenDB.veh).length + ' araç'));
    ok('Sirenler aracı Damlalığın altında', (() => { const l = VS.tools.list.filter(x => x !== 'sep').map(x => x.id); return l.indexOf('sirens') === l.indexOf('picker') + 1; })());
    const nS = sc.sirens.length;
    ok('police4 LED sayısı', nS === 16, nS + ' LED');
    ok('siren paneli satırları', document.querySelectorAll('#opts .sir-row').length === nS);
    const n0 = sc.sirens[0].n;
    document.querySelector('#opts .sir-row .pw').click(); await wait(100);
    ok('LED kapat', S.mod.sirens.off[n0] === true && sc.sirens[0].k === 0);
    VS.undo(); await wait(100); ok('LED kapatmayı geri al', !S.mod.sirens.off[n0] && sc.sirens[0].off === false);
    const sl = sc.sirens.find(s => s.lens);
    S.mod.sirens.col[n0] = '#00ff66'; S.mod.sirens.col[sl.n] = '#00ff66'; VS.applySirens(); VS.commit(); await wait(100);
    ok('LED rengi (sprite + cam)', sc.sirens[0].color.getHexString() === new THREE.Color('#00ff66').getHexString() && sl.lens.emissive.getHexString() === sl.color.getHexString(), sc.sirens.filter(s => s.lens).length + ' camlı LED');
    VS.selectSiren(sc.sirens[2].n, true); await wait(150); ok('LED seç', S.siren.sel === sc.sirens[2].n && !!sc.sirenRing && sc.sirenRing.visible);
    const sp = sc.sirens[2].sprite.getWorldPosition(new THREE.Vector3()).project(sc.camera), rc = sc.renderer.domElement.getBoundingClientRect();
    ok('3B LED seçimi (en yakın)', sc.nearestSiren(rc.left + (sp.x * 0.5 + 0.5) * rc.width, rc.top + (-sp.y * 0.5 + 0.5) * rc.height, 20) === sc.sirens[2].n);
    S.siren.play = true; VS.syncSirenMode(); const ks = new Set(), tk0 = performance.now(); for (let i = 0; i < 60; i++) { await wait(45); sc.updateSirens(); ks.add(sc.sirens.map(s => s.k.toFixed(1)).join('')); }
    ok('yanıp sönme deseni değişiyor', ks.size > 2, ks.size + ' farklı durum, ' + Math.round(performance.now() - tk0) + ' ms, play=' + sc.sirenPlay + ' kapalı=' + sc.sirens.filter(s => s.off).length);
    S.siren.play = false; VS.syncSirenMode();
    const projS = JSON.stringify(VS.project(false)); ok('proje siren ayarını içeriyor', projS.includes('"sirens"') && projS.includes('#00ff66'));
    S.dirty = false; await VS.loadProjectText(projS); await wait(500);
    ok('siren ayarı geri yüklendi', S.mod.sirens.col[n0] === '#00ff66' && sc.sirens.length === nS && sc.sirens[0].color.getHexString() === new THREE.Color('#00ff66').getHexString());
    const bad = [], tot = [];
    for (const id of Object.keys(VS.sirenDB.veh)) {
        if (!S.vmap[id]) continue;
        await VS.loadVehicle(id); tot.push(id);
        if (!sc.sirens.length) bad.push(id + ':LED yok');
        else if (!sc.sirens.every(s => s.sprite.parent === sc.boneGroups[s.bone])) bad.push(id + ':bağlantı');
    }
    ok('tüm siren araçları yüklendi', !bad.length && tot.length >= 30, tot.length + ' araç ' + bad.join(','));
    VS.tools.set('select');

    // siren kiti: başka araca (Adder) tak
    S.mod.sirens = { off: {}, col: {} }; await VS.loadVehicle('adder'); await wait(500);
    VS.tools.set('sirens'); S.siren.kitSrc = 'police4'; S.siren.tab = 'kit'; VS.tools.renderOpts(); await wait(150);
    ok('Adder\'da yerel LED yok', sc.sirens.length === 0 && !S.mod.sirenKit);
    document.querySelector('#opts .btn.pri').click(); await wait(500);
    const kit = S.mod.sirenKit, bbA = sc.bbox;
    ok('kit takıldı (16 LED)', kit && kit.leds.length === 16 && sc.sirens.length === 16 && sc.sirens.every(s => s.kit), kit && kit.leds.length + ' LED');
    ok('kit LED\'leri araç sınırlarında', kit.leds.every(r => r.p[0] > bbA.min[0] - 0.3 && r.p[0] < bbA.max[0] + 0.3 && r.p[1] > bbA.min[1] - 0.3 && r.p[1] < bbA.max[1] + 0.3 && r.p[2] > bbA.min[2] && r.p[2] < bbA.max[2] + 0.3));
    const roofZ = kit.leds.filter(r => r.zone === 'roof').map(r => r.p[2]);
    ok('tavan LED\'leri tavanın üstünde', roofZ.length >= 4 && Math.min(...roofZ) > bbA.min[2] + 0.6 * (bbA.max[2] - bbA.min[2]), roofZ.length + ' tavan LED, z>=' + Math.min(...roofZ).toFixed(2));
    ok('kit gövdesi oluştu', !!sc.kitHousing && !!sc.kitHousing.roof);
    const rs = sc.sirens.find(s => s.zone === 'roof'), y0 = rs.sprite.position.y;
    kit.zo.roof[1] = 0.1; VS.applySirens(); ok('bölge kaydırma (Y +0.1)', Math.abs(rs.sprite.position.y - y0 - 0.1) < 1e-4);
    kit.lo[rs.n] = [0.05, 0, 0]; VS.applySirens(); ok('LED kaydırma (X +0.05)', Math.abs(rs.mesh.position.x - (rs.rec.p[0] + 0.05)) < 1e-4);
    S.mod.sirens.col[rs.n] = '#00ff66'; VS.applySirens(); ok('kit LED rengi', rs.lens.emissive.getHexString() === new THREE.Color('#00ff66').getHexString());
    VS.selectSiren(rs.n, false); ok('kit LED seç', !!sc.sirenRing && sc.sirenRing.visible && sc.sirenRing.position.distanceTo(rs.sprite.position) < 1e-6);
    const kp = rs.sprite.getWorldPosition(new THREE.Vector3()).project(sc.camera), rk = sc.renderer.domElement.getBoundingClientRect();
    ok('3B kit LED seçimi', sc.nearestSiren(rk.left + (kp.x * 0.5 + 0.5) * rk.width, rk.top + (-kp.y * 0.5 + 0.5) * rk.height, 22) === rs.n);
    VS.commit();
    const projK = JSON.stringify(VS.project(false)); ok('proje kit içeriyor', projK.includes('"sirenKit"') && projK.includes('"zo"'));
    S.dirty = false; await VS.loadProjectText(projK); await wait(500);
    ok('kit proje ile geri yüklendi', S.veh.id === 'adder' && S.mod.sirenKit && sc.sirens.length === 16 && Math.abs(sc.sirens.find(s => s.n === rs.n).sprite.position.y - y0 - 0.1) < 1e-4);
    S.tab = 'export'; VS.renderTabs(); VS.renderPanel(); await wait(100);
    const gpCard = Array.from(document.querySelectorAll('.card')).find(c => c.textContent.includes('FiveM oyun paketi'));
    ok('FiveM oyun paketi kartı', !!gpCard && gpCard.querySelector('.inp').value === 'govadder' && !gpCard.querySelector('.btn.pri').disabled && !gpCard.textContent.includes('null'), gpCard && gpCard.querySelector('.inp').value);
    S.tab = 'layers'; VS.renderTabs(); VS.renderPanel();
    S.siren.play = true; VS.syncSirenMode(); const kk = new Set(); for (let i = 0; i < 30; i++) { await wait(45); sc.updateSirens(); kk.add(sc.sirens.map(s => s.k.toFixed(1)).join('')); }
    ok('kit LED\'leri yanıp sönüyor', kk.size > 2, kk.size + ' durum'); S.siren.play = false; VS.syncSirenMode();
    const saved0 = Object.keys(saved).length; await VS.exportSirens(); const sj = Object.keys(saved).find(k => k.endsWith('_sirenler.json'));
    ok('siren yapılandırması (.json)', !!sj && Object.keys(saved).length > saved0, sj);
    if (sj) { const jj = JSON.parse(await saved[sj].text()); ok('json içeriği', jj.type === 'siren-config' && jj.kit && jj.kit.leds.length === 16 && jj.kit.leds[0].position.length === 3, jj.vehicle + ' / ' + jj.kit.leds.length); }
    const nb = S.mod.sirenKit.leds.length; S.siren.tab = 'led'; VS.selectSiren(S.mod.sirenKit.leds[0].n, false); await wait(100);
    const delBtn = Array.from(document.querySelectorAll('#opts .sir-edit .btn.dan')).pop(); if (delBtn) { delBtn.click(); await wait(200); }
    ok('kit LED sil', S.mod.sirenKit && S.mod.sirenKit.leds.length === nb - 1 && sc.sirens.length === nb - 1, (S.mod.sirenKit && S.mod.sirenKit.leds.length) + '/' + nb);
    VS.undo(); await wait(200); ok('LED silmeyi geri al', S.mod.sirenKit && S.mod.sirenKit.leds.length === nb && sc.sirens.length === nb);
    await VS.loadVehicle('jester'); await wait(400); ok('araç değişince kit sıfırlanır', !S.mod.sirenKit && sc.sirens.length === 0);
    S.siren.kitSrc = 'police'; S.siren.zones = { roof: true, front: false, rear: false }; S.siren.tab = 'kit'; VS.tools.renderOpts(); document.querySelector('#opts .btn.pri').click(); await wait(400);
    ok('yalnız tavan bölgesi tak', S.mod.sirenKit && S.mod.sirenKit.leds.every(r => r.zone === 'roof') && sc.sirens.length > 5, sc.sirens.length + ' LED');
    S.siren.zones = { roof: true, front: true, rear: true }; VS.tools.set('select');

    // farklı araç türleri
    const kinds = ['akuma', 'maverick', 'luxor', 'dinghy', 'hauler', 'rhino', 'firetruk', 'bus', 'arbitergt', 'jester', 'alpha', 'astron2'];
    for (const id of kinds) { const o = await VS.loadVehicle(id); ok('araç ' + id, o && sc.meshes.length > 0 && sc.paintMeshes.length >= 0); }
    await VS.loadVehicle('jester'); VS.tools.applyTemplate(VS.TEMPLATES[5]); await wait(600);
    await loe.shot('final');
    ok('JS hatası yok', errs.length === 0, errs.join('|'));
  } catch (e) { res.push('ISTISNA ' + e.stack); }
  return res.join('\n');
})()
