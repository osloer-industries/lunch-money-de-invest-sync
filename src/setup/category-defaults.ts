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
  name: "Transfer",
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

export const SUGGESTED_CATEGORIES: Partial<Record<CanonicalType, SuggestedCategory>> = {
  buy: INVESTMENTS_CATEGORY,
  sell: INVESTMENTS_CATEGORY,
  "savings-plan": INVESTMENTS_CATEGORY,
  deposit: TRANSFER_CATEGORY,
  withdrawal: TRANSFER_CATEGORY,
  transfer: TRANSFER_CATEGORY,
  dividend: budgetIncomeCategory("Investment income"),
  interest: budgetIncomeCategory("Investment income"),
  fee: budgetExpenseCategory("Bank fees"),
  tax: budgetExpenseCategory("Taxes"),
};

export const SUGGESTED_TAGS: Partial<Record<CanonicalType, readonly string[]>> = {
  buy: ["investment"],
  sell: ["investment"],
  "savings-plan": ["investment"],
  dividend: ["dividend", "investment"],
  interest: ["investment"],
  saveback: ["saveback"],
  unknown: ["needs-review"],
};
