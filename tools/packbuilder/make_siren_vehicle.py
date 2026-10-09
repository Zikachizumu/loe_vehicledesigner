"""LOE Vehicle Studio projesinden (.lvs) FiveM (Enhanced / gen9) siren'li araç kaynağı üretir.

  python -I make_siren_vehicle.py <proje.lvs> --name govvectre [--res loe_veh_govvectre] [--out klasör] [--deploy]

Üretilen kaynak (yeni model adı = --name; orijinal araç değişmez):
  stream_enhanced/<ad>.yft, <ad>_hi.yft   Enhanced'ın resmî gen9 yft'si + siren<n> kemikleri (Studio'daki kit LED konumlarında)
  stream_enhanced/<ad>.ytd, <ad>+hi.ytd   resmî gen9 doku sözlüğü (aynen kopya)
  data/vehicles.meta                      aracın vanilla girdisi, yeni model adıyla (handling / kit / ses orijinalle aynı)
  data/carvariations.meta                 renk setleri + yeni siren ayarı
  data/carcols.meta                       siren ayarı: LED başına renk, yanıp sönme deseni, dönüş, korona (oyundaki orijinal polis düzeninden)
  fxmanifest.lua

Gerekenler: Enhanced kurulumu (anahtar + arşiv), tools/packbuilder/out/meta (extract_meta.py çıktısı; yoksa otomatik çıkarılır),
studio/data/{sirens.json,sirens_raw.json} (build_sirens.py), VPS'te vdpack (Linux) — yft kemik ekleme CodeWalker ile orada yapılır
(Smart App Control yerel derlenmiş exe'leri engeller). Sunucuya ancak --deploy ile ve yalnızca [disabled] klasörüne konur."""
import argparse, gzip, importlib.util, json, os, re, shutil, struct, subprocess, sys, zlib
import xml.etree.ElementTree as ET

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
META = os.path.join(HERE, 'out', 'meta')
MAGIC = os.path.join(HERE, 'CodeWalker', 'CodeWalker.Core', 'Resources', 'magic.dat')
REMOTE = '/root/loe_vd_build'
SERVER_RES = '/opt/fivem/txData/LegendsofEmpire_AC516C.base/resources'


def load_mod(name, file):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, file))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def die(msg):
    print('HATA: ' + msg)
    sys.exit(2)


def sh(cmd, **kw):
    r = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8', errors='replace', **kw)
    if r.returncode != 0:
        die('komut başarısız: %s\n%s%s' % (' '.join(cmd[:4]), r.stdout, r.stderr))
    return r.stdout


# ------------------------------------------------------------------ oyun dosyaları
def extract_game_files(gta, model, out):
    X = load_mod('extract_yft', 'extract_yft.py')
    exe = 'GTA5_Enhanced.exe' if os.path.isfile(os.path.join(gta, 'GTA5_Enhanced.exe')) else 'GTA5.exe'
    keys = X.Keys(os.path.join(gta, exe), MAGIC)
    names = [model + '.yft', model + '_hi.yft', model + '.ytd', model + '+hi.ytd']
    found = X.scan(gta, keys, set(names))
    os.makedirs(out, exist_ok=True)
    got = {}
    for n, (pr, path, rpf, e) in found.items():
        stored = rpf.read(e)
        body = stored[16:]
        zlib.decompress(body, -15)
        ver = (((e['sys'] >> 28) & 0xF) << 4) + ((e['gfx'] >> 28) & 0xF)
        data = struct.pack('<4I', 0x37435352, ver, e['sys'], e['gfx']) + body
        open(os.path.join(out, n), 'wb').write(data)
        got[n] = (ver, path, len(data))
        print('  %-20s v%-3d %8d  %s' % (n, ver, len(data), path))
    return got


# ------------------------------------------------------------------ meta okuma
def prio(path):
    p = os.path.basename(path).lower()
    if p.startswith('x64a'):
        return 0
    if 'dlcpacks' in p or p.startswith('x64w'):
        return 1
    if 'dlc_patch' in p:
        return 3
    return 2


