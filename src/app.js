'use strict';
const path = require('node:path'); const { createApp, csv } = require('./core'); const C = require('./costing');
const UNIT_LIST = Object.keys(C.UNITS);
const SCHEMA = `
CREATE TABLE IF NOT EXISTS ingredients(id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, supplier TEXT NOT NULL DEFAULT '', pack_qty REAL NOT NULL CHECK(pack_qty>0), pack_unit TEXT NOT NULL, pack_cents INTEGER NOT NULL CHECK(pack_cents>0), waste_pct REAL NOT NULL DEFAULT 0 CHECK(waste_pct>=0 AND waste_pct<90));
CREATE TABLE IF NOT EXISTS price_history(id INTEGER PRIMARY KEY, ingredient_id INTEGER NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE, pack_cents INTEGER NOT NULL, at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS recipes(id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, category TEXT NOT NULL, portions INTEGER NOT NULL CHECK(portions>0), price_cents INTEGER NOT NULL DEFAULT 0, target_pct REAL NOT NULL DEFAULT 30);
CREATE TABLE IF NOT EXISTS recipe_lines(id INTEGER PRIMARY KEY, recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE, ingredient_id INTEGER NOT NULL REFERENCES ingredients(id), qty REAL NOT NULL CHECK(qty>0), unit TEXT NOT NULL, UNIQUE(recipe_id,ingredient_id));`;

