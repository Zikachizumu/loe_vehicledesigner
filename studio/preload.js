'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('loe', {
    saveFile: (name, data, filters) => ipcRenderer.invoke('save-file', name, data, filters),
    saveFiles: (files) => ipcRenderer.invoke('save-files', files),
    openFile: (filters) => ipcRenderer.invoke('open-file', filters),
    autosave: (text) => ipcRenderer.invoke('autosave', text),
    autoload: () => ipcRenderer.invoke('autoload'),
    info: () => ipcRenderer.invoke('app-info'),
});
