import {
  Rect, aPorcentajes, aProporciones, contiene, desgirar, fusionarRects, girar, puntoAProporciones,
  seSolapan,
} from './coordenadas';

const caja = (x: number, y: number, w: number, h: number) =>
  ({ left: x, top: y, right: x + w, bottom: y + h, width: w, height: h }) as DOMRect;

describe('coordenadas del visor', () => {
  it('convierte un rectángulo de pantalla a proporciones', () => {
    const pagina = caja(100, 50, 400, 800);
    expect(aProporciones(caja(200, 250, 100, 80), pagina)).toEqual([0.25, 0.25, 0.5, 0.35]);
  });

  it('recorta lo que se sale de la página', () => {
    const pagina = caja(0, 0, 100, 100);
    expect(aProporciones(caja(-50, -50, 100, 100), pagina)).toEqual([0, 0, 0.5, 0.5]);
  });

  it('gira en sentido horario, como el visor', () => {
    // La esquina superior izquierda pasa a estar arriba a la derecha.
    const esquina: Rect = [0, 0, 0.2, 0.1];
    expect(girar(esquina, 90)).toEqual([0.9, 0, 1, 0.2]);
    expect(girar(esquina, 180)).toEqual([0.8, 0.9, 1, 1]);
    expect(girar(esquina, 270)).toEqual([0, 0.8, 0.1, 1]);
  });

  it('desgirar deshace girar', () => {
    const rect: Rect = [0.1, 0.2, 0.6, 0.35];
    for (const rotacion of [0, 90, 180, 270]) {
      const vuelta = desgirar(girar(rect, rotacion), rotacion).map(v => Math.round(v * 1000) / 1000);
      expect(vuelta).withContext(`giro de ${rotacion}°`).toEqual(rect);
    }
  });

  it('con la página girada, guarda las coordenadas sin girar', () => {
    const pagina = caja(0, 0, 100, 100);
    // Se marca arriba a la derecha de lo que se ve, con la página girada 90°:
    // en el archivo eso es la esquina superior izquierda.
    const guardado = aProporciones(caja(90, 0, 10, 20), pagina, 90);
    expect(guardado.map(v => Math.round(v * 100) / 100)).toEqual([0, 0, 0.2, 0.1]);
  });

  it('acepta giros negativos y mayores de una vuelta', () => {
    const rect: Rect = [0.1, 0.2, 0.6, 0.35];
    expect(girar(rect, -90)).toEqual(girar(rect, 270));
    expect(girar(rect, 450)).toEqual(girar(rect, 90));
  });

  it('detecta que dos marcas se pisan', () => {
    const marca: Rect = [0.1, 0.2, 0.5, 0.25];
    expect(seSolapan(marca, [0.15, 0.2, 0.55, 0.25])).toBe(true);
    expect(seSolapan(marca, marca)).toBe(true);
  });

  it('dos líneas seguidas que se rozan no cuentan como la misma marca', () => {
    // Se tocan por una franja mínima, como dos renglones consecutivos.
    expect(seSolapan([0.1, 0.20, 0.5, 0.25], [0.1, 0.249, 0.5, 0.30])).toBe(false);
    // Y las que ni se tocan, menos.
    expect(seSolapan([0.1, 0.2, 0.5, 0.25], [0.1, 0.4, 0.5, 0.45])).toBe(false);
  });

  it('sabe si un punto cae dentro de una marca', () => {
    const marca: Rect = [0.1, 0.2, 0.5, 0.25];
    expect(contiene(marca, 0.3, 0.22)).toBe(true);
    expect(contiene(marca, 0.6, 0.22)).toBe(false);
    expect(contiene(marca, 0.3, 0.5)).toBe(false);
  });

  it('sitúa un clic en proporciones, deshaciendo el giro', () => {
    const pagina = caja(0, 0, 100, 100);
    expect(puntoAProporciones(25, 50, pagina)).toEqual([0.25, 0.5]);
    // Con la página girada 90°, lo de arriba a la derecha es el origen del archivo.
    const [x, y] = puntoAProporciones(100, 0, pagina, 90);
    expect([Math.round(x * 100) / 100, Math.round(y * 100) / 100]).toEqual([0, 0]);
  });

  describe('fusionar rectángulos de una selección', () => {
    it('junta la caja del elemento con la del texto, que son la misma zona', () => {
      // Lo que devuelve el navegador al seleccionar un fragmento entero.
      const fusionados = fusionarRects([[0.1, 0.20, 0.5, 0.245], [0.1, 0.195, 0.5, 0.25]]);
      expect(fusionados).toEqual([[0.1, 0.195, 0.5, 0.25]]);
    });

    it('deja en paz las líneas distintas', () => {
      const dos: Rect[] = [[0.1, 0.2, 0.5, 0.25], [0.1, 0.3, 0.5, 0.35]];
      expect(fusionarRects(dos).length).toBe(2);
    });

    it('une los trozos seguidos de una misma línea', () => {
      const fusionados = fusionarRects([[0.1, 0.2, 0.3, 0.25], [0.3, 0.2, 0.55, 0.25]]);
      expect(fusionados).toEqual([[0.1, 0.2, 0.55, 0.25]]);
    });

    it('no une lo que está separado en la misma línea, como dos columnas', () => {
      const dos: Rect[] = [[0.05, 0.2, 0.3, 0.25], [0.6, 0.2, 0.9, 0.25]];
      expect(fusionarRects(dos).length).toBe(2);
    });

    it('encadena: si A se une con B y B con C, sale uno solo', () => {
      const fusionados = fusionarRects([
        [0.1, 0.2, 0.3, 0.25], [0.5, 0.2, 0.7, 0.25], [0.28, 0.2, 0.52, 0.25],
      ]);
      expect(fusionados).toEqual([[0.1, 0.2, 0.7, 0.25]]);
    });

    it('descarta los vacíos y devuelve el resultado ordenado', () => {
      const fusionados = fusionarRects([[0.1, 0.4, 0.5, 0.45], [0.2, 0.3, 0.2, 0.35], [0.1, 0.1, 0.5, 0.15]]);
      expect(fusionados.map(r => r[1])).toEqual([0.1, 0.4]);
    });
  });

  it('da porcentajes listos para colocar la marca', () => {
    expect(aPorcentajes([0.25, 0.1, 0.75, 0.2])).toEqual({
      left: '25%', top: '10%', width: '50%', height: '10%',
    });
  });
});
