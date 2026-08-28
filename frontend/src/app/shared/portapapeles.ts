/**
 * Copiar texto al portapapeles, con red de seguridad.
 *
 * `navigator.clipboard` no siempre está: fuera de contexto seguro —entrando por
 * la IP de la red local, por ejemplo— no existe. Pero es que además, cuando
 * existe, **puede rechazar**: sin permiso, sin gesto reciente del usuario o con
 * la ventana sin foco. Por eso no basta con mirar si la API está ahí; hay que
 * intentar la copia y, si falla, recurrir al truco clásico del `<textarea>`.
 */
export async function copiarAlPortapapeles(texto: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(texto);
      return;
    } catch (err) {
      // Se deja constancia y se prueba con el método de siempre.
      console.warn('El portapapeles del navegador ha rechazado la copia:', err);
    }
  }
  copiarConTextarea(texto);
}

/** El método de toda la vida: un campo invisible, seleccionar y copiar. */
function copiarConTextarea(texto: string): void {
  const area = document.createElement('textarea');
  area.value = texto;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.top = '0';
  area.style.opacity = '0';
  document.body.appendChild(area);

  // Copiar cambia la selección, así que se devuelve luego a donde estaba.
  const seleccion = window.getSelection();
  const rango = seleccion && seleccion.rangeCount > 0 ? seleccion.getRangeAt(0) : null;

  area.select();
  try {
    if (!document.execCommand('copy')) {
      throw new Error('el navegador no ha permitido copiar');
    }
  } finally {
    document.body.removeChild(area);
    if (rango) {
      seleccion!.removeAllRanges();
      seleccion!.addRange(rango);
    }
  }
}
