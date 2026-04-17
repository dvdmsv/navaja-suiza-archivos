# Usa una imagen base de Node.js para compilar Angular
FROM node:18 AS builder

# Establece el directorio de trabajo
WORKDIR /app

# Copia los archivos de Angular
COPY . /app

# Instala las dependencias de Angular
RUN npm install

# Compila la aplicación Angular
RUN npm run build --prod

# Usa una imagen de NGINX para servir el frontend
FROM nginx:alpine

# Copia la salida de Angular al servidor NGINX
COPY --from=builder /app/dist/merge-pdf/browser /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Exponer el puerto de NGINX
EXPOSE 80

# Comando para ejecutar NGINX
CMD ["nginx", "-g", "daemon off;"]