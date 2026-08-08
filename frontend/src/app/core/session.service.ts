import { Injectable } from '@angular/core';

const CLAVE = 'toolbox.session';

/**
 * Identidad anónima del navegador.
 *
 * El servidor guarda los archivos en una carpeta por sesión, así que este id es
 * lo único que separa tus archivos de los de otra persona. Se genera en el
 * cliente y se conserva entre visitas; no identifica a nadie.
 */
@Injectable({ providedIn: 'root' })
export class SessionService {
  readonly id: string = this.cargarOCrear();

  /** Descarta el id actual y empieza de cero (los archivos del servidor quedan huérfanos y caducan solos). */
  renovar(): string {
    const nuevo = this.generarId();
    this.guardar(nuevo);
    return nuevo;
  }

  private cargarOCrear(): string {
    const guardado = this.leer();
    if (guardado && /^[0-9a-f]{32}$/.test(guardado)) {
      return guardado;
    }
    const nuevo = this.generarId();
    this.guardar(nuevo);
    return nuevo;
  }

  /** uuid v4 sin guiones: el formato exacto que valida el backend. */
  private generarId(): string {
    // randomUUID sólo existe en contextos seguros (https o localhost).
    if (typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID().replace(/-/g, '');
    }
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  }

  private leer(): string | null {
    try {
      return localStorage.getItem(CLAVE);
    } catch {
      return null; // modo privado o almacenamiento bloqueado
    }
  }

  private guardar(id: string): void {
    try {
      localStorage.setItem(CLAVE, id);
    } catch {
      /* sin persistencia: la sesión durará lo que dure la pestaña */
    }
  }
}
