import type { Product, ProductUnit } from '../types';

const isAvailable = (u: ProductUnit) => !u.status || u.status === 'available';
const unitsOf = (p?: Partial<Product> | null): ProductUnit[] =>
  Array.isArray(p?.productUnits) ? (p!.productUnits as ProductUnit[]) : [];

export interface UnitChangeSummary {
  added: ProductUnit[];
  removed: ProductUnit[];
  changed: Array<{ before: ProductUnit; after: ProductUnit }>;
  stockBefore: number;
  stockAfter: number;
}

/** Compare two versions of a product's units (matched by unit id). */
export function summarizeUnitChanges(prev: Partial<Product> | null | undefined, next: Partial<Product> | null | undefined): UnitChangeSummary {
  const prevUnits = unitsOf(prev);
  const nextUnits = unitsOf(next);
  const prevById = new Map(prevUnits.map(u => [u.id, u]));
  const nextById = new Map(nextUnits.map(u => [u.id, u]));
  const added = nextUnits.filter(u => !prevById.has(u.id));
  const removed = prevUnits.filter(u => !nextById.has(u.id));
  const changed = nextUnits
    .filter(u => prevById.has(u.id))
    .map(u => ({ before: prevById.get(u.id)!, after: u }))
    .filter(({ before, after }) =>
      (before.status || 'available') !== (after.status || 'available') ||
      (before.serialNumber || '') !== (after.serialNumber || '') ||
      (before.notes || '') !== (after.notes || ''));
  return {
    added,
    removed,
    changed,
    stockBefore: Number(prev?.stockQuantity) || 0,
    stockAfter: Number(next?.stockQuantity) || 0
  };
}

/** True when the change only adds new units (pure stock inward) and touches nothing that already exists. */
export function isPureStockAddition(s: UnitChangeSummary): boolean {
  return s.removed.length === 0 && s.changed.length === 0 && s.stockAfter >= s.stockBefore;
}

/** Human readable lines describing a stock change, for approval screens. */
export function describeUnitChanges(s: UnitChangeSummary): string[] {
  const lines: string[] = [];
  if (s.stockBefore !== s.stockAfter) lines.push(`Available stock: ${s.stockBefore} → ${s.stockAfter}`);
  if (s.removed.length) lines.push(`Units removed (${s.removed.length}): ${s.removed.map(u => u.serialNumber || `#${u.unitNumber}`).slice(0, 20).join(', ')}${s.removed.length > 20 ? ' …' : ''}`);
  const statusChanges = s.changed.filter(c => (c.before.status || 'available') !== (c.after.status || 'available'));
  if (statusChanges.length) lines.push(`Status changed (${statusChanges.length}): ${statusChanges.slice(0, 20).map(c => `${c.after.serialNumber || `#${c.after.unitNumber}`} ${c.before.status || 'available'} → ${c.after.status || 'available'}`).join(', ')}${statusChanges.length > 20 ? ' …' : ''}`);
  const serialChanges = s.changed.filter(c => (c.before.serialNumber || '') !== (c.after.serialNumber || ''));
  if (serialChanges.length) lines.push(`Serial numbers edited (${serialChanges.length}): ${serialChanges.slice(0, 20).map(c => `${c.before.serialNumber} → ${c.after.serialNumber}`).join(', ')}${serialChanges.length > 20 ? ' …' : ''}`);
  if (s.added.length) lines.push(`Units added: ${s.added.length}`);
  return lines;
}

const UNIT_KEYS = new Set(['productUnits', 'serialNumbers', 'stockQuantity', 'id', 'createdAt', 'updatedAt']);

/**
 * Apply an approved edit (prev → next) on top of the product as it is NOW, so stock that moved
 * while the request was pending (dispatches, inward entries) is not overwritten by a stale snapshot.
 */
export function rebaseProductEdit(prev: Product, next: Product, current: Product): Product {
  const result: any = { ...current };

  // Plain fields: apply only the ones the requester actually changed
  const keys = new Set([...Object.keys(prev || {}), ...Object.keys(next || {})]);
  keys.forEach(k => {
    if (UNIT_KEYS.has(k)) return;
    const before = (prev as any)?.[k];
    const after = (next as any)?.[k];
    if (JSON.stringify(before) === JSON.stringify(after)) return;
    // A cleared text field must be saved as '' — undefined is dropped and the server would keep the old value
    result[k] = after === undefined && typeof before === 'string' ? '' : after;
  });

  const prevUnits = unitsOf(prev);
  const curUnits = unitsOf(current);
  const nextUnits = unitsOf(next);

  if (prevUnits.length === 0 && curUnits.length === 0 && nextUnits.length === 0) {
    // Quantity-only product: apply the requested difference to today's stock
    const delta = (Number(next.stockQuantity) || 0) - (Number(prev.stockQuantity) || 0);
    result.stockQuantity = Math.max(0, (Number(current.stockQuantity) || 0) + delta);
    return result as Product;
  }

  const summary = summarizeUnitChanges(prev, next);
  const removedIds = new Set(summary.removed.map(u => u.id));
  const changedById = new Map(summary.changed.map(c => [c.after.id, c]));

  const merged: ProductUnit[] = [];
  curUnits.forEach(u => {
    // Remove only if the unit is still in the same state the requester saw (e.g. not dispatched since)
    if (removedIds.has(u.id)) {
      const before = prevUnits.find(p => p.id === u.id);
      if ((before?.status || 'available') === (u.status || 'available')) return;
    }
    const ch = changedById.get(u.id);
    if (ch && (ch.before.status || 'available') === (u.status || 'available')) {
      merged.push({ ...u, status: ch.after.status, serialNumber: ch.after.serialNumber, notes: ch.after.notes });
    } else {
      merged.push(u);
    }
  });
  const existingIds = new Set(merged.map(u => u.id));
  let maxNum = merged.reduce((m, u) => Math.max(m, u.unitNumber || 0), 0);
  summary.added.forEach(u => {
    if (existingIds.has(u.id)) return;
    merged.push({ ...u, unitNumber: Math.max(u.unitNumber || 0, ++maxNum) });
  });
  merged.sort((a, b) => (a.unitNumber || 0) - (b.unitNumber || 0));

  const available = merged.filter(isAvailable);
  result.productUnits = merged;
  result.serialNumbers = available.map(u => u.serialNumber);
  result.stockQuantity = available.length;
  return result as Product;
}
