"""Siren (LED) verisini üretir:  carcols*.meta/.xml  (Sirens)  +  carvariations*.meta/.xml  (araç -> sirenSettings)
Girdi : extract_meta.py çıktısı (XML'e çevrilmiş ymt dosyaları dahil)   Çıktı: studio/data/sirens.json
Kullanım: python -I build_sirens.py <meta klasörü> <çıktı sirens.json> [<araç lvm klasörü>]
  - her siren seti: ad, BPM ve LED listesi (n = 'siren<n>' kemik numarası; renk, yanıp sönme deseni, dönüş, korona)
  - araç lvm klasörü verilirse yalnızca kemiği bulunan LED'ler sayılır (istatistik için)"""
import glob, gzip, json, os, re, struct, sys
import xml.etree.ElementTree as ET


def prio(path):
    p = os.path.basename(path).lower()
    if p.startswith('x64a'):
        return 0
    if 'dlcpacks' in p or p.startswith('x64w'):
        return 1
    if p.startswith('update_x64_data'):
        return 2
    if 'dlc_patch' in p:
        return 3
    return 2


def load(path):
    raw = open(path, 'rb').read()
    if raw.startswith(b'\xef\xbb\xbf'):
        raw = raw[3:]
    try:
        return ET.fromstring(raw)
    except ET.ParseError:
        return None


def val(el, tag, default=None):
    c = el.find(tag)
    return c.get('value') if c is not None and c.get('value') is not None else default


def u32(s):
    v = int(float(s))
    return v & 0xFFFFFFFF


def hexcol(s):
    v = int(s, 16) if isinstance(s, str) else int(s)
    return '#%02x%02x%02x' % ((v >> 16) & 255, (v >> 8) & 255, v & 255)


def led(k, it):
    fl, ro, co = it.find('flashiness'), it.find('rotation'), it.find('corona')
    o = {'n': k + 1, 'c': hexcol(val(it, 'color', '0xFFFFFFFF'))}
    if val(it, 'flash') == 'true':
        o['f'] = 1
        o['q'] = u32(val(fl, 'sequencer', '0')) if fl is not None else 0
    if val(it, 'rotate') == 'true':
        o['r'] = 1
        o['a'] = round(float(val(ro, 'start', '0')), 3)
        o['s'] = round(float(val(ro, 'speed', '1')), 3)
        o['d'] = 1 if val(ro, 'direction') == 'true' else 0
    if co is not None:
        o['z'] = round(float(val(co, 'size', '1')), 2)
        o['i'] = round(float(val(co, 'intensity', '1')), 2)
    o['g'] = int(val(it, 'lightGroup', '0'))
    if val(it, 'light') == 'true':
        o['l'] = 1
    return o


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)
    src, out = sys.argv[1], sys.argv[2]
    lvm = sys.argv[3] if len(sys.argv) > 3 else None
    files = sorted(glob.glob(os.path.join(src, '*')), key=lambda p: (prio(p), p))
    sets, veh, dup = {}, {}, 0
    for p in files:
        n = os.path.basename(p).lower()
        if not (n.endswith('.meta') or n.endswith('.xml')):
            continue
        if 'carcols' in n:
            r = load(p)
            if r is None:
                continue
            sx = r.find('Sirens')
            if sx is None:
                continue
            for it in sx.findall('Item'):
                sid = val(it, 'id')
                sir = it.find('sirens')
                if sid is None or sir is None:
                    continue
                s = {'n': (it.findtext('name') or '').strip(), 'b': float(val(it, 'sequencerBpm', '200')), 't': float(val(it, 'timeMultiplier', '1')),
                     'L': [led(k, x) for k, x in enumerate(sir.findall('Item'))]}
                if sid in sets and json.dumps(sets[sid], sort_keys=True) != json.dumps(s, sort_keys=True):
                    dup += 1
                sets[sid] = s
        elif 'carvariations' in n:
            r = load(p)
            if r is None:
                continue
            for it in r.iter('Item'):
                mn = it.find('modelName')
                if mn is None or not mn.text:
                    continue
                sid = val(it, 'sirenSettings')
                if sid and sid != '0':
                    veh[mn.text.strip().lower()] = sid
    used = {sid for sid in veh.values()}
    missing = sorted(s for s in used if s not in sets)
    sets = {k: v for k, v in sets.items() if k in used and v['L']}
    veh = {m: s for m, s in veh.items() if s in sets}
    kits = {}
    if lvm:
        tot = 0
        rows = []
        for m, sid in sorted(veh.items()):
            f = os.path.join(lvm, m + '.lvm.gz')
            if not os.path.isfile(f):
                continue
            raw = gzip.open(f).read()
            hl = struct.unpack('<I', raw[4:8])[0]
            hd = json.loads(raw[8:8 + hl])
            pos = {b['n']: b['t'] for b in hd['bones']}
            pm = {}
            for l in sets[sid]['L']:
                q = pos.get('siren%d' % l['n'])
                if q:
                    pm[str(l['n'])] = [round(q[0], 4), round(q[1], 4), round(q[2], 4)]
            if pm:
                bb = hd['bbox']
                kits[m] = {'s': sid, 'bb': [bb['min'], bb['max']], 'p': pm}
                tot += 1
                rows.append((m, sets[sid]['n'], len(pm)))
        print('modelde siren kemiği bulunan araç:', tot)
        for m, nm, n in rows:
            if re.match(r'(police|polic|sheriff|fbi|riot|pol|pranger|lguard|ambulance|firetruk)', m):
                print('  %-14s %-26s %2d LED' % (m, nm, n))
    json.dump({'v': 2, 'sets': sets, 'veh': veh, 'kits': kits}, open(out, 'w', encoding='utf-8'), separators=(',', ':'), ensure_ascii=False)
    print('siren seti: %d  araç: %d  kit: %d  çakışan id: %d  eksik set: %s  -> %s (%d bayt)' % (len(sets), len(veh), len(kits), dup, missing, out, os.path.getsize(out)))


if __name__ == '__main__':
    main()
