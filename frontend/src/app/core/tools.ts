/**
 * Catálogo de herramientas.
 *
 * Es la única fuente de verdad para la portada, el buscador y el menú. Al añadir
 * una herramienta nueva basta con:
 *   1. añadir su entrada aquí con `disponible: true`,
 *   2. registrar su ruta en `app.routes.ts` (Angular necesita el import estático),
 *   3. crear el blueprint equivalente en `backend/api/tools/`.
 */

export type Categoria = 'PDF' | 'Imágenes';

export interface Herramienta {
  /** Último tramo de la ruta y, por convención, el slug del endpoint del backend. */
  slug: string;
  nombre: string;
  descripcion: string;
  /** Clase de Bootstrap Icons. */
  icono: string;
  categoria: Categoria;
  /** Las no disponibles se muestran atenuadas como "próximamente". */
  disponible: boolean;
}

export const CATEGORIAS: Categoria[] = ['PDF', 'Imágenes'];

export const HERRAMIENTAS: Herramienta[] = [
  {
    slug: 'unir-pdf',
    nombre: 'Unir PDF',
    descripcion: 'Combina varios PDF en un único documento, en el orden que elijas.',
    icono: 'bi-file-earmark-plus',
    categoria: 'PDF',
    disponible: true,
  },
  {
    slug: 'pdf-a-jpg',
    nombre: 'PDF a JPG',
    descripcion: 'Convierte cada página del PDF en una imagen.',
    icono: 'bi-file-earmark-image',
    categoria: 'PDF',
    disponible: true,
  },
  {
    slug: 'comprimir-pdf',
    nombre: 'Comprimir PDF',
    descripcion: 'Reduce el peso del documento conservando la calidad.',
    icono: 'bi-file-earmark-zip',
    categoria: 'PDF',
    disponible: true,
  },
  {
    slug: 'comprimir-imagen',
    nombre: 'Comprimir imagen',
    descripcion: 'Baja el peso de tus imágenes ajustando la calidad.',
    icono: 'bi-images',
    categoria: 'Imágenes',
    disponible: true,
  },
  {
    slug: 'convertir-imagen',
    nombre: 'Convertir imagen',
    descripcion: 'Pasa entre JPG, PNG, WebP y otros formatos.',
    icono: 'bi-arrow-left-right',
    categoria: 'Imágenes',
    disponible: true,
  },
];

export function rutaDe(herramienta: Herramienta): string {
  return `/herramientas/${herramienta.slug}`;
}

export function buscarPorSlug(slug: string): Herramienta | undefined {
  return HERRAMIENTAS.find(h => h.slug === slug);
}
