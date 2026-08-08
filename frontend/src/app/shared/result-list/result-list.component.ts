import { NgFor, NgIf } from '@angular/common';
import { Component, Input, inject } from '@angular/core';

import { ApiService, ArchivoServidor, ResumenTamano } from '../../core/api.service';
import { PesoPipe } from '../peso.pipe';
import { avisoError, mensajeDeError } from '../notify';

/**
 * Resultados de una herramienta: descarga individual, descarga de todo en un
 * ZIP y, si la herramienta lo aporta, cuánto se ha ahorrado.
 */
@Component({
  selector: 'app-result-list',
  standalone: true,
  imports: [NgFor, NgIf, PesoPipe],
  templateUrl: './result-list.component.html',
  styleUrl: './result-list.component.css',
})
export class ResultListComponent {
  private readonly api = inject(ApiService);

  @Input() archivos: ArchivoServidor[] = [];
  @Input() resumen: ResumenTamano | null = null;
  /** Nombre del ZIP cuando hay varios archivos. */
  @Input() nombreZip = 'resultados.zip';

  empaquetando = false;

  /** Porcentaje ahorrado; null si no hubo ahorro o no hay datos. */
  get ahorro(): number | null {
    if (!this.resumen?.antes) {
      return null;
    }
    const porcentaje = Math.round(100 * (1 - this.resumen.despues / this.resumen.antes));
    return porcentaje > 0 ? porcentaje : null;
  }

  descargar(archivo: ArchivoServidor): void {
    this.api.descargar(archivo).subscribe({
      error: err => avisoError(mensajeDeError(err, 'No se ha podido descargar el archivo.')),
    });
  }

  descargarTodo(): void {
    this.empaquetando = true;
    const ids = this.archivos.map(archivo => archivo.id);

    this.api.empaquetar(ids, this.nombreZip).subscribe({
      next: zip => {
        this.empaquetando = false;
        this.descargar(zip);
      },
      error: err => {
        this.empaquetando = false;
        avisoError(mensajeDeError(err, 'No se ha podido preparar el ZIP.'));
      },
    });
  }
}
