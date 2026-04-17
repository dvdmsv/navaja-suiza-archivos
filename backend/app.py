from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import os
import uuid
import time
from PyPDF2 import PdfMerger, PdfReader

app = Flask(__name__)
CORS(app)

UPLOAD_FOLDER = 'uploads'
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

@app.route('/upload', methods=['POST'])
def upload_file():
    if 'files' not in request.files:
        return jsonify({'error': 'No file part'}), 400

    files = request.files.getlist('files')
    if not files or all(f.filename == '' for f in files):
        return jsonify({'error': 'No selected file'}), 400
    
    uploaded_data = []
    
    for file in files:
        if file and file.filename.lower().endswith('.pdf'):
            # 1. Generamos ID único para el sistema
            system_filename = f"{uuid.uuid4().hex}.pdf"
            file_path = os.path.join(app.config['UPLOAD_FOLDER'], system_filename)
            
            # 2. Guardamos con el nombre raro
            file.save(file_path)
            
            # 3. Guardamos la relación para devolverla al frontend
            uploaded_data.append({
                'original_name': file.filename,  # Para que el frontend sepa cuál es cual
                'system_name': system_filename   # El ID que usaremos para el merge
            })
    
    if uploaded_data:
        # Devolvemos la lista de mapeos
        return jsonify({
            'message': 'Subida correcta',
            'uploaded': uploaded_data 
        }), 200
    else:
        return jsonify({'error': 'No se pudieron procesar los archivos'}), 400

@app.route('/merge', methods=['POST'])
def merge_pdfs():
    # AHORA esperamos los nombres de sistema (UUIDs), no los originales
    system_filenames = request.json.get('files', [])
    
    if not system_filenames:
        return jsonify({'error': 'No hay archivos para combinar'}), 400

    merger = PdfMerger()
    open_files = []

    try:
        for filename in system_filenames:
            filepath = os.path.join(UPLOAD_FOLDER, filename)
            if os.path.exists(filepath):
                f = open(filepath, 'rb')
                open_files.append(f)
                merger.append(PdfReader(f))
            else:
                print(f"Archivo no encontrado en servidor: {filepath}")

        output_filename = f"merged_{int(time.time())}_{uuid.uuid4().hex[:6]}.pdf"
        output_path = os.path.join(UPLOAD_FOLDER, output_filename)

        with open(output_path, 'wb') as f_out:
            merger.write(f_out)
        
        return jsonify({'message': 'OK', 'output': output_filename}), 200

    except Exception as e:
        print(f"Error merge: {e}")
        return jsonify({'error': str(e)}), 500
    finally:
        for f in open_files: f.close()
        merger.close()

# ... (El resto de endpoints clear_uploads, download y hola siguen igual)
@app.route('/clear_uploads', methods=['POST'])
def clear_uploads():
    for f in os.listdir(UPLOAD_FOLDER):
        try:
            file_path = os.path.join(UPLOAD_FOLDER, f)
            if os.path.isfile(file_path):
                os.remove(file_path)
        except: pass
    return jsonify({'message': 'Limpiado'}), 200

@app.route('/download/<filename>', methods=['GET'])
def download_file(filename):
    if '..' in filename or filename.startswith('/'): return jsonify({'error': 'Invalido'}), 400
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename, as_attachment=True)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)