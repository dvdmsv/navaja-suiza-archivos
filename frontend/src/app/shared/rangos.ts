/**
 * Traducción entre "1-3, 7, 10-" y la lista de páginas que representa.
 *
 * El servidor valida por su cuenta —no se fía de lo que llega—, pero el
 * navegador necesita lo mismo para mantener sincronizadas las miniaturas y el
 * campo de texto mientras se escribe.
 */

/** Expande el texto a números de página; ignora en silencio lo que no entiende. */
export function expandirRangos(texto: string, total: number): number[] {
  const paginas = new Set<number>();

  for (const trozo of texto.split(/[,;\s]+/).filter(Boolean)) {
    const numero = Number(trozo);
    if (Number.isInteger(numero) && numero >= 1 && numero <= total) {
      paginas.add(numero);
      continue;
    }
    const partes = /^(\d*)-(\d*)$/.exec(trozo);
    if (!partes || (!partes[1] && !partes[2])) {
      continue;
    }
    const inicio = Math.max(1, partes[1] ? Number(partes[1]) : 1);
    const fin = Math.min(total, partes[2] ? Number(partes[2]) : total);
    for (let n = inicio; n <= fin; n++) {
      paginas.add(n);
    }
  }
  return [...paginas].sort((a, b) => a - b);
}

/** Lo contrario: [1,2,3,7] -> "1-3, 7", para no llenar el campo de números sueltos. */
export function comprimirRangos(paginas: number[]): string {
  const ordenadas = [...new Set(paginas)].sort((a, b) => a - b);
  const trozos: string[] = [];

  let inicio: number | null = null;
  let anterior: number | null = null;

  const cerrar = () => {
    if (inicio === null || anterior === null) {
      return;
    }
    trozos.push(inicio === anterior ? `${inicio}` : `${inicio}-${anterior}`);
  };

  for (const pagina of ordenadas) {
    if (anterior !== null && pagina === anterior + 1) {
      anterior = pagina;
      continue;
    }
    cerrar();
    inicio = anterior = pagina;
  }
  cerrar();
  return trozos.join(', ');
}
