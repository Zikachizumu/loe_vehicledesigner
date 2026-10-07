-- Yetki, tasarım doğrulama, kaydetme, kütüphane.

Access = {}
Sessions = {}            -- [src] = { netId, label }
local editing = {}       -- [netId] = src
local cache = {}         -- [id] = { rev, data }
local rate = {}          -- [src] = { [key] = { t, n } }

-- ================================================================== YARDIMCILAR
local function limited(src, key, max, window)
    rate[src] = rate[src] or {}
    local r = rate[src][key]
    local now = os.time()
    if not r or now - r.t >= window then
        rate[src][key] = { t = now, n = 1 }
        return false
    end
    r.n = r.n + 1
    return r.n > max
end

local function vehicleOf(netId)
    netId = tonumber(netId)
    if not netId then return nil end
    local veh = NetworkGetEntityFromNetworkId(netId)
    if not veh or veh == 0 or not DoesEntityExist(veh) or GetEntityType(veh) ~= 2 then return nil end
    return veh
end
VD.vehicleOf = vehicleOf

local function vehInfo(veh)
    return VD.normalizePlate(GetVehicleNumberPlateText(veh)), VD.modelKey(GetEntityModel(veh))
end

local function fail(key, ...) return { ok = false, error = L(key, ...) } end

-- ================================================================== YETKİ
local function jobAllowed(src, jobs)
    if type(jobs) ~= 'table' or next(jobs) == nil then return false end
    local j = Bridge.job(src)
    if not j or jobs[j.name] == nil then return false end
    if (j.grade or 0) < (jobs[j.name] or 0) then return false end
    if Config.Access.requireOnDuty and not j.onduty then return false end
    return true
end

function Access.can(src, plate)
    if Config.Access.ace and IsPlayerAceAllowed(src, Config.Access.ace) then return true end
    if jobAllowed(src, Config.Access.jobs) then return true end
    if Config.Access.owners and plate and Bridge.ownsPlate(src, plate) then return true end
    return false
end

function Access.modelScope(src)
    local m = Config.Access.modelScope or {}
    if m.ace and IsPlayerAceAllowed(src, m.ace) then return true end
    return jobAllowed(src, m.jobs)
end

function Access.isAdmin(src)
    return Config.Access.ace and IsPlayerAceAllowed(src, Config.Access.ace) or false
end

