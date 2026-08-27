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

  constructor(private readonly tarea: any, private readonly documento: any) {}

  get paginas(): number {
    return this.documento.numPages;
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
    return new DocumentoPdf(tarea, await tarea.promise);
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
