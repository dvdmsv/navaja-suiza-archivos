"""Firmar un PDF con un certificado digital: lo que comparten las herramientas.

Vive aquí y no dentro de una de ellas porque lo usan las tres —firmar, comprobar
firmas y crear un certificado—, igual que `tipografia.py` con las fuentes.

**La clave privada no toca el disco, nunca.** Un `.p12` no entra por
`POST /api/files`: todo lo que pasa por ahí acaba escrito en `uploads/<sesión>/`
y sobrevive dos horas, que es exactamente lo que no se quiere de una clave
privada. Llega en base64 dentro del cuerpo JSON, se usa y se suelta, y así **no
hay estado ninguno en el servidor**: nada que purgar y nada que se quede
olvidado si gunicorn recicla el worker.

El precio, asumido a conciencia: el certificado y su contraseña viajan en cada
petición, también en las de la apariencia del sello. Es lo mismo que ya hace
`firmar.py` reenviando `firma_id` y `umbral` cada vez que se mueve el deslizador.

Y una precisión que conviene no adornar: la clave se deja de referenciar en
cuanto termina la petición, pero **Python no permite borrar memoria de forma
garantizada**. Lo que se promete es que no toca el disco, no entra en el almacén
de la sesión y no aparece en el log; no que se destruya sin rastro.

**pyHanko se importa dentro de las funciones**, como markitdown: son unos 39 MB
residentes que sólo paga quien use estas tres herramientas. Un servidor que sólo
une PDF no tiene por qué cargar con una biblioteca de criptografía.
"""
import base64
import binascii

import config
from api import params
from errors import ApiError

# Un PKCS#12 son entre 3 y 10 kB. Este tope está para cortar en seco un cuerpo
# absurdo antes de intentar descifrarlo, no para acotar un caso real.
MAXIMO_CERTIFICADO = 256 * 1024

# El sello se escribe en Helvetica y no en la Courier que pyHanko trae por
# defecto, que canta muchísimo. Es una de las catorce fuentes base, las mismas
# que usa `tipografia.py`, así que no se embebe nada. El 0,5 es el ancho medio
# de un carácter en múltiplos del cuerpo, que es lo que pyHanko usa para repartir
# las líneas.
FUENTE_SELLO, ANCHO_MEDIO = 'Helvetica', 0.5

CUERPO_SELLO = 8

# Cómo se reparte el recuadro cuando además hay firma a mano: el trazo a la
# izquierda y el texto a la derecha, como en un sello de los de toda la vida.
# Superponerlos —que es lo que hace pyHanko con un fondo, que estira por todo el
# recuadro— deja las dos cosas ilegibles.
PARTE_DEL_TRAZO = 0.38

# Aire entre el trazo y el texto, para que no se toquen.
SEPARACION = 0.05

# A cuántos píxeles por punto se compone el lienzo del trazo.
PIXELES_POR_PUNTO = 4

ERROR_CERTIFICADO = ('No se ha podido abrir el certificado. Comprueba la contraseña '
                     'y que el archivo sea un .p12 o .pfx.')

# Cómo llama AutoFirma al algoritmo según el tipo de clave del certificado.
ALGORITMOS = {'rsa': 'SHA256withRSA', 'ec': 'SHA256withECDSA', 'dsa': 'SHA256withDSA'}


def cargar_firmante(datos: dict):
    """El certificado y su clave, a partir del base64 del cuerpo de la petición.

    Cualquier fallo —contraseña mala, archivo que no es un PKCS#12, base64
    roto— sale con el mismo mensaje: distinguirlos le diría a quien prueba
    contraseñas cuál de las dos cosas ha acertado.
    """
    from pyhanko.sign import signers

    crudo = _bytes_del_certificado(datos)
    contrasena = datos.get('contrasena')
    if contrasena is not None and not isinstance(contrasena, str):
        raise ApiError('La contraseña del certificado no es válida.', 400)

    try:
        firmante = signers.SimpleSigner.load_pkcs12_data(
            crudo, None, passphrase=(contrasena or '').encode())
    except Exception:
        # Sin `from err` y sin registrar nada: el texto de la excepción de
        # pyHanko no aporta al usuario y el cuerpo lleva la contraseña dentro.
        raise ApiError(ERROR_CERTIFICADO, 400) from None
    if firmante is None:
        raise ApiError(ERROR_CERTIFICADO, 400)
    return firmante


