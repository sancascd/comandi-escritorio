// La ventana de «Impresoras y ajustes» (src/ajustes.html).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ajustes', {
  leer: () => ipcRenderer.invoke('ajustes:leer'),
  guardar: (nuevos) => ipcRenderer.invoke('ajustes:guardar', nuevos),
  impresoras: () => ipcRenderer.invoke('ajustes:impresoras'),
  probar: (impresora, rotulo, enDirecto) => ipcRenderer.invoke('ajustes:probar', impresora, rotulo, enDirecto === true),
  probarCashdro: (datos) => ipcRenderer.invoke('ajustes:cashdro-probar', datos),
});
