fx_version 'cerulean'
game 'gta5'
lua54 'yes'

name 'loe_vehicledesigner'
author 'Legends of Empire'
description 'LOE Vehicle Designer: araç kaplama (livery) editörü, ekipman, siren ve görünüm ayarları'
version '1.0.0'

ui_page 'html/index.html'

shared_scripts {
    '@ox_lib/init.lua',
    'config.lua',
    'shared/locale.lua',
    'shared/util.lua',
    'shared/layout.lua',
    'shared/equipment.lua',
}

client_scripts {
    'client/util.lua',
    'client/packs.lua',
    'client/dui.lua',
    'client/backends.lua',
    'client/world.lua',
    'client/equipment.lua',
    'client/sirens.lua',
    'client/tuning.lua',
    'client/camera.lua',
    'client/editor.lua',
    'client/main.lua',
}

server_scripts {
    '@oxmysql/lib/MySQL.lua',
    'server/bridge.lua',
    'server/db.lua',
    'server/assignments.lua',
    'server/designs.lua',
    'server/images.lua',
    'server/ai.lua',
    'server/sirens.lua',
    'server/main.lua',
}

files {
    'html/index.html',
    'html/dui.html',
    'html/css/*.css',
    'html/js/*.js',
    'html/img/*.svg',
}

dependencies {
    'ox_lib',
    'oxmysql',
}
