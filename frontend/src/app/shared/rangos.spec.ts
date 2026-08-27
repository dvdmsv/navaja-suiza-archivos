import { comprimirRangos, expandirRangos } from './rangos';

describe('rangos de páginas', () => {
  it('expande números y rangos', () => {
    expect(expandirRangos('1-3, 7', 10)).toEqual([1, 2, 3, 7]);
  });

  it('entiende los rangos abiertos por los dos lados', () => {
    expect(expandirRangos('8-', 10)).toEqual([8, 9, 10]);
    expect(expandirRangos('-3', 10)).toEqual([1, 2, 3]);
  });

  it('recorta lo que se sale del documento y descarta lo que no entiende', () => {
    expect(expandirRangos('5-99', 6)).toEqual([5, 6]);
    expect(expandirRangos('hola, 2', 6)).toEqual([2]);
    expect(expandirRangos('0', 6)).toEqual([]);
  });

  it('no repite páginas y las devuelve ordenadas', () => {
    expect(expandirRangos('7 2 7 1-2', 10)).toEqual([1, 2, 7]);
  });

  it('comprime listas a rangos legibles', () => {
    expect(comprimirRangos([1, 2, 3, 7])).toBe('1-3, 7');
    expect(comprimirRangos([4])).toBe('4');
    expect(comprimirRangos([])).toBe('');
  });

  it('ida y vuelta sin pérdidas', () => {
    const paginas = [1, 2, 3, 9, 10, 15];
    expect(expandirRangos(comprimirRangos(paginas), 20)).toEqual(paginas);
  });
});
