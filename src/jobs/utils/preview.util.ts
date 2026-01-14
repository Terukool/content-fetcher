/**
 * Truncate content to create a preview string.
 */
export const createPreview = (
  content: string,
  previewChars: number,
): string => {
  if (content.length <= previewChars) {
    return content;
  }
  return content.slice(0, previewChars) + '...';
};
