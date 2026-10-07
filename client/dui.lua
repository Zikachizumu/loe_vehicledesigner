-- DUI havuzu: her DUI, html/dui.html sayfasını çizen gizli bir tarayıcıdır ve çalışma zamanı dokusu olarak
-- araca basılır. Çalışma zamanı doku adları oturum boyunca tek kullanımlık olduğundan DUI'ler silinmez,
-- havuza geri konup yeniden kullanılır.

DUI = { free = {}, all = {}, seq = 0 }
Images = { data = {}, waiting = {} }

local URL = ('https://cfx-nui-%s/html/dui.html'):format(VD.Resource)
local MAX_FREE = 6

local function flush(d)
    for _, s in ipairs(d.queue) do SendDuiMessage(d.obj, s) end
    d.queue = {}
end

local function create(w, h)
    DUI.seq = DUI.seq + 1
    local d = {
        id = DUI.seq, w = w, h = h, ready = false, queue = {}, sentImages = {}, inUse = true,
        txd = ('loevd_txd_%d'):format(DUI.seq), tex = ('loevd_tex_%d'):format(DUI.seq),
    }
    d.obj = CreateDui(URL, w, h)
    d.handle = GetDuiHandle(d.obj)
    local txd = CreateRuntimeTxd(d.txd)
    CreateRuntimeTextureFromDuiHandle(txd, d.tex, d.handle)
    DUI.all[#DUI.all + 1] = d
    CreateThread(function()
        local limit = GetGameTimer() + 10000
        while not IsDuiAvailable(d.obj) and GetGameTimer() < limit do Wait(50) end
        Wait(400) -- sayfa betikleri yüklensin
        d.ready = true
        SendDuiMessage(d.obj, json.encode({ action = 'fonts', fonts = Config.Fonts }))
        flush(d)
    end)
    return d
end

function DUI.acquire(w, h)
    for i, d in ipairs(DUI.free) do
        if d.w == w and d.h == h then
            table.remove(DUI.free, i)
            d.inUse = true
            return d
        end
    end
    return create(w, h)
end

function DUI.release(d)
    if not d or not d.inUse then return end
    d.inUse = false
    d.design = nil
    DUI.send(d, { action = 'clear' })
    if #DUI.free >= MAX_FREE then
        -- havuz dolu: tarayıcıyı kapat (doku adı bir daha kullanılmaz)
        DestroyDui(d.obj)
        for i, x in ipairs(DUI.all) do if x == d then table.remove(DUI.all, i) break end end
        return
    end
    DUI.free[#DUI.free + 1] = d
end

function DUI.send(d, msg)
    local s = json.encode(msg)
    if d.ready then
        SendDuiMessage(d.obj, s)
        return
    end
    -- hazır değilken yalnızca son tasarım mesajı tutulur
    if msg.action == 'design' or msg.action == 'clear' then
        for i = #d.queue, 1, -1 do
            local q = d.queue[i]
            if q:find('"action":"design"', 1, true) or q:find('"action":"clear"', 1, true) then table.remove(d.queue, i) end
        end
    end
    d.queue[#d.queue + 1] = s
end

local function sendImage(d, id, data)
    if not data or d.sentImages[id] then return end
    d.sentImages[id] = true
    DUI.send(d, { action = 'image', id = id, data = data })
end

-- Tasarımı DUI'ye gönder; img:<id> görselleri gerekirse sunucudan çekilir
function DUI.setDesign(d, design, extra)
    d.design = design
    for _, L in ipairs(design and design.layers or {}) do
        if L.type == 'image' and type(L.src) == 'string' and L.src:sub(1, 4) == 'img:' then
            local id = L.src:sub(5)
            if Images.data[id] then
                sendImage(d, id, Images.data[id])
            else
                Images.get(id, function(data)
                    if d.inUse and d.design == design then sendImage(d, id, data) end
                end)
            end
        end
    end
    local msg = { action = 'design', design = design }
    if extra then
        msg.rect = extra.rect
        msg.charts = extra.charts
    end
    DUI.send(d, msg)
end

-- ------------------------------------------------------------------ görsel önbelleği (img:<id>)
function Images.get(id, cb)
    id = tostring(id)
    if Images.data[id] then cb(Images.data[id]) return end
    local w = Images.waiting[id]
    if w then w[#w + 1] = cb return end
    Images.waiting[id] = { cb }
    TriggerServerEvent('loevd:reqImage', id)
    SetTimeout(30000, function()
        local list = Images.waiting[id]
        if not list then return end
        Images.waiting[id] = nil
        for _, f in ipairs(list) do f(nil) end
    end)
end

function Images.await(id)
    local p = promise.new()
    Images.get(id, function(data) p:resolve(data or false) end)
    local r = Citizen.Await(p)
    return r or nil
end

function Images.store(id, data)
    id = tostring(id)
    if type(data) ~= 'string' then return end
    Images.data[id] = data
    for _, d in ipairs(DUI.all) do
        if d.inUse and d.design then
            for _, L in ipairs(d.design.layers or {}) do
                if L.src == 'img:' .. id then sendImage(d, id, data) break end
            end
        end
    end
end

RegisterNetEvent('loevd:image', function(id, data)
    id = tostring(id)
    if type(data) == 'string' then Images.store(id, data) end
    local list = Images.waiting[id]
    Images.waiting[id] = nil
    for _, f in ipairs(list or {}) do f(Images.data[id]) end
end)

AddEventHandler('onResourceStop', function(res)
    if res ~= VD.Resource then return end
    for _, d in ipairs(DUI.all) do pcall(DestroyDui, d.obj) end
end)
