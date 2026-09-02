import { extensionDe, tipoDeVistaPrevia } from './tipos-archivo';

describe('tipoDeVistaPrevia', () => {
  it('reconoce los PDF', () => {
    expect(tipoDeVistaPrevia('documento-combinado.pdf')).toBe('pdf');
  });

  it('reconoce las imágenes que el navegador sabe pintar', () => {
    ['foto.jpg', 'foto.jpeg', 'foto.png', 'foto.webp', 'foto.gif', 'foto.bmp', 'foto.avif',
     'codigo-qr.svg']
      .forEach(nombre => expect(tipoDeVistaPrevia(nombre), nombre).toBe('imagen'));
  });

  it('reconoce el texto plano', () => {
    ['notas.md', 'notas.txt', 'datos.csv', 'datos.json', 'datos.xml', 'pagina.html', 'pagina.htm']
      .forEach(nombre => expect(tipoDeVistaPrevia(nombre), nombre).toBe('texto'));
  });

  it('no ofrece vista previa de lo que el navegador no sabe abrir', () => {
    // .tiff lo genera "Convertir imagen", pero ningún navegador lo pinta.
    ['informe.docx', 'escaneado.tiff', 'resultados.zip', 'sinextension'].forEach(
      nombre => expect(tipoDeVistaPrevia(nombre), nombre).toBeNull());
  });

  it('no distingue mayúsculas de minúsculas', () => {
    expect(tipoDeVistaPrevia('FOTO.PNG')).toBe('imagen');
    expect(tipoDeVistaPrevia('Informe.Pdf')).toBe('pdf');
  });

  it('se queda con la última extensión', () => {
    expect(tipoDeVistaPrevia('informe.final.pdf')).toBe('pdf');
    expect(tipoDeVistaPrevia('copia.pdf.docx')).toBeNull();
  });

  it('no confunde un nombre oculto con una extensión', () => {
    // ".perfil" empieza por punto: es el nombre entero, no una extensión.
    expect(tipoDeVistaPrevia('.pdf')).toBeNull();
  });
});

describe('extensionDe', () => {
  it('devuelve la extensión en minúsculas y con punto', () => {
    expect(extensionDe('Informe.PDF')).toBe('.pdf');
  });

  it('devuelve cadena vacía si no hay extensión', () => {
    expect(extensionDe('sinextension')).toBe('');
    expect(extensionDe('.oculto')).toBe('');
  });
});
