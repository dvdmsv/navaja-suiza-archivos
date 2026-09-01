"""Configuración de la aplicación, ajustable por variables de entorno."""
import os

# Carpeta raíz donde vive el almacenamiento temporal de todas las sesiones.
UPLOAD_ROOT = os.environ.get('UPLOAD_ROOT', 'uploads')

# Tamaño máximo de una petición completa (suma de todos los archivos).
MAX_CONTENT_LENGTH = int(os.environ.get('MAX_CONTENT_LENGTH_MB', '200')) * 1024 * 1024

# Tiempo que sobreviven los archivos de una sesión sin actividad.
SESSION_TTL_SECONDS = int(os.environ.get('SESSION_TTL_MINUTES', '120')) * 60

# Cada cuánto se pasa el recolector de sesiones caducadas.
CLEANUP_INTERVAL_SECONDS = int(os.environ.get('CLEANUP_INTERVAL_MINUTES', '15')) * 60

# Autoridad de sellado de tiempo para "Firmar con certificado".
#
# Sólo se usa cuando el usuario marca la casilla: sella la firma con la hora de
# un tercero, de modo que siga verificándose cuando su certificado caduque. Lo
# único que viaja hasta aquí es un resumen (hash) de la firma; el documento no
# sale de esta máquina. Es la única llamada saliente de todo el backend.
TSA_URL = os.environ.get('TSA_URL', 'https://freetsa.org/tsr')
TSA_TIMEOUT = int(os.environ.get('TSA_TIMEOUT_SECONDS', '15'))
