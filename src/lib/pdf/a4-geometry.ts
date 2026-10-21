/**
 * A4 Vellum Paper Geometry & Multi-Card Placement Mathematics
 * Standard A4: 210mm x 297mm = 595.276pt x 841.890pt (at 72pt/inch)
 * Margin: 5.0 mm = 14.1732 points on each edge
 */

export const A4_WIDTH_PT = 595.28;
export const A4_HEIGHT_PT = 841.89;
export const MARGIN_MM = 5.0;
export const MARGIN_PT = (MARGIN_MM * 72) / 25.4; // 14.1732 pt

export const PRINTABLE_WIDTH_PT = A4_WIDTH_PT - 2 * MARGIN_PT; // 566.934 pt (200.0 mm)
export const PRINTABLE_HEIGHT_PT = A4_HEIGHT_PT - 2 * MARGIN_PT; // 813.544 pt (287.0 mm)

export const CARDS_PER_ROW = 2;
export const CARDS_PER_COL = 2;
export const CARDS_PER_SHEET = CARDS_PER_ROW * CARDS_PER_COL; // 4 cards

export const CARD_WIDTH_PT = PRINTABLE_WIDTH_PT / CARDS_PER_ROW; // 283.467 pt (100.0 mm)
export const CARD_HEIGHT_PT = PRINTABLE_HEIGHT_PT / CARDS_PER_COL; // 406.772 pt (143.5 mm)

// Page Center Cut Guidelines
export const CUT_VERTICAL_X = A4_WIDTH_PT / 2; // 297.64 pt
export const CUT_HORIZONTAL_Y = A4_HEIGHT_PT / 2; // 420.945 pt

export interface CardQuadrantBounds {
  cardIndexOnSheet: number; // 0, 1, 2, 3
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Returns the exact bounding box for a card at a given quadrant index (0 to 3).
 * 0: Top-Left, 1: Top-Right, 2: Bottom-Left, 3: Bottom-Right
 */
export function getCardQuadrantBounds(cardIndexOnSheet: number): CardQuadrantBounds {
  const colIndex = cardIndexOnSheet % CARDS_PER_ROW;
  const rowIndex = Math.floor(cardIndexOnSheet / CARDS_PER_ROW);

  const x = MARGIN_PT + colIndex * CARD_WIDTH_PT;
  const y = MARGIN_PT + rowIndex * CARD_HEIGHT_PT;

  return {
    cardIndexOnSheet,
    x,
    y,
    width: CARD_WIDTH_PT,
    height: CARD_HEIGHT_PT,
  };
}

export interface CardInternalLayout {
  headerHeight: number;
  gridHeight: number;
  demographicHeight: number;
  perforationY: number;
  stubHeight: number;
  stubCount: number;
  stubWidth: number;
}

/**
 * Calculates internal coordinate offsets for elements inside each card quadrant.
 */
export function getCardInternalLayout(cardY: number): CardInternalLayout {
  const headerHeight = 42;
  const gridHeight = 240;
  const demographicHeight = 18;
  const perforationY = cardY + headerHeight + gridHeight + demographicHeight; // ~300pt from top
  const stubHeight = CARD_HEIGHT_PT - (headerHeight + gridHeight + demographicHeight); // ~106.77 pt
  const stubCount = 6;
  const stubWidth = CARD_WIDTH_PT / stubCount; // ~47.24 pt

  return {
    headerHeight,
    gridHeight,
    demographicHeight,
    perforationY,
    stubHeight,
    stubCount,
    stubWidth,
  };
}
