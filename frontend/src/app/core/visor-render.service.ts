import { Injectable, inject } from '@angular/core';

import { DocumentoPdf } from './pdf.service';

/**
 * Dibujo de páginas para el visor.
 *
 * Aquí está casi toda la fluidez del visor, y son tres ideas:
 *
 *  - **Uno cada vez.** El worker de pdf.js es de un solo hilo: pedirle cinco
 *    páginas a la vez no las hace ir más rápido, sólo retrasa la que el usuario
 *    está mirando.
 *  - **Por prioridad.** Se atiende antes la página que se está viendo que la de
 *    dentro de tres pantallas.
 *  - **Cancelar lo que ya no se ve.** Al desplazarse deprisa se piden muchas
 *    páginas que dejan de importar enseguida; sin cancelarlas, el visor va
 *    siempre por detrás del usuario.
 *
 * No se guarda ninguna imagen: lo dibujado vive en el lienzo que está en
 * pantalla y muere con él. Es lo que hace que a la tercera hora la memoria siga
 * igual que al principio.
 */

interface Peticion {
  clave: string;
  prioridad: number;
  ejecutar: () => Promise<void>;
  resolver: () => void;
  rechazar: (motivo: unknown) => void;
}

/** Más allá de esto, el lienzo pesa más de lo que aporta a la vista. */
const MAXIMO_PIXELES = 4096;

@Injectable({ providedIn: 'root' })
export class VisorRenderService {
  private cola: Peticion[] = [];
  private trabajando = false;
  private enCurso: { clave: string; tarea: any } | null = null;

  /**
   * Dibuja una página en su lienzo.
   *
   * `clave` identifica el hueco que se está pintando (página y escala): pedir
   * otra cosa para la misma clave cancela lo anterior, que es justo lo que pasa
   * al cambiar el zoom mientras se está dibujando.
   */
  dibujar(documento: DocumentoPdf, numero: number, rotacion: number, escala: number,
          lienzo: HTMLCanvasElement, clave: string): Promise<void> {
    this.cancelar(clave);

    return new Promise<void>((resolver, rechazar) => {
      this.cola.push({
        clave,
        prioridad: 0,
        resolver,
        rechazar,
        ejecutar: async () => {
          const pagina = await documento.pagina(numero);
          // El giro del archivo lo aplica pdf.js solo; aquí se le suma el del usuario.
          const viewport = pagina.getViewport({
            scale: escala * this.densidad(),
            rotation: (pagina.rotate + rotacion) % 360,
          });

          lienzo.width = Math.round(viewport.width);
          lienzo.height = Math.round(viewport.height);
          const tarea = pagina.render({
            canvas: lienzo,
            canvasContext: lienzo.getContext('2d', { alpha: false })!,
            viewport,
            // Los campos rellenables se quedan fuera del lienzo: los pinta el
            // visor como controles de verdad. Si no, se verían dos veces.
            annotationMode: documento.modoConFormularios,
          });
          this.enCurso = { clave, tarea };
          await tarea.promise;
        },
      });
      this.arrancar();
    });
  }

  /** Cambia la prioridad de lo que aún no se ha dibujado. */
  priorizar(claves: Set<string>): void {
    this.cola.forEach(peticion => {
      peticion.prioridad = claves.has(peticion.clave) ? 0 : 1;
    });
  }

  /** Descarta una petición; si ya se estaba dibujando, la corta. */
  cancelar(clave: string): void {
    this.cola = this.cola.filter(peticion => {
      if (peticion.clave !== clave) {
        return true;
      }
      peticion.rechazar(new CancelacionVisor());
      return false;
    });
    if (this.enCurso?.clave === clave) {
      this.enCurso.tarea.cancel();
      this.enCurso = null;
    }
  }

  /**
   * Libera un lienzo que se va del DOM.
   *
   * Ponerlo a cero es lo que devuelve de verdad la memoria: un lienzo suelto
   * con su mapa de píxeles puede seguir ocupando megas.
   */
  liberar(lienzo: HTMLCanvasElement): void {
    lienzo.width = 0;
    lienzo.height = 0;
  }

  private async arrancar(): Promise<void> {
    if (this.trabajando) {
      return;
    }
    this.trabajando = true;
    try {
      while (this.cola.length > 0) {
        this.cola.sort((a, b) => a.prioridad - b.prioridad);
        const peticion = this.cola.shift()!;
        try {
          await peticion.ejecutar();
          peticion.resolver();
        } catch (err) {
          // Cancelar es lo normal aquí, no un error que enseñar a nadie.
          peticion.rechazar(esCancelacion(err) ? new CancelacionVisor() : err);
        } finally {
          if (this.enCurso?.clave === peticion.clave) {
            this.enCurso = null;
          }
        }
      }
    } finally {
      this.trabajando = false;
    }
  }

  /**
   * Cuántos píxeles reales por píxel de pantalla.
   *
   * Con tope: en una pantalla de mucha densidad, dibujar a 3x cuadruplica la
   * memoria de cada lienzo sin que se aprecie la diferencia.
   */
  private densidad(): number {
    return densidadDePantalla();
  }
}

/** Se lanza cuando una página deja de hacer falta antes de terminar de dibujarse. */
export class CancelacionVisor extends Error {
  constructor() {
    super('dibujo cancelado');
    this.name = 'CancelacionVisor';
  }
}

export function esCancelacion(err: unknown): boolean {
  const nombre = (err as { name?: string })?.name;
  return nombre === 'CancelacionVisor' || nombre === 'RenderingCancelledException';
}

/** Tope de tamaño para no pedirle al navegador un lienzo que no puede crear. */
/**
 * Cuántos píxeles de verdad tiene cada píxel de CSS, con tope.
 *
 * Lo que se dibuje a menos que esto lo amplía el navegador y se ve borroso. Se
 * limita a 2 porque de ahí para arriba ya no se aprecia y sí se nota en lo que
 * cuesta dibujar.
 */
export function densidadDePantalla(): number {
  return Math.min(window.devicePixelRatio || 1, 2);
}

export function escalaSegura(ancho: number, alto: number, escala: number): number {
  const mayor = Math.max(ancho, alto) * escala;
  return mayor > MAXIMO_PIXELES ? (MAXIMO_PIXELES / Math.max(ancho, alto)) : escala;
}
