"""Conversiones que corren como proceso aparte.

Las herramientas que llaman a un programa externo pesado —LibreOffice y
pdf2docx— comparten aquí dos cosas:

- **El turno**: sólo una conversión de estas a la vez en todo el proceso. El
  servidor atiende con cuatro hilos y el contenedor vive con poca memoria;
  cuatro LibreOffice arrancando a la vez lo matan. Quien llega y lo encuentra
  ocupado espera un rato corto y, si no le llega el turno, se le dice que
  vuelva en un momento en vez de dejarle colgado hasta que nginx corte.
- **La traducción de fallos** a `ApiError`, para que falte el programa o se
  agote el tiempo y el usuario lea algo entendible.
"""
import subprocess
import threading

from flask import current_app

from errors import ApiError

_turno = threading.BoundedSemaphore(1)

# Cuánto se espera a que quede libre el turno. Sumado al tiempo máximo de una
# conversión tiene que caber en el plazo de gunicorn (300 s).
ESPERA_MAXIMA = 45


def ejecutar(orden: list[str], tiempo_limite: int, programa: str,
             no_disponible: str) -> subprocess.CompletedProcess:
    """Lanza el programa y devuelve su resultado, esperando su turno.

    `no_disponible` es lo que se le dice al usuario si el programa no está
    instalado en esta máquina, que en desarrollo pasa constantemente.
    """
    if not _turno.acquire(timeout=ESPERA_MAXIMA):
        raise ApiError('El servidor está ocupado con otra conversión. '
                       'Inténtalo de nuevo en un momento.', 503)
    try:
        return subprocess.run(orden, capture_output=True, text=True, timeout=tiempo_limite)
    except FileNotFoundError as err:  # falta el programa en la imagen
        current_app.logger.error('%s no está instalado: %s', programa, err)
        raise ApiError(no_disponible, 500) from err
    except subprocess.TimeoutExpired as err:
        raise ApiError(
            f'La conversión ha tardado más de {-(-tiempo_limite // 60)} minutos y se ha '
            'cancelado. Prueba con un documento más corto.', 504) from err
    finally:
        _turno.release()
