import { HttpClient, HttpEvent, HttpEventType } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, filter, map } from 'rxjs';

/** Archivo tal y como lo describe el servidor. */
export interface ArchivoServidor {
  id: string;
  name: string;
  size: number;
  generated: boolean;
}

/** Comparación de peso antes y después, cuando la herramienta la aporta. */
export interface ResumenTamano {
  antes: number;
  despues: number;
}

/** Respuesta de cualquier herramienta: siempre una lista de archivos. */
export interface Resultado {
  files: ArchivoServidor[];
  resumen?: ResumenTamano;
}

/** Formato de imagen ofrecido por el servidor. */
export interface FormatoImagen {
  id: string;
  extension: string;
  nombre: string;
  calidad: boolean;
}

/** Progreso de una subida, o el resultado cuando ya ha terminado. */
export type ProgresoSubida =
  | { tipo: 'progreso'; porcentaje: number }
  | { tipo: 'hecho'; archivos: ArchivoServidor[] };

/**
 * Única puerta de entrada a la API. Todas las herramientas la usan; la cabecera
 * de sesión la añade `sessionInterceptor`, aquí no hace falta pensar en ella.
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
  constructor(private http: HttpClient) {}

  /** Sube archivos y va emitiendo el progreso hasta terminar. */
  subir(archivos: File[]): Observable<ProgresoSubida> {
    const formData = new FormData();
    archivos.forEach(archivo => formData.append('files', archivo));

    return this.http
      .post<{ files: ArchivoServidor[] }>('/api/files', formData, {
        observe: 'events',
        reportProgress: true,
      })
      .pipe(
        map(evento => this.aProgreso(evento)),
        filter((estado): estado is ProgresoSubida => estado !== null)
      );
  }

  /** Ejecuta una herramienta del servidor sobre archivos ya subidos. */
  ejecutar(slug: string, cuerpo: unknown): Observable<Resultado> {
    return this.http.post<Resultado>(`/api/tools/${slug}`, cuerpo);
  }

  /** Empaqueta varios resultados en un ZIP y devuelve el archivo creado. */
  empaquetar(ids: string[], nombre: string): Observable<ArchivoServidor> {
    return this.http
      .post<Resultado>('/api/files/zip', { file_ids: ids, name: nombre })
      .pipe(map(respuesta => respuesta.files[0]));
  }

  /**
   * Formatos disponibles en esta instalación del servidor. Cada herramienta
   * ofrece los suyos: "pdf-a-imagen" no incluye PDF, por ejemplo.
   */
  formatosDeImagen(slug = 'convertir-imagen'): Observable<FormatoImagen[]> {
    return this.http
      .get<{ formatos: FormatoImagen[] }>(`/api/tools/${slug}/formatos`)
      .pipe(map(respuesta => respuesta.formatos));
  }

  /**
   * Firma ya procesada (fondo recortado), como URL lista para un `<img>`.
   *
   * La prepara el servidor y no el navegador para que la vista previa enseñe
   * exactamente los píxeles que se van a estampar en el documento.
   */
  prepararFirma(id: string, quitarFondo: boolean, umbral: number): Observable<string> {
    return this.http
      .post('/api/tools/firmar/preparar',
            { firma_id: id, quitar_fondo: quitarFondo, umbral },
            { responseType: 'blob' })
      .pipe(map(blob => URL.createObjectURL(blob)));
  }

  /**
   * Descarga un archivo. Va por HttpClient (y no por `window.open`) porque la
   * petición necesita la cabecera de sesión, que una navegación no envía.
   */
  descargar(archivo: ArchivoServidor): Observable<void> {
    return this.http
      .get(`/api/files/${archivo.id}/download`, { responseType: 'blob' })
      .pipe(map(blob => guardarComo(blob, archivo.name)));
  }

  /** Elimina un archivo concreto del servidor. */
  eliminar(id: string): Observable<void> {
    return this.http.delete<void>(`/api/files/${id}`);
  }

  /** Borra todos los archivos de esta sesión. */
  limpiarSesion(): Observable<void> {
    return this.http.delete<void>('/api/session');
  }

  private aProgreso(evento: HttpEvent<{ files: ArchivoServidor[] }>): ProgresoSubida | null {
    if (evento.type === HttpEventType.UploadProgress && evento.total) {
      return { tipo: 'progreso', porcentaje: Math.round((100 * evento.loaded) / evento.total) };
    }
    if (evento.type === HttpEventType.Response && evento.body) {
      return { tipo: 'hecho', archivos: evento.body.files };
    }
    return null;
  }
}

/** Dispara la descarga del blob en el navegador con el nombre original. */
function guardarComo(blob: Blob, nombre: string): void {
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  enlace.click();
  URL.revokeObjectURL(url);
}
