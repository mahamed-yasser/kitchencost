'use strict';
const test = require('node:test'), assert = require('node:assert/strict'); const C = require('../src/costing');
const flour = { id: 1, name: 'Flour', pack_qty: 25, pack_unit: 'kg', pack_cents: 2500, waste_pct: 0 };
test('unit conversion and unit cost', () => { assert.equal(C.toBase(2, 'kg'), 2000); assert.equal(C.toBase(1.5, 'l'), 1500); assert.equal(C.unitCost(25, 'kg', 2500), 0.1); assert.throws(() => C.toBase(1, 'cup')); });
test('lineCost applies waste and rejects mismatched unit types', () => {
  assert.equal(C.lineCost(flour, 500, 'g'), 50); assert.equal(C.lineCost(flour, 0.5, 'kg'), 50);
  assert.ok(Math.abs(C.lineCost({ ...flour, waste_pct: 20 }, 500, 'g') - 62.5) < 1e-9);
  assert.throws(() => C.lineCost(flour, 1, 'l'), /mass, not volume/);
});
test('recipeCost sums lines; foodCostPct; suggestPrice rounds up to 5c', () => {
  const m = new Map([[1, flour], [2, { id: 2, name: 'Egg', pack_qty: 30, pack_unit: 'pc', pack_cents: 900, waste_pct: 0 }]]);
  const r = C.recipeCost([{ ingredient_id: 1, qty: 1, unit: 'kg' }, { ingredient_id: 2, qty: 3, unit: 'pc' }], m); assert.equal(r.total_cents, 100 + 90);
  assert.equal(C.foodCostPct(95, 400), 23.8); assert.equal(C.foodCostPct(10, 0), null);
  assert.equal(C.suggestPrice(100, 30), 335); assert.equal(C.suggestPrice(150, 30), 500); assert.ok(C.foodCostPct(100, C.suggestPrice(100, 30)) <= 30);
});
test('shopping list scales portions, adds waste and rounds up packs', () => {
  const ings = new Map([[1, flour], [3, { id: 3, name: 'Basil', pack_qty: 100, pack_unit: 'g', pack_cents: 300, waste_pct: 50 }]]);
  const recipes = new Map([[10, { id: 10, portions: 4, lines: [{ ingredient_id: 1, qty: 1, unit: 'kg' }, { ingredient_id: 3, qty: 20, unit: 'g' }] }]]);
  const out = C.shopping([{ recipe_id: 10, portions: 40 }, { recipe_id: 10, portions: 4 }], recipes, ings);
  const f = out.find((x) => x.name === 'Flour'), b = out.find((x) => x.name === 'Basil');
  assert.equal(f.need_base, 11000); assert.equal(f.packs, 1); assert.equal(f.cost_cents, 2500); assert.equal(b.need_base, 440); assert.equal(b.packs, 5); assert.equal(b.cost_cents, 1500);
});
