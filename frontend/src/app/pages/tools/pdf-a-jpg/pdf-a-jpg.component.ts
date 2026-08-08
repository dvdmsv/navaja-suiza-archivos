import { NgFor } from '@angular/common';
import { Component } from '@angular/core';

import { FileQueueComponent } from '../../../shared/file-queue/file-queue.component';
import { PaginaHerramienta } from '../../../shared/pagina-herramienta';
import { ResultListComponent } from '../../../shared/result-list/result-list.component';
import { ToolControlsComponent } from '../../../shared/tool-controls/tool-controls.component';
import { ToolPageComponent } from '../../../shared/tool-page/tool-page.component';

interface OpcionResolucion {
  id: string;
  nombre: string;
  detalle: string;
}

@Component({
  selector: 'app-pdf-a-jpg',
  standalone: true,
  imports: [NgFor, FileQueueComponent, ResultListComponent, ToolControlsComponent, ToolPageComponent],
  templateUrl: './pdf-a-jpg.component.html',
})
export class PdfAJpgComponent extends PaginaHerramienta {
  protected readonly slug = 'pdf-a-jpg';
  protected override get mensajeExito(): string {
    return 'Páginas convertidas';
  }

  readonly resoluciones: OpcionResolucion[] = [
    { id: 'pantalla', nombre: 'Pantalla', detalle: '96 ppp · archivos ligeros' },
    { id: 'normal', nombre: 'Normal', detalle: '150 ppp · uso general' },
    { id: 'alta', nombre: 'Alta', detalle: '300 ppp · calidad de impresión' },
  ];

  resolucion = 'normal';

  protected override opciones(): Record<string, unknown> {
    return { resolucion: this.resolucion };
  }

  /** Al cambiar la resolución el resultado anterior deja de valer. */
  elegirResolucion(id: string): void {
    this.resolucion = id;
    this.alCambiarLista();
  }
}
