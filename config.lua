Config = {}

-- ================================================================ GENEL
Config.Debug  = false
Config.Locale = 'tr'                -- 'tr' | 'en' (arayüz + bildirimler)

Config.Brand = {
    name   = 'LEGENDS OF',
    accent = 'EMPIRE',
    footer = 'LEGENDS OF EMPIRE ROLEPLAY',
}

-- Vurgu rengi (loe_pause paletiyle aynı). Config.Accent bu tablodan bir anahtar ya da '#rrggbb' olabilir.
Config.Accent  = 'magenta'
Config.Accents = {
    magenta = '#ff2e93',
    purple  = '#a855f7',
    blue    = '#38bdf8',
    green   = '#34d399',
    orange  = '#fb923c',
    red     = '#ef4444',
}

-- ================================================================ ERİŞİM
Config.Command        = 'tasarim'              -- /tasarim → içinde bulunduğun aracı tasarımcıda açar
Config.CommandAliases = { 'vehicledesigner' }
Config.OpenKey        = ''                     -- RegisterKeyMapping varsayılanı (boş = atanmamış)

Config.Access = {
    ace  = 'loe.vehicledesigner',              -- bu ace'e sahip olan her aracı tasarlayabilir
    jobs = {                                   -- meslek = en düşük rütbe. Boş tablo = meslek ile erişim yok
        police    = 0,
        ambulance = 0,
        mechanic  = 0,
    },
    requireOnDuty = false,                     -- true: meslek erişimi yalnızca mesaideyken
    owners        = true,                      -- oyuncular SAHİBİ oldukları aracı tasarlayabilir (player_vehicles)

    -- "Tüm <model> araçları" kaydı sunucudaki o modelin TÜM araçlarını etkiler → ayrı yetki
    modelScope = {
        ace  = 'loe.vehicledesigner.model',
        jobs = { mechanic = 3 },
    },

    requireDriver = true,                      -- sürücü koltuğunda olmak gerekir
    maxSpeed      = 1.0,                       -- m/s; araç bundan hızlı gidiyorsa açılmaz
    zones         = {},                        -- { { coords = vec3(x, y, z), radius = 25.0 }, ... } boş = her yerde
}

-- ================================================================ TUVAL / ÇİZİM
Config.Canvas = {
    size    = 4096,                            -- mantıksal tuval (konum değerleri bu ölçekte: 0..4096)
    texture = 2048,                            -- araca basılan dokunun çözünürlüğü (DUI). 1024 / 2048
}

Config.Render = {
    distance       = 80.0,                     -- kaplamaların çizildiği mesafe (m)
    maxVehicles    = 8,                        -- aynı anda kaplaması çizilen en fazla araç (her biri bir DUI)
    tick           = 750,                      -- dünya taraması aralığı (ms)
    equipDistance  = 120.0,                    -- ekipman prop'larının oluşturulduğu mesafe (m)
}

Config.Limits = {
    layers           = 120,
    equipment        = 30,
    designsPerPlayer = 40,
    designBytes      = 262144,                 -- tasarım JSON (resimler hariç)
    imageBytes       = 3 * 1024 * 1024,        -- tek resim (base64)
    thumbBytes       = 150000,
    nameLength       = 40,
}

-- ================================================================ YÜZEYLER
-- 1) Yüzey paketleri (önerilen): tools/packbuilder ile üretilen 'loe_vd_pack_*' resource'ları otomatik bulunur.
-- 2) Decal önizleme (deneysel): paketi olmayan araçta tasarımı oyun decal'larıyla yansıtır.
--    Decal türleri global ve kıttır; başka bir resource aynı türleri kullanıyorsa listeden çıkar.
Config.Decals = {
    enabled       = true,
    onlyEditing   = true,                      -- true: yalnızca tasarımcı açıkken (sürüşte decal kullanılmaz)
    types         = { 9100, 9101, 9102, 9103, 9104, 9106, 9107, 9108, 9110, 9111, 9112, 9115, 9116, 9117, 9118, 9119, 9123 },
    surfaceOffset = 0.0666,
    resolution    = 1024,
}

