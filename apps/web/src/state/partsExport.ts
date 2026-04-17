/**
 * Export inventory rows to shopping-list formats.
 *
 * - BrickLink XML: the standard "wanted-list" format their mass-upload
 *   tool accepts at https://www.bricklink.com/v2/wanted/upload.page.
 *   Rows without a BrickLink color are excluded (emitted as a comment
 *   so users can see what they'd need to source elsewhere).
 * - CSV: qty, part_id, color_id, color, name — works for spreadsheet
 *   reconciliation and Rebrickable import.
 */

import type { InventoryRow } from './inventory';

/** Escape text for inclusion inside an XML element body. */
function xmlEscape(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      case "'":
        return '&apos;';
    }
    return c;
  });
}

/** Escape a CSV field per RFC 4180 — wrap in quotes if needed. */
function csvField(s: string | number): string {
  const str = String(s);
  if (/[",\r\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

/**
 * BrickLink mass-upload XML. One `<ITEM>` per (part, color, qty) row.
 * `NOTIFY` defaults to "N" — we're building a wanted-list, not a store
 * notification. `MAXPRICE` / `CONDITION` are intentionally omitted so
 * the buyer sets them on the BL side.
 */
export function inventoryToBricklinkXml(rows: InventoryRow[]): string {
  const lines: string[] = ['<INVENTORY>'];
  for (const r of rows) {
    if (!r.blColor) {
      lines.push(
        `  <!-- skipped: no BrickLink color match for ${r.transparent ? 'trans-' : ''}${r.color} on ${xmlEscape(r.part.name)} (qty ${r.qty}) -->`,
      );
      continue;
    }
    lines.push('  <ITEM>');
    lines.push('    <ITEMTYPE>P</ITEMTYPE>');
    lines.push(`    <ITEMID>${xmlEscape(r.part.blId)}</ITEMID>`);
    lines.push(`    <COLOR>${r.blColor.id}</COLOR>`);
    lines.push(`    <MINQTY>${r.qty}</MINQTY>`);
    lines.push('    <NOTIFY>N</NOTIFY>');
    lines.push('  </ITEM>');
  }
  lines.push('</INVENTORY>');
  return lines.join('\n');
}

export function inventoryToCsv(rows: InventoryRow[]): string {
  const header = ['qty', 'part_id', 'color_id', 'color', 'name', 'transparent'];
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push(
      [
        csvField(r.qty),
        csvField(r.part.blId),
        csvField(r.blColor?.id ?? ''),
        csvField(r.blColor?.name ?? `${r.transparent ? 'trans ' : ''}${r.color} (no BL match)`),
        csvField(r.part.name),
        csvField(r.transparent ? 'yes' : 'no'),
      ].join(','),
    );
  }
  return lines.join('\n');
}
