/**
 * Voltfly Pricing Constants — Single Source of Truth
 *
 * Import from here instead of hardcoding values in components or API routes.
 * Any pricing change must be made only here.
 */
export const PRICING = {
  // ── BatterySmart ──────────────────────────────────────────────────────────
  /** Security deposit collected at onboarding (held, refundable on exit) */
  SECURITY_DEPOSIT: 2000,

  /** One-time onboarding fee for BatterySmart (handling + verification) */
  ONBOARDING_FEES: 190,

  /** Per-day rental rate for BatterySmart */
  DAILY_RATE: 230,

  /** 1-week rental for BatterySmart */
  WEEKLY_RATE: 1610,

  /** 1-month rental for BatterySmart */
  MONTHLY_RATE: 6900,

  /**
   * The full onboarding bundle value for BatterySmart.
   * = SECURITY_DEPOSIT + ONBOARDING_FEES + first week rental
   * = ₹2,000 + ₹190 + ₹1,610 = ₹3,800
   */
  FULL_ONBOARDING: 3800,

  /** Minimum cash required to activate a BatterySmart rider */
  MINIMUM_ONBOARD_CASH: 2190, // SECURITY_DEPOSIT + ONBOARDING_FEES

  // ── Indofast ──────────────────────────────────────────────────────────────
  INDOFAST_SECURITY_DEPOSIT: 2000,

  /** One-time onboarding/verification fee for Indofast */
  INDOFAST_ONBOARDING_FEES: 250,

  /** Per-day rental rate for Indofast */
  INDOFAST_DAILY_RATE: 250,

  /** 1-week rental for Indofast */
  INDOFAST_WEEKLY_RATE: 1750,

  /**
   * Minimum cash required to activate an Indofast rider
   * = INDOFAST_SECURITY_DEPOSIT + INDOFAST_ONBOARDING_FEES
   */
  INDOFAST_MINIMUM_ONBOARD_CASH: 2250,
} as const;

export type PricingKey = keyof typeof PRICING;

/** Returns operator-specific pricing values based on gig_company field */
export function getOperatorPricing(gigCompany: string | null | undefined) {
  const isIndofast = gigCompany?.toLowerCase().includes("indofast");
  if (isIndofast) {
    return {
      operator: "indofast",
      securityDeposit: PRICING.INDOFAST_SECURITY_DEPOSIT,
      onboardingFee: PRICING.INDOFAST_ONBOARDING_FEES,
      dailyRate: PRICING.INDOFAST_DAILY_RATE,
      weeklyRate: PRICING.INDOFAST_WEEKLY_RATE,
      minimumOnboardCash: PRICING.INDOFAST_MINIMUM_ONBOARD_CASH,
    };
  }
  return {
    operator: "batterysmart",
    securityDeposit: PRICING.SECURITY_DEPOSIT,
    onboardingFee: PRICING.ONBOARDING_FEES,
    dailyRate: PRICING.DAILY_RATE,
    weeklyRate: PRICING.WEEKLY_RATE,
    minimumOnboardCash: PRICING.MINIMUM_ONBOARD_CASH,
  };
}
