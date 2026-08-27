import { NgFor, NgIf } from '@angular/common';
import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

import { Grupo, Herramienta, agruparPorCategoria, rutaDe } from '../../core/tools';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [NgFor, NgIf, RouterLink],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css',
})
export class HomeComponent {
  /** La portada sí anuncia las herramientas que aún no están listas. */
  readonly grupos: Grupo[] = agruparPorCategoria(true);

  rutaDe(herramienta: Herramienta): string {
    return rutaDe(herramienta);
  }
}
