"""Registro de herramientas.

Para añadir una herramienta nueva: crea un módulo en esta carpeta que exponga un
Blueprint llamado ``bp`` con ``url_prefix='/api/tools'`` e inclúyelo en la lista
de abajo. No hay que tocar nada más ni en el arranque ni en nginx.
"""
from api.tools import (comprimir_imagen, comprimir_pdf, convertir_imagen, firmar, imagen_a_pdf,
                       pdf_a_imagen, unir_pdf)

BLUEPRINTS = [
    unir_pdf.bp,
    pdf_a_imagen.bp,
    comprimir_pdf.bp,
    comprimir_imagen.bp,
    convertir_imagen.bp,
    imagen_a_pdf.bp,
    firmar.bp,
]


def register(app):
    for bp in BLUEPRINTS:
        app.register_blueprint(bp)
