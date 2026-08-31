/**
 * Las fuentes con las que se puede escribir sobre el PDF, y dónde cae la línea
 * base de cada línea.
 *
 * Se usan las tres familias clásicas del PDF —las que todo lector trae y que
 * PyMuPDF lleva dentro— porque el navegador tiene equivalentes **compatibles en
 * métricas**: Arial avanza lo mismo que Helvetica, Times New Roman que Times y
 * Courier New que Courier. Así lo que se ve escrito en pantalla mide lo mismo
 * que lo que acaba en el archivo, sin instalar ni servir un solo tipo de letra.
 */

export type Fuente = 'sans' | 'serif' | 'mono';
export type ColorTexto = 'negro' | 'azul' | 'rojo';

export const FUENTES: { valor: Fuente; nombre: string }[] = [
  { valor: 'sans', nombre: 'Helvetica' },
  { valor: 'serif', nombre: 'Times' },
  { valor: 'mono', nombre: 'Courier' },
];

export const COLORES_TEXTO: ColorTexto[] = ['negro', 'azul', 'rojo'];

/**
 * El color de cada tinta.
 *
 * Estos mismos valores están en `backend/api/tools/visor.py`, en 0–1 como los
 * quiere PyMuPDF: si se cambian aquí, hay que cambiarlos allí.
 */
export const COLORES_CSS: Record<ColorTexto, string> = {
  negro: '#000000',
  azul: '#1a3fd0',
  rojo: '#c81e1e',
};

/** Cuerpos admitidos, en puntos PDF. */
export const TAMANO_MINIMO = 6;
export const TAMANO_MAXIMO = 96;
export const TAMANO_POR_DEFECTO = 12;

/**
 * Separación entre líneas base, en múltiplos del cuerpo.
 *
 * Es un múltiplo del cuerpo y no una métrica de la fuente a propósito: así el
 * navegador y el servidor separan las líneas exactamente igual sin tener que
 * ponerse de acuerdo en nada más. En CSS es el `line-height`, y el navegador
 * garantiza que dos líneas base seguidas disten justo eso.
 */
export const INTERLINEADO = 1.2;

const PILAS: Record<Fuente, string> = {
  sans: 'Helvetica, Arial, sans-serif',
  serif: '"Times New Roman", Times, serif',
  mono: '"Courier New", Courier, monospace',
};

/** La familia tal y como hay que pedírsela al navegador. */
export function pilaCss(fuente: Fuente): string {
  return PILAS[fuente] ?? PILAS.sans;
}

/** El valor de `font` de un canvas o de CSS, que es como se mide y como se pinta. */
export function fuenteCss(fuente: Fuente, negrita: boolean, cursiva: boolean,
                          tamanoPx: number): string {
  const estilo = cursiva ? 'italic ' : '';
  const peso = negrita ? 'bold ' : '';
  return `${estilo}${peso}${tamanoPx}px ${pilaCss(fuente)}`;
}

/**
 * Ascendente y descendente de la fuente, en múltiplos del cuerpo.
 *
 * Si el navegador no sabe medirlo se recurre a unos valores de reserva; el
 * error sería de una fracción de punto, y sólo en la posición vertical.
 */
const RESERVA: Record<Fuente, { alto: number; bajo: number }> = {
  sans: { alto: 0.905, bajo: 0.212 },
  serif: { alto: 0.891, bajo: 0.216 },
  mono: { alto: 0.833, bajo: 0.3 },
};

/** Medir cuesta crear un canvas: se guarda lo medido, que no cambia nunca. */
const medidas = new Map<string, { alto: number; bajo: number }>();
let lienzo: CanvasRenderingContext2D | null | undefined;

