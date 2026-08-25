"""Qué formatos de imagen sabe manejar esta instalación.

La lista se calcula preguntándole a Pillow en el arranque en vez de fijarla a
mano: así la interfaz nunca ofrece un formato que luego falle al guardar (AVIF,
por ejemplo, sólo está disponible con ciertas versiones o con un plugin).
"""
from PIL import Image

Image.init()

# Formatos de salida que tienen sentido ofrecer, con la extensión y el nombre
# que ve el usuario. Se filtran por lo que Pillow pueda escribir de verdad.
_CANDIDATOS_SALIDA = [
    ('JPEG', '.jpg', 'JPG'),
    ('PNG', '.png', 'PNG'),
    ('WEBP', '.webp', 'WebP'),
    ('AVIF', '.avif', 'AVIF'),
    ('TIFF', '.tiff', 'TIFF'),
    ('BMP', '.bmp', 'BMP'),
    ('PDF', '.pdf', 'PDF'),
]

# Formatos con pérdida: son los únicos donde el ajuste de calidad hace algo.
CON_CALIDAD = {'JPEG', 'WEBP', 'AVIF'}

# Formatos que no admiten transparencia: hay que aplanar el canal alfa.
SIN_TRANSPARENCIA = {'JPEG', 'BMP', 'PDF'}


def salidas_disponibles() -> list[dict]:
    """Formatos a los que se puede convertir, en el orden en que se muestran."""
    return [
        {'id': pillow, 'extension': ext, 'nombre': etiqueta, 'calidad': pillow in CON_CALIDAD}
        for pillow, ext, etiqueta in _CANDIDATOS_SALIDA
        if pillow in Image.SAVE
    ]


def salidas_de_imagen() -> list[dict]:
    """Como `salidas_disponibles`, pero sin PDF: para quien ya parte de un PDF."""
    return [formato for formato in salidas_disponibles() if formato['id'] != 'PDF']


def extension_de(formato: str) -> str:
    for pillow, ext, _ in _CANDIDATOS_SALIDA:
        if pillow == formato:
            return ext
    return '.img'


def extensiones_de_entrada() -> set[str]:
    """Extensiones de imagen que Pillow puede abrir en esta instalación."""
    return {ext.lower() for ext, formato in Image.EXTENSION.items() if formato in Image.OPEN}
