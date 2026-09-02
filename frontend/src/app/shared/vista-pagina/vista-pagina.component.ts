import { NgFor, NgIf } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';

/**
 * Cómo va a quedar una página, con su selector para ver cualquier otra.
 *
 * La imagen la dibuja el servidor: es la página de verdad con lo que se le va a
 * estampar, no una imitación. Así lo que se ve aquí es lo que sale en el
 * archivo, y estas herramientas no tienen que cargar pdf.js.
 */
@Component({
  selector: 'app-vista-pagina',
  imports: [NgFor, NgIf, FormsModule],
  templateUrl: './vista-pagina.component.html',
  styleUrl: './vista-pagina.component.css',
})
export class VistaPaginaComponent {
  @Input() imagen = '';
  @Input() paginas = 0;
  @Input() pagina = 1;
  @Input() cargando = false;
  @Input() deshabilitado = false;
  @Output() paginaChange = new EventEmitter<number>();

  get numeros(): number[] {
    return Array.from({ length: this.paginas }, (_, i) => i + 1);
  }
}
