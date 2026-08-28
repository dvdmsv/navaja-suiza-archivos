import { NgFor, NgIf } from '@angular/common';
import {
  AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, HostListener,
  NgZone, OnDestroy, ViewChild, inject,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { ApiService, ArchivoServidor } from '../../core/api.service';
import { MemoriaDocumentoService } from '../../core/memoria-documento.service';
import { DocumentoPdf, PdfService } from '../../core/pdf.service';
import { VisorRenderService } from '../../core/visor-render.service';
import { avisoError, avisoExito, mensajeDeError } from '../../shared/notify';
import { copiarAlPortapapeles } from '../../shared/portapapeles';
import { Coincidencia, IndiceTexto } from './buscador';
import { Cambios, ColorSubrayado, ColorTachado, Marca } from './cambios';
import {
  Disposicion, Medida, PaginaColocada, calcularDisposicion, escalaParaAjustar, filasVisibles,
  paginaEnFoco,
} from './disposicion';
import {
  AccionSeleccion, CambioDeColor, Seleccion, VisorPaginaComponent,
} from './pagina.component';
import { EntradaIndice, Pestana, VisorPanelComponent } from './panel.component';

type Herramienta = 'leer' | 'subrayar' | 'tachar';
type ModoZoom = 'ancho' | 'pagina' | 'libre';

/** Una página lista para colocarse en el lienzo de lectura. */
interface EnPantalla {
  colocada: PaginaColocada;
  top: number;
}

const SEPARACION = 16;
const ESCALA_MINIMA = 0.2;
const ESCALA_MAXIMA = 6;

/** Cada cuánto se le dice al servidor que seguimos aquí. */
const KEEPALIVE = 15 * 60 * 1000;

/** Cuánto se espera antes de guardar la posición y el borrador en el navegador. */
const ESPERA_MEMORIA = 800;

/** Compartido para que las páginas sin marcas no reciban un array nuevo cada vez. */
const SIN_MARCAS: Marca[] = [];

@Component({
  selector: 'app-visor',
  standalone: true,
  imports: [NgFor, NgIf, FormsModule, RouterLink, VisorPaginaComponent, VisorPanelComponent],
  templateUrl: './visor.component.html',
  styleUrl: './visor.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VisorComponent implements AfterViewInit, OnDestroy {
  @ViewChild('lectura') lecturaRef?: ElementRef<HTMLElement>;

  // --- documento --------------------------------------------------------
  archivo: File | null = null;
  documento: DocumentoPdf | null = null;
  medidas: Medida[] = [];
  indice: EntradaIndice[] = [];
  cargando = false;
  arrastrando = false;

  // --- vista ------------------------------------------------------------
  escala = 1;
  /**
   * Cómo encaja la página al abrir un documento.
   *
   * En pantalla ancha se enseña la página entera: ajustar al ancho hace que una
   * A4 salga al 190 % y sólo se vea el tercio de arriba, que no es forma de
   * empezar a leer. En una pantalla estrecha manda el ancho, porque la página
   * completa dejaría el texto ilegible.
   */
  modoZoom: ModoZoom = window.innerWidth < 768 ? 'ancho' : 'pagina';
  columnas = 1;
  oscuro = false;
  paginaActual = 1;
  visibles: EnPantalla[] = [];
  disposicion: Disposicion = { filas: [], altoTotal: 0, anchoTotal: 0 };

  // --- edición ----------------------------------------------------------
  cambios = new Cambios();
  /** Las marcas agrupadas por página, con referencias estables. */
  marcasPorPagina = new Map<number, Marca[]>();
  herramienta: Herramienta = 'leer';
  /** Si al soltar una selección leyendo se ofrece qué hacer con ella. */
  menuAlSeleccionar = true;
  colorSubrayado: ColorSubrayado = 'amarillo';
  colorTachado: ColorTachado = 'negro';
  guardando = false;
  resultado: ArchivoServidor | null = null;

  // --- panel y búsqueda -------------------------------------------------
  /** En pantallas estrechas el documento manda: el panel se abre a mano. */
  panelAbierto = window.innerWidth >= 768;
  pestana: Pestana = 'paginas';
  consulta = '';
  resultados: Coincidencia[] = [];
  resultadoActual = -1;
  indexadas = 0;
  indexando = false;

  private readonly api = inject(ApiService);
  private readonly pdf = inject(PdfService);
  private readonly render = inject(VisorRenderService);
  private readonly memoria = inject(MemoriaDocumentoService);
  private readonly zone = inject(NgZone);
  private readonly cd = inject(ChangeDetectorRef);

  private readonly buscador = new IndiceTexto();
  private huella = '';
  private fileId: string | null = null;
  private temporizadorMemoria?: ReturnType<typeof setTimeout>;
  private temporizadorKeepalive?: ReturnType<typeof setInterval>;
  private pendienteDeCuadro = false;
  private pendienteDeTamano = false;
  private observadorTamano?: ResizeObserver;
  private ultimaVentana = '';

  // --- ciclo de vida ----------------------------------------------------

  constructor() {
    const preferencias = this.memoria.preferencias();
    if (typeof preferencias['menuAlSeleccionar'] === 'boolean') {
      this.menuAlSeleccionar = preferencias['menuAlSeleccionar'] as boolean;
    }
    if (preferencias['modoZoom'] === 'ancho' || preferencias['modoZoom'] === 'pagina') {
      this.modoZoom = preferencias['modoZoom'];
    }
  }

  ngAfterViewInit(): void {
    // El desplazamiento no pasa por Angular: se dispara decenas de veces por
    // segundo y sólo interesa cuando cambia lo que hay que enseñar.
    this.zone.runOutsideAngular(() => {
      this.lecturaRef?.nativeElement.addEventListener('scroll', this.alDesplazar, { passive: true });
    });
    this.temporizadorKeepalive = setInterval(() => this.mantenerSesion(), KEEPALIVE);

    // Se vigila el tamaño real del área de lectura en vez de adivinar cuándo
    // cambia. Cubre de una vez el panel que se abre o se cierra, la ventana que
    // se redimensiona y —lo que fallaba— el primer cálculo, que se hacía antes
    // de que el panel existiera en el DOM y dejaba la página descentrada.
    this.zone.runOutsideAngular(() => {
      const lectura = this.lecturaRef?.nativeElement;
      if (lectura) {
        this.observadorTamano = new ResizeObserver(() => this.alCambiarTamano());
        this.observadorTamano.observe(lectura);
      }
    });
  }

  private readonly alCambiarTamano = (): void => {
    if (!this.documento || this.pendienteDeTamano) {
      return;
    }
    this.pendienteDeTamano = true;
    requestAnimationFrame(() => {
      this.pendienteDeTamano = false;
      this.recalcular();
      this.zone.run(() => this.cd.detectChanges());
    });
  };

  ngOnDestroy(): void {
    this.lecturaRef?.nativeElement.removeEventListener('scroll', this.alDesplazar);
    this.observadorTamano?.disconnect();
    clearInterval(this.temporizadorKeepalive);
    clearTimeout(this.temporizadorMemoria);
    this.guardarEnMemoria();
    this.documento?.cerrar();
  }

  @HostListener('window:beforeunload', ['$event'])
  alSalir(evento: BeforeUnloadEvent): void {
    this.guardarEnMemoria();
    if (this.cambios.hayAlgo && !this.resultado) {
      evento.preventDefault();
    }
  }

  // --- abrir ------------------------------------------------------------

  alSoltarArchivo(evento: DragEvent): void {
    evento.preventDefault();
    this.arrastrando = false;
    const archivo = evento.dataTransfer?.files?.[0];
    if (archivo) {
      this.abrir(archivo);
    }
  }

  alElegirArchivo(evento: Event): void {
    const archivo = (evento.target as HTMLInputElement).files?.[0];
    if (archivo) {
      this.abrir(archivo);
    }
  }

  async abrir(archivo: File): Promise<void> {
    if (!archivo.name.toLowerCase().endsWith('.pdf')) {
      avisoError('El visor sólo abre archivos PDF.');
      return;
    }

    this.cerrar();
    this.archivo = archivo;
    this.cargando = true;
    this.cd.markForCheck();

    try {
      this.documento = await this.pdf.abrir(archivo);
      this.medidas = await this.documento.medidas();
      this.indice = await this.documento.indice();
      this.huella = await this.memoria.huella(archivo);
      // La página recordada se guarda aparte: al recolocar, el visor recalcula
      // cuál se está mirando a partir del desplazamiento, que todavía es cero.
      const recordada = this.recuperar();
      this.refrescarMarcas();
      this.recalcular();
      this.cargando = false;
      this.cd.markForCheck();

      // Lo demás no hace esperar a la lectura: el documento ya está en pantalla.
      this.irAPagina(recordada, false);
      this.subirAlServidor();
      this.indexarEnSegundoPlano();
    } catch (err) {
      this.cargando = false;
      console.error('No se ha podido abrir el PDF:', err);
      avisoError(this.porQueNoAbre(err));
      this.cerrar();
      this.cd.markForCheck();
    }
  }

  private porQueNoAbre(err: unknown): string {
    const fallo = err as { name?: string; message?: string };
    if (fallo?.name === 'PasswordException') {
      return 'El PDF está protegido con contraseña. Quítasela con "Proteger PDF" y vuelve.';
    }
    if (fallo?.name === 'InvalidPDFException') {
      return 'El archivo no es un PDF válido o está dañado.';
    }
    return `No se ha podido abrir el documento${fallo?.message ? ` (${fallo.message})` : ''}.`;
  }

  cerrar(): void {
    this.guardarEnMemoria();
    this.render.cancelar('');
    this.documento?.cerrar();
    this.documento = null;
    this.archivo = null;
    this.medidas = [];
    this.indice = [];
    this.visibles = [];
    this.disposicion = { filas: [], altoTotal: 0, anchoTotal: 0 };
    this.cambios = new Cambios();
    this.buscador.limpiar();
    this.resultados = [];
    this.consulta = '';
    this.indexadas = 0;
    this.paginaActual = 1;
    this.fileId = null;
    this.huella = '';
    this.resultado = null;
  }

  // --- disposición y desplazamiento -------------------------------------

  private recalcular(): void {
    const lectura = this.lecturaRef?.nativeElement;
    if (!lectura || !this.medidas.length) {
      return;
    }

    if (this.modoZoom !== 'libre') {
      const primera = this.medidas.find(m => !this.cambios.eliminadas.has(m.numero)) ?? this.medidas[0];
      const disponible = (lectura.clientWidth - SEPARACION * (this.columnas - 1)) / this.columnas;
      this.escala = escalaParaAjustar(primera, this.cambios.rotacionDe(primera.numero), disponible,
                                      lectura.clientHeight, this.modoZoom, SEPARACION);
    }

    // La página que se está leyendo, antes de que cambie la disposición: con
    // otra escala u otro ancho, el mismo desplazamiento en píxeles cae en un
    // sitio distinto del documento y se perdería el sitio.
    const enCurso = this.paginaActual;

    this.disposicion = calcularDisposicion(this.medidas, {
      escala: this.escala,
      columnas: this.columnas,
      anchoDisponible: lectura.clientWidth,
      separacion: SEPARACION,
      rotaciones: this.cambios.rotaciones,
      eliminadas: this.cambios.eliminadas,
    });
    this.actualizarVisibles();

    if (this.paginaActual !== enCurso) {
      this.irAPagina(enCurso, false);
      this.actualizarVisibles();
    }
  }

  private readonly alDesplazar = (): void => {
    if (this.pendienteDeCuadro) {
      return;
    }
    this.pendienteDeCuadro = true;
    requestAnimationFrame(() => {
      this.pendienteDeCuadro = false;
      const antes = this.ultimaVentana;
      const pagina = this.paginaActual;
      this.actualizarVisibles();
      // Sólo se molesta a Angular si de verdad ha cambiado algo de lo que se ve.
      if (antes !== this.ultimaVentana || pagina !== this.paginaActual) {
        this.zone.run(() => this.cd.detectChanges());
        this.recordarMasTarde();
      }
    });
  };

  private actualizarVisibles(): void {
    const lectura = this.lecturaRef?.nativeElement;
    if (!lectura) {
      return;
    }
    const [desde, hasta] = filasVisibles(this.disposicion, lectura.scrollTop, lectura.clientHeight);
    this.ultimaVentana = `${desde}-${hasta}:${this.escala}:${this.columnas}`;

    const enPantalla: EnPantalla[] = [];
    for (let i = desde; i <= hasta; i++) {
      const fila = this.disposicion.filas[i];
      fila?.paginas.forEach(colocada => enPantalla.push({ colocada, top: fila.top }));
    }
    this.visibles = enPantalla;
    this.paginaActual = paginaEnFoco(this.disposicion, lectura.scrollTop, lectura.clientHeight);

    // Lo que se está mirando se dibuja antes que lo que sólo está de reserva.
    this.render.priorizar(new Set(enPantalla.map(
      ({ colocada }) => `${colocada.numero}:${colocada.rotacion}:${this.escala}`)));
  }

  /** Ir a una página desde el panel: en móvil, además, lo cierra. */
  irAPaginaDesdePanel(numero: number): void {
    this.irAPagina(numero);
    if (window.innerWidth < 768) {
      this.panelAbierto = false;
    }
  }

  irAPagina(numero: number, suave = true): void {
    const fila = this.disposicion.filas.find(f => f.paginas.some(p => p.numero === numero));
    const lectura = this.lecturaRef?.nativeElement;
    if (!fila || !lectura) {
      return;
    }
    const destino = Math.max(0, fila.top - SEPARACION);
    // Un desplazamiento suave está bien para ir a la página de al lado; para
    // cruzar doscientas es un viaje de varios segundos con la pantalla medio
    // vacía. A partir de un par de pantallas, se salta y ya está.
    const lejos = Math.abs(destino - lectura.scrollTop) > lectura.clientHeight * 2;
    lectura.scrollTo({ top: destino, behavior: suave && !lejos ? 'smooth' : 'auto' });
    this.paginaActual = numero;
  }

  // --- zoom y vista -----------------------------------------------------

  ajustar(modo: ModoZoom): void {
    this.modoZoom = modo;
    // Se recuerda para los documentos siguientes: quien prefiere leer a lo
    // ancho no debería tener que decirlo en cada archivo que abre.
    this.memoria.guardarPreferencia('modoZoom', modo);
    this.recalcular();
  }

  aplicarZoom(factor: number): void {
    this.modoZoom = 'libre';
    this.escala = Math.min(ESCALA_MAXIMA, Math.max(ESCALA_MINIMA, this.escala * factor));
    this.recalcular();
  }

  alternarColumnas(): void {
    this.columnas = this.columnas === 1 ? 2 : 1;
    this.recalcular();
    this.recordarMasTarde();
  }

  alternarOscuro(): void {
    this.oscuro = !this.oscuro;
    this.recordarMasTarde();
  }

  alternarPanel(): void {
    // Recolocar lo hace el observador de tamaño en cuanto el panel entra o sale.
    this.panelAbierto = !this.panelAbierto;
  }

  abrirPestana(pestana: Pestana): void {
    this.pestana = pestana;
    this.panelAbierto = true;
  }

  // --- edición ----------------------------------------------------------

  alSeleccionar(seleccion: Seleccion): void {
    if (this.herramienta === 'leer') {
      return;
    }
    this.marcarSeleccion(seleccion, this.herramienta === 'subrayar' ? 'subrayado' : 'tachado',
                         this.herramienta === 'subrayar' ? this.colorSubrayado : this.colorTachado);
  }

  /**
   * Lo que se pide desde el menú que sale al terminar de seleccionar.
   *
   * Subrayar y tachar pasan por el mismo sitio que las herramientas de la
   * barra, para no perderse la regla de que repasar algo ya marcado sustituye
   * la marca en vez de apilar otra encima.
   */
  async alPedirAccion(peticion: AccionSeleccion): Promise<void> {
    const { accion, pagina, rects, texto, color } = peticion;
    const seleccion: Seleccion = { pagina, rects, texto };

    if (accion === 'subrayar') {
      this.marcarSeleccion(seleccion, 'subrayado', color ?? this.colorSubrayado);
      return;
    }
    if (accion === 'tachar') {
      this.marcarSeleccion(seleccion, 'tachado', this.colorTachado);
      return;
    }
    if (accion === 'buscar') {
      this.abrirPestana('buscar');
      this.buscar(texto);
      this.siguienteResultado();
      this.cd.markForCheck();
      return;
    }

    try {
      await copiarAlPortapapeles(texto);
      avisoExito('Texto copiado');
    } catch {
      avisoError('El navegador no ha dejado copiar. Selecciona el texto y usa Ctrl+C.');
    }
  }

  alternarMenuAlSeleccionar(): void {
    this.menuAlSeleccionar = !this.menuAlSeleccionar;
    this.memoria.guardarPreferencia('menuAlSeleccionar', this.menuAlSeleccionar);
  }

  private marcarSeleccion(seleccion: Seleccion, tipo: 'subrayado' | 'tachado',
                          color: ColorSubrayado | ColorTachado): void {
    // Repasar algo ya marcado sustituye la marca anterior en vez de apilar otra
    // encima: es lo que uno espera al cambiarle el color.
    const sustituye = this.cambios.solapadas(seleccion.pagina, tipo, seleccion.rects);

    this.cambios.marcar({
      tipo,
      pagina: seleccion.pagina,
      color,
      rects: seleccion.rects,
      texto: seleccion.texto,
    }, sustituye);
    this.resultado = null;
    this.refrescarMarcas();
  }

  cambiarColorMarca({ id, color }: CambioDeColor): void {
    this.cambios.cambiarColor(id, color);
    this.resultado = null;
    this.refrescarMarcas();
  }

  quitarMarca(id: string): void {
    this.cambios.quitarMarca(id);
    this.resultado = null;
    this.refrescarMarcas();
  }

  girarPagina(numero: number): void {
    this.cambios.girar(numero);
    this.resultado = null;
    this.recalcular();
    this.recordarMasTarde();
    this.cd.markForCheck();
  }

  eliminarPagina(numero: number): void {
    this.cambios.eliminar(numero);
    this.resultado = null;
    this.recalcular();
    this.recordarMasTarde();
    this.cd.markForCheck();
  }

  restaurarPagina(numero: number): void {
    this.cambios.restaurar(numero);
    this.recalcular();
    this.recordarMasTarde();
    this.cd.markForCheck();
  }

  deshacer(): void {
    this.cambios.deshacer();
    this.resultado = null;
    this.recalcular();
    this.recordarMasTarde();
    this.cd.markForCheck();
  }

  private refrescarMarcas(): void {
    // Copia nueva para que las páginas, que van en OnPush, se enteren.
    this.cambios.marcas = [...this.cambios.marcas];
    this.recordarMasTarde();
    this.cd.markForCheck();
  }

  /** Sin esto, Angular rehace la página entera en cada desplazamiento. */
  porNumero = (_: number, visible: EnPantalla) => visible.colocada.numero;

  marcasDe(numero: number) {
    return this.cambios.marcas.filter(marca => marca.pagina === numero);
  }

  // --- guardar ----------------------------------------------------------

  get hayCambios(): boolean {
    return this.cambios.hayAlgo;
  }

  async guardar(): Promise<void> {
    if (!this.documento || !this.hayCambios || this.guardando) {
      return;
    }
    this.guardando = true;
    this.cd.markForCheck();

    try {
      const respuesta = await this.enviarCambios();
      this.resultado = respuesta.files[0];
      // Lo guardado ya no es un borrador que haya que recuperar.
      this.memoria.guardar(this.huella, this.recuerdoActual(false));
      avisoExito('Documento guardado');
    } catch (err) {
      avisoError(mensajeDeError(err, 'No se han podido guardar los cambios.'));
    } finally {
      this.guardando = false;
      this.cd.markForCheck();
    }
  }

  /**
   * Manda los cambios, y si el archivo ya no está en el servidor lo vuelve a
   * subir y reintenta.
   *
   * La sesión se borra por inactividad y una lectura larga no toca el servidor:
   * sin este reintento, tres horas de trabajo se perderían al guardar.
   */
  private async enviarCambios(): Promise<{ files: ArchivoServidor[] }> {
    const peticion = () => {
      const cuerpo = { file_ids: [this.fileId], ...this.cambios.aPeticion(this.medidas.length) };
      return this.api.ejecutar('visor/guardar', cuerpo).toPromise() as Promise<{ files: ArchivoServidor[] }>;
    };

    if (!this.fileId) {
      await this.subirAlServidor(true);
    }
    try {
      return await peticion();
    } catch (err) {
      if ((err as { status?: number })?.status !== 404) {
        throw err;
      }
      await this.subirAlServidor(true);
      return peticion();
    }
  }

  descargar(): void {
    if (this.resultado) {
      this.api.descargar(this.resultado).subscribe({
        error: err => avisoError(mensajeDeError(err, 'No se ha podido descargar el archivo.')),
      });
    }
  }

  private async subirAlServidor(obligatorio = false): Promise<void> {
    if (!this.archivo || (this.fileId && !obligatorio)) {
      return;
    }
    try {
      const estado = await new Promise<{ tipo: string; archivos?: ArchivoServidor[] }>((ok, mal) => {
        this.api.subir([this.archivo!]).subscribe({
          next: e => e.tipo === 'hecho' && ok(e as never),
          error: mal,
        });
      });
      this.fileId = estado.archivos?.[0]?.id ?? null;
    } catch (err) {
      if (obligatorio) {
        throw err;
      }
      // Si falla al abrir no se molesta al usuario: se reintenta al guardar.
      console.warn('No se ha podido preparar el documento en el servidor:', err);
    }
  }

  private mantenerSesion(): void {
    if (this.fileId && document.visibilityState === 'visible') {
      this.api.mantenerSesion().subscribe({ error: () => undefined });
    }
  }

  // --- búsqueda ---------------------------------------------------------

  /**
   * Lee el texto de todo el documento sin estorbar.
   *
   * Se hace en los ratos muertos del navegador: en un documento largo esto
   * tarda, y no puede hacer esperar a quien sólo quiere leer.
   */
  private indexarEnSegundoPlano(): void {
    const documento = this.documento;
    if (!documento) {
      return;
    }
    this.indexando = true;
    let numero = 1;

    const siguiente = async () => {
      if (documento !== this.documento || numero > documento.paginas) {
        this.indexando = false;
        this.cd.markForCheck();
        return;
      }
      try {
        const pagina = await documento.pagina(numero);
        const { items } = await pagina.getTextContent();
        this.buscador.anadir(numero, items);
      } catch {
        /* una página ilegible no debe cortar el resto */
      }
      this.indexadas = numero++;
      if (this.consulta.length > 1) {
        this.resultados = this.buscador.buscar(this.consulta);
      }
      this.cd.markForCheck();
      programar(siguiente);
    };
    programar(siguiente);
  }

  /**
   * Actualiza los resultados según se escribe, **sin moverse del sitio**.
   *
   * Saltar en cada tecla es desconcertante: al teclear "petición" el documento
   * daría siete saltos. Se va a un resultado cuando se pulsa Intro o se elige
   * uno de la lista.
   */
  buscar(consulta: string): void {
    this.consulta = consulta;
    this.resultados = consulta.trim().length > 1 ? this.buscador.buscar(consulta) : [];
    this.resultadoActual = -1;
    this.cd.markForCheck();
  }

  irAResultado(indice: number): void {
    if (!this.resultados.length) {
      return;
    }
    this.resultadoActual = (indice + this.resultados.length) % this.resultados.length;
    this.irAPagina(this.resultados[this.resultadoActual].pagina);
  }

  /** Intro en el buscador: al primer resultado, y luego al siguiente. */
  siguienteResultado(atras = false): void {
    this.irAResultado(this.resultadoActual + (atras ? -1 : 1));
  }

  coincidenciasDe(numero: number): Coincidencia[] {
    return this.resultados.filter(resultado => resultado.pagina === numero);
  }

  // --- memoria entre visitas --------------------------------------------

  /** Devuelve la página por la que se iba, que es lo único que no se aplica solo. */
  private recuperar(): number {
    const recuerdo = this.memoria.recordar(this.huella);
    if (!recuerdo) {
      return 1;
    }
    this.paginaActual = Math.min(recuerdo.pagina || 1, this.medidas.length);
    this.escala = recuerdo.escala || 1;
    this.modoZoom = (recuerdo.modoZoom as ModoZoom) || this.modoZoom;
    this.columnas = recuerdo.columnas || 1;
    this.oscuro = !!recuerdo.oscuro;
    if (recuerdo.borrador) {
      this.cambios = Cambios.desdeBorrador(recuerdo.borrador);
    }
    return this.paginaActual;
  }

  private recordarMasTarde(): void {
    clearTimeout(this.temporizadorMemoria);
    this.temporizadorMemoria = setTimeout(() => this.guardarEnMemoria(), ESPERA_MEMORIA);
  }

  private guardarEnMemoria(): void {
    if (this.huella) {
      this.memoria.guardar(this.huella, this.recuerdoActual(true));
    }
  }

  private recuerdoActual(conBorrador: boolean) {
    return {
      pagina: this.paginaActual,
      escala: this.escala,
      modoZoom: this.modoZoom,
      columnas: this.columnas,
      oscuro: this.oscuro,
      borrador: conBorrador && this.cambios.hayAlgo ? this.cambios.aBorrador() : undefined,
    };
  }

  // --- teclado ----------------------------------------------------------

  @HostListener('window:keydown', ['$event'])
  alPulsarTecla(evento: KeyboardEvent): void {
    const escribiendo = (evento.target as HTMLElement)?.matches?.('input, textarea, select');
    if (!this.documento) {
      return;
    }
    // Intro dentro del buscador salta al siguiente resultado; el resto de
    // atajos no se cuelan mientras se escribe.
    if (escribiendo) {
      if (evento.key === 'Enter' && (evento.target as HTMLElement).matches('input[type=search]')) {
        evento.preventDefault();
        this.siguienteResultado(evento.shiftKey);
        this.cd.markForCheck();
      }
      return;
    }

    const atajos: Record<string, () => void> = {
      ArrowRight: () => this.irAPagina(Math.min(this.paginaActual + this.columnas, this.medidas.length)),
      ArrowLeft: () => this.irAPagina(Math.max(this.paginaActual - this.columnas, 1)),
      PageDown: () => this.irAPagina(Math.min(this.paginaActual + this.columnas, this.medidas.length)),
      PageUp: () => this.irAPagina(Math.max(this.paginaActual - this.columnas, 1)),
      Home: () => this.irAPagina(1),
      End: () => this.irAPagina(this.medidas.length),
      '+': () => this.aplicarZoom(1.25),
      '-': () => this.aplicarZoom(0.8),
      g: () => this.abrirPestana('paginas'),
      Escape: () => (this.panelAbierto = false),
    };

    if (evento.ctrlKey && evento.key.toLowerCase() === 'f') {
      evento.preventDefault();
      this.abrirPestana('buscar');
      setTimeout(() => document.querySelector<HTMLInputElement>('input[type=search]')?.focus());
      this.cd.markForCheck();
      return;
    }
    if (evento.ctrlKey && evento.key.toLowerCase() === 'z') {
      evento.preventDefault();
      this.deshacer();
      return;
    }
    if (evento.key === 'F3' || (evento.key === 'Enter' && this.pestana === 'buscar')) {
      evento.preventDefault();
      this.siguienteResultado(evento.shiftKey);
      this.cd.markForCheck();
      return;
    }

    const accion = atajos[evento.key];
    if (accion) {
      evento.preventDefault();
      accion();
      this.cd.markForCheck();
    }
  }
}

/** Trabajo de fondo, en los ratos libres del navegador si los hay. */
function programar(tarea: () => void): void {
  const idle = (window as { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback;
  if (idle) {
    idle(tarea);
  } else {
    setTimeout(tarea, 16);
  }
}
