"""Herramienta: combinar varios PDF en uno solo, en el orden recibido."""
from flask import Blueprint, jsonify
from pypdf import PdfWriter
from pypdf.errors import PdfReadError

from api import current_session, params
from errors import ApiError
from storage import storage

bp = Blueprint('unir_pdf', __name__, url_prefix='/api/tools')

SALIDA = 'documento-combinado.pdf'


@bp.post('/unir-pdf')
def unir_pdf():
    session_id = current_session()
    file_ids = params.ids(params.cuerpo(), minimo=2,
                          mensaje='Selecciona al menos dos PDF para combinar.')

    # Se resuelven todas las rutas antes de escribir nada, para fallar pronto.
    rutas = []
    for file_id in file_ids:
        record = storage.record_of(session_id, file_id)
        if record.ext != '.pdf':
            raise ApiError(f'"{record.name}" no es un PDF.', 400)
        rutas.append(storage.path_of(session_id, file_id))

    destino, record = storage.reserve_output(session_id, SALIDA)
    writer = PdfWriter()
    try:
        for ruta in rutas:
            writer.append(ruta)
        with open(destino, 'wb') as salida:
            writer.write(salida)
    except PdfReadError as err:
        raise ApiError(f'Uno de los PDF está dañado o protegido: {err}', 422) from err
    finally:
        writer.close()

    return jsonify({'files': [storage.commit_output(session_id, record).to_json()]}), 201
