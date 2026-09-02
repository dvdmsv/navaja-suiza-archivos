"""Ajustes de gunicorn, calculados a partir de la máquina.

Esto es un fichero de configuración de gunicorn, no un módulo de la aplicación:
gunicorn lo ejecuta al arrancar y se queda con las variables de aquí.

Existe para que el proyecto se despliegue bien afinado **sin que nadie tenga que
escribir un `.env`**. Antes los valores venían fijos en el `CMD` del Dockerfile,
y eso obligaba a elegir uno: o prudente —y desaprovechar una máquina holgada— o
generoso, y reventar una pequeña. Preguntándoselo al cgroup no hay que elegir.

Todo se puede seguir fijando a mano con su variable de entorno, que manda sobre
lo calculado.
"""

# Con alias, y no `import config` a secas: gunicorn lee **todos** los nombres de
# este módulo como ajustes suyos, y `config` es uno de ellos (espera la ruta de
# un fichero). Importarlo con su nombre aborta el arranque con
# "Invalid value for config: <module ...>".
import config as ajustes

bind = '0.0.0.0:5000'

# Procesos: los que quepan en la memoria del contenedor, sin pasar de los
# núcleos que haya. El cálculo y su porqué están en `config.py`.
workers = ajustes.entorno_entero('GUNICORN_WORKERS', ajustes.workers_recomendados())

# Hilos por proceso. Aquí casi todo el trabajo es esperar a que termine un
# programa externo o a que el disco escriba, así que los hilos salen baratos:
# no compiten por CPU, sólo ocupan la memoria de la petición que llevan.
threads = ajustes.entorno_entero('GUNICORN_THREADS', 4)

# Plazo de una petición. Generoso a propósito: un OCR o una conversión de
# ofimática tardan minutos, y sus propios plazos (`OCR_TIMEOUT_SECONDS` y
# compañía) son más cortos que este para poder devolver un error entendible
# en vez de que gunicorn corte la respuesta a media frase.
timeout = ajustes.entorno_entero('GUNICORN_TIMEOUT', 300)

graceful_timeout = 30

# Reciclar workers: PyMuPDF y pyHanko no devuelven al sistema toda la memoria
# que piden, así que un proceso muy usado se va hinchando. El desfase evita que
# todos se reinicien a la vez y dejen un hueco sin nadie atendiendo.
max_requests = 200
max_requests_jitter = 20


def on_starting(server):
    """Dejar dicho en el log con qué ha arrancado y por qué.

    Sin esto, un despliegue que se queda corto de workers no se distingue de uno
    bien ajustado: los dos funcionan, sólo que uno hace cola.
    """
    server.log.info(
        'Máquina detectada: %d núcleos, %d MB de memoria -> %d workers, %d hilos',
        ajustes.nucleos(), ajustes.memoria_mb(), workers, threads,
    )