function metricas(fuente: Fuente, negrita: boolean, cursiva: boolean): { alto: number; bajo: number } {
  const clave = `${fuente}|${negrita}|${cursiva}`;
  const guardada = medidas.get(clave);
  if (guardada) {
    return guardada;
  }

  let medida = RESERVA[fuente] ?? RESERVA.sans;
  try {
    if (lienzo === undefined) {
      lienzo = document.createElement('canvas').getContext('2d');
    }
    if (lienzo) {
      // Se mide a un cuerpo grande y se divide, para que el redondeo a píxeles
      // del navegador no se coma la precisión.
      const referencia = 100;
      lienzo.font = fuenteCss(fuente, negrita, cursiva, referencia);
      const m = lienzo.measureText('Hxg');
      if (m.fontBoundingBoxAscent && m.fontBoundingBoxDescent) {
        medida = {
          alto: m.fontBoundingBoxAscent / referencia,
          bajo: m.fontBoundingBoxDescent / referencia,
        };
      }
    }
  } catch {
    // Sin canvas (o sin esas métricas) se usa la reserva.
  }

  medidas.set(clave, medida);
  return medida;
}

/**
 * A qué distancia del borde de arriba de la caja cae la primera línea base.
 *
 * El navegador reparte el sobrante del `line-height` a partes iguales arriba y
 * abajo —el llamado medio interlineado—, así que la base queda a media
 * diferencia más el ascendente. Sabiendo esto se puede colocar la caja para que
 * la línea base caiga justo donde el usuario pulsó, que es lo que se guarda y
 * lo que después dibuja PyMuPDF.
 */
export function desplazamientoBase(fuente: Fuente, negrita: boolean, cursiva: boolean,
                                   tamanoPx: number): number {
  const { alto, bajo } = metricas(fuente, negrita, cursiva);
  return ((INTERLINEADO - (alto + bajo)) / 2 + alto) * tamanoPx;
}

/**
 * Lo que mide de ancho un texto, en píxeles.
 *
 * Sirve para dar a la caja el tamaño justo. Como las familias del navegador son
 * compatibles en métricas con las del PDF, esta medida es también la que
 * ocupará el texto en el archivo guardado.
 */
export function anchoDeTexto(texto: string, fuente: Fuente, negrita: boolean, cursiva: boolean,
                             tamanoPx: number): number {
  try {
    if (lienzo === undefined) {
      lienzo = document.createElement('canvas').getContext('2d');
    }
    if (lienzo) {
      lienzo.font = fuenteCss(fuente, negrita, cursiva, tamanoPx);
      return Math.max(...texto.split('\n').map(linea => lienzo!.measureText(linea).width), 0);
    }
  } catch {
    // Sin canvas se estima a ojo; sólo afecta al ancho de la caja en pantalla.
  }
  const largo = Math.max(...texto.split('\n').map(linea => linea.length), 0);
  return largo * tamanoPx * 0.5;
}

/** Alto de la caja de un texto de varias líneas, en píxeles. */
export function altoDeCaja(lineas: number, tamanoPx: number): number {
  return Math.max(1, lineas) * INTERLINEADO * tamanoPx;
}

/**
 * Los cuerpos por los que se pasa con los botones de más y menos.
 *
 * Es una escala, no un contador de uno en uno: subir de 12 a 13 puntos no le
 * sirve a nadie, y de 12 a 48 de uno en uno son treinta y seis clics.
 */
export const TAMANOS = [8, 10, 11, 12, 14, 18, 24, 36, 48, 72];

/** El siguiente cuerpo de la escala, hacia arriba o hacia abajo. */
export function otroTamano(actual: number, direccion: 1 | -1): number {
  const escala = TAMANOS;
  if (direccion > 0) {
    return tamanoValido(escala.find(valor => valor > actual) ?? TAMANO_MAXIMO);
  }
  return tamanoValido([...escala].reverse().find(valor => valor < actual) ?? TAMANO_MINIMO);
}

/** Recorta el cuerpo a lo que admite la interfaz (y el servidor). */
export function tamanoValido(valor: number): number {
  if (!Number.isFinite(valor)) {
    return TAMANO_POR_DEFECTO;
  }
  return Math.min(TAMANO_MAXIMO, Math.max(TAMANO_MINIMO, Math.round(valor)));
}
