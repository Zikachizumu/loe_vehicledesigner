"""Oyun arşivlerinden araç meta dosyalarını (carcols*.meta, vehicles.meta, carvariations.meta) çıkarır.
Kullanım:  python -I extract_meta.py "<GTA V klasörü>" <çıktı klasörü> <magic.dat> [--list]
Çıktı: her dosya  <çıktı>/<öncelik>_<arşiv yolu '_' ile>/<ad>  olarak yazılır (ham bayt; XML / RBF / PSO olabilir)."""
import importlib.util, os, re, struct, sys, zlib

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('extract_yft', os.path.join(HERE, 'extract_yft.py'))
X = importlib.util.module_from_spec(spec)
spec.loader.exec_module(X)

WANTED = re.compile(r'^(carcols.*|vehicles|carvariations|vehiclelayouts?|handling)\.meta$|^(carcols|vehicles|carvariations).*\.(ymt|xml)$')


def read_bin(rpf, e):
    """RPF'teki ikili (bin) kaydı çözülmüş bayt olarak döndürür."""
    rpf.f.seek(rpf.start + e['off'] * 512)
    csize = e['size']
    data = rpf.f.read(csize if csize else e['usize'])
    if e['enc']:
        if rpf.enc == X.ENC_AES:
            data = X.aes_ecb_decrypt(data[:len(data) - len(data) % 16], rpf.keys.aes) + data[len(data) - len(data) % 16:]
        elif rpf.enc not in (X.ENC_NONE, X.ENC_OPEN):
            data = rpf.keys.ng_decrypt(data, e['name'], e['usize'])
    if csize:
        data = zlib.decompress(data, -15)
    return data


def read_res(rpf, e):
    """Kaynak (RSC7) kaydı: 16 baytlık başlık + deflate. Çıktı: RSC7 başlığı + deflate (CodeWalker'ın okuyacağı gevşek dosya biçimi)."""
    stored = rpf.read(e)
    ver = (((e['sys'] >> 28) & 0xF) << 4) + ((e['gfx'] >> 28) & 0xF)
    return struct.pack('<4I', 0x37435352, ver, e['sys'], e['gfx']) + stored[16:]


def walk(rpf, out, listing):
    for e in rpf.files():
        n = e['name'].lower()
        if e['kind'] == 'bin' and n.endswith('.rpf'):
            pl = e['path']
            if 'vehicle' in pl or 'patch' in pl or 'data' in pl or 'common' in pl or pl.count('\\') <= 3 or 'levels' in pl:
                try:
                    walk(rpf.child(e), out, listing)
                except Exception as ex:
                    print('  ! ' + e['path'] + ': ' + str(ex))
        elif e['kind'] in ('bin', 'res') and WANTED.match(n):
            try:
                data = read_bin(rpf, e) if e['kind'] == 'bin' else read_res(rpf, e)
            except Exception as ex:
                print('  ! okunamadı ' + e['path'] + ': ' + str(ex))
                continue
            listing.append((e['path'], len(data), data[:4]))
            if out:
                safe = re.sub(r'[^a-z0-9._-]+', '_', e['path'])
                open(os.path.join(out, safe), 'wb').write(data)


def main():
    if len(sys.argv) < 4:
        print(__doc__)
        sys.exit(1)
    gta, out, magic = sys.argv[1], sys.argv[2], sys.argv[3]
    list_only = '--list' in sys.argv
    os.makedirs(out, exist_ok=True)
    exe = 'GTA5_Enhanced.exe' if os.path.isfile(os.path.join(gta, 'GTA5_Enhanced.exe')) else 'GTA5.exe'
    print('Anahtar kaynağı: ' + exe)
    keys = X.Keys(os.path.join(gta, exe), magic)
    tops = []
    for name in sorted(os.listdir(gta)):
        if re.match(r'(x64[a-z]|common)\.rpf$', name):
            tops.append(os.path.join(gta, name))
    for name in ('update/update.rpf', 'update/update2.rpf'):
        p = os.path.join(gta, name)
        if os.path.isfile(p):
            tops.append(p)
    dlc = os.path.join(gta, 'update', 'x64', 'dlcpacks')
    if os.path.isdir(dlc):
        for d in sorted(os.listdir(dlc)):
            pd = os.path.join(dlc, d)
            if os.path.isdir(pd):
                for fn in sorted(os.listdir(pd)):
                    if fn.lower().startswith('dlc') and fn.lower().endswith('.rpf'):
                        tops.append(os.path.join(pd, fn))
    listing = []
    for top in tops:
        rel = os.path.relpath(top, gta).replace('/', '\\')
        f = open(top, 'rb')
        try:
            r = X.Rpf(f, 0, os.path.getsize(top), os.path.basename(top), rel, keys)
            print('tarama: ' + rel, flush=True)
            walk(r, None if list_only else out, listing)
        except Exception as ex:
            print('  ! ' + rel + ': ' + str(ex))
    for p, n, head in listing:
        print('%-110s %9d  %r' % (p, n, head))
    print('toplam', len(listing))


if __name__ == '__main__':
    main()
