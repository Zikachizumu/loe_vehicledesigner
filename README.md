# loe_vehicledesigner

Legends of Empire için **araç tasarımcısı**: araca metin, şekil, görsel ve yapay zekâ görselleriyle kaplama (livery) tasarla, siren/ışık ekipmanı yerleştir, boya/cam/neon/ekstra ayarla. Kaydedilen tasarımı ya yalnızca o araç (plaka) ya da o modeldeki tüm araçlar gösterir. Qbox (`qbx_core`) öncelikli; QBCore ve ESX de desteklenir.

## Özellikler

| Araç çubuğu | Ne yapar |
|---|---|
| **Görünüm** | Seçili katmanın stili (renk, görsel renklendirme) |
| **Metin** | Metin, font, B/I/U/S, yazı boyutu, harf aralığı, satır aralığı, hizalama, renk |
| **Şekiller** | 20 hazır şekil (kare, daire, yıldız, ok, şerit ok, şimşek, kalkan...) + renk |
| **Katmanlar** | Seçili katmanın opaklık, karışım modu, konum, döndürme, ölçek, boyut, çevirme ayarları |
| **Yüzeyler** | Yüzey türü, 2B düzenleyici (tuvali düz görüntüler), yüzeylere kamera, temel renk |
| **Görseller** | https bağlantısından görsel ekleme, son kullanılanlar, favoriler; tasarım kodu içe aktarma |
| **YZ** | Tarif ederek görsel üretme (OpenAI `gpt-image-1`), arka plan temizleme, araca ekleme |
| **Modifiye** | Mevcut boyayı koru / özel boya (birincil, ikincil), cam filmi, neon (aç/kapa + renk), ekstralar |
| **Ekipman** | Katalog (siren, LED, döner lamba, ekipman, çağrı kodu), araca tıklayarak yerleştirme, konum/döndürme kaydırıcıları, çoğaltma, aynalama, odaklama, ışık testi, yüzeye eğme |
| **Kütüphane** | Kayıtlı tasarımlar: aç, yeniden adlandır, sil, araçtan kaldır, yeni tasarım, tasarım kodunu kopyala / içe aktar |
| **Sil** | Seçili katmanı (ekipman sekmesinde seçili ekipmanı) siler; seçim yoksa tümünü silmeyi sorar |

Sağ panel: plaka, geri al / yinele, kapat, katman listesi (göster/gizle, kilitle, çoğalt, yukarı/aşağı, sil, çift tıkla adlandır, sürükle-bırak sıralama) ve seçili katmanın özellikleri. Alt kısım: fare ipuçları, kamera açıları (Sıfırla, Ön, Yan, Arka, Üst).

**Fare:** LMB tasarımı araç üzerinde sürükler (ekipman sekmesinde ekipman yerleştirir / taşır), RMB döndürür, tekerlek yakınlaştırır.
**Klavye:** `Ctrl+Z` / `Ctrl+Y` geri al / yinele, `Del` siler, `Ctrl+D` çoğaltır, oklar taşır (`Shift` büyük adım), `Esc` kapatır. Ekipman seçiliyken: oklar, `PgUp/PgDn` yükseklik, `Q/E` döndürme.

**Kaydetme:** "Yalnızca bu araç" tasarımı plakaya bağlar. "Tüm <model> araçları" sunucudaki o modelin tüm araçlarına (sonradan oluşturulanlar dahil) uygular; kendi tasarımı olan araçlar kendilerininkini korur. Bu seçenek ayrı yetki ister.

**Sürüşte siren:** ışık ekipmanı olan araçta `E`'ye dokun (ışık + ses), `E` basılı tut (korna), `J` (sessiz ışık), `R` (siren tonu). `J` ve `R` FiveM tuş ayarlarından değiştirilebilir.

## Kurulum

1. Klasör: `resources/[loe]/loe_vehicledesigner` (server.cfg'de `ensure [loe]` zaten var).
2. Bağımlılıklar: `ox_lib`, `oxmysql` (Qbox için `qbx_core`). Tablolar ilk açılışta otomatik oluşturulur (`sql/loe_vehicledesigner.sql` elle kurulum içindir).
3. Yapay zekâ için server.cfg'ye (setr DEĞİL, anahtar istemcilere gitmesin):
   ```cfg
   set loe_vd_openai_key "sk-..."
   ```
   Anahtar yoksa YZ sekmesi "kapalı" görünür, geri kalan her şey çalışır.
4. Yetkiler (`config.lua` → `Config.Access`), LOE varsayılanı:
   - Tasarlayabilen: `police`, `bcso`, `ambulance`, `mechanic` meslekleri (tüm rütbeler), aracının sahibi olan oyuncular ve `admin` ace'i olanlar (server.cfg'de `add_ace group.admin admin allow` zaten var).
   - "Tüm <model> araçları" kaydı: bu mesleklerin 4. rütbesi (Chief / Manager) ve adminler.
