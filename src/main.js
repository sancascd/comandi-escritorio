// COMANDI PARA EL ORDENADOR DEL RESTAURANTE (26/10/2026).
// Sandra: «quiero convertir Comandi en una aplicación propia que puedan
// descargar y tener en su escritorio… y que se pueda seguir usando en Chrome».
//
// Es una ventana que abre el tablero de siempre (comandi.es/pedidos): lo que
// cambia en la web llega solo. La aplicación añade lo que Chrome no puede:
//   · imprimir sin preguntar, y en la impresora que toque (una para todo, o
//     la de cocina y la del cliente por separado: Sabroso Oriental);
//   · arrancar con Windows y no dejar que el ordenador se duerma;
//   · avisar en la barra de tareas cuando entra un pedido;
//   · no abrir nada que no sea comandi.es (lo demás va al navegador).
// El tablero la reconoce por `window.comandiEscritorio` (src/preload.js).

const { app, BrowserWindow, ipcMain, shell, dialog, Menu, powerSaveBlocker } = require('electron');
const path = require('path');
const fs = require('fs');
const reglas = require('./reglas');
const papel = require('./papel');
const { autoUpdater } = require('electron-updater');

let ventana = null;
let ventanaAjustes = null;
let saliendo = false;

// ---------- Ajustes (en la carpeta de la aplicación de este ordenador) ----------
const rutaAjustes = () => path.join(app.getPath('userData'), 'ajustes.json');

function leerAjustes() {
  try { return reglas.ajustesValidos(JSON.parse(fs.readFileSync(rutaAjustes(), 'utf8'))); }
  catch (e) { return reglas.ajustesValidos(null); }
}

function guardarAjustes(nuevos) {
  const limpios = reglas.ajustesValidos(nuevos);
  fs.mkdirSync(path.dirname(rutaAjustes()), { recursive: true });
  fs.writeFileSync(rutaAjustes(), JSON.stringify(limpios, null, 2), 'utf8');
  aplicarArranque(limpios);
  return limpios;
}

function aplicarArranque(ajustes) {
  // En desarrollo (npm start) no se toca el arranque de Windows.
  if (!app.isPackaged) return;
  app.setLoginItemSettings({ openAtLogin: ajustes.arrancarConWindows });
}

// ---------- Imprimir ----------
// Imprime lo que esté pintando ahora la página (el tablero pinta los tickets
// de esa tanda justo antes de pedirlo) en la impresora de esa tanda.
function imprimirEn(webContents, deviceName, pageSize) {
  return new Promise((resolve) => {
    const opciones = { silent: true, printBackground: true, margins: { marginType: 'none' } };
    if (deviceName) opciones.deviceName = deviceName;
    if (pageSize) opciones.pageSize = pageSize; // el papel a la medida (src/papel.js)
    webContents.print(opciones, (ok, motivo) => resolve({ ok, error: ok ? null : String(motivo || 'No se ha podido imprimir') }));
  });
}

// ---------- La ventana del tablero ----------
function crearVentana() {
  ventana = new BrowserWindow({
    width: 1366,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    title: 'Comandi',
    icon: path.join(__dirname, 'icono.png'),
    backgroundColor: '#ffffff',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      partition: 'persist:comandi', // la sesión se queda abierta
      backgroundThrottling: false,  // que siga escuchando pedidos minimizada
    },
  });
  ventana.maximize();
  ventana.loadURL(reglas.PORTADA);

  // Nada que no sea comandi.es se abre aquí dentro.
  ventana.webContents.setWindowOpenHandler(({ url }) => {
    if (!reglas.esDeComandi(url)) { shell.openExternal(url); return { action: 'deny' }; }
    return { action: 'allow' };
  });
  ventana.webContents.on('will-navigate', (evento, url) => {
    if (!reglas.esDeComandi(url)) { evento.preventDefault(); shell.openExternal(url); }
  });
  // El título lo pone la aplicación (con los pedidos sin atender), no la web.
  ventana.on('page-title-updated', (evento) => evento.preventDefault());

  ventana.on('close', (evento) => {
    if (saliendo) return;
    const respuesta = dialog.showMessageBoxSync(ventana, {
      type: 'warning',
      buttons: ['Seguir abierta', 'Cerrar Comandi'],
      defaultId: 0,
      cancelId: 0,
      title: 'Comandi',
      message: '¿Cerrar Comandi?',
      detail: 'Con Comandi cerrada no se imprimen los pedidos que entren ni suena el aviso.',
    });
    if (respuesta === 0) evento.preventDefault();
    else saliendo = true;
  });
  ventana.on('closed', () => { ventana = null; });
}

function abrirAjustes() {
  if (ventanaAjustes) { ventanaAjustes.focus(); return; }
  ventanaAjustes = new BrowserWindow({
    width: 560,
    height: 640,
    resizable: false,
    parent: ventana || undefined,
    modal: false,
    title: 'Impresoras y ajustes · Comandi',
    icon: path.join(__dirname, 'icono.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload-ajustes.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  ventanaAjustes.loadFile(path.join(__dirname, 'ajustes.html'));
  ventanaAjustes.on('closed', () => {
    ventanaAjustes = null;
    // El tablero vuelve a mirar los ajustes (puede haber cambiado de modo).
    if (ventana) ventana.webContents.send('comandi:ajustes-cambiados');
  });
}

function menu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: 'Comandi',
      submenu: [
        { label: 'Impresoras y ajustes…', accelerator: 'CmdOrCtrl+,', click: abrirAjustes },
        { type: 'separator' },
        { label: 'Recargar', accelerator: 'F5', click: () => ventana && ventana.webContents.reload() },
        { label: 'Pantalla completa', accelerator: 'F11', click: () => ventana && ventana.setFullScreen(!ventana.isFullScreen()) },
        { type: 'separator' },
        { label: 'Versión ' + app.getVersion(), enabled: false },
        { label: 'Salir', click: () => app.quit() },
      ],
    },
    { label: 'Ver', submenu: [{ role: 'zoomIn', label: 'Más grande' }, { role: 'zoomOut', label: 'Más pequeño' }, { role: 'resetZoom', label: 'Tamaño normal' }] },
  ]));
}

