
import { Component, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { FileQueueComponent } from '../../../shared/file-queue/file-queue.component';
import { PaginaHerramienta } from '../../../shared/pagina-herramienta';
import { ResultListComponent } from '../../../shared/result-list/result-list.component';
import { ToolControlsComponent } from '../../../shared/tool-controls/tool-controls.component';
import { ToolPageComponent } from '../../../shared/tool-page/tool-page.component';
import { avisoError, avisoExito } from '../../../shared/notify';
import { copiarAlPortapapeles } from '../../../shared/portapapeles';

/** Regla de andar por casa para estimar tokens a partir de caracteres. */
const CARACTERES_POR_TOKEN = 4;

@Component({
  selector: 'app-a-markdown',
  imports: [FormsModule, FileQueueComponent, ResultListComponent, ToolControlsComponent, ToolPageComponent],
  templateUrl: './a-markdown.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './a-markdown.component.css',
})
export class AMarkdownComponent extends PaginaHerramienta {
  protected readonly slug = 'a-markdown';
  protected override get mensajeExito(): string {
    return 'Documentos convertidos';
  }

  unir = false;

  protected override opciones(): Record<string, unknown> {
    return { unir: this.unir };
  }

  /** Para saber de un vistazo si el texto le cabe al modelo. */
  get tokensAproximados(): number {
    return Math.ceil((this.vistaPrevia?.caracteres ?? 0) / CARACTERES_POR_TOKEN);
  }

  async copiar(): Promise<void> {
    const texto = this.vistaPrevia?.texto;
    if (!texto) {
      return;
    }
    try {
      await copiarAlPortapapeles(texto);
      avisoExito('Markdown copiado');
    } catch {
      avisoError('El navegador no ha dejado copiar. Descarga el archivo o selecciona el texto a mano.');
    }
  }
}
