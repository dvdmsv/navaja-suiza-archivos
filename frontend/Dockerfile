# Node 22 porque Angular lo exige a partir de la 20, y porque Node 18 dejó de
# recibir parches. La etiqueta sin fijar trae siempre el último 22.x, que es lo
# que quiere Angular 22 (pide 22.22.3 como mínimo).
FROM node:22 AS builder

# Establece el directorio de trabajo
WORKDIR /app

# Copia los archivos de Angular
COPY . /app

# `npm ci` y no `npm install`: instala exactamente lo que dice el
# package-lock.json y falla si los dos no concuerdan. Es lo que hace que la
# imagen se construya igual hoy que dentro de un año, y lo que evita que una
# dependencia se cuele con otra versión sin que nadie lo note.
RUN npm ci

# Compila la aplicación Angular
RUN npm run build

# Usa una imagen de NGINX para servir el frontend
FROM nginx:alpine

# Copia la salida de Angular al servidor NGINX
COPY --from=builder /app/dist/merge-pdf/browser /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Exponer el puerto de NGINX
EXPOSE 80

# Comando para ejecutar NGINX
CMD ["nginx", "-g", "daemon off;"]