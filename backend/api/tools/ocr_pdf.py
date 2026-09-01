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
from api import current_session, params
from errors import ApiError
from storage import storage, nombre_seguro

bp = Blueprint('ocr_pdf', __name__, url_prefix='/api/tools')

IDIOMAS = {'spa', 'eng', 'spa+eng'}

# El OCR es con diferencia lo más caro que hace esta aplicación: mejor un límite
# claro que un contenedor muerto. El valor por defecto está medido para los
# 768 MB del `docker-compose.yml`; con más memoria se puede subir.
MAXIMO_PAGINAS = config.entorno_entero('OCR_MAX_PAGES', 50)

# Por debajo del plazo de gunicorn, para poder contestar con un error entendible
# en vez de que nos corten la respuesta. Si se sube, hay que subir también
# `GUNICORN_TIMEOUT`.
TIEMPO_LIMITE = config.entorno_entero('OCR_TIMEOUT_SECONDS', 240)

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
    if paginas > MAXIMO_PAGINAS:
        raise ApiError(
            f'El PDF tiene {paginas} páginas y el máximo para el reconocimiento son '
            f'{MAXIMO_PAGINAS}: es la operación más lenta y pesada de la aplicación.', 413)

    base = os.path.splitext(nombre_seguro(record.name))[0]
    destino, salida = storage.reserve_output(session_id, f'{base}-con-texto.pdf')
    _reconocer(origen, destino, idioma, rehacer)

    return jsonify({'files': [storage.commit_output(session_id, salida).to_json()]}), 201


def _reconocer(origen: str, destino: str, idioma: str, rehacer: bool) -> None:
    orden = [
        'ocrmypdf',
        # Un solo trabajo y sin optimizar: el contenedor tiene poca memoria.
        '--jobs', '1',
        '--optimize', '0',
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
            f'El reconocimiento ha tardado más de {-(-TIEMPO_LIMITE // 60)} minutos y se ha '
            'cancelado. Prueba con un documento más corto.', 504) from err

    if resultado.returncode == 0:
        return

    mensaje, codigo = ERRORES.get(
        resultado.returncode, ('No se ha podido completar el reconocimiento de texto.', 422))
    # El detalle de ocrmypdf va al registro, no a la pantalla del usuario.
    current_app.logger.warning('ocrmypdf salió con %s: %s', resultado.returncode,
                               (resultado.stderr or '').strip()[:500])
    raise ApiError(mensaje, codigo)
