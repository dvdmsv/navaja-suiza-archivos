"""Herramienta: reducir el peso de una o varias imágenes.

Se conserva el formato original (una foto JPG sigue siendo JPG); lo que cambia
es la calidad y, si se pide, el tamaño en píxeles.
"""
import os

from flask import Blueprint, jsonify

from api import current_session, imaging, params
from api.formatos import extension_de, extensiones_de_entrada
from errors import ApiError
from storage import storage, nombre_seguro

bp = Blueprint('comprimir_imagen', __name__, url_prefix='/api/tools')

# Formato de salida según el de entrada. Los que no admiten calidad se pasan a
# JPEG, que es donde se nota la compresión.
EQUIVALENCIAS = {
    'JPEG': 'JPEG', 'MPO': 'JPEG', 'WEBP': 'WEBP', 'AVIF': 'AVIF', 'PNG': 'PNG',
    'GIF': 'PNG', 'BMP': 'JPEG', 'TIFF': 'JPEG',
}

CALIDAD_MINIMA, CALIDAD_MAXIMA, CALIDAD_POR_DEFECTO = 20, 95, 75

# 0 significa "no redimensionar".
LADO_MAXIMO_MINIMO, LADO_MAXIMO_MAXIMO = 320, 8000


@bp.post('/comprimir-imagen')
def comprimir_imagen():
    session_id = current_session()
    datos = params.cuerpo()
    file_ids = params.ids(datos, minimo=1, mensaje='Selecciona al menos una imagen.')
    calidad = params.entero(datos, 'calidad', CALIDAD_POR_DEFECTO, CALIDAD_MINIMA, CALIDAD_MAXIMA)
    lado_maximo = datos.get('lado_maximo') or 0
    if lado_maximo:
        lado_maximo = params.entero(datos, 'lado_maximo', 0, LADO_MAXIMO_MINIMO, LADO_MAXIMO_MAXIMO)

    resultados, antes, despues = [], 0, 0

    for file_id in file_ids:
        record = storage.record_of(session_id, file_id)
        if record.ext not in extensiones_de_entrada():
            pista = ' Usa la herramienta de comprimir PDF.' if record.ext == '.pdf' else ''
            raise ApiError(f'"{record.name}" no es una imagen.{pista}', 400)
        ruta = storage.path_of(session_id, file_id)

        with imaging.abrir(ruta, record.name) as imagen:
            formato = EQUIVALENCIAS.get(imagen.format or '', 'JPEG')
            base = os.path.splitext(nombre_seguro(record.name))[0]
            destino, salida = storage.reserve_output(
                session_id, f'{base}-comprimida{extension_de(formato)}')
            imaging.guardar(imaging.redimensionar(imagen, lado_maximo), destino, formato, calidad)

        guardado = storage.commit_output(session_id, salida)
        resultados.append(guardado.to_json())
        antes += record.size
        despues += guardado.size

    return jsonify({'files': resultados, 'resumen': {'antes': antes, 'despues': despues}}), 201