def meta_files(kind):
    fs = [os.path.join(META, f) for f in os.listdir(META) if kind in f.lower() and (f.lower().endswith('.meta') or f.lower().endswith('.xml'))]
    return sorted(fs, key=lambda p: (prio(p), os.path.basename(p)))


def parse(path):
    raw = open(path, 'rb').read()
    if raw.startswith(b'\xef\xbb\xbf'):
        raw = raw[3:]
    try:
        return ET.fromstring(raw)
    except ET.ParseError:
        return None


def find_vehicle(model):
    """vehicles.meta içinde modelin girdisi + txd ebeveyni (en yüksek öncelikli dosya)"""
    best = None
    for f in meta_files('vehicles.meta'):
        r = parse(f)
        if r is None:
            continue
        for it in r.findall('./InitDatas/Item'):
            if (it.findtext('modelName') or '').strip().lower() == model:
                parent = None
                for rel in r.findall('./txdRelationships/Item'):
                    if (rel.findtext('child') or '').strip().lower() == model:
                        parent = (rel.findtext('parent') or '').strip()
                best = (it, parent, os.path.basename(f))
    return best


def find_variation(model):
    best = None
    for f in meta_files('carvariations'):
        r = parse(f)
        if r is None:
            continue
        for it in r.iter('Item'):
            mn = it.find('modelName')
            if mn is not None and (mn.text or '').strip().lower() == model:
                best = (it, os.path.basename(f))
    return best


def ints(txt):
    return [int(float(x)) for x in (txt or '').split()]


def variation_native(it, name, siren_id):
    """vanilla (PSO'dan çevrilmiş) ya da DLC girdisini oyunun yerel .meta biçiminde yeniden yazar"""
    L = []
    L.append('    <Item>')
    L.append('      <modelName>%s</modelName>' % name)
    L.append('      <colors>')
    for c in it.findall('./colors/Item'):
        idx = ints(c.findtext('indices'))
        L.append('        <Item>')
        L.append('          <indices content="char_array">')
        for v in idx:
            L.append('            %d' % v)
        L.append('          </indices>')
        L.append('          <liveries>')
        lv = c.find('liveries')
        kids = lv.findall('Item') if lv is not None else []
        vals = [('true' if (k.get('value') or 'false').lower() in ('true', '1') else 'false') for k in kids] if kids else [('true' if v else 'false') for v in ints(lv.text if lv is not None else '')]
        for v in vals or ['false'] * 8:
            L.append('            <Item value="%s" />' % v)
        L.append('          </liveries>')
        L.append('        </Item>')
    L.append('      </colors>')
    L.append('      <kits>')
    for k in it.findall('./kits/Item'):
        L.append('        <Item>%s</Item>' % (k.text or '').strip())
    L.append('      </kits>')
    L.append('      <windowsWithExposedEdges />')
    L.append('      <plateProbabilities>')
    L.append('        <Probabilities>')
    pp = it.findall('./plateProbabilities/Probabilities/Item')
    for p in pp:
        L.append('          <Item>')
        L.append('            <Name>%s</Name>' % (p.findtext('Name') or '').strip())
        L.append('            <Value value="%s" />' % (p.find('Value').get('value') if p.find('Value') is not None else '100'))
        L.append('          </Item>')
    L.append('        </Probabilities>')
    L.append('      </plateProbabilities>')
    ls = it.find('lightSettings')
    L.append('      <lightSettings value="%s" />' % (ls.get('value') if ls is not None else '0'))
    L.append('      <sirenSettings value="%d" />' % siren_id)
    L.append('    </Item>')
    return '\n'.join(L)


def clean(el):
    """CodeWalker XML'indeki itemType / content özniteliklerini temizle"""
    for e in el.iter():
        for a in ('itemType', 'content'):
            if a in e.attrib:
                del e.attrib[a]
    return el


