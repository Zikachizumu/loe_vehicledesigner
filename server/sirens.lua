-- Siren / ışık durumu: yalnızca aracın sürücüsü değiştirebilir; durum aracın state bag'ine yazılır.

local last = {}

RegisterNetEvent('loevd:els', function(netId, st)
    local src = source
    local now = GetGameTimer()
    if last[src] and now - last[src] < 60 then return end
    last[src] = now
    if type(st) ~= 'table' then return end
    local veh = VD.vehicleOf(netId)
    if not veh or GetPedInVehicleSeat(veh, -1) ~= GetPlayerPed(src) then return end
    local tones = #Config.Sirens.tones
    local t = math.floor(tonumber(st.t) or 1)
    if t < 1 or t > tones then t = 1 end
    Entity(veh).state:set('loevd:els', { l = st.l == true, s = st.s == true, t = t, h = st.h == true }, true)
end)

AddEventHandler('playerDropped', function() last[source] = nil end)
