# Usa una imagen base de Python
FROM python:3.10-slim

# Establece el directorio de trabajo
WORKDIR /app

# Copia los archivos de la aplicación
COPY . /app

# Instala las dependencias (ahora incluye gunicorn)
RUN pip install --no-cache-dir -r requirements.txt

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
#                            más costaría otros ~190 MB de RAM: esto se
#                            despliega en una VM con 1,4 GB para cuatro
#                            aplicaciones, no en un equipo de sobremesa.
#   --timeout 300            lo mismo que espera nginx (proxy_read_timeout):
#                            un PDF largo a 300 ppp o un markitdown recién
#                            arrancado pasan de 30 s con facilidad.
#   --max-requests           recicla los workers cada tantas peticiones, por si
#                            alguna dependencia se deja memoria por el camino.
#
# Sin --preload a propósito: precargar haría el fork después de arrancar el hilo
# que limpia las sesiones caducadas, y los hilos no sobreviven a un fork, así
# que la limpieza dejaría de ejecutarse.
CMD ["gunicorn", "--bind", "0.0.0.0:5000", \
     "--workers", "1", "--threads", "4", \
     "--timeout", "300", "--graceful-timeout", "30", \
     "--max-requests", "200", "--max-requests-jitter", "20", \
     "app:app"]