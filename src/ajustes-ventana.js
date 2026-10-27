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
  pintarModo();
  document.querySelectorAll('input[name="modo"]').forEach((r) => r.addEventListener('change', pintarModo));

  document.querySelectorAll('[data-probar]').forEach((b) => b.addEventListener('click', async () => {
    estado('Imprimiendo una prueba…');
    const r = await window.ajustes.probar($(b.dataset.probar).value, b.dataset.rotulo);
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
    await window.ajustes.guardar({
      modo,
      impresoras: { todo: $('imp-todo').value, cocina: $('imp-cocina').value, cliente: $('imp-cliente').value },
      papel: Number($('papel').value),
      papelJusto: $('papel-justo').checked,
    });
    estado('Guardado. Ya puedes cerrar esta ventana.', 'bien');
  });
})();
