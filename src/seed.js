'use strict';
module.exports = function seed(db, now) {
  const ago = (d) => new Date(now.getTime() - d * 864e5).toISOString();
  const I = {}; const ing = (key, name, supplier, qty, unit, cents, waste, oldCents) => { const id = Number(db.prepare('INSERT INTO ingredients(name,supplier,pack_qty,pack_unit,pack_cents,waste_pct) VALUES(?,?,?,?,?,?)').run(name, supplier, qty, unit, cents, waste).lastInsertRowid); I[key] = id;
    if (oldCents) db.prepare('INSERT INTO price_history(ingredient_id,pack_cents,at) VALUES(?,?,?)').run(id, oldCents, ago(70)); db.prepare('INSERT INTO price_history(ingredient_id,pack_cents,at) VALUES(?,?,?)').run(id, cents, ago(oldCents ? 9 : 70)); };
  ing('flour', 'Bread flour', 'Mill & Co', 25, 'kg', 2150, 0, 1900); ing('yeast', 'Dry yeast', 'Mill & Co', 500, 'g', 890, 0); ing('tom', 'Tomatoes (tinned)', 'Fresco', 2.5, 'kg', 540, 0); ing('moz', 'Mozzarella', 'Latteria', 2, 'kg', 1480, 3, 1240);
  ing('basil', 'Basil', 'Greens Ltd', 100, 'g', 320, 35); ing('oil', 'Olive oil', 'Fresco', 5, 'l', 4600, 0, 4200); ing('beef', 'Beef mince', 'Butcher Bros', 5, 'kg', 4900, 5); ing('bun', 'Burger bun', 'Mill & Co', 48, 'pc', 2160, 0);
  ing('cheddar', 'Cheddar slices', 'Latteria', 200, 'pc', 3400, 0); ing('lettuce', 'Lettuce', 'Greens Ltd', 1, 'kg', 380, 25); ing('potato', 'Potatoes', 'Greens Ltd', 10, 'kg', 1050, 18); ing('salt', 'Sea salt', 'Fresco', 1, 'kg', 190, 0);
  ing('lemon', 'Lemons', 'Greens Ltd', 1, 'kg', 360, 40); ing('cream', 'Double cream', 'Latteria', 2, 'l', 760, 0); ing('sugar', 'Sugar', 'Mill & Co', 5, 'kg', 640, 0); ing('egg', 'Eggs', 'Farm Direct', 30, 'pc', 960, 0);
  const rec = (name, cat, portions, price, target, ls) => { const id = Number(db.prepare('INSERT INTO recipes(name,category,portions,price_cents,target_pct) VALUES(?,?,?,?,?)').run(name, cat, portions, price, target).lastInsertRowid); ls.forEach(([k, q, u]) => db.prepare('INSERT INTO recipe_lines(recipe_id,ingredient_id,qty,unit) VALUES(?,?,?,?)').run(id, I[k], q, u)); };
  rec('Margherita pizza', 'Pizza', 8, 1100, 28, [['flour', 1.2, 'kg'], ['yeast', 6, 'g'], ['tom', 600, 'g'], ['moz', 800, 'g'], ['basil', 24, 'g'], ['oil', 80, 'ml'], ['salt', 24, 'g']]);
  rec('Classic cheeseburger', 'Burgers', 10, 1250, 30, [['beef', 1.5, 'kg'], ['bun', 10, 'pc'], ['cheddar', 10, 'pc'], ['lettuce', 250, 'g'], ['salt', 15, 'g']]);
  rec('Hand-cut fries', 'Sides', 10, 450, 25, [['potato', 3, 'kg'], ['oil', 400, 'ml'], ['salt', 20, 'g']]);
  rec('Lemon posset', 'Dessert', 8, 750, 25, [['cream', 1, 'l'], ['sugar', 160, 'g'], ['lemon', 400, 'g']]);
  rec('Egg custard tart', 'Dessert', 12, 600, 25, [['egg', 8, 'pc'], ['cream', 500, 'ml'], ['sugar', 120, 'g'], ['flour', 300, 'g']]);
};
