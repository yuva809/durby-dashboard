/**
 * Frontend mirror of the backend's UnitConversionService
 * (backend/src/common/units/unit-conversion.service.ts) — kept in sync
 * deliberately, not imported directly, since frontend/backend are separate
 * TypeScript projects. Used only for the live, unsaved recipe-cost preview
 * in the Menu page's RecipeEditor; the saved/authoritative estimate always
 * comes from the backend's `estimatedCost`/`conversionError` fields.
 *
 * Only same-category conversions are automatic (weight<->weight,
 * volume<->volume). Count units and cross-category pairs return null —
 * callers should treat that as "can't estimate," not "assume equal."
 */

const WEIGHT_TO_GRAMS: Record<string, number> = { mg: 0.001, g: 1, kg: 1000 };
const VOLUME_TO_ML: Record<string, number> = { ml: 1, l: 1000 };

function normalize(unit: string): string {
  return unit.trim().toLowerCase();
}

/** Returns the converted quantity, or null if the two units aren't automatically compatible. */
export function tryConvertUnit(quantity: number, fromUnit: string, toUnit: string): number | null {
  const from = normalize(fromUnit);
  const to = normalize(toUnit);
  if (from === to) return quantity;

  if (from in WEIGHT_TO_GRAMS && to in WEIGHT_TO_GRAMS) {
    return (quantity * WEIGHT_TO_GRAMS[from]) / WEIGHT_TO_GRAMS[to];
  }
  if (from in VOLUME_TO_ML && to in VOLUME_TO_ML) {
    return (quantity * VOLUME_TO_ML[from]) / VOLUME_TO_ML[to];
  }
  return null;
}
