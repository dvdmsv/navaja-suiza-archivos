import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AppComponent } from './app.component';
import { HERRAMIENTAS, agruparPorCategoria } from './core/tools';

describe('AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('se crea', () => {
    expect(TestBed.createComponent(AppComponent).componentInstance).toBeTruthy();
  });

  it('lista en el menú todas las herramientas disponibles, agrupadas por categoría', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();

    const enlaces = fixture.nativeElement.querySelectorAll('#menuPrincipal .nav-link');
    // El menú las ordena por sección, no por el orden del catálogo.
    const esperadas = agruparPorCategoria().flatMap(grupo => grupo.herramientas);

    expect(esperadas.length).toBe(HERRAMIENTAS.filter(h => h.disponible).length);
    expect(enlaces.length).toBe(esperadas.length);
    esperadas.forEach((herramienta, i) => {
      expect(enlaces[i].textContent).toContain(herramienta.nombre);
    });
  });

  it('hay un botón por sección y ninguna empieza desplegada', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();

    const secciones = fixture.nativeElement.querySelectorAll('.seccion__boton');
    expect(secciones.length).toBe(agruparPorCategoria().length);
    secciones.forEach((boton: HTMLElement) => {
      expect(boton.getAttribute('aria-expanded')).toBe('false');
      // Sin `aria-controls` el lector de pantalla no sabe qué panel abre.
      expect(boton.getAttribute('aria-controls')).toBeTruthy();
    });
  });
});
