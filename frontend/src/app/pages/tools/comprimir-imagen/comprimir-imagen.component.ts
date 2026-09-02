import { NgFor } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { FileQueueComponent } from '../../../shared/file-queue/file-queue.component';
import { PaginaHerramienta } from '../../../shared/pagina-herramienta';
import { ResultListComponent } from '../../../shared/result-list/result-list.component';
import { ToolControlsComponent } from '../../../shared/tool-controls/tool-controls.component';
import { ToolPageComponent } from '../../../shared/tool-page/tool-page.component';

@Component({
  selector: 'app-comprimir-imagen',
  imports: [
    NgFor, FormsModule, FileQueueComponent, ResultListComponent,
    ToolControlsComponent, ToolPageComponent,
  ],
  templateUrl: './comprimir-imagen.component.html',
})
export class ComprimirImagenComponent extends PaginaHerramienta {
  protected readonly slug = 'comprimir-imagen';
  protected override get mensajeExito(): string {
    return 'Imágenes comprimidas';
  }

  /** 0 significa conservar el tamaño original. */
  readonly tamanos = [
    { valor: 0, nombre: 'Sin cambiar el tamaño' },
    { valor: 3840, nombre: '4K — 3840 px' },
    { valor: 2560, nombre: '2K — 2560 px' },
    { valor: 1920, nombre: 'Full HD — 1920 px' },
    { valor: 1280, nombre: 'HD — 1280 px' },
    { valor: 800, nombre: 'Web — 800 px' },
  ];

  calidad = 75;
  ladoMaximo = 0;

  protected override opciones(): Record<string, unknown> {
    return { calidad: this.calidad, lado_maximo: this.ladoMaximo };
  }

  get descripcionCalidad(): string {
    if (this.calidad >= 85) {
      return 'Casi idéntica al original';
    }
    return this.calidad >= 60 ? 'Buen equilibrio' : 'Muy ligera, con pérdida visible';
  }
}