def certificado_de(datos: dict):
    """El certificado sobre el que se trabaja, venga por donde venga.

    Hay dos caminos para llegar aquí y sólo cambian en si traen la clave
    privada: el `.p12` que sube el usuario, y el certificado suelto que devuelve
    el selector de AutoFirma (`selectCertificate`), que es **sólo la parte
    pública** —el manual del integrador es explícito en que nunca toca las claves
    privadas—. Todo lo que se hace con el certificado (leer el titular, componer
    el sello) es igual en los dos casos, así que se resuelven aquí y el resto del
    código no se entera.
    """
    crudo = datos.get('certificado_publico')
    if not isinstance(crudo, str) or not crudo:
        return cargar_firmante(datos).signing_cert

    from asn1crypto import x509

    try:
        certificado = x509.Certificate.load(base64.b64decode(crudo, validate=True))
        certificado.subject.native  # asn1crypto es perezoso: hay que forzarlo
    except Exception:
        raise ApiError('No se ha podido leer el certificado elegido.', 400) from None
    return certificado


def algoritmo_de(certificado) -> str:
    """El algoritmo de firma que le corresponde a la clave del certificado.

    AutoFirma quiere el nombre del algoritmo, y con uno que no case con la clave
    falla. Como el certificado se lee antes de firmar, se puede acertar en vez de
    suponer que todo el mundo lleva RSA.
    """
    return ALGORITMOS.get(certificado.public_key.algorithm, 'SHA256withRSA')


def datos_del_certificado(certificado) -> dict:
    """Quién firma y hasta cuándo vale, para enseñarlo antes de firmar nada."""
    import datetime

    ahora = datetime.datetime.now(datetime.timezone.utc)
    desde, hasta = certificado.not_valid_before, certificado.not_valid_after
    return {
        'nombre': nombre_de(certificado),
        'emisor': emisor_de(certificado),
        'desde': desde.isoformat(),
        'hasta': hasta.isoformat(),
        'caducado': hasta < ahora,
        'todavia_no': desde > ahora,
        'autofirmado': certificado.self_signed != 'no',
    }


def nombre_de(certificado) -> str:
    """El nombre del titular, que es lo que se escribe en el sello."""
    return _comun(certificado.subject.native) or 'Firmante desconocido'


def emisor_de(certificado) -> str:
    """Quién expidió el certificado: la FNMT, la empresa, o uno mismo."""
    return _comun(certificado.issuer.native) or 'desconocido'


def sellador(datos: dict):
    """La autoridad de sellado, o `None` si el usuario no ha marcado la casilla.

    Si la marcó y la TSA no responde, se falla con un error claro en vez de
    firmar sin sello a sus espaldas: quien la marca es porque quiere el sello.
    """
    if not params.booleano(datos, 'sello_tiempo', False):
        return None

    from pyhanko.sign import timestamps

    return timestamps.HTTPTimeStamper(
        config.TSA_URL,
        https=config.TSA_URL.lower().startswith('https'),
        timeout=config.TSA_TIMEOUT)


def lienzo_del_trazo(trazo, ancho: float, alto: float):
    """Mete el trazo en un lienzo de la forma del recuadro, pegado a la izquierda.

    Existe porque el `background` de pyHanko se estira por todo el recuadro y no
    hay forma fiable de acotarlo a un lado: sus márgenes de maquetación no lo
    confinan. Dándole ya un lienzo con la proporción del sello y el trazo puesto
    donde toca, no tiene nada que decidir.
    """
    from PIL import Image

    ancho_px = max(1, round(ancho * PIXELES_POR_PUNTO))
    alto_px = max(1, round(alto * PIXELES_POR_PUNTO))
    lienzo = Image.new('RGBA', (ancho_px, alto_px), (0, 0, 0, 0))

    # El hueco de la izquierda, con un poco de aire por los cuatro lados.
    caja_ancho = ancho_px * PARTE_DEL_TRAZO * (1 - SEPARACION)
    caja_alto = alto_px * (1 - 2 * SEPARACION)
    escala = min(caja_ancho / trazo.width, caja_alto / trazo.height)
    medida = (max(1, round(trazo.width * escala)), max(1, round(trazo.height * escala)))

    encajado = trazo.convert('RGBA').resize(medida, Image.LANCZOS)
    lienzo.paste(encajado,
                 (round((ancho_px * PARTE_DEL_TRAZO - medida[0]) / 2),
                  round((alto_px - medida[1]) / 2)),
                 encajado)
    return lienzo


