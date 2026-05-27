/** Principled BSDF XML attrs — shared (no circular deps). */

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function hexToRgb01(hex, fallback = [0.8, 0.8, 0.8]) {
  if (typeof hex !== 'string' || !/^#[0-9a-f]{6}$/i.test(hex)) return fallback;
  return [
    parseInt(hex.slice(1, 3), 16) / 255,
    parseInt(hex.slice(3, 5), 16) / 255,
    parseInt(hex.slice(5, 7), 16) / 255,
  ];
}

function vec3(values) {
  return values.map((v) => clampNumber(v, 0, 100, 0).toFixed(6)).join(' ');
}

function xmlEscape(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function principledBsdfXmlAttrs(p) {
  const base = vec3(hexToRgb01(p.baseColor, [0.8, 0.8, 0.8]));
  const emission = vec3(hexToRgb01(p.emissionColor, [1.0, 1.0, 1.0]));
  const coatTint = vec3(hexToRgb01(p.coatTint, [1.0, 1.0, 1.0]));
  const sheenTint = vec3(hexToRgb01(p.sheenTint, [1.0, 1.0, 1.0]));
  const specTintLevel = clampNumber(p.specularTint, 0, 1, 0);
  const specularTint = vec3([specTintLevel, specTintLevel, specTintLevel]);
  const distribution = p.distribution === 'ggx' ? 'ggx' : 'multi_ggx';

  return [
    `distribution="${distribution}"`,
    `base_color="${base}"`,
    `metallic="${clampNumber(p.metallic, 0, 1, 0)}"`,
    `roughness="${clampNumber(p.roughness, 0, 1, 0.5)}"`,
    `ior="${clampNumber(p.ior, 1, 3, 1.5)}"`,
    `alpha="${clampNumber(p.alpha, 0, 1, 1)}"`,
    `specular_ior_level="${clampNumber(p.specularIorLevel, 0, 1, 0.5)}"`,
    `specular_tint="${specularTint}"`,
    `anisotropic="${clampNumber(p.anisotropic, 0, 1, 0)}"`,
    `anisotropic_rotation="${clampNumber(p.anisotropicRotation, 0, 1, 0)}"`,
    `transmission_weight="${clampNumber(p.transmissionWeight, 0, 1, 0)}"`,
    `sheen_weight="${clampNumber(p.sheenWeight, 0, 1, 0)}"`,
    `sheen_roughness="${clampNumber(p.sheenRoughness, 0, 1, 0.5)}"`,
    `sheen_tint="${sheenTint}"`,
    `coat_weight="${clampNumber(p.coatWeight, 0, 1, 0)}"`,
    `coat_roughness="${clampNumber(p.coatRoughness, 0, 1, 0.03)}"`,
    `coat_ior="${clampNumber(p.coatIor, 1, 3, 1.5)}"`,
    `coat_tint="${coatTint}"`,
    `emission_color="${emission}"`,
    `emission_strength="${clampNumber(p.emissionStrength, 0, 100, 0)}"`,
    `thin_film_thickness="${clampNumber(p.thinFilmThickness, 0, 2000, 0)}"`,
    `thin_film_ior="${clampNumber(p.thinFilmIor, 1, 3, 1.33)}"`,
  ].join(' ');
}

module.exports = {
  principledBsdfXmlAttrs,
  clampNumber,
  hexToRgb01,
  vec3,
  xmlEscape,
};
