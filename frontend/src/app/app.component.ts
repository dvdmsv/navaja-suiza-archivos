import { Component } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';

import { MenuPrincipalComponent } from './shared/menu-principal/menu-principal.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, MenuPrincipalComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent {
  readonly anio = new Date().getFullYear();

  /**
   * Estado del menú en pantallas estrechas. Lo lleva Angular y no el JavaScript
   * de Bootstrap, que no se carga: sólo se usaba para esto.
   */
  menuAbierto = false;
}
