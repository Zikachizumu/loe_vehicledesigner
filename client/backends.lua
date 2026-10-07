-- Kaplamayı araca basan arka uçlar.
--
--   shell  : yüzey paketi. Her model için N "slot" vardır; slot k'nın kaplama prop'ları (araç kemiklerine
--            bağlanır) 'tex %d' dokusunu kullanır ve bu doku DUI'ye yönlendirilir (AddReplaceTexture).
--            Aynı modelde AYNI tasarımı taşıyan araçlar tek slot + tek DUI paylaşır.
--   decal  : deneysel önizleme. Her yüzey (chart) için bir oyun decal'ı + DUI. Decal türleri globaldir.
--   livery : vanilla livery dokusunu (ör. police4_sign_1) DUI ile değiştirir. Modeldeki aynı livery'yi
--            kullanan TÜM araçları etkiler (deneysel).

Backends = {}

-- ================================================================== ORTAK: model + tasarım anahtarı başına paylaşılan doku
local shared = {}      -- [kindKey][designKey] = { slot, dui, refs }
local slotUse = {}     -- [model hash] = { [slot] = true }

local function texSize()
    local n = Config.Canvas.texture or 2048
    return n, n
end

-- ================================================================== SHELL (paket)
local shell = {}
Backends.shell = shell

local function sharedShell(pack, key, design)
    shared[pack.hash] = shared[pack.hash] or {}
    local s = shared[pack.hash][key]
    if s then
        s.refs = s.refs + 1
        return s
    end
    slotUse[pack.hash] = slotUse[pack.hash] or {}
    local slot
    for i = 1, pack.slots do
        if not slotUse[pack.hash][i] then slot = i break end
    end
    if not slot then
        VD.debug(('slot yok: %s (%d slot dolu)'):format(pack.model, pack.slots))
        return nil
    end
    slotUse[pack.hash][slot] = true
    local w, h = texSize()
    s = { slot = slot, dui = DUI.acquire(w, h), refs = 1, pack = pack, key = key }
    if pack.txd then RequestStreamedTextureDict(pack.txd, false) end
    AddReplaceTexture(pack.txd, pack.tex:format(slot), s.dui.txd, s.dui.tex)
    DUI.setDesign(s.dui, design)
    shared[pack.hash][key] = s
    return s
end

local function releaseShared(s)
    s.refs = s.refs - 1
    if s.refs > 0 then return end
    local pack = s.pack
    RemoveReplaceTexture(pack.txd, pack.tex:format(s.slot))
    DUI.release(s.dui)
    if slotUse[pack.hash] then slotUse[pack.hash][s.slot] = nil end
    if shared[pack.hash] then shared[pack.hash][s.key] = nil end
end