function build({ dbFile, clock = () => new Date(), publicDir = path.join(__dirname, '..', 'public') } = {}) {
  return createApp({ dbFile, publicDir, schema: SCHEMA, appName: 'KitchenCost', seed: (db) => require('./seed')(db, clock()),
    routes(add, { db, tx, v, bad, HttpError }) {
      const ings = () => new Map(db.prepare('SELECT * FROM ingredients').all().map((i) => [i.id, i]));
      const lines = (rid) => db.prepare('SELECT * FROM recipe_lines WHERE recipe_id=? ORDER BY id').all(rid);
      const recipeView = (r, I) => { const c = C.recipeCost(lines(r.id), I); const per = Math.round(c.total_cents / r.portions);
        return { ...r, lines: c.lines, total_cents: c.total_cents, cost_per_portion_cents: per, food_cost_pct: C.foodCostPct(per, r.price_cents), margin_cents: r.price_cents - per, suggested_price_cents: per ? C.suggestPrice(per, r.target_pct) : 0, over_target: r.price_cents > 0 && per / r.price_cents * 100 > r.target_pct }; };
      const ingBody = (b) => { const unit = v.oneOf(b.pack_unit, UNIT_LIST, 'Unit'); return { name: v.str(b.name, 'Name', { max: 60 }), supplier: v.str(b.supplier, 'Supplier', { required: false, max: 60 }), pack_qty: v.num(b.pack_qty, 'Pack size', { min: 0.001 }), pack_unit: unit, pack_cents: v.int(b.pack_cents, 'Pack price', { min: 1 }), waste_pct: v.num(b.waste_pct ?? 0, 'Waste %', { max: 89 }) }; };

      add('GET', '/api/ingredients', () => {
        const rs = db.prepare('SELECT * FROM recipes').all(); const used = db.prepare('SELECT ingredient_id, COUNT(*) AS n FROM recipe_lines GROUP BY ingredient_id').all(); const um = new Map(used.map((u) => [u.ingredient_id, u.n]));
        const cutoff = new Date(clock().getTime() - 30 * 864e5).toISOString();
        return { ingredients: db.prepare('SELECT * FROM ingredients ORDER BY name').all().map((i) => {
          const old = db.prepare('SELECT pack_cents FROM price_history WHERE ingredient_id=? AND at<=? ORDER BY at DESC LIMIT 1').get(i.id, cutoff) || db.prepare('SELECT pack_cents FROM price_history WHERE ingredient_id=? ORDER BY at LIMIT 1').get(i.id);
          return { ...i, per_base: C.unitCost(i.pack_qty, i.pack_unit, i.pack_cents), used_in: um.get(i.id) || 0, change_30d_pct: old && old.pack_cents !== i.pack_cents ? Math.round(((i.pack_cents - old.pack_cents) / old.pack_cents) * 1000) / 10 : 0 }; }), recipes_total: rs.length };
      });
      add('POST', '/api/ingredients', ({ body }) => tx(() => { const b = ingBody(body); const id = Number(db.prepare('INSERT INTO ingredients(name,supplier,pack_qty,pack_unit,pack_cents,waste_pct) VALUES(?,?,?,?,?,?)').run(b.name, b.supplier, b.pack_qty, b.pack_unit, b.pack_cents, b.waste_pct).lastInsertRowid);
        db.prepare('INSERT INTO price_history(ingredient_id,pack_cents,at) VALUES(?,?,?)').run(id, b.pack_cents, clock().toISOString()); return { id }; }));
      add('PATCH', '/api/ingredients/:id', ({ params, body }) => tx(() => {
        const old = db.prepare('SELECT * FROM ingredients WHERE id=?').get(Number(params.id)); if (!old) throw new HttpError(404, 'Ingredient not found'); const b = ingBody({ ...old, ...body });
        if (C.typeOf(b.pack_unit) !== C.typeOf(old.pack_unit) && db.prepare('SELECT 1 FROM recipe_lines WHERE ingredient_id=?').get(old.id)) throw bad('Used in recipes: cannot change between weight, volume and count');
        db.prepare('UPDATE ingredients SET name=?,supplier=?,pack_qty=?,pack_unit=?,pack_cents=?,waste_pct=? WHERE id=?').run(b.name, b.supplier, b.pack_qty, b.pack_unit, b.pack_cents, b.waste_pct, old.id);
        if (b.pack_cents !== old.pack_cents) db.prepare('INSERT INTO price_history(ingredient_id,pack_cents,at) VALUES(?,?,?)').run(old.id, b.pack_cents, clock().toISOString()); return { ok: true };
      }));
      add('DELETE', '/api/ingredients/:id', ({ params }) => { if (db.prepare('SELECT 1 FROM recipe_lines WHERE ingredient_id=?').get(Number(params.id))) throw bad('This ingredient is used in a recipe'); db.prepare('DELETE FROM ingredients WHERE id=?').run(Number(params.id)); return { ok: true }; });
      add('GET', '/api/ingredients/:id/history', ({ params }) => ({ history: db.prepare('SELECT * FROM price_history WHERE ingredient_id=? ORDER BY at').all(Number(params.id)) }));
      add('GET', '/api/recipes', () => { const I = ings(); return { recipes: db.prepare('SELECT * FROM recipes ORDER BY category,name').all().map((r) => recipeView(r, I)) }; });
      add('GET', '/api/recipes/:id', ({ params }) => { const r = db.prepare('SELECT * FROM recipes WHERE id=?').get(Number(params.id)); if (!r) throw new HttpError(404, 'Recipe not found'); return { recipe: recipeView(r, ings()) }; });
      add('POST', '/api/recipes', ({ body }) => ({ id: Number(db.prepare('INSERT INTO recipes(name,category,portions,price_cents,target_pct) VALUES(?,?,?,?,?)').run(v.str(body.name, 'Name', { max: 60 }), v.str(body.category, 'Category', { max: 40 }), v.int(body.portions, 'Portions', { min: 1, max: 1000 }), v.int(body.price_cents ?? 0, 'Price'), v.num(body.target_pct ?? 30, 'Target %', { min: 5, max: 90 })).lastInsertRowid) }));
      add('PATCH', '/api/recipes/:id', ({ params, body }) => { const r = db.prepare('SELECT * FROM recipes WHERE id=?').get(Number(params.id)); if (!r) throw new HttpError(404, 'Recipe not found'); const m = { ...r, ...body };
        db.prepare('UPDATE recipes SET portions=?,price_cents=?,target_pct=? WHERE id=?').run(v.int(m.portions, 'Portions', { min: 1, max: 1000 }), v.int(m.price_cents, 'Price'), v.num(m.target_pct, 'Target %', { min: 5, max: 90 }), r.id); return { ok: true }; });
      add('DELETE', '/api/recipes/:id', ({ params }) => { db.prepare('DELETE FROM recipes WHERE id=?').run(Number(params.id)); return { ok: true }; });
      add('POST', '/api/recipes/:id/lines', ({ params, body }) => {
        const I = ings(); const ing = I.get(v.int(body.ingredient_id, 'Ingredient', { min: 1 })); if (!ing) throw bad('Unknown ingredient'); const unit = v.oneOf(body.unit, UNIT_LIST, 'Unit');
        if (C.typeOf(unit) !== C.typeOf(ing.pack_unit)) throw bad(`${ing.name} is measured in ${C.typeOf(ing.pack_unit)}, not ${C.typeOf(unit)}`);
        db.prepare('INSERT INTO recipe_lines(recipe_id,ingredient_id,qty,unit) VALUES(?,?,?,?)').run(Number(params.id), ing.id, v.num(body.qty, 'Quantity', { min: 0.001 }), unit); return { ok: true };
      });
      add('DELETE', '/api/lines/:id', ({ params }) => { db.prepare('DELETE FROM recipe_lines WHERE id=?').run(Number(params.id)); return { ok: true }; });
      add('POST', '/api/shopping', ({ body }) => {
        if (!Array.isArray(body.plan) || !body.plan.length) throw bad('Add at least one recipe to the plan'); const I = ings(); const R = new Map();
        const plan = body.plan.map((p) => { const r = db.prepare('SELECT * FROM recipes WHERE id=?').get(v.int(p.recipe_id, 'Recipe', { min: 1 })); if (!r) throw bad('Unknown recipe'); R.set(r.id, { ...r, lines: lines(r.id) }); return { recipe_id: r.id, portions: v.int(p.portions, 'Portions', { min: 1, max: 5000 }) }; });
        const list = C.shopping(plan, R, I); return { items: list, total_cents: list.reduce((t, i) => t + i.cost_cents, 0) };
      });
      add('GET', '/api/dashboard', () => { const I = ings(); const rs = db.prepare('SELECT * FROM recipes').all().map((r) => recipeView(r, I)).filter((r) => r.price_cents > 0);
        const pct = rs.length ? Math.round((rs.reduce((t, r) => t + r.food_cost_pct, 0) / rs.length) * 10) / 10 : null;
        const cutoff = new Date(clock().getTime() - 30 * 864e5).toISOString(); const rises = [];
        for (const i of I.values()) { const old = db.prepare('SELECT pack_cents FROM price_history WHERE ingredient_id=? AND at<=? ORDER BY at DESC LIMIT 1').get(i.id, cutoff) || db.prepare('SELECT pack_cents FROM price_history WHERE ingredient_id=? ORDER BY at LIMIT 1').get(i.id);
          if (old && i.pack_cents > old.pack_cents) rises.push({ id: i.id, name: i.name, change_pct: Math.round(((i.pack_cents - old.pack_cents) / old.pack_cents) * 1000) / 10, recipes: db.prepare('SELECT COUNT(DISTINCT recipe_id) AS n FROM recipe_lines WHERE ingredient_id=?').get(i.id).n }); }
        return { recipes: rs.length, avg_food_cost_pct: pct, over_target: rs.filter((r) => r.over_target).sort((a, b) => b.food_cost_pct - a.food_cost_pct), best_margin: [...rs].sort((a, b) => b.margin_cents - a.margin_cents).slice(0, 3), rises: rises.sort((a, b) => b.change_pct - a.change_pct) }; });
      add('GET', '/api/recipes.csv', () => { const I = ings(); return csv([['Recipe', 'Category', 'Portions', 'Cost per portion', 'Price', 'Food cost %', 'Target %', 'Suggested price'], ...db.prepare('SELECT * FROM recipes ORDER BY name').all().map((r) => recipeView(r, I)).map((r) => [r.name, r.category, r.portions, r.cost_per_portion_cents / 100, r.price_cents / 100, r.food_cost_pct ?? '', r.target_pct, r.suggested_price_cents / 100])]); });
    } });
}
module.exports = { build };
