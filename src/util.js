const enc = new TextEncoder();

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers }
  });
}

export function requireAdmin(request, env) {
  const got = request.headers.get("X-Admin-Password") || "";
  return !!env.ADMIN_PASSWORD && got === env.ADMIN_PASSWORD;
}

export function safeName(name) {
  return (name || "file").replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120);
}

export async function hmac(message, secret) {
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function makeToken(payload, secret) {
  const body = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
  const sig = await hmac(body, secret);
  return `${body}.${sig}`;
}

export async function readToken(token, secret) {
  try {
    const [body, sig] = token.split(".");
    if (!body || !sig) return null;
    const expected = await hmac(body, secret);
    if (sig.length !== expected.length) return null;
    let diff = 0;
    for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
    if (diff !== 0) return null;
    const payload = JSON.parse(decodeURIComponent(escape(atob(body))));
    if (!payload.exp || Date.now() > payload.exp) return null;
    return payload;
  } catch { return null; }
}

export function mimeFor(name) {
  const n = (name || "").toLowerCase();
  if (n.endsWith(".mp3")) return "audio/mpeg";
  if (n.endsWith(".wav")) return "audio/wav";
  if (n.endsWith(".ogg")) return "audio/ogg";
  if (n.endsWith(".m4a")) return "audio/mp4";
  if (n.endsWith(".flac")) return "audio/flac";
  return "application/octet-stream";
}