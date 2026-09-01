"""Herramienta: generar códigos QR.

Es la única herramienta sin archivo de entrada: no recibe `file_ids`, sólo lo
que hay que meter dentro del código.

Además del texto libre hay atajos para lo que nadie escribe a mano: la red wifi
—con su sintaxis `WIFI:S:…;T:WPA;P:…;;`, que el móvil reconoce y conecta solo—,
la tarjeta de contacto, el correo y el teléfono. Justo lo que se acaba buscando
en una web de generar QR, metiendo de paso la contraseña de casa en un servidor
ajeno.

Lo hace segno: 75 kB, sin una sola dependencia, y escribe PNG y SVG sin pasar
por Pillow.
"""
import segno
from flask import Blueprint, jsonify

from api import current_session, params
from api.tipografia import limpiar
from errors import ApiError
from storage import storage

bp = Blueprint('generar_qr', __name__, url_prefix='/api/tools')

TIPOS = {'texto', 'wifi', 'contacto', 'correo', 'telefono'}
FORMATOS = {'png': '.png', 'svg': '.svg'}

# Cuánto aguanta el código estando sucio o tapado. Más corrección, más denso.
CORRECCIONES = {'baja': 'l', 'media': 'm', 'alta': 'q', 'maxima': 'h'}

SEGURIDADES = {'WPA', 'WEP', 'nopass'}

ESCALA_MINIMA, ESCALA_MAXIMA, ESCALA_POR_DEFECTO = 4, 20, 10

# Un QR no es un almacén: por encima de esto no cabe, o sale ilegible.
MAXIMO_CONTENIDO = 1200
MAXIMO_CAMPO = 200


@bp.post('/generar-qr')
def generar_qr():
    session_id = current_session()
    datos = params.cuerpo()

    tipo = params.opcion(datos, 'tipo', TIPOS, 'texto')
    formato = params.opcion(datos, 'formato', FORMATOS, 'png')
    correccion = CORRECCIONES[params.opcion(datos, 'correccion', CORRECCIONES, 'media')]
    escala = params.entero(datos, 'escala', ESCALA_POR_DEFECTO, ESCALA_MINIMA, ESCALA_MAXIMA)

    contenido = _contenido(tipo, datos)
    if len(contenido) > MAXIMO_CONTENIDO:
        raise ApiError(f'El contenido no cabe en un código QR: pasa de '
                       f'{MAXIMO_CONTENIDO} caracteres.', 400)

    try:
        codigo = segno.make(contenido, error=correccion)
    except Exception as err:
        raise ApiError(f'No se ha podido generar el código: {err}', 422) from err

    destino, salida = storage.reserve_output(session_id, f'codigo-qr{FORMATOS[formato]}')
    try:
        codigo.save(destino, scale=escala, border=4)
    except Exception as err:
        raise ApiError(f'No se ha podido guardar el código: {err}', 422) from err

    return jsonify({'files': [storage.commit_output(session_id, salida).to_json()]}), 201


def _contenido(tipo: str, datos: dict) -> str:
    """Arma lo que va dentro del código según el tipo."""
    if tipo == 'texto':
        return _campo(datos, 'texto', 'Escribe el texto o el enlace.', MAXIMO_CONTENIDO)

    if tipo == 'wifi':
        red = _campo(datos, 'red', 'Escribe el nombre de la red wifi.')
        seguridad = params.opcion(datos, 'seguridad', SEGURIDADES, 'WPA')
        clave = _campo(datos, 'clave',
                       'Escribe la contraseña de la red, o elige "sin contraseña".',
                       obligatorio=seguridad != 'nopass')
        oculta = params.booleano(datos, 'oculta', False)
        partes = [f'S:{_escapar(red)}', f'T:{seguridad}']
        if seguridad != 'nopass':
            partes.append(f'P:{_escapar(clave)}')
        if oculta:
            partes.append('H:true')
        return 'WIFI:' + ';'.join(partes) + ';;'

    if tipo == 'contacto':
        nombre = _campo(datos, 'nombre', 'Escribe el nombre del contacto.')
        lineas = ['BEGIN:VCARD', 'VERSION:3.0', f'FN:{nombre}', f'N:{nombre};;;;']
        for clave, etiqueta in (('organizacion', 'ORG'), ('telefono', 'TEL'),
                                ('correo', 'EMAIL'), ('web', 'URL')):
            valor = _campo(datos, clave, '', obligatorio=False)
            if valor:
                lineas.append(f'{etiqueta}:{valor}')
        lineas.append('END:VCARD')
        return '\n'.join(lineas)

    if tipo == 'correo':
        direccion = _campo(datos, 'correo', 'Escribe la dirección de correo.')
        asunto = _campo(datos, 'asunto', '', obligatorio=False)
        mensaje = _campo(datos, 'mensaje', '', obligatorio=False, maximo=MAXIMO_CONTENIDO)
        extras = []
        if asunto:
            extras.append(f'subject={_urlencode(asunto)}')
        if mensaje:
            extras.append(f'body={_urlencode(mensaje)}')
        return f'mailto:{direccion}' + ('?' + '&'.join(extras) if extras else '')

    telefono = _campo(datos, 'telefono', 'Escribe el número de teléfono.')
    return f'tel:{telefono}'


def _campo(datos: dict, clave: str, error: str, maximo: int = MAXIMO_CAMPO,
           obligatorio: bool = True) -> str:
    valor = limpiar(str(datos.get(clave) or '')).strip()
    if not valor and obligatorio:
        raise ApiError(error or f'Falta "{clave}".', 400)
    if len(valor) > maximo:
        raise ApiError(f'"{clave}" no puede pasar de {maximo} caracteres.', 400)
    return valor


def _escapar(valor: str) -> str:
    """En la sintaxis del wifi hay cuatro caracteres que van con contrabarra."""
    for caracter in ('\\', ';', ',', ':', '"'):
        valor = valor.replace(caracter, '\\' + caracter)
    return valor


def _urlencode(valor: str) -> str:
    from urllib.parse import quote

    return quote(valor, safe='')
