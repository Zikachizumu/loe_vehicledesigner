-- Başlatma ve yönetici komutları.

CreateThread(function()
    if not DB.migrate() then return end
    Assign.load()
    -- resource yeniden başlatıldıysa bağlı oyunculara dizini tekrar gönder
    TriggerClientEvent('loevd:index', -1, { p = Assign.p, m = Assign.m })
    local np, nm = 0, 0
    for _ in pairs(Assign.p) do np = np + 1 end
    for _ in pairs(Assign.m) do nm = nm + 1 end
    print(('[%s] hazır | framework: %s | atama: %d plaka, %d model | YZ: %s'):format(
        VD.Resource, Bridge.name, np, nm, (Config.AI.enabled and GetConvar(Config.AI.keyConvar, '') ~= '') and 'açık' or 'kapalı'))
end)

-- /vdreload : atamaları veritabanından yeniden yükler (ace: Config.Access.ace)
lib.addCommand('vdreload', { help = 'loe_vehicledesigner: atamaları yeniden yükle', restricted = 'group.admin' }, function(src)
    Assign.load()
    TriggerClientEvent('loevd:index', -1, { p = Assign.p, m = Assign.m })
    if src > 0 then TriggerClientEvent('chat:addMessage', src, { args = { 'loe_vehicledesigner', 'atamalar yeniden yüklendi' } }) end
end)

-- /vdclear [plaka] : plakaya atanmış tasarımı kaldırır
lib.addCommand('vdclear', {
    help = 'loe_vehicledesigner: plakadaki tasarımı kaldır',
    params = { { name = 'plate', type = 'string', help = 'Plaka' } },
    restricted = 'group.admin',
}, function(src, args)
    local plate = VD.normalizePlate(args.plate)
    if plate and Assign.p[plate] then
        Assign.remove('plate', plate)
        print(('[%s] %s plakasının tasarımı kaldırıldı'):format(VD.Resource, plate))
    end
end)
