# Netlify + MongoDB Dynamic Config Builder

This project is ready to deploy on Netlify. It includes:
- `public/configs/*.json` : Default category configs (10 ready apps)
- `netlify/functions/mongo-proxy.js` : CRUD endpoint for collections (uses whitelist + DB configs)
- `netlify/functions/config-proxy.js` : Returns config for a category (reads DB then local fallbacks)
- `netlify/functions/admin-config.js` : Admin function to add/update configs at runtime (protected by ADMIN_TOKEN)
- `netlify/functions/categories.json` : Server-side whitelist (local)
- `index.html` : Dynamic frontend that fetches config from the config-proxy function and uses mongo-proxy for data

## Environment variables to set in Netlify Site settings
- `MONGODB_URI` : MongoDB Atlas connection string (mongodb+srv://user:pass@cluster...).
- `MONGODB_DB`  : Database name (e.g., mydb)
- `ADMIN_TOKEN` : A secret token used to protect the admin-config function.

## How it works (summary)
- Frontend calls `/.netlify/functions/config-proxy?category=...` to fetch the config (fields + theme).
- Frontend calls `/.netlify/functions/mongo-proxy?category=...` to list and add items.
- Admins can POST a new config JSON to `/.netlify/functions/admin-config` with header `x-admin-token: <ADMIN_TOKEN>` to add categories at runtime.

## Deploy
1. Push this repo to GitHub.
2. Create new site on Netlify → import from GitHub.
3. Add environment variables.
4. Deploy.