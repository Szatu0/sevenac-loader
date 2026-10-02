fx_version 'cerulean'
game 'gta5'

author 'SevenAC'
description 'Seven AntiCheat'
version '1.0.5'

files {
    'assets/logo.png',
    'config.json'
}

client_scripts {
    'client/c_loader.js'
}

server_scripts {
    'server/s_loader.js'
}

dependency {'screenshot-basic'}