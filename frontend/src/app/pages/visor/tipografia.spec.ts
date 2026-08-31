import {
  INTERLINEADO, TAMANO_MAXIMO, TAMANO_MINIMO, altoDeCaja, desplazamientoBase, fuenteCss,
  otroTamano, pilaCss, tamanoValido,
} from './tipografia';

describe('tipografía del visor', () => {
  it('ofrece pilas compatibles en métricas con las fuentes del PDF', () => {
    expect(pilaCss('sans')).toContain('Arial');
    expect(pilaCss('serif')).toContain('Times New Roman');
    expect(pilaCss('mono')).toContain('Courier New');
  });

  it('arma el valor de `font` con estilo, peso y cuerpo', () => {
    expect(fuenteCss('sans', false, false, 12)).toBe('12px Helvetica, Arial, sans-serif');
    expect(fuenteCss('serif', true, true, 24)).toBe('italic bold 24px "Times New Roman", Times, serif');
  });

  it('separa las líneas base exactamente el interlineado', () => {
    // Es lo que hace que el navegador y PyMuPDF coincidan sin negociar nada.
    expect(altoDeCaja(3, 10) - altoDeCaja(2, 10)).toBeCloseTo(INTERLINEADO * 10, 6);
  });

  it('una caja vacía sigue ocupando una línea', () => {
    expect(altoDeCaja(0, 10)).toBe(altoDeCaja(1, 10));
  });

  describe('desplazamiento de la línea base', () => {
    it('crece proporcionalmente al cuerpo', () => {
      const pequeno = desplazamientoBase('sans', false, false, 10);
      const grande = desplazamientoBase('sans', false, false, 40);
      expect(grande / pequeno).toBeCloseTo(4, 6);
    });

    it('cae dentro de la caja de la línea', () => {
      for (const fuente of ['sans', 'serif', 'mono'] as const) {
        const desplazamiento = desplazamientoBase(fuente, false, false, 20);
        expect(desplazamiento).toBeGreaterThan(0);
        expect(desplazamiento).toBeLessThanOrEqual(altoDeCaja(1, 20));
      }
    });
  });

  describe('cuerpo válido', () => {
    it('recorta a los extremos admitidos', () => {
      expect(tamanoValido(0)).toBe(TAMANO_MINIMO);
      expect(tamanoValido(1000)).toBe(TAMANO_MAXIMO);
    });

    it('redondea y aguanta un valor sin sentido', () => {
      expect(tamanoValido(12.4)).toBe(12);
      expect(tamanoValido(NaN)).toBe(12);
    });
  });

  describe('escala de cuerpos', () => {
    it('sube y baja al siguiente de la escala, no de uno en uno', () => {
      expect(otroTamano(12, 1)).toBe(14);
      expect(otroTamano(12, -1)).toBe(11);
    });

    it('desde un valor que no está en la escala salta al que toca', () => {
      expect(otroTamano(13, 1)).toBe(14);
      expect(otroTamano(13, -1)).toBe(12);
    });

    it('no se sale por los extremos', () => {
      expect(otroTamano(TAMANO_MAXIMO, 1)).toBe(TAMANO_MAXIMO);
      expect(otroTamano(TAMANO_MINIMO, -1)).toBe(TAMANO_MINIMO);
    });
  });
});
