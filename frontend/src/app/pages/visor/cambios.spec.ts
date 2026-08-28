import { Cambios, Marca } from './cambios';

const marca = (pagina: number, tipo: Marca['tipo'] = 'subrayado') => ({
  tipo,
  pagina,
  color: tipo === 'subrayado' ? ('amarillo' as const) : ('negro' as const),
  rects: [[0.1, 0.2, 0.5, 0.25]] as Marca['rects'],
  texto: 'lo que sea',
});

describe('cambios del visor', () => {
  it('empieza sin nada que guardar', () => {
    const cambios = new Cambios();
    expect(cambios.hayAlgo).toBe(false);
    expect(cambios.sePuedeDeshacer).toBe(false);
  });

  it('acumula marcas con identificadores distintos', () => {
    const cambios = new Cambios();
    const a = cambios.marcar(marca(1));
    const b = cambios.marcar(marca(2));
    expect(a.id).not.toBe(b.id);
    expect(cambios.marcas.length).toBe(2);
  });

  it('deshace en orden inverso', () => {
    const cambios = new Cambios();
    cambios.marcar(marca(1));
    cambios.girar(3);
    cambios.eliminar(5);

    cambios.deshacer();
    expect(cambios.eliminadas.has(5)).toBe(false);
    cambios.deshacer();
    expect(cambios.rotacionDe(3)).toBe(0);
    cambios.deshacer();
    expect(cambios.marcas.length).toBe(0);
    expect(cambios.sePuedeDeshacer).toBe(false);
  });

  it('deshacer devuelve la marca a su sitio en la lista', () => {
    const cambios = new Cambios();
    cambios.marcar(marca(1));
    const enMedio = cambios.marcar(marca(2));
    cambios.marcar(marca(3));

    cambios.quitarMarca(enMedio.id);
    expect(cambios.marcas.map(m => m.pagina)).toEqual([1, 3]);
    cambios.deshacer();
    expect(cambios.marcas.map(m => m.pagina)).toEqual([1, 2, 3]);
  });

  it('gira en múltiplos de 90 y vuelve a cero al dar la vuelta', () => {
    const cambios = new Cambios();
    cambios.girar(1);
    cambios.girar(1);
    expect(cambios.rotacionDe(1)).toBe(180);
    cambios.girar(1);
    cambios.girar(1);
    expect(cambios.rotacionDe(1)).toBe(0);
    // Sin giro no hay nada que guardar de esa página.
    expect(cambios.rotaciones.size).toBe(0);
  });

  it('la petición conserva los números de página originales', () => {
    const cambios = new Cambios();
    cambios.marcar(marca(5));
    cambios.eliminar(2);

    const peticion = cambios.aPeticion(6) as any;
    expect(peticion.subrayados[0].pagina).toBe(5);
    expect(peticion.paginas.map((p: any) => p.numero)).toEqual([1, 3, 4, 5, 6]);
  });

  it('no manda marcas de páginas que se van a eliminar', () => {
    const cambios = new Cambios();
    cambios.marcar(marca(3));
    cambios.eliminar(3);
    expect((cambios.aPeticion(4) as any).subrayados.length).toBe(0);
  });

  it('separa subrayados de tachados', () => {
    const cambios = new Cambios();
    cambios.marcar(marca(1, 'subrayado'));
    cambios.marcar(marca(1, 'tachado'));
    const peticion = cambios.aPeticion(2) as any;
    expect(peticion.subrayados.length).toBe(1);
    expect(peticion.tachados.length).toBe(1);
  });

  it('sustituir una marca cuenta como un solo paso al deshacer', () => {
    const cambios = new Cambios();
    const vieja = cambios.marcar(marca(1));

    const nueva = cambios.marcar({ ...marca(1), color: 'verde' }, [vieja.id]);
    expect(cambios.marcas.map(m => m.id)).toEqual([nueva.id]);
    expect(cambios.marcas[0].color).toBe('verde');

    cambios.deshacer();
    // De una vez: vuelve la vieja y se va la nueva, sin estados intermedios.
    expect(cambios.marcas.map(m => m.id)).toEqual([vieja.id]);
    expect(cambios.marcas[0].color).toBe('amarillo');
  });

  it('la sustituida vuelve a su sitio en la lista', () => {
    const cambios = new Cambios();
    cambios.marcar(marca(1));
    const enMedio = cambios.marcar(marca(2));
    cambios.marcar(marca(3));

    cambios.marcar(marca(2), [enMedio.id]);
    cambios.deshacer();
    expect(cambios.marcas.map(m => m.pagina)).toEqual([1, 2, 3]);
  });

  it('encuentra las marcas del mismo tipo que pisan una zona', () => {
    const cambios = new Cambios();
    const subrayado = cambios.marcar(marca(1));
    cambios.marcar(marca(1, 'tachado'));
    cambios.marcar({ ...marca(1), rects: [[0.1, 0.8, 0.5, 0.85]] });

    // Sólo la del mismo tipo y en la misma zona.
    expect(cambios.solapadas(1, 'subrayado', [[0.12, 0.2, 0.5, 0.25]])).toEqual([subrayado.id]);
    // Y nada en una página distinta.
    expect(cambios.solapadas(2, 'subrayado', [[0.1, 0.2, 0.5, 0.25]])).toEqual([]);
  });

  it('cambia el color y lo deshace', () => {
    const cambios = new Cambios();
    const puesta = cambios.marcar(marca(1));

    cambios.cambiarColor(puesta.id, 'azul');
    expect(cambios.marcas[0].color).toBe('azul');
    cambios.deshacer();
    expect(cambios.marcas[0].color).toBe('amarillo');
  });

  it('poner el mismo color no gasta un paso de deshacer', () => {
    const cambios = new Cambios();
    const puesta = cambios.marcar(marca(1));
    cambios.cambiarColor(puesta.id, 'amarillo');
    cambios.deshacer();
    expect(cambios.marcas.length).toBe(0);
  });

  it('sobrevive a una ida y vuelta por el borrador', () => {
    const cambios = new Cambios();
    cambios.marcar(marca(1));
    cambios.girar(2, 90);
    cambios.eliminar(4);

    const vuelto = Cambios.desdeBorrador(JSON.parse(JSON.stringify(cambios.aBorrador())));
    expect(vuelto.marcas.length).toBe(1);
    expect(vuelto.rotacionDe(2)).toBe(90);
    expect(vuelto.eliminadas.has(4)).toBe(true);
    // Y los identificadores siguen sin repetirse.
    expect(vuelto.marcar(marca(9)).id).not.toBe(cambios.marcas[0].id);
  });
});
