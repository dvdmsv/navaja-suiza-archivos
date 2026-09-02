"""Herramienta: reconocer el texto de un PDF escaneado.

Le añade una capa de texto invisible encima de la imagen, así que el documento
se ve igual pero se puede buscar, copiar y —esto es lo interesante— pasar por
"Documento a Markdown", que hasta ahora se rendía ante un escaneado.

El trabajo lo hace ocrmypdf, y se lanza como proceso aparte en vez de por su API
de Python: reparte trabajo con multiprocessing y este servidor atiende con
hilos, así que aislarlo evita sorpresas y permite cortarlo por tiempo sin
llevarse por delante al worker.
"""
import os
import subprocess

import fitz  # PyMuPDF
from flask import Blueprint, current_app, jsonify

import config
from api import conversion, current_session, params
from errors import ApiError
from storage import storage, nombre_seguro

bp = Blueprint('ocr_pdf', __name__, url_prefix='/api/tools')

IDIOMAS = {'spa', 'eng', 'spa+eng'}

# No hay tope de páginas a propósito. Medido en el contenedor: un OCR de 10
# páginas consume 129 MB y uno de 30, 143 MB. Triplicar el documento sube la
# memoria un 11 %, porque las páginas se procesan de una en una y sólo hay una
# en memoria a la vez. Lo que crece es el tiempo, así que quien acota esto es el
# plazo de aquí abajo, no un número de páginas inventado.
#
# Por debajo del plazo de gunicorn, para poder contestar con un error entendible
# en vez de que nos corten la respuesta. Si se sube, hay que subir también
# `GUNICORN_TIMEOUT`.
TIEMPO_LIMITE = config.entorno_entero('OCR_TIMEOUT_SECONDS', 240)

# Páginas que ocrmypdf reconoce en paralelo. Medido con 60 páginas escaneadas en
# un contenedor de 4 núcleos: con 1 tarda 36 s y consume 180 MB; con 4 tarda
# 21 s y consume 327 MB. Es decir, 42 % más rápido por 150 MB más.
#
# El valor por defecto es 1 porque este repositorio tiene que arrancar en
# cualquier máquina, no porque sea el bueno: si tienes núcleos y memoria, súbelo.
TRABAJOS = config.entorno_entero('OCR_JOBS', 1)

# Cuánto aprieta ocrmypdf el PDF resultante, de 0 a 3.
#
# Por defecto 1, y no 0 como antes, porque **sale gratis**: en la misma medición,
# el archivo pasó de 2742 kB a 716 kB —casi cuatro veces menos— en el mismo
# tiempo y con 6 MB más de memoria. El 0 no estaba comprando velocidad, sólo
# evitando una memoria que hoy sobra.
OPTIMIZACION = min(3, config.entorno_entero('OCR_OPTIMIZE', 1, minimo=0))

# Qué significa cada código de salida de ocrmypdf, en cristiano.
ERRORES = {
    2: ('No se ha podido leer el PDF: puede estar dañado.', 422),
    4: ('El resultado del reconocimiento no era un PDF válido.', 422),
    5: ('El resultado del reconocimiento no era un PDF válido.', 422),
    6: ('El PDF ya tiene texto. Marca "rehacer el reconocimiento" si aun así quieres repetirlo.', 400),
    8: ('El PDF está protegido con contraseña. Quítasela primero.', 422),
}


@bp.post('/ocr-pdf')
def ocr_pdf():
    session_id = current_session()
    datos = params.cuerpo()
    file_ids = params.ids(datos, minimo=1, mensaje='Selecciona un PDF.')
    idioma = params.opcion(datos, 'idioma', IDIOMAS, 'spa+eng')
    rehacer = params.booleano(datos, 'rehacer', False)

    record = storage.record_of(session_id, file_ids[0])
    if record.ext != '.pdf':
        raise ApiError(f'"{record.name}" no es un PDF.', 400)
    origen = storage.path_of(session_id, file_ids[0])

    try:
        with fitz.open(origen) as documento:
            if documento.needs_pass:
                raise ApiError('El PDF está protegido con contraseña. Quítasela primero.', 422)
            paginas = documento.page_count
    except ApiError:
        raise
    except Exception as err:
        raise ApiError(f'No se ha podido abrir el PDF: {err}', 422) from err

    if paginas == 0:
        raise ApiError('El PDF no tiene páginas.', 422)
    base = os.path.splitext(nombre_seguro(record.name))[0]
    destino, salida = storage.reserve_output(session_id, f'{base}-con-texto.pdf')
    _reconocer(origen, destino, idioma, rehacer)

    return jsonify({'files': [storage.commit_output(session_id, salida).to_json()]}), 201


def _reconocer(origen: str, destino: str, idioma: str, rehacer: bool) -> None:
    orden = [
        'ocrmypdf',
        '--jobs', str(TRABAJOS),
        '--optimize', str(OPTIMIZACION),
        '--language', idioma,
        '--quiet',
        # `redo-ocr` rehace el texto conservando los gráficos; `skip-text` deja
        # en paz las páginas que ya tenían texto de verdad.
        '--redo-ocr' if rehacer else '--skip-text',
        origen,
        destino,
    ]

    try:
        resultado = subprocess.run(orden, capture_output=True, text=True, timeout=TIEMPO_LIMITE)
    except FileNotFoundError as err:  # falta el programa en la imagen
        current_app.logger.error('ocrmypdf no está instalado: %s', err)
        raise ApiError('El reconocimiento de texto no está disponible en este servidor.', 500) from err
    except subprocess.TimeoutExpired as err:
        raise ApiError(
            f'El reconocimiento ha tardado más de {conversion.en_palabras(TIEMPO_LIMITE)} y se ha '
            'cancelado. Prueba con un documento más corto.', 504) from err

    if resultado.returncode == 0:
        return

    mensaje, codigo = ERRORES.get(
        resultado.returncode, ('No se ha podido completar el reconocimiento de texto.', 422))
    # El detalle de ocrmypdf va al registro, no a la pantalla del usuario.
    current_app.logger.warning('ocrmypdf salió con %s: %s', resultado.returncode,
                               (resultado.stderr or '').strip()[:500])
    raise ApiError(mensaje, codigo)
