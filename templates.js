// Template = the reusable ad bundle an agency builds once and clients launch.
// It compiles down to the Meta object tree (Campaign -> AdSet -> Creative -> Ad).
// See architecture doc §3 for the mapping.

const { db } = require("./store");

function seedTemplates(resellerId) {
  const U = (id) => `https://images.unsplash.com/photo-${id}?w=720&q=80&auto=format&fit=crop`;
  const templates = [
    {
      id: "tpl_re_buyers",
      resellerId,
      name: "Real Estate — Free Home Buyer Guide",
      niche: "real_estate",
      objective: "OUTCOME_LEADS",
      image: U("1560518883-ce09059eeffa"), imgSeed: "house1",
      targeting: {
        geoRadiusMiles: 15,
        ageMin: 28,
        ageMax: 65,
        interests: ["First-time home buyers", "Mortgage", "Zillow"],
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
      image: U("1568605114967-8130f3a36994"), imgSeed: "house2",
      targeting: { geoRadiusMiles: 10, ageMin: 30, ageMax: 65, interests: ["Real estate", "Open house", "Home improvement"], placements: ["facebook_feed"] },
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
      image: U("1570172619644-dfd03ed5d881"), imgSeed: "spa1",
      targeting: { geoRadiusMiles: 12, ageMin: 25, ageMax: 60, interests: ["Skincare", "Beauty", "Self care"], placements: ["instagram_feed", "facebook_feed"] },
      creative: {
        primaryText: "New to {{city}}? {{offer}} Claim your new-client offer this month.",
        headline: "New Client Special",
        description: "Book online in seconds.",
        cta: "BOOK_NOW",
      },
      leadForm: { fields: ["full_name", "email", "phone"], name: "New Client Offer" },
    },
    {
      id: "tpl_dental_implants",
      resellerId,
      name: "Dental — Free Implant Consult",
      niche: "dental",
      objective: "OUTCOME_LEADS",
      image: U("1606811841689-23dfddce3e95"), imgSeed: "dental1",
      targeting: { geoRadiusMiles: 20, ageMin: 35, ageMax: 70, interests: ["Dental care", "Health"], placements: ["facebook_feed", "instagram_feed"] },
      creative: {
        primaryText: "Missing teeth? {{offer}} Book your free implant consultation in {{city}}.",
        headline: "Free Implant Consult",
        description: "Same-week appointments.",
        cta: "BOOK_NOW",
      },
      leadForm: { fields: ["full_name", "email", "phone"], name: "Consult Request" },
    },
    {
      id: "tpl_fitness_trial",
      resellerId,
      name: "Fitness — 7-Day Free Trial",
      niche: "fitness",
      objective: "OUTCOME_LEADS",
      image: U("1534438327276-14e5300c3a48"), imgSeed: "gym1",
      targeting: { geoRadiusMiles: 8, ageMin: 21, ageMax: 55, interests: ["Fitness", "Weight loss", "Gym"], placements: ["instagram_feed", "facebook_feed"] },
      creative: {
        primaryText: "Get moving in {{city}}! {{offer}} Claim your 7-day free pass today.",
        headline: "7-Day Free Trial",
        description: "No commitment. Cancel anytime.",
        cta: "SIGN_UP",
      },
      leadForm: { fields: ["full_name", "email", "phone"], name: "Free Trial Signup" },
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
