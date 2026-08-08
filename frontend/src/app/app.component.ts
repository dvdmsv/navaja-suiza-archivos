import { NgFor } from '@angular/common';
import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { HERRAMIENTAS, Herramienta, rutaDe } from './core/tools';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [NgFor, RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent {
  readonly anio = new Date().getFullYear();
  /** Sólo las operativas aparecen en el menú; el resto vive en la portada. */
  readonly herramientas = HERRAMIENTAS.filter(h => h.disponible);

  rutaDe(herramienta: Herramienta): string {
    return rutaDe(herramienta);
  }
}
