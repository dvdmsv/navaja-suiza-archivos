"""Utilidades comunes a todos los blueprints de la API."""
from flask import request

from storage import validate_session_id

SESSION_HEADER = 'X-Session-Id'


def current_session() -> str:
    """Identificador de sesión del cliente, validado.

    El cliente lo genera y lo guarda en su navegador; sirve para aislar los
    archivos de cada usuario sin necesidad de cuentas ni cookies de servidor.
    """
    return validate_session_id(request.headers.get(SESSION_HEADER))
