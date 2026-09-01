"""Herramienta: crear un certificado digital propio.

Para quien no tiene ninguno. Genera un par de claves y un certificado
**autofirmado**, y devuelve dos archivos: el `.p12` con la clave privada dentro
—protegido con la contraseña que elija el usuario, es el que se usa para firmar—
y el `.crt` público, que es el que hay que darle a quien tenga que comprobar la
firma.

Hay que ser claro con lo que esto es y lo que no: un certificado autofirmado
sirve para demostrar **integridad** —que el documento no ha cambiado— y para uso
interno entre gente que ya se conoce. **No vale para trámites oficiales**: como
no lo respalda ninguna autoridad reconocida, Adobe lo marcará como "identidad no
verificada" hasta que el destinatario añada el `.crt` a sus certificados de
confianza a mano. Para lo demás está el de la FNMT.

Como "Generar QR", no recibe archivos de entrada.
"""
import datetime

from flask import Blueprint, jsonify

from api import current_session, params
from api.tipografia import limpiar
from errors import ApiError
from storage import storage

bp = Blueprint('crear_certificado', __name__, url_prefix='/api/tools')

ANOS_MINIMO, ANOS_MAXIMO, ANOS_POR_DEFECTO = 1, 10, 3

# 2048 bits es lo que sigue pidiendo el común de las administraciones y lo que
# genera en un segundo; 4096 se ofrece para quien lo quiera y tarda unos cuantos.
TAMANOS_CLAVE = {'2048': 2048, '4096': 4096}

MAXIMO_CAMPO = 100

# Una clave privada protegida con "1234" no está protegida.
MINIMO_CONTRASENA = 8


@bp.post('/crear-certificado')
def crear_certificado():
    session_id = current_session()
    datos = params.cuerpo()

    nombre = _campo(datos, 'nombre', 'Escribe el nombre que llevará el certificado.')
    organizacion = _campo(datos, 'organizacion', '', obligatorio=False)
    correo = _campo(datos, 'correo', '', obligatorio=False)
    pais = (_campo(datos, 'pais', '', obligatorio=False) or 'ES').upper()[:2]
    anos = params.entero(datos, 'anos', ANOS_POR_DEFECTO, ANOS_MINIMO, ANOS_MAXIMO)
    bits = TAMANOS_CLAVE[params.opcion(datos, 'bits', TAMANOS_CLAVE, '2048')]

    contrasena = datos.get('contrasena')
    if not isinstance(contrasena, str) or len(contrasena) < MINIMO_CONTRASENA:
        raise ApiError('La contraseña del certificado necesita al menos '
                       f'{MINIMO_CONTRASENA} caracteres: es lo único que protege tu '
                       'clave privada.', 400)

    p12, crt = _generar(nombre, organizacion, correo, pais, anos, bits, contrasena)

    archivos = []
    base = 'certificado'
    for contenido, extension in ((p12, '.p12'), (crt, '.crt')):
        destino, salida = storage.reserve_output(session_id, f'{base}{extension}')
        with open(destino, 'wb') as archivo:
            archivo.write(contenido)
        archivos.append(storage.commit_output(session_id, salida).to_json())

    return jsonify({'files': archivos}), 201


def _generar(nombre: str, organizacion: str, correo: str, pais: str,
             anos: int, bits: int, contrasena: str) -> tuple[bytes, bytes]:
    """El par de claves y el certificado, tal y como los quiere un firmante."""
    from cryptography import x509
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import rsa
    from cryptography.hazmat.primitives.serialization import pkcs12
    from cryptography.x509.oid import NameOID

    clave = rsa.generate_private_key(public_exponent=65537, key_size=bits)

    atributos = [x509.NameAttribute(NameOID.COMMON_NAME, nombre)]
    if organizacion:
        atributos.append(x509.NameAttribute(NameOID.ORGANIZATION_NAME, organizacion))
    if correo:
        atributos.append(x509.NameAttribute(NameOID.EMAIL_ADDRESS, correo))
    if pais.isalpha():
        atributos.append(x509.NameAttribute(NameOID.COUNTRY_NAME, pais))
    sujeto = x509.Name(atributos)

    # Un día de margen hacia atrás: si el reloj del servidor va un poco
    # adelantado, un certificado recién hecho parecería no haber empezado aún.
    ahora = datetime.datetime.now(datetime.timezone.utc)
    certificado = (
        x509.CertificateBuilder()
        .subject_name(sujeto)
        .issuer_name(sujeto)                       # autofirmado: emisor y sujeto son el mismo
        .public_key(clave.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(ahora - datetime.timedelta(days=1))
        .not_valid_after(ahora + datetime.timedelta(days=365 * anos))
        .add_extension(x509.BasicConstraints(ca=False, path_length=None), critical=True)
        # `content_commitment` es el antiguo "no repudio": sin él, algunos
        # lectores se niegan a dar la firma por buena.
        .add_extension(
            x509.KeyUsage(digital_signature=True, content_commitment=True,
                          key_encipherment=False, data_encipherment=False,
                          key_agreement=False, key_cert_sign=False, crl_sign=False,
                          encipher_only=False, decipher_only=False),
            critical=True)
        .add_extension(
            x509.ExtendedKeyUsage([x509.oid.ExtendedKeyUsageOID.EMAIL_PROTECTION]),
            critical=False)
        .sign(clave, hashes.SHA256()))

    p12 = pkcs12.serialize_key_and_certificates(
        _etiqueta(nombre), clave, certificado, None,
        serialization.BestAvailableEncryption(contrasena.encode()))
    crt = certificado.public_bytes(serialization.Encoding.PEM)
    return p12, crt


def _etiqueta(nombre: str) -> bytes:
    """El nombre amistoso que se guarda dentro del .p12, en ASCII para que
    cualquier lector viejo lo entienda."""
    return nombre.encode('ascii', 'ignore') or b'certificado'


def _campo(datos: dict, clave: str, error: str, obligatorio: bool = True) -> str:
    valor = limpiar(str(datos.get(clave) or '')).replace('\n', ' ').strip()
    if not valor and obligatorio:
        raise ApiError(error or f'Falta "{clave}".', 400)
    if len(valor) > MAXIMO_CAMPO:
        raise ApiError(f'"{clave}" no puede pasar de {MAXIMO_CAMPO} caracteres.', 400)
    return valor
