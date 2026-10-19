/**
 * Utility functions and common interfaces for formatting file telemetry and attendee data.
 */

export interface PdfFileItem {
  id: string;
  batchNumber: number;
  fileName: string;
  totalCards: number;
  totalSheets: number;
  fileSizeBytes: number;
  createdAt: string;
  downloadUrl: string;
  previewUrl: string;
  status?: string;
  serialRange?: string;
}

export function formatFileSize(bytes: number): string {

  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Formats student program, year level, and section into standardized log format:
 * Example: BSCS 1 A
 */
export function formatProgramYearSection(
  program?: string | null,
  yearAndSection?: string | null
): string {

  const prog = program?.trim() || "";
  const ys = yearAndSection?.trim() || "";

  if (!prog && !ys) return "N/A";
  if (!ys) return prog;
  if (!prog) return ys;

  // If yearAndSection is "1 A", "1-A", "1A", etc.
  const match = ys.match(/^([1-5])\s*[-/]?\s*([A-Ea-e])$/);
  if (match) {
    return `${prog} ${match[1]} ${match[2].toUpperCase()}`;
  }

  return `${prog} ${ys}`;
}

export function formatBuyerType(value: string): string {

  const labels: Record<string, string> = {
    CSD_STUDENT: 'CSD student',
    NON_CSD_STUDENT: 'Non-CSD student',
    VISITOR: 'Guest / visitor',
    ALUMNI: 'Alumni',
  };
  return labels[value] || value.replaceAll('_', ' ');
}
