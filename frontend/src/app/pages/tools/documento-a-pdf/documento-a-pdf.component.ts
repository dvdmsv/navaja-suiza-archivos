import { Component } from '@angular/core';

import { FileQueueComponent } from '../../../shared/file-queue/file-queue.component';
import { PaginaHerramienta } from '../../../shared/pagina-herramienta';
import { ResultListComponent } from '../../../shared/result-list/result-list.component';
import { ToolControlsComponent } from '../../../shared/tool-controls/tool-controls.component';
import { ToolPageComponent } from '../../../shared/tool-page/tool-page.component';

@Component({
  selector: 'app-documento-a-pdf',
  imports: [FileQueueComponent, ResultListComponent, ToolControlsComponent, ToolPageComponent],
  templateUrl: './documento-a-pdf.component.html',
})
export class DocumentoAPdfComponent extends PaginaHerramienta {
  protected readonly slug = 'documento-a-pdf';
  protected override get mensajeExito(): string {
    return 'Documento convertido a PDF';
  }
}
