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

export const SUGGESTED_CATEGORIES: Partial<Record<CanonicalType, SuggestedCategory>> = {
  buy: INVESTMENTS_CATEGORY,
  sell: INVESTMENTS_CATEGORY,
  "savings-plan": INVESTMENTS_CATEGORY,
  deposit: TRANSFER_CATEGORY,
  withdrawal: TRANSFER_CATEGORY,
  transfer: TRANSFER_CATEGORY,
  dividend: {
    name: "Investment income",
    is_income: true,
    exclude_from_budget: false,
    exclude_from_totals: false,
  },
  interest: {
    name: "Investment income",
    is_income: true,
    exclude_from_budget: false,
    exclude_from_totals: false,
  },
  fee: {
    name: "Bank fees",
    is_income: false,
    exclude_from_budget: false,
    exclude_from_totals: false,
  },
  tax: {
    name: "Taxes",
    is_income: false,
    exclude_from_budget: false,
    exclude_from_totals: false,
  },
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
