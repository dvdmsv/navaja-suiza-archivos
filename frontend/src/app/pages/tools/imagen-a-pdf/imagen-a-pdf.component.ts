
import { Component, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { FileQueueComponent } from '../../../shared/file-queue/file-queue.component';
import { PaginaHerramienta } from '../../../shared/pagina-herramienta';
import { ResultListComponent } from '../../../shared/result-list/result-list.component';
import { ToolControlsComponent } from '../../../shared/tool-controls/tool-controls.component';
import { ToolPageComponent } from '../../../shared/tool-page/tool-page.component';

interface Opcion {
  id: string;
  nombre: string;
  detalle: string;
}

@Component({
  selector: 'app-imagen-a-pdf',
  imports: [
    FormsModule,
    FileQueueComponent,
    ResultListComponent,
    ToolControlsComponent,
    ToolPageComponent
],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './imagen-a-pdf.component.html',
})
export class ImagenAPdfComponent extends PaginaHerramienta {
  protected readonly slug = 'imagen-a-pdf';
  protected override get mensajeExito(): string {
    return 'PDF creado';
  }

  readonly tamanos: Opcion[] = [
    { id: 'a4', nombre: 'A4', detalle: '21 × 29,7 cm' },
    { id: 'carta', nombre: 'Carta', detalle: '21,6 × 27,9 cm' },
    { id: 'ajustada', nombre: 'Como la imagen', detalle: 'una página por foto, sin bordes' },
  ];

  readonly orientaciones: Opcion[] = [
    { id: 'auto', nombre: 'Automática', detalle: 'según cada imagen' },
    { id: 'vertical', nombre: 'Vertical', detalle: 'todas de pie' },
    { id: 'horizontal', nombre: 'Horizontal', detalle: 'todas tumbadas' },
  ];

  tamano = 'a4';
  orientacion = 'auto';
  margen = 10;
  calidad = 85;

  /** Con la página al tamaño de la imagen no hay ni orientación ni márgenes. */
  get ajustaALaImagen(): boolean {
    return this.tamano === 'ajustada';
  }

  protected override opciones(): Record<string, unknown> {
    return {
      pagina: this.tamano,
      orientacion: this.orientacion,
      margen: this.margen,
      calidad: this.calidad,
    };
  }

  elegirTamano(id: string): void {
    this.tamano = id;
    this.alCambiarLista();
  }

  elegirOrientacion(id: string): void {
    this.orientacion = id;
    this.alCambiarLista();
  }
}
