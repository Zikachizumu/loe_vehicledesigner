VD = VD or {}

VD.Resource = GetCurrentResourceName()

function VD.debug(...)
    if Config.Debug then print(('[%s]'):format(VD.Resource), ...) end
end

function VD.clamp(v, lo, hi)
    v = tonumber(v) or lo
    if v < lo then return lo end
    if v > hi then return hi end
    return v
end

-- Plaka karşılaştırması için tek biçim: boşluksuz, büyük harf.
function VD.normalizePlate(plate)
    if type(plate) ~= 'string' then return nil end
    plate = plate:gsub('%s+', ''):upper()
    if plate == '' then return nil end
    return plate
end

function VD.accentHex()
    local a = Config.Accent
    if type(a) == 'string' and a:match('^#%x%x%x%x%x%x$') then return a end
    return Config.Accents[a] or Config.Accents.magenta
end

function VD.hexToRgb(hex)
    if type(hex) ~= 'string' then return 255, 255, 255 end
    local r, g, b = hex:match('^#?(%x%x)(%x%x)(%x%x)$')
    if not r then return 255, 255, 255 end
    return tonumber(r, 16), tonumber(g, 16), tonumber(b, 16)
end

function VD.deepcopy(t)
    if type(t) ~= 'table' then return t end
    local out = {}
    for k, v in pairs(t) do out[k] = VD.deepcopy(v) end
    return out
end

-- Tasarım tarafından tutulan model anahtarı: hash'in işaretsiz ondalık metni (addon/vanilla fark etmez).
function VD.modelKey(hash)
    hash = tonumber(hash) or 0
    if hash < 0 then hash = hash + 4294967296 end
    return tostring(math.floor(hash))
end
