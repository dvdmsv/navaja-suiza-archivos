
import { Component } from '@angular/core';

import { FileQueueComponent } from '../../../shared/file-queue/file-queue.component';
import { PaginaHerramienta } from '../../../shared/pagina-herramienta';
import { ResultListComponent } from '../../../shared/result-list/result-list.component';
import { ToolControlsComponent } from '../../../shared/tool-controls/tool-controls.component';
import { ToolPageComponent } from '../../../shared/tool-page/tool-page.component';

@Component({
  selector: 'app-unir-pdf',
  imports: [FileQueueComponent, ResultListComponent, ToolControlsComponent, ToolPageComponent],
  templateUrl: './unir-pdf.component.html',
})
export class UnirPdfComponent extends PaginaHerramienta {
  protected readonly slug = 'unir-pdf';
  protected override readonly minimoArchivos = 2;
  protected override get mensajeExito(): string {
    return 'PDF combinado';
  }
}
