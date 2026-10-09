#!/usr/bin/env python3
"""GTA V arşivlerinden (RPF7) araç modellerini (.yft / _hi.yft) çıkarır.

Ek kütüphane gerekmez. Şifre anahtarları kullanıcının kendi GTA5.exe dosyasından türetilir
(CodeWalker ile aynı yöntem: SHA1 arama + magic.dat). Anahtarlar diske yazılmaz.

Kullanım:
    python extract_yft.py <GTA V klasörü> <çıktı klasörü> <magic.dat> model1 model2 ...
    python extract_yft.py <GTA V klasörü> <çıktı klasörü> <magic.dat> --all [--list]
        --all : vehicles.rpf içindeki TÜM araç modellerini (yalnızca <model>.yft) çıkarır
        --list: dosya yazmadan model listesini basar

Çıktı: <çıktı>/<model>.yft, <çıktı>/<model>_hi.yft (varsa) ve sources.json.
"""
import hashlib
import json
import re
import os
import struct
import sys
import zlib

# ============================================================== AES-256 (yalnızca ECB çözme)
_SBOX = [0] * 256
_INV = [0] * 256


def _init_sbox():
    p = q = 1
    while True:
        p = p ^ ((p << 1) & 0xFF) ^ (0x1B if p & 0x80 else 0)
        q ^= q << 1
        q ^= q << 2
        q ^= q << 4
        q &= 0xFF
        if q & 0x80:
            q ^= 0x09
        x = q ^ ((q << 1) | (q >> 7)) ^ ((q << 2) | (q >> 6)) ^ ((q << 3) | (q >> 5)) ^ ((q << 4) | (q >> 4))
        x = (x ^ 0x63) & 0xFF
        _SBOX[p] = x
        _INV[x] = p
        if p == 1:
            break
    _SBOX[0] = 0x63
    _INV[0x63] = 0


_init_sbox()


def _xt(a):
    return ((a << 1) ^ 0x1B) & 0xFF if a & 0x80 else a << 1


def _gmul(a, b):
    r = 0
    while b:
        if b & 1:
            r ^= a
        a = _xt(a)
        b >>= 1
    return r


_M9 = [_gmul(i, 9) for i in range(256)]
_M11 = [_gmul(i, 11) for i in range(256)]
_M13 = [_gmul(i, 13) for i in range(256)]
_M14 = [_gmul(i, 14) for i in range(256)]


def _expand(key):
    nk, nr = 8, 14
    w = [list(key[4 * i:4 * i + 4]) for i in range(nk)]
    rcon = 1
    for i in range(nk, 4 * (nr + 1)):
        t = list(w[i - 1])
        if i % nk == 0:
            t = t[1:] + t[:1]
            t = [_SBOX[b] for b in t]
            t[0] ^= rcon
            rcon = _xt(rcon)
        elif i % nk == 4:
            t = [_SBOX[b] for b in t]
        w.append([w[i - nk][j] ^ t[j] for j in range(4)])
    return [sum(w[4 * r:4 * r + 4], []) for r in range(nr + 1)]


def _dec_block(s, rk):
    s = [s[i] ^ rk[14][i] for i in range(16)]
    for r in range(13, -1, -1):
        # InvShiftRows (sütun düzeninde: s[c*4 + r])
        s = [s[0], s[13], s[10], s[7], s[4], s[1], s[14], s[11], s[8], s[5], s[2], s[15], s[12], s[9], s[6], s[3]]
        s = [_INV[b] for b in s]
        s = [s[i] ^ rk[r][i] for i in range(16)]
        if r > 0:
            o = []
            for c in range(4):
                a0, a1, a2, a3 = s[4 * c:4 * c + 4]
                o += [_M14[a0] ^ _M11[a1] ^ _M13[a2] ^ _M9[a3],
                      _M9[a0] ^ _M14[a1] ^ _M11[a2] ^ _M13[a3],
                      _M13[a0] ^ _M9[a1] ^ _M14[a2] ^ _M11[a3],
                      _M11[a0] ^ _M13[a1] ^ _M9[a2] ^ _M14[a3]]
            s = o
    return s


