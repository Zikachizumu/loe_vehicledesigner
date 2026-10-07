-- Atama dizini: hangi plaka / model hangi tasarımı gösterir. Bellekte tutulur, istemcilere yayınlanır.
--   p[PLAKA] = { i = tasarım id, r = revizyon, m = model anahtarı }
--   m[MODEL] = { i, r }

Assign = { p = {}, m = {}, labels = {} }

function Assign.load()
    Assign.p, Assign.m = {}, {}
    for _, row in ipairs(DB.allAssignments()) do
        if row.scope == 'plate' then
            Assign.p[row.key] = { i = row.design_id, r = row.rev, m = row.model }
        elseif row.scope == 'model' then
            Assign.m[row.key] = { i = row.design_id, r = row.rev }
            Assign.labels[row.key] = row.model_label
        end
    end
end

local function broadcast(scope, key, v)
    TriggerClientEvent('loevd:indexDelta', -1, { scope = scope, key = key, v = v })
end

function Assign.set(scope, key, model, label, designId, rev, by)
    DB.setAssignment(scope, key, model, label, designId, by)
    local v
    if scope == 'plate' then
        v = { i = designId, r = rev, m = model }
        Assign.p[key] = v
    else
        v = { i = designId, r = rev }
        Assign.m[key] = v
        Assign.labels[key] = label
    end
    broadcast(scope, key, v)
end

function Assign.remove(scope, key)
    DB.removeAssignment(scope, key)
    if scope == 'plate' then Assign.p[key] = nil else Assign.m[key] = nil end
    broadcast(scope, key, nil)
end

-- Tasarım güncellenince bu tasarımı gösteren tüm atamaların revizyonunu ilerlet
function Assign.bump(designId, rev)
    for key, v in pairs(Assign.p) do
        if v.i == designId then v.r = rev broadcast('plate', key, v) end
    end
    for key, v in pairs(Assign.m) do
        if v.i == designId then v.r = rev broadcast('model', key, v) end
    end
end

function Assign.forget(designId)
    for key, v in pairs(Assign.p) do
        if v.i == designId then Assign.p[key] = nil broadcast('plate', key, nil) end
    end
    for key, v in pairs(Assign.m) do
        if v.i == designId then Assign.m[key] = nil broadcast('model', key, nil) end
    end
end

-- Araç için geçerli atama (plaka öncelikli)
function Assign.resolve(plate, modelKey)
    local a = plate and Assign.p[plate]
    if a and (not a.m or a.m == modelKey) then return a, 'plate', plate end
    local b = Assign.m[modelKey]
    if b then return b, 'model', modelKey end
end

lib.callback.register('loevd:index', function()
    return { p = Assign.p, m = Assign.m }
end)
