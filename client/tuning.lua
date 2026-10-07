-- Modifiye sekmesi: boya, cam filmi, neon, ekstralar.
-- Değerler aracın ağ sahibi tarafından uygulanır; oyun bunları diğer oyunculara senkronlar.

Tuning = {}

local function hex(r, g, b) return ('#%02x%02x%02x'):format(r or 0, g or 0, b or 0) end

function Tuning.extras(veh)
    local out = {}
    for i = 0, 20 do
        if DoesExtraExist(veh, i) then
            out[#out + 1] = { id = i, on = IsVehicleExtraTurnedOn(veh, i) == true or IsVehicleExtraTurnedOn(veh, i) == 1 }
        end
    end
    return out
end

-- Arayüzdeki "mevcut" değerler
function Tuning.current(veh)
    local pr, pg, pb
    if GetIsVehiclePrimaryColourCustom(veh) then pr, pg, pb = GetVehicleCustomPrimaryColour(veh)
    else pr, pg, pb = GetVehicleColor(veh) end
    local sr, sg, sb = 17, 17, 17
    if GetIsVehicleSecondaryColourCustom(veh) then sr, sg, sb = GetVehicleCustomSecondaryColour(veh) end
    local nr, ng, nb = GetVehicleNeonLightsColour(veh)
    local neonOn = false
    for i = 0, 3 do if IsVehicleNeonLightEnabled(veh, i) then neonOn = true break end end
    return {
        primary = hex(pr, pg, pb),
        secondary = hex(sr, sg, sb),
        tint = GetVehicleWindowTint(veh),
        neonOn = neonOn,
        neonColor = hex(nr, ng, nb),
    }
end

-- Tasarımcı açılırken alınır, "kaydetmeden çık" ile geri yüklenir
function Tuning.snapshot(veh)
    local c1, c2 = GetVehicleColours(veh)
    local s = {
        c1 = c1, c2 = c2,
        cp = GetIsVehiclePrimaryColourCustom(veh) and { GetVehicleCustomPrimaryColour(veh) } or nil,
        cs = GetIsVehicleSecondaryColourCustom(veh) and { GetVehicleCustomSecondaryColour(veh) } or nil,
        tint = GetVehicleWindowTint(veh),
        neon = {},
        neonColor = { GetVehicleNeonLightsColour(veh) },
        extras = {},
    }
    for i = 0, 3 do s.neon[i] = IsVehicleNeonLightEnabled(veh, i) and true or false end
    for _, e in ipairs(Tuning.extras(veh)) do s.extras[e.id] = e.on end
    return s
end

function Tuning.restore(veh, s)
    if not s or not DoesEntityExist(veh) then return end
    SetVehicleModKit(veh, 0)
    ClearVehicleCustomPrimaryColour(veh)
    ClearVehicleCustomSecondaryColour(veh)
    SetVehicleColours(veh, s.c1, s.c2)
    if s.cp then SetVehicleCustomPrimaryColour(veh, s.cp[1], s.cp[2], s.cp[3]) end
    if s.cs then SetVehicleCustomSecondaryColour(veh, s.cs[1], s.cs[2], s.cs[3]) end
    if s.tint and s.tint >= 0 then SetVehicleWindowTint(veh, s.tint) end
    for i = 0, 3 do SetVehicleNeonLightEnabled(veh, i, s.neon[i] == true) end
    SetVehicleNeonLightsColour(veh, s.neonColor[1], s.neonColor[2], s.neonColor[3])
    for id, on in pairs(s.extras) do
        if DoesExtraExist(veh, id) then SetVehicleExtra(veh, id, not on) end
    end
end

-- Tasarımın modifiye verisini uygula (yalnızca farklı olanları değiştirir)
function Tuning.apply(veh, tu)
    if type(tu) ~= 'table' or not DoesEntityExist(veh) then return end
    SetVehicleModKit(veh, 0)
    if tu.paint == 'custom' then
        local r, g, b = VD.hexToRgb(tu.primary)
        SetVehicleCustomPrimaryColour(veh, r, g, b)
        r, g, b = VD.hexToRgb(tu.secondary)
        SetVehicleCustomSecondaryColour(veh, r, g, b)
    end
    local tint = tonumber(tu.tint)
    if tint and tint >= 0 and tint <= 6 and GetVehicleWindowTint(veh) ~= tint then
        SetVehicleWindowTint(veh, tint)
    end
    if type(tu.neon) == 'table' then
        local on = tu.neon.on == true
        for i = 0, 3 do
            if (IsVehicleNeonLightEnabled(veh, i) and true or false) ~= on then SetVehicleNeonLightEnabled(veh, i, on) end
        end
        local r, g, b = VD.hexToRgb(tu.neon.color)
        SetVehicleNeonLightsColour(veh, r, g, b)
    end
    if type(tu.extras) == 'table' then
        for k, on in pairs(tu.extras) do
            local id = tonumber(k)
            if id and DoesExtraExist(veh, id) then
                local cur = IsVehicleExtraTurnedOn(veh, id)
                cur = cur == true or cur == 1
                if cur ~= (on == true) then SetVehicleExtra(veh, id, not on) end
            end
        end
    end
end
