"""Punto de entrada de la API. Gunicorn usa el objeto ``app`` de este módulo."""
import logging

from flask import Flask, jsonify
from flask_cors import CORS

import config
from api import files
from api import tools
from errors import register_error_handlers
from storage import storage, start_cleanup_thread


def create_app() -> Flask:
    app = Flask(__name__)
    app.config['MAX_CONTENT_LENGTH'] = config.MAX_CONTENT_LENGTH

    # En producción el frontend se sirve tras el mismo nginx, así que CORS sólo
    # hace falta para el `ng serve` de desarrollo.
    CORS(app, expose_headers=['Content-Disposition'])

    register_error_handlers(app)
    app.register_blueprint(files.bp)
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
