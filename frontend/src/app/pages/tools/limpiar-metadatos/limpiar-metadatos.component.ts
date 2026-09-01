import { NgFor, NgIf } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { FileQueueComponent } from '../../../shared/file-queue/file-queue.component';
import { PaginaHerramienta } from '../../../shared/pagina-herramienta';
import { ResultListComponent } from '../../../shared/result-list/result-list.component';
import { ToolControlsComponent } from '../../../shared/tool-controls/tool-controls.component';
import { ToolPageComponent } from '../../../shared/tool-page/tool-page.component';

@Component({
  selector: 'app-limpiar-metadatos',
  standalone: true,
  imports: [NgFor, NgIf, FormsModule, FileQueueComponent, ResultListComponent,
            ToolControlsComponent, ToolPageComponent],
  templateUrl: './limpiar-metadatos.component.html',
})
export class LimpiarMetadatosComponent extends PaginaHerramienta {
  protected readonly slug = 'limpiar-metadatos';
  protected override get mensajeExito(): string {
    return 'Metadatos borrados';
  }

  aFondo = false;

  /** Si alguno de los archivos llevaba dentro dónde se hizo. */
  get algunaUbicacion(): boolean {
    return (this.metadatos ?? []).some(archivo => archivo.ubicacion);
  }

  /** Si no se encontró nada en ninguno: también es una respuesta. */
  get sinRastro(): boolean {
    return (this.metadatos ?? []).every(archivo => archivo.campos.length === 0);
  }

  protected override opciones(): Record<string, unknown> {
    return { a_fondo: this.aFondo };
  }
}
