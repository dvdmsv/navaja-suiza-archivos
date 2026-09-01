"""Punto de entrada de la API. Gunicorn usa el objeto ``app`` de este módulo."""
import logging

from flask import Flask, jsonify
from flask_cors import CORS

import config
from api import afirma
from api import files
from api import tools
from errors import register_error_handlers
from storage import storage, start_cleanup_thread


def create_app() -> Flask:
    app = Flask(__name__)
    app.config['MAX_CONTENT_LENGTH'] = config.MAX_CONTENT_LENGTH
    # Werkzeug corta en 500 kB los campos de formulario que no son archivos. El
    # buzón de AutoFirma recibe el documento en uno de esos campos, así que sin
    # subir esto cualquier PDF de verdad se rechazaría con un 413. Las subidas
    # normales van como archivo y no les afecta.
    app.config['MAX_FORM_MEMORY_SIZE'] = afirma.MAXIMO_FORMULARIO

    # En producción el frontend se sirve tras el mismo nginx, así que CORS sólo
    # hace falta para el `ng serve` de desarrollo.
    CORS(app, expose_headers=['Content-Disposition'])

    register_error_handlers(app)
    app.register_blueprint(files.bp)
    # El buzón con la app de AutoFirma del móvil. No es una herramienta: no
    # recibe `file_ids` ni devuelve `{"files": …}`, así que va aparte, como
    # `files`.
    app.register_blueprint(afirma.bp)
    tools.register(app)

    @app.get('/api/health')
    def health():
        return jsonify({'status': 'ok'})

    start_cleanup_thread(storage, config.CLEANUP_INTERVAL_SECONDS, app.logger)
    return app


logging.basicConfig(level=logging.INFO)
app = create_app()

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
