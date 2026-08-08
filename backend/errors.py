"""Errores de API con una forma de respuesta homogénea para todas las herramientas."""
from flask import jsonify
from werkzeug.exceptions import HTTPException, RequestEntityTooLarge


class ApiError(Exception):
    """Error esperado: se traduce a una respuesta JSON con su código."""

    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.message = message
        self.status = status


def register_error_handlers(app):
    @app.errorhandler(ApiError)
    def _handle_api_error(err: ApiError):
        return jsonify({'error': err.message}), err.status

    @app.errorhandler(RequestEntityTooLarge)
    def _handle_too_large(_err):
        limite_mb = app.config['MAX_CONTENT_LENGTH'] // (1024 * 1024)
        return jsonify({'error': f'Los archivos superan el límite de {limite_mb} MB.'}), 413

    @app.errorhandler(HTTPException)
    def _handle_http(err: HTTPException):
        return jsonify({'error': err.description}), err.code

    @app.errorhandler(Exception)
    def _handle_unexpected(err: Exception):
        app.logger.exception('Error no controlado: %s', err)
        return jsonify({'error': 'Error interno del servidor.'}), 500
