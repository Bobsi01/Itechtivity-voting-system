export function getBoothCode(row: number, column: number): string | null {

  const cell = row * 7 + column;
  if (cell === 17 || cell === 24) return null;

  const skippedCells = Number(cell > 17) + Number(cell > 24);
  return `CS-${String(cell + 1 - skippedCells).padStart(2, '0')}`;
}
