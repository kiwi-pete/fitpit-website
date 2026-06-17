/* ============================================================
   Fit Pit analytics — country lookup
   ------------------------------------------------------------
   Returns ONLY the ISO-2 country code that Vercel's edge already
   attached to the request (x-vercel-ip-country). The raw IP is
   never read, returned, or stored — this is a privacy-safe,
   dependency-free way to get visitor country.
   ============================================================ */

export default function handler(req, res) {
  const country =
    req.headers['x-vercel-ip-country'] ||
    req.headers['x-country-code'] ||
    null;
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ country: country ? String(country).slice(0, 2).toUpperCase() : null });
}
