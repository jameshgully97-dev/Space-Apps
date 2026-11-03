// Optional CORS proxy for hosting Conflict Globe on a public URL (e.g. GitHub
// Pages) without the bundled local server. Deploy as a Cloudflare Worker and
// set Settings → "CORS proxy URL" to  https://<your-worker>.workers.dev/?url=
const ALLOWED = new Set(["data.gdeltproject.org", "api.gdeltproject.org", "api.adsb.lol", "api.airplanes.live", "retrieve.pskreporter.info"]);

export default {
  async fetch(request) {
    const target = new URL(request.url).searchParams.get("url");
    let u;
    try { u = new URL(target); } catch { return new Response("bad url", { status: 400 }); }
    if (!ALLOWED.has(u.host)) return new Response("host not allowed", { status: 403 });
    const ttl = target.endsWith(".zip") ? 3600 : target.includes("pskreporter") ? 300 : 5;
    const upstream = await fetch(target, { headers: { "User-Agent": "ConflictGlobe/1.0" }, cf: { cacheTtl: ttl, cacheEverything: true } });
    const res = new Response(upstream.body, upstream);
    res.headers.set("Access-Control-Allow-Origin", "*");
    return res;
  },
};
