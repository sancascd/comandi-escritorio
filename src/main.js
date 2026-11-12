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

const { app, BrowserWindow, ipcMain, shell, dialog, Menu, powerSaveBlocker, powerMonitor, safeStorage, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const reglas = require('./reglas');
const papel = require('./papel');
const directo = require('./directo');
const dibujarTicket = require('./dibujarTicket');
const cashdro = require('./cashdro');
const { autoUpdater } = require('electron-updater');

// Para probarla en un ordenador que ya la tiene instalada (solo con `npm start`,
// nunca en la instalada): otra carpeta de datos y, si se quiere, otra dirección.
if (!app.isPackaged && process.env.COMANDI_PRUEBA_DATOS) app.setPath('userData', process.env.COMANDI_PRUEBA_DATOS);
const PORTADA = (!app.isPackaged && process.env.COMANDI_PRUEBA_URL) || reglas.PORTADA;

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
// Cuándo se imprimió por última vez: para no reiniciarse a mitad de faena.
let ultimaImpresion = null;
function imprimirEn(webContents, deviceName, pageSize) {
  ultimaImpresion = Date.now();
  const trabajo = new Promise((resolve) => {
    const opciones = { silent: true, printBackground: true, margins: { marginType: 'none' } };
    if (deviceName) opciones.deviceName = deviceName;
    if (pageSize) opciones.pageSize = pageSize; // el papel a la medida (src/papel.js)
    try {
      webContents.print(opciones, (ok, motivo) => resolve({ ok, error: ok ? null : String(motivo || 'No se ha podido imprimir') }));
    } catch (e) {
      resolve({ ok: false, error: String((e && e.message) || e) });
    }
  });
  // Si la impresora no contesta, no se queda esperando (09/11/2026).
  return reglas.conTiempoMaximo(trabajo, reglas.TIEMPO_MAX_IMPRESION_MS,
    { ok: false, error: 'La impresora no contesta' });
}

// El registro de impresiones (09/11/2026, reglas.lineaDeRegistro): en la
// carpeta de la aplicación, %APPDATA%\Comandi\impresiones.log.
const rutaRegistro = () => path.join(app.getPath('userData'), 'impresiones.log');
function registrar(que, r) {
  try {
    const linea = reglas.lineaDeRegistro(new Date(), app.getVersion(), que, r);
    let antes = '';
    try { antes = fs.readFileSync(rutaRegistro(), 'utf8'); } catch (e) { /* aún no hay */ }
    fs.writeFileSync(rutaRegistro(), reglas.recortarRegistro(antes + linea + '\n'), 'utf8');
  } catch (e) { /* que el registro nunca impida imprimir */ }
}

// ---------- Modo directo (10/11/2026, src/directo.js) ----------
// El nombre de la impresora de verdad ('' = la predeterminada de Windows).
async function nombreDeImpresora(webContents, impresora) {
  if (impresora) return impresora;
  try {
    const lista = await webContents.getPrintersAsync();
    const pred = lista.find((p) => p.isDefault);
    return pred ? pred.name : '';
  } catch (e) { return ''; }
}
// Manda los bytes a la cola de Windows en crudo (directo.SCRIPT_RAW).
function mandarEnCrudo(nombre, bytes) {
  const { spawn } = require('child_process');
  const dir = app.getPath('userData');
  const script = path.join(dir, 'imprimir-directo.ps1');
  try {
    let antes = '';
    try { antes = fs.readFileSync(script, 'utf8'); } catch (e) { /* aún no está */ }
    if (antes !== directo.SCRIPT_RAW) fs.writeFileSync(script, directo.SCRIPT_RAW, 'utf8');
  } catch (e) { return Promise.resolve({ ok: false, error: 'No se ha podido preparar el modo directo' }); }
  const archivo = path.join(dir, 'ticket-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.bin');
  fs.writeFileSync(archivo, bytes);
  const trabajo = new Promise((resolve) => {
    let salida = '';
    let hijo;
    try {
      hijo = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script,
        '-Impresora', nombre, '-Archivo', archivo], { windowsHide: true });
    } catch (e) { resolve({ ok: false, error: 'No se ha podido abrir PowerShell' }); return; }
    hijo.stdout.on('data', (d) => { salida += d; });
    hijo.stderr.on('data', (d) => { salida += d; });
    hijo.on('error', () => resolve({ ok: false, error: 'No se ha podido abrir PowerShell' }));
    hijo.on('close', (codigo) => resolve(codigo === 0 ? { ok: true, error: null } : { ok: false, error: directo.errorDeWindows(salida) }));
  });
  return reglas.conTiempoMaximo(trabajo, reglas.TIEMPO_MAX_IMPRESION_MS, { ok: false, error: 'La impresora no contesta' })
    .finally(() => { try { fs.unlinkSync(archivo); } catch (e) { /* da igual */ } });
}
// Dibuja unos tickets (su HTML, con unos estilos) y los manda en modo directo.
async function imprimirDirectoTickets(webContents, impresora, papelMm, estilos, tickets) {
  ultimaImpresion = Date.now();
  const nombre = await nombreDeImpresora(webContents, impresora);
  if (!nombre) return { ok: false, error: 'No hay impresora elegida ni predeterminada' };
  if (!tickets || tickets.length === 0) return { ok: false, error: 'No hay nada que imprimir' };
  const anchoMm = reglas.anchoParaMedir(papelMm);
  const puntos = directo.puntosDelRollo(papelMm);
  const partes = [];
  for (const html of tickets) {
    const p = await dibujarTicket.dibujar(BrowserWindow, { estilos, html, anchoMm, puntos });
    if (p.alto > 0) partes.push(directo.ordenesDelTicket(p));
  }
  if (partes.length === 0) return { ok: false, error: 'El ticket ha salido vacío al dibujarlo' };
  return mandarEnCrudo(nombre, Buffer.concat(partes));
}
// Lo que pinta ahora el tablero, en modo directo.
async function imprimirDirectoPagina(webContents, impresora, papelMm) {
  const { estilos, tickets } = await dibujarTicket.ticketsDeLaPagina(webContents);
  return imprimirDirectoTickets(webContents, impresora, papelMm, estilos, tickets);
}