def seq_unsigned(el):
    for e in el.iter('sequencer'):
        try:
            e.set('value', str(int(float(e.get('value'))) & 0xFFFFFFFF))
        except (TypeError, ValueError):
            pass


def argb(hexcol):
    return '0xFF' + hexcol.lstrip('#').upper()


def build_siren_item(sid, name, header_raw, items):
    """header_raw: kaynak siren seti (ham XML); items: [ET.Element | None]  (sırayla siren1..N)"""
    h = clean(ET.fromstring(header_raw))
    root = ET.Element('Item')
    ET.SubElement(root, 'id').set('value', str(sid))
    ET.SubElement(root, 'name').text = name
    for ch in list(h):
        if ch.tag in ('id', 'name', 'sirens'):
            continue
        root.append(ch)
    sirens = ET.SubElement(root, 'sirens')
    for i, it in enumerate(items):
        if it is None:
            it = ET.fromstring('<Item><rotation><delta value="0"/><start value="0"/><speed value="0"/><sequencer value="0"/><multiples value="1"/><direction value="false"/><syncToBpm value="false"/></rotation>'
                               '<flashiness><delta value="0"/><start value="0"/><speed value="0"/><sequencer value="0"/><multiples value="1"/><direction value="false"/><syncToBpm value="false"/></flashiness>'
                               '<corona><intensity value="0"/><size value="0"/><pull value="0"/><faceCamera value="false"/></corona><color value="0xFF000000"/><intensity value="0"/><lightGroup value="0"/>'
                               '<rotate value="false"/><scale value="false"/><scaleFactor value="0"/><flash value="false"/><light value="false"/><spotLight value="false"/><castShadows value="false"/></Item>')
        sirens.append(it)
    seq_unsigned(root)
    return root


def set_value(it, path, value):
    e = it.find(path)
    if e is not None:
        e.set('value', str(value))


def led_off(it):
    set_value(it, 'intensity', 0)
    set_value(it, 'corona/intensity', 0)
    set_value(it, 'light', 'false')
    set_value(it, 'spotLight', 'false')


