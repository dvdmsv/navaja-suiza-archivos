import { Injectable } from '@angular/core';

/**
 * pdf.js usa `Promise.try` al decodificar imágenes, y zone.js —que Angular
 * carga— sustituye el `Promise` nativo por el suyo, que no lo implementa. Sin
 * este remiendo, abrir un PDF con imágenes deja una promesa que no resuelve ni
 * falla: la página se queda "preparando" para siempre.
 *
 * Se aplica al `Promise` global, que a estas alturas ya es el de zone.js.
 */
function asegurarPromiseTry(): void {
  const promesa = Promise as unknown as { try?: unknown };
  if (typeof promesa.try !== 'function') {
    promesa.try = <T>(fn: (...args: unknown[]) => T, ...args: unknown[]) =>
      new Promise<T>(resolve => resolve(fn(...args)));
  }
}

/** Ancho al que se rasteriza una página para verla a tamaño completo. */
export const ANCHO_VISTA = 1100;

/** Ancho de las miniaturas de las herramientas que trabajan página a página. */
export const ANCHO_MINIATURA = 200;

/**
 * Tope por página. No debería hacer falta nunca, pero una promesa de pdf.js que
 * no vuelve deja la interfaz colgada sin decir nada, y eso es peor que un error.
 */
const LIMITE_POR_PAGINA = 20000;

/**
 * Un PDF abierto en el navegador, con sus páginas listas para pintar.
 *
 * Las imágenes se guardan por página y ancho: quien va y viene entre páginas no
 * las vuelve a rasterizar.
 */
export class DocumentoPdf {
  private readonly cache = new Map<string, string>();

  constructor(private readonly tarea: any, private readonly documento: any,
              private readonly pdfjs: any) {}

  get paginas(): number {
    return this.documento.numPages;
  }

  /** La página de pdf.js, para quien necesite dibujarla o leer su texto. */
  pagina(numero: number): Promise<any> {
    return this.documento.getPage(numero);
  }

  /**
   * Medidas de todas las páginas a escala 1, que es lo que necesita el visor
   * para colocarlas sin haberlas dibujado.
   *
   * Casi todos los documentos tienen todas las páginas iguales, así que primero
   * se comprueban unas cuantas: si coinciden, se da por hecho el resto y abrir
   * un documento de trescientas páginas cuesta lo mismo que uno de tres. Sólo
   * si hay mezcla se recorren todas.
   */
  async medidas(): Promise<{ numero: number; ancho: number; alto: number }[]> {
    const total = this.paginas;
    const medir = async (numero: number) => {
      const { width, height } = (await this.pagina(numero)).getViewport({ scale: 1 });
      return { numero, ancho: width, alto: height };
    };

    const muestras = [...new Set([1, Math.ceil(total / 2), total])];
    const medidas = await Promise.all(muestras.map(medir));
    const primera = medidas[0];
    const uniforme = medidas.every(m => m.ancho === primera.ancho && m.alto === primera.alto);

    if (uniforme) {
      return Array.from({ length: total }, (_, i) => ({ ...primera, numero: i + 1 }));
    }
    const todas = [];
    for (let numero = 1; numero <= total; numero++) {
      todas.push(await medir(numero));
    }
    return todas;
  }

  /**
   * Monta la capa de texto invisible sobre la página.
   *
   * Es lo que permite seleccionar, copiar y subrayar: sin ella, la página no
   * pasa de ser una imagen. Devuelve los elementos de cada fragmento, que es lo
   * que hace falta para localizar sobre el papel lo que encuentra el buscador.
   */
  async capaTexto(numero: number, viewport: any, contenedor: HTMLElement): Promise<HTMLElement[]> {
    const pagina = await this.pagina(numero);
    contenedor.replaceChildren();
    const capa = new this.pdfjs.TextLayer({
      textContentSource: pagina.streamTextContent(),
      container: contenedor,
      viewport,
    });
    await capa.render();
    return capa.textDivs;
  }

  /** Marcadores del documento, si los trae, ya aplanados para el panel. */
  async indice(): Promise<{ titulo: string; pagina: number; nivel: number }[]> {
    const marcadores = await this.documento.getOutline();
    if (!marcadores?.length) {
      return [];
    }

    const plano: { titulo: string; pagina: number; nivel: number }[] = [];
    const recorrer = async (nodos: any[], nivel: number) => {
      for (const nodo of nodos) {
        const pagina = await this.paginaDeDestino(nodo.dest);
        if (pagina) {
          plano.push({ titulo: nodo.title?.trim() || 'Sin título', pagina, nivel });
        }
        if (nodo.items?.length) {
          await recorrer(nodo.items, nivel + 1);
        }
      }
    };
    await recorrer(marcadores, 0);
    return plano;
  }

  private async paginaDeDestino(destino: any): Promise<number | null> {
    try {
      const resuelto = typeof destino === 'string'
        ? await this.documento.getDestination(destino)
        : destino;
      if (!resuelto?.[0]) {
        return null;
      }
      return (await this.documento.getPageIndex(resuelto[0])) + 1;
    } catch {
      return null; // un marcador roto no debe impedir enseñar los demás
    }
  }

  async imagen(numero: number, ancho = ANCHO_VISTA): Promise<string> {
    const clave = `${numero}:${ancho}`;
    const guardada = this.cache.get(clave);
    if (guardada) {
      return guardada;
    }

    const pagina = await this.documento.getPage(numero);
    const natural = pagina.getViewport({ scale: 1 });
    const viewport = pagina.getViewport({ scale: ancho / natural.width });

    const lienzo = document.createElement('canvas');
    lienzo.width = Math.round(viewport.width);
    lienzo.height = Math.round(viewport.height);
    const dibujo = pagina.render({ canvas: lienzo, canvasContext: lienzo.getContext('2d')!, viewport });
    await conLimite(dibujo.promise, numero);

    const imagen = lienzo.toDataURL('image/png');
    this.cache.set(clave, imagen);
    return imagen;
  }

  cerrar(): void {
    this.cache.clear();
    // Quien libera el documento es la tarea de carga: el proxy no tiene `destroy`.
    this.tarea?.destroy();
  }
}

/**
 * Carga de PDF en el navegador, con pdf.js.
 *
 * Vive aquí y no en cada herramienta porque lo usan tres: firmar, dividir y
 * organizar. La librería se importa la primera vez que hace falta, así que sólo
 * la descarga quien entra en una de ellas.
 */
@Injectable({ providedIn: 'root' })
export class PdfService {
  private pdfjs: any;

  async abrir(archivo: File): Promise<DocumentoPdf> {
    const pdfjs = await this.libreria();
    const tarea = pdfjs.getDocument({ data: await archivo.arrayBuffer() });
    return new DocumentoPdf(tarea, await tarea.promise, pdfjs);
  }

  private async libreria(): Promise<any> {
    if (!this.pdfjs) {
      asegurarPromiseTry();
      this.pdfjs = await import('pdfjs-dist');
      // Con ruta absoluta: la herramienta se sirve desde /herramientas/…, y una
      // ruta relativa buscaría el worker donde no está.
      this.pdfjs.GlobalWorkerOptions.workerSrc = '/assets/pdf.worker.min.mjs';
    }
    return this.pdfjs;
  }
}

/** Falla en vez de esperar indefinidamente si una página no termina de pintarse. */
function conLimite<T>(promesa: Promise<T>, numero: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const aviso = setTimeout(
      () => reject(new Error(`La página ${numero} ha tardado demasiado en prepararse.`)),
      LIMITE_POR_PAGINA);
    promesa.then(resolve, reject).finally(() => clearTimeout(aviso));
  });
}
