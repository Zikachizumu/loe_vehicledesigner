-- Kutu izdüşümlü tuval düzeni ("box" layout).
--
-- Araç beş yüzeye ayrılır: ÜST, SOL, SAĞ, ÖN, ARKA. Her yüzey, aracın yerel eksenlerinden birine dik bir
-- izdüşümdür ve 4096x4096 tuvalde kendi dikdörtgenine (chart) yerleşir. Aynı formül:
--   * tools/packbuilder (kaplama modelinin UV'lerini üretirken),
--   * client (araca tıklanan noktayı tuval koordinatına çevirirken),
--   * html/js/engine.js (yüzey şablonu ve seçim)
-- tarafından kullanılır. Paket surface.json içinde chart verdiyse o esas alınır.
--
-- Yön kuralları (izleyici yüzeye dışarıdan bakar, metin düz okunur):
--   top   : tuval +x = araç önü (+y),  tuval +y (aşağı) = araç sağı (+x)
--   left  : tuval +x = araç arkası (-y), tuval +y = aşağı (-z)
--   right : tuval +x = araç önü (+y),    tuval +y = aşağı
--   front : tuval +x = araç solu (-x),   tuval +y = aşağı
--   rear  : tuval +x = araç sağı (+x),   tuval +y = aşağı

VD = VD or {}
VD.Layout = {}

local AX = { x = 1, y = 2, z = 3 }

-- u/v: { axis, sign, origin } → piksel = rect + sign * (p[axis] - origin) * s
local function chart(id, x, y, w, h, s, u, v, n, side)
    return { id = id, rect = { x, y, w, h }, s = s, u = u, v = v, n = n, side = side }
end

---@param mn table {x,y,z} yerel min
---@param mx table {x,y,z} yerel max
function VD.Layout.compute(mn, mx, size, pad)
    size = size or (Config and Config.Canvas.size) or 4096
    pad  = pad or math.floor(size / 85)

    local L = math.max(0.5, mx.y - mn.y)
    local W = math.max(0.3, mx.x - mn.x)
    local H = math.max(0.3, mx.z - mn.z)

    local availW = size - 2 * pad
    local availH = size - 2 * pad
    local s = math.min(availW / L, (availW - pad) / (2 * W), (availH - 3 * pad) / (W + 3 * H))
    s = math.floor(s * 1000) / 1000

    local contentH = (W + 3 * H) * s + 3 * pad
    local y0 = pad + (availH - contentH) / 2
    local function cx(w) return math.floor(pad + (availW - w) / 2) end

    local Ls, Ws, Hs = L * s, W * s, H * s
    local rowTop   = math.floor(y0)
    local rowLeft  = math.floor(rowTop + Ws + pad)
    local rowRight = math.floor(rowLeft + Hs + pad)
    local rowEnds  = math.floor(rowRight + Hs + pad)
    local endsW    = 2 * Ws + pad
    local endsX    = cx(endsW)

    return {
        chart('top',   cx(Ls), rowTop,   Ls, Ws, s,
            { axis = 'y', sign =  1, origin = mn.y }, { axis = 'x', sign =  1, origin = mn.x },
            { 0, 0, 1 },  { 0, 1, 0 }),
        chart('left',  cx(Ls), rowLeft,  Ls, Hs, s,
            { axis = 'y', sign = -1, origin = mx.y }, { axis = 'z', sign = -1, origin = mx.z },
            { -1, 0, 0 }, { 0, -1, 0 }),
        chart('right', cx(Ls), rowRight, Ls, Hs, s,
            { axis = 'y', sign =  1, origin = mn.y }, { axis = 'z', sign = -1, origin = mx.z },
            { 1, 0, 0 },  { 0, 1, 0 }),
        chart('front', endsX, rowEnds,   Ws, Hs, s,
            { axis = 'x', sign = -1, origin = mx.x }, { axis = 'z', sign = -1, origin = mx.z },
            { 0, 1, 0 },  { -1, 0, 0 }),
        chart('rear',  endsX + Ws + pad, rowEnds, Ws, Hs, s,
            { axis = 'x', sign =  1, origin = mn.x }, { axis = 'z', sign = -1, origin = mx.z },
            { 0, -1, 0 }, { 1, 0, 0 }),
    }
end

local function comp(p, axis) return p[axis] or p[AX[axis]] end

-- Yüzey normaline göre chart seç (alt yüzeyler yan/ön/arkaya düşer).
function VD.Layout.chartForNormal(charts, n)
    local ax, ay, az = math.abs(n.x), math.abs(n.y), math.abs(n.z)
    local id
    if n.z > 0 and az >= ax and az >= ay then
        id = 'top'
    elseif ax >= ay then
        id = n.x < 0 and 'left' or 'right'
    else
        id = n.y > 0 and 'front' or 'rear'
    end
    for _, c in ipairs(charts) do if c.id == id then return c end end
end

-- Yerel nokta → tuval pikseli
function VD.Layout.project(c, p)
    local px = c.rect[1] + c.u.sign * (comp(p, c.u.axis) - c.u.origin) * c.s
    local py = c.rect[2] + c.v.sign * (comp(p, c.v.axis) - c.v.origin) * c.s
    return px, py
end

-- Tuval pikseli → chart düzlemindeki yerel nokta (derinlik ekseni = yüzeyin dış sınırı)
function VD.Layout.unproject(c, px, py, mn, mx)
    local p = { x = (mn.x + mx.x) / 2, y = (mn.y + mx.y) / 2, z = (mn.z + mx.z) / 2 }
    p[c.u.axis] = c.u.origin + c.u.sign * (px - c.rect[1]) / c.s
    p[c.v.axis] = c.v.origin + c.v.sign * (py - c.rect[2]) / c.s
    -- derinlik ekseni: normalin işaret ettiği sınır
    if c.n[1] ~= 0 then p.x = c.n[1] > 0 and mx.x or mn.x end
    if c.n[2] ~= 0 then p.y = c.n[2] > 0 and mx.y or mn.y end
    if c.n[3] ~= 0 then p.z = c.n[3] > 0 and mx.z or mn.z end
    return p
end
