"""Herramienta: convertir cada página de un PDF en una imagen JPG."""
import io
import os

import fitz  # PyMuPDF
from PIL import Image
from flask import Blueprint, jsonify

from api import current_session, params
from errors import ApiError
from storage import storage, nombre_seguro

bp = Blueprint('pdf_a_jpg', __name__, url_prefix='/api/tools')

# Resoluciones ofrecidas, en puntos por pulgada.
RESOLUCIONES = {'pantalla': 96, 'normal': 150, 'alta': 300}

CALIDAD_JPG = 90

# Un PDF largo a 300 ppp puede generar cientos de megas: mejor un límite claro
# que un servidor sin memoria.
MAXIMO_PAGINAS = 200


@bp.post('/pdf-a-jpg')
def pdf_a_jpg():
    session_id = current_session()
    datos = params.cuerpo()
    file_ids = params.ids(datos, minimo=1, mensaje='Selecciona un PDF.')
    ppp = RESOLUCIONES[params.opcion(datos, 'resolucion', RESOLUCIONES, 'normal')]

    record = storage.record_of(session_id, file_ids[0])
    if record.ext != '.pdf':
        raise ApiError(f'"{record.name}" no es un PDF.', 400)
    ruta = storage.path_of(session_id, file_ids[0])

    try:
        documento = fitz.open(ruta)
    except Exception as err:
        raise ApiError(f'No se ha podido abrir el PDF: {err}', 422) from err

    with documento:
        if documento.needs_pass:
            raise ApiError('El PDF está protegido con contraseña.', 422)
        if documento.page_count == 0:
            raise ApiError('El PDF no tiene páginas.', 422)
        if documento.page_count > MAXIMO_PAGINAS:
            raise ApiError(
                f'El PDF tiene {documento.page_count} páginas y el máximo son {MAXIMO_PAGINAS}.', 413)

        base = os.path.splitext(nombre_seguro(record.name))[0]
        ancho = len(str(documento.page_count))
        resultados = []

        for numero, pagina in enumerate(documento, start=1):
            nombre = f'{base}-pagina-{numero:0{ancho}d}.jpg'
            destino, salida = storage.reserve_output(session_id, nombre)
            _guardar_pagina(pagina, ppp, destino)
            resultados.append(storage.commit_output(session_id, salida).to_json())

    return jsonify({'files': resultados}), 201


def _guardar_pagina(pagina, ppp: int, destino: str) -> None:
    """Rasteriza una página y la escribe como JPG.

    El pixmap pasa por Pillow porque es quien permite controlar la calidad del
    JPG; PyMuPDF sólo guardaría con sus valores por defecto.
    """
    pixmap = pagina.get_pixmap(dpi=ppp, alpha=False)
    with Image.open(io.BytesIO(pixmap.tobytes('ppm'))) as imagen:
        imagen.convert('RGB').save(destino, 'JPEG', quality=CALIDAD_JPG, optimize=True,
                                   progressive=True)