// ---------- Lo que pide el tablero (src/preload.js) ----------
function desdeComandi(evento) {
  return !!(evento && evento.senderFrame && reglas.esDeComandi(evento.senderFrame.url));
}

ipcMain.handle('comandi:tandas', (evento) => (desdeComandi(evento) ? reglas.tandas(leerAjustes()) : []));
ipcMain.handle('comandi:falta', (evento) => (desdeComandi(evento) ? reglas.faltaPorElegir(leerAjustes()) : []));
ipcMain.handle('comandi:imprimir', async (evento, destino) => {
  if (!desdeComandi(evento)) return { ok: false, error: 'No permitido' };
  const ajustes = leerAjustes();
  const impresora = reglas.impresoraPara(ajustes, destino);
  if (impresora === null) return { ok: false, error: 'Esa tanda no tiene impresora' };
  if (!ajustes.papelJusto) return imprimirEn(evento.sender, impresora);
  return papel.imprimirALaMedida(evento.sender, ajustes.papel, (tamano) => imprimirEn(evento.sender, impresora, tamano));
});
ipcMain.on('comandi:abrir-ajustes', (evento) => { if (desdeComandi(evento)) abrirAjustes(); });
ipcMain.on('comandi:aviso', (evento, pendientes) => {
  if (!desdeComandi(evento) || !ventana) return;
  ventana.setTitle(reglas.tituloCon(pendientes));
  if (Number(pendientes) > 0 && !ventana.isFocused()) ventana.flashFrame(true);
});

// ---------- Lo que pide la ventana de ajustes (src/preload-ajustes.js) ----------
function desdeAjustes(evento) {
  return !!(ventanaAjustes && evento && evento.sender === ventanaAjustes.webContents);
}
ipcMain.handle('ajustes:leer', (evento) => (desdeAjustes(evento) ? leerAjustes() : null));
ipcMain.handle('ajustes:guardar', (evento, nuevos) => (desdeAjustes(evento) ? guardarAjustes(nuevos) : null));
ipcMain.handle('ajustes:impresoras', async (evento) => {
  if (!desdeAjustes(evento)) return [];
  const lista = await evento.sender.getPrintersAsync();
  return lista.map((p) => ({ nombre: p.name, visible: p.displayName || p.name, predeterminada: !!p.isDefault }));
});
ipcMain.handle('ajustes:probar', async (evento, impresora, rotulo) => {
  if (!desdeAjustes(evento)) return { ok: false, error: 'No permitido' };
  const prueba = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
  const html = '<!doctype html><meta charset="utf-8"><body style="font-family:monospace;font-size:14px;margin:0;padding:8px">'
    + '<p style="font-size:20px;font-weight:bold;text-align:center">COMANDI</p>'
    + '<p style="text-align:center">Prueba de impresora</p><p style="text-align:center">'
    + String(rotulo || '').replace(/[<>&]/g, '') + '</p><p style="text-align:center">' + new Date().toLocaleString('es-ES')
    + '</p><p>--------------------------------</p></body>';
  await prueba.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  const r = await imprimirEn(prueba.webContents, impresora || '');
  prueba.destroy();
  return r;
});

// ---------- Actualizarse sola (26/10/2026) ----------
// Las versiones nuevas están en GitHub (sancascd/comandi-escritorio, público):
// se bajan solas y se instalan al cerrar la aplicación o, como en una cocina
// no se cierra nunca, de madrugada (a las 4), cuando no hay pedidos.
let actualizacionLista = false;
function actualizaciones() {
  if (!app.isPackaged) return;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('update-downloaded', () => { actualizacionLista = true; });
  autoUpdater.on('error', (e) => console.log('[actualizar]', e && e.message));
  const mirar = () => autoUpdater.checkForUpdates().catch((e) => console.log('[actualizar]', e && e.message));
  mirar();
  setInterval(mirar, 6 * 60 * 60 * 1000);
  setInterval(() => {
    if (actualizacionLista && reglas.esHoraDeActualizar(new Date())) {
      saliendo = true;
      autoUpdater.quitAndInstall(true, true);
    }
  }, 10 * 60 * 1000);
}

// ---------- Arranque ----------
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (ventana) { if (ventana.isMinimized()) ventana.restore(); ventana.focus(); }
  });
  app.whenReady().then(() => {
    menu();
    aplicarArranque(leerAjustes());
    // Que el ordenador no se duerma con Comandi abierta.
    powerSaveBlocker.start('prevent-app-suspension');
    crearVentana();
    actualizaciones();
    // La primera vez, directo a elegir impresoras.
    if (!fs.existsSync(rutaAjustes())) abrirAjustes();
  });
  app.on('before-quit', () => { saliendo = true; });
  app.on('window-all-closed', () => app.quit());
}
