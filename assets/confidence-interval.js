// Two-sided 95% Student-t intervals for the mean of independent session scores.
// https://itl.nist.gov/div898/handbook/eda/section3/eda352.htm
// Small-df quantiles generated with scipy.stats.t.ppf(.975, df).
const SMALL_DF = [
  12.706204736174694, 4.302652729749462, 3.1824463052837078, 2.7764451051977934,
  2.5705818356363146, 2.4469118511449786, 2.364624251592784, 2.306004135204166,
  2.262157162798205, 2.228138851986274, 2.200985160091639, 2.1788128296672284,
  2.1603686564627913, 2.144786687917804, 2.131449545559776, 2.1199052992212546,
  2.1098155778333156, 2.1009220402410382, 2.0930240544083087, 2.085963447265864,
  2.0796138447276795, 2.0738730679040254, 2.0686576104190486, 2.0638985616280245,
  2.0595385527532972, 2.0555294386428735, 2.0518305164802846, 2.0484071417952454,
  2.045229642132703, 2.0422724563012378,
];
export function studentTCritical95(df) {
  if (!Number.isSafeInteger(df) || df < 1) return null;
  if (df <= SMALL_DF.length) return SMALL_DF[df - 1];
  // Fourth-order expansion; maximum error below 3e-8 for integer df >= 31
  // against SciPy. This avoids rounding to the normal limit for larger cohorts.
  const z = 1.959963984540054;
  return z + (z ** 3 + z) / (4 * df)
    + (5 * z ** 5 + 16 * z ** 3 + 3 * z) / (96 * df ** 2)
    + (3 * z ** 7 + 19 * z ** 5 + 17 * z ** 3 - 15 * z) / (384 * df ** 3)
    + (79 * z ** 9 + 776 * z ** 7 + 1482 * z ** 5 - 1920 * z ** 3 - 945 * z) / (92160 * df ** 4);
}
export function meanConfidenceInterval95(values) {
  if (!Array.isArray(values) || values.length < 2 || !values.every(Number.isFinite)) return null;
  const n = values.length, mean = values.reduce((sum, value) => sum + value, 0) / n;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (n - 1);
  const standardError = Math.sqrt(variance / n), margin = studentTCritical95(n - 1) * standardError;
  if (![mean, standardError, margin].every(Number.isFinite)) return null;
  return { lower: mean - margin, upper: mean + margin, standardError, n, level: .95, method: 'student-t' };
}
