export function range(start: number, end: number): number[] {
  const length = end - start + 1;
  return Array.from({ length }, (_, i) => start + i);
}

// Menghasilkan daftar nomor halaman dengan pola "1 2 3 4 5 ... 98" (elipsis di tengah bila perlu).
export function getPageNumbers(current: number, total: number, siblingCount = 1): (number | '...')[] {
  const totalPageNumbers = siblingCount * 2 + 5;

  if (totalPageNumbers >= total) {
    return range(1, total);
  }

  const leftSiblingIndex = Math.max(current - siblingCount, 1);
  const rightSiblingIndex = Math.min(current + siblingCount, total);
  const shouldShowLeftDots = leftSiblingIndex > 2;
  const shouldShowRightDots = rightSiblingIndex < total - 2;

  if (!shouldShowLeftDots && shouldShowRightDots) {
    const leftItemCount = 3 + 2 * siblingCount;
    return [...range(1, leftItemCount), '...', total];
  }

  if (shouldShowLeftDots && !shouldShowRightDots) {
    const rightItemCount = 3 + 2 * siblingCount;
    return [1, '...', ...range(total - rightItemCount + 1, total)];
  }

  return [1, '...', ...range(leftSiblingIndex, rightSiblingIndex), '...', total];
}
