"""El buzón con el que la app de AutoFirma del móvil devuelve su resultado.

En el ordenador el navegador y AutoFirma están en la misma máquina y hablan
directamente por un socket local. **En el móvil eso es imposible**: el navegador
y la app viven aislados por el sistema y no pueden abrirse un canal entre ellos.
Así que `autoscript.js` cambia de método y usa un buzón en un servidor: la página
deja el encargo, la app lo recoge, firma, y deja la respuesta en el mismo sitio
para que la página la recoja.

Sin este módulo, la app se abre y deja elegir el certificado, pero la respuesta
se deposita en un buzón que no existe y la página se queda esperando. Es el
síntoma exacto que se ve desde el móvil.

**Lo que se guarda va cifrado.** El navegador lo cifra antes de dejarlo y la
clave viaja a la app dentro del enlace `afirma://`, nunca hasta aquí. Este módulo
mueve sobres cerrados que no puede abrir, y tampoco necesita abrirlos.

El protocolo no es inventado: está en `frontend/src/assets/autofirma/autoscript.js`,
que es quien va a hablar con esto.

  GET  ?op=check                    comprobación de salud al arrancar
  POST op=put&v=1_0&id=…&dat=…      deja algo en el buzón
  POST op=get&v=1_0&id=…&it=N       lo recoge

Y de la recogida se esperan textos concretos: `ERR-06…` significa "todavía no
está, sigue preguntando"; `#WAIT…` que la app trabaja y hay que reiniciar la
cuenta de intentos; y cualquier otra cosa son los datos.
"""
import threading
import time

from flask import Blueprint, request

bp = Blueprint('afirma', __name__, url_prefix='/api/afirma')

# Cuánto sobrevive lo que nadie recoge. Cubre el peor caso con holgura: el
# encargo espera a que el usuario abra la app y elija certificado, y la respuesta
# espera al sondeo del navegador, que llega como mucho un minuto después.
VIDA_SEGUNDOS = 5 * 60

# Topes de memoria. El documento entero pasa por aquí cuando se firma desde el
# móvil, y esto corre en un contenedor de 768 MB. El frontend ya no deja mandar
# a AutoFirma nada mayor de 5 MB, que en base64 y cifrado se queda bastante por
# debajo de este tope.
MAXIMO_ENTRADA = 12 * 1024 * 1024
MAXIMO_TOTAL = 32 * 1024 * 1024

# Werkzeug limita a 500 kB los campos de formulario que no son archivos, y `dat`
# es justo eso: el documento entero, en base64, dentro de un campo. Con el valor
# por defecto cualquier PDF de verdad se rechazaría con un 413 antes de llegar a
# este módulo. Lo aplica `app.py` sobre toda la aplicación, pero el único sitio
# que recibe formularios grandes es éste.
MAXIMO_FORMULARIO = MAXIMO_ENTRADA + 64 * 1024

# Lo que hay que responder cuando aún no hay nada: `autoscript.js` lo reconoce y
# sigue preguntando en vez de darse por vencido.
AUN_NO_ESTA = 'ERR-06: No se encontraron datos con el identificador indicado'

# El buzón vive en memoria del proceso, y eso **sólo funciona con un worker**.
# Gunicorn arranca con `--workers 1` (está razonado en `backend/Dockerfile`); con
# dos, cada uno tendría su propio buzón y la mitad de las recogidas fallaría.
_buzon: dict[str, tuple[float, str]] = {}
_cerrojo = threading.Lock()

TEXTO = {'Content-Type': 'text/plain; charset=utf-8'}


@bp.route('/almacen', methods=['GET', 'POST'])
def almacen():
    """Guarda lo que deja la app —o la propia página— bajo un identificador."""
    if _operacion() == 'check':
        return 'OK', 200, TEXTO

    identificador = _identificador()
    datos = request.values.get('dat') or ''
    if not identificador:
        return 'ERR-01: Falta el identificador', 400, TEXTO
    if len(datos) > MAXIMO_ENTRADA:
        return 'ERR-02: Los datos son demasiado grandes', 413, TEXTO

    with _cerrojo:
        _limpiar()
        _hacer_sitio(len(datos))
        _buzon[identificador] = (time.time(), datos)
    return 'OK', 200, TEXTO


@bp.route('/recoger', methods=['GET', 'POST'])
def recoger():
    """Devuelve lo guardado y lo borra: el buzón es de un solo uso."""
    if _operacion() == 'check':
        return 'OK', 200, TEXTO

    identificador = _identificador()
    with _cerrojo:
        _limpiar()
        entrada = _buzon.pop(identificador, None) if identificador else None

    # Que no esté todavía es lo normal: la página pregunta cada cuatro segundos
    # desde antes de que la app haya terminado. No es un error.
    if entrada is None:
        return AUN_NO_ESTA, 200, TEXTO
    return entrada[1], 200, TEXTO


def _operacion() -> str:
    return (request.values.get('op') or '').lower()


def _identificador() -> str:
    """El identificador lo genera la librería, largo y aleatorio.

    Se recorta por si acaso: es la clave de un diccionario en memoria y no hay
    razón para aceptar una de un megabyte.
    """
    return (request.values.get('id') or '')[:256]


def _limpiar() -> None:
    """Tira lo caducado. Se llama en cada acceso, con el cerrojo cogido.

    No hace falta un hilo como el de `storage.py`: aquí son un puñado de
    entradas que viven cinco minutos, no las sesiones del disco.
    """
    limite = time.time() - VIDA_SEGUNDOS
    for clave in [c for c, (puesto, _) in _buzon.items() if puesto < limite]:
        del _buzon[clave]


def _hacer_sitio(entrante: int) -> None:
    """Deja hueco para lo que llega, soltando lo más viejo si hace falta.

    Sin esto, alguien que dejara cosas y no las recogiera nunca haría crecer el
    buzón hasta llevarse por delante el contenedor.
    """
    ocupado = sum(len(datos) for _, datos in _buzon.values())
    for clave, _ in sorted(_buzon.items(), key=lambda par: par[1][0]):
        if ocupado + entrante <= MAXIMO_TOTAL:
            return
        ocupado -= len(_buzon[clave][1])
        del _buzon[clave]
