"""Registro de herramientas.

Para añadir una herramienta nueva: crea un módulo en esta carpeta que exponga un
Blueprint llamado ``bp`` con ``url_prefix='/api/tools'`` e inclúyelo en la lista
de abajo. No hay que tocar nada más ni en el arranque ni en nginx.
"""
from api.tools import (a_markdown, comprimir_imagen, comprimir_pdf, convertir_imagen, dividir_pdf,
                       firmar, imagen_a_pdf, ocr_pdf, organizar_pdf, pdf_a_imagen, proteger_pdf,
                       unir_pdf, visor)

BLUEPRINTS = [
    unir_pdf.bp,
    pdf_a_imagen.bp,
    comprimir_pdf.bp,
    comprimir_imagen.bp,
    convertir_imagen.bp,
    imagen_a_pdf.bp,
    firmar.bp,
    a_markdown.bp,
    dividir_pdf.bp,
    organizar_pdf.bp,
    proteger_pdf.bp,
    ocr_pdf.bp,
    visor.bp,
]


def register(app):
    for bp in BLUEPRINTS:
        app.register_blueprint(bp)
