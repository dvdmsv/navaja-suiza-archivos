import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';

import { Component, EventEmitter, Input, Output, ViewChild, ElementRef } from '@angular/core';

import { PesoPipe } from '../peso.pipe';

export type EstadoArchivo = 'local' | 'subiendo' | 'subido' | 'error';

/** Un archivo elegido por el usuario y su estado respecto al servidor. */
export interface ArchivoEnCola {
  file: File;
  estado: EstadoArchivo;
  /** Id que devuelve el servidor una vez subido. */
  id?: string;
}

export function aCola(archivos: File[]): ArchivoEnCola[] {
  return archivos.map(file => ({ file, estado: 'local' as const }));
}

/**
 * Selector de archivos reutilizable: arrastrar y soltar, lista con estado y,
 * opcionalmente, reordenación. Lo comparten todas las herramientas.
 *
 * El componente sólo gestiona la selección y el orden; subir los archivos es
 * responsabilidad de la herramienta que lo usa.
 */
@Component({
  selector: 'app-file-queue',
  imports: [DragDropModule, PesoPipe],
  templateUrl: './file-queue.component.html',
  styleUrl: './file-queue.component.css',
})
export class FileQueueComponent {
  @ViewChild('entrada') entrada!: ElementRef<HTMLInputElement>;

  /** Lista de archivos. El componente la modifica en sitio y avisa por `itemsChange`. */
  @Input() items: ArchivoEnCola[] = [];
  /** Filtro del selector nativo, p. ej. `.pdf` o `image/*`. */
  @Input() accept = '';
  @Input() multiple = true;
  /** Permite arrastrar para cambiar el orden (relevante en "unir PDF"). */
  @Input() ordenable = false;
  @Input() deshabilitado = false;
  @Input() ayuda = 'Arrastra tus archivos aquí o haz clic para elegirlos';

  @Output() itemsChange = new EventEmitter<ArchivoEnCola[]>();
  /** Se emite sólo con los archivos recién añadidos. */
  @Output() agregados = new EventEmitter<ArchivoEnCola[]>();

  arrastrando = false;

  /**
   * `accept` viene sin espacios (".pdf,.docx,…") y el navegador lo trata como
   * una sola palabra: con muchos formatos se sale de la caja en el móvil.
   */
  get formatosLegibles(): string {
    return this.accept.split(',').map(formato => formato.trim()).join(', ');
  }

  abrirSelector(): void {
    if (!this.deshabilitado) {
      this.entrada.nativeElement.click();
    }
  }

  alSeleccionar(evento: Event): void {
    const input = evento.target as HTMLInputElement;
    this.incorporar(Array.from(input.files ?? []));
    // Permite volver a elegir el mismo archivo tras quitarlo de la lista.
    input.value = '';
  }

  alArrastrarEncima(evento: DragEvent): void {
    evento.preventDefault();
    if (!this.deshabilitado) {
      this.arrastrando = true;
    }
  }

  alSalirArrastre(evento: DragEvent): void {
    evento.preventDefault();
    this.arrastrando = false;
  }

  alSoltar(evento: DragEvent): void {
    evento.preventDefault();
    this.arrastrando = false;
    if (!this.deshabilitado) {
      this.incorporar(Array.from(evento.dataTransfer?.files ?? []));
    }
  }

  quitar(indice: number): void {
    this.items.splice(indice, 1);
    this.itemsChange.emit(this.items);
  }

  reordenar(evento: CdkDragDrop<ArchivoEnCola[]>): void {
    moveItemInArray(this.items, evento.previousIndex, evento.currentIndex);
    this.itemsChange.emit(this.items);
  }

  /** Añade sólo lo que encaja con `accept` y no estaba ya en la lista. */
  private incorporar(archivos: File[]): void {
    const admitidos = archivos.filter(file => this.encaja(file) && !this.yaEsta(file));
    if (admitidos.length === 0) {
      return;
    }
    const nuevos = aCola(this.multiple ? admitidos : admitidos.slice(0, 1));
    if (!this.multiple) {
      this.items.length = 0;
    }
    this.items.push(...nuevos);
    this.itemsChange.emit(this.items);
    this.agregados.emit(nuevos);
  }

  private yaEsta(file: File): boolean {
    return this.items.some(item => item.file.name === file.name && item.file.size === file.size);
  }

  /** Comprueba el archivo contra `accept` (extensiones y/o tipos MIME). */
  private encaja(file: File): boolean {
    if (!this.accept.trim()) {
      return true;
    }
    const nombre = file.name.toLowerCase();
    return this.accept.split(',').map(p => p.trim().toLowerCase()).some(patron => {
      if (patron.startsWith('.')) {
        return nombre.endsWith(patron);
      }
      if (patron.endsWith('/*')) {
        return file.type.startsWith(patron.slice(0, -1));
      }
      return file.type === patron;
    });
  }
}
