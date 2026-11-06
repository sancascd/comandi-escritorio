// LA RED HASTA LA CASHDRO (06/11/2026). Aparte de src/main.js para poder
// probarla sin abrir la aplicación (tests/cashdro-red.test.js).
//
// La CashDro tiene un certificado hecho por ella misma, que no firma nadie.
// Al «Probar conexión» se apunta su huella (`cashdro.huella`) y desde entonces
// solo se habla con una máquina que tenga esa misma huella: primero se abre la
// conexión cifrada y se mira la huella, y solo si es la suya se manda la
// petición (que lleva el usuario y la contraseña). Otra cualquiera que se
// pusiera en esa IP no recibe nada.
const https = require('https');
const http = require('http');
const tls = require('tls');

const ESPERA_MS = 10000;
const MAX_CUERPO = 200000;

function leerCuerpo(res, huella, resolve) {
  let cuerpo = '';
  res.setEncoding('utf8');
  res.on('data', (t) => { if (cuerpo.length < MAX_CUERPO) cuerpo += t; });
  res.on('end', () => {
    let json = null;
    try { json = JSON.parse(cuerpo); } catch (e) { json = null; }
    resolve({ status: res.statusCode, json, huella });
  });
}

// `huella` = la esperada (null: solo se está probando y se apunta la que haya).
// Devuelve { status, json, huella } con la huella vista.
function peticion(url, huella) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    if (u.protocol === 'http:') {
      const req = http.get(u, { timeout: ESPERA_MS }, (res) => leerCuerpo(res, '', resolve));
      req.on('timeout', () => req.destroy(new Error('la máquina tarda demasiado')));
      req.on('error', reject);
      return;
    }
    const puerto = Number(u.port) || 443;
    // Sin firma de nadie no se puede «verificar»: se acepta para mirar su huella.
    const sock = tls.connect({ host: u.hostname, port: puerto, rejectUnauthorized: false });
    const fallo = (e) => { sock.destroy(); reject(e); };
    sock.setTimeout(ESPERA_MS, () => fallo(new Error('la máquina tarda demasiado')));
    sock.once('error', reject);
    sock.once('secureConnect', () => {
      const cert = sock.getPeerCertificate();
      const vista = cert && cert.fingerprint256 ? cert.fingerprint256 : '';
      if (!vista) { fallo(new Error('la máquina no enseña su certificado')); return; }
      if (huella && vista !== huella) { fallo(new Error('la máquina de esa IP no es la que se probó')); return; }
      const req = https.get(u, { createConnection: () => sock }, (res) => leerCuerpo(res, vista, resolve));
      req.on('error', reject);
    });
  });
}

module.exports = { peticion };
