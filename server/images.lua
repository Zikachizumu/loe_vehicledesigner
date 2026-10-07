-- Sunucuda saklanan görseller (YZ çıktıları, arka planı temizlenmiş görseller). Tasarımda 'img:<id>' olarak geçer.
-- Büyük veri olduğu için istemciye latent event ile (bant genişliği sınırlı) gönderilir.

ImageStore = {}

local mem, order = {}, {}
local MAX_MEM = 24
local hits = {}

local function remember(id, data)
    if mem[id] then return end
    mem[id] = data
    order[#order + 1] = id
    if #order > MAX_MEM then
        mem[table.remove(order, 1)] = nil
    end
end

local function tooMany(src)
    local now = os.time()
    local h = hits[src]
    if not h or now - h.t >= 10 then hits[src] = { t = now, n = 1 } return false end
    h.n = h.n + 1
    return h.n > 40
end

local PREFIX = { 'data:image/png;base64,', 'data:image/jpeg;base64,', 'data:image/webp;base64,' }

local function validData(data)
    if type(data) ~= 'string' or #data > Config.Limits.imageBytes then return false end
    for _, p in ipairs(PREFIX) do
        if data:sub(1, #p) == p then
            return data:find('[^%w%+/=]', #p + 1) == nil
        end
    end
    return false
end

function ImageStore.save(owner, data)
    if not validData(data) then return nil end
    local id = DB.insertImage(owner, data)
    if id then remember(id, data) end
    return id
end

function ImageStore.get(id)
    id = tonumber(id)
    if not id then return nil end
    if mem[id] then return mem[id] end
    local data = DB.getImage(id)
    if data then remember(id, data) end
    return data
end

RegisterNetEvent('loevd:reqImage', function(id)
    local src = source
    if tooMany(src) then return end
    local data = ImageStore.get(id)
    TriggerLatentClientEvent('loevd:image', src, 400000, tostring(id), data)
end)

RegisterNetEvent('loevd:upload', function(req, data)
    local src = source
    if not Sessions[src] or tooMany(src) then
        TriggerClientEvent('loevd:uploaded', src, req, nil, L('err_perm'))
        return
    end
    local id = ImageStore.save(Bridge.identifier(src), data)
    TriggerClientEvent('loevd:uploaded', src, req, id, id and nil or L('err_payload'))
end)

AddEventHandler('playerDropped', function() hits[source] = nil end)
