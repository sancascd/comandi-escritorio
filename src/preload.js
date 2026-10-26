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
    imprimir: (tanda) => ipcRenderer.invoke('comandi:imprimir', String(tanda || 'todo')),
    abrirAjustes: () => ipcRenderer.send('comandi:abrir-ajustes'),
    // Los pedidos sin atender: van al título y hacen parpadear la barra.
    aviso: (pendientes) => ipcRenderer.send('comandi:aviso', Number(pendientes) || 0),
    // Para volver a preguntar las tandas cuando cambian los ajustes.
    alCambiarAjustes: (fn) => { ipcRenderer.on('comandi:ajustes-cambiados', () => { try { fn(); } catch (e) { /* da igual */ } }); },
  });
}
