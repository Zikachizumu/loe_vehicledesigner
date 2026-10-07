-- Ekipman kataloğu.
--
-- Her öğe bir veya daha fazla prop'tan (props) ve betikle çizilen ışık noktalarından (lights) oluşur.
--   props  : { m = model, o = {x,y,z} öğe merkezine göre ofset (m), r = {x,y,z} derece }
--   lights : { o = {x,y,z}, c = renk, g = faz grubu (1/2), k = 'flash' | 'rotate' | 'steady' | 'spot' }
-- Bir öğenin prop modellerinden biri oyunda yoksa (IsModelInCdimage) öğe katalogda gizlenir.
-- Kendi prop'larını (ör. yüzey paketiyle gelen ışık barları) eklemek için aynı biçimde yeni öğe yaz.

VD = VD or {}

VD.LightColors = {
    red   = { 255, 24, 24 },
    blue  = { 30, 80, 255 },
    amber = { 255, 150, 0 },
    white = { 255, 255, 255 },
    green = { 0, 255, 90 },
}

VD.EquipmentCategories = {
    { id = 'sirens',    tr = 'Sirenler',      en = 'Sirens' },
    { id = 'leds',      tr = 'LED',           en = 'LEDs' },
    { id = 'beacons',   tr = 'Döner lamba',   en = 'Beacons' },
    { id = 'gear',      tr = 'Ekipman',       en = 'Equipment' },
    { id = 'callsigns', tr = 'Çağrı kodu',    en = 'Callsigns' },
}

