/**
 * Fe–Fe3C (metastable iron–cementite) phase diagram: invariant data.
 *
 * All compositions are in weight-percent carbon (wt% C), all temperatures in
 * degrees Celsius. Values follow the standard textbook diagram
 * (Callister, *Materials Science and Engineering*, and ASM Handbook Vol. 3).
 *
 * Note that this is the **metastable** Fe–Fe3C system: cementite is treated as
 * a stable line compound rather than allowing graphite to precipitate, which is
 * what the vast majority of steel practice is based on.
 */

/** Carbon content of cementite, Fe3C: 3 Fe (55.845) + 1 C (12.011). */
export const CEMENTITE_C = 6.67;

/** Plot domain of the diagram. */
export const C_MIN = 0;
export const C_MAX = CEMENTITE_C;
export const T_MIN = 0;
export const T_MAX = 1600;

/** Melting point of pure iron. */
export const FE_MELTING_C = 1538;
/** delta-ferrite -> austenite allotropic transformation in pure iron (A4). */
export const A4_PURE_FE = 1394;
/** austenite -> alpha-ferrite allotropic transformation in pure iron (A3). */
export const A3_PURE_FE = 912;

/** Peritectic: L (0.53) + delta (0.09) -> gamma (0.17) at 1495 degC. */
export const PERITECTIC = {
  T: 1495,
  cLiquid: 0.53,
  cDelta: 0.09,
  cGamma: 0.17,
} as const;

/** Eutectic: L (4.30) -> gamma (2.14) + Fe3C (6.67) at 1147 degC -> ledeburite. */
export const EUTECTIC = {
  T: 1147,
  cLiquid: 4.3,
  cGamma: 2.14,
  cCementite: CEMENTITE_C,
} as const;

/** Eutectoid: gamma (0.76) -> alpha (0.022) + Fe3C (6.67) at 727 degC -> pearlite. */
export const EUTECTOID = {
  T: 727,
  cGamma: 0.76,
  cAlpha: 0.022,
  cCementite: CEMENTITE_C,
} as const;

/** Melting/decomposition temperature of cementite in this construction. */
export const CEMENTITE_MELT_T = 1227;

/** Max carbon solubility in alpha-ferrite (at the eutectoid temperature). */
export const MAX_C_IN_ALPHA = EUTECTOID.cAlpha;
/** Max carbon solubility in austenite (at the eutectic temperature). */
export const MAX_C_IN_GAMMA = EUTECTIC.cGamma;
/** Max carbon solubility in delta-ferrite (at the peritectic temperature). */
export const MAX_C_IN_DELTA = PERITECTIC.cDelta;
/** Carbon solubility in alpha-ferrite at (approximately) room temperature. */
export const C_IN_ALPHA_AT_RT = 0.008;

/** Temperature used as "room temperature" when a cooling run finishes. */
export const ROOM_T = 20;

/** Numerical tolerance for "is this point on an invariant line" tests. */
export const INVARIANT_T_TOL = 0.75;
