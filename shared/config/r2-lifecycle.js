/** The only R2 object expiry rules Meridian owns. */
export const R2_LIFECYCLE_RULES = Object.freeze([
  Object.freeze({ id: 'expire-raw', prefix: 'raw/', expireDays: 7 }),
  Object.freeze({ id: 'expire-media', prefix: 'media/', expireDays: 365 }),
]);

export const R2_EXPIRY_PREFIXES = Object.freeze(R2_LIFECYCLE_RULES.map((rule) => rule.prefix));
export const RAW_LIFETIME_DAYS = R2_LIFECYCLE_RULES[0].expireDays;
export const MEDIA_LIFETIME_DAYS = R2_LIFECYCLE_RULES[1].expireDays;
