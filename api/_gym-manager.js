/* ============================================================
   Fit Pit — Gym Manager member sync
   ------------------------------------------------------------
   Shared helper used by api/submit-agreement.js. When a visitor
   completes the website membership wizard we create them as a
   member in the shared "Gym Manager" Supabase project (the same
   project/tables the live ops app at `gym-manager` reads/writes),
   so the new sign-up shows up in the gym's admin app.

   The member is created exactly the way the Gym Manager app's own
   "New Member → No, save as unpaid" flow creates one:
     - status 'active'  (this is the MemberStatus, NOT a paid flag;
                         inventing an 'unpaid' status would break the
                         ops app, whose type is only 'active'|'inactive')
     - NO payment transaction is recorded, so the app's derived
       "Paid" badge stays "Unpaid" until staff records a payment.
     - the signed agreement (terms + signature + photo ID) is built
       into a single PDF, uploaded to the shared `gym-manager`
       storage bucket, and attached via members.membershipAgreement.

   Before creating, we skip if an existing member already matches by
   email (case-insensitive) or phone (digits-normalised).

   This module is intentionally additive and side-effect-safe:
   any failure here is caught by the caller and never blocks the
   visitor's confirmation or the existing email notification.

   Files starting with `_` are not exposed as Vercel routes.

   Env: SUPABASE_SERVICE_ROLE_KEY (required), SUPABASE_URL
   ============================================================ */

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { randomUUID } from 'node:crypto';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://lnxzqiydnpshaooflebs.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const BUCKET = 'gym-manager';
const AGREEMENT_FOLDER = 'member-agreements';

export function isConfigured() {
  return !!SERVICE_KEY;
}

// ---- PostgREST (service role, server-side only) ----------------------------

