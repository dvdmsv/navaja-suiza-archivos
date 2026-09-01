"""Herramienta: estampar una marca de agua en todas las páginas de un PDF.

Dos modos: un texto —BORRADOR, CONFIDENCIAL, tu nombre— o una imagen con el
logotipo. En ambos casos se puede repetir en mosaico por toda la página, que es
lo que hace que una marca de agua sirva de algo: recortarla deja de ser una
opción.

Sobre el giro: la página puede venir con `/Rotate` en el archivo, y entonces lo
que se ve y lo que se escribe no coinciden. Se hace como en `visor.py`: los
puntos se llevan al espacio sin girar con `derotation_matrix` y al ángulo del
texto se le suma el de la página. Sin esto, en un PDF con `/Rotate 180` la marca
sale en la esquina contraria.
"""
import io
import os

import fitz  # PyMuPDF
from PIL import Image
from flask import Blueprint, jsonify

from api import current_session, imaging, params
from api.tipografia import COLORES_TEXTO, FAMILIAS, TAMANO_MAXIMO, TAMANO_MINIMO, fuente, limpiar
from errors import ApiError
from storage import storage, nombre_seguro

bp = Blueprint('marca_de_agua', __name__, url_prefix='/api/tools')

MODOS = {'texto', 'imagen'}

OPACIDAD_MINIMA, OPACIDAD_MAXIMA, OPACIDAD_POR_DEFECTO = 5, 100, 25
GIRO_MAXIMO = 180.0
MAXIMO_CARACTERES = 120

# Ancho de la imagen en fracción del ancho de la página.
ANCHO_MINIMO, ANCHO_MAXIMO, ANCHO_POR_DEFECTO = 0.05, 1.0, 0.4

# Cuántas veces se repite la marca a lo ancho cuando va en mosaico.
COLUMNAS_MOSAICO, FILAS_MOSAICO = 3, 4

PPP_MARCA = 200


@bp.post('/marca-de-agua')
def marca_de_agua():
    session_id = current_session()
    datos = params.cuerpo()
    file_ids = params.ids(datos, minimo=1, mensaje='Selecciona un PDF.')

    modo = params.opcion(datos, 'modo', MODOS, 'texto')
    opacidad = params.entero(datos, 'opacidad', OPACIDAD_POR_DEFECTO,
                             OPACIDAD_MINIMA, OPACIDAD_MAXIMA) / 100
    giro = params.decimal(datos, 'giro', 45.0, -GIRO_MAXIMO, GIRO_MAXIMO)
    mosaico = params.booleano(datos, 'mosaico', False)
    # Debajo del contenido se lee mejor el documento; encima se ve mejor la marca.
    encima = params.booleano(datos, 'encima', True)

    record = storage.record_of(session_id, file_ids[0])
    if record.ext != '.pdf':
        raise ApiError(f'"{record.name}" no es un PDF.', 400)
    origen = storage.path_of(session_id, file_ids[0])

    if modo == 'texto':
        marca = _leer_texto(datos)
    else:
        marca = _leer_imagen(session_id, datos, opacidad)

    base = os.path.splitext(nombre_seguro(record.name))[0]
    destino, salida = storage.reserve_output(session_id, f'{base}-con-marca.pdf')
    _estampar(origen, destino, record.name, marca, modo, opacidad, giro, mosaico, encima)

    return jsonify({'files': [storage.commit_output(session_id, salida).to_json()]}), 201


def _leer_texto(datos: dict) -> dict:
    texto = limpiar(str(datos.get('texto') or '')).replace('\n', ' ').strip()
    if not texto:
        raise ApiError('Escribe el texto de la marca de agua.', 400)
    if len(texto) > MAXIMO_CARACTERES:
        raise ApiError(f'El texto de la marca no puede pasar de {MAXIMO_CARACTERES} caracteres.', 400)

    return {
        'texto': texto,
        'tamano': params.entero(datos, 'tamano', 48, TAMANO_MINIMO, TAMANO_MAXIMO),
        'color': COLORES_TEXTO[params.opcion(datos, 'color', COLORES_TEXTO, 'negro')],
        'fuente': fuente(params.opcion(datos, 'fuente', FAMILIAS, 'sans'),
                         params.booleano(datos, 'negrita', True), False),
    }


def _leer_imagen(session_id: str, datos: dict, opacidad: float) -> dict:
    """La imagen se sube aparte, como la firma: no es uno de los `file_ids`."""
    imagen_id = datos.get('imagen_id')
    if not isinstance(imagen_id, str) or not imagen_id:
        raise ApiError('Falta la imagen de la marca de agua: súbela antes de continuar.', 400)

    record = storage.record_of(session_id, imagen_id)
    with imaging.abrir(storage.path_of(session_id, imagen_id), record.name) as imagen:
        capa = imagen.convert('RGBA')

    ancho = params.decimal(datos, 'ancho', ANCHO_POR_DEFECTO, ANCHO_MINIMO, ANCHO_MAXIMO)
    return {'imagen': _con_opacidad(capa, opacidad), 'ancho': ancho}


def _con_opacidad(imagen: Image.Image, opacidad: float) -> Image.Image:
    """Baja el alfa de la imagen entera.

    Se hace aquí y no en el PDF porque el alfa del propio PNG lo respetan todos
    los lectores, y así se conserva la transparencia que ya trajera el logotipo.
    """
    alfa = imagen.getchannel('A').point(lambda valor: round(valor * opacidad))
    copia = imagen.copy()
    copia.putalpha(alfa)
    return copia


