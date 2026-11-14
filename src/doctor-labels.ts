/** Human-readable labels for doctor check ids (shown in CLI output). */
const DOCTOR_CHECK_LABELS: Record<string, string> = {
  node: "Node.js version",
  "npm-ci": "Project dependencies",
  homebrew: "Homebrew",
  uv: "uv (Python runner)",
  "pytr-launcher": "Trade Republic (pytr) launcher",
  "pytr-version": "Trade Republic (pytr) version",
  "sc-version": "Scalable Capital (sc) version",
  "dotenv-api-key": "Plaintext API key in .env",
  "lunch-money-api-key": "Lunch Money API key",
  "config-json": "Saved broker settings",
};

export function doctorCheckLabel(checkName: string): string {
  return DOCTOR_CHECK_LABELS[checkName] ?? checkName;
}