// Template = the reusable ad bundle an agency builds once and clients launch.
// It compiles down to the Meta object tree (Campaign -> AdSet -> Creative -> Ad).
// See architecture doc §3 for the mapping.

const { db } = require("./store");

function seedTemplates(resellerId) {
  const templates = [
    {
      id: "tpl_re_buyers",
      resellerId,
      name: "Real Estate — Free Home Buyer Guide",
      niche: "real_estate",
      objective: "OUTCOME_LEADS",
      targeting: {
        geoRadiusMiles: 15,
        ageMin: 28,
        ageMax: 65,
        placements: ["facebook_feed", "instagram_feed"],
      },
      creative: {
        // {{offer}} tokens are filled in with the client's input at launch.
        primaryText: "Thinking of buying in {{city}}? Grab our free buyer's guide: {{offer}}",
        headline: "Free Home Buyer Guide",
        description: "No obligation. Instant download.",
        cta: "DOWNLOAD",
      },
      leadForm: { fields: ["full_name", "email", "phone"], name: "Buyer Guide Form" },
    },
    {
      id: "tpl_re_listing",
      resellerId,
      name: "Real Estate — Just Listed Open House",
      niche: "real_estate",
      objective: "OUTCOME_LEADS",
      targeting: { geoRadiusMiles: 10, ageMin: 30, ageMax: 65, placements: ["facebook_feed"] },
      creative: {
        primaryText: "Just listed in {{city}}! {{offer}} Book a private showing today.",
        headline: "Open House This Weekend",
        description: "Limited slots available.",
        cta: "BOOK_NOW",
      },
      leadForm: { fields: ["full_name", "phone"], name: "Showing Request" },
    },
    {
      id: "tpl_medspa_promo",
      resellerId,
      name: "Med Spa — New Client Promo",
      niche: "med_spa",
      objective: "OUTCOME_LEADS",
      targeting: { geoRadiusMiles: 12, ageMin: 25, ageMax: 60, placements: ["instagram_feed", "facebook_feed"] },
      creative: {
        primaryText: "New to {{city}}? {{offer}} Claim your new-client offer this month.",
        headline: "New Client Special",
        description: "Book online in seconds.",
        cta: "BOOK_NOW",
      },
      leadForm: { fields: ["full_name", "email", "phone"], name: "New Client Offer" },
    },
  ];
  templates.forEach((t) => db.templates.set(t.id, t));
  return templates;
}

// Fill template tokens with the client's offer inputs.
function compileCreative(template, offer) {
  const fill = (s) =>
    s.replace(/\{\{(\w+)\}\}/g, (_, k) => (offer[k] != null ? String(offer[k]) : `{{${k}}}`));
  return {
    primaryText: fill(template.creative.primaryText),
    headline: fill(template.creative.headline),
    description: fill(template.creative.description),
    cta: template.creative.cta,
  };
}

module.exports = { seedTemplates, compileCreative };