async function sb(path, { method = 'GET', body, repr = false } = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: repr ? 'return=representation' : 'return=minimal',
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// ---- term -> subscription tier mapping -------------------------------------
// The wizard offers: "1 Month ($85 USD)", "3 Months ($230 USD)",
// "6 Months ($365 USD)", "1 Year ($605 USD)". These map to the shared
// settings.subscriptionTiers ids ("1".."4"). `months` is the real purchased
// duration taken from the wizard label (the ops app's "Yearly Pass" tier has
// durationMonths:1 in settings — a latent data quirk — so we trust the label
// for the customer's actual term and use the tier only for name/price snapshot).
const TERM_MAP = [
  { re: /(year|annual|12\s*month)/i, tierId: '4', months: 12 },
  { re: /6\s*month/i, tierId: '3', months: 6 },
  { re: /3\s*month/i, tierId: '2', months: 3 },
  { re: /(1\s*month|monthly)/i, tierId: '1', months: 1 },
];

function mapTerm(term) {
  const t = String(term || '');
  for (const m of TERM_MAP) if (m.re.test(t)) return { tierId: m.tierId, months: m.months };
  return null;
}

// ---- duplicate detection ---------------------------------------------------

const normEmail = (e) => String(e || '').trim().toLowerCase();
const digitsOnly = (p) => String(p || '').replace(/\D/g, '');

function phonesMatch(a, b) {
  const x = digitsOnly(a);
  const y = digitsOnly(b);
  if (!x || !y) return false;
  if (x === y) return true;
  // Tolerate country-code / leading-zero differences by comparing the last 8
  // significant digits when both numbers are long enough.
  if (x.length >= 8 && y.length >= 8 && x.slice(-8) === y.slice(-8)) return true;
  return false;
}

// Returns { id, name, matchedOn } for the first existing member matching the
// given email or phone, or null. The members table is small (~50 rows) so we
// fetch the minimal columns and compare in JS (handles phone normalisation
// that PostgREST can't express).
export async function findExistingMember(email, phone) {
  const wantEmail = normEmail(email);
  const rows = (await sb('members?select=id,name,email,phone')) || [];
  if (wantEmail) {
    const hit = rows.find((m) => normEmail(m.email) === wantEmail);
    if (hit) return { id: hit.id, name: hit.name, matchedOn: 'email' };
  }
  const hitPhone = rows.find((m) => phonesMatch(m.phone, phone));
  if (hitPhone) return { id: hitPhone.id, name: hitPhone.name, matchedOn: 'phone' };
  return null;
}

// ---- settings tier snapshot ------------------------------------------------

async function getSettingsTier(tierId) {
  try {
    const rows = await sb('settings?id=eq.global&select=subscriptionTiers&limit=1');
    const tiers = (rows && rows[0] && rows[0].subscriptionTiers) || [];
    return tiers.find((t) => String(t.id) === String(tierId)) || null;
  } catch (_) {
    return null;
  }
}

// ---- agreement PDF ---------------------------------------------------------

function dataUrlToBuffer(dataUrl) {
  const s = String(dataUrl || '');
  const i = s.indexOf('base64,');
  return Buffer.from(i >= 0 ? s.slice(i + 7) : s, 'base64');
}

async function fetchBasePdf(baseUrl) {
  if (!baseUrl) return null;
  try {
    const res = await fetch(baseUrl, { signal: AbortSignal.timeout(8000) });
    if (res.ok) return new Uint8Array(await res.arrayBuffer());
  } catch (_) {
    /* fall back to a terms-less agreement page */
  }
  return null;
}

const A4 = [595.28, 841.89];

// Build a single PDF = canonical membership terms (fetched from the live site)
// + a "signed confirmation" page (member details + signature) + the uploaded
// photo ID appended as a page. Resilient: missing base terms or an
// un-embeddable ID degrade gracefully instead of throwing.
export async function buildAgreementPdf({ member, signature, idDoc, baseUrl }) {
  const baseBytes = await fetchBasePdf(baseUrl);
  let pdfDoc;
  if (baseBytes) {
    try {
      pdfDoc = await PDFDocument.load(baseBytes, { ignoreEncryption: true });
    } catch (_) {
      pdfDoc = await PDFDocument.create();
    }
  } else {
    pdfDoc = await PDFDocument.create();
  }

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontItalic = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

  // ---- signed confirmation page ----
  const page = pdfDoc.addPage(A4);
  const { width, height } = page.getSize();
  const margin = 56;
  let y = height - margin;

  page.drawText('Fit Pit ZNZ — Membership Agreement', { x: margin, y, size: 18, font: fontBold, color: rgb(0.1, 0.1, 0.1) });
  y -= 26;
  page.drawText('Signed confirmation', { x: margin, y, size: 12, font: fontItalic, color: rgb(0.45, 0.45, 0.45) });
  y -= 34;

  page.drawText('Member details', { x: margin, y, size: 13, font: fontBold, color: rgb(0.1, 0.1, 0.1) });
  y -= 22;

  const detail = [
    ['Name', member.name],
    ['Email', member.email],
    ['Phone', member.phone],
    ['Membership term', member.term],
    ['Start date', member.startDateDisplay],
    ['Date of signing', member.signingDate],
  ];
  for (const [k, v] of detail) {
    page.drawText(`${k}:`, { x: margin, y, size: 11, font: fontBold, color: rgb(0.35, 0.35, 0.35) });
    page.drawText(String(v || '—'), { x: margin + 130, y, size: 11, font, color: rgb(0.1, 0.1, 0.1) });
    y -= 20;
  }
  y -= 12;

  page.drawText('By signing below, the member acknowledges that they have read and agree to the Fit Pit', {
    x: margin, y, size: 10, font, color: rgb(0.3, 0.3, 0.3),
  });
  y -= 14;
  page.drawText('membership terms and conditions set out in this document.', {
    x: margin, y, size: 10, font, color: rgb(0.3, 0.3, 0.3),
  });
  y -= 36;

  page.drawText('Signature', { x: margin, y, size: 13, font: fontBold, color: rgb(0.1, 0.1, 0.1) });
  y -= 20;

  if (signature && signature.type === 'draw' && signature.data) {
    try {
      const png = await pdfDoc.embedPng(dataUrlToBuffer(signature.data));
      const maxW = 240;
      const maxH = 90;
      const scale = Math.min(maxW / png.width, maxH / png.height, 1);
      const w = png.width * scale;
      const h = png.height * scale;
      page.drawImage(png, { x: margin, y: y - h, width: w, height: h });
      y -= h + 8;
    } catch (_) {
      page.drawText('[drawn signature could not be rendered]', { x: margin, y: y - 16, size: 10, font: fontItalic, color: rgb(0.6, 0, 0) });
      y -= 28;
    }
  } else if (signature && signature.type === 'type' && signature.data) {
    page.drawText(String(signature.data), { x: margin, y: y - 28, size: 26, font: fontItalic, color: rgb(0.12, 0.12, 0.32) });
    y -= 42;
  } else {
    y -= 30;
  }

  page.drawLine({ start: { x: margin, y }, end: { x: margin + 260, y }, thickness: 0.8, color: rgb(0.5, 0.5, 0.5) });
  y -= 14;
  page.drawText(`Signed electronically via fitpitznz.com${member.signingDate ? ` on ${member.signingDate}` : ''}.`, {
    x: margin, y, size: 9, font: fontItalic, color: rgb(0.45, 0.45, 0.45),
  });

  // ---- appended photo ID ----
  if (idDoc && idDoc.base64) {
    const ct = String(idDoc.mimeType || '').toLowerCase();
    const idBuf = dataUrlToBuffer(idDoc.base64);
    try {
      if (ct === 'application/pdf') {
        const idPdf = await PDFDocument.load(idBuf, { ignoreEncryption: true });
        const pages = await pdfDoc.copyPages(idPdf, idPdf.getPageIndices());
        pages.forEach((p) => pdfDoc.addPage(p));
      } else if (ct === 'image/png' || ct === 'image/jpeg' || ct === 'image/jpg') {
        const img = ct === 'image/png' ? await pdfDoc.embedPng(idBuf) : await pdfDoc.embedJpg(idBuf);
        const p = pdfDoc.addPage(A4);
        p.drawText('Government photo ID', { x: margin, y: A4[1] - margin, size: 13, font: fontBold, color: rgb(0.1, 0.1, 0.1) });
        const availW = A4[0] - margin * 2;
        const availH = A4[1] - margin - 100;
        const scale = Math.min(availW / img.width, availH / img.height, 1);
        const w = img.width * scale;
        const h = img.height * scale;
        p.drawImage(img, { x: (A4[0] - w) / 2, y: A4[1] - 90 - h, width: w, height: h });
      } else {
        const p = pdfDoc.addPage(A4);
        p.drawText('Government photo ID', { x: margin, y: A4[1] - margin, size: 13, font: fontBold, color: rgb(0.1, 0.1, 0.1) });
        p.drawText(`A photo ID (${idDoc.filename || 'file'}, ${ct || 'unknown type'}) was submitted with this`, { x: margin, y: A4[1] - margin - 34, size: 11, font });
        p.drawText('agreement but its format could not be embedded here. It was delivered by email.', { x: margin, y: A4[1] - margin - 52, size: 11, font });
      }
    } catch (_) {
      const p = pdfDoc.addPage(A4);
      p.drawText('Government photo ID', { x: margin, y: A4[1] - margin, size: 13, font: fontBold, color: rgb(0.1, 0.1, 0.1) });
      p.drawText('The submitted ID could not be embedded in this document. It was delivered by email.', { x: margin, y: A4[1] - margin - 34, size: 11, font });
    }
  }

  return pdfDoc.save();
}

async function uploadAgreement(bytes, memberName) {
  const safe = String(memberName || 'member').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 40);
  const path = `${AGREEMENT_FOLDER}/${Date.now()}_${safe}.pdf`;
  const up = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/pdf',
      'x-upsert': 'true',
      'Cache-Control': 'private, max-age=31536000',
    },
    body: Buffer.from(bytes),
  });
  if (!up.ok) throw new Error(`agreement upload failed: ${up.status} ${await up.text()}`);
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
}