local function bar(id, tr, en, colors, n, spacing)
    local props, lights = {}, {}
    local half = (n - 1) / 2
    for i = 1, n do
        local c = colors[i]
        local x = (i - 1 - half) * spacing
        local model = ({ red = 'prop_runlight_r', blue = 'prop_runlight_b', amber = 'prop_runlight_y', green = 'prop_runlight_g', white = 'prop_runlight_y' })[c]
        props[#props + 1] = { m = model, o = { x, 0.0, 0.0 } }
        lights[#lights + 1] = { o = { x, 0.0, 0.07 }, c = c, g = (i <= n / 2) and 1 or 2, k = 'flash' }
    end
    return { id = id, cat = 'sirens', tr = tr, en = en, colors = colors, icon = 'bar', props = props, lights = lights, roof = true }
end

local function led(id, tr, en, points, icon)
    local lights, colors = {}, {}
    for i, p in ipairs(points) do
        lights[#lights + 1] = { o = { p[1], p[2], p[3] }, c = p[4], g = p[5] or ((i % 2 == 1) and 1 or 2), k = 'flash' }
        colors[#colors + 1] = p[4]
    end
    return { id = id, cat = 'leds', tr = tr, en = en, colors = colors, icon = icon or 'led', props = {}, lights = lights }
end

local function gear(id, tr, en, model, extra)
    local it = { id = id, cat = 'gear', tr = tr, en = en, icon = 'gear', colors = {}, props = { { m = model, o = { 0.0, 0.0, 0.0 } } }, lights = {} }
    for k, v in pairs(extra or {}) do it[k] = v end
    return it
end

VD.Equipment = {
    -- ===================================================== SİRENLER (tepe ışık barları)
    bar('bar_rb',  'Kırmızı-mavi tepe lambası',   'Red-blue roof siren',    { 'red', 'red', 'blue', 'blue' }, 4, 0.17),
    bar('bar_bb',  'Mavi-mavi tepe lambası',      'Blue-blue roof siren',   { 'blue', 'blue', 'blue', 'blue' }, 4, 0.17),
    bar('bar_rr',  'Kırmızı-kırmızı tepe lambası','Red-red roof siren',     { 'red', 'red', 'red', 'red' }, 4, 0.17),
    bar('bar_aa',  'Amber tepe lambası',          'Amber-amber roof siren', { 'amber', 'amber', 'amber', 'amber' }, 4, 0.17),
    bar('bar_rb2', 'Kırmızı-mavi tepe lambası 2', 'Red-blue roof siren 2',  { 'red', 'red', 'red', 'blue', 'blue', 'blue' }, 6, 0.13),
    bar('bar_ba2', 'Mavi-amber tepe lambası',     'Blue-amber roof siren',  { 'blue', 'blue', 'amber', 'amber' }, 4, 0.17),

    -- ===================================================== LED (model yok, yalnızca ışık)
    led('led_r',  'Kırmızı LED',          'Red LED',            { { 0, 0, 0, 'red', 1 } }),
    led('led_b',  'Mavi LED',             'Blue LED',           { { 0, 0, 0, 'blue', 2 } }),
    led('led_a',  'Amber LED',            'Amber LED',          { { 0, 0, 0, 'amber', 1 } }),
    led('led_w',  'Beyaz LED',            'White LED',          { { 0, 0, 0, 'white', 2 } }),
    led('led_rb', 'Kırmızı-mavi LED çifti','Red-blue LED pair', { { -0.12, 0, 0, 'red', 1 }, { 0.12, 0, 0, 'blue', 2 } }, 'pair'),
    led('led_long_rb', 'Kırmızı-mavi uzun LED', 'Red-blue long LEDs', {
        { -0.45, 0, 0, 'red', 1 }, { -0.27, 0, 0, 'red', 1 }, { -0.09, 0, 0, 'red', 1 },
        { 0.09, 0, 0, 'blue', 2 }, { 0.27, 0, 0, 'blue', 2 }, { 0.45, 0, 0, 'blue', 2 } }, 'strip'),
    led('led_grille_rb', 'Izgara LED (kırmızı-mavi)', 'Grille LEDs (red-blue)', {
        { -0.2, 0, 0, 'red', 1 }, { -0.1, 0, 0, 'red', 1 }, { 0.1, 0, 0, 'blue', 2 }, { 0.2, 0, 0, 'blue', 2 } }, 'strip'),

    -- ===================================================== DÖNER LAMBALAR
    { id = 'beacon_red',   cat = 'beacons', tr = 'Kırmızı tepe fener', en = 'Red roof beacon',   icon = 'beacon', colors = { 'red' },
      props = { { m = 'hei_prop_wall_alarm_on', o = { 0, 0, 0 }, r = { -90.0, 0, 0 } } }, lights = { { o = { 0, 0, 0.12 }, c = 'red', g = 1, k = 'rotate' } }, roof = true },
    { id = 'beacon_amber', cat = 'beacons', tr = 'Amber tepe fener',   en = 'Amber roof beacon', icon = 'beacon', colors = { 'amber' },
      props = { { m = 'prop_warninglight_01', o = { 0, 0, 0 } } },     lights = { { o = { 0, 0, 0.15 }, c = 'amber', g = 1, k = 'rotate' } }, roof = true },
    { id = 'beacon_blue',  cat = 'beacons', tr = 'Mavi kubbe lamba',   en = 'Blue dome beacon',  icon = 'beacon', colors = { 'blue' },
      props = { { m = 'prop_runlight_b', o = { 0, 0, 0 } } },          lights = { { o = { 0, 0, 0.07 }, c = 'blue', g = 1, k = 'rotate' } }, roof = true },
    { id = 'beacon_green', cat = 'beacons', tr = 'Yeşil kubbe lamba',  en = 'Green dome beacon', icon = 'beacon', colors = { 'green' },
      props = { { m = 'prop_runlight_g', o = { 0, 0, 0 } } },          lights = { { o = { 0, 0, 0.07 }, c = 'green', g = 1, k = 'rotate' } }, roof = true },

    -- ===================================================== EKİPMAN
    gear('spotlight',  'Yan projektör',     'Side spotlight', 'prop_spot_01',
        { lights = { { o = { 0, 0.12, 0.05 }, c = 'white', g = 1, k = 'spot' } } }),
    gear('worklight',  'Çalışma lambası',   'Work light',     'prop_worklight_03a',
        { lights = { { o = { 0, 0.1, 0.25 }, c = 'white', g = 1, k = 'spot' } } }),
    gear('alpr',       'ALPR cihazı',       'ALPR device',    'prop_cctv_cam_06a'),
    gear('antenna',    'Anten',             'Antenna',        'prop_aerial_01a'),
    gear('laptop',     'Laptop ünitesi',    'Laptop unit',    'prop_laptop_01a'),
    gear('radio',      'Telsiz ünitesi',    'Radio unit',     'prop_police_radio_main'),
    gear('megaphone',  'Megafon',           'Megaphone',      'prop_megaphone_01'),
    gear('stopsign',   'Dur levhası',       'Stop sign',      'prop_sign_road_01a'),
    gear('cone',       'Trafik konisi',     'Traffic cone',   'prop_roadcone02a'),
    gear('stinger',    'Çivili şerit',      'Spike strip',    'p_ld_stinger_s'),
    gear('medbag',     'Sağlık çantası',    'Medical bag',    'prop_med_bag_01'),
    gear('extinguisher','Yangın tüpü',      'Fire extinguisher','prop_fire_exting_1a'),
    gear('toolbox',    'Alet kutusu',       'Toolbox',        'prop_tool_box_04'),
    gear('torch',      'El feneri',         'Flashlight',     'prop_cs_police_torch'),

    -- ===================================================== ÇAĞRI KODU (prop değil: tuvale hazır metin katmanı ekler)
    { id = 'cs_roof', cat = 'callsigns', tr = 'Tavan çağrı kodu', en = 'Roof callsign', icon = 'text', colors = {}, props = {}, lights = {},
      text = { chart = 'top', value = '1-ADAM-12', size = 260, font = 'Oswald', bold = true, rot = 90 } },
    { id = 'cs_side', cat = 'callsigns', tr = 'Yan çağrı kodu',   en = 'Side callsign', icon = 'text', colors = {}, props = {}, lights = {},
      text = { chart = 'left', value = '12', size = 180, font = 'Oswald', bold = true, rot = 0 } },
    { id = 'cs_rear', cat = 'callsigns', tr = 'Arka çağrı kodu',  en = 'Rear callsign', icon = 'text', colors = {}, props = {}, lights = {},
      text = { chart = 'rear', value = '1-A-12', size = 140, font = 'Oswald', bold = true, rot = 0 } },
}

VD.EquipmentById = {}
for _, it in ipairs(VD.Equipment) do VD.EquipmentById[it.id] = it end
