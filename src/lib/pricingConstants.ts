/**
 * Voltfly Pricing Constants — Single Source of Truth
 *
 * Import from here instead of hardcoding values in components or API routes.
 * Any pricing change must be made only here.
 */
export const PRICING = {
  /** Security deposit collected at onboarding (held, refundable on exit) */
  SECURITY_DEPOSIT: 2000,

  /** One-time onboarding fee (handling ₹10 + verification ₹180) */
  ONBOARDING_FEES: 190,

  /**
   * The full onboarding bundle value.
   * = SECURITY_DEPOSIT + ONBOARDING_FEES + first week rental (₹1,610)
   * i.e. ₹2,000 + ₹190 + ₹1,610 = ₹3,800
   * Outstanding balance at offline onboard = max(0, FULL_ONBOARDING - cashReceived)
   */
  FULL_ONBOARDING: 3800,

  /** Minimum cash required to activate a rider at offline onboard */
  MINIMUM_ONBOARD_CASH: 2190, // SECURITY_DEPOSIT + ONBOARDING_FEES

  /** Per-day rental rate (used for custom plan and overdue calculations) */
  DAILY_RATE: 250,

  /** 1-week rental */
  WEEKLY_RATE: 1610,

  /** 1-month rental */
  MONTHLY_RATE: 6900,
} as const;

export type PricingKey = keyof typeof PRICING;