def aes_ecb_decrypt(data, key):
    rk = _expand(key)
    out = bytearray(data)
    n = len(data) - len(data) % 16
    for i in range(0, n, 16):
        out[i:i + 16] = bytes(_dec_block(list(data[i:i + 16]), rk))
    return bytes(out)


def _aes_selftest():
    key = bytes(range(32))
    ct = bytes.fromhex('8ea2b7ca516745bfeafc49904b496089')
    pt = aes_ecb_decrypt(ct, key)
    assert pt == bytes.fromhex('00112233445566778899aabbccddeeff'), 'AES self-test failed'


# ============================================================== .NET System.Random (tohumlu, eski algoritma)
def _i32(x):
    return ((x + 0x80000000) & 0xFFFFFFFF) - 0x80000000


class NetRandom:
    """.NET'in tohumlu System.Random algoritması (32-bit işaretli taşma dahil)."""
    MBIG = 2147483647
    MSEED = 161803398

    def __init__(self, seed):
        sa = [0] * 56
        sub = 2147483647 if seed == -2147483648 else abs(seed)
        mj = _i32(self.MSEED - sub)
        sa[55] = mj
        mk = 1
        for i in range(1, 55):
            ii = (21 * i) % 55
            sa[ii] = mk
            mk = _i32(mj - mk)
            if mk < 0:
                mk = _i32(mk + self.MBIG)
            mj = sa[ii]
        for _ in range(1, 5):
            for i in range(1, 56):
                sa[i] = _i32(sa[i] - sa[1 + (i + 30) % 55])
                if sa[i] < 0:
                    sa[i] = _i32(sa[i] + self.MBIG)
        self.sa, self.inext, self.inextp = sa, 0, 21

    def sample(self):
        self.inext += 1
        if self.inext >= 56:
            self.inext = 1
        self.inextp += 1
        if self.inextp >= 56:
            self.inextp = 1
        r = _i32(self.sa[self.inext] - self.sa[self.inextp])
        if r == self.MBIG:
            r -= 1
        if r < 0:
            r = _i32(r + self.MBIG)
        self.sa[self.inext] = r
        return r

    def next_bytes(self, n):
        return bytes(self.sample() & 0xFF for _ in range(n))


def jenk_bytes(data):
    h = 0
    for b in data:
        h = (h + b) & 0xFFFFFFFF
        h = (h + (h << 10)) & 0xFFFFFFFF
        h ^= h >> 6
    h = (h + (h << 3)) & 0xFFFFFFFF
    h ^= h >> 11
    h = (h + (h << 15)) & 0xFFFFFFFF
    return h


# ============================================================== anahtarlar
AES_KEY_SHA1 = bytes([0xA0, 0x79, 0x61, 0x28, 0xA7, 0x75, 0x72, 0x0A, 0xC2, 0x04, 0xD9, 0x81, 0x9F, 0x68, 0xC1, 0x72, 0xE3, 0x95, 0x2C, 0x6D])


