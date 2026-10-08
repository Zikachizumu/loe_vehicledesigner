-- Dünyadaki araçlara kayıtlı tasarımları uygular.
--
-- Sunucu tüm atamaların küçük bir dizinini gönderir:
--   index.p[PLAKA] = { i = tasarım id, r = revizyon, m = model anahtarı }   ("yalnızca bu araç")
--   index.m[MODEL] = { i, r }                                               ("tüm <model> araçları")
-- Her istemci yakındaki araçları bu dizinle eşler (plaka önceliklidir), tasarım verisini bir kez çeker
-- ve kaplamayı / ekipmanı yerel olarak oluşturur. Modifiye (renk, neon, ekstra) yalnızca aracın ağ
-- sahibi tarafından bir kez uygulanır; oyun bunu herkese senkronlar.

World = {
    index = { p = {}, m = {} },
    designs = {},           -- [id] = { rev, data }
    renders = {},           -- [veh] = { key, id, data, inst, equip, tuned }
    editing = nil,          -- tasarımcıda açık araç (dünya döngüsü dokunmaz)
    ready = false,
}

local fetching = {}

function World.resolve(veh)
    local plate = VD.normalizePlate(GetVehicleNumberPlateText(veh))
    local mk = VD.modelKey(GetEntityModel(veh))
    local a = plate and World.index.p[plate]
    if a and (not a.m or a.m == mk) then return a, 'plate' end
    local b = World.index.m[mk]
    if b then return b, 'model' end
end

-- Önbellekte varsa veriyi döndürür (revizyon eskiyse yenisini arka planda çeker)
function World.getDesign(id, rev)
    local d = World.designs[id]
    if d and d.rev == rev then return d.data, d.rev end
    if not fetching[id] then
        fetching[id] = true
        CreateThread(function()
            local r = lib.callback.await('loevd:design', false, id)
            fetching[id] = nil
            if r and type(r.data) == 'table' then
                World.designs[id] = { rev = r.rev, data = r.data }
                World.kick()
            end
        end)
    end
    if d then return d.data, d.rev end
end

function World.cache(id, rev, data)
    World.designs[id] = { rev = rev, data = data }
end

local function liveryPart(data)
    return { v = 1, size = data.size or Config.Canvas.size, base = data.base, layers = data.layers or {} }
end
World.liveryPart = liveryPart

function World.drop(veh)
    local r = World.renders[veh]
    if not r then return end
    if r.inst then Backends.detach(r.inst) end
    if r.equip then Equipment.despawn(r.equip) end
    World.renders[veh] = nil
end

function World.releaseAll()
    for veh in pairs(World.renders) do World.drop(veh) end
end

function World.refreshAll()
    World.releaseAll()
    World.kick()
end

function World.setEditing(veh)
    World.editing = veh
    if veh then
        World.drop(veh)
        -- düzenlenen araca slot kalsın: aynı modelin dünya kaplamaları bırakılır, sonraki taramada boş slotlarla geri gelir
        local model = GetEntityModel(veh)
        for v in pairs(World.renders) do
            if DoesEntityExist(v) and GetEntityModel(v) == model then World.drop(v) end
        end
    end
    World.kick()
end

-- Sirenler için: bir aracın ekipman listesi (tasarımcıdaki araç dahil)
function World.equipmentOf(veh)
    if veh == World.editing and Editor and Editor.active then return Editor.equipment() end
    local r = World.renders[veh]
    if r and r.data then return r.data.equipment end
    local a = World.resolve(veh)
    if a then
        local d = World.designs[a.i]
        if d then return d.data.equipment end
    end
end

local kicked = false
function World.kick() kicked = true end

function World.tick()
    if not World.ready then return end
    local ped = PlayerPedId()
    local pos = GetEntityCoords(ped)
    local maxDist = math.max(Config.Render.distance, Config.Render.equipDistance)
    local cands = {}

    for _, veh in ipairs(GetGamePool('CVehicle')) do
        if veh ~= World.editing and DoesEntityExist(veh) then
            local dist = #(GetEntityCoords(veh) - pos)
            if dist <= maxDist then
                local a = World.resolve(veh)
                if a then
                    local data, rev = World.getDesign(a.i, a.r)
                    if data then
                        cands[#cands + 1] = { veh = veh, dist = dist, id = a.i, rev = rev, data = data }
                    end
                end
            end
        end
    end
    table.sort(cands, function(x, y) return x.dist < y.dist end)

    local want, liveries = {}, 0
    for _, c in ipairs(cands) do
        local w = { c = c, key = c.id .. ':' .. tostring(c.rev) }
        if c.dist <= Config.Render.distance and liveries < Config.Render.maxVehicles and #(c.data.layers or {}) > 0 then
            w.livery = true
            liveries = liveries + 1
        end
        w.equip = c.dist <= Config.Render.equipDistance and #(c.data.equipment or {}) > 0
        want[c.veh] = w
    end

    for veh, r in pairs(World.renders) do
        local w = want[veh]
        if not w or not DoesEntityExist(veh) or r.key ~= w.key then World.drop(veh) end
    end

    for veh, w in pairs(want) do
        local r = World.renders[veh]
        if not r then
            r = { key = w.key, id = w.c.id, data = w.c.data }
            World.renders[veh] = r
        end
        -- kaplama
        if w.livery and not r.inst then
            local surf = Packs.surfaceFor(veh)
            if surf.kind == 'shell' or surf.kind == 'livery' or (surf.kind == 'decal' and not Config.Decals.onlyEditing) then
                r.inst = Backends.attach(veh, surf, r.key, liveryPart(r.data))
            end
        elseif not w.livery and r.inst then
            Backends.detach(r.inst)
            r.inst = nil
        elseif r.inst then
            Backends.check(r.inst)
        end
        -- ekipman
        if w.equip and not r.equip then
            r.equip = Equipment.spawn(veh, r.data.equipment)
        elseif not w.equip and r.equip then
            Equipment.despawn(r.equip)
            r.equip = nil
        elseif r.equip then
            Equipment.check(r.equip)
        end
        -- modifiye: ağ sahibi bir kez uygular
        if r.data.tuning and not r.tuned and NetworkGetEntityIsNetworked(veh) and NetworkGetEntityOwner(veh) == PlayerId() then
            Tuning.apply(veh, r.data.tuning)
            r.tuned = true
        end
    end
end

-- ------------------------------------------------------------------ sunucudan dizin
RegisterNetEvent('loevd:index', function(idx)
    if type(idx) ~= 'table' then return end
    World.index = { p = idx.p or {}, m = idx.m or {} }
    World.kick()
end)

RegisterNetEvent('loevd:indexDelta', function(d)
    if type(d) ~= 'table' then return end
    local t = d.scope == 'plate' and World.index.p or World.index.m
    t[d.key] = d.v
    World.kick()
end)

CreateThread(function()
    while not NetworkIsSessionStarted() do Wait(500) end
    Wait(1500)
    Packs.scan()
    local idx = lib.callback.await('loevd:index', false)
    if type(idx) == 'table' then World.index = { p = idx.p or {}, m = idx.m or {} } end
    World.ready = true
    local last = 0
    while true do
        local now = GetGameTimer()
        if kicked or now - last >= Config.Render.tick then
            kicked = false
            last = now
            local ok, err = pcall(World.tick)
            if not ok then print(('[%s] world tick: %s'):format(VD.Resource, err)) end
        end
        Wait(100)
    end
end)

AddEventHandler('onResourceStop', function(res)
    if res == VD.Resource then World.releaseAll() end
end)
