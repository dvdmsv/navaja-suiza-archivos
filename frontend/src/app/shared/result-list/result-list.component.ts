import { NgFor, NgIf } from '@angular/common';
import { Component, ElementRef, Input, OnChanges, ViewChild, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { ApiService, ArchivoServidor, ResumenTamano } from '../../core/api.service';
import { PesoPipe } from '../peso.pipe';
import { avisoError, mensajeDeError } from '../notify';

/**
 * Resultados de una herramienta: renombrar antes de descargar, descarga
 * individual, descarga de todo en un ZIP y, si la herramienta lo aporta,
 * cuánto se ha ahorrado.
 *
 * Al ser común a todas las herramientas, lo que se añada aquí lo tienen todas.
 */
@Component({
  selector: 'app-result-list',
  standalone: true,
  imports: [NgFor, NgIf, FormsModule, PesoPipe],
  templateUrl: './result-list.component.html',
  styleUrl: './result-list.component.css',
})
export class ResultListComponent implements OnChanges {
  private readonly api = inject(ApiService);

  @ViewChild('entradaNombre') entradaNombre?: ElementRef<HTMLInputElement>;

  @Input() archivos: ArchivoServidor[] = [];
  @Input() resumen: ResumenTamano | null = null;
  /** Nombre propuesto para el ZIP cuando hay varios archivos. */
  @Input() nombreZip = 'resultados.zip';

  empaquetando = false;

  /** Id del archivo que se está renombrando, si hay alguno. */
  editando: string | null = null;
  borrador = '';
  guardando = false;

  /** Nombre del ZIP, sin la extensión: el usuario puede cambiarlo. */
  nombreDelZip = '';

  /** Cada tanda de resultados vuelve a proponer el nombre de su herramienta. */
  ngOnChanges(): void {
    this.nombreDelZip = sinExtension(this.nombreZip);
    this.editando = null;
  }

  /** Porcentaje ahorrado; null si no hubo ahorro o no hay datos. */
  get ahorro(): number | null {
    if (!this.resumen?.antes) {
      return null;
    }
    const porcentaje = Math.round(100 * (1 - this.resumen.despues / this.resumen.antes));
    return porcentaje > 0 ? porcentaje : null;
  }

  // --- renombrado -------------------------------------------------------

  extensionDe(archivo: ArchivoServidor): string {
    const punto = archivo.name.lastIndexOf('.');
    return punto > 0 ? archivo.name.slice(punto) : '';
  }

  editar(archivo: ArchivoServidor): void {
    this.editando = archivo.id;
    // Sólo se edita el nombre: la extensión la decide la herramienta.
    this.borrador = sinExtension(archivo.name);
    setTimeout(() => this.entradaNombre?.nativeElement.select());
  }

  cancelar(): void {
    this.editando = null;
  }

  confirmar(archivo: ArchivoServidor): void {
    const nombre = this.borrador.trim();
    if (!nombre || nombre === sinExtension(archivo.name)) {
      this.cancelar();
      return;
    }
    this.guardando = true;
    this.api.renombrar(archivo.id, nombre).subscribe({
      next: renombrado => {
        // El servidor devuelve el nombre ya saneado: es el que vale.
        archivo.name = renombrado.name;
        this.guardando = false;
        this.editando = null;
      },
      error: err => {
        this.guardando = false;
        avisoError(mensajeDeError(err, 'No se ha podido cambiar el nombre.'));
      },
    });
  }

  // --- descarga ---------------------------------------------------------

  descargar(archivo: ArchivoServidor): void {
    this.api.descargar(archivo).subscribe({
      error: err => avisoError(mensajeDeError(err, 'No se ha podido descargar el archivo.')),
    });
  }

  descargarTodo(): void {
    this.empaquetando = true;
    const ids = this.archivos.map(archivo => archivo.id);

    this.api.empaquetar(ids, `${this.nombreDelZip.trim() || 'resultados'}.zip`).subscribe({
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

function sinExtension(nombre: string): string {
  const punto = nombre.lastIndexOf('.');
  return punto > 0 ? nombre.slice(0, punto) : nombre;
}
