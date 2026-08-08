"""Registro de herramientas.

Para añadir una herramienta nueva: crea un módulo en esta carpeta que exponga un
Blueprint llamado ``bp`` con ``url_prefix='/api/tools'`` e inclúyelo en la lista
de abajo. No hay que tocar nada más ni en el arranque ni en nginx.
"""
from api.tools import comprimir_imagen, comprimir_pdf, convertir_imagen, pdf_a_jpg, unir_pdf

BLUEPRINTS = [
    unir_pdf.bp,
    pdf_a_jpg.bp,
    comprimir_pdf.bp,
    comprimir_imagen.bp,
    convertir_imagen.bp,
]


def register(app):
    for bp in BLUEPRINTS:
        app.register_blueprint(bp)
