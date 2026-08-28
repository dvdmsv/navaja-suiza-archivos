"""Herramienta: guardar de una vez todo lo hecho en el visor.

El visor trabaja en el navegador y no molesta al servidor mientras se lee; sólo
al pulsar "Guardar" llega aquí la lista completa de cambios: subrayados,
palabras tachadas, giros y páginas eliminadas.

Sobre las coordenadas: llegan normalizadas de 0 a 1 con el origen arriba a la
izquierda y referidas a la página **sin girar**, la misma convención que usa
`firmar.py`. Es también el sistema de PyMuPDF, así que basta con multiplicar por
el tamaño de la página; y como son proporciones, dan igual el zoom y la
resolución con que se estuviera viendo.
"""
import os

import fitz  # PyMuPDF
from flask import Blueprint, jsonify

from api import current_session, params
from errors import ApiError
from storage import storage, nombre_seguro

bp = Blueprint('visor', __name__, url_prefix='/api/tools')

GIROS = {0, 90, 180, 270}

# Colores de subrayado que ofrece la interfaz. Se validan aquí para no dejar que
# el cliente meta lo que quiera en el archivo.
COLORES_SUBRAYADO = {
    'amarillo': (1.0, 0.87, 0.29),
    'verde': (0.55, 0.89, 0.55),
    'azul': (0.53, 0.77, 0.98),
    'rosa': (0.98, 0.65, 0.80),
}

COLORES_TACHADO = {'negro': (0, 0, 0), 'blanco': (1, 1, 1)}

# Un tope generoso, pero que evita que una petición absurda tenga al servidor
# dibujando rectángulos un cuarto de hora.
MAXIMO_MARCAS = 2000


@bp.post('/visor/guardar')
def guardar():
    session_id = current_session()
    datos = params.cuerpo()
    file_ids = params.ids(datos, minimo=1, mensaje='No hay ningún documento abierto.')

    record = storage.record_of(session_id, file_ids[0])
    if record.ext != '.pdf':
        raise ApiError(f'"{record.name}" no es un PDF.', 400)
    origen = storage.path_of(session_id, file_ids[0])

    try:
        documento = fitz.open(origen)
    except Exception as err:
        raise ApiError(f'No se ha podido abrir el PDF: {err}', 422) from err

    with documento:
        if documento.needs_pass:
            raise ApiError('El PDF está protegido con contraseña. Quítasela primero.', 422)

        total = documento.page_count
        subrayados = _leer_marcas(datos.get('subrayados'), total, COLORES_SUBRAYADO, 'subrayado')
        tachados = _leer_marcas(datos.get('tachados'), total, COLORES_TACHADO, 'tachado')
        paginas = _leer_paginas(datos.get('paginas'), total)

        if not (subrayados or tachados or _hay_cambios_de_paginas(paginas, total)):
            raise ApiError('No hay ningún cambio que guardar.', 400)

        # Primero las marcas, sobre la numeración original: si se borraran antes
        # las páginas, los números ya no señalarían a lo mismo.
        _marcar(documento, subrayados, tachados)

        # Y después la reordenación, el borrado y los giros, como en
        # "Organizar PDF": `select` hace las tres cosas de una pasada.
        documento.select([numero - 1 for numero, _ in paginas])
        for indice, (_, giro) in enumerate(paginas):
            if giro:
                pagina = documento[indice]
                pagina.set_rotation((pagina.rotation + giro) % 360)

        base = os.path.splitext(nombre_seguro(record.name))[0]
        destino, salida = storage.reserve_output(session_id, f'{base}-editado.pdf')
        documento.save(destino, deflate=True, garbage=3)

    return jsonify({'files': [storage.commit_output(session_id, salida).to_json()]}), 201


def _marcar(documento, subrayados: list, tachados: list) -> None:
    """Aplica subrayados y tachados, cada uno en su página."""
    con_tachados = set()

    for numero, color, rects in subrayados:
        pagina = documento[numero - 1]
        zonas = _rectangulos(pagina, rects)
        if not zonas:
            continue
        # Todas las líneas de un mismo subrayado van en una sola anotación: en
        # un lector de PDF se ve como un comentario, no como uno por renglón.
        anotacion = pagina.add_highlight_annot(zonas)
        anotacion.set_colors(stroke=color)
        anotacion.update()

    for numero, color, rects in tachados:
        pagina = documento[numero - 1]
        for rect in _rectangulos(pagina, rects):
            # `fill` es lo que queda a la vista donde estaba el texto.
            pagina.add_redact_annot(rect, fill=color)
        con_tachados.add(numero)

    # Esto es lo que de verdad borra el texto del archivo: sin aplicarlas, las
    # marcas de tachado serían un rectángulo encima y el texto seguiría ahí,
    # copiable y buscable.
    for numero in con_tachados:
        documento[numero - 1].apply_redactions()


