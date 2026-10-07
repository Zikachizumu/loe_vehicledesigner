-- Yapay zekâ ile görsel üretimi (OpenAI Images API, gpt-image-1).
-- Anahtar server.cfg içinde: set loe_vd_openai_key "sk-..."   (setr KULLANMA: istemcilere gider)

AI = {}

local last, daily = {}, {}
local day = os.date('%Y-%m-%d')

local function key()
    local k = GetConvar(Config.AI.keyConvar or 'loe_vd_openai_key', '')
    return k ~= '' and k or nil
end

function AI.allowed(src)
    if not Config.AI.enabled or not key() then return false end
    if Config.AI.ace and not IsPlayerAceAllowed(src, Config.AI.ace) then return false end
    return true
end

local function request(prompt)
    local body = {
        model = Config.AI.model,
        prompt = prompt,
        n = 1,
        size = Config.AI.size,
        quality = Config.AI.quality,
        background = Config.AI.background,
        output_format = 'png',
    }
    local p = promise.new()
    PerformHttpRequest(Config.AI.endpoint, function(status, resp)
        p:resolve({ status = status, body = resp })
    end, 'POST', json.encode(body), {
        ['Content-Type'] = 'application/json',
        ['Authorization'] = 'Bearer ' .. key(),
    })
    SetTimeout(120000, function() p:resolve({ status = 0, body = nil }) end)
    return Citizen.Await(p)
end

lib.callback.register('loevd:ai', function(src, prompt)
    if not Config.AI.enabled then return { ok = false, error = L('ai_disabled') } end
    if not key() then return { ok = false, error = L('ai_no_key') } end
    if not Sessions[src] then return { ok = false, error = L('err_perm') } end
    if Config.AI.ace and not IsPlayerAceAllowed(src, Config.AI.ace) then return { ok = false, error = L('err_perm') } end
    if type(prompt) ~= 'string' then return { ok = false, error = L('err_payload') } end
    prompt = prompt:gsub('[%z\1-\31]', ' '):sub(1, 600)
    if prompt:match('^%s*$') then return { ok = false, error = L('err_payload') } end

    local now = os.time()
    if last[src] and now - last[src] < Config.AI.cooldown then
        return { ok = false, error = L('ai_cooldown', Config.AI.cooldown - (now - last[src])) }
    end
    local today = os.date('%Y-%m-%d')
    if today ~= day then day, daily = today, {} end
    local ident = Bridge.identifier(src)
    if (daily[ident] or 0) >= Config.AI.dailyLimit then return { ok = false, error = L('ai_limit') } end
    last[src] = now
    daily[ident] = (daily[ident] or 0) + 1

    local r = request(prompt .. (Config.AI.promptSuffix or ''))
    if r.status ~= 200 or not r.body then
        local msg = tostring(r.status)
        local ok, j = pcall(json.decode, r.body or '')
        if ok and type(j) == 'table' and type(j.error) == 'table' and j.error.message then msg = j.error.message end
        print(('^3[%s] YZ isteği başarısız (%s): %s^0'):format(VD.Resource, tostring(r.status), msg))
        daily[ident] = math.max(0, (daily[ident] or 1) - 1)
        return { ok = false, error = L('ai_failed', msg:sub(1, 120)) }
    end
    local ok, j = pcall(json.decode, r.body)
    local b64 = ok and type(j) == 'table' and type(j.data) == 'table' and j.data[1] and j.data[1].b64_json
    if type(b64) ~= 'string' then return { ok = false, error = L('ai_failed', 'empty') } end
    local id = ImageStore.save(ident, 'data:image/png;base64,' .. b64)
    if not id then return { ok = false, error = L('ai_failed', 'size') } end
    print(('[%s] %s YZ görseli üretti (#%d)'):format(VD.Resource, Bridge.name_of(src), id))
    return { ok = true, id = tostring(id) }
end)

AddEventHandler('playerDropped', function() last[source] = nil end)
