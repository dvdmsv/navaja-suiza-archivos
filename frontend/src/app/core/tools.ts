/**
 * Catálogo de herramientas.
 *
 * Es la única fuente de verdad para la portada, el buscador y el menú. Al añadir
 * una herramienta nueva basta con:
 *   1. añadir su entrada aquí con `disponible: true`,
 *   2. registrar su ruta en `app.routes.ts` (Angular necesita el import estático),
 *   3. crear el blueprint equivalente en `backend/api/tools/`.
 */

export type Categoria = 'PDF' | 'Imágenes' | 'Documentos';

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

export const CATEGORIAS: Categoria[] = ['PDF', 'Imágenes', 'Documentos'];

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
    slug: 'pdf-a-imagen',
    nombre: 'PDF a imagen',
    descripcion: 'Convierte cada página del PDF en una imagen JPG, PNG, WebP…',
    icono: 'bi-file-earmark-image',
    categoria: 'PDF',
    disponible: true,
  },
  {
    slug: 'firmar',
    nombre: 'Firmar documento',
    descripcion: 'Coloca tu firma donde quieras sobre un PDF o una imagen.',
    icono: 'bi-vector-pen',
    categoria: 'PDF',
    disponible: true,
  },
  {
    slug: 'dividir-pdf',
    nombre: 'Dividir PDF',
    descripcion: 'Saca las páginas que necesites a un documento nuevo.',
    icono: 'bi-scissors',
    categoria: 'PDF',
    disponible: true,
  },
  {
    slug: 'organizar-pdf',
    nombre: 'Organizar PDF',
    descripcion: 'Reordena, gira o elimina páginas arrastrándolas.',
    icono: 'bi-arrows-move',
    categoria: 'PDF',
    disponible: true,
  },
  {
    slug: 'proteger-pdf',
    nombre: 'Proteger PDF',
    descripcion: 'Pon o quita la contraseña de apertura del documento.',
    icono: 'bi-file-earmark-lock',
    categoria: 'PDF',
    disponible: true,
  },
  {
    slug: 'ocr-pdf',
    nombre: 'PDF con OCR',
    descripcion: 'Reconoce el texto de un escaneado para poder buscarlo y copiarlo.',
    icono: 'bi-body-text',
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
    slug: 'imagen-a-pdf',
    nombre: 'Imagen a PDF',
    descripcion: 'Reúne tus imágenes en un único PDF, en el orden que elijas.',
    icono: 'bi-file-earmark-pdf',
    categoria: 'Imágenes',
    disponible: true,
  },
  {
    slug: 'a-markdown',
    nombre: 'Documento a Markdown',
    descripcion: 'Pasa un PDF, Word, Excel o PowerPoint a Markdown para dárselo a una IA.',
    icono: 'bi-markdown',
    categoria: 'Documentos',
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

/** Una categoría con sus herramientas, tal y como la pintan portada y menú. */
export interface Grupo {
  categoria: Categoria;
  herramientas: Herramienta[];
}

/**
 * Agrupa el catálogo por categorías, en el orden de `CATEGORIAS` y sin las
 * categorías que se quedarían vacías.
 *
 * El menú sólo enseña lo que ya funciona; la portada también anuncia lo que
 * está por venir, de ahí el parámetro.
 */
export function agruparPorCategoria(incluirPendientes = false): Grupo[] {
  return CATEGORIAS
    .map(categoria => ({
      categoria,
      herramientas: HERRAMIENTAS.filter(
        h => h.categoria === categoria && (incluirPendientes || h.disponible)),
    }))
    .filter(grupo => grupo.herramientas.length > 0);
}

export function rutaDe(herramienta: Herramienta): string {
  return `/herramientas/${herramienta.slug}`;
}

export function buscarPorSlug(slug: string): Herramienta | undefined {
  return HERRAMIENTAS.find(h => h.slug === slug);
}