# ------------------------------------------------------------------ ana akış
def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('project')
    ap.add_argument('--name', required=True, help='yeni model (spawn) adı, örn. govvectre')
    ap.add_argument('--res', help='kaynak klasör adı (varsayılan loe_veh_<ad>)')
    ap.add_argument('--out', default=os.path.join(HERE, 'out', 'gamepack'))
    ap.add_argument('--enhanced', default='D:/SteamLibrary/steamapps/common/Grand Theft Auto V Enhanced')
    ap.add_argument('--vps', default='fivem-vps')
    ap.add_argument('--deploy', action='store_true', help="kaynağı sunucuda resources/[disabled] altına koy (başlatılmaz)")
    a = ap.parse_args()

    name = a.name.lower()
    if not re.fullmatch(r'[a-z][a-z0-9]{2,18}', name):
        die('--name 3-19 karakter, küçük harf/rakam olmalı')
    res = a.res or ('loe_veh_' + name)
    proj = json.load(open(a.project, encoding='utf-8'))
    if proj.get('app') != 'loe-vehicle-studio':
        die('LOE Vehicle Studio projesi (.lvs) değil')
    veh = (proj.get('vehicle') or '').lower()
    mod = proj.get('mod') or {}
    kit = mod.get('sirenKit') or {'leds': []}
    st = mod.get('sirens') or {}
    st_off, st_col = st.get('off') or {}, st.get('col') or {}
    if not veh:
        die('projede araç yok')

    db = json.load(open(os.path.join(ROOT, 'studio', 'data', 'sirens.json'), encoding='utf-8'))
    rawsets = json.load(open(os.path.join(ROOT, 'studio', 'data', 'sirens_raw.json'), encoding='utf-8'))
    nat_sid = db['veh'].get(veh)
    nat_set = db['sets'].get(nat_sid) if nat_sid else None
    kit_leds = kit.get('leds') or []
    changed_native = bool(nat_set and (any(st_off.get(str(l['n'])) for l in nat_set['L']) or any(str(l['n']) in st_col for l in nat_set['L'])))
    if not kit_leds and not changed_native:
        die('projede kit LED\'i ya da değiştirilmiş yerel LED yok — önce Studio\'da Sirenler > Kit tak ile LED ekle')

    # --- aracın kemikleri (Studio verisinden)
    f = os.path.join(ROOT, 'studio', 'data', 'vehicles', veh + '.lvm.gz')
    raw = gzip.open(f).read()
    hdr = json.loads(raw[8:8 + struct.unpack('<I', raw[4:8])[0]])
    bone_names = {b['n'] for b in hdr['bones']}

    # --- siren slotları: slot k  <->  siren<k+1> kemiği
    items = []         # ET.Element
    if nat_set:
        header_raw = rawsets[nat_sid]
        nat_items = clean(ET.fromstring(header_raw)).find('sirens').findall('Item')
        for k, it in enumerate(nat_items):
            n = k + 1
            if 'siren%d' % n in bone_names:
                if st_col.get(str(n)):
                    set_value(it, 'color', argb(st_col[str(n)]))
                if st_off.get(str(n)):
                    led_off(it)
            items.append(it)
    else:
        first_src = kit_leds[0]['src']
        header_raw = rawsets[db['kits'][first_src]['s']]

    new_bones = []
    for rec in kit_leds:
        k = next((k for k in range(20) if 'siren%d' % (k + 1) not in bone_names and 'siren%d' % (k + 1) not in {b[0] for b in new_bones}), None)
        if k is None:
            die('en fazla 20 siren LED\'i olabilir (siren1..siren20)')
        ks = db['kits'][rec['src']]
        src_items = clean(ET.fromstring(rawsets[ks['s']])).find('sirens').findall('Item')
        it = src_items[rec['sn'] - 1]
        col = st_col.get(str(rec['n'])) or rec['led']['c']
        set_value(it, 'color', argb(col))
        if st_off.get(str(rec['n'])):
            led_off(it)
        while len(items) <= k:
            items.append(None)
        items[k] = it
        zo = (kit.get('zo') or {}).get(rec['zone']) or [0, 0, 0]
        lo = (kit.get('lo') or {}).get(str(rec['n'])) or [0, 0, 0]
        pos = [round(rec['p'][i] + zo[i] + lo[i], 4) for i in range(3)]
        new_bones.append(('siren%d' % (k + 1), k + 1, pos))
    print('model: %s -> %s | yerel LED: %d | kit LED: %d | toplam siren öğesi: %d' % (veh, name, len([1 for n in range(1, 21) if 'siren%d' % n in bone_names]), len(kit_leds), len(items)))
    if len(items) > 20:
        die('siren öğesi 20\'yi aşıyor')

    # --- vehicles.meta / carvariations
    if not os.path.isdir(META) or not os.listdir(META):
        print('meta çıkarılıyor (extract_meta.py)…')
        sh([sys.executable, '-I', os.path.join(HERE, 'extract_meta.py'), a.enhanced, META, MAGIC])
        die('meta dosyaları çıkarıldı fakat PSO .ymt\'ler XML\'e çevrilmeli (vdpack meta2xml) — README\'ye bak')
    vi = find_vehicle(veh)
    if not vi:
        die('vehicles.meta içinde %s bulunamadı' % veh)
    vit, vparent, vsrc = vi
    var = find_variation(veh)
    if not var:
        die('carvariations içinde %s bulunamadı' % veh)
    print('vehicles.meta: %s | carvariations: %s | txd ebeveyni: %s' % (vsrc, var[1], vparent))

    sid = 6000 + (zlib.crc32(name.encode()) % 3000)
    nat_name = nat_set['n'] if nat_set else ''
    siren_el = build_siren_item(sid, 'LOE ' + name, header_raw, items)

    # --- oyun dosyaları
    work = os.path.join(a.out, '_work_' + name)
    shutil.rmtree(work, ignore_errors=True)
    os.makedirs(work)
    print('oyun dosyaları çıkarılıyor (%s)…' % os.path.basename(a.enhanced))
    got = extract_game_files(a.enhanced, veh, os.path.join(work, 'in'))
    if veh + '.yft' not in got:
        die('%s.yft Enhanced arşivlerinde bulunamadı' % veh)
    for n, (ver, p, sz) in got.items():
        if n.endswith('.yft') and ver != 171:
            die('%s gen9 değil (v%d) — Enhanced kurulumunu kullan' % (n, ver))
        if n.endswith('.ytd') and ver != 5:
            die('%s gen9 değil (v%d)' % (n, ver))

    # --- VPS: kemik ekleme
    cfg = {'leds': [{'n': n, 'x': p[0], 'y': p[1], 'z': p[2]} for (_, n, p) in new_bones]}
    json.dump(cfg, open(os.path.join(work, 'cfg.json'), 'w'))
    rdir = '%s/gamepack/%s' % (REMOTE, name)
    sh(['ssh', a.vps, 'rm -rf %s && mkdir -p %s/in %s/out' % (rdir, rdir, rdir, )])
    for n in got:
        if n.endswith('.yft'):
            sh(['scp', '-q', os.path.join('in', n), '%s:%s/in/' % (a.vps, rdir)], cwd=work)
    sh(['scp', '-q', 'cfg.json', '%s:%s/' % (a.vps, rdir)], cwd=work)
    for n in got:
        if n.endswith('.yft'):
            out_n = n.replace(veh, name, 1)
            if new_bones:
                print(sh(['ssh', a.vps, '%s/linux/vdpack sirenveh --yft %s/in/%s --json %s/cfg.json --out %s/out/%s' % (REMOTE, rdir, n, rdir, rdir, out_n)]).strip())
            else:
                sh(['ssh', a.vps, 'cp %s/in/%s %s/out/%s' % (rdir, n, rdir, out_n)])
    os.makedirs(os.path.join(work, 'out'), exist_ok=True)
    sh(['scp', '-q', '%s:%s/out/*' % (a.vps, rdir), 'out/'], cwd=work)
    for n in got:
        if n.endswith('.ytd'):
            shutil.copy2(os.path.join(work, 'in', n), os.path.join(work, 'out', n.replace(veh, name, 1)))
    # doğrulama: yeni kemikler yft'de gerçekten var mı
    for n in sorted(os.listdir(os.path.join(work, 'out'))):
        if n.endswith('.yft'):
            o = sh(['ssh', a.vps, '%s/linux/vdpack bones %s/out/%s siren' % (REMOTE, rdir, n)])
            have = {m for m in re.findall(r'\bsiren(\d+)\b', o)}
            want = {str(n_) for (_, n_, _) in new_bones}
            miss = want - have
            if miss:
                die('%s içinde siren kemikleri eksik: %s' % (n, sorted(miss)))
            print('  doğrulandı: %s (%d yeni siren kemiği)' % (n, len(want)))

    # --- kaynak klasörü
    rdst = os.path.join(a.out, res)
    shutil.rmtree(rdst, ignore_errors=True)
    os.makedirs(os.path.join(rdst, 'stream_enhanced'))
    os.makedirs(os.path.join(rdst, 'data'))
    for n in os.listdir(os.path.join(work, 'out')):
        shutil.copy2(os.path.join(work, 'out', n), os.path.join(rdst, 'stream_enhanced', n))

    # vehicles.meta
    it = clean(ET.fromstring(ET.tostring(vit)))
    it.find('modelName').text = name
    it.find('txdName').text = name
    ah = it.find('audioNameHash')
    if ah is not None and not (ah.text or '').strip():
        ah.text = veh
    ET.indent(it, space='  ', level=2)
    veh_xml = ('<?xml version="1.0" encoding="UTF-8"?>\n<CVehicleModelInfo__InitDataList>\n  <residentTxd>vehshare</residentTxd>\n  <residentAnims />\n  <InitDatas>\n    '
               + ET.tostring(it, encoding='unicode').strip() + '\n  </InitDatas>\n  <txdRelationships>\n    <Item>\n      <parent>%s</parent>\n      <child>%s</child>\n    </Item>\n  </txdRelationships>\n</CVehicleModelInfo__InitDataList>\n' % (vparent or 'vehshare', name))
    open(os.path.join(rdst, 'data', 'vehicles.meta'), 'w', encoding='utf-8').write(veh_xml)

    open(os.path.join(rdst, 'data', 'carvariations.meta'), 'w', encoding='utf-8').write(
        '<?xml version="1.0" encoding="UTF-8"?>\n<CVehicleModelInfoVariation>\n  <variationData>\n' + variation_native(var[0], name, sid) + '\n  </variationData>\n</CVehicleModelInfoVariation>\n')

    ET.indent(siren_el, space='  ', level=2)
    open(os.path.join(rdst, 'data', 'carcols.meta'), 'w', encoding='utf-8').write(
        '<?xml version="1.0" encoding="UTF-8"?>\n<CVehicleModelInfoVarGlobal>\n  <Kits />\n  <Lights />\n  <Sirens>\n    ' + ET.tostring(siren_el, encoding='unicode').strip() + '\n  </Sirens>\n</CVehicleModelInfoVarGlobal>\n')

    open(os.path.join(rdst, 'fxmanifest.lua'), 'w', encoding='utf-8').write(
        "-- LOE Vehicle Studio: %s kopyası (%s) + siren kiti  — otomatik üretildi (make_siren_vehicle.py)\n"
        "fx_version 'cerulean'\ngame 'gta5'\n\nauthor 'Legends of Empire'\ndescription 'Sirenli %s (%s)'\n\n"
        "files {\n    'data/vehicles.meta',\n    'data/carvariations.meta',\n    'data/carcols.meta',\n}\n\n"
        "data_file 'VEHICLE_METADATA_FILE' 'data/vehicles.meta'\ndata_file 'VEHICLE_VARIATION_FILE' 'data/carvariations.meta'\ndata_file 'CARCOLS_FILE' 'data/carcols.meta'\n" % (veh, name, veh, name))
    open(os.path.join(rdst, 'OKU.txt'), 'w', encoding='utf-8').write(
        "%s  —  %s kopyası, siren kitli\n\nSpawn adı: %s   (siren id %d, %d LED)\nBaşlatma: txAdmin canlı konsol  ->  refresh   sonra   ensure %s\nTest: önce tek istemciyle gir, /car %s ile çıkar, siren tuşunu dene.\nOrijinal %s etkilenmez.\n"
        % (res, veh, name, sid, len(items), res, name, veh))
    shutil.rmtree(work, ignore_errors=True)
    print('\nkaynak hazır:', rdst)
    for root, _, fs in os.walk(rdst):
        for fn in fs:
            p = os.path.join(root, fn)
            print('  %-48s %9d' % (os.path.relpath(p, rdst), os.path.getsize(p)))

    if a.deploy:
        dest = '%s/[disabled]/%s' % (SERVER_RES, res)
        tmp = '/root/loe_vd_build/gamepack/%s_deploy' % name
        sh(['ssh', a.vps, 'rm -rf %s && mkdir -p %s' % (tmp, tmp)])
        sh(['scp', '-q', '-r', rdst, '%s:%s/' % (a.vps, tmp)])
        sh(['ssh', a.vps, 'test ! -e "%s" || mv "%s" "%s.bak_$(date +%%Y%%m%%d%%H%%M%%S)"; mv %s/%s "%s" && chown -R fivem:fivem "%s" && ls -la "%s"' % (dest, dest, dest, tmp, res, dest, dest, dest)])
        print('sunucuya konuldu (başlatılmaz):', dest)


if __name__ == '__main__':
    main()
