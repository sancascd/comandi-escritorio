# Comandi para el ordenador (aplicación de escritorio)

Desde el 26/10/2026. Es una ventana (Electron) que abre **comandi.es/pedidos** y le presta al tablero lo
que Chrome no puede: imprimir sin preguntar en la impresora que toque (una para todo, o la de cocina
y la del cliente), abrirse sola al encender el ordenador, no dejarlo dormir y avisar en la barra de
tareas. El tablero la reconoce por `window.comandiEscritorio` (`src/preload.js`; en el panel,
`lib/escritorio.js`). En Chrome todo sigue igual.

- **Repo público** `sancascd/comandi-escritorio` (Sandra dijo que sí el 26/10): aquí no va nada
  privado — ni claves, ni datos de clientes, ni nada del panel.
- Sin firma de Windows (decisión de Sandra): al instalar sale «Windows protegió tu PC» →
  **Más información → Ejecutar de todas formas**.
- La descarga está en el panel, **comandi.es/descargar** (solo con sesión iniciada), y baja siempre
  el `Comandi-Setup.exe` de la última versión publicada en GitHub.

## Sacar una versión nueva (cada una pide el «publica» de Sandra)

1. Cambiar `version` en `package.json` (0.2.0 → 0.2.1…) y `npm test`.
2. `npm run dist` → `dist/Comandi-Setup.exe`, `Comandi-Setup.exe.blockmap` y `latest.yml`.
   Si falla al desempaquetar *winCodeSign* (enlaces simbólicos sin permiso), extraerlo a mano con
   `node_modules/7zip-bin/win/x64/7za.exe` en `%LOCALAPPDATA%\electron-builder\Cache\winCodeSign\winCodeSign-2.6.0`.
3. `git push` y `gh release create v<versión> dist/Comandi-Setup.exe dist/Comandi-Setup.exe.blockmap dist/latest.yml --repo sancascd/comandi-escritorio`.
4. Los ordenadores la bajan solos (miran cada 6 horas) y se instala al cerrar la aplicación o a las
   4 de la madrugada.

## Lo que viene

- CashDro de Servi-Loli (CashDro 3, de Softsanz): ver la memoria `app-escritorio`.
- Mac (99 €/año de Apple para firmar).
