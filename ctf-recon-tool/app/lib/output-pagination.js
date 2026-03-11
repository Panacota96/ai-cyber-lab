export const OUTPUT_PREVIEW_LINES = 4;
export const OUTPUT_PAGE_LINES = 200;

export function paginateOutput(output, pageIndex = 0, pageSize = OUTPUT_PAGE_LINES) {
  const lines = String(output || '').split('\n');
  const safePageSize = Math.max(1, Number(pageSize) || OUTPUT_PAGE_LINES);
  const totalPages = Math.max(1, Math.ceil(lines.length / safePageSize));
  const currentPage = Math.max(0, Math.min(totalPages - 1, Number(pageIndex) || 0));
  const start = currentPage * safePageSize;
  const end = Math.min(lines.length, start + safePageSize);
  return {
    lines,
    totalLines: lines.length,
    totalPages,
    currentPage,
    startLine: start + 1,
    endLine: end,
    text: lines.slice(start, end).join('\n'),
  };
}
