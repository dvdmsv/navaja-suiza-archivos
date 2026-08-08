import { NgFor, NgIf } from '@angular/common';
import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

import { CATEGORIAS, Categoria, HERRAMIENTAS, Herramienta, rutaDe } from '../../core/tools';

interface Grupo {
  categoria: Categoria;
  herramientas: Herramienta[];
}

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [NgFor, NgIf, RouterLink],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css',
})
export class HomeComponent {
  readonly grupos: Grupo[] = CATEGORIAS.map(categoria => ({
    categoria,
    herramientas: HERRAMIENTAS.filter(h => h.categoria === categoria),
  })).filter(grupo => grupo.herramientas.length > 0);

  rutaDe(herramienta: Herramienta): string {
    return rutaDe(herramienta);
  }
}
