# Python 3.12 porque ocrmypdf exige 3.11 o superior.
FROM python:3.12-slim

# Establece el directorio de trabajo
WORKDIR /app

# Lo que esta aplicación necesita de fuera de Python, y lo necesitan sólo dos
# herramientas:
#
#   - El reconocimiento de texto: Tesseract hace el OCR y Ghostscript el trabajo
#     con el PDF. `tesseract-ocr-spa` añade el español; el inglés viene con el
#     paquete base.
#   - "Documento a PDF": LibreOffice, y sólo `libreoffice-writer`, que arrastra
#     `libreoffice-core` y nada más. El metapaquete `libreoffice` traería Calc,
#     Impress y Base, que aquí no se usan, y multiplicaría el tamaño de la
#     imagen. `--no-install-recommends` es lo que además evita `default-jre`:
#     Writer no necesita Java para exportar a PDF y son ~180 MB de menos.
#     `fonts-liberation` da las métricas de Arial, Times New Roman y Courier
#     New, para que un .docx hecho en Windows pagine donde tiene que paginar.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ghostscript tesseract-ocr tesseract-ocr-spa \
       libreoffice-writer fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

# Las dependencias van antes que el código a propósito: así un cambio de código
# no obliga a reinstalar los ~300 MB de paquetes, que en la VM de despliegue es
# la diferencia entre un build de minutos y uno de bastante más.
COPY requirements.txt /app/
RUN pip install --no-cache-dir -r requirements.txt

# Copia los archivos de la aplicación
COPY . /app

# Exponer el puerto
EXPOSE 5000

# Usamos Gunicorn para servir la app en 0.0.0.0
# "app:app" significa: del archivo 'app.py', coge el objeto 'app'
#
# Los ajustes no son decorativos, con los valores por defecto (un worker
# síncrono y 30 s de plazo) el servidor atendía una petición cada vez y mataba
# cualquier conversión que pasara de medio minuto:
#   --workers 1 --threads 4  un solo proceso que atiende cuatro peticiones a la
#                            vez. Los hilos bastan porque PyMuPDF y Pillow
#                            sueltan el GIL mientras trabajan, y un worker de
#                            más cuesta otros ~190 MB de RAM: el valor por
#                            defecto es para una VM pequeña, no una imposición.
#                            Con memoria de sobra, `GUNICORN_WORKERS` sube.
#   --timeout 300            lo mismo que espera nginx (proxy_read_timeout):
#                            un PDF largo a 300 ppp o un markitdown recién
#                            arrancado pasan de 30 s con facilidad.
#   --max-requests           recicla los workers cada tantas peticiones, por si
#                            alguna dependencia se deja memoria por el camino.
#
# Sin --preload a propósito: precargar haría el fork después de arrancar el hilo
# que limpia las sesiones caducadas, y los hilos no sobreviven a un fork, así
# que la limpieza dejaría de ejecutarse.
# Va en forma de shell, y no como lista, porque así se pueden ajustar los tres
# valores que dependen de la máquina sin reconstruir la imagen. El `exec` no es
# decorativo: sin él gunicorn quedaría como hijo de `sh`, dejaría de recibir el
# SIGTERM al parar el contenedor y se perdería el apagado ordenado.
CMD ["sh", "-c", "exec gunicorn --bind 0.0.0.0:5000 \
     --workers ${GUNICORN_WORKERS:-1} --threads ${GUNICORN_THREADS:-4} \
     --timeout ${GUNICORN_TIMEOUT:-300} --graceful-timeout 30 \
     --max-requests 200 --max-requests-jitter 20 \
     app:app"]