def _estampar(origen, destino, nombre, marca, modo, opacidad, giro, mosaico, encima) -> None:
    try:
        documento = fitz.open(origen)
    except Exception as err:
        raise ApiError(f'No se ha podido abrir "{nombre}": {err}', 422) from err

    with documento:
        if documento.needs_pass:
            raise ApiError(f'"{nombre}" está protegido con contraseña. Quítasela primero.', 422)
        if documento.page_count == 0:
            raise ApiError(f'"{nombre}" no tiene páginas.', 422)

        xref = 0
        estampa = b''
        proporcion = 1.0
        if modo == 'imagen':
            # Se rasteriza y se gira una sola vez: las demás páginas y las demás
            # copias del mosaico reutilizan el mismo recurso del PDF.
            referencia = documento[0].rect.width * marca['ancho']
            estampa, proporcion = _a_png(marca['imagen'], referencia, giro)

        for pagina in documento:
            for x, y in _posiciones(mosaico):
                if modo == 'texto':
                    _escribir(pagina, marca, x, y, giro, opacidad, encima)
                else:
                    xref = _pegar(pagina, estampa, xref, marca['ancho'],
                                  proporcion, x, y, encima)

        try:
            documento.save(destino, deflate=True, garbage=3)
        except Exception as err:
            raise ApiError(f'No se ha podido guardar "{nombre}": {err}', 422) from err


def _posiciones(mosaico: bool) -> list[tuple[float, float]]:
    """Dónde va cada copia, en proporciones de la página."""
    if not mosaico:
        return [(0.5, 0.5)]
    return [((columna + 0.5) / COLUMNAS_MOSAICO, (fila + 0.5) / FILAS_MOSAICO)
            for fila in range(FILAS_MOSAICO)
            for columna in range(COLUMNAS_MOSAICO)]


# Altura de las mayúsculas en múltiplos del cuerpo. Sirve para centrar el texto
# en vertical: `insert_text` sitúa la línea base, no el medio de las letras.
ALTURA_MAYUSCULAS = 0.7


def _escribir(pagina, marca: dict, x: float, y: float, giro: float,
              opacidad: float, encima: bool) -> None:
    """Escribe la marca centrada en (x, y) y girada alrededor de ese mismo punto.

    El giro va con `morph` y no con `rotate` porque `rotate` sólo admite
    múltiplos de 90, y una marca de agua se quiere en diagonal. El truco está en
    que el punto fijo del `morph` sea el centro del texto: girar alrededor del
    inicio de la línea base lo manda a paseo, y la marca acaba descentrada.
    """
    caja = pagina.rect
    ancho = fitz.get_text_length(marca['texto'], fontname=marca['fuente'],
                                 fontsize=marca['tamano'])

    centro = fitz.Point(caja.x0 + x * caja.width,
                        caja.y0 + y * caja.height) * pagina.derotation_matrix
    # De dónde arranca la línea base para que las letras queden centradas ahí.
    inicio = fitz.Point(centro.x - ancho / 2,
                        centro.y + marca['tamano'] * ALTURA_MAYUSCULAS / 2)

    pagina.insert_text(inicio, marca['texto'], fontname=marca['fuente'],
                       fontsize=marca['tamano'], color=marca['color'],
                       fill_opacity=opacidad,
                       morph=(centro, fitz.Matrix(_giro_total(pagina, giro))),
                       overlay=encima)


def _giro_total(pagina, giro: float) -> float:
    """Al giro que pide el usuario se le suma el que ya traía la página."""
    return (pagina.rotation + giro) % 360


def _pegar(pagina, estampa: bytes, xref: int, ancho: float, proporcion: float,
           x: float, y: float, encima: bool) -> int:
    caja = pagina.rect
    # Al girar, la caja que ocupa la imagen crece; el dibujo mantiene su tamaño.
    medio_ancho = ancho * caja.width / 2
    medio_alto = medio_ancho * proporcion

    centro_x, centro_y = caja.x0 + x * caja.width, caja.y0 + y * caja.height
    rect = fitz.Rect(centro_x - medio_ancho, centro_y - medio_alto,
                     centro_x + medio_ancho, centro_y + medio_alto)
    if pagina.rotation:
        rect = rect * pagina.derotation_matrix
    rect.normalize()

    if xref:
        pagina.insert_image(rect, xref=xref, overlay=encima)
        return xref
    return pagina.insert_image(rect, stream=estampa, overlay=encima,
                               keep_proportion=True) or 0


def _a_png(imagen: Image.Image, ancho_pt: float, giro: float) -> tuple[bytes, float]:
    """Rasteriza y gira la marca. Devuelve el PNG y cuánto mide su caja ya girada.

    El giro se hace aquí, con Pillow, y no en el PDF: `insert_image` sólo sabe
    girar en múltiplos de 90, y una marca de agua se quiere en diagonal.
    """
    escala = PPP_MARCA / 72
    ancho_px = max(1, round(ancho_pt * escala))
    alto_px = max(1, round(ancho_px * imagen.height / imagen.width))
    escalada = imagen.resize((ancho_px, alto_px), Image.LANCZOS)
    # Al revés que el ángulo pedido: Pillow gira en sentido contrario al de CSS
    # y al del propio PDF, igual que en `firmar.py`.
    girada = escalada.rotate(-giro, resample=Image.BICUBIC, expand=True) if giro else escalada

    buffer = io.BytesIO()
    girada.save(buffer, 'PNG', optimize=True)
    return buffer.getvalue(), girada.height / girada.width
