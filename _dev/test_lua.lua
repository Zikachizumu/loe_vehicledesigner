-- Oyun dışı Lua testleri (lua5.4). Kullanım: lua5.4 _dev/test_lua.lua <resource kökü> [expected.lua]
-- Tüm dosyaları sahte FiveM ortamında yükler (yükleme hatalarını yakalar) ve saf mantığı test eder.

local root = arg[1] or '.'
local expectedFile = arg[2]
local failures, passes = 0, 0

local function check(cond, msg)
    if cond then passes = passes + 1 else failures = failures + 1; print('FAIL: ' .. msg) end
end

-- ------------------------------------------------------------------ sahte ortam
local noop = function() end
local registry = { callbacks = {}, nui = {}, events = {}, commands = {} }
local function vec3(x, y, z) return setmetatable({ x = x, y = y, z = z }, {
    __add = function(a, b) return vec3(a.x + b.x, a.y + b.y, a.z + b.z) end,
    __sub = function(a, b) return vec3(a.x - b.x, a.y - b.y, a.z - b.z) end,
    __mul = function(a, k) return vec3(a.x * k, a.y * k, a.z * k) end,
    __div = function(a, k) return vec3(a.x / k, a.y / k, a.z / k) end,
    __unm = function(a) return vec3(-a.x, -a.y, -a.z) end,
    __len = function(a) return math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z) end,
}) end
vector3, vec3G = vec3, vec3
_G.vec3 = vec3

GetCurrentResourceName = function() return 'loe_vehicledesigner' end
CreateThread = noop
SetTimeout = noop
Wait = noop
RegisterNetEvent = function(n, f) registry.events[n] = f end
AddEventHandler = function(n, f) registry.events[n] = f end
TriggerClientEvent, TriggerServerEvent, TriggerLatentClientEvent, TriggerLatentServerEvent = noop, noop, noop, noop
RegisterCommand = function(n, f) registry.commands[n] = f end
RegisterKeyMapping = noop
RegisterNUICallback = function(n, f) registry.nui[n] = f end
SendNUIMessage, SetNuiFocus = noop, noop
AddStateBagChangeHandler = noop
GetConvar = function(_, d) return d end
IsPlayerAceAllowed = function() return false end
GetResourceState = function() return 'missing' end
GetNumResources = function() return 0 end
GetResourceByFindIndex = function() return nil end
GetResourceMetadata = function() return nil end
GetNumResourceMetadata = function() return 0 end
LoadResourceFile = function() return nil end
GetPlayerIdentifiers = function() return { 'license:test' } end
GetPlayerName = function() return 'test' end
exports = setmetatable({}, { __call = noop, __index = function() return setmetatable({}, { __index = function() return noop end }) end })
json = { encode = function() return '{}' end, decode = function() return {} end }
lib = {
    callback = setmetatable({ register = function(n, f) registry.callbacks[n] = f end, await = noop }, { __call = noop }),
    addCommand = noop, notify = noop,
}
MySQL = setmetatable({}, { __index = function() return setmetatable({}, { __index = function() return noop end, __call = noop }) end })
Citizen = { Await = noop }
promise = { new = function() return { resolve = noop } end }
Entity = function() return { state = {} } end
joaat = function(s) local h = 0 for i = 1, #s do h = (h + s:byte(i)) % 4294967296 end return h end

local function load(path)
    local f, err = loadfile(root .. '/' .. path)
    if not f then print('LOAD ERROR ' .. path .. ': ' .. err); failures = failures + 1; return end
    local ok, e = pcall(f)
    if not ok then print('RUN ERROR ' .. path .. ': ' .. tostring(e)); failures = failures + 1; return end
    passes = passes + 1
end

-- ------------------------------------------------------------------ dosyaları yükle
for _, p in ipairs({ 'config.lua', 'shared/locale.lua', 'shared/util.lua', 'shared/layout.lua', 'shared/equipment.lua' }) do load(p) end
for _, p in ipairs({ 'server/bridge.lua', 'server/db.lua', 'server/assignments.lua', 'server/designs.lua', 'server/images.lua', 'server/ai.lua', 'server/sirens.lua', 'server/main.lua' }) do load(p) end
for _, p in ipairs({ 'client/util.lua', 'client/packs.lua', 'client/dui.lua', 'client/backends.lua', 'client/world.lua', 'client/equipment.lua', 'client/sirens.lua', 'client/tuning.lua', 'client/camera.lua', 'client/editor.lua', 'client/main.lua' }) do load(p) end