local function spawnParts(veh, pack, slot)
    local props = {}
    local pos = GetEntityCoords(veh)
    for _, part in ipairs(pack.parts) do
        local name = (part.prop or ''):format(slot)
        local hash = VD.loadModel(name)
        if hash then
            local obj = CreateObjectNoOffset(hash, pos.x, pos.y, pos.z - 5.0, false, false, false)
            SetEntityCollision(obj, false, false)
            SetEntityCanBeDamaged(obj, false)
            SetEntityInvincible(obj, true)
            SetEntityLodDist(obj, math.floor(Config.Render.distance + 20))
            local bone = part.bone and GetEntityBoneIndexByName(veh, part.bone) or 0
            if bone == -1 then bone = 0 end
            local o = part.offset or { 0, 0, 0 }
            local r = part.rot or { 0, 0, 0 }
            AttachEntityToEntity(obj, veh, bone, o[1] + 0.0, o[2] + 0.0, o[3] + 0.0, r[1] + 0.0, r[2] + 0.0, r[3] + 0.0, false, false, false, false, 2, true)
            SetModelAsNoLongerNeeded(hash)
            props[#props + 1] = obj
        else
            VD.debug('kaplama modeli bulunamadı: ' .. name)
        end
    end
    return props
end

function shell.attach(veh, surf, key, design)
    local s = sharedShell(surf.pack, key, design)
    if not s then return nil end
    return { kind = 'shell', veh = veh, shared = s, props = spawnParts(veh, surf.pack, s.slot) }
end

function shell.update(inst, design)
    DUI.setDesign(inst.shared.dui, design)
end

function shell.detach(inst)
    for _, obj in ipairs(inst.props or {}) do
        if DoesEntityExist(obj) then DeleteEntity(obj) end
    end
    inst.props = {}
    if inst.shared then releaseShared(inst.shared) end
    inst.shared = nil
end

-- Kaplama prop'ları bir şekilde silindiyse (araç yeniden akışa girdi vb.) yeniden oluştur
function shell.check(inst)
    if not inst.shared then return end
    for _, obj in ipairs(inst.props) do
        if not DoesEntityExist(obj) or not IsEntityAttachedToEntity(obj, inst.veh) then
            for _, o in ipairs(inst.props) do if DoesEntityExist(o) then DeleteEntity(o) end end
            inst.props = spawnParts(inst.veh, inst.shared.pack, inst.shared.slot)
            return
        end
    end
end

-- ================================================================== DECAL (deneysel önizleme)
local decal = {}
Backends.decal = decal
local leased = {}

local function leaseType()
    for _, t in ipairs(Config.Decals.types) do
        if not leased[t] then leased[t] = true return t end
    end
end

local function placeDecal(e, veh, surf)
    local c = e.chart
    local s = c.s
    local wM, hM = c.rect[3] / s, c.rect[4] / s
    local cx, cy = c.rect[1] + c.rect[3] / 2, c.rect[2] + c.rect[4] / 2
    local p = VD.Layout.unproject(c, cx, cy, surf.bbox.min, surf.bbox.max)
    local n = vector3(c.n[1] + 0.0, c.n[2] + 0.0, c.n[3] + 0.0)
    local wn = VD.worldDir(veh, n)
    local face = GetOffsetFromEntityInWorldCoords(veh, p.x + 0.0, p.y + 0.0, p.z + 0.0)
    -- gerçek yüzeyi bul: yüzün dışından içeri ışın
    local from = face + wn * 0.6
    local hit = VD.raycastVehicle(from, -wn, veh, 3.0)
    local origin = (hit or face) + wn * (Config.Decals.surfaceOffset or 0.0666)
    local side = VD.worldDir(veh, vector3(c.side[1] + 0.0, c.side[2] + 0.0, c.side[3] + 0.0))
    local function add(dynamic)
        local ok, h = pcall(AddDecal, e.type, origin.x, origin.y, origin.z, -wn.x, -wn.y, -wn.z, side.x, side.y, side.z,
            wM, hM, 1.0, 1.0, 1.0, 1.0, -1.0, true, dynamic, false)
        return ok and tonumber(h) or 0
    end
    e.handle = add(true)
    if e.handle == 0 then e.handle = add(false) end
    if e.handle == 0 then VD.debug('AddDecal başarısız: ' .. c.id) end
end

function decal.attach(veh, surf, key, design)
    local inst = { kind = 'decal', veh = veh, entries = {}, surf = surf }
    local res = Config.Decals.resolution or 1024
    for _, c in ipairs(surf.charts or {}) do
        local t = leaseType()
        if not t then break end
        local w = res
        local h = math.max(64, math.floor(res * c.rect[4] / c.rect[3] + 0.5))
        local e = { chart = c, type = t, dui = DUI.acquire(w, h) }
        DUI.setDesign(e.dui, design, { rect = c.rect, charts = surf.charts })
        PatchDecalDiffuseMap(t, e.dui.txd, e.dui.tex)
        placeDecal(e, veh, surf)
        inst.entries[#inst.entries + 1] = e
    end
    return inst
end

function decal.update(inst, design)
    for _, e in ipairs(inst.entries) do
        DUI.setDesign(e.dui, design, { rect = e.chart.rect, charts = inst.surf.charts })
    end
end

function decal.detach(inst)
    for _, e in ipairs(inst.entries) do
        if e.handle and e.handle ~= 0 then pcall(RemoveDecal, e.handle) end
        pcall(UnpatchDecalDiffuseMap, e.type)
        leased[e.type] = nil
        DUI.release(e.dui)
    end
    inst.entries = {}
end

function decal.check(inst)
    for _, e in ipairs(inst.entries) do
        local ok, alive = pcall(IsDecalAlive, e.handle or 0)
        if ok and (alive == false or alive == 0) then placeDecal(e, inst.veh, inst.surf) end
    end
end

-- ================================================================== LIVERY (vanilla doku)
local livery = {}
Backends.livery = livery

function livery.attach(veh, surf, key, design)
    local cfg = surf.cfg
    local idx = GetVehicleLivery(veh)
    if idx < 0 then idx = GetVehicleMod(veh, 48) end
    if idx < 0 then idx = 0 end
    local tex = cfg.tex:format(idx + 1)
    local k = 'livery:' .. cfg.txd .. ':' .. tex
    shared[k] = shared[k] or {}
    local s = shared[k][key]
    if s then
        s.refs = s.refs + 1
    else
        local w, h = texSize()
        s = { dui = DUI.acquire(w, h), refs = 1, txd = cfg.txd, tex = tex }
        AddReplaceTexture(cfg.txd, tex, s.dui.txd, s.dui.tex)
        DUI.setDesign(s.dui, design)
        shared[k][key] = s
    end
    return { kind = 'livery', veh = veh, shared = s, k = k, key = key }
end

function livery.update(inst, design) DUI.setDesign(inst.shared.dui, design) end

function livery.detach(inst)
    local s = inst.shared
    if not s then return end
    s.refs = s.refs - 1
    if s.refs <= 0 then
        RemoveReplaceTexture(s.txd, s.tex)
        DUI.release(s.dui)
        shared[inst.k][inst.key] = nil
    end
    inst.shared = nil
end

-- ================================================================== GİRİŞ NOKTASI
function Backends.attach(veh, surf, key, design)
    local b = Backends[surf.kind]
    if not b or not b.attach then return nil end
    return b.attach(veh, surf, key, design)
end

function Backends.update(inst, design)
    local b = inst and Backends[inst.kind]
    if b then b.update(inst, design) end
end

function Backends.detach(inst)
    local b = inst and Backends[inst.kind]
    if b then b.detach(inst) end
end

function Backends.check(inst)
    local b = inst and Backends[inst.kind]
    if b and b.check then b.check(inst) end
end
