// La red hasta la CashDro (06/11/2026): una CashDro de mentira en este mismo
// ordenador, con un certificado hecho por ella misma (como las de verdad).
// Hace falta `openssl` para fabricar el certificado; si no está, se salta.
const test = require('node:test');
const assert = require('node:assert/strict');
const https = require('https');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { peticion } = require('../src/cashdroRed');

function certificado(carpeta, nombre) {
  const key = path.join(carpeta, nombre + '.key');
  const crt = path.join(carpeta, nombre + '.crt');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', crt,
    '-days', '1', '-subj', '/CN=cashdro-de-prueba'], { stdio: 'ignore' });
  return { key: fs.readFileSync(key), cert: fs.readFileSync(crt) };
}

let hayOpenssl = true;
try { execFileSync('openssl', ['version'], { stdio: 'ignore' }); } catch (e) { hayOpenssl = false; }

test('la huella: se apunta al probar, y con otra máquina no se manda nada', { skip: !hayOpenssl && 'sin openssl' }, async () => {
  const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'cashdro-'));
  const vistas = [];
  const servidor = (cred) => new Promise((ok) => {
    const s = https.createServer(cred, (req, res) => {
      vistas.push(req.url);
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ code: 1, response: { operation: { OperationId: 0 } } }));
    });
    s.listen(0, '127.0.0.1', () => ok(s));
  });
  const buena = await servidor(certificado(carpeta, 'buena'));
  const otra = await servidor(certificado(carpeta, 'otra'));
  try {
    const url = (s) => 'https://127.0.0.1:' + s.address().port + '/Cashdro3WS/index3.php?operation=askOperationExecuting&name=u&password=p';
    // Al probar: contesta y da su huella.
    const p = await peticion(url(buena), null);
    assert.equal(p.status, 200);
    assert.equal(p.json.code, 1);
    assert.match(p.huella, /^[0-9A-F]{2}(:[0-9A-F]{2}){31}$/);
    // Para cobrar, con esa huella: sigue contestando.
    assert.equal((await peticion(url(buena), p.huella)).status, 200);
    // Otra máquina en su lugar: no se le manda la petición (ni la contraseña).
    const antes = vistas.length;
    await assert.rejects(peticion(url(otra), p.huella), /no es la que se probó/);
    assert.equal(vistas.length, antes, 'la otra no ha recibido nada');
  } finally {
    buena.close();
    otra.close();
    fs.rmSync(carpeta, { recursive: true, force: true });
  }
});

test('una máquina que no está: error, sin quedarse colgado', async () => {
  await assert.rejects(peticion('https://127.0.0.1:1/Cashdro3WS/index3.php', null));
});
