import { NgFor, NgIf } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { ArchivoEnCola, FileQueueComponent } from '../../../shared/file-queue/file-queue.component';
import { PaginaHerramienta } from '../../../shared/pagina-herramienta';
import { ResultListComponent } from '../../../shared/result-list/result-list.component';
import { ToolControlsComponent } from '../../../shared/tool-controls/tool-controls.component';
import { ToolPageComponent } from '../../../shared/tool-page/tool-page.component';

interface Opcion { id: string; nombre: string; }

@Component({
  selector: 'app-marca-de-agua',
  standalone: true,
  imports: [NgFor, NgIf, FormsModule, FileQueueComponent, ResultListComponent,
            ToolControlsComponent, ToolPageComponent],
  templateUrl: './marca-de-agua.component.html',
  styleUrl: './marca-de-agua.component.css',
})
export class MarcaDeAguaComponent extends PaginaHerramienta {
  protected readonly slug = 'marca-de-agua';
  protected override get mensajeExito(): string {
    return 'Marca de agua puesta';
  }

  readonly fuentes: Opcion[] = [
    { id: 'sans', nombre: 'Sans' },
    { id: 'serif', nombre: 'Serif' },
    { id: 'mono', nombre: 'Mono' },
  ];
  readonly colores: Opcion[] = [
    { id: 'negro', nombre: 'Negro' },
    { id: 'azul', nombre: 'Azul' },
    { id: 'rojo', nombre: 'Rojo' },
  ];

  modo: 'texto' | 'imagen' = 'texto';

  texto = 'BORRADOR';
  fuente = 'sans';
  color = 'negro';
  negrita = true;
  tamano = 48;

  /** La imagen va en su propia cola: no es uno de los `file_ids`. */
  imagenes: ArchivoEnCola[] = [];
  ancho = 40;

  opacidad = 25;
  giro = 45;
  mosaico = false;
  encima = true;

  override get listo(): boolean {
    if (!super.listo) {
      return false;
    }
    return this.modo === 'texto' ? this.texto.trim().length > 0 : this.imagenId !== '';
  }

  get imagenId(): string {
    return this.imagenes.find(item => item.estado === 'subido')?.id ?? '';
  }

  protected override opciones(): Record<string, unknown> {
    const comunes = {
      modo: this.modo, opacidad: this.opacidad, giro: this.giro,
      mosaico: this.mosaico, encima: this.encima,
    };
    if (this.modo === 'texto') {
      return { ...comunes, texto: this.texto.trim(), fuente: this.fuente,
               color: this.color, negrita: this.negrita, tamano: this.tamano };
    }
    return { ...comunes, imagen_id: this.imagenId, ancho: this.ancho / 100 };
  }

  cambiarModo(modo: 'texto' | 'imagen'): void {
    this.modo = modo;
    this.alCambiarLista();
  }

  elegir(campo: 'fuente' | 'color', id: string): void {
    this[campo] = id;
    this.alCambiarLista();
  }

  alAgregarImagen(nuevos: ArchivoEnCola[]): void {
    this.alCambiarLista();
    this.subir(nuevos);
  }
}