-- ------------------------------------------------------------------ kayıtlar
for _, n in ipairs({ 'loevd:open', 'loevd:save', 'loevd:design', 'loevd:library', 'loevd:index', 'loevd:ai' }) do check(registry.callbacks[n], 'callback eksik: ' .. n) end
for _, n in ipairs({ 'nuiReady', 'design', 'equipment', 'tuning', 'viewport', 'cam', 'centerPick', 'equipRoof', 'save', 'library', 'ai', 'uploadImage', 'getImage', 'image', 'close', 'tool', 'select', 'view2d' }) do
    check(registry.nui[n], 'NUI callback eksik: ' .. n)
end
for _, n in ipairs({ 'tasarim', 'vdkapat', 'vdscan', 'loevd_silent', 'loevd_tone' }) do check(registry.commands[n], 'komut eksik: ' .. n) end

-- ------------------------------------------------------------------ yardımcılar
check(VD.normalizePlate(' 12 ab c ') == '12ABC', 'normalizePlate')
check(VD.normalizePlate('   ') == nil, 'normalizePlate boş')
check(VD.modelKey(-1) == '4294967295', 'modelKey negatif hash')
local r, g, b = VD.hexToRgb('#ff2e93')
check(r == 255 and g == 46 and b == 147, 'hexToRgb')
check(VD.accentHex() == '#ff2e93', 'accentHex')