def estilo_de_sello(lineas: list[str], trazo=None, ancho: float = 0):
    """La pinta del recuadro visible: el texto y, de fondo, el trazo a mano.

    `trazo` es una imagen de Pillow ya recortada, la misma que estampa
    "Firmar documento", y `ancho` el ancho del recuadro en puntos, que hace
    falta para repartir el sitio entre el trazo y el texto.
    """
    from pyhanko import stamp
    from pyhanko.pdf_utils import images, layout, text
    from pyhanko.pdf_utils.font.basic import SimpleFontEngineFactory

    fondo = images.PdfImage(trazo) if trazo is not None else None

    # Sin trazo, el texto ocupa todo el recuadro; con él, se aparta a la derecha
    # y le deja la izquierda.
    margen_texto = layout.Margins(
        left=ancho * (PARTE_DEL_TRAZO + SEPARACION) if fondo else 0,
        right=0, top=0, bottom=0)

    return stamp.TextStampStyle(
        stamp_text='\n'.join(lineas),
        text_box_style=text.TextBoxStyle(
            font=SimpleFontEngineFactory(FUENTE_SELLO, ANCHO_MEDIO),
            font_size=CUERPO_SELLO),
        # Centrado y **estirado** hasta llenar el recuadro. Por defecto pyHanko
        # sólo encoge, y como el tamaño del sello lo decide el usuario
        # arrastrando, el texto se quedaría diminuto en una esquina de una caja
        # grande. Estirando conservando la proporción, el sello se ve igual a
        # cualquier tamaño: que es lo que enseña la vista previa.
        inner_content_layout=layout.SimpleBoxLayoutRule(
            x_align=layout.AxisAlignment.ALIGN_MID,
            y_align=layout.AxisAlignment.ALIGN_MID,
            margins=margen_texto,
            inner_content_scaling=layout.InnerScaling.STRETCH_TO_FIT),
        background=fondo,
        background_opacity=1.0,
        border_width=1)


def error_de_sellado() -> ApiError:
    """Traduce un fallo de la TSA a algo que el usuario pueda entender.

    La causa real se conserva encadenando la excepción con `from`, que es lo que
    acaba en el log; aquí sólo se decide qué lee el usuario.
    """
    return ApiError(
        'No se ha podido obtener el sello de tiempo: la autoridad de sellado no '
        'responde. Vuelve a intentarlo o desmarca la casilla para firmar sin sello.',
        504)


def _bytes_del_certificado(datos: dict) -> bytes:
    crudo = datos.get('certificado')
    if not isinstance(crudo, str) or not crudo:
        raise ApiError('Falta el certificado: elígelo antes de continuar.', 400)
    if len(crudo) > MAXIMO_CERTIFICADO:
        raise ApiError('El certificado es demasiado grande para ser un .p12.', 400)
    try:
        return base64.b64decode(crudo, validate=True)
    except (binascii.Error, ValueError):
        raise ApiError(ERROR_CERTIFICADO, 400) from None


def _comun(nombre) -> str:
    """El `common_name` de un sujeto o un emisor, que es el nombre legible."""
    if not isinstance(nombre, dict):
        return ''
    valor = nombre.get('common_name') or nombre.get('organization_name') or ''
    # Un DN puede traer un atributo repetido, y asn1crypto lo da como lista.
    return str(valor[0] if isinstance(valor, list) and valor else valor)
