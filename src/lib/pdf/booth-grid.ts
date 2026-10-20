/**
 * Resolves the sequential booth code for an 8-column x 7-row Bingo Grid (52 booths).
 * The center 2x2 cell region (columns 3 & 4, rows 2 & 3) is reserved for the Master QR.
 *
 * @param row - 0-indexed row (0 to 6)
 * @param column - 0-indexed column (0 to 7)
 * @returns Booth code string (e.g. "CS-01" to "CS-52") or null if within Master QR
 */
export function getBoothCode(row: number, column: number): string | null {
  // Center 2x2 Master QR Block occupies columns 3 & 4 and rows 2 & 3
  if ((column === 3 || column === 4) && (row === 2 || row === 3)) {
    return null;
  }

  const cell = row * 8 + column;
  let skipped = 0;
  if (cell > 18) skipped += 2; // Skip top-half master cells (row 2, cols 3-4 -> cells 19, 20)
  if (cell > 26) skipped += 2; // Skip bottom-half master cells (row 3, cols 3-4 -> cells 27, 28)

  return `CS-${String(cell + 1 - skipped).padStart(2, '0')}`;
}