5. Resource ilk kez eklendiği için txAdmin konsolunda `refresh` sonra `ensure loe_vehicledesigner`.

## Kullanım

Aracın sürücü koltuğunda, araç dururken `/tasarim` (ya da FiveM tuş ayarlarından atanan tuş). Başka bir resource'tan açmak için:

```lua
exports.loe_vehicledesigner:Open()
```

## Kaplama araca nasıl basılır (yüzey paketleri)

Tasarım 4096×4096'lık bir tuvalde tutulur. Araç 5 yüzeye ayrılır (Üst, Sol, Sağ, Ön, Arka) ve her yüzey tuvalde kendi bölgesine yerleşir (`shared/layout.lua`). Tuval bir DUI sayfasında çizilir ve çalışma zamanı dokusu olarak araca basılır.

GTA vanilla araçlarında bu tuvali taşıyacak bir UV yüzeyi yoktur. Bu yüzden her model için bir **yüzey paketi** gerekir: aracın boya geometrisinin kutu izdüşümlü UV'lerle kopyalanmış bir kaplama modeli. Paket, `loe_vd_pack 'yes'` satırı olan ayrı bir resource'tur ve otomatik bulunur (alt köşede "N yüzey paketi yüklendi"). Paketler `tools/packbuilder` ile oyunun kendi modellerinden üretilir; ayrıntılar [tools/packbuilder/README.md](tools/packbuilder/README.md).

LOE için hazır üretilenler: `loe_vd_pack_emergency` (30 polis / EMS / itfaiye aracı), `loe_vd_pack_cars` (galerideki 50 araba + gauntlet3, elegy, dominator, aleutian) ve `loe_vd_pack_equipment` (vanilla polis araçlarından çıkarılmış 5 tepe lambası x 4 renk; Ekipman > Sirenler kataloğunda en üstte). Paketli araçlarda 2B düzenleyici, aracın yüzey şablonunu (silüetini) arka planda gösterir.

| Yüzey türü | Durum |
|---|---|
| **Yüzey paketi** | Asıl yöntem. Sürüşte herkes görür. Aynı tasarımı taşıyan araçlar tek dokuyu paylaşır. |
| **Decal önizleme** | Paketi olmayan araçlarda, yalnızca tasarımcı açıkken oyun decal'larıyla kaba önizleme (deneysel). |
| **Vanilla livery** | `Config.Liveries` ile aracın kendi livery dokusunu değiştirir; yerleşim modele özel, 2B düzenleyici ile kullanılır (deneysel). `/vdscan` doku adlarını bulmaya çalışır. |

Paketi olmayan araçta da tasarım kaydedilir; paket eklendiğinde aynı yerleşimle görünür.

## Komutlar

| Komut | Kim | Ne yapar |
|---|---|---|
| `/tasarim` | yetkili oyuncu | Tasarımcıyı açar |
| `/vdkapat` | herkes | Takılı kalan arayüzü kapatır |
| `/vdscan` | herkes | İçinde bulunulan aracın vanilla livery dokularını F8'e yazar |
| `/vddebug` | herkes | Aracın yüzey kutusunu çizer (paket geliştirme) |
| `/vdreload` | admin | Atamaları veritabanından yeniden yükler |
| `/vdclear <plaka>` | admin | Plakaya atanmış tasarımı kaldırır |

## Dosyalar

| Dosya | Görev |
|---|---|
| `config.lua` | Marka/renk, erişim, tuval, çizim mesafeleri, limitler, decal, YZ, siren, fontlar |
| `shared/layout.lua` | Kutu izdüşümlü tuval yerleşimi (paket aracıyla aynı formül) |
| `shared/equipment.lua` | Ekipman kataloğu (prop'lar + ışık noktaları) |
| `client/editor.lua` | Tasarımcı oturumu, NUI geri çağrıları, araca tıklama (ışın) |
| `client/world.lua` | Dünyadaki araçlara kayıtlı tasarımları uygular |
| `client/backends.lua` | Kaplamayı basan arka uçlar (paket, decal, vanilla livery) |
| `client/dui.lua` | DUI havuzu, görsel önbelleği |
| `client/equipment.lua`, `client/sirens.lua` | Ekipman prop'ları, ışıklar, siren sesi ve kontrolleri |
| `client/tuning.lua`, `client/camera.lua` | Modifiye, kamera |
| `server/*.lua` | Framework köprüsü, veritabanı, atama dizini, kaydetme/kütüphane, görseller, YZ, siren durumu |
| `html/` | Editör (index.html) ve araç dokusu sayfası (dui.html), ortak çizim motoru `js/engine.js` |
| `_dev/mock.html` | Tarayıcıda oyun olmadan arayüz önizlemesi (`python -m http.server` ile kökten sun) |
| `_dev/test_lua.lua` | Oyun dışı Lua testleri: `lua5.4 _dev/test_lua.lua . _dev/expected_police4.lua` |
| `tools/packbuilder/` | Yüzey paketi üreticisi (Python çıkarıcı + .NET/CodeWalker üretici) |
