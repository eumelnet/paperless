import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import rateLimit from "express-rate-limit";

const app = express();
app.use(cors());

// Rate-Limiting für Public Access
const limiter = rateLimit({ windowMs: 60 * 1000, max: 30 });
app.use(limiter);

const PAPERLESS_BASE = process.env.PAPERLESS_URL || "https://paperless.b.eumel.de";
const PAPERLESS_API  = `${PAPERLESS_BASE}/api/documents/`;
const API_TOKEN      = process.env.PAPERLESS_TOKEN;

// Such-Endpoint
app.get("/search", async (req, res) => {
  const q = req.query.q;
  if (!q) return res.json([]);

  try {
    const r = await fetch(
      `${PAPERLESS_API}?query=${encodeURIComponent(q)}&page_size=50`,
      { headers: { Authorization: `Token ${API_TOKEN}` } }
    );

    if (!r.ok) {
      const text = await r.text();
      console.error("Paperless API error:", r.status, text);
      return res.status(502).json({ error: "Paperless API nicht erreichbar" });
    }

    const data = await r.json();

    // Nur Dokumente mit Tag-Name "public" – Tags sind IDs, daher Namen-Lookup nötig.
    // Vereinfacht: alle Ergebnisse zurückgeben wenn kein Tag-Filter konfiguriert.
    // Für Tag-Filterung: öffentliche Tag-ID per Env-Variable setzen: PUBLIC_TAG_ID=<id>
    const publicTagId = process.env.PUBLIC_TAG_ID ? parseInt(process.env.PUBLIC_TAG_ID) : null;

    const filtered = publicTagId
      ? (data.results || []).filter(d => Array.isArray(d.tags) && d.tags.includes(publicTagId))
      : (data.results || []);

    const response = filtered.map(d => ({
      title:    d.title    || d.original_file_name || d.archived_file_name || "Ohne Titel",
      filename: d.original_file_name || d.archived_file_name || d.title || "",
      created:  d.created  || null,
      url:      `/download/${d.id}`,
    }));

    res.json(response);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Interner Serverfehler" });
  }
});

// Download-Proxy: Token bleibt serverseitig, Browser braucht keine Auth
app.get("/download/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (!id || id <= 0) return res.status(400).send("Ungültige Dokument-ID");

  try {
    const upstream = await fetch(
      `${PAPERLESS_BASE}/api/documents/${id}/download/`,
      { headers: { Authorization: `Token ${API_TOKEN}` } }
    );

    if (!upstream.ok) {
      return res.status(upstream.status).send("Dokument nicht gefunden oder nicht zugänglich");
    }

    // Content-Type und Content-Disposition vom Upstream übernehmen
    const contentType = upstream.headers.get("content-type") || "application/octet-stream";
    const disposition = upstream.headers.get("content-disposition") || "attachment";
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", disposition);

    upstream.body.pipe(res);
  } catch (err) {
    console.error("Download-Proxy Fehler:", err);
    res.status(500).send("Download fehlgeschlagen");
  }
});

// Statisches Frontend aus public/
app.use(express.static("public"));

app.listen(3000, "0.0.0.0", () => {
  console.log("Eisenbahntechnik-Archiv läuft auf http://0.0.0.0:3000");
});
