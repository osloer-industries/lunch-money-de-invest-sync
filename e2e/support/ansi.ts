const ESC = String.fromCharCode(0x1b);
const CSI = String.fromCharCode(0x9b);
const ANSI_PATTERN = new RegExp(
  `[${ESC}${CSI}][[\\]()#;?]*(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-ORZcf-nqry=><]`,
  "g",
);

/** Removes ANSI escape codes so PTY output is safe for regex assertions. */
export function stripAnsi(text: string): string {
  return text.replaceAll(ANSI_PATTERN, "");
}