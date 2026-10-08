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

    // farklı araç türleri
    const kinds = ['akuma', 'maverick', 'luxor', 'dinghy', 'hauler', 'rhino', 'firetruk', 'bus', 'arbitergt', 'jester', 'alpha', 'astron2'];
    for (const id of kinds) { const o = await VS.loadVehicle(id); ok('araç ' + id, o && sc.meshes.length > 0 && sc.paintMeshes.length >= 0); }
    await VS.loadVehicle('jester'); VS.tools.applyTemplate(VS.TEMPLATES[5]); await wait(600);
    await loe.shot('final');
    ok('JS hatası yok', errs.length === 0, errs.join('|'));
  } catch (e) { res.push('ISTISNA ' + e.stack); }
  return res.join('\n');
})()
