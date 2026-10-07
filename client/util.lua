VD = VD or {}

function VD.notify(msg, kind)
    if lib and lib.notify then
        lib.notify({ title = L('title'), description = msg, type = kind or 'inform' })
    else
        BeginTextCommandThefeedPost('STRING')
        AddTextComponentSubstringPlayerName(msg)
        EndTextCommandThefeedPostTicker(false, true)
    end
end

-- ------------------------------------------------------------------ vektör yardımcıları
local function v3(t)
    if type(t) == 'vector3' then return t end
    return vector3((t[1] or t.x or 0) + 0.0, (t[2] or t.y or 0) + 0.0, (t[3] or t.z or 0) + 0.0)
end
VD.v3 = v3

function VD.norm(v)
    local l = #v
    if l < 1e-6 then return vector3(0.0, 0.0, 1.0) end
    return v / l
end

function VD.cross(a, b)
    return vector3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x)
end

function VD.round(v, d)
    local k = 10 ^ (d or 0)
    return math.floor(v * k + 0.5) / k
end

-- Euler (derece, GTA sırası: önce Z, sonra X, sonra Y) ile yerel vektörü döndür
function VD.rotate(rot, v)
    local rx, ry, rz = math.rad(rot[1] or 0), math.rad(rot[2] or 0), math.rad(rot[3] or 0)
    local x, y, z = v[1] or v.x, v[2] or v.y, v[3] or v.z
    -- Y (roll)
    local cy, sy = math.cos(ry), math.sin(ry)
    x, z = x * cy + z * sy, -x * sy + z * cy
    -- X (pitch)
    local cx, sx = math.cos(rx), math.sin(rx)
    y, z = y * cx - z * sx, y * sx + z * cx
    -- Z (yaw)
    local cz, sz = math.cos(rz), math.sin(rz)
    x, y = x * cz - y * sz, x * sz + y * cz
    return { x, y, z }
end

function VD.rotToDir(rot)
    local z, x = math.rad(rot.z), math.rad(rot.x)
    local n = math.abs(math.cos(x))
    return vector3(-math.sin(z) * n, math.cos(z) * n, math.sin(x))
end

-- Ekran noktası (0..1) → kameradan dünya ışını (yön)
function VD.screenRay(cam, sx, sy)
    local pos = GetCamCoord(cam)
    local rot = GetCamRot(cam, 2)
    local fov = GetCamFov(cam)
    local w, h = GetActiveScreenResolution()
    local aspect = (w > 0 and h > 0) and (w / h) or (16 / 9)
    local fwd = VD.rotToDir(rot)
    local right = VD.norm(vector3(fwd.y, -fwd.x, 0.0))
    local up = VD.cross(right, fwd)
    local ty = math.tan(math.rad(fov) / 2)
    local tx = ty * aspect
    local nx = (sx * 2.0 - 1.0) * tx
    local ny = (1.0 - sy * 2.0) * ty
    return pos, VD.norm(fwd + right * nx + up * ny)
end

-- Yalnızca araçlara karşı ışın; isabet hedef araç değilse nil
function VD.raycastVehicle(from, dir, veh, dist)
    local to = from + dir * (dist or 30.0)
    local h = StartExpensiveSynchronousShapeTestLosProbe(from.x, from.y, from.z, to.x, to.y, to.z, 2, PlayerPedId(), 4)
    local _, hit, pos, normal, ent = GetShapeTestResult(h)
    if hit == 1 and ent == veh then return pos, normal end
    return nil
end

-- Dünya nokta + normal → araç yerel nokta + normal
function VD.toLocal(veh, pos, normal)
    local lp = GetOffsetFromEntityGivenWorldCoords(veh, pos.x, pos.y, pos.z)
    local tip = pos + normal
    local ln = GetOffsetFromEntityGivenWorldCoords(veh, tip.x, tip.y, tip.z) - lp
    return lp, VD.norm(ln)
end

function VD.localDir(veh, dir)
    local o = GetEntityCoords(veh)
    local a = GetOffsetFromEntityGivenWorldCoords(veh, o.x, o.y, o.z)
    local b = GetOffsetFromEntityGivenWorldCoords(veh, o.x + dir.x, o.y + dir.y, o.z + dir.z)
    return VD.norm(b - a)
end

function VD.worldDir(veh, ldir)
    local a = GetOffsetFromEntityInWorldCoords(veh, 0.0, 0.0, 0.0)
    local b = GetOffsetFromEntityInWorldCoords(veh, ldir.x + 0.0, ldir.y + 0.0, ldir.z + 0.0)
    return VD.norm(b - a)
end

-- Işın ile nokta arası en kısa mesafe (ekipman seçimi)
function VD.rayPointDist(from, dir, p)
    local w = p - from
    local t = w.x * dir.x + w.y * dir.y + w.z * dir.z
    if t < 0 then return #w, t end
    local c = from + dir * t
    return #(p - c), t
end

function VD.loadModel(model)
    local hash = type(model) == 'number' and model or joaat(model)
    if not IsModelInCdimage(hash) then return nil end
    if HasModelLoaded(hash) then return hash end
    RequestModel(hash)
    local t = GetGameTimer() + 5000
    while not HasModelLoaded(hash) do
        if GetGameTimer() > t then return nil end
        Wait(0)
    end
    return hash
end

function VD.vehicleLabel(model)
    local name = GetDisplayNameFromVehicleModel(model)
    local label = GetLabelText(name)
    if not label or label == 'NULL' or label == '' then label = name end
    return label, name
end

function VD.modelName(veh)
    local ok, name = pcall(GetEntityArchetypeName, veh)
    if ok and name and name ~= '' then return name end
    local _, n = VD.vehicleLabel(GetEntityModel(veh))
    return (n or ''):lower()
end
