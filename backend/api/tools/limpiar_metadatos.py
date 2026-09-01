"""Herramienta: enseñar y borrar los metadatos de un archivo.

Un PDF lleva dentro quién lo escribió y con qué programa; una foto de móvil
lleva el modelo de la cámara, la fecha exacta y, muy a menudo, **las coordenadas
del sitio donde se hizo**. Se reparte sin querer cada vez que se manda un
archivo.

Por eso la herramienta hace dos cosas y en este orden: primero cuenta lo que ha
encontrado y luego lo quita. Enseñarlo es la mitad del trabajo; el archivo
limpio, la otra.

En los JPEG los metadatos se arrancan **sin recomprimir la imagen**: se quitan
los segmentos que los llevan y el resto del archivo se copia tal cual. Volver a
guardarlo con Pillow habría costado una pérdida de calidad gratuita.
"""
import os
import shutil

import fitz  # PyMuPDF
from PIL import Image
from PIL.ExifTags import GPSTAGS, TAGS
from flask import Blueprint, jsonify

from api import current_session, imaging, params
from api.formatos import extension_de, extensiones_de_entrada, salidas_disponibles
from errors import ApiError
from storage import storage, nombre_seguro

bp = Blueprint('limpiar_metadatos', __name__, url_prefix='/api/tools')

# Campos de un PDF, con el nombre que se le enseña al usuario.
CAMPOS_PDF = [
    ('title', 'Título'),
    ('author', 'Autor'),
    ('subject', 'Asunto'),
    ('keywords', 'Palabras clave'),
    ('creator', 'Creado con'),
    ('producer', 'Generado por'),
    ('creationDate', 'Fecha de creación'),
    ('modDate', 'Fecha de modificación'),
]

# Etiquetas EXIF que valen la pena enseñar. El resto son tecnicismos de
# exposición que no dicen nada de quién hizo la foto ni dónde.
CAMPOS_EXIF = {
    'Make': 'Marca de la cámara',
    'Model': 'Modelo de la cámara',
    'LensModel': 'Objetivo',
    'Software': 'Software',
    'DateTime': 'Fecha',
    'DateTimeOriginal': 'Fecha de la toma',
    'Artist': 'Autor',
    'Copyright': 'Copyright',
    'HostComputer': 'Equipo',
    'BodySerialNumber': 'Número de serie',
}

# Segmentos JPEG que se arrancan: EXIF y XMP van en APP1, IPTC y Photoshop en
# APP13, y los comentarios en COM. Los demás se dejan: APP0 es el JFIF y APP2
# suele llevar el perfil de color, y quitarlos estropearía la imagen.
SEGMENTOS_A_QUITAR = {0xE1, 0xED, 0xFE}

MAXIMO_VALOR = 120


@bp.post('/limpiar-metadatos')
def limpiar_metadatos():
    session_id = current_session()
    datos = params.cuerpo()
    file_ids = params.ids(datos, minimo=1, mensaje='Selecciona al menos un archivo.')
    a_fondo = params.booleano(datos, 'a_fondo', False)

    admitidas = {'.pdf'} | extensiones_de_entrada()
    entradas = []
    for file_id in file_ids:
        record = storage.record_of(session_id, file_id)
        if record.ext not in admitidas:
            raise ApiError(f'"{record.name}" no es un PDF ni una imagen.', 400)
        entradas.append((record, storage.path_of(session_id, file_id)))

    resultados, informe = [], []
    for record, origen in entradas:
        base = os.path.splitext(nombre_seguro(record.name))[0]
        if record.ext == '.pdf':
            destino, salida = storage.reserve_output(session_id, f'{base}-sin-metadatos.pdf')
            hallado = _limpiar_pdf(origen, destino, record.name, a_fondo)
        else:
            formato, extension = _formato_de_salida(record.ext)
            destino, salida = storage.reserve_output(
                session_id, f'{base}-sin-metadatos{extension}')
            hallado = _limpiar_imagen(origen, destino, record.name, formato)

        resultados.append(storage.commit_output(session_id, salida).to_json())
        informe.append({'archivo': record.name, **hallado})

    return jsonify({'files': resultados, 'metadatos': informe}), 201


# --- PDF -------------------------------------------------------------------

def _limpiar_pdf(origen: str, destino: str, nombre: str, a_fondo: bool) -> dict:
    try:
        documento = fitz.open(origen)
    except Exception as err:
        raise ApiError(f'No se ha podido abrir "{nombre}": {err}', 422) from err

    with documento:
        if documento.needs_pass:
            raise ApiError(f'"{nombre}" está protegido con contraseña. Quítasela primero.', 422)

        campos = _campos_pdf(documento.metadata or {})
        tenia_xmp = documento.xref_xml_metadata() != 0
        if tenia_xmp:
            campos.append({'etiqueta': 'Metadatos XMP', 'valor': 'sí, incrustados en el documento'})

        if a_fondo:
            # `remove_links=False` a propósito: quitar los enlaces se llevaría
            # por delante el índice del documento, y eso no es un metadato.
            documento.scrub(remove_links=False)
        documento.set_metadata({})
        documento.del_xml_metadata()

        try:
            documento.save(destino, deflate=True, garbage=4, clean=True)
        except Exception as err:
            raise ApiError(f'No se ha podido guardar "{nombre}": {err}', 422) from err

    return {'campos': campos, 'ubicacion': False}