def _rectangulos(pagina, rects: list) -> list:
    """Pasa las proporciones a rectángulos de la página.

    Las proporciones vienen referidas a lo que el usuario ve, y PyMuPDF mide
    igual —desde la esquina superior izquierda—, así que es una multiplicación
    por el tamaño de la página.

    El único caso con truco es una página que ya venía girada en el archivo: lo
    que se ve está girado, pero las anotaciones se guardan en el espacio sin
    girar, así que hay que llevar cada rectángulo con `derotation_matrix`.
    Comprobado con los cuatro giros: sin esto, en un documento con `/Rotate 180`
    la marca aparece en la esquina contraria.
    """
    caja = pagina.rect
    resultado = []
    for x0, y0, x1, y1 in rects:
        rect = fitz.Rect(caja.x0 + x0 * caja.width, caja.y0 + y0 * caja.height,
                         caja.x0 + x1 * caja.width, caja.y0 + y1 * caja.height)
        if pagina.rotation:
            rect = rect * pagina.derotation_matrix
        rect.normalize()
        if not rect.is_empty:
            resultado.append(rect)
    return resultado


def _leer_marcas(valor, total: int, colores: dict, etiqueta: str) -> list:
    """Valida la lista de marcas y la deja lista para usar."""
    if valor is None:
        return []
    if not isinstance(valor, list):
        raise ApiError(f'La lista de {etiqueta}s no es válida.', 400)

    marcas, cuantas = [], 0
    for entrada in valor:
        if not isinstance(entrada, dict):
            raise ApiError(f'La lista de {etiqueta}s no es válida.', 400)

        numero = entrada.get('pagina')
        if not isinstance(numero, int) or isinstance(numero, bool) or not 1 <= numero <= total:
            raise ApiError(f'Hay un {etiqueta} en la página {numero}, que no existe.', 400)

        nombre_color = entrada.get('color')
        if nombre_color not in colores:
            admitidos = ', '.join(sorted(colores))
            raise ApiError(f'Color de {etiqueta} no válido. Admitidos: {admitidos}.', 400)

        rects = entrada.get('rects')
        if not isinstance(rects, list) or not rects:
            raise ApiError(f'Hay un {etiqueta} sin zona marcada.', 400)

        limpios = []
        for rect in rects:
            if (not isinstance(rect, list) or len(rect) != 4
                    or not all(isinstance(v, (int, float)) and not isinstance(v, bool)
                               and 0 <= v <= 1 for v in rect)):
                raise ApiError(f'Hay un {etiqueta} con coordenadas fuera de la página.', 400)
            limpios.append([float(v) for v in rect])

        cuantas += len(limpios)
        if cuantas > MAXIMO_MARCAS:
            raise ApiError(f'Hay demasiadas marcas: el máximo son {MAXIMO_MARCAS}.', 413)
        marcas.append((numero, colores[nombre_color], limpios))
    return marcas


def _leer_paginas(valor, total: int) -> list:
    """Lista de páginas del documento final; si no viene, se dejan como están."""
    if valor is None:
        return [(numero, 0) for numero in range(1, total + 1)]
    if not isinstance(valor, list):
        raise ApiError('La lista de páginas no es válida.', 400)
    if not valor:
        raise ApiError('No queda ninguna página en el documento.', 400)

    paginas = []
    for entrada in valor:
        if not isinstance(entrada, dict):
            raise ApiError('La lista de páginas no es válida.', 400)
        numero = entrada.get('numero')
        giro = entrada.get('rotacion', 0)
        if not isinstance(numero, int) or isinstance(numero, bool) or not 1 <= numero <= total:
            raise ApiError(f'El PDF tiene {total} páginas y se ha pedido la {numero}.', 400)
        if giro not in GIROS:
            raise ApiError('Las páginas sólo pueden girar 90, 180 o 270 grados.', 400)
        paginas.append((numero, giro))
    return paginas


def _hay_cambios_de_paginas(paginas: list, total: int) -> bool:
    return len(paginas) != total or any(
        numero != indice + 1 or giro for indice, (numero, giro) in enumerate(paginas))