// ---- member creation -------------------------------------------------------

// Expiry = start + months, minus one day — matching the Gym Manager app's own
// expiry computation (MembersView auto-compute).
function computePeriod(startDate, months) {
  const start = new Date(`${startDate}T00:00:00`);
  const expiry = new Date(start);
  expiry.setMonth(expiry.getMonth() + months);
  expiry.setDate(expiry.getDate() - 1);
  return { startISO: start.toISOString(), expiryISO: expiry.toISOString() };
}

async function createUnpaidMember({ member, tier, settingsTier, agreement }) {
  const id = randomUUID();
  const now = new Date().toISOString();
  const { startISO, expiryISO } = computePeriod(member.startDate, tier.months);

  // membershipHistory entry with NO transactionId — i.e. unpaid.
  const currentPeriod = {
    startDate: startISO,
    endDate: expiryISO,
    tierId: tier.tierId,
    type: settingsTier?.type || 'subscription',
    tierNameSnapshot: settingsTier?.name || member.term,
    pricePaid: settingsTier?.price ?? 0,
  };

  const payload = {
    id,
    name: member.name,
    email: member.email,
    phone: member.phone,
    gender: 'not-specified',
    tier: tier.tierId,
    status: 'active',
    joinDate: now,
    startDate: startISO,
    expiryDate: expiryISO,
    nextBillingDate: expiryISO,
    membershipHistory: [currentPeriod],
    membershipAgreement: agreement || null,
    comments: 'Self-registered via fitpitznz.com membership wizard (unpaid).',
    inviteStatus: 'pending',
  };

  await sb('members', { method: 'POST', body: [payload] });
  return { id, startISO, expiryISO };
}

