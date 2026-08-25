"""Lectura validada del cuerpo JSON de las peticiones.

Las herramientas reciben opciones del cliente (calidad, resolución, formato…) y
ninguna debe fiarse de ellas. Estas funciones devuelven valores ya dentro de
rango o lanzan un ``ApiError`` con un mensaje que se le puede enseñar al usuario.
"""
import math

from flask import request

from errors import ApiError


def cuerpo() -> dict:
    datos = request.get_json(silent=True)
    return datos if isinstance(datos, dict) else {}


def ids(datos: dict, minimo: int = 1, mensaje: str | None = None) -> list[str]:
    """Lista de identificadores de archivo sobre los que trabajar."""
    valores = datos.get('file_ids')
    if not isinstance(valores, list) or len(valores) < minimo:
        plural = 'archivo' if minimo == 1 else f'{minimo} archivos'
        raise ApiError(mensaje or f'Selecciona al menos {plural}.', 400)
    if not all(isinstance(v, str) for v in valores):
        raise ApiError('La lista de archivos no es válida.', 400)
    return valores


def entero(datos: dict, clave: str, defecto: int, minimo: int, maximo: int) -> int:
    """Entero recortado al rango admitido; el ausente toma el valor por defecto."""
    valor = datos.get(clave, defecto)
    try:
        numero = int(valor)
    except (TypeError, ValueError):
        raise ApiError(f'El valor de "{clave}" no es un número.', 400) from None
    return max(minimo, min(maximo, numero))


def opcion(datos: dict, clave: str, admitidas: dict | set | list, defecto: str) -> str:
    """Uno de los valores permitidos; cualquier otro es un error explícito."""
    valor = datos.get(clave, defecto)
    if valor not in admitidas:
        opciones = ', '.join(sorted(str(v) for v in admitidas))
        raise ApiError(f'Opción no válida para "{clave}". Admitidas: {opciones}.', 400)
    return valor


def decimal(datos: dict, clave: str, defecto: float, minimo: float, maximo: float) -> float:
    """Número recortado al rango admitido; el ausente toma el valor por defecto."""
    valor = datos.get(clave, defecto)
    try:
        numero = float(valor)
    except (TypeError, ValueError):
        raise ApiError(f'El valor de "{clave}" no es un número.', 400) from None
    if not math.isfinite(numero):
        raise ApiError(f'El valor de "{clave}" no es un número.', 400)
    return max(minimo, min(maximo, numero))


def booleano(datos: dict, clave: str, defecto: bool) -> bool:
    """Casilla marcada o no; el JSON debe traer un booleano de verdad."""
    valor = datos.get(clave, defecto)
    if not isinstance(valor, bool):
        raise ApiError(f'El valor de "{clave}" debe ser verdadero o falso.', 400)
    return valor
