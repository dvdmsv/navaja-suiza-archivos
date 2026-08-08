import { PesoPipe } from './peso.pipe';

describe('PesoPipe', () => {
  const pipe = new PesoPipe();

  it('usa bytes por debajo de 1 KB', () => {
    expect(pipe.transform(0)).toBe('0 B');
    expect(pipe.transform(999)).toBe('999 B');
  });

  it('escala a la unidad adecuada', () => {
    expect(pipe.transform(1024)).toBe('1,0 KB');
    expect(pipe.transform(1536)).toBe('1,5 KB');
    expect(pipe.transform(5 * 1024 * 1024)).toBe('5,0 MB');
    expect(pipe.transform(3 * 1024 ** 3)).toBe('3,0 GB');
  });

  it('quita el decimal a partir de 10, donde ya no aporta', () => {
    expect(pipe.transform(20 * 1024)).toBe('20 KB');
  });

  it('no muestra nada si no hay dato', () => {
    expect(pipe.transform(null)).toBe('');
    expect(pipe.transform(undefined)).toBe('');
  });
});
