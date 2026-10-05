BEAT VAULT — Cloudflare Worker version

This package is for Cloudflare Workers + Static Assets.
It is NOT the old Pages Functions package.

Required Worker bindings:
- DB -> D1 database: beat-vault-db
- MEDIA -> R2 bucket: beat-vault-media

Required secrets:
- ADMIN_PASSWORD
- MEDIA_TOKEN_SECRET

Database:
Run schema.sql against beat-vault-db.

Important:
The Cloudflare Worker must have a real Worker entry point (src/index.js).
The previous pages_build_output_dir/functions setup was the reason bindings could not be added to your current static-only Worker.