import type { CanonicalType } from "../shared/canonical-type.js";

export interface SuggestedCategory {
  readonly name: string;
  readonly is_income: boolean;
  readonly exclude_from_budget: boolean;
  readonly exclude_from_totals: boolean;
}

const INVESTMENTS_CATEGORY: SuggestedCategory = {
  name: "Investments",
  is_income: false,
  exclude_from_budget: true,
  exclude_from_totals: true,
};

const TRANSFER_CATEGORY: SuggestedCategory = {
  name: "Payment, Transfer",
  is_income: false,
  exclude_from_budget: true,
  exclude_from_totals: true,
};

function budgetIncomeCategory(name: string): SuggestedCategory {
  return { name, is_income: true, exclude_from_budget: false, exclude_from_totals: false };
}

function budgetExpenseCategory(name: string): SuggestedCategory {
  return { name, is_income: false, exclude_from_budget: false, exclude_from_totals: false };
}

export const SAVEBACK_INCOME_CATEGORY = budgetIncomeCategory("Saveback income");

/** Operator choice for Saveback: income vs excluded savings (same flags as Investments). */
export const SAVEBACK_EXCLUDED_CATEGORY: SuggestedCategory = INVESTMENTS_CATEGORY;

export const SAVEBACK_CREATE_TEMPLATES: readonly SuggestedCategory[] = [
  SAVEBACK_INCOME_CATEGORY,
  SAVEBACK_EXCLUDED_CATEGORY,
];

/** Plain budget income — dividends and interest share one "Income" question during setup. */
const INCOME_CATEGORY = budgetIncomeCategory("Income");

/**
 * Suggested Lunch Money category per canonical type. Setup asks once per suggested category name
 * (case-insensitive), so types that share a suggestion share one question.
 */
export const SUGGESTED_CATEGORIES: Partial<Record<CanonicalType, SuggestedCategory>> = {
  buy: INVESTMENTS_CATEGORY,
  sell: INVESTMENTS_CATEGORY,
  "savings-plan": INVESTMENTS_CATEGORY,
  deposit: TRANSFER_CATEGORY,
  withdrawal: TRANSFER_CATEGORY,
  transfer: TRANSFER_CATEGORY,
  dividend: INCOME_CATEGORY,
  interest: INCOME_CATEGORY,
  fee: budgetExpenseCategory("Bank fees"),
  tax: {
    name: "Investment tax",
    is_income: false,
    exclude_from_budget: true,
    exclude_from_totals: true,
  },
  /** Unclassified rows default to the transfer category; asked separately (see run-category-mapping). */
  unknown: TRANSFER_CATEGORY,
};

/**
 * Tags that add information beyond the category (a tag that repeats the category, such as
 * "investment" on Investments, is noise). Suggestions stay scoped to the type that proposed them.
 */
export const SUGGESTED_TAGS: Partial<Record<CanonicalType, readonly string[]>> = {
  dividend: ["dividend"],
  interest: ["interest"],
  saveback: ["saveback"],
  unknown: ["needs-review"],
};
