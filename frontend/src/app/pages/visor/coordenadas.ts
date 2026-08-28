/**
 * Conversión entre lo que se ve en pantalla y lo que se le manda al servidor.
 *
 * El formato de intercambio son proporciones de 0 a 1 con el origen arriba a la
 * izquierda, referidas a la página **sin el giro que haya aplicado el usuario**
 * en el visor. Da igual el zoom, el tamaño de pantalla o la resolución, y es la
 * misma convención que usan "Firmar documento" y el backend.
 */

/** `[x0, y0, x1, y1]`, en proporciones de 0 a 1. */
export type Rect = [number, number, number, number];

const entre = (v: number) => Math.max(0, Math.min(1, v));

/**
 * De un rectángulo de pantalla a proporciones sobre la página sin girar.
 *
 * `caja` es el recuadro de la página en pantalla, y `rotacion` el giro que el
 * usuario le ha dado en el visor: se deshace aquí para que el servidor reciba
 * siempre coordenadas de la página tal y como está en el archivo.
 */
export function aProporciones(rect: DOMRect, caja: DOMRect, rotacion = 0): Rect {
  const vista: Rect = [
    entre((rect.left - caja.left) / caja.width),
    entre((rect.top - caja.top) / caja.height),
    entre((rect.right - caja.left) / caja.width),
    entre((rect.bottom - caja.top) / caja.height),
  ];
  return ordenar(desgirar(vista, rotacion));
}

/** Y la vuelta: de proporciones a porcentajes para colocar la marca encima. */
export function aPorcentajes(rect: Rect, rotacion = 0): Record<string, string> {
  const [x0, y0, x1, y1] = ordenar(girar(rect, rotacion));
  // Redondeado: la resta de proporciones deja restos como 10.000000000000002,
  // que además ensucian el HTML sin aportar un solo píxel de precisión.
  return {
    left: porcentaje(x0),
    top: porcentaje(y0),
    width: porcentaje(x1 - x0),
    height: porcentaje(y1 - y0),
  };
}

function porcentaje(valor: number): string {
  return `${Math.round(valor * 1e6) / 1e4}%`;
}

/** De la página sin girar a lo que se ve, girando en sentido horario. */
export function girar([x0, y0, x1, y1]: Rect, rotacion: number): Rect {
  switch (((rotacion % 360) + 360) % 360) {
    case 90:
      return [1 - y1, x0, 1 - y0, x1];
    case 180:
      return [1 - x1, 1 - y1, 1 - x0, 1 - y0];
    case 270:
      return [y0, 1 - x1, y1, 1 - x0];
    default:
      return [x0, y0, x1, y1];
  }
}

/** La inversa de `girar`. */
export function desgirar(rect: Rect, rotacion: number): Rect {
  return girar(rect, 360 - (((rotacion % 360) + 360) % 360));
}

/**
 * ¿Se pisan dos zonas marcadas?
 *
 * Se exige un solape mínimo respecto a la más pequeña: dos líneas seguidas de
 * texto se rozan por unos pocos píxeles, y eso no debe contar como "es la misma
 * marca". Lo usa el visor para saber si un subrayado nuevo sustituye a otro.
 */
export function seSolapan(a: Rect, b: Rect, minimo = 0.35): boolean {
  const ancho = Math.min(a[2], b[2]) - Math.max(a[0], b[0]);
  const alto = Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
  if (ancho <= 0 || alto <= 0) {
    return false;
  }
  const comun = ancho * alto;
  const menor = Math.min(area(a), area(b));
  return menor > 0 && comun / menor >= minimo;
}

/** ¿Cae el punto dentro de la zona? Ambos en proporciones de la página. */
export function contiene([x0, y0, x1, y1]: Rect, x: number, y: number): boolean {
  return x >= x0 && x <= x1 && y >= y0 && y <= y1;
}

/**
 * Un punto de la pantalla, en proporciones de la página sin girar.
 *
 * La misma conversión que `aProporciones`, para cuando lo que hay que situar es
 * un clic y no una selección.
 */
export function puntoAProporciones(x: number, y: number, caja: DOMRect,
                                   rotacion = 0): [number, number] {
  const [px, py] = desgirar([
    entre((x - caja.left) / caja.width),
    entre((y - caja.top) / caja.height),
    entre((x - caja.left) / caja.width),
    entre((y - caja.top) / caja.height),
  ], rotacion);
  return [px, py];
}

/**
 * Junta los rectángulos que se pisan, dejando uno por trozo de línea.
 *
 * Hace falta porque `getClientRects()` devuelve, para una selección que abarca
 * elementos enteros, **la caja del elemento y la del texto por separado**: la
 * misma zona repetida. Como las marcas se pintan en modo multiplicar, dos
 * amarillos superpuestos dan uno mucho más oscuro, y el subrayado se veía más
 * intenso cuanto más texto se hubiera seleccionado. En el PDF guardado pasaba
 * lo mismo, con anotaciones duplicadas.
 */
export function fusionarRects(rects: Rect[], holgura = 0.003): Rect[] {
  let actuales = rects
    .map(ordenar)
    .filter(([x0, y0, x1, y1]) => x1 - x0 > 0 && y1 - y0 > 0);

  // Se repite hasta que no cambie nada: unir dos puede dejarlos pegados a un tercero.
  for (let vuelta = 0; vuelta < actuales.length; vuelta++) {
    const salida: Rect[] = [];
    let cambiado = false;

    for (const rect of actuales) {
      const indice = salida.findIndex(otro => mismaLinea(otro, rect) && seRozan(otro, rect, holgura));
      if (indice >= 0) {
        salida[indice] = union(salida[indice], rect);
        cambiado = true;
      } else {
        salida.push(rect);
      }
    }
    actuales = salida;
    if (!cambiado) {
      break;
    }
  }
  return actuales.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
}

/** ¿Están a la misma altura? Se pide que compartan la mitad del alto del menor. */
function mismaLinea(a: Rect, b: Rect): boolean {
  const comun = Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
  const menor = Math.min(a[3] - a[1], b[3] - b[1]);
  return menor > 0 && comun / menor >= 0.5;
}

/** ¿Se solapan o se quedan a un pelo, en horizontal? */
function seRozan(a: Rect, b: Rect, holgura: number): boolean {
  return Math.min(a[2], b[2]) - Math.max(a[0], b[0]) >= -holgura;
}

function union(a: Rect, b: Rect): Rect {
  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
}

function area([x0, y0, x1, y1]: Rect): number {
  return Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
}

function ordenar([x0, y0, x1, y1]: Rect): Rect {
  return [Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1)];
}
