'use strict';
// LOE Vehicle Studio — Electron kabuğu. Uygulama dosyaları loe://studio/ özel protokolüyle sunulur (fetch + gzip çalışsın diye).
const { app, BrowserWindow, protocol, net, ipcMain, dialog, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

const ROOT = __dirname;
const SMOKE = process.env.LVS_SMOKE || '';          // test: yüklenince ekran görüntüsü alıp çık

protocol.registerSchemesAsPrivileged([
    { scheme: 'loe', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } },
]);

if (!app.requestSingleInstanceLock() && !SMOKE) { app.quit(); }
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-features', 'SharedArrayBuffer');

let win = null;

function docsDir() {
    const d = path.join(app.getPath('documents'), 'LOE Vehicle Studio');
    try { fs.mkdirSync(d, { recursive: true }); } catch (e) { /* yok say */ }
    return d;
}

function createWindow() {
    win = new BrowserWindow({
        width: 1640, height: 940, minWidth: 1280, minHeight: 720,
        backgroundColor: '#0a0a0e',
        title: 'LOE Vehicle Studio',
        icon: path.join(ROOT, 'web', 'icon.png'),
        autoHideMenuBar: true,
        show: true,
        webPreferences: {
            preload: path.join(ROOT, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            spellcheck: false,
            backgroundThrottling: false,
        },
    });
    win.removeMenu();
    if (!SMOKE) win.maximize();
    win.loadURL('loe://studio/web/index.html');
    win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
    win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('loe://')) e.preventDefault(); });
    win.webContents.on('before-input-event', (e, input) => {
        if (input.type === 'keyDown' && (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i'))) win.webContents.toggleDevTools();
        if (input.type === 'keyDown' && input.key === 'F11') win.setFullScreen(!win.isFullScreen());
    });
    win.on('closed', () => { win = null; });

    if (SMOKE) {
        const logs = [];
        const NL = String.fromCharCode(10);
        const flush = (extra) => { try { fs.writeFileSync(SMOKE + '.log', (extra || '') + NL + logs.join(NL)); } catch (e) { /* yok say */ } };
        win.webContents.on('console-message', (e) => logs.push(`[${e.level}] ${e.message} (${path.basename(e.sourceId || '')}:${e.lineNumber})`));
        win.webContents.on('did-fail-load', (e, code, desc, url) => logs.push(`did-fail-load ${code} ${desc} ${url}`));
        win.webContents.on('render-process-gone', (e, d) => logs.push('render-process-gone ' + JSON.stringify(d)));
        flush('basladi');
        win.webContents.once('did-finish-load', async () => {
            try {
                const t0 = Date.now();
                let ready = false;
                while (Date.now() - t0 < 60000) {
                    ready = await win.webContents.executeJavaScript('window.__studioReady === true').catch(() => false);
                    if (ready) break;
                    await new Promise(r => setTimeout(r, 300));
                }
                const js = process.env.LVS_SMOKE_JS;
                let extra = '';
                if (js) { try { extra = String(await win.webContents.executeJavaScript(js)); } catch (e) { extra = 'JS HATA: ' + e.message; } }
                await new Promise(r => setTimeout(r, 2500));
                flush(`ready=${ready} ${extra}`);
                const img = await win.webContents.capturePage();
                fs.writeFileSync(SMOKE, img.toPNG());
            } catch (e) { logs.push('SMOKE HATA ' + e.stack); flush('hata'); }
            app.quit();
        });
        setTimeout(() => { flush('zaman asimi'); app.quit(); }, +process.env.LVS_TIMEOUT || 100000);
    }
}

app.whenReady().then(() => {
    app.setAppUserModelId('LOE.VehicleStudio');
    protocol.handle('loe', (req) => {
        const u = new URL(req.url);
        const rel = decodeURIComponent(u.pathname).replace(/^\/+/, '');
        const file = path.normalize(path.join(ROOT, rel));
        if (!file.startsWith(ROOT)) return new Response('yasak', { status: 403 });
        return net.fetch(pathToFileURL(file).toString());
    });
    Menu.setApplicationMenu(null);

    const filt = (f) => (Array.isArray(f) ? f : undefined);
    ipcMain.handle('save-file', async (e, name, data, filters) => {
        const r = await dialog.showSaveDialog(win, { defaultPath: path.join(docsDir(), name), filters: filt(filters) });
        if (r.canceled || !r.filePath) return null;
        fs.writeFileSync(r.filePath, Buffer.from(data));
        return r.filePath;
    });
    ipcMain.handle('save-files', async (e, files) => {
        const r = await dialog.showOpenDialog(win, { defaultPath: docsDir(), properties: ['openDirectory', 'createDirectory'] });
        if (r.canceled || !r.filePaths[0]) return null;
        for (const f of files) fs.writeFileSync(path.join(r.filePaths[0], path.basename(f.name)), Buffer.from(f.data));
        return r.filePaths[0];
    });
    ipcMain.handle('open-file', async (e, filters) => {
        const r = await dialog.showOpenDialog(win, { defaultPath: docsDir(), properties: ['openFile'], filters: filt(filters) });
        if (r.canceled || !r.filePaths[0]) return null;
        return { name: path.basename(r.filePaths[0]), data: fs.readFileSync(r.filePaths[0]) };
    });
    ipcMain.handle('autosave', (e, text) => { try { fs.writeFileSync(path.join(app.getPath('userData'), 'autosave.lvs.json'), text); } catch (err) { /* yok say */ } return true; });
    ipcMain.handle('autoload', () => { if (SMOKE && !process.env.LVS_RESTORE) return null; try { return fs.readFileSync(path.join(app.getPath('userData'), 'autosave.lvs.json'), 'utf8'); } catch (err) { return null; } });
    ipcMain.handle('shot', async (e, name) => {
        if (!SMOKE) return false;
        await new Promise(r => setTimeout(r, 400));
        const img = await win.webContents.capturePage();
        fs.writeFileSync(SMOKE.replace(/\.png$/, '') + '_' + String(name).replace(/[^\w-]/g, '') + '.png', img.toPNG());
        return true;
    });
    ipcMain.handle('app-info', () => ({ version: app.getVersion(), electron: process.versions.electron }));
    createWindow();
});

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.on('window-all-closed', () => app.quit());
