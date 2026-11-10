// La ventana de «Impresoras y ajustes».
(async function () {
  const $ = (id) => document.getElementById(id);
  const estado = (texto, clase) => { $('estado').textContent = texto; $('estado').className = clase || ''; };

  const [guardados, impresoras] = await Promise.all([window.ajustes.leer(), window.ajustes.impresoras()]);

  for (const id of ['imp-todo', 'imp-cocina', 'imp-cliente']) {
    const sel = $(id);
    const porDefecto = document.createElement('option');
    porDefecto.value = '';
    const pred = impresoras.find((p) => p.predeterminada);
    porDefecto.textContent = 'La predeterminada de Windows' + (pred ? ' (' + pred.visible + ')' : '');
    sel.appendChild(porDefecto);
    for (const p of impresoras) {
      const o = document.createElement('option');
      o.value = p.nombre;
      o.textContent = p.visible;
      sel.appendChild(o);
    }
  }

  const pintarModo = () => {
    const dos = $('modo-por-ticket').checked;
    $('una').classList.toggle('oculto', dos);
    $('dos').classList.toggle('oculto', !dos);
  };

  $(guardados.modo === 'por_ticket' ? 'modo-por-ticket' : 'modo-una').checked = true;
  $('imp-todo').value = guardados.impresoras.todo || '';
  $('imp-cocina').value = guardados.impresoras.cocina || '';
  $('imp-cliente').value = guardados.impresoras.cliente || '';
  $('papel').value = String(guardados.papel || 80);
  $('papel-justo').checked = guardados.papelJusto !== false;
  $('directo').checked = guardados.directo === true;
  pintarModo();
  document.querySelectorAll('input[name="modo"]').forEach((r) => r.addEventListener('change', pintarModo));

  // La CashDro (06/11/2026). La contraseña no vuelve nunca a esta ventana: solo
  // se sabe si hay una guardada. En blanco = se queda la de antes.
  const cd = guardados.cashdro || {};
  $('cd-ip').value = cd.ip || '';
  $('cd-usuario').value = cd.usuario || '';
  const notaClave = () => {
    $('cd-clave-nota').textContent = cd.tieneClave
      ? 'Hay una guardada (cifrada en este ordenador). Déjala en blanco para no cambiarla.'
      : 'La escribe el restaurante aquí. Se guarda cifrada en este ordenador.';
  };
  notaClave();
  const datosCashdro = () => ({ ip: $('cd-ip').value.trim(), usuario: $('cd-usuario').value.trim(), clave: $('cd-clave').value });
  $('cd-probar').addEventListener('click', async () => {
    const d = datosCashdro();
    if (!d.ip || !d.usuario) { estado('Para probar hacen falta la IP y el usuario.', 'mal'); return; }
    if (!d.clave && !cd.tieneClave) { estado('Falta la contraseña de la CashDro.', 'mal'); return; }
    estado('Probando la CashDro…');
    const r = await window.ajustes.probarCashdro(d);
    estado(r.ok ? 'La CashDro contesta. Pulsa «Guardar» para quedártela.' : 'No conecta: ' + r.error, r.ok ? 'bien' : 'mal');
  });

  document.querySelectorAll('[data-probar]').forEach((b) => b.addEventListener('click', async () => {
    estado('Imprimiendo una prueba…');
    const r = await window.ajustes.probar($(b.dataset.probar).value, b.dataset.rotulo, $('directo').checked);
    estado(r.ok ? 'Prueba enviada. Mira si ha salido el papel.' : 'No ha salido: ' + r.error, r.ok ? 'bien' : 'mal');
  }));

  $('guardar').addEventListener('click', async () => {
    const modo = $('modo-por-ticket').checked ? 'por_ticket' : 'una';
    if (modo === 'por_ticket' && (!$('imp-cocina').value || !$('imp-cliente').value)) {
      estado('Con dos impresoras hay que elegir las dos (no la predeterminada).', 'mal');
      return;
    }
    if (modo === 'por_ticket' && $('imp-cocina').value === $('imp-cliente').value) {
      estado('Has elegido la misma impresora para los dos tickets: para eso, mejor «Una impresora para todo».', 'mal');
      return;
    }
    const d = datosCashdro();
    const r = await window.ajustes.guardar({
      modo,
      impresoras: { todo: $('imp-todo').value, cocina: $('imp-cocina').value, cliente: $('imp-cliente').value },
      papel: Number($('papel').value),
      papelJusto: $('papel-justo').checked,
      directo: $('directo').checked,
      // Sin IP ni usuario, la CashDro se quita de este ordenador.
      cashdro: d.ip || d.usuario ? d : { ip: '', usuario: '', borrarClave: true },
    });
    $('cd-clave').value = '';
    Object.assign(cd, (r && r.cashdro) || {});
    notaClave();
    if (r && r.cashdro && r.cashdro.ip && r.cashdro.tieneClave && !r.cashdro.probada) {
      estado('Guardado. Falta «Probar conexión» para poder cobrar con la CashDro.', 'mal');
      return;
    }
    estado('Guardado. Ya puedes cerrar esta ventana.', 'bien');
  });
})();
