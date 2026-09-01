"""Herramienta: numerar las páginas de un PDF.

El complemento natural de "Unir PDF" y "Organizar PDF": se junta el documento y
luego hace falta paginarlo.

El número se escribe en el contenido de la página, no como anotación, así que se
ve igual en cualquier lector y se imprime siempre. Y como en `visor.py` y en la
marca de agua, el punto se lleva al espacio sin girar con `derotation_matrix`:
en un PDF con `/Rotate` el número acabaría en el borde equivocado.
"""
import os

import fitz  # PyMuPDF
from flask import Blueprint, jsonify

from api import current_session, params
from api.tipografia import COLORES_TEXTO, FAMILIAS, TAMANO_MAXIMO, TAMANO_MINIMO, fuente
from errors import ApiError
from storage import storage, nombre_seguro

bp = Blueprint('numerar_paginas', __name__, url_prefix='/api/tools')

# Dónde va el número: vertical y horizontal.
BORDES = {'arriba', 'abajo'}
ALINEACIONES = {'izquierda', 'centro', 'derecha'}

# Cómo se escribe. `{n}` es el número de la página y `{total}` cuántas hay.
FORMATOS = {
    'numero': '{n}',
    'de-total': '{n} de {total}',
    'pagina-de-total': 'Página {n} de {total}',
}

MILIMETRO = 72 / 25.4
MARGEN_MINIMO_MM, MARGEN_MAXIMO_MM, MARGEN_POR_DEFECTO_MM = 5, 30, 15


@bp.post('/numerar-paginas')
def numerar_paginas():
    session_id = current_session()
    datos = params.cuerpo()
    file_ids = params.ids(datos, minimo=1, mensaje='Selecciona un PDF.')

    borde = params.opcion(datos, 'borde', BORDES, 'abajo')
    alineacion = params.opcion(datos, 'alineacion', ALINEACIONES, 'centro')
    plantilla = FORMATOS[params.opcion(datos, 'formato', FORMATOS, 'numero')]
    tamano = params.entero(datos, 'tamano', 10, TAMANO_MINIMO, TAMANO_MAXIMO)
    color = COLORES_TEXTO[params.opcion(datos, 'color', COLORES_TEXTO, 'negro')]
    familia = fuente(params.opcion(datos, 'fuente', FAMILIAS, 'sans'), False, False)
    margen = params.entero(datos, 'margen', MARGEN_POR_DEFECTO_MM,
                           MARGEN_MINIMO_MM, MARGEN_MAXIMO_MM) * MILIMETRO
    # Para saltar portadas: esas páginas se quedan sin número, pero siguen
    # contando para el total, que es lo que espera cualquiera.
    desde = params.entero(datos, 'desde', 1, 1, 100_000)
    empezar_en = params.entero(datos, 'empezar_en', 1, 1, 100_000)

    record = storage.record_of(session_id, file_ids[0])
    if record.ext != '.pdf':
        raise ApiError(f'"{record.name}" no es un PDF.', 400)
    origen = storage.path_of(session_id, file_ids[0])

    base = os.path.splitext(nombre_seguro(record.name))[0]
    destino, salida = storage.reserve_output(session_id, f'{base}-numerado.pdf')

    ajustes = {'borde': borde, 'alineacion': alineacion, 'plantilla': plantilla,
               'tamano': tamano, 'color': color, 'fuente': familia, 'margen': margen,
               'desde': desde, 'empezar_en': empezar_en}
    _numerar(origen, destino, record.name, ajustes)

    return jsonify({'files': [storage.commit_output(session_id, salida).to_json()]}), 201


def _numerar(origen: str, destino: str, nombre: str, ajustes: dict) -> None:
    try:
        documento = fitz.open(origen)
    except Exception as err:
        raise ApiError(f'No se ha podido abrir "{nombre}": {err}', 422) from err

    with documento:
        if documento.needs_pass:
            raise ApiError(f'"{nombre}" está protegido con contraseña. Quítasela primero.', 422)
        if documento.page_count == 0:
            raise ApiError(f'"{nombre}" no tiene páginas.', 422)
        if ajustes['desde'] > documento.page_count:
            raise ApiError(f'"{nombre}" tiene {documento.page_count} páginas y has pedido '
                           f'empezar a numerar en la {ajustes["desde"]}.', 400)

        # El total es el que verá el lector: cuántos números se han puesto.
        numeradas = documento.page_count - ajustes['desde'] + 1
        total = numeradas + ajustes['empezar_en'] - 1

        for indice, pagina in enumerate(documento, start=1):
            if indice < ajustes['desde']:
                continue
            numero = indice - ajustes['desde'] + ajustes['empezar_en']
            texto = ajustes['plantilla'].format(n=numero, total=total)
            _escribir(pagina, texto, ajustes)

        try:
            documento.save(destino, deflate=True, garbage=3)
        except Exception as err:
            raise ApiError(f'No se ha podido guardar "{nombre}": {err}', 422) from err


def _escribir(pagina, texto: str, ajustes: dict) -> None:
    caja = pagina.rect
    margen, tamano = ajustes['margen'], ajustes['tamano']
    ancho = fitz.get_text_length(texto, fontname=ajustes['fuente'], fontsize=tamano)

    if ajustes['alineacion'] == 'izquierda':
        x = caja.x0 + margen
    elif ajustes['alineacion'] == 'derecha':
        x = caja.x1 - margen - ancho
    else:
        x = caja.x0 + (caja.width - ancho) / 2

    # `insert_text` sitúa la línea base: arriba hay que bajarla el cuerpo entero
    # para que el número quede dentro del margen, no pisándolo.
    y = caja.y0 + margen + tamano if ajustes['borde'] == 'arriba' else caja.y1 - margen

    punto = fitz.Point(x, y) * pagina.derotation_matrix
    pagina.insert_text(punto, texto, fontname=ajustes['fuente'], fontsize=tamano,
                       color=ajustes['color'], rotate=pagina.rotation)