-- ------------------------------------------------------------------ yerleşim (paket aracıyla aynı olmalı)
local mn, mx = { x = -1.05, y = -2.55, z = -0.55 }, { x = 1.05, y = 2.6, z = 0.85 }
local charts = VD.Layout.compute(mn, mx, 4096)
check(#charts == 5, 'chart sayısı')
local function within(c) return c.rect[1] >= 0 and c.rect[2] >= 0 and c.rect[1] + c.rect[3] <= 4096 and c.rect[2] + c.rect[4] <= 4096 end
for _, c in ipairs(charts) do check(within(c), 'chart tuval dışında: ' .. c.id) end
-- yüzey merkezi izdüşümü kendi chart'ının içine düşmeli
local probes = {
    { n = { x = -1, y = 0, z = 0 }, p = { x = mn.x, y = 0.1, z = 0.1 }, id = 'left' },
    { n = { x = 1, y = 0, z = 0 }, p = { x = mx.x, y = 0.1, z = 0.1 }, id = 'right' },
    { n = { x = 0, y = 0, z = 1 }, p = { x = 0, y = 0, z = mx.z }, id = 'top' },
    { n = { x = 0, y = 1, z = 0 }, p = { x = 0, y = mx.y, z = 0 }, id = 'front' },
    { n = { x = 0, y = -1, z = 0 }, p = { x = 0, y = mn.y, z = 0 }, id = 'rear' },
}
for _, pr in ipairs(probes) do
    local c = VD.Layout.chartForNormal(charts, pr.n)
    check(c and c.id == pr.id, 'chartForNormal ' .. pr.id)
    local px, py = VD.Layout.project(c, pr.p)
    check(px >= c.rect[1] and px <= c.rect[1] + c.rect[3] and py >= c.rect[2] and py <= c.rect[2] + c.rect[4], 'project içeride ' .. pr.id)
    local back = VD.Layout.unproject(c, px, py, mn, mx)
    check(math.abs(back.x - pr.p.x) < 1e-6 and math.abs(back.y - pr.p.y) < 1e-6 and math.abs(back.z - pr.p.z) < 1e-6, 'unproject geri dönüş ' .. pr.id)
end
-- sol yüzeyde araç önü tuvalin solunda, sağ yüzeyde sağında olmalı
local L = charts[2]; local R = charts[3]
local lf = VD.Layout.project(L, { x = mn.x, y = mx.y, z = 0 }); local lr = VD.Layout.project(L, { x = mn.x, y = mn.y, z = 0 })
check(lf < lr, 'sol yüzey: ön solda')
local rf = VD.Layout.project(R, { x = mx.x, y = mx.y, z = 0 }); local rr = VD.Layout.project(R, { x = mx.x, y = mn.y, z = 0 })
check(rf > rr, 'sağ yüzey: ön sağda')

if expectedFile then
    local exp = dofile(expectedFile) -- { bbox = {min,max}, charts = { {id, rect={...}, s} } }
    local c2 = VD.Layout.compute({ x = exp.bbox.min[1], y = exp.bbox.min[2], z = exp.bbox.min[3] }, { x = exp.bbox.max[1], y = exp.bbox.max[2], z = exp.bbox.max[3] }, 4096)
    for i, e in ipairs(exp.charts) do
        local c = c2[i]
        local same = c.id == e.id and math.abs(c.s - e.s) < 1e-6
        for k = 1, 4 do same = same and math.abs(c.rect[k] - e.rect[k]) < 0.01 end
        check(same, ('Lua/C# yerleşim farkı: %s lua=[%s %s %s %s s=%s] c#=[%s %s %s %s s=%s]'):format(e.id, c.rect[1], c.rect[2], c.rect[3], c.rect[4], c.s, e.rect[1], e.rect[2], e.rect[3], e.rect[4], e.s))
    end
end

-- ------------------------------------------------------------------ tasarım doğrulama
local d = VD.sanitizeDesign({
    layers = {
        { id = 'a', type = 'shape', shape = 'star', x = 100, y = 200, sx = 50, sy = 50, color = '#FF0000', opacity = 150, blend = 'evil' },
        { id = 'b', type = 'text', text = string.rep('x', 500), font = 'Impact"><script>', x = 0, y = 0 },
        { id = 'c', type = 'image', src = 'javascript:alert(1)' },
        { id = 'd', type = 'image', src = 'img:42', w = 100, h = 100 },
        { id = 'e', type = 'image', src = "https://i.imgur.com/a.png' onerror='x" },
        { id = 'f', type = 'image', src = 'https://i.imgur.com/abc.png' },
        { id = 'g', type = 'bogus' },
    },
    equipment = { { item = 'bar_rb', pos = { 0, 0, 99 }, rot = { 0, 0, 0 } }, { item = 'nope', pos = { 0, 0, 0 } } },
    tuning = { paint = 'custom', primary = '#123456', tint = 99, extras = { ['1'] = true, ['99'] = true } },
    base = { color = 'red' },
})
check(#d.layers == 4, 'geçerli katman sayısı 4 olmalı, ' .. #d.layers)
check(d.layers[1].opacity == 100 and d.layers[1].blend == 'normal' and d.layers[1].color == '#ff0000', 'şekil temizliği')
check(#d.layers[2].text == 200 and not d.layers[2].font:find('[<>"]'), 'metin temizliği')
check(d.layers[3].src == 'img:42' and d.layers[4].src == 'https://i.imgur.com/abc.png', 'görsel kaynakları')
check(#d.equipment == 1 and d.equipment[1].pos[3] == 6, 'ekipman temizliği')
check(d.tuning.tint == 6 and d.tuning.extras['1'] == true and d.tuning.extras['99'] == nil, 'modifiye temizliği')
check(d.base.color == nil, 'temel renk temizliği')
check(VD.sanitizeDesign('x') == nil, 'tablo olmayan tasarım')

-- ------------------------------------------------------------------ atama çözümleme
Assign.p['ABC123'] = { i = 5, r = 2, m = '100' }
Assign.m['100'] = { i = 7, r = 1 }
local a, scope = Assign.resolve('ABC123', '100')
check(a and a.i == 5 and scope == 'plate', 'plaka önceliği')
a, scope = Assign.resolve('ABC123', '200')
check(a == nil, 'plaka farklı modelde geçersiz')
a, scope = Assign.resolve('ZZZ', '100')
check(a and a.i == 7 and scope == 'model', 'model ataması')

check(VD.LoadEquipmentPacks() == 0, 'ekipman paketi taraması (boş)')

-- ------------------------------------------------------------------ döndürme
local v = VD.rotate({ 0, 0, 90 }, { 1, 0, 0 })
check(math.abs(v[1]) < 1e-9 and math.abs(v[2] - 1) < 1e-9, 'rotate yaw 90')

print(('%d geçti, %d hata'):format(passes, failures))
os.exit(failures == 0 and 0 or 1)
