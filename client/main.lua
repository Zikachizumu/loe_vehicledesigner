-- Komutlar, tuş ataması, export'lar.

local function open() Editor.open() end

RegisterCommand(Config.Command, open, false)
for _, alias in ipairs(Config.CommandAliases or {}) do RegisterCommand(alias, open, false) end
RegisterKeyMapping(Config.Command, L('title'), 'keyboard', Config.OpenKey or '')

-- Başka resource'lar (garaj, mekanik menüsü) tasarımcıyı açabilir: exports.loe_vehicledesigner:Open()
exports('Open', open)
exports('IsOpen', function() return Editor.active end)
exports('Close', function() Editor.close(true) end)

-- Takılı kalma durumunda: /vdkapat
RegisterCommand('vdkapat', function()
    if Editor.active then Editor.close(true) else SetNuiFocus(false, false) end
end, false)

-- Vanilla livery dokularını bulmaya çalışır (Config.Liveries için). Sonuç F8 konsoluna yazılır.
RegisterCommand('vdscan', function()
    local veh = GetVehiclePedIsIn(PlayerPedId(), false)
    if veh == 0 then VD.notify(L('not_in_vehicle'), 'error') return end
    local m = VD.modelName(veh)
    local txds = { m, m .. '+hi' }
    local patterns = {
        function(i) return ('%s_sign_%d'):format(m, i) end,
        function(i) return ('sign_%d'):format(i) end,
        function(i) return ('%s_livery_%d'):format(m, i) end,
        function(i) return ('%s_livery%d'):format(m, i) end,
        function(i) return ('livery_%d'):format(i) end,
        function(i) return ('livery%d'):format(i) end,
        function(i) return ('%s_sign%d'):format(m, i) end,
    }
    local found = {}
    for _, txd in ipairs(txds) do
        RequestStreamedTextureDict(txd, false)
        local t = GetGameTimer() + 1500
        while not HasStreamedTextureDictLoaded(txd) and GetGameTimer() < t do Wait(50) end
        for _, pat in ipairs(patterns) do
            for i = 1, 16 do
                local name = pat(i)
                local res = GetTextureResolution(txd, name)
                if res and res.x > 4 then found[#found + 1] = ('%s / %s (%dx%d)'):format(txd, name, math.floor(res.x), math.floor(res.y)) end
            end
        end
    end
    print(('[%s] vdscan %s: livery count=%d, mod48=%d'):format(VD.Resource, m, GetVehicleLiveryCount(veh), GetNumVehicleMods(veh, 48)))
    for _, f in ipairs(found) do print('  ' .. f) end
    if #found == 0 then VD.notify(L('scan_none'), 'error') else VD.notify(L('scan_found', #found)) end
end, false)

-- Yüzey paketi geliştirirken: chart'ları ve ışın isabetini görselleştir (/vddebug)
local debugOn = false
RegisterCommand('vddebug', function()
    debugOn = not debugOn
    if not debugOn then return end
    CreateThread(function()
        while debugOn do
            local veh = GetVehiclePedIsIn(PlayerPedId(), false)
            if veh ~= 0 then
                local surf = Packs.surfaceFor(veh)
                local mn, mx = surf.bbox.min, surf.bbox.max
                local corners = {
                    { mn.x, mn.y, mn.z }, { mx.x, mn.y, mn.z }, { mx.x, mx.y, mn.z }, { mn.x, mx.y, mn.z },
                    { mn.x, mn.y, mx.z }, { mx.x, mn.y, mx.z }, { mx.x, mx.y, mx.z }, { mn.x, mx.y, mx.z },
                }
                local w = {}
                for i, c in ipairs(corners) do w[i] = GetOffsetFromEntityInWorldCoords(veh, c[1], c[2], c[3]) end
                local edges = { { 1, 2 }, { 2, 3 }, { 3, 4 }, { 4, 1 }, { 5, 6 }, { 6, 7 }, { 7, 8 }, { 8, 5 }, { 1, 5 }, { 2, 6 }, { 3, 7 }, { 4, 8 } }
                for _, e in ipairs(edges) do
                    DrawLine(w[e[1]].x, w[e[1]].y, w[e[1]].z, w[e[2]].x, w[e[2]].y, w[e[2]].z, 255, 46, 147, 255)
                end
            end
            Wait(0)
        end
    end)
end, false)
