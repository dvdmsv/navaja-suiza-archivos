import { Pipe, PipeTransform } from '@angular/core';

/** Convierte bytes en algo legible: `1536 | peso` → "1,5 KB". */
@Pipe({ name: 'peso', standalone: true })
export class PesoPipe implements PipeTransform {
  transform(bytes: number | null | undefined): string {
    if (bytes == null || bytes < 0) {
      return '';
    }
    if (bytes < 1024) {
      return `${bytes} B`;
    }

    const unidades = ['KB', 'MB', 'GB'];
    let valor = bytes / 1024;
    let unidad = 0;
    while (valor >= 1024 && unidad < unidades.length - 1) {
      valor /= 1024;
      unidad++;
    }
    // Un decimal sólo hasta 10, que es donde aporta información.
    const texto = valor < 10 ? valor.toFixed(1).replace('.', ',') : Math.round(valor).toString();
    return `${texto} ${unidades[unidad]}`;
  }
}
