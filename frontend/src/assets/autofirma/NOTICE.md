# autoscript.js

Este archivo **no es de este proyecto**. Es la librería oficial con la que una
página web se comunica con AutoFirma, la aplicación de firma electrónica del
Gobierno de España.

| | |
|---|---|
| Obra | Cliente @firma (AutoScript) |
| Versión | 1.10.1 |
| Origen | https://github.com/ctt-gob-es/clienteafirma — `afirma-ui-miniapplet-deploy/src/main/webapp/js/autoscript.js` |
| Autor | Secretaría General de Administración Digital, Gobierno de España |
| Licencia | GPL 2 o posterior / EUPL 1.1 (a elección) |
| Descargado | 1 de septiembre de 2026 |

Se incluye sin modificar. Para actualizarlo, se vuelve a descargar del
repositorio oficial y se anota aquí la versión nueva.

**Aviso sobre la licencia:** es código con copyleft dentro de un repositorio que
no declara licencia propia. Si este proyecto se publica, hay que decidir bajo qué
licencia y comprobar que es compatible; la EUPL 1.1 suele ser la opción cómoda
porque admite compatibilidad con varias licencias libres.

## Por qué está aquí

Ninguna página web puede abrir el almacén de certificados del sistema: no existe
API para ello. Lo que hacen las sedes electrónicas —y lo que hace aquí "Firmar
con certificado"— es lanzar AutoFirma, que sí vive en el equipo del usuario, para
que sea él quien enseñe el selector y firme. Esta librería es el puente: habla con
AutoFirma por un WebSocket local o por el protocolo `afirma://`.

Se carga **a mano y sólo en la herramienta de firmar** (ver
`core/autofirma.service.ts`): son 252 kB que no tiene por qué pagar quien entre a
unir dos PDF.
