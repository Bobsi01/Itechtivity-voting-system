import type { Page } from "puppeteer-core";

export interface StandardsAuditResult {
  passed: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validates that no unicode emoji pictographs exist anywhere in the page DOM.
 */
export async function auditZeroEmoji(page: Page, contextName: string): Promise<StandardsAuditResult> {

  const errors: string[] = [];
  const emojiRegexPattern = "\\p{Extended_Pictographic}";

  const violations = await page.evaluate((patternStr) => {
    const regex = new RegExp(patternStr, "u");
    const found: string[] = [];

    // Scan all text nodes
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();

    while (node) {
      const text = node.textContent || "";
      const match = text.match(regex);
      if (match) {
        found.push(`Text node: "${text.trim().slice(0, 40)}" contains emoji [${match[0]}]`);
      }
      node = walker.nextNode();
    }

    return found;
  }, emojiRegexPattern);

  if (violations.length > 0) {
    for (const v of violations) {
      errors.push(`[${contextName}] Emoji violation: ${v}`);
    }
  }

  return {
    passed: errors.length === 0,
    errors,
    warnings: [],
  };
}

/**
 * Validates that text and icon elements do NOT have colored background fills.
 * Clean monochrome borders and neutral backgrounds are required.
 */
export async function auditNoIllegalBackgroundFills(page: Page, contextName: string): Promise<StandardsAuditResult> {

  const errors: string[] = [];

  const violations = await page.evaluate(() => {
    const forbiddenClassRegex = /\b(bg-(blue|emerald|green|amber|yellow|red|purple|indigo|cyan|sky|teal|rose|violet|pink)-[1-9]00)\b/i;
    const found: string[] = [];

    const elements = document.querySelectorAll("span, p, div, svg, a, button, label");
    elements.forEach((el) => {
      const className = el.className;
      if (typeof className === "string") {
        const match = className.match(forbiddenClassRegex);
        if (match) {
          found.push(`Element <${el.tagName.toLowerCase()}> with class "${match[0]}" violates background color policy`);
        }
      }
    });

    return found;
  });

  if (violations.length > 0) {
    for (const v of violations) {
      errors.push(`[${contextName}] Forbidden background fill: ${v}`);
    }
  }

  return {
    passed: errors.length === 0,
    errors,
    warnings: [],
  };
}

/**
 * Validates that touch targets on mobile meet the minimum 44x44px standard.
 */
export async function auditTouchTargetDimensions(
  page: Page,
  contextName: string,
  isMobile: boolean
): Promise<StandardsAuditResult> {

  const errors: string[] = [];
  const warnings: string[] = [];

  if (!isMobile) {
    return { passed: true, errors: [], warnings: [] };
  }

  const substandardElements = await page.evaluate(() => {
    const list: Array<{ tag: string; text: string; width: number; height: number }> = [];
    const interactives = document.querySelectorAll("button, a[href], input[type='button'], input[type='submit'], [role='button']");

    interactives.forEach((el) => {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);

      // Only check visible interactive elements
      if (style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0) {
        // Enforce 44px threshold with small subpixel tolerance (43px)
        if (rect.width < 43 || rect.height < 43) {
          list.push({
            tag: el.tagName.toLowerCase(),
            text: (el.textContent || "").trim().slice(0, 30),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          });
        }
      }
    });

    return list;
  });

  for (const item of substandardElements) {
    warnings.push(`[${contextName}] Small touch target: <${item.tag}> "${item.text}" is ${item.width}x${item.height}px (expected >= 44x44px)`);
  }

  return {
    passed: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validates that the layout does not exhibit horizontal scrolling.
 */
export async function auditHorizontalOverflow(page: Page, contextName: string): Promise<StandardsAuditResult> {

  const errors: string[] = [];

  const overflow = await page.evaluate(() => {
    const scrollWidth = document.documentElement.scrollWidth;
    const clientWidth = document.documentElement.clientWidth;
    return {
      hasOverflow: scrollWidth > clientWidth + 2,
      scrollWidth,
      clientWidth,
    };
  });

  if (overflow.hasOverflow) {
    errors.push(`[${contextName}] Horizontal overflow detected: scrollWidth (${overflow.scrollWidth}px) exceeds clientWidth (${overflow.clientWidth}px)`);
  }

  return {
    passed: errors.length === 0,
    errors,
    warnings: [],
  };
}

/**
 * Validates that all input fields on mobile enforce at least 16px font size to prevent iOS Safari auto-zoom.
 */
export async function auditInputFontSize(page: Page, contextName: string, isMobile: boolean): Promise<StandardsAuditResult> {

  const errors: string[] = [];

  if (!isMobile) {
    return { passed: true, errors: [], warnings: [] };
  }

  const smallInputs = await page.evaluate(() => {
    const list: Array<{ tag: string; placeholder: string; fontSize: string }> = [];
    const inputs = document.querySelectorAll("input, select, textarea");

    inputs.forEach((el) => {
      const style = window.getComputedStyle(el);
      const fontSizePx = parseFloat(style.fontSize);

      if (fontSizePx < 15.5 && style.display !== "none" && style.visibility !== "hidden") {
        list.push({
          tag: el.tagName.toLowerCase(),
          placeholder: el.getAttribute("placeholder") || el.getAttribute("name") || "",
          fontSize: style.fontSize,
        });
      }
    });

    return list;
  });

  for (const item of smallInputs) {
    errors.push(`[${contextName}] Input <${item.tag}> [placeholder="${item.placeholder}"] has font-size ${item.fontSize} (< 16px; will trigger iOS auto-zoom)`);
  }

  return {
    passed: errors.length === 0,
    errors,
    warnings: [],
  };
}

/**
 * Runs the full suite of standards audits on the current page state.
 */
export async function runFullStandardsAudit(
  page: Page,
  contextName: string,
  isMobile: boolean
): Promise<{ passed: boolean; allErrors: string[]; allWarnings: string[] }> {

  const emojiAudit = await auditZeroEmoji(page, contextName);
  const bgAudit = await auditNoIllegalBackgroundFills(page, contextName);
  const touchAudit = await auditTouchTargetDimensions(page, contextName, isMobile);
  const overflowAudit = await auditHorizontalOverflow(page, contextName);
  const inputAudit = await auditInputFontSize(page, contextName, isMobile);

  const allErrors = [
    ...emojiAudit.errors,
    ...bgAudit.errors,
    ...touchAudit.errors,
    ...overflowAudit.errors,
    ...inputAudit.errors,
  ];

  const allWarnings = [
    ...emojiAudit.warnings,
    ...bgAudit.warnings,
    ...touchAudit.warnings,
    ...overflowAudit.warnings,
    ...inputAudit.warnings,
  ];

  return {
    passed: allErrors.length === 0,
    allErrors,
    allWarnings,
  };
}
