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
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "app:app"]