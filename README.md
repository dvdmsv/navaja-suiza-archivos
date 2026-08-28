# Caja de herramientas para PDF e imágenes

Aplicación web con varias utilidades para trabajar con documentos e imágenes.
El procesado ocurre en el servidor; el navegador sólo sube, ordena y descarga.

- **Frontend**: Angular 17 (standalone components) + Bootstrap 5.
- **Backend**: Flask con un blueprint por herramienta (PyMuPDF, Pillow, pypdf y
  markitdown hacen el trabajo).
- **Despliegue**: Docker Compose, con nginx sirviendo el frontend y haciendo de
  pasarela hacia el backend.

## Herramientas

| Herramienta | Qué hace | Opciones |
|---|---|---|
| Visor de PDF | Lee, busca, subraya y edita sin salir del navegador | pantalla completa, en `/visor` |
| Unir PDF | Combina varios PDF en uno | orden por arrastre |
| PDF a imagen | Una imagen por página | formato de salida, 96/150/300 ppp y calidad |
| Dividir PDF | Saca páginas sueltas o rangos | `1-3, 7, 10-`, un archivo o uno por página |
| Organizar PDF | Reordena, gira y elimina páginas | arrastre, giro de 90° y borrado |
| Proteger PDF | Pone o quita la contraseña de apertura | cifrado AES-256 |
| PDF con OCR | Reconoce el texto de un escaneado | español, inglés o ambos |
| Firmar documento | Coloca tu firma sobre un PDF o una imagen | posición libre, tamaño, giro, página |
| Comprimir PDF | Recomprime las imágenes del documento | suave, media, fuerte |
| Comprimir imagen | Baja el peso de varias imágenes a la vez | calidad y tamaño máximo |
| Convertir imagen | Cambia de formato | JPG, PNG, WebP, TIFF, BMP, PDF |
| Imagen a PDF | Reúne varias imágenes en un PDF | tamaño de página, orientación, margen y calidad |
| Documento a Markdown | Extrae el contenido para dárselo a un LLM | unir todo en un archivo |

Cualquier resultado se puede renombrar antes de descargarlo, con el lápiz que
hay junto a su nombre: como la lista de resultados es la misma para todas, la
opción está en todas las herramientas. La extensión la conserva el servidor, así
que un PDF sigue siendo un PDF por mucho que se le cambie el nombre.

Las herramientas de imagen aceptan varios archivos y ofrecen descargar todo en un
ZIP, cuyo nombre también se puede cambiar. "Comprimir PDF" nunca devuelve un archivo más pesado que el original: si la
compresión no mejora nada (porque el PDF ya venía optimizado), entrega el
original.

Los formatos de destino no están escritos a mano: se le preguntan a Pillow en el
arranque, así que la interfaz nunca ofrece uno que después falle al guardar.
"PDF a imagen" ofrece la misma lista sin PDF, y admite cualquier formato de
salida disponible; "Imagen a PDF" acepta como entrada todo lo que Pillow sepa
abrir en esta instalación.

### El visor

El visor (`/visor`) no es una herramienta de un disparo: está pensado para
trabajar con un documento durante horas. Lee, busca con o sin tildes, navega por
el índice del PDF, subraya en cuatro colores, elimina palabras del archivo, gira
y quita páginas, todo con **un solo guardado al final**.

Al abrir un documento se enseña la página entera; en pantallas estrechas se
ajusta al ancho, que es lo legible ahí. Si se cambia el ajuste, se recuerda para
los documentos siguientes.

Leyendo, al terminar de seleccionar un texto aparece un menú con qué hacer con
él —subrayar en cualquiera de los cuatro colores, eliminarlo del PDF, copiarlo o
buscarlo en el documento—, sin tener que cambiar antes de herramienta. Se apaga
desde la barra si estorba, y esa preferencia se recuerda.

Lo que lo hace ir fino con documentos densos, medido sobre un PDF de 200 páginas
con imágenes:

- **Virtualización propia** (`pages/visor/disposicion.ts`): se calculan las
  posiciones de todas las páginas sin dibujarlas y sólo se monta lo que se ve.
  De 200 páginas hay 2 en el DOM.
