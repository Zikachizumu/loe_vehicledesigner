'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('loe', {
    saveFile: (name, data, filters) => ipcRenderer.invoke('save-file', name, data, filters),
    saveFiles: (files) => ipcRenderer.invoke('save-files', files),
    openFile: (filters) => ipcRenderer.invoke('open-file', filters),
    autosave: (text) => ipcRenderer.invoke('autosave', text),
    autoload: () => ipcRenderer.invoke('autoload'),
    info: () => ipcRenderer.invoke('app-info'),
    shot: (name) => ipcRenderer.invoke('shot', name),
    buildGamePack: (text, name, deploy) => ipcRenderer.invoke('build-gamepack', text, name, deploy),
    onGamePackLog: (cb) => { ipcRenderer.removeAllListeners('gamepack-log'); ipcRenderer.on('gamepack-log', (e, t) => cb(t)); },
    reveal: (p) => ipcRenderer.invoke('reveal', p),
});
