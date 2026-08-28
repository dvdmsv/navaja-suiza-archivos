import { NgFor, NgIf } from '@angular/common';
import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, EventEmitter, HostListener,
  Input, OnChanges, OnDestroy, Output, SimpleChanges, ViewChild, inject,
} from '@angular/core';

import { DocumentoPdf } from '../../core/pdf.service';
import { VisorRenderService, esCancelacion, escalaSegura } from '../../core/visor-render.service';
import { Coincidencia } from './buscador';
import { ColorSubrayado, ColorTachado, Marca } from './cambios';
import {
  Rect, aPorcentajes, aProporciones, contiene, fusionarRects, puntoAProporciones,
} from './coordenadas';
import { PaginaColocada } from './disposicion';

/** Una marca ya colocada en pantalla. */
interface MarcaPintada {
  clave: string;
  id: string;
  tipo: Marca['tipo'];
  color: string;
  estilo: Record<string, string>;
}

/**
 * El menú flotante de la página, con dos formas: el de una marca ya puesta
 * —colores y quitar— y el que sale al terminar de seleccionar texto.
 *
 * Es uno solo y no dos a propósito: así no pueden quedarse los dos abiertos, y
 * comparten colocación, estilos y cierre.
 */
type MenuFlotante =
  | { menu: 'marca'; id: string; tipo: Marca['tipo']; color: string; estilo: Record<string, string> }
  | { menu: 'seleccion'; rects: Rect[]; texto: string; estilo: Record<string, string> };

export interface CambioDeColor {
  id: string;
  color: ColorSubrayado | ColorTachado;
}

/** Lo que se pide hacer con un texto recién seleccionado. */
export interface AccionSeleccion {
  accion: 'subrayar' | 'tachar' | 'copiar' | 'buscar';
  pagina: number;
  rects: Rect[];
  texto: string;
  color?: ColorSubrayado;
}

const COLORES_SUBRAYADO: ColorSubrayado[] = ['amarillo', 'verde', 'azul', 'rosa'];
const COLORES_TACHADO: ColorTachado[] = ['negro', 'blanco'];

/** Hasta aquí el puntero se ha movido demasiado poco: fue un clic, no un arrastre. */
const UMBRAL_ARRASTRE = 5;

/** Lo que emite la página cuando el usuario termina de seleccionar texto. */
export interface Seleccion {
  pagina: number;
  rects: Rect[];
  texto: string;
}