-- ================================================================== DOĞRULAMA
local function set(list) local t = {} for _, v in ipairs(list) do t[v] = true end return t end
local BLENDS = set({ 'normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'hard-light',
    'soft-light', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity' })
local SHAPES = set({ 'square', 'rectangle', 'rounded', 'circle', 'ellipse', 'triangle', 'right_tri', 'diamond', 'pentagon', 'hexagon',
    'octagon', 'star', 'spark', 'burst', 'heart', 'arrow', 'chevron', 'cross', 'lightning', 'shield' })
local ALIGNS = set({ 'left', 'center', 'right', 'justify' })

local function str(v, max)
    if type(v) ~= 'string' then return nil end
    v = v:gsub('[%z\1-\8\11\12\14-\31]', '')
    if #v > max then v = v:sub(1, max) end
    return v
end

local function num(v, lo, hi, def)
    v = tonumber(v)
    if not v or v ~= v or v == math.huge or v == -math.huge then return def end
    if v < lo then return lo end
    if v > hi then return hi end
    return v
end

local function color(v, def)
    if type(v) == 'string' and v:match('^#%x%x%x%x%x%x$') then return v:lower() end
    return def
end

local function validUrl(u)
    return type(u) == 'string' and #u <= 600 and u:match('^https://[%w%-%._~:/%?#@!%$&%(%)%*%+,;=%%]+$') ~= nil
end

local function sanitizeLayer(L)
    if type(L) ~= 'table' then return nil end
    local t = L.type
    if t ~= 'shape' and t ~= 'text' and t ~= 'image' then return nil end
    local o = {
        id = (str(L.id, 40) or ''):gsub('[^%w_%-]', ''), type = t,
        name = str(L.name, Config.Limits.nameLength) or t,
        visible = L.visible ~= false, locked = L.locked == true,
        x = num(L.x, -8192, 12288, 2048), y = num(L.y, -8192, 12288, 2048),
        rot = num(L.rot, -3600, 3600, 0), sx = num(L.sx, -5000, 5000, 100), sy = num(L.sy, -5000, 5000, 100),
        opacity = num(L.opacity, 0, 100, 100), blend = BLENDS[L.blend] and L.blend or 'normal',
        color = color(L.color, '#ffffff'),
    }
    if o.id == '' then o.id = ('l_%d'):format(math.random(1, 2 ^ 30)) end
    if t == 'shape' then
        o.shape = SHAPES[L.shape] and L.shape or 'square'
        o.w = num(L.w, 1, 20000, 400)
        o.h = num(L.h, 1, 20000, 400)
    elseif t == 'text' then
        o.text = str(L.text, 200) or ''
        o.font = ((str(L.font, 48) or 'Impact'):gsub('[^%w%s%-]', ''))
        o.bold, o.italic, o.underline, o.strike = L.bold == true, L.italic == true, L.underline == true, L.strike == true
        o.fsize = num(L.fsize, 4, 2000, 64)
        o.spacing = num(L.spacing, -500, 3000, 0)
        o.line = num(L.line, 0.3, 5, 1.16)
        o.align = ALIGNS[L.align] and L.align or 'left'
    else
        local src = L.src
        if type(src) ~= 'string' then return nil end
        if not (src:match('^img:%d+$') or validUrl(src)) then return nil end
        o.src = src
        o.w = num(L.w, 1, 20000, 512)
        o.h = num(L.h, 1, 20000, 512)
        o.tint = L.tint == true
    end
    return o
end

local function sanitizeEquipment(list)
    local out = {}
    if type(list) ~= 'table' then return out end
    for _, e in ipairs(list) do
        if #out >= Config.Limits.equipment then break end
        if type(e) == 'table' and VD.EquipmentById[e.item] and type(e.pos) == 'table' then
            local rot = type(e.rot) == 'table' and e.rot or {}
            out[#out + 1] = {
                uid = ((str(e.uid, 40) or ''):gsub('[^%w_%-]', '')),
                item = e.item,
                pos = { num(e.pos[1], -8, 8, 0), num(e.pos[2], -12, 12, 0), num(e.pos[3], -4, 6, 0) },
                rot = { num(rot[1], -360, 360, 0), num(rot[2], -360, 360, 0), num(rot[3], -360, 360, 0) },
            }
            if out[#out].uid == '' then out[#out].uid = ('e_%d'):format(math.random(1, 2 ^ 30)) end
        end
    end
    return out
end

local function sanitizeTuning(t)
    if type(t) ~= 'table' then return nil end
    local o = {
        paint = t.paint == 'custom' and 'custom' or 'keep',
        primary = color(t.primary, '#ffffff'),
        secondary = color(t.secondary, '#111111'),
        tint = math.floor(num(t.tint, 0, 6, 0)),
        neon = { on = type(t.neon) == 'table' and t.neon.on == true or false, color = color(type(t.neon) == 'table' and t.neon.color, '#ff00ff') },
        extras = {},
    }
    if type(t.extras) == 'table' then
        for k, v in pairs(t.extras) do
            local id = tonumber(k)
            if id and id >= 0 and id <= 20 then o.extras[tostring(math.floor(id))] = v == true end
        end
    end
    return o
end

function VD.sanitizeDesign(d)
    if type(d) ~= 'table' then return nil end
    local out = {
        v = 1,
        size = Config.Canvas.size,
        base = { color = type(d.base) == 'table' and color(d.base.color, nil) or nil },
        layers = {},
        equipment = sanitizeEquipment(d.equipment),
        tuning = sanitizeTuning(d.tuning),
    }
    if type(d.layers) == 'table' then
        for _, L in ipairs(d.layers) do
            if #out.layers >= Config.Limits.layers then break end
            local s = sanitizeLayer(L)
            if s then out.layers[#out.layers + 1] = s end
        end
    end
    return out
end

local function validThumb(t)
    if type(t) ~= 'string' or #t > Config.Limits.thumbBytes then return nil end
    if not t:match('^data:image/jpeg;base64,[%w%+/=]+$') then return nil end
    return t
end

local function decode(raw)
    local ok, d = pcall(json.decode, raw or '')
    return ok and type(d) == 'table' and d or nil
end

function VD.designData(id)
    id = tonumber(id)
    if not id then return nil end
    local c = cache[id]
    if c then return c.data, c.rev end
    local row = DB.getDesign(id)
    if not row then return nil end
    local data = decode(row.data)
    if not data then return nil end
    cache[id] = { rev = row.rev, data = data }
    return data, row.rev
end

-- ================================================================== AÇ / KAPAT
lib.callback.register('loevd:open', function(src, netId, label)
    local veh = vehicleOf(netId)
    if not veh then return fail('err_vehicle') end
    if Config.Access.requireDriver and GetPedInVehicleSeat(veh, -1) ~= GetPlayerPed(src) then return fail('not_in_vehicle') end
    local plate, mk = vehInfo(veh)
    if not Access.can(src, plate) then return fail('no_access') end
    local cur = editing[netId]
    if cur and cur ~= src and GetPlayerPing(cur) > 0 then return fail('opened_by_other') end
    editing[netId] = src
    Sessions[src] = { netId = netId, label = str(label, 60) or '' }

    local design, meta = nil, { id = nil, name = '', mine = true }
    local a = Assign.resolve(plate, mk)
    if a then
        local row = DB.getDesign(a.i)
        if row then
            design = decode(row.data)
            meta = { id = row.id, name = row.name, mine = row.owner == Bridge.identifier(src) }
        end
    end
    return {
        ok = true, design = design, meta = meta,
        perms = { modelScope = Access.modelScope(src), ai = AI and AI.allowed(src) or false },
    }
end)

local function release(src)
    local s = Sessions[src]
    if s and editing[s.netId] == src then editing[s.netId] = nil end
    Sessions[src] = nil
end

RegisterNetEvent('loevd:closed', function() release(source) end)
AddEventHandler('playerDropped', function()
    release(source)
    rate[source] = nil
end)

-- ================================================================== KAYDET
lib.callback.register('loevd:save', function(src, p)
    if type(p) ~= 'table' then return fail('save_failed', L('err_payload')) end
    if limited(src, 'save', 6, 30) then return fail('save_failed', 'rate') end
    local sess = Sessions[src]
    if not sess or tonumber(sess.netId) ~= tonumber(p.netId) then return fail('save_failed', L('err_perm')) end
    local veh = vehicleOf(p.netId)
    if not veh then return fail('save_failed', L('err_vehicle')) end
    local plate, mk = vehInfo(veh)
    if not Access.can(src, plate) then return fail('save_failed', L('err_perm')) end
    local scope = p.scope == 'model' and 'model' or 'plate'
    if scope == 'model' and not Access.modelScope(src) then return fail('save_failed', L('err_perm')) end
    if scope == 'plate' and not plate then return fail('save_failed', L('err_vehicle')) end

    local design = VD.sanitizeDesign(p.design)
    if not design then return fail('save_failed', L('err_payload')) end
    local data = json.encode(design)
    if #data > Config.Limits.designBytes then return fail('save_failed', L('err_payload')) end
    local label = sess.label ~= '' and sess.label or (str(p.label, 60) or '')
    local name = str(p.name, Config.Limits.nameLength)
    if not name or name:match('^%s*$') then name = (label .. ' ' .. (plate or '')):sub(1, Config.Limits.nameLength) end
    local ident = Bridge.identifier(src)
    local thumb = validThumb(p.thumb)

    local id, rev
    local ok, err = pcall(function()
        if tonumber(p.id) then
            local row = DB.getDesign(tonumber(p.id))
            if row and row.owner == ident then
                id = row.id
                rev = DB.updateDesign(id, name, mk, label, data, thumb)
            end
        end
        if not id then
            if DB.countDesigns(ident) >= Config.Limits.designsPerPlayer then error('limit', 0) end
            id = DB.insertDesign(ident, name, mk, label, data, thumb)
            rev = 1
        end
    end)
    if not ok then
        if err == 'limit' then return fail('save_failed', L('err_limit')) end
        print(('^1[%s] kayıt hatası: %s^0'):format(VD.Resource, tostring(err)))
        return fail('save_failed', L('err_db'))
    end

    cache[id] = { rev = rev, data = design }
    if scope == 'plate' then
        Assign.set('plate', plate, mk, label, id, rev, ident)
    else
        Assign.set('model', mk, mk, label, id, rev, ident)
    end
    Assign.bump(id, rev)
    print(('[%s] %s (%s) tasarım #%d kaydetti → %s %s'):format(VD.Resource, Bridge.name_of(src), ident, id, scope, scope == 'plate' and plate or label))
    return { ok = true, id = id, rev = rev, message = scope == 'plate' and L('saved_vehicle') or L('saved_model', label) }
end)

-- ================================================================== TASARIM VERİSİ (istemci önbelleği için)
lib.callback.register('loevd:design', function(src, id)
    if limited(src, 'design', 60, 10) then return nil end
    local data, rev = VD.designData(id)
    if not data then return nil end
    return { id = tonumber(id), rev = rev, data = data }
end)

-- ================================================================== KÜTÜPHANE
local function assignedTo(id)
    local out = {}
    for key, v in pairs(Assign.p) do if v.i == id then out[#out + 1] = { scope = 'plate', key = key } end end
    for key, v in pairs(Assign.m) do if v.i == id then out[#out + 1] = { scope = 'model', key = key, label = Assign.labels[key] } end end
    return out
end

local function currentAssign(src)
    local sess = Sessions[src]
    local veh = sess and vehicleOf(sess.netId)
    if not veh then return nil end
    local plate, mk = vehInfo(veh)
    return Assign.resolve(plate, mk)
end

lib.callback.register('loevd:library', function(src, p)
    if type(p) ~= 'table' or not Sessions[src] then return {} end
    if limited(src, 'lib', 20, 10) then return {} end
    local ident = Bridge.identifier(src)
    local id = tonumber(p.id)
    local cur, curScope, curKey = currentAssign(src)

    if p.op == 'list' then
        local items, seen = {}, {}
        for _, r in ipairs(DB.listDesigns(ident)) do
            seen[r.id] = true
            items[#items + 1] = {
                id = r.id, name = r.name, modelLabel = r.model_label, updated = r.updated, thumb = r.thumb,
                mine = true, assigned = assignedTo(r.id), onVehicle = cur and cur.i == r.id or false,
            }
        end
        if cur and not seen[cur.i] then
            local r = DB.designSummary(cur.i)
            if r then
                table.insert(items, 1, {
                    id = r.id, name = r.name, modelLabel = r.model_label, updated = r.updated, thumb = r.thumb,
                    mine = r.owner == ident, assigned = assignedTo(r.id), onVehicle = true,
                })
            end
        end
        return { items = items }
    end

    if not id then return {} end
    local row = DB.getDesign(id)
    if not row then return {} end
    local mine = row.owner == ident

    if p.op == 'get' then
        if not mine and not (cur and cur.i == id) and not Access.isAdmin(src) then return {} end
        return { id = row.id, name = row.name, mine = mine, design = decode(row.data) }
    elseif p.op == 'rename' then
        if not mine then return {} end
        local name = str(p.name, Config.Limits.nameLength)
        if name and not name:match('^%s*$') then DB.renameDesign(id, name) end
        return { ok = true }
    elseif p.op == 'delete' then
        if not mine and not Access.isAdmin(src) then return {} end
        DB.deleteDesign(id)
        Assign.forget(id)
        cache[id] = nil
        return { ok = true }
    elseif p.op == 'unassign' then
        if not cur or cur.i ~= id then return {} end
        if curScope == 'model' and not Access.modelScope(src) then return fail('save_failed', L('err_perm')) end
        Assign.remove(curScope, curKey)
        return { ok = true, message = L('removed') }
    end
    return {}
end)