// ---------- La ventana del tablero ----------
let reintentoTablero = null;
let colgado = null;
function abrirTablero() {
  clearTimeout(reintentoTablero);
  reintentoTablero = null;
  if (ventana) ventana.loadURL(PORTADA).catch(() => { /* lo recoge did-fail-load */ });
}

// Lo que lleva cualquier ventana con comandi.es dentro.
function preferenciasComandi() {
  return {
    preload: path.join(__dirname, 'preload.js'),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    partition: 'persist:comandi',
  };
}
// Lo de fuera de comandi.es, al navegador; lo de dentro, en una ventana de la aplicación.
function abrirVentanaHija({ url }) {
  if (!reglas.esDeComandi(url)) { shell.openExternal(url); return { action: 'deny' }; }
  return {
    action: 'allow',
    overrideBrowserWindowOptions: {
      autoHideMenuBar: true,
      icon: path.join(__dirname, 'icono.png'),
      webPreferences: preferenciasComandi(),
    },
  };
}

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
  abrirTablero();

  // Sin internet al encender (09/11/2026, reglas.hayQueReintentar): «Conectando
  // con Comandi» y otra vez cada 10 segundos, hasta que entra.
  ventana.webContents.on('did-fail-load', (evento, codigo, descripcion, url, esPrincipal) => {
    if (!reglas.hayQueReintentar(codigo, esPrincipal) || !ventana) return;
    registrar('no se abre el tablero', { ok: false, error: String(descripcion || '') + ' (' + codigo + ')' });
    ventana.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(reglas.paginaSinConexion(descripcion))).catch(() => {});
    clearTimeout(reintentoTablero);
    reintentoTablero = setTimeout(abrirTablero, reglas.REINTENTO_MS);
  });
  // Cuándo ha quedado abierto el tablero: para saber, si dicen «no imprimía»,
  // desde qué hora estaba de verdad funcionando.
  ventana.webContents.on('did-finish-load', () => {
    if (ventana && reglas.esDeComandi(ventana.webContents.getURL())) registrar('tablero abierto', { ok: true });
  });
  // Si la página se rompe o se queda colgada, se vuelve a abrir.
  ventana.webContents.on('render-process-gone', (evento, detalles) => {
    registrar('el tablero se ha cerrado solo', { ok: false, error: detalles && detalles.reason });
    clearTimeout(reintentoTablero);
    reintentoTablero = setTimeout(abrirTablero, 2000);
  });
  ventana.on('unresponsive', () => {
    clearTimeout(colgado);
    colgado = setTimeout(() => {
      registrar('el tablero no responde: se vuelve a abrir', { ok: false });
      try { ventana.webContents.forcefullyCrashRenderer(); } catch (e) { abrirTablero(); }
    }, reglas.COLGADO_MS);
  });
  ventana.on('responsive', () => { clearTimeout(colgado); colgado = null; });

  // Nada que no sea comandi.es se abre aquí dentro.
  ventana.webContents.setWindowOpenHandler(abrirVentanaHija);
  // Las ventanas que abre el tablero (en el ordenador que imprime, Ajustes y lo
  // demás se abren aparte para no cerrar el tablero) son también la aplicación
  // (09/11/2026): con su `comandiEscritorio`, para que en Ajustes salgan las
  // impresoras y la CashDro de este ordenador, y con las mismas guardas.
  ventana.webContents.on('did-create-window', (hija) => {
    hija.webContents.setWindowOpenHandler(abrirVentanaHija);
    hija.webContents.on('will-navigate', (evento, url) => {
      if (!reglas.esDeComandi(url)) { evento.preventDefault(); shell.openExternal(url); }
    });
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
  // Del alto de la pantalla como mucho (09/11/2026: en una pantalla baja, la
  // CashDro y «Guardar» se quedaban por debajo del borde), y se puede estirar.
  let alto = 900;
  try { alto = Math.max(480, Math.min(900, screen.getPrimaryDisplay().workAreaSize.height - 20)); } catch (e) { /* 900 */ }
  ventanaAjustes = new BrowserWindow({
    width: 560,
    height: alto,
    minHeight: 400,
    resizable: true,
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
ipcMain.handle('comandi:imprimir', async (evento, destino, que) => {
  if (!desdeComandi(evento)) return { ok: false, error: 'No permitido' };
  const ajustes = leerAjustes();
  const impresora = reglas.impresoraPara(ajustes, destino);
  const rotulo = String(que || destino || '') + ' en ' + (impresora || 'la predeterminada');
  if (impresora === null) {
    const r = { ok: false, error: 'Esa tanda no tiene impresora' };
    registrar(rotulo, r);
    return r;
  }
  let r;
  try {
    r = ajustes.directo
      ? await imprimirDirectoPagina(evento.sender, impresora, ajustes.papel)
      : !ajustes.papelJusto
        ? await imprimirEn(evento.sender, impresora)
        : await papel.imprimirALaMedida(evento.sender, ajustes.papel, (tamano) => imprimirEn(evento.sender, impresora, tamano));
  } catch (e) {
    r = { ok: false, error: String((e && e.message) || e) };
  }
  registrar(rotulo, r);
  return r;
});
// La versión de la aplicación, para que el tablero la apunte con lo impreso.
ipcMain.handle('comandi:version', (evento) => (desdeComandi(evento) ? app.getVersion() : null));
ipcMain.on('comandi:abrir-ajustes', (evento) => { if (desdeComandi(evento)) abrirAjustes(); });
ipcMain.on('comandi:aviso', (evento, pendientes) => {
  if (!desdeComandi(evento) || !ventana) return;
  ventana.setTitle(reglas.tituloCon(pendientes));
  if (Number(pendientes) > 0 && !ventana.isFocused()) ventana.flashFrame(true);
});

// ---------- La CashDro (06/11/2026, src/cashdro.js) ----------
// La contraseña, cifrada con la cuenta de Windows de este ordenador.
function cifrar(texto) {
  if (!safeStorage.isEncryptionAvailable()) return '';
  return safeStorage.encryptString(String(texto)).toString('base64');
}
function descifrar(b64) {
  if (!b64 || !safeStorage.isEncryptionAvailable()) return '';
  try { return safeStorage.decryptString(Buffer.from(b64, 'base64')); } catch (e) { return ''; }
}

// La petición a la máquina, con la huella de su certificado: src/cashdroRed.js.
const peticionCashdro = require('./cashdroRed').peticion;

// Para cobrar: con la huella apuntada (si va por https y no hay, hay que probar antes).
function cfgCashdro() {
  const c = leerAjustes().cashdro;
  return { ip: c.ip, usuario: c.usuario, clave: descifrar(c.claveCifrada), ruta: c.ruta, protocolo: c.protocolo, huella: c.huella };
}
function peticionCobro(cfg) {
  return (url) => {
    if (cfg.protocolo !== 'http' && !cfg.huella) {
      return Promise.reject(new Error('falta «Probar conexión» en Impresoras y ajustes'));
    }
    return peticionCashdro(url, cfg.protocolo === 'http' ? null : cfg.huella);
  };
}

// La última prueba que salió bien, para guardar con los ajustes lo que contestó.
let ultimaPrueba = null;

// El cobro que está en marcha (solo uno a la vez). Mientras, la aplicación no
// se reinicia para actualizarse.
let cobroEnCurso = null;
const errorDe = (e) => ({ ok: false, error: e && e.message ? 'No se llega a la máquina: ' + e.message : 'No se llega a la máquina' });

ipcMain.handle('comandi:cashdro-lista', (evento) => desdeComandi(evento) && reglas.cashdroLista(leerAjustes()));
ipcMain.handle('comandi:cashdro-cobrar', async (evento, centimos) => {
  if (!desdeComandi(evento)) return { ok: false, error: 'No permitido' };
  if (!reglas.cashdroLista(leerAjustes())) return { ok: false, error: 'La CashDro no está configurada en este ordenador' };
  try {
    const cfg = cfgCashdro();
    // Si quedó uno apuntado (se recargó el tablero a mitad), se mira si ya acabó.
    if (cobroEnCurso) {
      const antes = await cashdro.comoVa(peticionCobro(cfg), cfg, cobroEnCurso).catch(() => null);
      if (antes && antes.ok && antes.terminada) cobroEnCurso = null;
      else return { ok: false, error: 'Ya hay un cobro en marcha en la CashDro: acábalo o cancélalo en la máquina' };
    }
    const r = await cashdro.empezarCobro(peticionCobro(cfg), cfg, centimos);
    if (r.ok) cobroEnCurso = r.operacion;
    return r;
  } catch (e) { return errorDe(e); }
});
// Soltar dinero (12/11/2026): el cambio que se lleva un repartidor. Igual que
// cobrar: una operación a la vez, y no se reinicia a mitad.
ipcMain.handle('comandi:cashdro-pagar', async (evento, centimos) => {
  if (!desdeComandi(evento)) return { ok: false, error: 'No permitido' };
  if (!reglas.cashdroLista(leerAjustes())) return { ok: false, error: 'La CashDro no está configurada en este ordenador' };
  try {
    const cfg = cfgCashdro();
    if (cobroEnCurso) {
      const antes = await cashdro.comoVa(peticionCobro(cfg), cfg, cobroEnCurso).catch(() => null);
      if (antes && antes.ok && antes.terminada) cobroEnCurso = null;
      else return { ok: false, error: 'Ya hay una operación en marcha en la CashDro: acábala o cancélala en la máquina' };
    }
    const r = await cashdro.empezarPago(peticionCobro(cfg), cfg, centimos);
    if (r.ok) cobroEnCurso = r.operacion;
    registrar('la CashDro suelta ' + (Number(centimos) / 100).toFixed(2) + ' €', r);
    return r;
  } catch (e) { return errorDe(e); }
});
ipcMain.handle('comandi:cashdro-estado', async (evento, operacion) => {
  if (!desdeComandi(evento)) return { ok: false, error: 'No permitido' };
  try {
    const cfg = cfgCashdro();
    const r = await cashdro.comoVa(peticionCobro(cfg), cfg, String(operacion || ''));
    if (r.ok && r.terminada && cobroEnCurso === String(operacion)) cobroEnCurso = null;
    return r;
  } catch (e) { return errorDe(e); }
});
ipcMain.handle('comandi:cashdro-cancelar', async (evento, operacion) => {
  if (!desdeComandi(evento)) return { ok: false, error: 'No permitido' };
  try {
    const cfg = cfgCashdro();
    return await cashdro.cancelar(peticionCobro(cfg), cfg, String(operacion || ''));
  } catch (e) { return errorDe(e); }
});
// El tablero da el cobro por acabado (o se ha recargado y lo suelta).
ipcMain.on('comandi:cashdro-soltar', (evento, operacion) => {
  if (desdeComandi(evento) && cobroEnCurso === String(operacion)) cobroEnCurso = null;
});

// ---------- Lo que pide la ventana de ajustes (src/preload-ajustes.js) ----------
function desdeAjustes(evento) {
  return !!(ventanaAjustes && evento && evento.sender === ventanaAjustes.webContents);
}
// La ventana de ajustes nunca ve la contraseña de la CashDro: solo si hay una.
function paraLaVentana(a) {
  const { claveCifrada, huella, ...resto } = a.cashdro;
  return { ...a, cashdro: { ...resto, tieneClave: !!claveCifrada, probada: !!huella || resto.protocolo === 'http' } };
}
// Lo mismo para la ventana de ajustes y para el apartado «Impresoras y CashDro
// de este ordenador» de Ajustes en comandi.es (09/11/2026, Sandra: «pon esa
// ventana como un apartado de ajustes, así lo encuentran más fácil»). La
// contraseña de la CashDro va del formulario a esta aplicación, se cifra aquí
// y nunca sale del ordenador: ni vuelve a la página ni pasa por comandi.es.
function ajustesGuardar(nuevos) {
  const antes = leerAjustes();
  const n = nuevos && typeof nuevos === 'object' ? nuevos : {};
  // Si no viene nada de la CashDro, se queda como estaba.
  if (!n.cashdro || typeof n.cashdro !== 'object') return paraLaVentana(guardarAjustes({ ...n, cashdro: antes.cashdro }));
  const c = n.cashdro;
  // La contraseña: si se escribe una, se cifra; si se deja en blanco, la de antes.
  let claveCifrada = antes.cashdro.claveCifrada;
  if (c.borrarClave) claveCifrada = '';
  else if (typeof c.clave === 'string' && c.clave !== '') claveCifrada = cifrar(c.clave);
  const ip = reglas.cashdroValida(c).ip;
  // Lo que contestó al probar: de la prueba de ahora si es esa IP; si no, lo de
  // antes si la IP no ha cambiado; y si ha cambiado, hay que volver a probar.
  const prueba = ultimaPrueba && ultimaPrueba.ip === ip ? ultimaPrueba
    : (ip === antes.cashdro.ip ? antes.cashdro : {});
  return paraLaVentana(guardarAjustes({
    ...n,
    cashdro: { ip, usuario: c.usuario, claveCifrada, ruta: prueba.ruta, protocolo: prueba.protocolo, huella: prueba.huella },
  }));
}
async function ajustesProbarCashdro(datos) {
  const d = datos && typeof datos === 'object' ? datos : {};
  const ip = cashdro.ipValida(d.ip);
  const clave = typeof d.clave === 'string' && d.clave !== '' ? d.clave : descifrar(leerAjustes().cashdro.claveCifrada);
  try {
    const r = await cashdro.probar((url) => peticionCashdro(url, null), { ip, usuario: String(d.usuario || '').trim(), clave });
    if (r.ok) ultimaPrueba = { ip, ruta: r.ruta, protocolo: r.protocolo, huella: r.huella || '' };
    return { ok: r.ok, error: r.error, aviso: r.aviso || null };
  } catch (e) { return errorDe(e); }
}
async function ajustesImpresoras(webContents) {
  const lista = await webContents.getPrintersAsync();
  return lista.map((p) => ({ nombre: p.name, visible: p.displayName || p.name, predeterminada: !!p.isDefault }));
}
async function ajustesProbarImpresora(impresora, rotulo, enDirecto, webContents) {
  // En modo directo (10/11/2026), la prueba también: un ticket dibujado y en crudo.
  if (enDirecto === true) {
    const estilos = '.ticket { font-family: "Courier New", monospace; font-size: 11pt; line-height: 1.3; font-weight: bold; text-align: center; } .ticket p { margin: 0 0 1mm; } .ticket .g { font-size: 16pt; }';
    const html = '<div class="ticket"><p class="g">COMANDI</p><p>Prueba de impresora (modo directo)</p><p>'
      + String(rotulo || '').replace(/[<>&]/g, '') + '</p><p>' + new Date().toLocaleString('es-ES') + '</p><p>--------------------------------</p></div>';
    let r;
    try { r = await imprimirDirectoTickets(webContents, typeof impresora === 'string' ? impresora : '', leerAjustes().papel, estilos, [html]); }
    catch (e) { r = { ok: false, error: String((e && e.message) || e) }; }
    registrar('prueba en modo directo en ' + (impresora || 'la predeterminada'), r);
    return r;
  }
  const prueba = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
  const html = '<!doctype html><meta charset="utf-8"><body style="font-family:monospace;font-size:14px;margin:0;padding:8px">'
    + '<p style="font-size:20px;font-weight:bold;text-align:center">COMANDI</p>'
    + '<p style="text-align:center">Prueba de impresora</p><p style="text-align:center">'
    + String(rotulo || '').replace(/[<>&]/g, '') + '</p><p style="text-align:center">' + new Date().toLocaleString('es-ES')
    + '</p><p>--------------------------------</p></body>';
  await prueba.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  const r = await imprimirEn(prueba.webContents, typeof impresora === 'string' ? impresora : '');
  prueba.destroy();
  registrar('prueba de impresora en ' + (impresora || 'la predeterminada'), r);
  return r;
}
// Tras guardar, el tablero vuelve a mirar sus impresoras y la CashDro.
function avisarAjustesCambiados() {
  if (ventana) ventana.webContents.send('comandi:ajustes-cambiados');
}

ipcMain.handle('ajustes:leer', (evento) => (desdeAjustes(evento) ? paraLaVentana(leerAjustes()) : null));
ipcMain.handle('ajustes:guardar', (evento, nuevos) => (desdeAjustes(evento) ? ajustesGuardar(nuevos) : null));
ipcMain.handle('ajustes:cashdro-probar', (evento, datos) => (desdeAjustes(evento) ? ajustesProbarCashdro(datos) : { ok: false, error: 'No permitido' }));
ipcMain.handle('ajustes:impresoras', (evento) => (desdeAjustes(evento) ? ajustesImpresoras(evento.sender) : []));
ipcMain.handle('ajustes:probar', (evento, impresora, rotulo, enDirecto) => (desdeAjustes(evento) ? ajustesProbarImpresora(impresora, rotulo, enDirecto === true, evento.sender) : { ok: false, error: 'No permitido' }));

// Desde Ajustes de comandi.es (src/preload.js, `ajustesOrdenador`).
ipcMain.handle('comandi:ajustes-leer', (evento) => (desdeComandi(evento) ? paraLaVentana(leerAjustes()) : null));
ipcMain.handle('comandi:ajustes-guardar', (evento, nuevos) => {
  if (!desdeComandi(evento)) return null;
  const r = ajustesGuardar(nuevos);
  avisarAjustesCambiados();
  return r;
});
ipcMain.handle('comandi:ajustes-cashdro-probar', (evento, datos) => (desdeComandi(evento) ? ajustesProbarCashdro(datos) : { ok: false, error: 'No permitido' }));
ipcMain.handle('comandi:ajustes-impresoras', (evento) => (desdeComandi(evento) ? ajustesImpresoras(evento.sender) : []));
ipcMain.handle('comandi:ajustes-probar', (evento, impresora, rotulo, enDirecto) => (desdeComandi(evento) ? ajustesProbarImpresora(impresora, rotulo, enDirecto === true, evento.sender) : { ok: false, error: 'No permitido' }));

// ---------- Actualizarse sola (26/10/2026) ----------
// Las versiones nuevas están en GitHub (sancascd/comandi-escritorio, público):
// se bajan solas y se instalan al cerrar la aplicación o, como en una cocina
// no se cierra nunca, de madrugada (a las 4), cuando no hay pedidos.
// Desde el 06/11/2026 mira cada media hora y se instala en el primer momento
// tranquilo (reglas.esMomentoTranquilo): un arreglo urgente llega en el día.
let actualizacionLista = false;

// VOLVER A ABRIRSE SÍ O SÍ (09/11/2026). El instalador nuevo abre la
// aplicación al acabar, pero si por lo que sea no lo hiciera, el restaurante se
// quedaría sin tablero ni impresora el resto del día sin saberlo. Así que, al
// irse a actualizar, deja encargado abrirla otra vez dentro de un minuto (lo
// que tarda en instalarse). Si ya se abrió sola, esa segunda vez solo la trae
// al frente (requestSingleInstanceLock).
function volverAAbrirseLuego() {
  const { spawn } = require('child_process');
  // Sin ventana (10/11/2026): un guion de wscript que espera y la abre.
  try {
    const guion = reglas.guionVolverAAbrir(process.execPath, 60);
    if (guion) {
      const archivo = path.join(app.getPath('userData'), 'volver-a-abrir.vbs');
      fs.writeFileSync(archivo, guion, 'utf8');
      const hijo = spawn('wscript.exe', ['//B', '//Nologo', archivo], { detached: true, stdio: 'ignore', windowsHide: true });
      hijo.on('error', () => { /* sin wscript: no hay reserva posible ya, la app se va */ });
      hijo.unref();
      return;
    }
  } catch (e) { /* abajo, la de reserva */ }
  // De reserva, la de antes (con ventana).
  try {
    const orden = reglas.ordenVolverAAbrir(process.execPath, 60);
    if (!orden) return;
    spawn('cmd.exe', orden, { detached: true, stdio: 'ignore', windowsHide: true, windowsVerbatimArguments: true }).unref();
  } catch (e) { registrar('no se ha podido dejar encargado volver a abrirse', { ok: false, error: e && e.message }); }
}

function actualizaciones() {
  if (!app.isPackaged) return;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('update-downloaded', (info) => {
    actualizacionLista = true;
    registrar('versión nueva bajada ' + String((info && info.version) || ''), { ok: true });
  });
  autoUpdater.on('error', (e) => console.log('[actualizar]', e && e.message));
  const mirar = () => autoUpdater.checkForUpdates().catch((e) => console.log('[actualizar]', e && e.message));
  mirar();
  setInterval(mirar, 30 * 60 * 1000);
  setInterval(() => {
    if (!actualizacionLista) return;
    const ahora = new Date();
    if (reglas.esHoraDeActualizar(ahora)
        || reglas.esMomentoTranquilo({ ahora: ahora.getTime(), ultimaImpresion, quietoSeg: powerMonitor.getSystemIdleTime(), cobrando: !!cobroEnCurso })) {
      saliendo = true;
      registrar('se reinicia para actualizarse', { ok: true });
      volverAAbrirseLuego();
      autoUpdater.quitAndInstall(true, true);
    }
  }, 60 * 1000);
}

// ---------- Arranque ----------
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (ventana) { if (ventana.isMinimized()) ventana.restore(); ventana.focus(); }
  });
  // Para que los avisos de Windows (las notificaciones del tablero) salgan con
  // el nombre de la aplicación, igual que en Chrome (09/11/2026).
  app.setAppUserModelId('es.comandi.escritorio');
  app.whenReady().then(() => {
    registrar('se abre la aplicación', { ok: true });
    // Solo con `npm start` (nunca en la instalada): probar el modo directo
    // contra la impresora que se diga, y salir.
    if (!app.isPackaged && process.env.COMANDI_PRUEBA_DIRECTO) {
      const w = new BrowserWindow({ show: false });
      ajustesProbarImpresora(process.env.COMANDI_PRUEBA_DIRECTO, 'prueba', true, w.webContents)
        .then((r) => { console.log('[prueba-directo]', JSON.stringify(r)); app.exit(0); });
      return;
    }
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
