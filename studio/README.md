# LOE Vehicle Studio

Legends of Empire için bağımsız Windows uygulaması (Electron). GTA V'in 937 vanilla aracını 3B gösterir; kemik
(iskelet) hiyerarşisini, X-ışınını (UV tel kafes), kapı/kaput/bagaj hareketini, parça gizleme/boyama ve livery tasarımını
sunar. **Sirenler** aracı (Damlalık'ın altında): polis / acil durum araçlarının oyundaki LED'lerini (41 araç, kırmızı-mavi) tek tek
listelenir; her LED açılıp kapatılır, boyanır, gerçek yanıp sönme desenleriyle önizlenir. **Kit tak** sekmesiyle oyundaki herhangi bir siren
düzeni (41 araç) başka bir araca (ör. Adder) takılır: tavan / ön / arka LED'ler araç yüzeyine oturur, bölge ve LED konumları ince ayarlanır,
kit projeyle kaydedilir, siren yapılandırması (.json) dışa aktarılır. Oyun/FiveM gerekmez.

## Çalıştırma

`build.py` çıktısı `Masaüstü\LOE Vehicle Studio\LOE Vehicle Studio.exe`. Bu exe, **resmî Electron çalışma zamanının
değiştirilmemiş kopyasıdır** (yalnızca yeniden adlandırılır). Windows **Akıllı Uygulama Denetimi** imzasız/yerel
derlenmiş exe'leri engeller; bilinen resmî Electron özeti engellenmez. Bu yüzden exe'ye ikon/sürüm kaynağı **eklenmez**
(özet değişir, engellenir). Uygulama kodu `resources/app` içinde düz JavaScript'tir.

```bash
python studio/build.py              # Masaüstü\LOE Vehicle Studio (tam paket)
python studio/build.py --app-only   # yalnızca uygulama dosyalarını yenile (hızlı)
```

Önkoşul: `studio/dist/electron` içine Electron win32-x64 zip'i açılmış olmalı
(<https://github.com/electron/electron/releases>), ve `studio/data/vehicles` dolu olmalı (aşağıda).

## Araç verisi (`studio/data/vehicles/*.lvm.gz`) — repoda yok (Rockstar varlığı)

```bash
# 1) Windows, GTA V kurulu PC: tüm araç yft'lerini çıkar (Enhanced exe'si varsa onun anahtarlarıyla)
python -I tools/packbuilder/extract_yft.py "D:/.../Grand Theft Auto V" out/yft_all tools/packbuilder/CodeWalker/CodeWalker.Core/Resources/magic.dat --all
#    Legacy kurulumda taslak (1 KB) kalan Enhanced-özel araçlar için Enhanced klasörüyle ayrıca çıkarıp yft_all içine kopyalayın
# 2) Linux (VPS/WSL): .lvm.gz üret  (Smart App Control yerel derlenmiş dll'leri engellediği için Linux'ta)
vdpack mesh3d --yft yft_all --out m_all --all
# 3) m_all içeriğini studio/data/vehicles/ altına koy
```

## Siren (LED) verisi (`studio/data/sirens.json`) — repoda yok (Rockstar varlığı)

Vanilla araçların siren ayarları oyun arşivlerindeki `carcols.ymt` (PSO) + DLC `carcols.meta` (Sirens: LED başına renk,
yanıp sönme sequencer'ı, dönüş) ve `carvariations` (araç → `sirenSettings`) dosyalarındadır. LED `n` ↔ modeldeki `siren<n>` kemiği.

```bash
# 1) Windows: meta dosyalarını çıkar (düz XML ya da PSO .ymt)
python -I tools/packbuilder/extract_meta.py "D:/.../Grand Theft Auto V Enhanced" tools/packbuilder/out/meta tools/packbuilder/CodeWalker/CodeWalker.Core/Resources/magic.dat
# 2) PSO (.ymt) dosyalarını XML'e çevir — vdpack meta2xml (Linux'ta çalıştır; yerel derleme SAC'a takılır)
vdpack meta2xml carcols.ymt carcols.xml      # carvariations.ymt için de; çıkan .xml'leri out/meta içine koy
# 3) sirens.json üret (araç lvm klasörü verilirse LED'i olan araçları listeler)
python -I tools/packbuilder/build_sirens.py tools/packbuilder/out/meta studio/data/sirens.json studio/data/vehicles
```

## FiveM oyun paketi (siren'li araç)

Dışa aktar sekmesi → **FiveM oyun paketi**: Studio'daki araç + siren kiti, FiveM Enhanced'da çalışacak bir **kopya model** olarak paketlenir
(`govvectre` gibi yeni spawn adı; orijinal araç değişmez). Arkasında `tools/packbuilder/make_siren_vehicle.py` çalışır:

1. Enhanced kurulumundan aracın resmî gen9 `yft`/`_hi.yft`/`ytd` dosyalarını çıkarır,
2. VPS'te (`vdpack sirenveh`, CodeWalker) yft iskeletine kit LED'leri için `siren<n>` kemiklerini ekler (konumlar Studio'daki yerleşim),
3. `carcols.meta` (siren ayarı: oyundaki orijinal polis düzeninden renk / desen / korona), `vehicles.meta`, `carvariations.meta`, `fxmanifest.lua` yazar,
4. çıktıyı `Belgeler\LOE Vehicle Studio\Oyun Paketleri\loe_veh_<ad>` içine koyar; "Sunucuya koy" açıksa sunucuda `resources/[disabled]` altına da yükler (BAŞLATILMAZ).

Sunucuda başlatma (canlı sunucuya dokunmadan önce bir istemciyle test et): `[disabled]` içindeki klasörü `[loe]` altına taşı, txAdmin konsolunda `refresh` + `ensure loe_veh_<ad>`.
Komut satırından: `python -I tools/packbuilder/make_siren_vehicle.py proje.lvs --name govvectre [--deploy]`.
Gereken: `studio/data/sirens.json` + `sirens_raw.json` (`build_sirens.py`), `tools/packbuilder/out/meta` (extract_meta.py + `vdpack meta2xml`), VPS'te `/root/loe_vd_build/linux/vdpack`.

## Sınama

`tools/smoke.sh <png> <senaryo.js>` paketlenmiş uygulamayı açar, senaryoyu sayfada çalıştırır, ekran görüntüsü alır.
`tools/selftest.js` uçtan uca 55+ kontrol yapar (fırça, geri al/yinele, şablonlar, dışa aktarma, proje kaydet/aç, siren LED'leri ve 41 siren'li araç, 12 araç türü).

## Dosyalar

| Yol | İş |
|---|---|
| `main.js`, `preload.js` | Electron kabuğu, `loe://` protokolü, dosya diyalogları, otomatik yedek |
| `web/js/scene3d.js` | three.js sahnesi: araç, kemik grupları, X-ışını, iskelet, aksesuar, seçim |
| `web/js/vehicle.js` | `.lvm.gz` okuyucu, kemik rolleri, sınıflandırma |
| `web/js/layout.js` | Kutu izdüşümlü tuval yerleşimi (oyun içi `shared/layout.lua` ile aynı) |
| `web/js/engine.js` | Katman çizim motoru (şekil, metin, görsel, degrade, desen, raster boya) |
| `web/js/editor2d.js`, `tools.js`, `panels.js`, `main.js` | 2B tuval, araçlar, paneller, dosya/dışa aktarma |
| `web/js/sirens.js` | Sirenler aracı: LED listesi, açma/kapama, renk, yanıp sönme önizlemesi, kit takma (başka araca), siren .json dışa aktarma |
