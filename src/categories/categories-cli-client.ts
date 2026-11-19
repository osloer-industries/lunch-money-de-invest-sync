import type { TagsApi } from "../lunch-money/client.js";
import type { CategoryMappingSetupClient } from "../setup/types.js";
import type { TransactionsListApi } from "./lm-transactions.js";
import type { TransactionUpdateApi } from "./reapply-execute.js";

/** Narrow Lunch Money client surface used by `npm run categories`. */
export type CategoriesCliClient = Omit<CategoryMappingSetupClient, "tags"> &
  TagsApi & {
    readonly transactions: TransactionsListApi["transactions"] & TransactionUpdateApi["transactions"];
  };