# vdpack — yüzey paketi üreticisi

`loe_vehicledesigner` kaplamayı araca basmak için her araç modeline bir **yüzey paketi** ister. Bu araç, oyunun kendi
araç modellerinden paketleri otomatik üretir:

1. Aracın boya geometrisini (`vehicle_paint*` gölgelendiricileri) alır.
2. Yalnızca dışarıdan görünen üçgenleri tutar (ışın testi; iç kapı panelleri, çamurluk içi vb. elenir).
3. Kutu izdüşümüyle UV verir (Üst / Sol / Sağ / Ön / Arka). Formül `shared/layout.lua` ile aynıdır.
4. Geometriyi kemiklere göre böler (gövde, kapılar, kaput, bagaj, tampon...). Her parça oyunda kendi kemiğine bağlanır,
   bu yüzden kapı açılınca kaplama da açılır. `extra_N` parçaları o ekstra kapalıyken gizlenir.
5. Her parça x her slot için bir `.ydr` (gölgelendirici `normal_spec_decal`, 4 mm dışarı itilmiş), slot dokularını
   içeren bir `.ytd`, tüm arketipleri içeren bir `.ytyp`, `surfaces/<model>.json` ve 2B düzenleyici için
   `surfaces/<model>.png` şablonu yazar.

**Slot:** aynı modelde aynı anda ekranda kaç *farklı* tasarım gösterilebileceği. Aynı tasarımı taşıyan araçlar tek slotu
paylaşır (ör. tüm polis araçları aynı kaplamayla tek slot kullanır).

## Kurulum

```bash
git clone --depth 1 https://github.com/dexyfex/CodeWalker tools/packbuilder/CodeWalker
```

.NET 8 SDK gerekir. Windows'ta **Akıllı Uygulama Denetimi (Smart App Control)** açıksa yerelde derlenen imzasız araç
çalıştırılamaz; bu durumda aracı Linux için derleyip sunucuda (ya da WSL'de) çalıştırın:

```bash
dotnet publish tools/packbuilder -c Release -r linux-x64 --self-contained true -o tools/packbuilder/out/linux
```

## 1) Araç modellerini çıkar (Windows, GTA V kurulu bilgisayar)

Ek kütüphane gerekmez. Şifre anahtarları sizin `GTA5.exe` dosyanızdan türetilir, diske yazılmaz.

```bash
python -I tools/packbuilder/extract_yft.py "D:/SteamLibrary/steamapps/common/Grand Theft Auto V" tools/packbuilder/out/yft tools/packbuilder/CodeWalker/CodeWalker.Core/Resources/magic.dat police police2 police4 ambulance
```

Çıktı: `out/yft/<model>.yft`, `<model>_hi.yft`, `sources.json` (hangi arşivden geldiği, bulunamayanlar).

## 2) Paketi üret

```bash
vdpack build --yft out/yft --out out --name loe_vd_pack_emergency --models police,police2,police4,ambulance --slots 4 --preview
vdpack verify out/loe_vd_pack_emergency
```

- `--slots` (varsayılan 4), `--offset` (m, varsayılan 0.004), `--lod` (m, varsayılan 150), `--size` (tuval, 4096)
- `--preview` her model için `out/<paket>_preview/` altına test dokulu önizlemeler çizer (sol, sağ, üst, 3/4).
  Üst = mavi, sol = pembe, sağ = yeşil, ön = sarı, arka = mor; her yüzeyde tuvalin sol kenarı koyu, üst kenarı açık.
- `out/<paket>_report.txt`: model başına parça / üçgen / köşe sayıları.
- `vdpack debugroof <yft klasörü> <model>`: tavan bölgesindeki üçgenlerin kemik ve görünürlük dökümü (teşhis).

## Ekipman paketi (tepe lambaları)

`equip` komutu vanilla polis araçlarının tavan lightbar'ını (siren kemiklerine bağlı lensler + çubuk gövdesi) prop olarak
çıkarır. Her çubuk için kırmızı-mavi, mavi-mavi, kırmızı-kırmızı ve amber türevleri üretilir. Işık noktaları siren
kemiklerinden alınır (sol = 1. grup, sağ = 2. grup). Öğeler `equipment.json` ile kataloğa otomatik eklenir
(`loe_vd_equipment 'equipment.json'`).

```bash
vdpack equip --yft out/yft --out out --name loe_vd_pack_equipment --models police3,police,police2,police5,poldominator10 --labels "Interceptor,Stanier,Buffalo,Stanier LE,Dominator"
```

## 3) Sunucuya koy

`out/<paket>` klasörünü `resources/[loe]/` altına kopyalayın. `ensure [loe]` paketleri başlatır,
`loe_vehicledesigner` paketleri otomatik bulur (tasarımcının sol alt köşesinde "N yüzey paketi yüklendi").

Bir modeli iki pakete koymayın (doku sözlüğü adları çakışır).

## LOE'de üretilen paketler

| Paket | Slot | Modeller |
|---|---|---|
| `loe_vd_pack_emergency` | 4 | police, police2, police3, police4, police5, policet, sheriff, sheriff2, fbi, fbi2, ambulance, firetruk, pranger, riot, riot2, lguard, pbus, policeold1, policeold2, polgauntlet, poldominator10, poldorado, polgreenwood, polimpaler5, polimpaler6, polcaracara, polfaction2, polterminus, polcoquette4, polbuffalo |
| `loe_vd_pack_cars` | 2 | galeri listesi (loe_dealership Config.Vehicles, motosikletler hariç) + gauntlet3, elegy, dominator, aleutian |
| `loe_vd_pack_equipment` | - | 5 tepe lambası (Interceptor, Stanier, Buffalo, Stanier LE, Dominator) x 4 renk |

Yeni araç eklemek için 1. ve 2. adımı yeni model listesiyle çalıştırıp yeni bir paket adı verin
(ör. `loe_vd_pack_cars2`).