- **Nada se cachea como imagen**: lo dibujado vive en el lienzo que está en
  pantalla y muere con él. Recorrer el documento entero mueve la memoria de
  9,5 a 13 MB, y los nodos del DOM se quedan donde estaban. Es la diferencia
  entre aguantar tres horas o no.
- **Una página cada vez y por prioridad**, cancelando lo que sale de pantalla
  (`core/visor-render.service.ts`): el worker de pdf.js es de un solo hilo.
- Primera página a la vista en **0,4 s**; buscar en las 200 páginas, 0,2 s.

Dos cosas que este uso destapó y que están resueltas:

- **La sesión del servidor caduca a las 2 horas** y el visor no lo toca mientras
  se lee. Hay un `keepalive` cada 15 minutos con la pestaña visible y, si aun
  así el archivo ya no está al guardar, **se resube solo y reintenta**.
- **Posición, zoom y marcas sin guardar se recuerdan** entre visitas, guardados
  en el navegador contra una huella del archivo. Un refresco accidental ya no
  cuesta una hora de trabajo. La huella no usa `crypto.subtle`: no existe fuera
  de contexto seguro, y esto se sirve por HTTP en la red local.

Al eliminar palabras se usa `apply_redactions` de PyMuPDF, que **borra el texto
del archivo**: no queda debajo del rectángulo, no se puede copiar ni buscar. Los
subrayados, en cambio, son anotaciones estándar: se ven en Acrobat, se pueden
quitar una a una y el texto de debajo sigue intacto.

