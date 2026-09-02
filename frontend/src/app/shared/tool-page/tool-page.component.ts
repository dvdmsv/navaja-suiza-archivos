import { NgIf } from '@angular/common';
import { Component, Input, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';

import { Herramienta, buscarPorSlug } from '../../core/tools';

/**
 * Marco común de todas las páginas de herramienta: migas de pan, título y
 * descripción sacados del catálogo. El contenido concreto llega por proyección.
 */
@Component({
  selector: 'app-tool-page',
  imports: [NgIf, RouterLink],
  template: `
    <div class="contenido-estrecho">
      <nav aria-label="Ruta de navegación">
        <ol class="breadcrumb small">
          <li class="breadcrumb-item"><a routerLink="/">Inicio</a></li>
          <li class="breadcrumb-item active" aria-current="page">{{ herramienta?.nombre }}</li>
        </ol>
      </nav>

      <header class="mb-4" *ngIf="herramienta as h">
        <h1 class="h3 d-flex align-items-center gap-2">
          <i class="bi {{ h.icono }} text-primary"></i>{{ h.nombre }}
        </h1>
        <p class="text-body-secondary mb-0">{{ h.descripcion }}</p>
      </header>

      <ng-content></ng-content>
    </div>
  `,
})
export class ToolPageComponent implements OnInit {
  /** Slug de la herramienta en `core/tools.ts`. */
  @Input({ required: true }) slug!: string;

  herramienta?: Herramienta;

  ngOnInit(): void {
    this.herramienta = buscarPorSlug(this.slug);
  }
}
