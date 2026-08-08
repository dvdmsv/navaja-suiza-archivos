import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AppComponent } from './app.component';
import { HERRAMIENTAS } from './core/tools';

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

  it('sólo lista en el menú las herramientas disponibles', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();

    const enlaces = fixture.nativeElement.querySelectorAll('#menuPrincipal .nav-link');
    const esperadas = HERRAMIENTAS.filter(h => h.disponible);

    expect(enlaces.length).toBe(esperadas.length);
    esperadas.forEach((herramienta, i) => {
      expect(enlaces[i].textContent).toContain(herramienta.nombre);
    });
  });
});
