"""Herramienta: sacar páginas sueltas o rangos de un PDF a un documento nuevo.

Es la operación inversa de "Unir PDF". Las páginas se copian tal cual, sin
rasterizar, así que el resultado conserva texto, fuentes y calidad.
"""
import os
import re

from flask import Blueprint, jsonify
from pypdf import PdfReader, PdfWriter
from pypdf.errors import PdfReadError

from api import current_session, params
from errors import ApiError
from storage import storage, nombre_seguro

bp = Blueprint('dividir_pdf', __name__, url_prefix='/api/tools')

MODOS = {'unico', 'por-pagina'}

# Un archivo por página con documentos largos llenaría la sesión de basura.
MAXIMO_ARCHIVOS = 200

# "12", "3-9", "10-" (hasta el final) o "-4" (desde el principio).
RANGO = re.compile(r'^(\d*)\s*-\s*(\d*)$')


@bp.post('/dividir-pdf')
def dividir_pdf():
    session_id = current_session()
    datos = params.cuerpo()
    file_ids = params.ids(datos, minimo=1, mensaje='Selecciona un PDF.')
    modo = params.opcion(datos, 'modo', MODOS, 'unico')

    record = storage.record_of(session_id, file_ids[0])
    if record.ext != '.pdf':
        raise ApiError(f'"{record.name}" no es un PDF.', 400)
    origen = storage.path_of(session_id, file_ids[0])

    try:
        lector = PdfReader(origen)
    except PdfReadError as err:
        raise ApiError(f'No se ha podido abrir el PDF: {err}', 422) from err

    # El cifrado se mira antes de tocar las páginas: pypdf revienta al contarlas
    # si el documento sigue cifrado, y el error que suelta no le dice nada a nadie.
    if lector.is_encrypted:
        raise ApiError('El PDF está protegido con contraseña. Quítasela primero.', 422)

    try:
        total = len(lector.pages)
    except PdfReadError as err:
        raise ApiError(f'No se ha podido abrir el PDF: {err}', 422) from err
    if total == 0:
        raise ApiError('El PDF no tiene páginas.', 422)

    numeros = expandir_paginas(datos.get('paginas'), total)
    if modo == 'por-pagina' and len(numeros) > MAXIMO_ARCHIVOS:
        raise ApiError(
            f'Serían {len(numeros)} archivos y el máximo son {MAXIMO_ARCHIVOS}. '
            'Prueba con menos páginas o en un solo documento.', 413)

    base = os.path.splitext(nombre_seguro(record.name))[0]
    ancho = len(str(total))

    if modo == 'unico':
        resultados = [_escribir(session_id, f'{base}-paginas.pdf', lector, numeros)]
    else:
        resultados = [_escribir(session_id, f'{base}-pagina-{n:0{ancho}d}.pdf', lector, [n])
                      for n in numeros]

    return jsonify({'files': [r.to_json() for r in resultados]}), 201


def expandir_paginas(texto: str, total: int) -> list[int]:
    """Convierte "1-3, 7, 10-" en la lista de páginas, en el orden pedido.

    Se valida aquí y no en el navegador porque es el servidor quien no debe
    fiarse de lo que le llega.
    """
    if not isinstance(texto, str) or not texto.strip():
        raise ApiError('Indica qué páginas quieres, por ejemplo "1-3, 7".', 400)

    numeros: list[int] = []
    for trozo in re.split(r'[,;\s]+', texto.strip()):
        if not trozo:
            continue
        if trozo.isdigit():
            inicio = fin = int(trozo)
        else:
            partes = RANGO.match(trozo)
            if not partes or not (partes.group(1) or partes.group(2)):
                raise ApiError(
                    f'No entiendo "{trozo}". Usa números y rangos, como "1-3, 7, 10-".', 400)
            inicio = int(partes.group(1)) if partes.group(1) else 1
            fin = int(partes.group(2)) if partes.group(2) else total
        if inicio > fin:
            raise ApiError(f'El rango "{trozo}" está del revés.', 400)
        if inicio < 1 or fin > total:
            raise ApiError(f'El PDF tiene {total} páginas y has pedido "{trozo}".', 400)
        numeros.extend(range(inicio, fin + 1))

    # Una página repetida se queda con su primera aparición: el orden lo marca
    # quien escribe, pero duplicarla casi nunca es lo que se pretendía.
    vistas: set[int] = set()
    unicas = [n for n in numeros if not (n in vistas or vistas.add(n))]
    if not unicas:
        raise ApiError('No has seleccionado ninguna página.', 400)
    return unicas


def _escribir(session_id: str, nombre: str, lector: PdfReader, numeros: list[int]):
    destino, salida = storage.reserve_output(session_id, nombre)
    escritor = PdfWriter()
    for numero in numeros:
        escritor.add_page(lector.pages[numero - 1])
    with open(destino, 'wb') as fichero:
        escritor.write(fichero)
    escritor.close()
    return storage.commit_output(session_id, salida)
