import { Routes } from '@angular/router';

/**
 * Cada herramienta se carga bajo demanda: la portada no arrastra el código de
 * ninguna. Al añadir una herramienta nueva, añade aquí su ruta y su entrada en
 * `core/tools.ts` (el test de `core/tools.spec.ts` comprueba que no se olvide).
 */
export const routes: Routes = [
  {
    path: '',
    title: 'Herramientas para PDF e imágenes',
    loadComponent: () => import('./pages/home/home.component').then(m => m.HomeComponent),
  },
  {
    path: 'herramientas/unir-pdf',
    title: 'Unir PDF',
    loadComponent: () =>
      import('./pages/tools/unir-pdf/unir-pdf.component').then(m => m.UnirPdfComponent),
  },
  {
    path: 'herramientas/pdf-a-imagen',
    title: 'PDF a imagen',
    loadComponent: () =>
      import('./pages/tools/pdf-a-imagen/pdf-a-imagen.component').then(m => m.PdfAImagenComponent),
  },
  {
    path: 'herramientas/firmar',
    title: 'Firmar documento',
    loadComponent: () =>
      import('./pages/tools/firmar/firmar.component').then(m => m.FirmarComponent),
  },
  {
    path: 'herramientas/dividir-pdf',
    title: 'Dividir PDF',
    loadComponent: () =>
      import('./pages/tools/dividir-pdf/dividir-pdf.component').then(m => m.DividirPdfComponent),
  },
  {
    path: 'herramientas/organizar-pdf',
    title: 'Organizar PDF',
    loadComponent: () =>
      import('./pages/tools/organizar-pdf/organizar-pdf.component').then(m => m.OrganizarPdfComponent),
  },
  {
    path: 'herramientas/proteger-pdf',
    title: 'Proteger PDF',
    loadComponent: () =>
      import('./pages/tools/proteger-pdf/proteger-pdf.component').then(m => m.ProtegerPdfComponent),
  },
  {
    path: 'herramientas/ocr-pdf',
    title: 'PDF con OCR',
    loadComponent: () =>
      import('./pages/tools/ocr-pdf/ocr-pdf.component').then(m => m.OcrPdfComponent),
  },
  {
    path: 'herramientas/comprimir-pdf',
    title: 'Comprimir PDF',
    loadComponent: () =>
      import('./pages/tools/comprimir-pdf/comprimir-pdf.component').then(m => m.ComprimirPdfComponent),
  },
  {
    path: 'herramientas/comprimir-imagen',
    title: 'Comprimir imagen',
    loadComponent: () =>
      import('./pages/tools/comprimir-imagen/comprimir-imagen.component')
        .then(m => m.ComprimirImagenComponent),
  },
  {
    path: 'herramientas/convertir-imagen',
    title: 'Convertir imagen',
    loadComponent: () =>
      import('./pages/tools/convertir-imagen/convertir-imagen.component')
        .then(m => m.ConvertirImagenComponent),
  },
  {
    path: 'herramientas/imagen-a-pdf',
    title: 'Imagen a PDF',
    loadComponent: () =>
      import('./pages/tools/imagen-a-pdf/imagen-a-pdf.component').then(m => m.ImagenAPdfComponent),
  },
  {
    path: 'herramientas/a-markdown',
    title: 'Documento a Markdown',
    loadComponent: () =>
      import('./pages/tools/a-markdown/a-markdown.component').then(m => m.AMarkdownComponent),
  },
  {
    // El visor manda en toda la pantalla: sin barra de navegación ni pie.
    path: 'visor',
    title: 'Visor de PDF',
    data: { pantallaCompleta: true },
    loadComponent: () => import('./pages/visor/visor.component').then(m => m.VisorComponent),
  },
  { path: '**', redirectTo: '' },
];
