#!/usr/bin/env python3
"""LOE Vehicle Studio'yu çalıştırılabilir klasör olarak paketler (Windows x64).

    python build.py [--out <klasör>] [--app-only] [--no-data]

* dist/electron  : resmî Electron win32-x64 sürümü (imzası/özeti bozulmasın diye electron.exe DEĞİŞTİRİLMEZ, yalnızca yeniden adlandırılır)
* resources/app  : bu klasörün main.js, preload.js, package.json, web/ ve data/ dosyaları
--app-only: yalnızca resources/app güncellenir (hızlı).
"""
import os, shutil, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ELECTRON = os.path.join(HERE, 'dist', 'electron')
NAME = 'LOE Vehicle Studio'
args = sys.argv[1:]
out = os.path.join(os.path.expanduser('~'), 'Desktop', NAME)
if '--out' in args:
    out = os.path.abspath(args[args.index('--out') + 1])
app_only = '--app-only' in args
no_data = '--no-data' in args

if not os.path.isfile(os.path.join(ELECTRON, 'electron.exe')):
    sys.exit('dist/electron yok — Electron win32-x64 zip dosyasını dist/electron içine açın')

os.makedirs(out, exist_ok=True)
if not app_only:
    print('Electron çalışma zamanı kopyalanıyor')
    for fn in os.listdir(ELECTRON):
        src = os.path.join(ELECTRON, fn)
        if fn == 'electron.exe':
            shutil.copy2(src, os.path.join(out, NAME + '.exe'))
        elif fn == 'locales':
            dst = os.path.join(out, 'locales'); os.makedirs(dst, exist_ok=True)
            for l in os.listdir(src):
                if l in ('en-US.pak', 'tr.pak'):
                    shutil.copy2(os.path.join(src, l), os.path.join(dst, l))
        elif fn == 'resources':
            dst = os.path.join(out, 'resources'); os.makedirs(dst, exist_ok=True)
            for r in os.listdir(src):
                if r == 'app':
                    continue
                p = os.path.join(src, r)
                (shutil.copytree(p, os.path.join(dst, r), dirs_exist_ok=True) if os.path.isdir(p) else shutil.copy2(p, os.path.join(dst, r)))
        elif os.path.isdir(src):
            shutil.copytree(src, os.path.join(out, fn), dirs_exist_ok=True)
        else:
            shutil.copy2(src, os.path.join(out, fn))

app = os.path.join(out, 'resources', 'app')
print('Uygulama dosyaları kopyalanıyor')
shutil.rmtree(os.path.join(app, 'web'), ignore_errors=True)
os.makedirs(app, exist_ok=True)
for f in ('main.js', 'preload.js', 'package.json'):
    shutil.copy2(os.path.join(HERE, f), os.path.join(app, f))
shutil.copytree(os.path.join(HERE, 'web'), os.path.join(app, 'web'))
if not no_data:
    dd = os.path.join(app, 'data', 'vehicles')
    src = os.path.join(HERE, 'data', 'vehicles')
    if os.path.isdir(src):
        os.makedirs(dd, exist_ok=True)
        n = 0
        for f in os.listdir(src):
            d = os.path.join(dd, f)
            s = os.path.join(src, f)
            if not os.path.isfile(d) or os.path.getsize(d) != os.path.getsize(s):
                shutil.copy2(s, d); n += 1
        print('araç verisi:', len(os.listdir(dd)), 'dosya (', n, 'güncellendi )')
    else:
        print('UYARI: data/vehicles yok')

open(os.path.join(out, 'OKU.txt'), 'w', encoding='utf-8').write(
"""LOE VEHICLE STUDIO  —  Legends of Empire Roleplay
=================================================

Başlatmak için:  "LOE Vehicle Studio.exe"  (ya da masaüstündeki kısayol)

* 937 vanilla GTA V aracını 3B görüntüler; iskelet (kemik) hiyerarşisini gösterir.
* Garaj sekmesinden araç seç. İSKELET sekmesinde kemikleri aç/kapat, kapı-kaput-bagaj aç, parçayı gizle ya da ayrı boya.
* MODİFİYE sekmesi: gövde boyası, cam filmi, jant, neon, ekstralar.
* Araçlar (soldaki çubuk): fırça, silgi, parmak, bulanık, görsel, metin, şekil, doldur, degrade, şerit, numara, desen, şablon, damlalık.
* Dışa aktar: tasarım PNG (4096), UV şablonu, yüzey başına PNG, OBJ, 3B görüntü; proje dosyası (.lvs).
* Projeler varsayılan olarak  Belgeler\LOE Vehicle Studio  klasörüne kaydedilir. Çalışma 20 sn'de bir otomatik yedeklenir.

Oyun dosyaları: araç modelleri sahibinin kendi GTA V kurulumundan üretilmiştir; bu klasörü paylaşmayın.
Sorun olursa F12 ile geliştirici konsolu açılır.
""")
print('tamam ->', out)
