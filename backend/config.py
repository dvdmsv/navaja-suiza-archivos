"""Configuración de la aplicación, ajustable por variables de entorno.

Los valores por defecto son prudentes: están para que la aplicación arranque en
cualquier máquina sin configurar nada, no porque sean los correctos para la tuya.
Si tu servidor da para más, `.env.example` explica cuáles subir y con qué
criterio.

Los límites que dependen de la máquina viven junto al código que los usa —cada
uno lleva al lado el comentario que explica por qué existe— y se leen desde aquí
con `entorno_entero`. La lista completa está en el README.
"""
import os
import sys


def entorno_entero(nombre: str, defecto: int, minimo: int = 1) -> int:
    """Un entero que se puede ajustar por variable de entorno.

    Un valor absurdo no tumba el arranque: se avisa por la salida de error y se
    sigue con el valor por defecto. Que el servidor no levante por una errata en
    una variable es peor que ignorarla diciéndolo.
    """
    crudo = os.environ.get(nombre)
    if crudo is None or crudo.strip() == '':
        return defecto
    try:
        valor = int(crudo)
    except ValueError:
        print(f'Aviso: {nombre}={crudo!r} no es un número; se usa {defecto}.',
              file=sys.stderr)
        return defecto
    if valor < minimo:
        print(f'Aviso: {nombre}={valor} es menor que el mínimo {minimo}; '
              f'se usa {minimo}.', file=sys.stderr)
        return minimo
    return valor


# Carpeta raíz donde vive el almacenamiento temporal de todas las sesiones.
UPLOAD_ROOT = os.environ.get('UPLOAD_ROOT', 'uploads')

# Tamaño máximo de una petición completa (suma de todos los archivos).
# Ojo: nginx tiene su propio `client_max_body_size` y manda el más bajo de los dos.
MAX_CONTENT_LENGTH = entorno_entero('MAX_CONTENT_LENGTH_MB', 200) * 1024 * 1024

# Tiempo que sobreviven los archivos de una sesión sin actividad.
SESSION_TTL_SECONDS = entorno_entero('SESSION_TTL_MINUTES', 120) * 60

# Cada cuánto se pasa el recolector de sesiones caducadas.
CLEANUP_INTERVAL_SECONDS = entorno_entero('CLEANUP_INTERVAL_MINUTES', 15) * 60

# Autoridad de sellado de tiempo para "Firmar con certificado".
#
# Sólo se usa cuando el usuario marca la casilla: sella la firma con la hora de
# un tercero, de modo que siga verificándose cuando su certificado caduque. Lo
# único que viaja hasta aquí es un resumen (hash) de la firma; el documento no
# sale de esta máquina. Es la única llamada saliente de todo el backend.
TSA_URL = os.environ.get('TSA_URL', 'https://freetsa.org/tsr')
TSA_TIMEOUT = entorno_entero('TSA_TIMEOUT_SECONDS', 15)
