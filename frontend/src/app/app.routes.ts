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
    path: 'herramientas/pdf-a-jpg',
    title: 'PDF a JPG',
    loadComponent: () =>
      import('./pages/tools/pdf-a-jpg/pdf-a-jpg.component').then(m => m.PdfAJpgComponent),
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
  { path: '**', redirectTo: '' },
];
