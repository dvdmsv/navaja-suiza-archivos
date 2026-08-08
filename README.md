# Caja de herramientas para PDF e imágenes

Aplicación web con varias utilidades para trabajar con documentos e imágenes.
El procesado ocurre en el servidor; el navegador sólo sube, ordena y descarga.

- **Frontend**: Angular 17 (standalone components) + Bootstrap 5.
- **Backend**: Flask con un blueprint por herramienta.
- **Despliegue**: Docker Compose, con nginx sirviendo el frontend y haciendo de
  pasarela hacia el backend.

## Herramientas

| Herramienta | Qué hace | Opciones |
|---|---|---|
| Unir PDF | Combina varios PDF en uno | orden por arrastre |
| PDF a JPG | Una imagen por página | 96, 150 o 300 ppp |
| Comprimir PDF | Recomprime las imágenes del documento | suave, media, fuerte |
| Comprimir imagen | Baja el peso de varias imágenes a la vez | calidad y tamaño máximo |
| Convertir imagen | Cambia de formato | JPG, PNG, WebP, TIFF, BMP, PDF |

Las herramientas de imagen aceptan varios archivos y ofrecen descargar todo en un
ZIP. "Comprimir PDF" nunca devuelve un archivo más pesado que el original: si la
compresión no mejora nada (porque el PDF ya venía optimizado), entrega el
original.

Los formatos de destino de "convertir imagen" no están escritos a mano: se le
preguntan a Pillow en el arranque, así que la interfaz nunca ofrece uno que
después falle al guardar.

## Puesta en marcha

### Con Docker (como en producción)

```bash
docker compose up --build
# http://localhost:8082
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
| `DELETE` | `/api/files/<id>` | borrar un archivo |
| `DELETE` | `/api/session` | borrar todos los archivos de la sesión |
| `POST` | `/api/tools/<slug>` | ejecutar una herramienta |
| `GET` | `/api/tools/convertir-imagen/formatos` | formatos de imagen disponibles |
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
