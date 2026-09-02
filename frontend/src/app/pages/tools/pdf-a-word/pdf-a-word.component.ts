import { Component } from '@angular/core';

import { FileQueueComponent } from '../../../shared/file-queue/file-queue.component';
import { PaginaHerramienta } from '../../../shared/pagina-herramienta';
import { ResultListComponent } from '../../../shared/result-list/result-list.component';
import { ToolControlsComponent } from '../../../shared/tool-controls/tool-controls.component';
import { ToolPageComponent } from '../../../shared/tool-page/tool-page.component';

@Component({
  selector: 'app-pdf-a-word',
  imports: [FileQueueComponent, ResultListComponent, ToolControlsComponent, ToolPageComponent],
  templateUrl: './pdf-a-word.component.html',
})
export class PdfAWordComponent extends PaginaHerramienta {
  protected readonly slug = 'pdf-a-word';
  protected override get mensajeExito(): string {
    return 'PDF convertido a Word';
  }
}
