/** Dónde va la firma sobre la página, en fracciones para no depender del zoom. */
export interface Colocacion {
  /** Centro de la firma, de 0 a 1 sobre el ancho y el alto de la página. */
  x: number;
  y: number;
  /** Anchura de la firma en fracción del ancho de la página. */
  ancho: number;
  /** Giro en grados, en sentido horario, como el `rotate()` de CSS. */
  rotacion: number;
}

export const COLOCACION_INICIAL: Colocacion = { x: 0.5, y: 0.8, ancho: 0.25, rotacion: 0 };

export const ANCHO_MINIMO = 0.05;
export const ANCHO_MAXIMO = 1;

export function entre(valor: number, minimo: number, maximo: number): number {
  return Math.max(minimo, Math.min(maximo, valor));
}
