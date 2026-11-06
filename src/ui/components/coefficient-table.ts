import type { Calculation, SeriesResult } from '../../model/calculation.ts';

export function coefficientTable(result: SeriesResult, input: Calculation): HTMLTableElement {
  const table = document.createElement('table');
  const caption = document.createElement('caption');
  caption.textContent = `次数 ${result.startDegree}〜${input.terms - 1} · ${input.domain === 'rational' ? '有理数' : `mod ${input.modulus}`}`;
  const head = document.createElement('thead');
  const header = document.createElement('tr');
  ['次数 n', input.basis === 'ogf' ? '係数 cₙ = [xⁿ]f' : '係数 aₙ = n! [xⁿ]f'].forEach((text) => {
    const cell = document.createElement('th');
    cell.scope = 'col'; cell.textContent = text; header.append(cell);
  });
  head.append(header);
  const body = document.createElement('tbody');
  result.coefficients.forEach((coefficient, offset) => {
    const row = document.createElement('tr');
    const index = document.createElement('th');
    index.scope = 'row'; index.textContent = String(offset + result.startDegree);
    const value = document.createElement('td'); value.textContent = coefficient;
    row.append(index, value); body.append(row);
  });
  table.append(caption, head, body);
  return table;
}
