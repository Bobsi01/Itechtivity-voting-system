import {
  A4_WIDTH_PT,
  A4_HEIGHT_PT,
  MARGIN_PT,
  PRINTABLE_WIDTH_PT,
  PRINTABLE_HEIGHT_PT,
  CARDS_PER_ROW,
  CARDS_PER_COL,
  CARDS_PER_SHEET,
  CARD_WIDTH_PT,
  CARD_HEIGHT_PT,
  CUT_VERTICAL_X,
  CUT_HORIZONTAL_Y,
  getCardQuadrantBounds,
  getCardInternalLayout,
} from './a4-geometry';

function runGeometryTests() {
  console.log('Running A4 Paper & Card Geometry Verification...');
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string) {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName}`);
      failed++;
    }
  }

  // Test 1: Standard A4 dimensions
  assert(Math.abs(A4_WIDTH_PT - 595.28) < 0.01, 'A4 Width is 595.28 pt');
  assert(Math.abs(A4_HEIGHT_PT - 841.89) < 0.01, 'A4 Height is 841.89 pt');

  // Test 2: Margins of 5.0 mm (14.1732 pt)
  assert(Math.abs(MARGIN_PT - 14.1732) < 0.001, '5.0 mm margin equals ~14.1732 pt');
  assert(Math.abs(PRINTABLE_WIDTH_PT - 566.934) < 0.01, 'Printable width is 566.93 pt (200 mm)');
  assert(Math.abs(PRINTABLE_HEIGHT_PT - 813.544) < 0.01, 'Printable height is 813.54 pt (287 mm)');

  // Test 3: Exactly 4 cards per sheet
  assert(CARDS_PER_SHEET === 4, 'Exactly 4 cards per sheet');
  assert(Math.abs(CARD_WIDTH_PT - 283.467) < 0.01, 'Card width is 283.47 pt (100 mm)');
  assert(Math.abs(CARD_HEIGHT_PT - 406.772) < 0.01, 'Card height is 406.77 pt (143.5 mm)');

  // Test 4: All 4 quadrants stay strictly within printable bounds
  for (let i = 0; i < 4; i++) {
    const bounds = getCardQuadrantBounds(i);
    assert(bounds.x >= MARGIN_PT - 0.001, `Card ${i} X (${bounds.x.toFixed(2)}) >= left margin (${MARGIN_PT})`);
    assert(bounds.x + bounds.width <= A4_WIDTH_PT - MARGIN_PT + 0.001, `Card ${i} Right edge <= right margin`);
    assert(bounds.y >= MARGIN_PT - 0.001, `Card ${i} Y (${bounds.y.toFixed(2)}) >= top margin (${MARGIN_PT})`);
    assert(bounds.y + bounds.height <= A4_HEIGHT_PT - MARGIN_PT + 0.001, `Card ${i} Bottom edge <= bottom margin`);
  }

  // Test 5: Center cutting guidelines match sheet bisectors
  assert(Math.abs(CUT_VERTICAL_X - A4_WIDTH_PT / 2) < 0.001, 'Vertical cut line perfectly bisects sheet');
  assert(Math.abs(CUT_HORIZONTAL_Y - A4_HEIGHT_PT / 2) < 0.001, 'Horizontal cut line perfectly bisects sheet');

  // Test 6: Internal layout elements fit card height
  const internal = getCardInternalLayout(MARGIN_PT);
  const totalInternal = internal.headerHeight + internal.gridHeight + internal.demographicHeight + internal.stubHeight;
  assert(Math.abs(totalInternal - CARD_HEIGHT_PT) < 0.01, 'Internal components exactly sum to card height');
  assert(internal.stubCount === 6, 'Exactly 6 vertical stubs');
  assert(Math.abs(internal.stubWidth * 6 - CARD_WIDTH_PT) < 0.01, '6 stubs span entire card width');

  console.log(`\nResults: ${passed} passed, ${failed} failed.`);
  if (failed > 0) {
    process.exit(1);
  }
}

runGeometryTests();
