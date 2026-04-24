/**
 * Cheap, dependency-free slug helper. Extracted from exporters.ts so
 * importers (like PartsPanel) can get it without pulling the full
 * import/export pipeline — and its schema-validation transitive deps
 * — into the main bundle.
 */
export function slugify(title: string): string {
  const s = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return s || 'creation';
}
