const ACCESS_POLICIES = Object.freeze({
  beta_full: Object.freeze({
    service_stage: "public_beta",
    display_label: "公测体验中",
    billing_visible: false,
    paid_features_visible: false,
  }),
  free: Object.freeze({
    service_stage: "official",
    display_label: "基础版",
    billing_visible: false,
    paid_features_visible: false,
  }),
  member: Object.freeze({
    service_stage: "official",
    display_label: "会员",
    billing_visible: false,
    paid_features_visible: false,
  }),
});

function optionalCode(value, minLength = 1) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().slice(0, 64);
  return normalized.length >= minLength && /^[A-Za-z0-9_-]+$/.test(normalized)
    ? normalized
    : null;
}

export function sanitizeRegistrationAttribution(value = {}) {
  const numericScene = Number(value.source_scene);
  const releaseChannel = ["develop", "trial", "release"].includes(value.release_channel)
    ? value.release_channel
    : null;
  return {
    registration_source_scene: Number.isInteger(numericScene)
      && numericScene >= 0
      && numericScene <= 99_999
      ? numericScene
      : null,
    registration_source_campaign: optionalCode(value.source_campaign),
    registration_referrer_app_id: optionalCode(value.source_referrer_app_id, 3),
    registration_release_channel: releaseChannel,
  };
}

export function resolveUserAccess(user = {}) {
  const internalTier = ACCESS_POLICIES[user.access_tier]
    ? user.access_tier
    : "beta_full";
  const policy = ACCESS_POLICIES[internalTier];
  return {
    registration_cohort: user.registration_cohort || "public_beta",
    service_stage: policy.service_stage,
    display_label: policy.display_label,
    billing_visible: policy.billing_visible,
    paid_features_visible: policy.paid_features_visible,
  };
}
