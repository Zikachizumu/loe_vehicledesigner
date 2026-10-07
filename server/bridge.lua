-- Framework köprüsü: Qbox (qbx_core) öncelikli, QBCore ve ESX desteklenir; hiçbiri yoksa lisans kimliği.

Bridge = { name = 'standalone' }

local QBCore, ESX

CreateThread(function()
    if GetResourceState('qbx_core') == 'started' then
        Bridge.name = 'qbx'
    elseif GetResourceState('qb-core') == 'started' then
        Bridge.name = 'qb'
        local ok, obj = pcall(function() return exports['qb-core']:GetCoreObject() end)
        QBCore = ok and obj or nil
    elseif GetResourceState('es_extended') == 'started' then
        Bridge.name = 'esx'
        local ok, obj = pcall(function() return exports.es_extended:getSharedObject() end)
        ESX = ok and obj or nil
    end
    VD.debug('framework: ' .. Bridge.name)
end)

local function license(src)
    for _, id in ipairs(GetPlayerIdentifiers(src)) do
        if id:sub(1, 8) == 'license:' then return id end
    end
    return 'src:' .. tostring(src)
end

local function qbxPlayer(src)
    local ok, p = pcall(function() return exports.qbx_core:GetPlayer(src) end)
    return ok and p or nil
end

-- Oyuncu kimliği (tasarım sahibi)
function Bridge.identifier(src)
    if Bridge.name == 'qbx' then
        local p = qbxPlayer(src)
        if p and p.PlayerData then return p.PlayerData.citizenid end
    elseif Bridge.name == 'qb' and QBCore then
        local p = QBCore.Functions.GetPlayer(src)
        if p then return p.PlayerData.citizenid end
    elseif Bridge.name == 'esx' and ESX then
        local p = ESX.GetPlayerFromId(src)
        if p then return p.identifier end
    end
    return license(src)
end

-- { name, grade, onduty }
function Bridge.job(src)
    if Bridge.name == 'qbx' or Bridge.name == 'qb' then
        local p = Bridge.name == 'qbx' and qbxPlayer(src) or (QBCore and QBCore.Functions.GetPlayer(src))
        local j = p and p.PlayerData and p.PlayerData.job
        if j then
            local grade = type(j.grade) == 'table' and (j.grade.level or 0) or (tonumber(j.grade) or 0)
            return { name = j.name, grade = grade, onduty = j.onduty ~= false }
        end
    elseif Bridge.name == 'esx' and ESX then
        local p = ESX.GetPlayerFromId(src)
        if p and p.job then return { name = p.job.name, grade = tonumber(p.job.grade) or 0, onduty = true } end
    end
    return nil
end

function Bridge.name_of(src)
    return GetPlayerName(src) or ('#' .. src)
end

-- Plakadaki aracın sahibi bu oyuncu mu?
function Bridge.ownsPlate(src, plate)
    if not plate then return false end
    local ident = Bridge.identifier(src)
    local ok, row
    if Bridge.name == 'esx' then
        ok, row = pcall(MySQL.single.await, "SELECT owner FROM owned_vehicles WHERE REPLACE(plate, ' ', '') = ? LIMIT 1", { plate })
        return ok and row and row.owner == ident or false
    end
    ok, row = pcall(MySQL.single.await, "SELECT citizenid FROM player_vehicles WHERE REPLACE(plate, ' ', '') = ? LIMIT 1", { plate })
    return ok and row and row.citizenid == ident or false
end
