import { json, requireAdmin, safeName, mimeFor, makeToken, readToken } from "./util.js";

async function api(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (path === "/api/health") {
    return json({ ok: true, db: !!env.DB, r2: !!env.MEDIA });
  }

  if (!env.DB || !env.MEDIA) {
    return json({ error: "Bindings DB and MEDIA are not configured." }, 500);
  }

  if (path === "/api/projects" && request.method === "GET") {
    const { results } = await env.DB.prepare(
      "SELECT id,name,bpm,target_bpm,key,note,created_at FROM projects ORDER BY id DESC"
    ).all();
    return json({ projects: results || [] });
  }

  if (path === "/api/upload" && request.method === "POST") {
    if (!requireAdmin(request, env)) return json({ error: "Unauthorized" }, 401);

    const form = await request.formData();
    const name = String(form.get("name") || "").trim();
    const code = String(form.get("code") || "").trim();
    const bpm = Number(form.get("bpm") || 0) || null;
    const target_bpm = Number(form.get("target_bpm") || 0) || null;
    const key = String(form.get("key") || "").trim() || null;
    const note = String(form.get("note") || "").trim() || null;
    const audio = form.get("audio");
    const flp = form.get("flp");

    if (!name || !code || !(audio instanceof File)) {
      return json({ error: "Name, code and audio are required." }, 400);
    }

    const id = Date.now().toString(36) + "-" + crypto.randomUUID().slice(0, 8);
    const audioKey = `audio/${id}-${safeName(audio.name)}`;

    await env.MEDIA.put(audioKey, audio.stream(), {
      httpMetadata: { contentType: audio.type || mimeFor(audio.name) }
    });

    let flpKey = null;
    if (flp instanceof File && flp.size > 0) {
      flpKey = `flp/${id}-${safeName(flp.name)}`;
      await env.MEDIA.put(flpKey, flp.stream(), {
        httpMetadata: { contentType: "application/octet-stream" }
      });
    }

    const result = await env.DB.prepare(
      `INSERT INTO projects
       (name,code,bpm,target_bpm,key,note,audio_key,flp_key)
       VALUES (?,?,?,?,?,?,?,?)`
    ).bind(name, code, bpm, target_bpm, key, note, audioKey, flpKey).run();

    return json({ ok: true, id: result.meta.last_row_id });
  }

  const verify = path.match(/^\/api\/project\/(\d+)\/verify$/);
  if (verify && request.method === "POST") {
    const id = Number(verify[1]);
    const body = await request.json().catch(() => ({}));
    const code = String(body.code || "");
    const row = await env.DB.prepare("SELECT * FROM projects WHERE id = ?").bind(id).first();

    if (!row) return json({ error: "Project not found" }, 404);
    if (code !== row.code) return json({ error: "Wrong code" }, 403);

    const exp = Date.now() + 60 * 60 * 1000;
    const audioToken = await makeToken({ k: row.audio_key, exp }, env.MEDIA_TOKEN_SECRET);
    const flpToken = row.flp_key
      ? await makeToken({ k: row.flp_key, exp }, env.MEDIA_TOKEN_SECRET)
      : null;

    return json({
      project: {
        id: row.id, name: row.name, bpm: row.bpm,
        target_bpm: row.target_bpm, key: row.key, note: row.note
      },
      audio_url: `/api/media?token=${encodeURIComponent(audioToken)}`,
      flp_url: flpToken ? `/api/media?token=${encodeURIComponent(flpToken)}` : null
    });
  }

  if (path === "/api/media" && request.method === "GET") {
    const token = url.searchParams.get("token");
    const payload = token ? await readToken(token, env.MEDIA_TOKEN_SECRET) : null;
    if (!payload?.k) return new Response("Forbidden", { status: 403 });

    const obj = await env.MEDIA.get(payload.k);
    if (!obj) return new Response("Not found", { status: 404 });

    const headers = new Headers();
    obj.writeHttpMetadata(headers);
    headers.set("etag", obj.httpEtag);
    headers.set("cache-control", "private, max-age=300");
    return new Response(obj.body, { headers });
  }

  return new Response("Not found", { status: 404 });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      return api(request, env);
    }

    return env.ASSETS.fetch(request);
  }
};