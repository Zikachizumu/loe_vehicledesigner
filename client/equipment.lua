-- Ekipman prop'ları (yerel, ağsız nesneler; her istemci kendisi oluşturur) ve betikle çizilen ışıklar.

Equipment = {}

local function attachOne(veh, obj, pos, rot)
    AttachEntityToEntity(obj, veh, 0, pos[1] + 0.0, pos[2] + 0.0, pos[3] + 0.0, rot[1] + 0.0, rot[2] + 0.0, rot[3] + 0.0,
        false, false, false, false, 2, true)
end

-- Bir ekipman örneğinin prop'larının yerel konum/dönüşleri
local function propPlacements(inst)
    local item = VD.EquipmentById[inst.item]
    local out = {}
    if not item then return out end
    local rot = inst.rot or { 0, 0, 0 }
    for _, p in ipairs(item.props or {}) do
        local off = VD.rotate(rot, p.o)
        local r = p.r or { 0, 0, 0 }
        out[#out + 1] = {
            model = p.m,
            pos = { inst.pos[1] + off[1], inst.pos[2] + off[2], inst.pos[3] + off[3] },
            rot = { rot[1] + r[1], rot[2] + r[2], rot[3] + r[3] },
        }
    end
    return out
end

local function spawnEntry(veh, inst)
    local e = { inst = inst, objs = {} }
    local base = GetEntityCoords(veh)
    for _, pl in ipairs(propPlacements(inst)) do
        local hash = VD.loadModel(pl.model)
        if hash then
            local obj = CreateObjectNoOffset(hash, base.x, base.y, base.z - 5.0, false, false, false)
            SetEntityCollision(obj, false, false)
            SetEntityCanBeDamaged(obj, false)
            SetEntityInvincible(obj, true)
            attachOne(veh, obj, pl.pos, pl.rot)
            SetModelAsNoLongerNeeded(hash)
            e.objs[#e.objs + 1] = obj
        end
    end
    return e
end

local function deleteEntry(e)
    for _, obj in ipairs(e.objs) do
        if DoesEntityExist(obj) then DeleteEntity(obj) end
    end
    e.objs = {}
end

-- ================================================================== DÜNYA
function Equipment.spawn(veh, list)
    local h = { veh = veh, entries = {} }
    for _, inst in ipairs(list or {}) do
        h.entries[#h.entries + 1] = spawnEntry(veh, inst)
    end
    return h
end

function Equipment.despawn(h)
    for _, e in ipairs(h.entries or {}) do deleteEntry(e) end
    h.entries = {}
end

function Equipment.check(h)
    for i, e in ipairs(h.entries) do
        for _, obj in ipairs(e.objs) do
            if not DoesEntityExist(obj) or not IsEntityAttachedToEntity(obj, h.veh) then
                deleteEntry(e)
                h.entries[i] = spawnEntry(h.veh, e.inst)
                break
            end
        end
    end
end

-- ================================================================== EDİTÖR
local edit = { veh = nil, byUid = {}, sel = nil }

function Equipment.setEdit(veh, list, sel)
    if edit.veh and edit.veh ~= veh then Equipment.clearEdit() end
    edit.veh = veh
    local seen = {}
    for _, inst in ipairs(list or {}) do
        local uid = inst.uid
        seen[uid] = true
        local e = edit.byUid[uid]
        local sig = json.encode({ inst.item, inst.pos, inst.rot })
        if not e then
            e = spawnEntry(veh, inst)
            e.sig = sig
            edit.byUid[uid] = e
        elseif e.sig ~= sig then
            if e.inst.item ~= inst.item then
                deleteEntry(e)
                e = spawnEntry(veh, inst)
                edit.byUid[uid] = e
            else
                local pls = propPlacements(inst)
                for i, obj in ipairs(e.objs) do
                    if pls[i] and DoesEntityExist(obj) then
                        DetachEntity(obj, false, false)
                        attachOne(veh, obj, pls[i].pos, pls[i].rot)
                    end
                end
                e.inst = inst
            end
            e.sig = sig
        else
            e.inst = inst
        end
    end
    for uid, e in pairs(edit.byUid) do
        if not seen[uid] then
            deleteEntry(e)
            edit.byUid[uid] = nil
        end
    end
    -- seçim vurgusu
    local r, g, b = VD.hexToRgb(VD.accentHex())
    for uid, e in pairs(edit.byUid) do
        for _, obj in ipairs(e.objs) do
            if DoesEntityExist(obj) then
                SetEntityDrawOutline(obj, uid == sel)
                if uid == sel then SetEntityDrawOutlineColor(r, g, b, 255) end
            end
        end
    end
    edit.sel = sel
end

function Equipment.clearEdit()
    for _, e in pairs(edit.byUid) do deleteEntry(e) end
    edit.byUid = {}
    edit.veh = nil
    edit.sel = nil
end

-- Işına en yakın düzenleme ekipmanı (tıklayarak seçme)
function Equipment.pickEdit(from, dir, maxT)
    if not edit.veh then return nil end
    local best, bestD = nil, 0.35
    for uid, e in pairs(edit.byUid) do
        local p = GetOffsetFromEntityInWorldCoords(edit.veh, e.inst.pos[1] + 0.0, e.inst.pos[2] + 0.0, e.inst.pos[3] + 0.0)
        local d, t = VD.rayPointDist(from, dir, p)
        if t > 0 and (not maxT or t <= maxT + 0.6) and d < bestD then best, bestD = uid, d end
    end
    return best
end

-- Modeli olmayan (yalnızca ışık) ekipmanları editörde görünür kıl
function Equipment.drawEditGhosts()
    if not edit.veh then return end
    for uid, e in pairs(edit.byUid) do
        if #e.objs == 0 then
            local p = GetOffsetFromEntityInWorldCoords(edit.veh, e.inst.pos[1] + 0.0, e.inst.pos[2] + 0.0, e.inst.pos[3] + 0.0)
            local s = uid == edit.sel and 0.07 or 0.05
            local item = VD.EquipmentById[e.inst.item]
            local c = VD.LightColors[(item and item.colors and item.colors[1]) or 'white'] or { 255, 255, 255 }
            DrawMarker(28, p.x, p.y, p.z, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, s, s, s, c[1], c[2], c[3], 170, false, false, 2, false, nil, nil, false)
        end
    end
end

-- ================================================================== IŞIKLAR
local function lightOn(L, now, offset)
    local k = L.k or 'flash'
    if k == 'steady' or k == 'spot' then return 1.0 end
    if k == 'rotate' then
        local s = math.sin((now + offset) / 95.0)
        return s > 0.15 and s or 0.0
    end
    local t = (now + offset) % 700
    if (L.g or 1) == 1 then
        return ((t < 80) or (t >= 140 and t < 220)) and 1.0 or 0.0
    end
    return ((t >= 350 and t < 430) or (t >= 490 and t < 570)) and 1.0 or 0.0
end

-- list: tasarımdaki ekipman listesi, mode: 'all' | 'spot' (yalnızca projektörler)
function Equipment.drawLights(veh, list, now)
    local cfg = Config.Sirens
    local offset = (veh % 7) * 37
    for _, inst in ipairs(list or {}) do
        local item = VD.EquipmentById[inst.item]
        if item and item.lights then
            local rot = inst.rot or { 0, 0, 0 }
            for _, L in ipairs(item.lights) do
                local k = lightOn(L, now, offset)
                if k > 0 then
                    local o = VD.rotate(rot, L.o)
                    local p = GetOffsetFromEntityInWorldCoords(veh, inst.pos[1] + o[1], inst.pos[2] + o[2], inst.pos[3] + o[3])
                    local c = VD.LightColors[L.c] or VD.LightColors.white
                    if L.k == 'spot' then
                        local d = VD.worldDir(veh, VD.v3(VD.rotate(rot, { 0.0, 1.0, -0.12 })))
                        DrawSpotLightWithShadow(p.x, p.y, p.z, d.x, d.y, d.z, c[1], c[2], c[3], 35.0, 8.0, 1.0, 22.0, 28.0, 0)
                    else
                        DrawLightWithRange(p.x, p.y, p.z, c[1], c[2], c[3], cfg.lightRange, cfg.lightIntensity * k)
                        local s = cfg.glowSize * (0.75 + 0.25 * k)
                        DrawMarker(28, p.x, p.y, p.z, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, s, s, s, c[1], c[2], c[3], math.floor(230 * k), false, false, 2, false, nil, nil, false)
                    end
                end
            end
        end
    end
end

function Equipment.hasLights(list)
    for _, inst in ipairs(list or {}) do
        local item = VD.EquipmentById[inst.item]
        if item and item.lights and #item.lights > 0 then return true end
    end
    return false
end

AddEventHandler('onResourceStop', function(res)
    if res == VD.Resource then Equipment.clearEdit() end
end)
