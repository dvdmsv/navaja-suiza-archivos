"""Herramienta: convertir un PDF en un documento de Word editable.

Lo hace pdf2docx, que reconstruye párrafos, tablas e imágenes leyendo el PDF con
PyMuPDF. La maquetación sale aproximada —un PDF no guarda párrafos, sino
posiciones de letras sobre la página—, pero el resultado se puede editar, que es
justo lo que no daba "Documento a Markdown".

Se llama a su programa de línea de órdenes en vez de a su API de Python: así
opencv y numpy no se quedan ocupando memoria en el servidor entre conversión y
conversión, que es el mismo motivo por el que markitdown se carga tarde.
"""
import os

import fitz  # PyMuPDF
from flask import Blueprint, current_app, jsonify

from api import conversion, current_session, params
from errors import ApiError
from storage import storage, cambiar_extension

bp = Blueprint('pdf_a_word', __name__, url_prefix='/api/tools')

# Páginas de todo el lote juntas. Reconstruir la maquetación es caro en tiempo y
# en memoria, y el contenedor no da para alegrías.
MAXIMO_PAGINAS = 100

# Por debajo del plazo de gunicorn (300 s), para contestar con un error
# entendible en vez de que nos corten la respuesta.
TIEMPO_LIMITE = 240


@bp.post('/pdf-a-word')
def pdf_a_word():
    session_id = current_session()
    datos = params.cuerpo()
    file_ids = params.ids(datos, minimo=1, mensaje='Selecciona al menos un PDF.')

    # Se abre y se cuenta todo antes de convertir nada: si un PDF no sirve,
    # mejor decirlo antes de tener medio lote hecho.
    entradas = []
    paginas = 0
    for file_id in file_ids:
        record = storage.record_of(session_id, file_id)
        if record.ext != '.pdf':
            raise ApiError(f'"{record.name}" no es un PDF.', 400)
        origen = storage.path_of(session_id, file_id)
        paginas += _paginas(origen, record.name)
        entradas.append((record, origen))

    if paginas > MAXIMO_PAGINAS:
        raise ApiError(
            f'Son {paginas} páginas y el máximo para pasar a Word son {MAXIMO_PAGINAS}: '
            'reconstruir la maquetación es lento y pesado.', 413)

    resultados = []
    for record, origen in entradas:
        destino, salida = storage.reserve_output(
            session_id, cambiar_extension(record.name, '.docx'))
        _convertir(origen, destino, record.name)
        resultados.append(storage.commit_output(session_id, salida).to_json())

    return jsonify({'files': resultados}), 201


def _paginas(ruta: str, nombre: str) -> int:
    """Número de páginas, comprobando de paso que el PDF se puede leer."""
    try:
        with fitz.open(ruta) as documento:
            if documento.needs_pass:
                raise ApiError(f'"{nombre}" está protegido con contraseña. Quítasela primero.', 422)
            total = documento.page_count
    except ApiError:
        raise
    except Exception as err:
        raise ApiError(f'No se ha podido abrir "{nombre}": {err}', 422) from err

    if total == 0:
        raise ApiError(f'"{nombre}" no tiene páginas.', 422)
    return total


def _convertir(origen: str, destino: str, nombre: str) -> None:
    resultado = conversion.ejecutar(
        ['pdf2docx', 'convert', origen, destino], TIEMPO_LIMITE, 'pdf2docx',
        'La conversión a Word no está disponible en este servidor.')

    if resultado.returncode == 0 and os.path.isfile(destino):
        return

    # El detalle de pdf2docx va al registro, no a la pantalla del usuario.
    current_app.logger.warning('pdf2docx salió con %s: %s', resultado.returncode,
                               (resultado.stderr or '').strip()[:500])
    raise ApiError(f'No se ha podido convertir "{nombre}" a Word: puede estar dañado o tener '
                   'una estructura que la conversión no sabe reconstruir.', 422)
