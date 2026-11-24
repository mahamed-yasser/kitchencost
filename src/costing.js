'use strict';
// Recipe costing maths (pure). Money in integer cents (fractions of a cent are kept in intermediate maths and rounded at the end).
const UNITS = { g: ['mass', 1], kg: ['mass', 1000], ml: ['volume', 1], l: ['volume', 1000], pc: ['count', 1] };
const typeOf = (u) => { if (!UNITS[u]) throw new Error('Unknown unit ' + u); return UNITS[u][0]; };
const toBase = (qty, unit) => { typeOf(unit); return qty * UNITS[unit][1]; };
// price per base unit (g, ml or pc) from "a pack of N unit costs C cents"
const unitCost = (packQty, packUnit, packCents) => packCents / toBase(packQty, packUnit);
// cost of using qty of an ingredient in a recipe; waste_pct is trim loss (10 = buy 10% extra)
function lineCost(ing, qty, unit) {
  if (typeOf(unit) !== typeOf(ing.pack_unit)) throw new Error(`${ing.name} is measured in ${typeOf(ing.pack_unit)}, not ${typeOf(unit)}`);
  return toBase(qty, unit) * unitCost(ing.pack_qty, ing.pack_unit, ing.pack_cents) / (1 - ing.waste_pct / 100);
}
function recipeCost(lines, ings) {
  const detail = lines.map((l) => { const ing = ings.get(l.ingredient_id); return { ...l, name: ing.name, cost: lineCost(ing, l.qty, l.unit) }; });
  const total = detail.reduce((t, d) => t + d.cost, 0);
  return { lines: detail.map((d) => ({ ...d, cost_cents: Math.round(d.cost) })), total_cents: Math.round(total) };
}
// price is ex-tax. food cost % = cost / price
const foodCostPct = (costCents, priceCents) => (priceCents > 0 ? Math.round((costCents / priceCents) * 1000) / 10 : null);
// smallest price on a 5-cent step that reaches the target food cost %
const suggestPrice = (costCents, targetPct) => Math.ceil(costCents / (targetPct / 100) / 5) * 5;
// Shopping list for a production plan: needed base qty per ingredient, packs to buy (rounded up), spend.
function shopping(plan, recipes, ings) {
  const need = new Map();
  for (const p of plan) { const r = recipes.get(p.recipe_id), scale = p.portions / r.portions;
    for (const l of r.lines) { const ing = ings.get(l.ingredient_id); need.set(ing.id, (need.get(ing.id) || 0) + toBase(l.qty, l.unit) * scale / (1 - ing.waste_pct / 100)); } }
  return [...need].map(([id, base]) => { const ing = ings.get(id), pack = toBase(ing.pack_qty, ing.pack_unit), packs = Math.ceil(base / pack - 1e-9);
    return { ingredient_id: id, name: ing.name, need_base: Math.round(base * 100) / 100, base_unit: typeOf(ing.pack_unit) === 'mass' ? 'g' : typeOf(ing.pack_unit) === 'volume' ? 'ml' : 'pc', packs, pack_label: `${ing.pack_qty} ${ing.pack_unit}`, cost_cents: packs * ing.pack_cents, leftover_pct: Math.round(((packs * pack - base) / (packs * pack)) * 100) }; })
    .sort((a, b) => a.name.localeCompare(b.name));
}
module.exports = { UNITS, typeOf, toBase, unitCost, lineCost, recipeCost, foodCostPct, suggestPrice, shopping };
