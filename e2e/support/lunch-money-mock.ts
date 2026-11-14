import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import { URL } from "node:url";

const VALID_API_KEY = "lm_e2e_valid_key";
const INVALID_API_KEY = "lm_e2e_invalid_key";

export interface LunchMoneyMockState {
  readonly manualAccounts: Array<{ id: number; name: string; type_name?: string }>;
  readonly categories: Array<{ id: number; name: string; is_income: boolean; exclude_from_budget: boolean; is_group: boolean }>;
  readonly tags: Array<{ id: number; name: string }>;
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

function readBearer(req: IncomingMessage): string | null {
  const header = req.headers.authorization;
  if (typeof header !== "string" || !header.startsWith("Bearer ")) {
    return null;
  }
  return header.slice("Bearer ".length).trim();
}

function unauthorized(res: ServerResponse): void {
  json(res, 401, { message: "Unauthorized", errors: [{ errMsg: "Unauthorized" }] });
}

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

export class LunchMoneyMockServer {
  private server: Server | undefined;
  readonly port: number;
  readonly baseUrl: string;
  private nextManualId = 9101;
  private nextCategoryId = 8001;
  private nextTagId = 7001;
  private nextTransactionId = 6001;

  constructor(port: number) {
    this.port = port;
    this.baseUrl = `http://127.0.0.1:${port}/v2`;
  }

  readonly state: LunchMoneyMockState = {
    manualAccounts: [
      { id: 9100, name: "Trade Republic (operator-a)", type_name: "investment" },
      { id: 9101, name: "Scalable Capital (operator-a)", type_name: "investment" },
    ],
    categories: [
      {
        id: 8001,
        name: "Payment, Transfer",
        is_income: false,
        exclude_from_budget: false,
        is_group: false,
      },
      { id: 8002, name: "Investments", is_income: false, exclude_from_budget: true, is_group: false },
      { id: 8003, name: "Investment tax", is_income: false, exclude_from_budget: true, is_group: false },
    ],
    tags: [
      { id: 7001, name: "investments" },
      { id: 7002, name: "needs-review" },
    ],
  };

  async start(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.server = createServer((req, res) => {
        try {
          this.route(req, res);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          json(res, 500, { message });
        }
      });
      this.server.on("error", reject);
      this.server.listen(this.port, "127.0.0.1", () => {
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    if (!this.server) {
      return;
    }
    await new Promise<void>((resolve, reject) => {
      this.server?.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
    this.server = undefined;
  }

  private authorize(req: IncomingMessage, res: ServerResponse): boolean {
    const token = readBearer(req);
    if (!token || token === INVALID_API_KEY || token !== VALID_API_KEY) {
      unauthorized(res);
      return false;
    }
    return true;
  }

  private route(req: IncomingMessage, res: ServerResponse): void {
    if (!this.authorize(req, res)) {
      return;
    }

    const url = new URL(req.url ?? "/", `http://127.0.0.1:${this.port}`);
    const method = req.method ?? "GET";
    const routeKey = `${method} ${url.pathname}`;

    switch (routeKey) {
      case "GET /v2/manual_accounts":
        json(res, 200, { manual_accounts: this.state.manualAccounts });
        return;
      case "GET /v2/categories":
        json(res, 200, { categories: this.state.categories });
        return;
      case "GET /v2/tags":
        json(res, 200, { tags: this.state.tags });
        return;
      case "GET /v2/transactions":
        json(res, 200, { transactions: [], has_more: false });
        return;
      case "POST /v2/manual_accounts":
        this.readJsonBody(req, (body) => {
          this.createManualAccount(res, body);
        });
        return;
      case "POST /v2/categories":
        this.readJsonBody(req, (body) => {
          this.createCategory(res, body);
        });
        return;
      case "POST /v2/tags":
        this.readJsonBody(req, (body) => {
          this.createTag(res, body);
        });
        return;
      case "POST /v2/transactions":
        this.readJsonBody(req, (body) => {
          this.insertTransactions(res, body);
        });
        return;
      default:
        json(res, 404, { message: "not found" });
    }
  }

  private createManualAccount(res: ServerResponse, body: Record<string, unknown>): void {
    const name = asString(body.name, "manual");
    if (this.state.manualAccounts.some((row) => row.name === name)) {
      json(res, 400, {
        message: "ASSET_DISPLAY_NAME_ALREADY_EXISTS",
        errors: [{ errMsg: "ASSET_DISPLAY_NAME_ALREADY_EXISTS" }],
      });
      return;
    }
    const created = { id: this.nextManualId++, name, type_name: "investment" };
    this.state.manualAccounts.push(created);
    json(res, 200, created);
  }

  private createCategory(res: ServerResponse, body: Record<string, unknown>): void {
    const created = {
      id: this.nextCategoryId++,
      name: asString(body.name, "category"),
      is_income: body.is_income === true,
      exclude_from_budget: body.exclude_from_budget === true,
      is_group: false,
    };
    this.state.categories.push(created);
    json(res, 200, created);
  }

  private createTag(res: ServerResponse, body: Record<string, unknown>): void {
    const name = asString(body.name, "tag");
    const existing = this.state.tags.find((tag) => tag.name === name);
    if (existing) {
      json(res, 200, existing);
      return;
    }
    const created = { id: this.nextTagId++, name };
    this.state.tags.push(created);
    json(res, 200, created);
  }

  private insertTransactions(res: ServerResponse, body: Record<string, unknown>): void {
    const rows = Array.isArray(body.transactions) ? body.transactions : [];
    const inserted = rows.map((row: { external_id?: string; payee?: string }) => ({
      id: this.nextTransactionId++,
      external_id: row.external_id ?? null,
      payee: row.payee ?? "tx",
    }));
    json(res, 200, { transactions: inserted, skipped_duplicates: [] });
  }

  private readJsonBody(req: IncomingMessage, onBody: (body: Record<string, unknown>) => void): void {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });
    req.on("end", () => {
      const text = Buffer.concat(chunks).toString("utf8");
      const body = text.length > 0 ? (JSON.parse(text) as Record<string, unknown>) : {};
      onBody(body);
    });
  }
}

export const lunchMoneyE2eApiKey = VALID_API_KEY;
export const lunchMoneyE2eInvalidApiKey = INVALID_API_KEY;