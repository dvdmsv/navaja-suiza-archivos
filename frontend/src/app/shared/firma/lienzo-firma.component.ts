import { NgFor, NgIf } from '@angular/common';
import { Component, ElementRef, EventEmitter, Input, Output, ViewChild } from '@angular/core';

import { ANCHO_MAXIMO, ANCHO_MINIMO, Colocacion, entre } from './colocacion';

type Modo = 'mover' | 'escalar' | 'rotar';

interface Gesto {
  modo: Modo;
  /** Caja del lienzo en píxeles de pantalla, congelada al empezar el gesto. */
  caja: DOMRect;
  centro: { x: number; y: number };
  inicio: Colocacion;
  puntero: { x: number; y: number };
  distancia: number;
  angulo: number;
}

/**
 * La página con la firma encima, colocable con el ratón, el dedo o el lápiz.
 *
 * Todo se guarda en fracciones de la página (centro, anchura y giro), así que
 * lo que se ve aquí es exactamente lo que compone el servidor, sin importar a
 * qué tamaño se esté viendo la vista previa.
 */
@Component({
  selector: 'app-lienzo-firma',
  imports: [NgFor, NgIf],
  templateUrl: './lienzo-firma.component.html',
  styleUrl: './lienzo-firma.component.css',
})
export class LienzoFirmaComponent {
  @ViewChild('lienzo') lienzoRef!: ElementRef<HTMLElement>;

  /** Página del documento ya renderizada. */
  @Input({ required: true }) fondo!: string;
  /** Firma preparada por el servidor, con el fondo ya recortado. */
  @Input() firma?: string;
  @Input({ required: true }) colocacion!: Colocacion;
  @Input() deshabilitado = false;
  /**
   * Si se puede girar la estampa. Un campo de firma de un PDF va siempre
   * alineado con la página, así que "Firmar con certificado" lo apaga.
   */
  @Input() giratorio = true;

  /** Se emite al soltar: la colocación cambió y el resultado anterior ya no vale. */
  @Output() colocada = new EventEmitter<void>();

  readonly esquinas = ['no', 'ne', 'so', 'se'];

  private gesto: Gesto | null = null;

  empezar(evento: PointerEvent, modo: Modo): void {
    if (this.deshabilitado || !this.firma) {
      return;
    }
    evento.preventDefault();
    evento.stopPropagation();
    (evento.target as Element).setPointerCapture(evento.pointerId);

    const caja = this.lienzoRef.nativeElement.getBoundingClientRect();
    const centro = {
      x: caja.left + this.colocacion.x * caja.width,
      y: caja.top + this.colocacion.y * caja.height,
    };
    const dx = evento.clientX - centro.x;
    const dy = evento.clientY - centro.y;

    this.gesto = {
      modo,
      caja,
      centro,
      inicio: { ...this.colocacion },
      puntero: { x: evento.clientX, y: evento.clientY },
      distancia: Math.hypot(dx, dy) || 1,
      angulo: Math.atan2(dy, dx),
    };
  }

  mover(evento: PointerEvent): void {
    const gesto = this.gesto;
    if (!gesto) {
      return;
    }
    evento.preventDefault();

    if (gesto.modo === 'mover') {
      this.colocacion.x = entre(
        gesto.inicio.x + (evento.clientX - gesto.puntero.x) / gesto.caja.width, 0, 1);
      this.colocacion.y = entre(
        gesto.inicio.y + (evento.clientY - gesto.puntero.y) / gesto.caja.height, 0, 1);
      return;
    }

    if (gesto.modo === 'escalar') {
      // Se escala por la distancia al centro: así funciona igual con la firma girada.
      const distancia = Math.hypot(evento.clientX - gesto.centro.x, evento.clientY - gesto.centro.y);
      this.colocacion.ancho = entre(
        gesto.inicio.ancho * (distancia / gesto.distancia), ANCHO_MINIMO, ANCHO_MAXIMO);
      return;
    }

    const angulo = Math.atan2(evento.clientY - gesto.centro.y, evento.clientX - gesto.centro.x);
    const grados = gesto.inicio.rotacion + ((angulo - gesto.angulo) * 180) / Math.PI;
    // Normalizado a [-180, 180], que es el rango que admite el servidor.
    this.colocacion.rotacion = Math.round((((grados + 180) % 360) + 360) % 360 - 180);
  }

  soltar(): void {
    if (this.gesto) {
      this.gesto = null;
      this.colocada.emit();
    }
  }

  get transformacion(): string {
    return `translate(-50%, -50%) rotate(${this.colocacion.rotacion}deg)`;
  }
}
