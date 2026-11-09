// Lo que la aplicación le presta al tablero de comandi.es (26/10/2026). En
// Chrome no existe, y el tablero sigue como siempre (window.print()).
const { contextBridge, ipcRenderer } = require('electron');

const esComandi = location.protocol === 'https:' && (location.hostname === 'comandi.es' || location.hostname === 'www.comandi.es');

if (esComandi) {
  contextBridge.exposeInMainWorld('comandiEscritorio', {
    version: 1,
    // Las tandas de una impresión: ['todo'] o ['cocina', 'cliente'].
    tandas: () => ipcRenderer.invoke('comandi:tandas'),
    // Las impresoras que faltan por elegir (si hay alguna, no se imprime bien).
    falta: () => ipcRenderer.invoke('comandi:falta'),
    // Imprime lo que se ve ahora en la impresora de esa tanda: { ok, error }.
    // `que` (09/11/2026): qué es, para el registro de impresiones («#1A2B», «hoja»).
    imprimir: (tanda, que) => ipcRenderer.invoke('comandi:imprimir', String(tanda || 'todo'), String(que || '').slice(0, 120)),
    // La versión de la aplicación (09/11/2026), p. ej. '0.4.1'.
    versionApp: () => ipcRenderer.invoke('comandi:version'),
    abrirAjustes: () => ipcRenderer.send('comandi:abrir-ajustes'),
    // Los pedidos sin atender: van al título y hacen parpadear la barra.
    aviso: (pendientes) => ipcRenderer.send('comandi:aviso', Number(pendientes) || 0),
    // La CashDro (06/11/2026): cobrar en el mostrador. `lista()` dice si este
    // ordenador la tiene configurada. Importes en céntimos.
    cashdro: {
      lista: () => ipcRenderer.invoke('comandi:cashdro-lista'),
      cobrar: (centimos) => ipcRenderer.invoke('comandi:cashdro-cobrar', Number(centimos) || 0),
      estado: (operacion) => ipcRenderer.invoke('comandi:cashdro-estado', String(operacion || '')),
      cancelar: (operacion) => ipcRenderer.invoke('comandi:cashdro-cancelar', String(operacion || '')),
      soltar: (operacion) => ipcRenderer.send('comandi:cashdro-soltar', String(operacion || '')),
    },
    // Las impresoras y la CashDro de este ordenador, para el apartado de
    // Ajustes de comandi.es (09/11/2026). La contraseña se manda una vez para
    // cifrarla aquí; leer() nunca la devuelve (solo si hay una: tieneClave).
    ajustesOrdenador: {
      leer: () => ipcRenderer.invoke('comandi:ajustes-leer'),
      guardar: (nuevos) => ipcRenderer.invoke('comandi:ajustes-guardar', nuevos),
      impresoras: () => ipcRenderer.invoke('comandi:ajustes-impresoras'),
      probar: (impresora, rotulo) => ipcRenderer.invoke('comandi:ajustes-probar', String(impresora || ''), String(rotulo || '')),
      probarCashdro: (datos) => ipcRenderer.invoke('comandi:ajustes-cashdro-probar', datos),
    },
    // Para volver a preguntar las tandas cuando cambian los ajustes.
    alCambiarAjustes: (fn) => { ipcRenderer.on('comandi:ajustes-cambiados', () => { try { fn(); } catch (e) { /* da igual */ } }); },
  });
}
