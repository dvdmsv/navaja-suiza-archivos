import Swal from 'sweetalert2';

/**
 * Avisos de la aplicación, con un aspecto único para todas las herramientas.
 * Los aciertos son discretos (un aviso que se va solo); los errores piden
 * atención y muestran el mensaje que devuelve el servidor.
 */

export function avisoExito(texto: string): void {
  Swal.fire({
    toast: true,
    position: 'top-end',
    icon: 'success',
    title: texto,
    showConfirmButton: false,
    timer: 2200,
    timerProgressBar: true,
  });
}

export function avisoError(texto: string): void {
  Swal.fire({ icon: 'error', title: 'Algo ha fallado', text: texto, confirmButtonText: 'Entendido' });
}

export function aviso(texto: string): void {
  Swal.fire({ icon: 'info', text: texto, confirmButtonText: 'Vale' });
}

/** Extrae el mensaje útil de un error HTTP, con un texto de respaldo. */
export function mensajeDeError(err: unknown, respaldo: string): string {
  const detalle = (err as { error?: { error?: string } })?.error?.error;
  return typeof detalle === 'string' && detalle ? detalle : respaldo;
}