// ---- orchestrator ----------------------------------------------------------

// fields: the wizard payload (first_name,last_name,email,phone,membership_term,
//   membership_start_date,copy_of_id,signature,date_of_signing).
// baseUrl: absolute URL of the canonical terms PDF on the live site, used to
//   build the combined agreement. Optional (degrades to a terms-less page).
export async function syncMemberToGymManager(fields, baseUrl) {
  if (!isConfigured()) return { status: 'skipped', reason: 'not_configured' };

  const name = `${String(fields.first_name || '').trim()} ${String(fields.last_name || '').trim()}`.trim();
  const email = String(fields.email || '').trim();
  const phone = String(fields.phone || '').trim();

  const tier = mapTerm(fields.membership_term);
  if (!tier) return { status: 'skipped', reason: 'unknown_term', term: fields.membership_term };

  // 1) Duplicate guard — never create a second record for an existing member.
  const existing = await findExistingMember(email, phone);
  if (existing) {
    return { status: 'duplicate', memberId: existing.id, matchedOn: existing.matchedOn, name: existing.name };
  }

  const startDate = /^\d{4}-\d{2}-\d{2}$/.test(String(fields.membership_start_date || ''))
    ? fields.membership_start_date
    : new Date().toISOString().slice(0, 10);

  const settingsTier = await getSettingsTier(tier.tierId);

  // 2) Build + upload the signed agreement PDF (resilient — a failure here
  //    must not stop the member from being created).
  let agreement = null;
  try {
    const pdfBytes = await buildAgreementPdf({
      member: {
        name,
        email,
        phone,
        term: fields.membership_term,
        startDateDisplay: startDate,
        signingDate: fields.date_of_signing,
      },
      signature: fields.signature,
      idDoc: fields.copy_of_id,
      baseUrl,
    });
    const url = await uploadAgreement(pdfBytes, name);
    agreement = { name: `Membership Agreement - ${name}.pdf`, url, uploadedAt: new Date().toISOString(), contentType: 'application/pdf' };
  } catch (err) {
    console.error('Gym Manager agreement build/upload failed:', err);
  }

  // 3) Create the member (unpaid — no transaction recorded).
  const created = await createUnpaidMember({ member: { name, email, phone, startDate }, tier, settingsTier, agreement });

  return {
    status: agreement ? 'created' : 'created_without_agreement',
    memberId: created.id,
    tier: tier.tierId,
    expiry: created.expiryISO,
    agreementUrl: agreement ? agreement.url : null,
  };
}
