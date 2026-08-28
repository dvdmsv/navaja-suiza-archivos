/**
 * Búsqueda de texto en todo el documento.
 *
 * El índice se construye en segundo plano según se lee, para que abrir un
 * documento largo no se quede esperando a extraer el texto de trescientas
 * páginas.
 */

/** Un fragmento de texto de pdf.js, con su sitio dentro del texto de la página. */
interface Fragmento {
  indice: number;
  inicio: number;
  fin: number;
}

export interface Coincidencia {
  pagina: number;
  inicio: number;
  fin: number;
  /** Un trozo de alrededor, para enseñarlo en la lista de resultados. */
  contexto: string;
  /** Fragmentos de pdf.js que toca, para poder pintarla sobre la página. */
  fragmentos: number[];
}

const CONTEXTO = 40;

/**
 * Deja el texto comparable: sin mayúsculas y sin tildes.
 *
 * Buscar "peticion" tiene que encontrar "petición": en documentos en español,
 * exigir la tilde es exigir que el usuario adivine cómo está escrito.
 * Importante: se hace carácter a carácter para que las posiciones del índice
 * sigan cuadrando con el texto original.
 */
export function normalizar(texto: string): string {
  return [...texto]
    .map(letra => letra.normalize('NFD').replace(/[̀-ͯ]/g, '') || letra)
    .map(letra => (letra.length === 1 ? letra : letra[0]))
    .join('')
    .toLowerCase();
}

export class IndiceTexto {
  private readonly paginas = new Map<number, { texto: string; normal: string; fragmentos: Fragmento[] }>();

  get indexadas(): number {
    return this.paginas.size;
  }

  tiene(pagina: number): boolean {
    return this.paginas.has(pagina);
  }

  /** Añade una página a partir de los fragmentos que devuelve pdf.js. */
  anadir(pagina: number, items: { str: string }[]): void {
    let texto = '';
    const fragmentos: Fragmento[] = [];

    items.forEach((item, indice) => {
      const inicio = texto.length;
      texto += item.str;
      fragmentos.push({ indice, inicio, fin: texto.length });
      // pdf.js no incluye los espacios entre fragmentos: sin esto, dos palabras
      // seguidas se pegarían y "del plazo" no se encontraría nunca.
      if (item.str && !item.str.endsWith(' ')) {
        texto += ' ';
      }
    });

    this.paginas.set(pagina, { texto, normal: normalizar(texto), fragmentos });
  }

  buscar(consulta: string): Coincidencia[] {
    const aguja = normalizar(consulta.trim());
    if (aguja.length < 2) {
      return [];
    }

    const encontradas: Coincidencia[] = [];
    for (const pagina of [...this.paginas.keys()].sort((a, b) => a - b)) {
      const { texto, normal, fragmentos } = this.paginas.get(pagina)!;
      let desde = 0;
      for (;;) {
        const inicio = normal.indexOf(aguja, desde);
        if (inicio < 0) {
          break;
        }
        const fin = inicio + aguja.length;
        encontradas.push({
          pagina,
          inicio,
          fin,
          contexto: recortar(texto, inicio, fin),
          fragmentos: fragmentos.filter(f => f.inicio < fin && f.fin > inicio).map(f => f.indice),
        });
        desde = fin;
      }
    }
    return encontradas;
  }

  limpiar(): void {
    this.paginas.clear();
  }
}

function recortar(texto: string, inicio: number, fin: number): string {
  const desde = Math.max(0, inicio - CONTEXTO);
  const hasta = Math.min(texto.length, fin + CONTEXTO);
  return (desde > 0 ? '…' : '') + texto.slice(desde, hasta).trim() + (hasta < texto.length ? '…' : '');
}