def _campos_pdf(metadatos: dict) -> list[dict]:
    campos = []
    for clave, etiqueta in CAMPOS_PDF:
        valor = (metadatos.get(clave) or '').strip()
        if valor:
            campos.append({'etiqueta': etiqueta, 'valor': _recortar(_fecha_legible(valor))})
    return campos


def _fecha_legible(valor: str) -> str:
    """"D:20260901083704Z'" -> "01/09/2026 08:37". Lo demás se deja como está."""
    if not valor.startswith('D:') or len(valor) < 10:
        return valor
    crudo = valor[2:]
    try:
        fecha = f'{crudo[6:8]}/{crudo[4:6]}/{crudo[0:4]}'
        return f'{fecha} {crudo[8:10]}:{crudo[10:12]}' if len(crudo) >= 12 else fecha
    except (IndexError, ValueError):
        return valor


# --- imágenes --------------------------------------------------------------

def _limpiar_imagen(origen: str, destino: str, nombre: str, formato: str) -> dict:
    with imaging.abrir(origen, nombre) as imagen:
        campos, ubicacion = _campos_exif(imagen)
        original = imagen.format

    if original == 'JPEG':
        # Sin recomprimir: se copian los bytes quitando los segmentos con datos.
        _limpiar_jpeg(origen, destino)
        return {'campos': campos, 'ubicacion': ubicacion}

    with imaging.abrir(origen, nombre) as imagen:
        # Pillow reescribe el EXIF que encuentre en `info`, así que se vacía lo
        # que pueda llevar datos antes de guardar.
        for clave in ('exif', 'xmp', 'XML:com.adobe.xmp', 'comment', 'photoshop', 'iptc'):
            imagen.info.pop(clave, None)
        imaging.guardar(imagen, destino, formato, 95)

    return {'campos': campos, 'ubicacion': ubicacion}


def _campos_exif(imagen: Image.Image) -> tuple[list[dict], bool]:
    try:
        exif = imagen.getexif()
    except Exception:
        return [], False
    if not exif:
        return [], False

    campos = []
    for etiqueta, valor in exif.items():
        nombre = TAGS.get(etiqueta)
        if nombre in CAMPOS_EXIF and valor not in (None, ''):
            campos.append({'etiqueta': CAMPOS_EXIF[nombre], 'valor': _recortar(str(valor).strip())})

    ubicacion = False
    try:
        gps = exif.get_ifd(0x8825)
    except Exception:
        gps = None
    if gps:
        ubicacion = True
        campos.append({'etiqueta': 'Ubicación', 'valor': _coordenadas(gps)})

    return campos, ubicacion


def _coordenadas(gps: dict) -> str:
    """Las coordenadas en grados, para que se vea que no es un dato abstracto."""
    partes = {GPSTAGS.get(clave, clave): valor for clave, valor in gps.items()}
    try:
        latitud = _grados(partes['GPSLatitude'], partes.get('GPSLatitudeRef', 'N'))
        longitud = _grados(partes['GPSLongitude'], partes.get('GPSLongitudeRef', 'E'))
        return f'{latitud:.5f}, {longitud:.5f}'
    except (KeyError, TypeError, ValueError, ZeroDivisionError):
        return 'sí, con coordenadas dentro'


def _grados(valor, referencia: str) -> float:
    grados, minutos, segundos = (float(parte) for parte in valor)
    resultado = grados + minutos / 60 + segundos / 3600
    return -resultado if referencia in ('S', 'W') else resultado


def _limpiar_jpeg(origen: str, destino: str) -> None:
    """Copia el JPEG quitando los segmentos con metadatos, sin tocar la imagen."""
    with open(origen, 'rb') as fichero:
        datos = fichero.read()

    if not datos.startswith(b'\xff\xd8'):
        shutil.copyfile(origen, destino)  # no es lo que decía ser: mejor no tocarlo
        return

    salida = bytearray(datos[:2])
    i = 2
    while i < len(datos) - 1 and datos[i] == 0xFF:
        marcador = datos[i + 1]
        if marcador == 0xDA:  # empiezan los datos comprimidos: el resto va tal cual
            salida += datos[i:]
            break
        longitud = int.from_bytes(datos[i + 2:i + 4], 'big')
        if longitud < 2:
            salida += datos[i:]
            break
        if marcador not in SEGMENTOS_A_QUITAR:
            salida += datos[i:i + 2 + longitud]
        i += 2 + longitud
    else:
        salida += datos[i:]

    with open(destino, 'wb') as fichero:
        fichero.write(bytes(salida))


def _formato_de_salida(extension: str) -> tuple[str, str]:
    """El mismo formato que traía, si esta instalación sabe escribirlo."""
    escribibles = {f['id'] for f in salidas_disponibles()} - {'PDF'}
    formato = Image.EXTENSION.get(extension.lower())
    if formato in escribibles:
        return formato, extension_de(formato) or extension.lower()
    return 'PNG', '.png'


def _recortar(valor: str) -> str:
    return valor if len(valor) <= MAXIMO_VALOR else valor[:MAXIMO_VALOR - 1] + '…'
