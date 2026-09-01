"""Escribir texto dentro de un PDF: fuentes, tintas y medidas.

Vive aquí y no dentro de una herramienta porque lo usan tres —el visor, la marca
de agua y la numeración de páginas— y todas tienen que escribir igual.
"""
import re

# Las catorce fuentes que todo lector de PDF trae de serie y que PyMuPDF lleva
# dentro: no hay que embeber nada, el archivo no engorda y el navegador tiene
# equivalentes con las mismas métricas (Arial, Times New Roman, Courier New),
# así que lo que se ve escrito en el visor mide lo mismo que lo que sale aquí.
FUENTES = {
    ('sans', False, False): 'helv', ('sans', True, False): 'hebo',
    ('sans', False, True): 'heit', ('sans', True, True): 'hebi',
    ('serif', False, False): 'tiro', ('serif', True, False): 'tibo',
    ('serif', False, True): 'tiit', ('serif', True, True): 'tibi',
    ('mono', False, False): 'cour', ('mono', True, False): 'cobo',
    ('mono', False, True): 'coit', ('mono', True, True): 'cobi',
}

FAMILIAS = {'sans', 'serif', 'mono'}

# Las tintas con las que se puede escribir. Son los mismos valores que
# `COLORES_CSS` de `frontend/.../visor/tipografia.ts`: si cambian allí, cambian
# aquí.
COLORES_TEXTO = {
    'negro': (0, 0, 0),
    'azul': (26 / 255, 63 / 255, 208 / 255),
    'rojo': (200 / 255, 30 / 255, 30 / 255),
}

# Separación entre líneas base, en múltiplos del cuerpo. El mismo número que usa
# el visor como `line-height`: al ser un múltiplo del cuerpo y no una métrica de
# la fuente, las dos partes reparten las líneas igual sin negociar nada.
INTERLINEADO = 1.2

TAMANO_MINIMO, TAMANO_MAXIMO = 6, 96

# Todo lo que no sea un salto de línea y no se pueda escribir sobra.
CONTROLES = re.compile(r'[\x00-\x09\x0b-\x1f\x7f]')


def fuente(familia: str, negrita: bool, cursiva: bool) -> str:
    """El nombre que PyMuPDF entiende para esa combinación."""
    return FUENTES[(familia, negrita, cursiva)]


def limpiar(texto: str) -> str:
    """Quita los caracteres que no se pueden escribir y normaliza los saltos."""
    return CONTROLES.sub('', texto.replace('\r\n', '\n').replace('\r', '\n'))


def ancho_de(texto: str, nombre_fuente: str, tamano: float) -> float:
    """Cuánto mide el texto escrito, en puntos."""
    import fitz  # PyMuPDF

    return fitz.get_text_length(texto, fontname=nombre_fuente, fontsize=tamano)