"PDF con OCR" cierra el círculo de "Documento a Markdown": un escaneado no
tiene texto que extraer, así que primero se le pasa el reconocimiento y después
ya se puede convertir, buscar y copiar. Lo hace
[ocrmypdf](https://github.com/ocrmypdf/OCRmyPDF), que necesita **Tesseract y
Ghostscript instalados en la imagen** —de ahí el `apt-get` del Dockerfile— y es,
con diferencia, la operación más lenta y más golosa de memoria de la
aplicación: de ahí el límite de páginas y que se ejecute como proceso aparte,
con su propio tiempo máximo.

Es también la razón de que la imagen use **Python 3.12** (ocrmypdf exige 3.11 o
superior) y de que Pillow suba a la rama 12: las versiones nuevas de
`pdfminer.six` que arrastra ocrmypdf traen consigo un `pdfplumber` que ya no
admite Pillow 10.

"Documento a Markdown" usa [markitdown](https://github.com/microsoft/markitdown)
de Microsoft y acepta PDF, Word, Excel, PowerPoint, HTML, CSV y EPub. Conserva
la estructura —títulos, listas y tablas— en vez de escupir texto plano, enseña
el resultado en pantalla con el recuento de palabras y una estimación de tokens,
y lo copia al portapapeles de un clic. Un PDF escaneado no da texto y la
herramienta lo dice claramente: no hace OCR.

Esa dependencia es la que más pesa del backend: markitdown arrastra `magika`
(detección de tipos), que a su vez trae `onnxruntime` y `numpy`, y los extras de
Office traen `pandas`. Son unos 350 MB más de imagen y un `docker compose build`
notablemente más lento. `.zip` se queda fuera de los formatos admitidos a
propósito, aunque markitdown lo soporte: descomprimir en el servidor lo que suba
cualquiera invita a una zip bomb.

Las herramientas que enseñan páginas —el visor, firmar, dividir y organizar—
rasterizan el PDF en el navegador con `core/pdf.service.ts`. Ese servicio arranca poniendo
un `Promise.try` que falta: pdf.js lo usa al decodificar imágenes y zone.js, que
carga Angular, sustituye el `Promise` nativo por uno propio que no lo trae. Sin
ese remiendo, abrir un PDF con imágenes deja una promesa que nunca resuelve y la
página se queda "preparando" para siempre.

`pdfjs-dist` es la única dependencia propia del frontend, y la comparten el
visor y las herramientas que enseñan páginas. Son ~105 kB comprimidos que sólo
descarga quien entra en una de ellas, porque cada pantalla se carga por
separado. A cambio, cambiar de página es
instantáneo y la vista previa se ve nítida en pantallas de mucha densidad. La
firma se puede subir como imagen o dibujar a mano; con un lápiz que informe de
presión (un Apple Pencil, por ejemplo) el trazo engorda y adelgaza solo, y la
mano apoyada no mancha.

Quien coloca la firma ve exactamente lo que va a salir: el recorte del fondo lo
hace el servidor y lo devuelve por `/api/tools/firmar/preparar`, en vez de
imitarlo en el navegador. Sobre un PDF la firma se inserta como imagen encima de
la página, así que el documento conserva su texto y sus fuentes: no se rasteriza.

"Imagen a PDF" compone el documento con PyMuPDF: cada imagen entra en su página
ya comprimida, centrada y sin deformar. Con el tamaño "como la imagen" la página
mide lo que la imagen (según sus ppp, o 96 si no los declara) y se limita a unos
70 cm de lado para que un JPG de muchos megapíxeles no acabe siendo un póster.

## Puesta en marcha

### Con Docker (como en producción)

```bash
docker compose up --build
# http://localhost:8081
```

### En desarrollo

Dos terminales:

```bash
# Backend en http://localhost:5000
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python app.py
```

```bash
# Frontend en http://localhost:4200, con proxy de /api hacia el backend
cd frontend
npm install
npm start
```

## Cómo está organizado

```
backend/
├── app.py              factory de Flask y registro de blueprints
├── config.py           límites y tiempos, ajustables por variables de entorno
├── storage.py          archivos temporales por sesión, con caducidad automática
├── errors.py           errores de API con una forma de respuesta única
└── api/
    ├── files.py        subida, descarga, ZIP y borrado (común a las herramientas)
    ├── params.py       lectura validada de las opciones que manda el cliente
    ├── imaging.py      abrir, redimensionar y guardar imágenes
    ├── formatos.py     qué formatos soporta esta instalación
    └── tools/          una herramienta por módulo
frontend/src/app/
├── core/               servicios transversales y catálogo de herramientas
├── shared/             piezas reutilizables: selector de archivos, marco de
│                       página, barra de acciones, lista de resultados y la
│                       clase base `PaginaHerramienta`
└── pages/              portada y una carpeta por herramienta
```

Gracias a esas piezas compartidas, cada herramienta ocupa entre 1 y 4 kB: sólo
declara su `slug`, sus opciones y su plantilla.

### Capacidad del backend

Esto se despliega en una VM modesta —1,4 GB de RAM compartidos con otras tres
aplicaciones—, así que la configuración va medida a eso:

- **Un proceso con cuatro hilos**. Atiende varias conversiones a la vez en lugar
  de encolarlas, sin pagar un segundo proceso: cada worker cuesta unos 190 MB
  cuando markitdown está cargado.
- **Plazo de 300 s**, el mismo que espera nginx. Con los valores por defecto de
  gunicorn (un proceso y 30 s) moría cualquier trabajo largo: 200 páginas a
  300 ppp en PNG tardan unos 43 s en un equipo de sobremesa, y bastante más en
  la VM.
- **markitdown se carga la primera vez que se usa**, no al arrancar. El backend
  se queda en unos 75 MB y sólo sube a ~200 MB si alguien convierte a Markdown;
  como los workers se reciclan cada 200 peticiones, esa memoria se devuelve
  sola.
- **Topes de 512 MB y 2 CPU** en `docker-compose.yml`, para que una conversión
  desbocada mate su contenedor en vez de la VM entera, y subidas limitadas a
  50 MB en producción (`MAX_CONTENT_LENGTH_MB`).

El porqué de cada opción está comentado en `backend/Dockerfile`.

### Sesiones y archivos temporales

El navegador genera un identificador de sesión y lo envía en la cabecera
`X-Session-Id`. El backend guarda los archivos en `uploads/<sesión>/`, así que
nadie ve los archivos de otra persona y "empezar de cero" sólo borra los tuyos.
Las sesiones sin actividad se eliminan solas (2 horas por defecto,
`SESSION_TTL_MINUTES`).

### La API

| Método | Ruta | Para qué |
|---|---|---|
| `POST` | `/api/files` | subir archivos (`multipart/form-data`, campo `files`) |
| `POST` | `/api/files/zip` | empaquetar varios resultados en un ZIP |
| `GET` | `/api/files/<id>/download` | descargar un archivo |
| `PATCH` | `/api/files/<id>` | cambiar el nombre de descarga (la extensión no se toca) |
| `DELETE` | `/api/files/<id>` | borrar un archivo |
| `DELETE` | `/api/session` | borrar todos los archivos de la sesión |
| `POST` | `/api/tools/<slug>` | ejecutar una herramienta |
| `GET` | `/api/tools/convertir-imagen/formatos` | formatos de imagen disponibles |
| `GET` | `/api/tools/pdf-a-imagen/formatos` | los mismos, sin PDF |
| `POST` | `/api/tools/firmar/preparar` | la firma con el fondo ya recortado, en PNG |
| `POST` | `/api/tools/visor/guardar` | aplica de una vez todo lo hecho en el visor |
| `POST` | `/api/session/keepalive` | marca la sesión como activa (la usa el visor) |
| `GET` | `/api/health` | comprobación de estado |

Todas las herramientas reciben `{"file_ids": [...]}` más sus propias opciones y
responden `{"files": [...]}`, con un `resumen` de peso cuando comprimen. Los
errores siempre responden `{"error": "mensaje para el usuario"}`.

## Añadir una herramienta nueva

Cuatro pasos, ninguno toca la configuración de nginx ni el arranque.

**1. Backend** — crea `backend/api/tools/mi_herramienta.py`:

```python
from flask import Blueprint, jsonify, request

from api import current_session
from errors import ApiError
from storage import storage

bp = Blueprint('mi_herramienta', __name__, url_prefix='/api/tools')


@bp.post('/mi-herramienta')
def mi_herramienta():
    session_id = current_session()
    datos = params.cuerpo()
    file_ids = params.ids(datos, minimo=1)
    nivel = params.opcion(datos, 'nivel', {'suave', 'fuerte'}, 'suave')

    entrada = storage.path_of(session_id, file_ids[0])
    destino, record = storage.reserve_output(session_id, 'resultado.pdf')
    # ... procesa `entrada` y escribe en `destino` ...
    return jsonify({'files': [storage.commit_output(session_id, record).to_json()]}), 201
```

Los `import` que hacen falta: `from api import current_session, params`, `from
storage import storage` y, si validas algo a mano, `from errors import ApiError`.

Y añádelo a la lista `BLUEPRINTS` de `backend/api/tools/__init__.py`.

**2. Catálogo** — añade su entrada en `frontend/src/app/core/tools.ts` con
`disponible: true`.

**3. Ruta** — regístrala en `frontend/src/app/app.routes.ts` (Angular necesita el
`import` estático para la carga diferida). El test de `core/tools.spec.ts` falla
si te saltas este paso.

**4. Página** — crea el componente en `frontend/src/app/pages/tools/<slug>/`
extendiendo `PaginaHerramienta`, que ya trae subida, progreso, ejecución,
errores y limpieza:

```ts
export class MiHerramientaComponent extends PaginaHerramienta {
  protected readonly slug = 'mi-herramienta';
  nivel = 'suave';

  protected override opciones(): Record<string, unknown> {
    return { nivel: this.nivel };
  }
}
```

```html
<app-tool-page slug="mi-herramienta">
  <app-file-queue [items]="archivos" accept=".pdf" [deshabilitado]="ocupado"
                  (agregados)="alAgregar($event)" (itemsChange)="alCambiarLista()">
  </app-file-queue>
  <!-- aquí los controles propios de la herramienta -->
  <app-tool-controls [pagina]="pagina" accion="Hacer la cosa"></app-tool-controls>
  <app-result-list [archivos]="resultados" [resumen]="resumen"></app-result-list>
</app-tool-page>
```

Usa `pages/tools/comprimir-imagen/` como referencia si tu herramienta tiene
opciones, o `pages/tools/unir-pdf/` si no las tiene.

## Pruebas

```bash
cd frontend && npm test     # tests del frontend (necesita Chrome)
```

Si la máquina no tiene Chrome instalado, sirve el que descarga Puppeteer:

```bash
npx puppeteer browsers install chrome
CHROME_BIN=$(node -e "console.log(require('puppeteer').executablePath())") \
  npx ng test --watch=false --browsers=ChromeHeadless
```

En un contenedor o en WSL puede hacer falta arrancarlo con `--no-sandbox`,
apuntando `CHROME_BIN` a un pequeño script que añada esa opción.
