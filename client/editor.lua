-- Tasarımcı oturumu: aç/kapat, NUI geri çağrıları, araca tıklama (ışın), canlı önizleme.

Editor = { active = false }

local S = {}
local uploads = {}

local function nui(action, data)
    data = data or {}
    data.action = action
    SendNUIMessage(data)
end

function Editor.equipment() return S.equip or {} end

-- ------------------------------------------------------------------ açma koşulları
local function inZone(pos)
    local zones = Config.Access.zones or {}
    if #zones == 0 then return true end
    for _, z in ipairs(zones) do
        if #(pos - z.coords) <= (z.radius or 20.0) then return true end
    end
    return false
end

local function localCheck()
    local ped = PlayerPedId()
    local veh = GetVehiclePedIsIn(ped, false)
    if veh == 0 or not DoesEntityExist(veh) then return nil, L('not_in_vehicle') end
    if Config.Access.requireDriver and GetPedInVehicleSeat(veh, -1) ~= ped then return nil, L('not_in_vehicle') end
    if GetEntitySpeed(veh) > (Config.Access.maxSpeed or 1.0) then return nil, L('moving') end
    if not inZone(GetEntityCoords(veh)) then return nil, L('no_zone') end
    return veh
end

local function catalogue()
    local out = {}
    for _, it in ipairs(VD.Equipment) do
        local ok = true
        for _, p in ipairs(it.props or {}) do
            if not IsModelInCdimage(joaat(p.m)) then ok = false break end
        end
        if ok then
            out[#out + 1] = { id = it.id, cat = it.cat, tr = it.tr, en = it.en, icon = it.icon, colors = it.colors, roof = it.roof, text = it.text }
        end
    end
    return out
end

local function trimPlate(p) return ((p or ''):gsub('^%s+', ''):gsub('%s+$', '')) end

-- ------------------------------------------------------------------ aç
function Editor.open()
    if Editor.active then VD.notify(L('busy'), 'error') return end
    local veh, err = localCheck()
    if not veh then VD.notify(err, 'error') return end
    if not NetworkGetEntityIsNetworked(veh) then NetworkRegisterEntityAsNetworked(veh) end
    local netId = NetworkGetNetworkIdFromEntity(veh)
    local label, name = VD.vehicleLabel(GetEntityModel(veh))
    local res = lib.callback.await('loevd:open', false, netId, label)
    if not res or not res.ok then
        VD.notify((res and res.error) or L('no_access'), 'error')
        return
    end

    Editor.active = true
    S = {
        veh = veh, netId = netId, model = GetEntityModel(veh), label = label,
        equip = {}, test = false, tilt = false, placing = nil,
        snap = Tuning.snapshot(veh),
    }
    Editor.veh = veh
    World.setEditing(veh)
    FreezeEntityPosition(veh, true)
    SetVehicleEngineOn(veh, false, true, true)

    S.surf = Packs.surfaceFor(veh)
    local design = res.design
    S.design = design and World.liveryPart(design) or { v = 1, size = Config.Canvas.size, base = { color = nil }, layers = {} }
    S.equip = design and design.equipment or {}
    if S.surf.kind ~= 'none' then
        S.inst = Backends.attach(veh, S.surf, 'edit:' .. netId, S.design)
    end
    Equipment.setEdit(veh, S.equip, nil)
    Cam.start(veh)

    local mn, mx = GetModelDimensions(S.model)
    local notice
    if S.surf.kind == 'shell' then notice = L('surface_loading')
    elseif S.surf.kind == 'decal' then notice = L('surface_decal')
    elseif S.surf.kind == 'none' then notice = L('surface_none') end

    nui('open', {
        locale = Config.Locale,
        accent = VD.accentHex(),
        vehicle = {
            label = label, name = name, plate = trimPlate(GetVehicleNumberPlateText(veh)),
            extras = Tuning.extras(veh), current = Tuning.current(veh),
            bounds = { min = { mn.x, mn.y, mn.z }, max = { mx.x, mx.y, mx.z } },
        },
        surface = {
            kind = S.surf.kind, charts = S.surf.charts or {}, size = S.surf.size,
            texture = (S.surf.kind == 'decal') and (Config.Decals.resolution or 1024) or Config.Canvas.texture,
            pack = S.surf.name, packs = Packs.count,
        },
        design = design,
        meta = res.meta,
        perms = res.perms,
        limits = { layers = Config.Limits.layers, equipment = Config.Limits.equipment },
        fonts = Config.Fonts,
        catalogue = catalogue(),
        categories = VD.EquipmentCategories,
        notice = notice,
    })
    SetNuiFocus(true, true)

    CreateThread(function()
        while Editor.active do
            if not DoesEntityExist(S.veh) then Editor.close(true) break end
            Cam.update()
            HideHudAndRadarThisFrame()
            Equipment.drawEditGhosts()
            if S.test then Equipment.drawLights(S.veh, S.equip, GetGameTimer()) end
            Wait(0)
        end
    end)
end

-- ------------------------------------------------------------------ kapat
function Editor.close(discard)
    if not Editor.active then return end
    Editor.active = false
    local veh = S.veh
    if discard and veh and DoesEntityExist(veh) then Tuning.restore(veh, S.snap) end
    if S.inst then Backends.detach(S.inst) end
    Equipment.clearEdit()
    Cam.stop()
    SetNuiFocus(false, false)
    nui('close')
    if veh and DoesEntityExist(veh) then FreezeEntityPosition(veh, false) end
    TriggerServerEvent('loevd:closed', S.netId)
    S = {}
    Editor.veh = nil
    World.setEditing(nil)
end

-- ------------------------------------------------------------------ ışın / seçim
local function ray(x, y)
    return VD.screenRay(Cam.handle, x, y)
end

local function hitLocal(x, y)
    local from, dir = ray(x, y)
    local hit, n = VD.raycastVehicle(from, dir, S.veh, 40.0)
    if not hit then return nil, nil, from, dir end
    local lp, ln = VD.toLocal(S.veh, hit, n)
    return lp, ln, from, dir, hit
end

local function arr(v) return { VD.round(v.x, 4), VD.round(v.y, 4), VD.round(v.z, 4) } end

local function tiltRot(n, yaw)
    return { VD.round(-math.deg(math.atan(n.y, n.z)), 1), VD.round(math.deg(math.atan(n.x, n.z)), 1), yaw or 0.0 }
end

local function designPick(phase, d)
    local lp, ln = hitLocal(d.x, d.y)
    if not lp then nui('pick', { phase = phase, hit = false }) return end
    nui('pick', { phase = phase, hit = true, lp = arr(lp), ln = arr(ln) })
end

local function findEquip(uid)
    for _, e in ipairs(S.equip) do if e.uid == uid then return e end end
end

local function equipDown(d)
    local lp, ln, from, dir, hit = hitLocal(d.x, d.y)
    if S.placing then
        if not lp then return end
        nui('equipPick', { phase = 'place', pos = arr(lp), rot = S.tilt and tiltRot(ln, 0.0) or { 0, 0, 0 }, shift = d.shift == true })
        return
    end
    local uid = Equipment.pickEdit(from, dir, hit and #(hit - from) or nil)
    S.dragEquip = uid
    nui('equipPick', { phase = 'select', uid = uid })
end

local function equipDrag(d)
    if not S.dragEquip then return end
    local lp, ln = hitLocal(d.x, d.y)
    if not lp then return end
    local e = findEquip(S.dragEquip)
    nui('equipPick', { phase = 'move', uid = S.dragEquip, pos = arr(lp), rot = S.tilt and tiltRot(ln, e and e.rot[3] or 0.0) or nil })
    S.dragMoved = true
end

local function onMouse(d)
    if d.type == 'wheel' then Cam.zoom(tonumber(d.delta) or 0) return end
    local x, y = tonumber(d.x) or 0.5, tonumber(d.y) or 0.5
    if d.type == 'down' then
        S.mx, S.my = x, y
        if d.btn == 2 then S.rmb = true return end
        if d.btn ~= 0 then return end
        S.lmb = true
        S.dragMoved = false
        if d.mode == 'equip' then equipDown(d) else designPick('down', d) end
    elseif d.type == 'move' then
        local dx, dy = x - (S.mx or x), y - (S.my or y)
        S.mx, S.my = x, y
        if S.rmb then Cam.orbit(dx, dy) end
        if S.lmb then
            if d.mode == 'equip' then equipDrag(d) else designPick('drag', d) end
        end
    elseif d.type == 'up' then
        if d.btn == 2 then S.rmb = false return end
        if d.btn ~= 0 or not S.lmb then return end
        S.lmb = false
        if d.mode == 'equip' then
            if S.dragEquip and S.dragMoved then nui('equipPick', { phase = 'up' }) end
            S.dragEquip = nil
        else
            nui('pick', { phase = 'up' })
        end
    end
end

-- ------------------------------------------------------------------ NUI geri çağrıları
local function cbOk(cb) cb({ ok = true }) end

RegisterNUICallback('nuiReady', function(_, cb) cbOk(cb) end)
RegisterNUICallback('tool', function(_, cb) cbOk(cb) end)
RegisterNUICallback('select', function(_, cb) cbOk(cb) end)
RegisterNUICallback('view2d', function(_, cb) cbOk(cb) end)

RegisterNUICallback('viewport', function(d, cb)
    cbOk(cb)
    if Editor.active and Cam.handle then onMouse(d) end
end)

RegisterNUICallback('design', function(d, cb)
    cbOk(cb)
    if not Editor.active or type(d.design) ~= 'table' then return end
    S.design = d.design
    if S.inst then Backends.update(S.inst, S.design) end
end)

-- prop yüklemesi bekleyebildiği için eşitlemeler sıraya alınır (aynı anda iki eşitleme çift prop üretir)
local equipBusy, equipPending = false, nil
local function syncEquip(sel)
    if equipBusy then equipPending = { sel = sel } return end
    equipBusy = true
    Equipment.setEdit(S.veh, S.equip, sel)
    while equipPending and Editor.active do
        local p = equipPending
        equipPending = nil
        Equipment.setEdit(S.veh, S.equip, p.sel)
    end
    equipBusy = false
end

RegisterNUICallback('equipment', function(d, cb)
    cbOk(cb)
    if not Editor.active then return end
    S.equip = type(d.list) == 'table' and d.list or {}
    S.placing = d.placing
    S.test = d.test == true
    S.tilt = d.tilt == true
    syncEquip(d.sel)
end)

RegisterNUICallback('tuning', function(d, cb)
    cbOk(cb)
    if not Editor.active or type(d.tuning) ~= 'table' then return end
    if d.tuning.paint ~= 'custom' and S.snap then
        -- "mevcudu koru": açılıştaki boyaya dön
        local s = S.snap
        ClearVehicleCustomPrimaryColour(S.veh)
        ClearVehicleCustomSecondaryColour(S.veh)
        SetVehicleColours(S.veh, s.c1, s.c2)
        if s.cp then SetVehicleCustomPrimaryColour(S.veh, s.cp[1], s.cp[2], s.cp[3]) end
        if s.cs then SetVehicleCustomSecondaryColour(S.veh, s.cs[1], s.cs[2], s.cs[3]) end
    end
    Tuning.apply(S.veh, d.tuning)
end)

RegisterNUICallback('cam', function(d, cb)
    cbOk(cb)
    if not Editor.active then return end
    if d.preset then Cam.preset(d.preset)
    elseif d.chart then Cam.chart(d.chart)
    elseif type(d.focus) == 'table' then Cam.focus(d.focus) end
end)

RegisterNUICallback('centerPick', function(_, cb)
    if not Editor.active then cb({}) return end
    local lp, ln = hitLocal(0.5, 0.5)
    local view = Cam.viewDir()
    cb({ hit = lp ~= nil, lp = lp and arr(lp), ln = ln and arr(ln), view = view and arr(view) })
end)

RegisterNUICallback('equipRoof', function(d, cb)
    if not Editor.active then cb({}) return end
    local mn, mx = GetModelDimensions(S.model)
    local cy = (mn.y + mx.y) / 2 - 0.15
    local top = GetOffsetFromEntityInWorldCoords(S.veh, 0.0, cy, mx.z + 1.0)
    local hit, n = VD.raycastVehicle(top, vector3(0.0, 0.0, -1.0), S.veh, 3.0)
    local lp
    if hit then lp = VD.toLocal(S.veh, hit, n) else lp = vector3(0.0, cy, mx.z) end
    cb({ pos = arr(lp), rot = { 0, 0, 0 } })
end)

RegisterNUICallback('save', function(d, cb)
    if not Editor.active then cb({ ok = false }) return end
    d.netId = S.netId
    d.label = S.label
    local r = lib.callback.await('loevd:save', false, d)
    if r and r.ok and type(d.design) == 'table' then
        World.cache(r.id, r.rev, d.design)
        S.snap = Tuning.snapshot(S.veh) -- kaydedilen modifiye artık "orijinal"
    end
    cb(r or { ok = false })
end)

RegisterNUICallback('library', function(d, cb)
    if not Editor.active then cb({}) return end
    d.netId = S.netId
    cb(lib.callback.await('loevd:library', false, d) or {})
end)

RegisterNUICallback('ai', function(d, cb)
    if not Editor.active then cb({ ok = false }) return end
    local r = lib.callback.await('loevd:ai', false, tostring(d.prompt or ''))
    if not r or not r.ok then cb(r or { ok = false }) return end
    local data = Images.await(r.id)
    if not data then cb({ ok = false, error = L('ai_failed', 'image') }) return end
    cb({ ok = true, id = r.id, data = data })
end)

RegisterNUICallback('uploadImage', function(d, cb)
    if not Editor.active or type(d.data) ~= 'string' then cb({ ok = false }) return end
    local req = ('%d_%d'):format(GetGameTimer(), math.random(1, 1e6))
    local p = promise.new()
    uploads[req] = p
    TriggerLatentServerEvent('loevd:upload', 250000, req, d.data)
    SetTimeout(60000, function() if uploads[req] then uploads[req] = nil; p:resolve({ ok = false }) end end)
    local r = Citizen.Await(p)
    if r.ok then Images.store(r.id, d.data) end
    cb(r)
end)

RegisterNetEvent('loevd:uploaded', function(req, id, err)
    local p = uploads[req]
    if not p then return end
    uploads[req] = nil
    p:resolve(id and { ok = true, id = tostring(id) } or { ok = false, error = err })
end)

RegisterNUICallback('getImage', function(d, cb)
    local data = d.id and Images.await(tostring(d.id))
    cb({ data = data })
end)

RegisterNUICallback('image', function(d, cb)
    cbOk(cb)
    if d.id and type(d.data) == 'string' then Images.store(tostring(d.id), d.data) end
end)

RegisterNUICallback('close', function(d, cb)
    cbOk(cb)
    Editor.close(d and d.discard == true)
end)

AddEventHandler('onResourceStop', function(res)
    if res ~= VD.Resource or not Editor.active then return end
    SetNuiFocus(false, false)
    if S.veh and DoesEntityExist(S.veh) then
        FreezeEntityPosition(S.veh, false)
        Tuning.restore(S.veh, S.snap)
    end
    Cam.stop()
end)