@Component({
  selector: 'app-visor-pagina',
  standalone: true,
  imports: [NgFor, NgIf],
  templateUrl: './pagina.component.html',
  styleUrl: './pagina.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VisorPaginaComponent implements OnChanges, OnDestroy {
  @ViewChild('lienzo', { static: true }) lienzoRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('capaTexto', { static: true }) capaTextoRef!: ElementRef<HTMLElement>;
  @ViewChild('caja', { static: true }) cajaRef!: ElementRef<HTMLElement>;

  @Input({ required: true }) documento!: DocumentoPdf;
  @Input({ required: true }) colocada!: PaginaColocada;
  @Input({ required: true }) escala!: number;
  @Input() marcas: Marca[] = [];
  @Input() coincidencias: Coincidencia[] = [];
  @Input() resaltadaActual = -1;
  /** La capa de texto sólo se monta si hace falta: es lo que más ensucia el DOM. */
  @Input() conTexto = true;
  /**
   * Si hay una herramienta de marcado activa. Leyendo, la selección es del
   * usuario —para copiar— y no se toca.
   */
  @Input() marcando = false;
  /** Si al soltar una selección leyendo se ofrece el menú de acciones. */
  @Input() menuAlSeleccionar = true;

  @Output() seleccionado = new EventEmitter<Seleccion>();
  /** Quitar esta marca. */
  @Output() marcaPulsada = new EventEmitter<string>();
  @Output() colorCambiado = new EventEmitter<CambioDeColor>();
  @Output() accionSeleccion = new EventEmitter<AccionSeleccion>();

  dibujada = false;
  pintadas: MarcaPintada[] = [];
  resaltados: Record<string, string>[] = [];
  /** Menú abierto sobre la página, si lo hay. */
  menu: MenuFlotante | null = null;

  readonly porClave = (_: number, pintada: MarcaPintada) => pintada.clave;

  private readonly render = inject(VisorRenderService);
  private readonly cd = inject(ChangeDetectorRef);
  private fragmentos: HTMLElement[] = [];
  private origenPuntero: { x: number; y: number } | null = null;
  private clave = '';
  private textoMontado = '';

  private readonly elemento: ElementRef<HTMLElement> = inject(ElementRef);

  /**
   * Un clic en cualquier otro sitio —la barra, otra página, el panel— cierra el
   * menú. Sin esto sólo se cerraba pulsando dentro de la propia página, y en el
   * hueco gris de alrededor se quedaba abierto.
   */
  @HostListener('document:pointerdown', ['$event'])
  alPulsarEnOtroSitio(evento: PointerEvent): void {
    if (this.menu && !this.elemento.nativeElement.contains(evento.target as Node)) {
      this.menu = null;
      this.cd.markForCheck();
    }
  }

  async ngOnChanges(cambios: SimpleChanges): Promise<void> {
    // Cambiar de herramienta o apagar el menú deja sin sentido el que hubiera
    // abierto.
    if (cambios['marcando'] || cambios['menuAlSeleccionar']) {
      this.menu = null;
    }
    if (cambios['marcas'] || cambios['colocada']) {
      this.colocarMarcas();
    }
    if (cambios['coincidencias'] || cambios['resaltadaActual']) {
      this.colocarCoincidencias();
    }
    if (this.hayQueRedibujar(cambios)) {
      await this.dibujar();
    }
  }

  ngOnDestroy(): void {
    this.render.cancelar(this.clave);
    this.render.liberar(this.lienzoRef.nativeElement);
  }

  // --- dibujo -----------------------------------------------------------

  private hayQueRedibujar(cambios: SimpleChanges): boolean {
    return !!(cambios['documento'] || cambios['escala'] || cambios['conTexto']
      || (cambios['colocada'] && this.cambioDeVerdad(cambios['colocada'])));
  }

  private cambioDeVerdad(cambio: { previousValue?: PaginaColocada; currentValue: PaginaColocada }): boolean {
    const antes = cambio.previousValue;
    return !antes || antes.numero !== cambio.currentValue.numero
      || antes.rotacion !== cambio.currentValue.rotacion;
  }

  private async dibujar(): Promise<void> {
    const { numero, rotacion } = this.colocada;
    const escala = escalaSegura(this.colocada.ancho, this.colocada.alto, this.escala);
    this.clave = `${numero}:${rotacion}:${escala}`;
    this.dibujada = false;

    try {
      await this.render.dibujar(this.documento, numero, rotacion, escala,
                                this.lienzoRef.nativeElement, this.clave);
      this.dibujada = true;
      this.cd.markForCheck();
      await this.montarTexto(escala);
    } catch (err) {
      // Que se cancele es lo normal al desplazarse deprisa, no un problema.
      if (!esCancelacion(err)) {
        console.error(`No se ha podido dibujar la página ${numero}:`, err);
      }
    }
  }

  private async montarTexto(escala: number): Promise<void> {
    const contenedor = this.capaTextoRef.nativeElement;
    if (!this.conTexto) {
      contenedor.replaceChildren();
      this.fragmentos = [];
      this.textoMontado = '';
      return;
    }
    if (this.textoMontado === this.clave) {
      return;
    }

    const pagina = await this.documento.pagina(this.colocada.numero);
    // Ojo: en píxeles CSS, no en píxeles reales. El lienzo se dibuja a más
    // resolución para que se vea nítido, pero el texto tiene que caer justo
    // encima de lo que se ve.
    const viewport = pagina.getViewport({
      scale: escala,
      rotation: (pagina.rotate + this.colocada.rotacion) % 360,
    });
    contenedor.style.setProperty('--total-scale-factor', String(escala));
    this.fragmentos = await this.documento.capaTexto(this.colocada.numero, viewport, contenedor);
    this.textoMontado = this.clave;
    this.colocarCoincidencias();
    this.cd.markForCheck();
  }

  // --- marcas y coincidencias -------------------------------------------

  private colocarMarcas(): void {
    this.pintadas = this.marcas
      .filter(marca => marca.pagina === this.colocada.numero)
      .flatMap(marca => marca.rects.map((rect, i) => ({
        clave: `${marca.id}:${i}:${marca.color}`,
        id: marca.id,
        tipo: marca.tipo,
        color: marca.color,
        estilo: aPorcentajes(rect, this.colocada.rotacion),
      })));
    // Si la marca del menú ha desaparecido, el menú sobra.
    const abierto = this.menu;
    if (abierto?.menu === 'marca' && !this.marcas.some(marca => marca.id === abierto.id)) {
      this.menu = null;
    }
  }

  // --- menú de una marca ------------------------------------------------

  get coloresDelMenu(): string[] {
    return this.menu?.menu === 'marca' && this.menu.tipo === 'tachado'
      ? COLORES_TACHADO
      : COLORES_SUBRAYADO;
  }

  /** Un color: cambia el de la marca, o subraya lo seleccionado. */
  elegirColor(color: string): void {
    const abierto = this.menu;
    if (!abierto) {
      return;
    }
    if (abierto.menu === 'marca') {
      this.colorCambiado.emit({ id: abierto.id, color: color as ColorSubrayado | ColorTachado });
    } else {
      this.emitirAccion(abierto, 'subrayar', color as ColorSubrayado);
    }
    this.menu = null;
  }

  /** Marca el color que ya tiene la marca abierta, si el menú es de una marca. */
  esElColorPuesto(color: string): boolean {
    return this.menu?.menu === 'marca' && this.menu.color === color;
  }

  /**
   * La selección se da por gastada al elegir algo del menú.
   *
   * Además de que ya no pinta nada, dejarla viva daba problemas: al arrastrar
   * empezando dentro de una selección que sigue ahí, el navegador entiende que
   * se quiere mover el texto y no crea una selección nueva.
   */
  private soltarSeleccion(): void {
    window.getSelection()?.removeAllRanges();
  }

  quitarDelMenu(): void {
    if (this.menu?.menu === 'marca') {
      this.marcaPulsada.emit(this.menu.id);
      this.menu = null;
    }
  }

  /** Tachar, copiar o buscar lo que se acaba de seleccionar. */
  accionar(accion: AccionSeleccion['accion']): void {
    if (this.menu?.menu === 'seleccion') {
      this.emitirAccion(this.menu, accion);
      this.menu = null;
    }
  }

  private emitirAccion(abierto: Extract<MenuFlotante, { menu: 'seleccion' }>,
                       accion: AccionSeleccion['accion'], color?: ColorSubrayado): void {
    this.soltarSeleccion();
    this.accionSeleccion.emit({
      accion,
      color,
      pagina: this.colocada.numero,
      rects: abierto.rects,
      texto: abierto.texto,
    });
  }

  cerrarMenu(): void {
    this.menu = null;
  }

  /**
   * Abre el menú de la marca que haya bajo el punto pulsado.
   *
   * La búsqueda se hace a mano porque las marcas no capturan el ratón: si lo
   * hicieran, no se podría seleccionar el texto que hay debajo, que es
   * justamente lo que hace falta para volver a subrayarlo.
   */
  /** Centrado bajo la zona indicada, dentro de la caja de la página. */
  private colocarBajo(rect: Rect): Record<string, string> {
    const { left, top, width } = aPorcentajes(rect, this.colocada.rotacion);
    return { left: `calc(${left} + ${width} / 2)`, top: `calc(${top} + 1.4rem)` };
  }

  private abrirMenuEn(x: number, y: number): boolean {
    const caja = this.cajaRef.nativeElement.getBoundingClientRect();
    const [px, py] = puntoAProporciones(x, y, caja, this.colocada.rotacion);

    // De la última a la primera: se atiende a la de encima.
    const encontrada = [...this.marcas]
      .filter(marca => marca.pagina === this.colocada.numero)
      .reverse()
      .find(marca => marca.rects.some(rect => contiene(rect, px, py)));
    if (!encontrada) {
      return false;
    }

    const rect = encontrada.rects.find(r => contiene(r, px, py))!;
    const { left, top, width } = aPorcentajes(rect, this.colocada.rotacion);
    this.menu = {
      menu: 'marca',
      id: encontrada.id,
      tipo: encontrada.tipo,
      color: encontrada.color,
      estilo: this.colocarBajo(rect),
    };
    return true;
  }

  /**
   * Coloca lo que ha encontrado el buscador.
   *
   * Se hace aquí porque los rectángulos salen de los fragmentos de la capa de
   * texto, que sólo existen en las páginas que están en pantalla.
   */
  private colocarCoincidencias(): void {
    if (!this.fragmentos.length) {
      this.resaltados = [];
      return;
    }
    const caja = this.cajaRef.nativeElement.getBoundingClientRect();
    this.resaltados = this.coincidencias
      .filter(c => c.pagina === this.colocada.numero)
      .flatMap(c => c.fragmentos
        .map(indice => this.fragmentos[indice])
        .filter(Boolean)
        .map(fragmento => {
          const rect = fragmento.getBoundingClientRect();
          const proporcion = aProporciones(rect, caja, this.colocada.rotacion);
          return { ...aPorcentajes(proporcion, this.colocada.rotacion), clave: `${c.pagina}:${c.inicio}` };
        }));
  }

  // --- selección --------------------------------------------------------

  alPulsar(evento: PointerEvent): void {
    this.origenPuntero = { x: evento.clientX, y: evento.clientY };

    // Cada gesto empieza en limpio. Si se pulsa dentro de una selección que ya
    // estaba hecha, el navegador entiende que se quiere arrastrar ese texto y
    // no crea una selección nueva: el resultado es que subrayar dos veces
    // seguidas sobre la misma zona no hacía nada. Lo del menú se respeta,
    // porque ahí la selección todavía hace falta.
    // Aquí no se toca la selección: comprobado que limpiarla en el `pointerdown`
    // se lleva por delante el ancla que el navegador acaba de colocar, y
    // entonces el arrastre no selecciona nada. Se suelta al consumirla, en
    // `emitirAccion`.

  }

  /**
   * Qué hacer al soltar el puntero.
   *
   * Se decide por el gesto —clic o arrastre— y no por si hay texto
   * seleccionado: al pulsar dentro de una selección que ya existía, el
   * navegador la mantiene hasta soltar, y mirando sólo la selección el primer
   * clic sobre una marca no hacía nada.
   */
  alSoltar(evento: PointerEvent): void {
    const origen = this.origenPuntero;
    this.origenPuntero = null;

    // Lo que se pulse dentro del menú es asunto del menú.
    if ((evento.target as HTMLElement)?.closest?.('.menu-flotante')) {
      return;
    }

    const movido = origen
      ? Math.hypot(evento.clientX - origen.x, evento.clientY - origen.y)
      : Infinity;

    // 1. Un clic sobre una marca abre su menú, haya o no selección de por medio.
    if (movido < UMBRAL_ARRASTRE && this.abrirMenuEn(evento.clientX, evento.clientY)) {
      this.cd.markForCheck();
      return;
    }

    const seleccion = window.getSelection();
    const haySeleccion = !!seleccion && !seleccion.isCollapsed && seleccion.rangeCount > 0;

    // 2. Con herramienta de marcado y algo seleccionado, se marca. Vale tanto
    //    para el arrastre de siempre como para el doble clic sobre una palabra.
    // 2. Leyendo, si el menú está encendido, se ofrece qué hacer con lo que se
    //    acaba de seleccionar. La selección no se toca: tiene que seguir
    //    viéndose mientras se decide.
    if (haySeleccion && !this.marcando && this.menuAlSeleccionar && movido >= UMBRAL_ARRASTRE) {
      this.abrirMenuDeSeleccion(seleccion!);
      this.cd.markForCheck();
      return;
    }

    if (!haySeleccion || !this.marcando) {
      // Sin nada que marcar, un clic al aire cierra el menú; y leyendo, la
      // selección se queda donde está: es del usuario, que estará copiando.
      if (movido < UMBRAL_ARRASTRE) {
        this.menu = null;
        this.cd.markForCheck();
      }
      return;
    }
    const medida = this.medirSeleccion(seleccion!);
    if (medida) {
      this.seleccionado.emit({ pagina: this.colocada.numero, ...medida });
      seleccion!.removeAllRanges();
    }
  }

  /** Abre el menú de acciones sobre lo que se acaba de seleccionar. */
  private abrirMenuDeSeleccion(seleccion: Selection): void {
    const medida = this.medirSeleccion(seleccion);
    if (!medida) {
      this.menu = null;
      return;
    }
    this.menu = {
      menu: 'seleccion',
      rects: medida.rects,
      texto: medida.texto,
      // Bajo la última línea, que es donde acaba de soltarse el ratón.
      estilo: this.colocarBajo(medida.rects[medida.rects.length - 1]),
    };
  }

  /**
   * Rectángulos y texto de una selección, en proporciones de la página.
   *
   * Lo usan por igual el subrayado directo y el menú, así que comprobar que la
   * selección es de esta página y fusionar los rectángulos vive en un solo
   * sitio.
   */
  private medirSeleccion(seleccion: Selection): { rects: Rect[]; texto: string } | null {
    const rango = seleccion.getRangeAt(0);
    const capa = this.capaTextoRef.nativeElement;
    // `commonAncestorContainer` puede ser un nodo de texto, de ahí el parentNode.
    const dentro = capa.contains(rango.commonAncestorContainer)
      || capa.contains(rango.commonAncestorContainer.parentNode);
    if (!dentro) {
      return null;
    }

    const caja = this.cajaRef.nativeElement.getBoundingClientRect();
    // `DOMRectList` no es iterable con la configuración de TypeScript del
    // proyecto, de ahí `Array.from`. Y se fusionan porque el navegador devuelve
    // la misma zona repetida cuando la selección abarca elementos enteros: sin
    // eso la marca sale más oscura cuanto más texto se haya cogido.
    const rects = fusionarRects(Array.from(rango.getClientRects())
      .filter(rect => rect.width > 1 && rect.height > 1)
      .map(rect => aProporciones(rect, caja, this.colocada.rotacion)));

    return rects.length ? { rects, texto: seleccion.toString().trim() } : null;
  }
}
