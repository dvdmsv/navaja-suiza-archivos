import { Rect, seSolapan } from './coordenadas';

/**
 * Todo lo que el usuario le ha hecho al documento sin haberlo guardado aún.
 *
 * Vive aquí, sin tocar el DOM ni el servidor, por dos razones: se puede probar
 * a solas, y en una sesión larga es lo único que hay que conservar para que un
 * refresco accidental no se lleve por delante una hora de subrayados.
 */

export type ColorSubrayado = 'amarillo' | 'verde' | 'azul' | 'rosa';
export type ColorTachado = 'negro' | 'blanco';

export interface Marca {
  id: string;
  tipo: 'subrayado' | 'tachado';
  pagina: number;
  color: ColorSubrayado | ColorTachado;
  rects: Rect[];
  /** El texto marcado, para poder listarlo en el panel lateral. */
  texto: string;
}

/** Lo que se guarda en el navegador entre visitas. */
export interface Borrador {
  marcas: Marca[];
  rotaciones: [number, number][];
  eliminadas: number[];
}

type Deshacer = () => void;

export class Cambios {
  marcas: Marca[] = [];
  /** Giro que el usuario ha dado a cada página, en grados y sentido horario. */
  rotaciones = new Map<number, number>();
  eliminadas = new Set<number>();

  private pila: Deshacer[] = [];
  private secuencia = 0;

  get hayAlgo(): boolean {
    return this.marcas.length > 0 || this.rotaciones.size > 0 || this.eliminadas.size > 0;
  }

  get sePuedeDeshacer(): boolean {
    return this.pila.length > 0;
  }

  // --- acciones ---------------------------------------------------------

  /**
   * Añade una marca, sustituyendo a las que se le indiquen.
   *
   * Sustituir es quitar y poner, pero cuenta como **un solo paso** para
   * deshacer: si no, `Ctrl+Z` dejaría el documento en un estado intermedio
   * —sin la vieja y sin la nueva— que el usuario no ha visto nunca.
   */
  marcar(marca: Omit<Marca, 'id'>, sustituye: string[] = []): Marca {
    const quitadas = sustituye
      .map(id => this.marcas.findIndex(m => m.id === id))
      .filter(indice => indice >= 0)
      .sort((a, b) => b - a) // de atrás hacia delante, para que no se descuadren
      .map(indice => ({ indice, marca: this.marcas[indice] }));
    quitadas.forEach(({ indice }) => this.marcas.splice(indice, 1));

    const nueva: Marca = { ...marca, id: `m${++this.secuencia}` };
    this.marcas.push(nueva);
    this.pila.push(() => {
      this.quitarSinRegistrar(nueva.id);
      [...quitadas].reverse().forEach(({ indice, marca: vieja }) =>
        this.marcas.splice(indice, 0, vieja));
    });
    return nueva;
  }

  cambiarColor(id: string, color: ColorSubrayado | ColorTachado): void {
    const marca = this.marcas.find(m => m.id === id);
    if (!marca || marca.color === color) {
      return;
    }
    const antes = marca.color;
    marca.color = color;
    this.pila.push(() => {
      const actual = this.marcas.find(m => m.id === id);
      if (actual) {
        actual.color = antes;
      }
    });
  }

  /** Marcas del mismo tipo que pisan la zona indicada, en una página. */
  solapadas(pagina: number, tipo: Marca['tipo'], rects: Rect[]): string[] {
    return this.marcas
      .filter(marca => marca.pagina === pagina && marca.tipo === tipo
        && marca.rects.some(suyo => rects.some(nuevo => seSolapan(suyo, nuevo))))
      .map(marca => marca.id);
  }

  quitarMarca(id: string): void {
    const indice = this.marcas.findIndex(m => m.id === id);
    if (indice < 0) {
      return;
    }
    const [quitada] = this.marcas.splice(indice, 1);
    this.pila.push(() => this.marcas.splice(indice, 0, quitada));
  }

  girar(pagina: number, grados = 90): void {
    const antes = this.rotaciones.get(pagina) ?? 0;
    this.fijarRotacion(pagina, (antes + grados) % 360);
    this.pila.push(() => this.fijarRotacion(pagina, antes));
  }

  rotacionDe(pagina: number): number {
    return this.rotaciones.get(pagina) ?? 0;
  }

  eliminar(pagina: number): void {
    if (this.eliminadas.has(pagina)) {
      return;
    }
    this.eliminadas.add(pagina);
    this.pila.push(() => this.eliminadas.delete(pagina));
  }

  restaurar(pagina: number): void {
    if (!this.eliminadas.delete(pagina)) {
      return;
    }
    this.pila.push(() => this.eliminadas.add(pagina));
  }

  deshacer(): void {
    this.pila.pop()?.();
  }

  // --- persistencia y envío ---------------------------------------------

  aBorrador(): Borrador {
    return {
      marcas: this.marcas,
      rotaciones: [...this.rotaciones],
      eliminadas: [...this.eliminadas],
    };
  }

  static desdeBorrador(borrador: Borrador): Cambios {
    const cambios = new Cambios();
    cambios.marcas = borrador.marcas ?? [];
    cambios.rotaciones = new Map(borrador.rotaciones ?? []);
    cambios.eliminadas = new Set(borrador.eliminadas ?? []);
    // Los identificadores siguen donde los dejó la sesión anterior.
    cambios.secuencia = cambios.marcas.reduce(
      (mayor, marca) => Math.max(mayor, Number(marca.id.slice(1)) || 0), 0);
    return cambios;
  }

  /**
   * Lo que se le manda al servidor.
   *
   * Las marcas van con el número de página original, porque el servidor las
   * aplica antes de borrar nada: si se enviaran renumeradas, acabarían en la
   * página equivocada.
   */
  aPeticion(totalPaginas: number): Record<string, unknown> {
    const deTipo = (tipo: Marca['tipo']) =>
      this.marcas
        .filter(marca => marca.tipo === tipo && !this.eliminadas.has(marca.pagina))
        .map(marca => ({ pagina: marca.pagina, color: marca.color, rects: marca.rects }));

    const paginas = [];
    for (let numero = 1; numero <= totalPaginas; numero++) {
      if (!this.eliminadas.has(numero)) {
        paginas.push({ numero, rotacion: this.rotacionDe(numero) });
      }
    }
    return { subrayados: deTipo('subrayado'), tachados: deTipo('tachado'), paginas };
  }

  private fijarRotacion(pagina: number, grados: number): void {
    if (grados % 360 === 0) {
      this.rotaciones.delete(pagina);
    } else {
      this.rotaciones.set(pagina, ((grados % 360) + 360) % 360);
    }
  }

  private quitarSinRegistrar(id: string): void {
    const indice = this.marcas.findIndex(m => m.id === id);
    if (indice >= 0) {
      this.marcas.splice(indice, 1);
    }
  }
}