class Keys:
    def __init__(self, exe_path, magic_path):
        _aes_selftest()
        exe = open(exe_path, 'rb').read()
        self.aes = None
        sha1 = hashlib.sha1
        mv = memoryview(exe)
        for pos in range(0, len(exe) - 32, 8):
            if sha1(mv[pos:pos + 32]).digest() == AES_KEY_SHA1:
                self.aes = bytes(mv[pos:pos + 32])
                break
        if not self.aes:
            raise SystemExit('GTA5.exe içinde AES anahtarı bulunamadı')
        m = open(magic_path, 'rb').read()
        seed = jenk_bytes(self.aes)
        if seed >= 0x80000000:
            seed -= 0x100000000
        rnd = NetRandom(seed)
        rbs = [rnd.next_bytes(len(m)) for _ in range(4)]
        db = bytes((m[i] - rbs[0][i] - rbs[1][i] - rbs[2][i] - rbs[3][i]) & 0xFF for i in range(len(m)))
        db = aes_ecb_decrypt(db, self.aes)
        b = zlib.decompress(db, -15)
        p = 0
        ng = b[p:p + 27472]; p += 27472
        tb = b[p:p + 278528]; p += 278528
        self.lut = b[p:p + 256]
        self.ng_keys = [ng[i * 272:(i + 1) * 272] for i in range(101)]
        # 17 tur x 16 tablo x 256 uint32
        vals = struct.unpack('<%dI' % (278528 // 4), tb)
        self.tables = [[list(vals[(r * 16 + t) * 256:(r * 16 + t + 1) * 256]) for t in range(16)] for r in range(17)]

    def gta_hash(self, text):
        r = 0
        for ch in text:
            t = (1025 * ((self.lut[ord(ch)] + r) & 0xFFFFFFFF)) & 0xFFFFFFFF
            r = ((t >> 6) ^ t) & 0xFFFFFFFF
        a = (9 * r) & 0xFFFFFFFF
        return (32769 * ((a >> 11) ^ a)) & 0xFFFFFFFF

    def ng_decrypt(self, data, name, length):
        key = self.ng_keys[((self.gta_hash(name) + length + 61) & 0xFFFFFFFF) % 101]
        k = struct.unpack('<68I', key)
        T = self.tables
        out = bytearray(data)
        n = len(data) - len(data) % 16
        for off in range(0, n, 16):
            d = data[off:off + 16]
            for rnd in range(17):
                t = T[rnd]
                k0, k1, k2, k3 = k[4 * rnd:4 * rnd + 4]
                if rnd in (0, 1, 16):
                    x1 = t[0][d[0]] ^ t[1][d[1]] ^ t[2][d[2]] ^ t[3][d[3]] ^ k0
                    x2 = t[4][d[4]] ^ t[5][d[5]] ^ t[6][d[6]] ^ t[7][d[7]] ^ k1
                    x3 = t[8][d[8]] ^ t[9][d[9]] ^ t[10][d[10]] ^ t[11][d[11]] ^ k2
                    x4 = t[12][d[12]] ^ t[13][d[13]] ^ t[14][d[14]] ^ t[15][d[15]] ^ k3
                else:
                    x1 = t[0][d[0]] ^ t[7][d[7]] ^ t[10][d[10]] ^ t[13][d[13]] ^ k0
                    x2 = t[1][d[1]] ^ t[4][d[4]] ^ t[11][d[11]] ^ t[14][d[14]] ^ k1
                    x3 = t[2][d[2]] ^ t[5][d[5]] ^ t[8][d[8]] ^ t[15][d[15]] ^ k2
                    x4 = t[3][d[3]] ^ t[6][d[6]] ^ t[9][d[9]] ^ t[12][d[12]] ^ k3
                d = struct.pack('<4I', x1, x2, x3, x4)
            out[off:off + 16] = d
        return bytes(out)


# ============================================================== RPF7
ENC_NONE, ENC_OPEN, ENC_AES, ENC_NG = 0, 0x4E45504F, 0x0FFFFFF9, 0x0FEFFFFF


class Rpf:
    def __init__(self, f, start, size, name, path, keys):
        self.f, self.start, self.size, self.name, self.path, self.keys = f, start, size, name, path, keys
        f.seek(start)
        ver, count, nlen, enc = struct.unpack('<4I', f.read(16))
        self.enc = enc
        if ver != 0x52504637:
            raise ValueError('RPF7 değil: ' + path)
        ent = f.read(count * 16)
        names = f.read(nlen)
        if enc == ENC_AES:
            ent = aes_ecb_decrypt(ent, keys.aes)
            names = aes_ecb_decrypt(names, keys.aes)
        elif enc not in (ENC_NONE, ENC_OPEN):
            ent = keys.ng_decrypt(ent, name, size)
            names = keys.ng_decrypt(names, name, size)
        self.entries = []
        for i in range(count):
            raw = ent[i * 16:(i + 1) * 16]
            h1, h2 = struct.unpack_from('<II', raw, 0)
            if h2 == 0x7FFFFF00:
                no, _, ei, ec = struct.unpack('<4I', raw)
                e = {'kind': 'dir', 'name_off': no, 'ei': ei, 'ec': ec}
            elif (h2 & 0x80000000) == 0:
                buf = struct.unpack_from('<Q', raw, 0)[0]
                usize, encf = struct.unpack_from('<II', raw, 8)
                e = {'kind': 'bin', 'name_off': buf & 0xFFFF, 'size': (buf >> 16) & 0xFFFFFF,
                     'off': (buf >> 40) & 0xFFFFFF, 'usize': usize, 'enc': encf}
            else:
                no = struct.unpack_from('<H', raw, 0)[0]
                b1 = raw[2:5]
                b2 = raw[5:8]
                size = b1[0] | (b1[1] << 8) | (b1[2] << 16)
                off = (b2[0] | (b2[1] << 8) | (b2[2] << 16)) & 0x7FFFFF
                sysf, gfxf = struct.unpack_from('<II', raw, 8)
                e = {'kind': 'res', 'name_off': no, 'size': size, 'off': off, 'sys': sysf, 'gfx': gfxf}
                if size == 0xFFFFFF:
                    f.seek(start + off * 512)
                    hb = f.read(16)
                    e['size'] = hb[7] | (hb[14] << 8) | (hb[5] << 16) | (hb[2] << 24)
            end = names.index(b'\0', e['name_off'])
            e['name'] = names[e['name_off']:end].decode('utf-8', 'replace')
            self.entries.append(e)
        # yolları kur
        self.entries[0]['path'] = path.lower()
        stack = [0]
        while stack:
            di = stack.pop()
            d = self.entries[di]
            for i in range(d['ei'], d['ei'] + d['ec']):
                c = self.entries[i]
                c['path'] = d['path'] + '\\' + c['name'].lower()
                if c['kind'] == 'dir':
                    stack.append(i)

    def files(self):
        return [e for e in self.entries if e['kind'] != 'dir']

    def child(self, e):
        size = e['size'] if e['size'] else e['usize']
        return Rpf(self.f, self.start + e['off'] * 512, size, e['name'], e['path'], self.keys)

    def read(self, e):
        self.f.seek(self.start + e['off'] * 512)
        return self.f.read(e['size'] if e['size'] else e['usize'])


def priority(path):
    p = path.lower()
    if p.startswith('update\\update') and '\\patch\\' in p:
        return 5
    if 'patchday' in p or 'dlcpatch' in p or 'mppatches' in p:
        return 4
    if p.startswith('update\\'):
        return 3
    if 'dlcpacks' in p:
        return 2
    return 1


def is_vehicle_yft(n, path):
    if not n.endswith('.yft') or n.endswith('_hi.yft') or '_lod' in n or '_slod' in n:
        return False
    return 'vehicles.rpf' in path or '\\levels\\gta5\\vehicles\\' in path


def scan(gta, keys, wanted):
    found = {}
    tops = []
    # araçlar x64e dışındaki ana arşivlerde de bulunabilir (ör. klasik araçlar)
    base = sorted(f for f in os.listdir(gta) if re.match(r'x64[a-z]\.rpf$', f)) + ['update/update.rpf', 'update/update2.rpf']
    for name in base:
        p = os.path.join(gta, name)
        if os.path.isfile(p):
            tops.append(p)
    dlc = os.path.join(gta, 'update', 'x64', 'dlcpacks')
    if os.path.isdir(dlc):
        for d in sorted(os.listdir(dlc)):
            pd = os.path.join(dlc, d)
            if not os.path.isdir(pd):
                continue
            for fn in sorted(os.listdir(pd)):
                if fn.lower().startswith('dlc') and fn.lower().endswith('.rpf'):
                    tops.append(os.path.join(pd, fn))

    def walk(rpf):
        for e in rpf.files():
            n = e['name'].lower()
            if e['kind'] == 'bin' and n.endswith('.rpf'):
                pl = e['path']
                # yalnızca araç içerebilecek iç arşivler
                if 'vehicle' in pl or 'patch' in pl or pl.count('\\') <= 3 or 'levels' in pl:
                    try:
                        walk(rpf.child(e))
                    except Exception as ex:
                        print('  ! ' + e['path'] + ': ' + str(ex))
            elif e['kind'] == 'res' and (n in wanted if wanted is not None else is_vehicle_yft(n, e['path'])):
                pr = priority(e['path'])
                cur = found.get(n)
                if not cur or pr > cur[0] or (pr == cur[0] and e['path'] > cur[1]):
                    found[n] = (pr, e['path'], rpf, e)

    for top in tops:
        rel = os.path.relpath(top, gta).replace('/', '\\')
        f = open(top, 'rb')
        try:
            r = Rpf(f, 0, os.path.getsize(top), os.path.basename(top), rel, keys)
            walk(r)
        except Exception as ex:
            print('  ! ' + rel + ': ' + str(ex))
    return found


def main():
    if len(sys.argv) < 5:
        print(__doc__)
        sys.exit(1)
    gta, out, magic = sys.argv[1], sys.argv[2], sys.argv[3]
    rest = sys.argv[4:]
    all_mode = '--all' in rest
    list_only = '--list' in rest
    models = [m.lower() for m in rest if not m.startswith('--')]
    os.makedirs(out, exist_ok=True)
    print('Anahtarlar türetiliyor...')
    exe = 'GTA5_Enhanced.exe' if os.path.isfile(os.path.join(gta, 'GTA5_Enhanced.exe')) else 'GTA5.exe'
    print('Anahtar kaynağı: ' + exe)
    keys = Keys(os.path.join(gta, exe), magic)
    if all_mode:
        wanted = None
    else:
        wanted = set()
        for m in models:
            wanted.add(m + '.yft')
            wanted.add(m + '_hi.yft')
    print('Arşivler taranıyor...')
    found = scan(gta, keys, wanted)
    if list_only:
        for n in sorted(found):
            print(n[:-4], found[n][1])
        print('toplam', len(found))
        return
    sources = {}
    for n, (pr, path, rpf, e) in sorted(found.items()):
        if all_mode and os.path.isfile(os.path.join(out, n)):
            sources[n] = path
            continue
        stored = rpf.read(e)
        # Arşivde: 16 baytlık kayıt başlığı + deflate verisi. Gevşek dosya: RSC7 başlığı + deflate verisi.
        body = stored[16:]
        try:
            zlib.decompress(body, -15)
        except zlib.error as ex:
            print('  ! açılamadı: %s (%s)' % (path, ex))
            continue
        ver = (((e['sys'] >> 28) & 0xF) << 4) + ((e['gfx'] >> 28) & 0xF)
        data = struct.pack('<4I', 0x37435352, ver, e['sys'], e['gfx']) + body
        open(os.path.join(out, n), 'wb').write(data)
        sources[n] = path
        print('  %-28s %8d  %s' % (n, len(data), path))
    missing = [m for m in models if (m + '.yft') not in found] if not all_mode else []
    json.dump({'sources': sources, 'missing': missing}, open(os.path.join(out, 'sources.json'), 'w'), indent=1)
    if missing:
        print('Bulunamadı: ' + ', '.join(missing))


if __name__ == '__main__':
    main()
