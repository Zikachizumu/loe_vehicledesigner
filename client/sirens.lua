-- Ekipmanlı araçlarda siren / ışık.
--   E dokun  : siren (ışık + ses) aç/kapa
--   E basılı : korna (airhorn)
--   J        : sessiz ışık
--   R        : siren tonu
-- Durum aracın state bag'inde tutulur ('loevd:els' = { l = ışık, s = ses, t = ton, h = korna }) ve
-- sunucu tarafından yazılır (sürücü doğrulaması); her istemci sesi/ışığı kendisi çalar/çizer.

if not Config.Sirens.enabled then return end

Sirens = { states = {}, sounds = {}, horns = {} }

local cfg = Config.Sirens
local HORN = 86          -- INPUT_VEH_HORN (E)
local CINCAM = 80        -- INPUT_VEH_CIN_CAM (R)

local my = { veh = nil, state = nil, pressAt = nil, horn = false, lastSend = 0 }

local function getState(veh)
    local st = Entity(veh).state['loevd:els']
    if type(st) ~= 'table' then return { l = false, s = false, t = 1, h = false } end
    return { l = st.l == true, s = st.s == true, t = tonumber(st.t) or 1, h = st.h == true }
end

local function send(veh, st)
    if not NetworkGetEntityIsNetworked(veh) then
        Sirens.states[veh] = st
        return
    end
    my.lastSend = GetGameTimer()
    Sirens.states[veh] = st -- yerel tahmin, state bag gelince düzelir
    TriggerServerEvent('loevd:els', NetworkGetNetworkIdFromEntity(veh), st)
end

-- ------------------------------------------------------------------ sürücü kontrolleri
local function equippedDriverVehicle()
    local ped = PlayerPedId()
    local veh = GetVehiclePedIsIn(ped, false)
    if veh == 0 or GetPedInVehicleSeat(veh, -1) ~= ped then return nil end
    if Editor and Editor.active then return nil end
    local list = World.equipmentOf(veh)
    if list and Equipment.hasLights(list) then return veh end
end

RegisterCommand('loevd_silent', function()
    if not my.veh then return end
    local st = getState(my.veh)
    if st.l then st.l, st.s = false, false else st.l, st.s = true, false end
    send(my.veh, st)
end, false)
RegisterKeyMapping('loevd_silent', 'LOE Tasarım: sessiz ışık / silent lights', 'keyboard', cfg.silentKey)

RegisterCommand('loevd_tone', function()
    if not my.veh then return end
    local st = getState(my.veh)
    st.t = (st.t % #cfg.tones) + 1
    send(my.veh, st)
    VD.notify(L('siren_tone', st.t))
end, false)
RegisterKeyMapping('loevd_tone', 'LOE Tasarım: siren tonu / siren tone', 'keyboard', cfg.toneKey)

CreateThread(function()
    while true do
        my.veh = equippedDriverVehicle()
        if not my.veh then
            if my.horn and my.lastVeh and DoesEntityExist(my.lastVeh) then
                local st = getState(my.lastVeh); st.h = false; send(my.lastVeh, st)
            end
            my.horn, my.pressAt, my.lastVeh = false, nil, nil
            Wait(500)
        else
            my.lastVeh = my.veh
            DisableControlAction(0, HORN, true)
            DisableControlAction(0, CINCAM, true)
            local now = GetGameTimer()
            if IsDisabledControlJustPressed(0, HORN) then my.pressAt = now end
            if my.pressAt and IsDisabledControlPressed(0, HORN) and not my.horn and now - my.pressAt >= cfg.tapMs then
                my.horn = true
                local st = getState(my.veh); st.h = true; send(my.veh, st)
            end
            if my.pressAt and IsDisabledControlJustReleased(0, HORN) then
                local st = getState(my.veh)
                if my.horn then
                    st.h = false
                elseif st.l and st.s then
                    st.l, st.s = false, false
                else
                    st.l, st.s = true, true
                end
                my.horn, my.pressAt = false, nil
                send(my.veh, st)
            end
            Wait(0)
        end
    end
end)

-- ------------------------------------------------------------------ state bag
AddStateBagChangeHandler('loevd:els', nil, function(bagName, _, value)
    local veh = GetEntityFromStateBagName(bagName)
    if veh == 0 then return end
    if type(value) ~= 'table' then Sirens.states[veh] = nil return end
    Sirens.states[veh] = { l = value.l == true, s = value.s == true, t = tonumber(value.t) or 1, h = value.h == true }
end)

-- ------------------------------------------------------------------ ses
local function stopSound(tbl, veh)
    local s = tbl[veh]
    if not s then return end
    StopSound(s.id)
    ReleaseSoundId(s.id)
    tbl[veh] = nil
end

local function playSound(tbl, veh, name)
    local s = tbl[veh]
    if s and s.name == name then return end
    stopSound(tbl, veh)
    local id = GetSoundId()
    PlaySoundFromEntity(id, name, veh, 0, false, 0)
    tbl[veh] = { id = id, name = name }
end

CreateThread(function()
    while true do
        local pos = GetEntityCoords(PlayerPedId())
        for veh, st in pairs(Sirens.states) do
            local alive = DoesEntityExist(veh)
            local near = alive and #(GetEntityCoords(veh) - pos) <= cfg.drawDistance
            if not alive then Sirens.states[veh] = nil end
            if near and st.s and not st.h then
                playSound(Sirens.sounds, veh, cfg.tones[st.t] or cfg.tones[1])
            else
                stopSound(Sirens.sounds, veh)
            end
            if near and st.h then playSound(Sirens.horns, veh, cfg.horn) else stopSound(Sirens.horns, veh) end
        end
        for veh in pairs(Sirens.sounds) do if not Sirens.states[veh] then stopSound(Sirens.sounds, veh) end end
        for veh in pairs(Sirens.horns) do if not Sirens.states[veh] then stopSound(Sirens.horns, veh) end end
        Wait(200)
    end
end)

-- ------------------------------------------------------------------ ışıklar
CreateThread(function()
    while true do
        local active = false
        local pos = GetEntityCoords(PlayerPedId())
        local now = GetGameTimer()
        for veh, st in pairs(Sirens.states) do
            if st.l and DoesEntityExist(veh) and #(GetEntityCoords(veh) - pos) <= cfg.drawDistance then
                local list = World.equipmentOf(veh)
                if list then
                    Equipment.drawLights(veh, list, now)
                    active = true
                end
            end
        end
        Wait(active and 0 or 250)
    end
end)

AddEventHandler('onResourceStop', function(res)
    if res ~= VD.Resource then return end
    for veh in pairs(Sirens.sounds) do stopSound(Sirens.sounds, veh) end
    for veh in pairs(Sirens.horns) do stopSound(Sirens.horns, veh) end
end)
