const presets = {natural: 0, soft: 50, deep: 100};

export function isToneLevel(value) {
  return Number.isInteger(value) && value >= 0 && value <= 100;
}

export function normalizeTone(value) {
  if (isToneLevel(value)) return value;
  return typeof value === 'string' && Object.hasOwn(presets, value) ? presets[value] : 0;
}

export function toneGains(level) {
  if (level === 0) return [0, 0];
  if (level <= 50) return [0, -6 * (level / 50)];
  const depth = (level - 50) / 50;
  return [2 * depth, -6 - 2 * depth];
}
