-- Tasarımcı kamerası: araç etrafında yörünge (RMB), yakınlaştırma (tekerlek), hazır açılar.
-- Açılar araca göredir: yaw 0 = önden, 90 = soldan, 180 = arkadan, 270 = sağdan.

Cam = { handle = nil, veh = nil }

local st = {
    yaw = 35.0, pitch = 14.0, dist = 6.0,
    target = vector3(0.0, 0.0, 0.0),
    cYaw = 35.0, cPitch = 14.0, cDist = 6.0, cTarget = vector3(0.0, 0.0, 0.0),
    minDist = 1.2, maxDist = 14.0,
}

local function center(veh)
    local mn, mx = GetModelDimensions(GetEntityModel(veh))
    return vector3((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, (mn.z + mx.z) / 2), mn, mx
end

local function baseDist(veh)
    local _, mn, mx = center(veh)
    local size = math.max(mx.x - mn.x, mx.y - mn.y, mx.z - mn.z)
    return size * 1.05 + 1.6, size
end

local function lerpAngle(a, b, t)
    local d = ((b - a + 540) % 360) - 180
    return a + d * t
end

function Cam.start(veh)
    Cam.veh = veh
    local c = center(veh)
    local d, size = baseDist(veh)
    st.minDist, st.maxDist = math.max(0.9, size * 0.25), size * 3.2 + 3.0
    st.yaw, st.pitch, st.dist, st.target = 35.0, 14.0, d, c
    st.cYaw, st.cPitch, st.cDist, st.cTarget = st.yaw, st.pitch, st.dist, st.target
    Cam.handle = CreateCam('DEFAULT_SCRIPTED_CAMERA', true)
    SetCamFov(Cam.handle, 45.0)
    Cam.update(1.0)
    SetCamActive(Cam.handle, true)
    RenderScriptCams(true, true, 600, true, true)
end

function Cam.stop()
    if not Cam.handle then return end
    RenderScriptCams(false, true, 500, true, true)
    DestroyCam(Cam.handle, false)
    Cam.handle, Cam.veh = nil, nil
end

function Cam.update(t)
    if not Cam.handle or not DoesEntityExist(Cam.veh) then return end
    t = t or 0.18
    st.cYaw = lerpAngle(st.cYaw, st.yaw, t)
    st.cPitch = st.cPitch + (st.pitch - st.cPitch) * t
    st.cDist = st.cDist + (st.dist - st.cDist) * t
    st.cTarget = st.cTarget + (st.target - st.cTarget) * t
    local y, p = math.rad(st.cYaw), math.rad(st.cPitch)
    local off = vector3(-math.sin(y) * math.cos(p), math.cos(y) * math.cos(p), math.sin(p)) * st.cDist
    local camLocal = st.cTarget + off
    local w = GetOffsetFromEntityInWorldCoords(Cam.veh, camLocal.x, camLocal.y, camLocal.z)
    local tw = GetOffsetFromEntityInWorldCoords(Cam.veh, st.cTarget.x, st.cTarget.y, st.cTarget.z)
    -- zeminin altına inme
    local ground = GetEntityCoords(Cam.veh).z - 0.3
    if w.z < ground then w = vector3(w.x, w.y, ground) end
    SetCamCoord(Cam.handle, w.x, w.y, w.z)
    PointCamAtCoord(Cam.handle, tw.x, tw.y, tw.z)
end

function Cam.orbit(dx, dy)
    st.yaw = (st.yaw - dx * 240.0) % 360
    st.pitch = math.max(-8.0, math.min(86.0, st.pitch + dy * 140.0))
end

function Cam.zoom(delta)
    st.dist = math.max(st.minDist, math.min(st.maxDist, st.dist * (1.0 + 0.12 * delta)))
end

local PRESETS = {
    reset = { 35.0, 14.0 },
    front = { 0.0, 8.0 },
    side  = { 90.0, 6.0 },
    rear  = { 180.0, 8.0 },
    top   = { 90.0, 84.0 },
}

function Cam.preset(name)
    local p = PRESETS[name]
    if not p or not Cam.veh then return end
    st.yaw, st.pitch = p[1], p[2]
    st.target = center(Cam.veh)
    st.dist = baseDist(Cam.veh)
end

local CHART_VIEW = { top = { 90.0, 84.0 }, left = { 90.0, 4.0 }, right = { 270.0, 4.0 }, front = { 0.0, 6.0 }, rear = { 180.0, 6.0 } }

function Cam.chart(id)
    local p = CHART_VIEW[id]
    if not p or not Cam.veh then return end
    st.yaw, st.pitch = p[1], p[2]
    st.target = center(Cam.veh)
    st.dist = baseDist(Cam.veh) * 0.92
end

-- Yerel bir noktaya yaklaş (ekipman "Odakla")
function Cam.focus(lp)
    if not Cam.veh then return end
    st.target = vector3(lp[1] + 0.0, lp[2] + 0.0, lp[3] + 0.0)
    st.dist = math.max(st.minDist, 1.6)
    if st.pitch < 20.0 then st.pitch = 24.0 end
end

-- Kameranın baktığı yön (araç yerel)
function Cam.viewDir()
    if not Cam.handle then return nil end
    local d = VD.rotToDir(GetCamRot(Cam.handle, 2))
    return VD.localDir(Cam.veh, d)
end
