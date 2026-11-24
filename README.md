# KitchenCost

Recipe costing with unit conversion, waste factors, price-rise tracking and a buying list.

![KitchenCost screen](docs/01-margins.png)

![KitchenCost second screen](docs/03-recipe.png)

<img src="docs/05-mobile-recipes.png" alt="KitchenCost on a phone" width="320">

_Screenshots of the running app with fictional demo data (captured from the real app in Chrome)._

**Status: local demo, fictional data, not security-reviewed.**

## Features
- Ingredients and recipes
- Unit conversion and waste
- Price history and rise alerts
- Buying list

## Run
Requires Node 22+ (no npm install needed).

    node server.js        # http://127.0.0.1:3000 (PORT overrides; HOST is loopback unless you set it)
    npm test              # unit and API tests
    npm run e2e           # browser test, needs google-chrome
    node docs/overflow-check.js   # phone layout: no sideways page scroll at 390 and 320 px

First run: open the page and create the owner account (username, name, password of 10+ characters). There is no built-in or default account. Setup works once per database; after that it is a normal sign-in.

## Honest limits
- Fictional seed data, local use only.
- Not security-reviewed. No HTTPS, no password reset, a single owner role. Do not expose it to a network without a reverse proxy with HTTPS and your own review.
- Tests and browser checks create a throwaway owner with a random in-memory password; nothing credential-like is stored in the repo.
- Costs use the prices you enter. It is not a food-safety, allergen or tax tool.
- No supplier integration.
- Data lives in a local sqlite file; back it up yourself.
