/* ============================================================
   Fit Pit — class cards (shared)
   ------------------------------------------------------------
   The "Fitness Classes" tiles are an owner-managed collection: the owner can
   add/remove tiles and give each one a photo, all from the admin's Website
   Content editor. This module is the single source of truth for the default
   tiles, the icon set, and the public (read-only) tile markup — imported by
   both main.js (public render) and siteedit.js (editor).

   A card: { id, icon, name, trainer, desc, image }.  `image` is '' (show the
   icon) or a Supabase public URL. `icon` is one of ICON keys below.
   ============================================================ */

export const CLASS_ICONS = {
  bolt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>',
  bars: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 6.5h11M6.5 17.5h11"/><path d="M3 10.5V6a1 1 0 0 1 1-1h2.5v14H4a1 1 0 0 1-1-1v-4.5"/><path d="M21 10.5V6a1 1 0 0 0-1-1h-2.5v14H20a1 1 0 0 0 1-1v-4.5"/></svg>',
  dumbbell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.4 14.4 9.6 9.6"/><path d="M18.657 21.485a2 2 0 1 1-2.829-2.828l-1.767 1.768a2 2 0 1 1-2.829-2.829l6.364-6.364a2 2 0 1 1 2.829 2.829l-1.768 1.767a2 2 0 1 1 2.828 2.829z"/><path d="m21.5 21.5-1.4-1.4"/><path d="M3.9 3.9 2.5 2.5"/><path d="M6.404 12.768a2 2 0 1 1-2.829-2.829l1.768-1.767a2 2 0 1 1-2.828-2.829l2.828-2.828a2 2 0 1 1 2.829 2.828l1.767-1.768a2 2 0 1 1 2.829 2.829z"/></svg>',
};
export const DEFAULT_CLASS_ICON = 'dumbbell';

// Defaults MUST mirror the hardcoded tiles in index.html (they are the fallback
// shown when no override is saved and the seed the editor starts from).
export const DEFAULT_CLASS_CARDS = [
  { id: 'hiit', icon: 'bolt', name: 'HIIT The Beat', trainer: 'With G', image: '',
    desc: 'A high-energy workout synced to the rhythm of the music! Push your limits with intervals designed to torch calories and build endurance.' },
  { id: 'yoga', icon: 'clock', name: 'Yoga Sweat', trainer: 'With Veronika', image: '',
    desc: 'A high-energy class that blends yoga flow with strength and cardio. Find your balance, build flexibility, and leave feeling energised.' },
  { id: 'next', icon: 'bars', name: '"Next Level"', trainer: 'With G', image: '',
    desc: 'Take your strength and conditioning to the next level. A challenging full-body class designed to push your fitness boundaries.' },
];

export function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// The top banner of a card: the photo if set, otherwise the icon disc.
export function cardBannerHTML(card) {
  if (card.image) {
    return `<div class="class-card-photo"><img src="${esc(card.image)}" alt="${esc(card.name || 'Class')}" loading="lazy" /></div>`;
  }
  return `<div class="class-card-icon">${CLASS_ICONS[card.icon] || CLASS_ICONS[DEFAULT_CLASS_ICON]}</div>`;
}

// Read-only public tile (used by main.js when an override exists). The CTA
// hints that the tile is clickable — main.js opens the "next sessions" pop-up.
export function publicCardHTML(card) {
  const trainer = card.trainer ? `<div class="class-trainer">${esc(card.trainer)}</div>` : '';
  const desc = card.desc ? `<p>${esc(card.desc)}</p>` : '';
  const cta = '<span class="class-card-cta" aria-hidden="true">See next sessions →</span>';
  return `<div class="class-card">${cardBannerHTML(card)}<h3>${esc(card.name || '')}</h3>${trainer}${desc}${cta}</div>`;
}