-- 3) Vanilla livery dokuları (deneysel, yalnızca 2B düzenleme): [model] = { txd = 'model', tex = 'model_sign_%d' }
--    /vdscan komutu içinde bulunduğun aracın değiştirilebilir livery dokularını bulmaya çalışır.
Config.Liveries = {
    -- police4 = { txd = 'police4', tex = 'police4_sign_%d' },
}

-- ================================================================ YAPAY ZEKA
Config.AI = {
    enabled     = true,
    endpoint    = 'https://api.openai.com/v1/images/generations',
    model       = 'gpt-image-1',
    size        = '1024x1024',
    quality     = 'medium',
    background  = 'transparent',               -- gpt-image-1: şeffaf arka plan
    keyConvar   = 'loe_vd_openai_key',         -- server.cfg: set loe_vd_openai_key "sk-..."  (setr DEĞİL)
    cooldown    = 20,                          -- saniye / oyuncu
    dailyLimit  = 25,                          -- gün başına oyuncu limiti (sunucu yeniden başlayınca sıfırlanır)
    ace         = nil,                         -- nil = tasarımcıya erişen herkes; örn. 'loe.vehicledesigner.ai'
    promptSuffix = ', vehicle livery decal artwork, flat clean vector style, crisp edges, centered, isolated, no car, no mockup',
}

-- ================================================================ SİREN / IŞIK
Config.Sirens = {
    enabled        = true,
    tones          = { 'VEHICLES_HORNS_SIREN_1', 'VEHICLES_HORNS_SIREN_2', 'VEHICLES_HORNS_POLICE_WARNING' },
    horn           = 'SIRENS_AIRHORN',
    tapMs          = 230,                      -- E: bundan kısa basış = siren aç/kapa, uzun basış = korna
    silentKey      = 'J',                      -- sessiz ışık (RegisterKeyMapping varsayılanı)
    toneKey        = 'R',                      -- siren tonu
    lightRange     = 7.5,
    lightIntensity = 10.0,
    glowSize       = 0.085,
    drawDistance   = 90.0,
}

-- ================================================================ METİN FONTLARI
-- family = CSS font adı; google = Google Fonts aile adı (nil = sistem fontu)
Config.Fonts = {
    { family = 'Impact',             label = 'Impact' },
    { family = 'Oswald',             label = 'Oswald',            google = 'Oswald:wght@400;700' },
    { family = 'Chakra Petch',       label = 'Chakra Petch',      google = 'Chakra+Petch:ital,wght@0,400;0,700;1,400;1,700' },
    { family = 'Montserrat',         label = 'Montserrat',        google = 'Montserrat:ital,wght@0,400;0,800;1,400;1,800' },
    { family = 'Bebas Neue',         label = 'Bebas Neue',        google = 'Bebas+Neue' },
    { family = 'Anton',              label = 'Anton',             google = 'Anton' },
    { family = 'Russo One',          label = 'Russo One',         google = 'Russo+One' },
    { family = 'Orbitron',           label = 'Orbitron',          google = 'Orbitron:wght@400;800' },
    { family = 'Teko',               label = 'Teko',              google = 'Teko:wght@400;700' },
    { family = 'Black Ops One',      label = 'Black Ops One',     google = 'Black+Ops+One' },
    { family = 'Racing Sans One',    label = 'Racing Sans One',   google = 'Racing+Sans+One' },
    { family = 'Bangers',            label = 'Bangers',           google = 'Bangers' },
    { family = 'Permanent Marker',   label = 'Permanent Marker',  google = 'Permanent+Marker' },
    { family = 'Dancing Script',     label = 'Dancing Script',    google = 'Dancing+Script:wght@400;700' },
    { family = 'Pacifico',           label = 'Pacifico',          google = 'Pacifico' },
    { family = 'Roboto Condensed',   label = 'Roboto Condensed',  google = 'Roboto+Condensed:ital,wght@0,400;0,700;1,400;1,700' },
}
