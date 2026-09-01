/**
 * Qué se puede enseñar en pantalla y cómo, a partir del nombre del archivo.
 *
 * El servidor no dice el tipo de un resultado —`ArchivoServidor` sólo trae
 * `id`, `name`, `size` y `generated`—, así que la extensión es todo lo que hay.
 */

export type TipoVistaPrevia = 'pdf' | 'imagen' | 'texto';

/**
 * Imágenes que un navegador pinta en un `<img>`.
 *
 * `.tiff` se queda fuera a propósito aunque "Convertir imagen" lo genere:
 * ninguno lo muestra, y ofrecer verlo sólo enseñaría un hueco roto. El `.svg`
 * de "Generar QR" sí entra: en un `<img>` se pinta y no ejecuta nada.
 */
const IMAGENES = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.avif', '.svg'];

/** Texto plano. El HTML se enseña como texto, nunca renderizado. */
const TEXTOS = ['.md', '.txt', '.csv', '.json', '.xml', '.html', '.htm'];

/** Cómo se puede enseñar este archivo, o `null` si no se puede. */
export function tipoDeVistaPrevia(nombre: string): TipoVistaPrevia | null {
  const extension = extensionDe(nombre);
  if (extension === '.pdf') {
    return 'pdf';
  }
  if (IMAGENES.includes(extension)) {
    return 'imagen';
  }
  if (TEXTOS.includes(extension)) {
    return 'texto';
  }
  return null;
}

/** Extensión en minúsculas y con punto; cadena vacía si no tiene. */
export function extensionDe(nombre: string): string {
  const punto = nombre.lastIndexOf('.');
  return punto > 0 ? nombre.slice(punto).toLowerCase() : '';
}
