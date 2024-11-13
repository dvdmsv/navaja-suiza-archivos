from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS  # Importa CORS
import os
from PyPDF2 import PdfMerger, PdfReader

app = Flask(__name__)
CORS(app)  # Habilita CORS para todas las rutas

UPLOAD_FOLDER = 'uploads'  # Carpeta para almacenar PDFs subidos
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

@app.route('/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400

    file = request.files['file']

    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400

    if file and file.filename.endswith('.pdf'):
        file_path = os.path.join(app.config['UPLOAD_FOLDER'], file.filename)
        file.save(file_path)
        return jsonify({'message': f'File {file.filename} uploaded successfully.'}), 200
    else:
        return jsonify({'error': 'File is not a PDF.'}), 400

@app.route('/merge', methods=['POST'])
def merge_pdfs():
    files = request.json.get('files', [])
    merger = PdfMerger()

    print(f"Archivos recibidos para combinar: {files}")  # Depuración

    for filename in files:
        filepath = os.path.join(UPLOAD_FOLDER, filename)
        print(f"Comprobando si el archivo existe: {filepath}")  # Depuración
        if os.path.exists(filepath):
            merger.append(PdfReader(filepath))
        else:
            print(f"Archivo no encontrado: {filepath}")  # Depuración

    output_path = os.path.join(UPLOAD_FOLDER, 'merged.pdf')
    merger.write(output_path)
    merger.close()
    print(f"Archivo combinado creado en: {output_path}")  # Depuración
    return jsonify({'message': 'PDFs merged successfully.', 'output': 'merged.pdf'}), 200

@app.route('/clear_uploads', methods=['POST'])
def clear_uploads():
    # Eliminar todos los archivos en la carpeta de subida
    for filename in os.listdir(UPLOAD_FOLDER):
        file_path = os.path.join(UPLOAD_FOLDER, filename)
        try:
            os.remove(file_path)
        except Exception as e:
            print(f"No se pudo eliminar el archivo {file_path}. Error: {e}")

    return jsonify({'message': 'Todos los archivos subidos han sido eliminados.'}), 200

@app.route('/download/<filename>', methods=['GET'])
def download_file(filename):
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename, as_attachment=True)

@app.route('/hola', methods=['GET'])
def hola():
    return jsonify({'message': 'Hola endpoint'}), 200

if __name__ == '__main__':
    app.run(debug=True)
