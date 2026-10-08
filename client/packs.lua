-- Yüzey paketleri: fxmanifest'inde `loe_vd_pack 'yes'` olan resource'lar.
-- Her model için bir surface JSON'u `loe_vd_surface 'surfaces/<model>.json'` satırıyla bildirilir.
--
-- surface JSON:
-- {
--   "model": "police4", "size": 4096, "slots": 6,
--   "txd": "loe_vd_police4", "tex": "loe_vd_police4_s%d",
--   "parts": [ { "bone": "chassis", "prop": "loe_vd_police4_chassis_s%d" }, ... ],
--   "bbox": { "min": [x,y,z], "max": [x,y,z] },
--   "charts": [ ... ]   (isteğe bağlı; yoksa bbox'tan shared/layout.lua ile hesaplanır)
-- }

Packs = { byModel = {}, list = {}, count = 0 }

local function xyz(t)
    if type(t) ~= 'table' then return nil end
    return { x = (t[1] or t.x or 0) + 0.0, y = (t[2] or t.y or 0) + 0.0, z = (t[3] or t.z or 0) + 0.0 }
end

local function loadDef(res, file)
    local raw = LoadResourceFile(res, file)
    if not raw then return nil end
    local ok, def = pcall(json.decode, raw)
    if not ok or type(def) ~= 'table' or type(def.model) ~= 'string' then
        print(('[%s] geçersiz yüzey dosyası: %s/%s'):format(VD.Resource, res, file))
        return nil
    end
    def.resource = res
    def.hash = joaat(def.model)
    def.size = tonumber(def.size) or Config.Canvas.size
    def.slots = math.max(1, math.floor(tonumber(def.slots) or 4))
    def.parts = type(def.parts) == 'table' and def.parts or {}
    if type(def.bbox) == 'table' then
        def.bbox = { min = xyz(def.bbox.min), max = xyz(def.bbox.max) }
    end
    if type(def.charts) ~= 'table' or #def.charts == 0 then
        if not def.bbox then return nil end
        def.charts = VD.Layout.compute(def.bbox.min, def.bbox.max, def.size)
    end
    return def
end

function Packs.scan()
    Packs.byModel, Packs.list = {}, {}
    for i = 0, GetNumResources() - 1 do
        local res = GetResourceByFindIndex(i)
        if res and GetResourceState(res) == 'started' and GetResourceMetadata(res, 'loe_vd_pack', 0) == 'yes' then
            local models = 0
            for j = 0, GetNumResourceMetadata(res, 'loe_vd_surface') - 1 do
                local def = loadDef(res, GetResourceMetadata(res, 'loe_vd_surface', j))
                if def then
                    Packs.byModel[def.hash] = def
                    models = models + 1
                end
            end
            Packs.list[#Packs.list + 1] = { name = res, models = models }
        end
    end
    Packs.count = #Packs.list
    local eq = VD.LoadEquipmentPacks()
    VD.debug(('%d paket, %d model, %d paket ekipmanı'):format(Packs.count, Packs.modelCount(), eq))
end

function Packs.modelCount()
    local n = 0
    for _ in pairs(Packs.byModel) do n = n + 1 end
    return n
end

local function bboxOf(model)
    local mn, mx = GetModelDimensions(model)
    return { min = { x = mn.x, y = mn.y, z = mn.z }, max = { x = mx.x, y = mx.y, z = mx.z } }
end

-- Bir araç için yüzey bilgisi
--   kind: 'shell' (paket), 'livery' (vanilla doku, 2B), 'decal' (deneysel önizleme), 'none'
function Packs.surfaceFor(veh)
    local model = GetEntityModel(veh)
    local p = Packs.byModel[model]
    if p then
        local template = type(p.template) == 'string' and ('https://cfx-nui-%s/%s'):format(p.resource, p.template) or nil
        return { kind = 'shell', pack = p, charts = p.charts, size = p.size, bbox = p.bbox or bboxOf(model), name = p.resource, template = template }
    end
    local lv = Config.Liveries[VD.modelName(veh)]
    if lv then
        return { kind = 'livery', cfg = lv, charts = {}, size = Config.Canvas.size, bbox = bboxOf(model) }
    end
    local bbox = bboxOf(model)
    return {
        kind = Config.Decals.enabled and 'decal' or 'none',
        charts = VD.Layout.compute(bbox.min, bbox.max, Config.Canvas.size),
        size = Config.Canvas.size,
        bbox = bbox,
    }
end

AddEventHandler('onClientResourceStart', function(res)
    if res ~= VD.Resource and GetResourceMetadata(res, 'loe_vd_pack', 0) == 'yes' then
        Packs.scan()
        if World and World.refreshAll then World.refreshAll() end
    end
end)

AddEventHandler('onClientResourceStop', function(res)
    if res ~= VD.Resource and Packs.list and GetResourceMetadata(res, 'loe_vd_pack', 0) == 'yes' then
        if World and World.releaseAll then World.releaseAll() end
        SetTimeout(500, function()
            Packs.scan()
            if World and World.refreshAll then World.refreshAll() end
        end)
    end
end)
