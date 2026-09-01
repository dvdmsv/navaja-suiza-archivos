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

/** Texto convertido que algunas herramientas devuelven para enseñarlo en pantalla. */
export interface VistaPrevia {
  texto: string;
  caracteres: number;
  palabras: number;
}

/** Un dato que un archivo lleva dentro sin que su dueño lo sepa. */
export interface CampoMetadato {
  /** Con la que se le dice al servidor que lo borre. */
  clave: string;
  etiqueta: string;
  valor: string;
}

/** Lo que "Limpiar metadatos" ha encontrado en un archivo. */
export interface MetadatosArchivo {
  /** Id del archivo en el servidor, para casar el informe con la selección. */
  id: string;
  archivo: string;
  campos: CampoMetadato[];
  /** Si lleva dentro dónde se hizo la foto. */
  ubicacion: boolean;
}

/** Respuesta de cualquier herramienta: siempre una lista de archivos. */
export interface Resultado {
  files: ArchivoServidor[];
  resumen?: ResumenTamano;
  vista_previa?: VistaPrevia;
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

  /**
   * Cuántas páginas tiene un archivo ya subido.
   *
   * Lo dice el servidor para que un selector de página no obligue a cargar
   * pdf.js en el navegador.
   */
  paginasDe(id: string): Observable<number> {
    return this.http
      .get<{ paginas: number }>(`/api/files/${id}/paginas`)
      .pipe(map(respuesta => respuesta.paginas));
  }

  /**
   * Cómo va a quedar una página, ya con lo que la herramienta le va a estampar.
   *
   * La dibuja el servidor con el mismo código que escribirá el archivo, así que
   * lo que se ve es lo que sale. Quien la pida se encarga de revocar el object
   * URL, igual que con `prepararFirma`.
   */
  previsualizar(slug: string, cuerpo: unknown): Observable<string> {
    return this.http
      .post(`/api/tools/${slug}/previsualizar`, cuerpo, { responseType: 'blob' })
      .pipe(map(blob => URL.createObjectURL(blob)));
  }

  /**
   * Qué metadatos llevan dentro unos archivos, sin tocarlos.
   *
   * Es la primera mitad de "Limpiar metadatos": primero se enseña lo que hay y
   * luego el usuario decide qué se borra.
   */
  inspeccionarMetadatos(ids: string[]): Observable<MetadatosArchivo[]> {
    return this.http
      .post<{ metadatos: MetadatosArchivo[] }>('/api/tools/limpiar-metadatos/inspeccionar',
                                               { file_ids: ids })
      .pipe(map(respuesta => respuesta.metadatos));
  }

  /**
   * El contenido de un archivo, para enseñarlo sin descargarlo.
   *
   * Va por HttpClient por lo mismo que `descargar`: la sesión viaja en una
   * cabecera, así que un `<iframe src="/api/…">` se quedaría fuera. Quien lo
   * pida se encarga de crear el object URL y de revocarlo.
   */
  contenido(archivo: ArchivoServidor): Observable<Blob> {
    return this.http.get(`/api/files/${archivo.id}/download`, { responseType: 'blob' });
  }

  /**
   * Cambia el nombre con el que se descargará un archivo. La extensión la
   * conserva el servidor, así que da igual si el nombre nuevo la lleva o no.
   */
  renombrar(id: string, nombre: string): Observable<ArchivoServidor> {
    return this.http.patch<ArchivoServidor>(`/api/files/${id}`, { name: nombre });
  }

  /** Elimina un archivo concreto del servidor. */
  eliminar(id: string): Observable<void> {
    return this.http.delete<void>(`/api/files/${id}`);
  }

  /**
   * Avisa al servidor de que la sesión sigue viva.
   *
   * El visor trabaja en el navegador: sin esto, una lectura larga acabaría con
   * los archivos borrados por inactividad justo cuando se va a guardar.
   */
  mantenerSesion(): Observable<void> {
    return this.http.post<void>('/api/session/keepalive', {});
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
