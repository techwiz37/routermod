// Membersihkan output command: buang kode warna ANSI dan baris progress
// yang ditimpa dengan carriage return.
const ANSI_RE =
  /[\u001B\u009B][[\]()#;?]*(?:(?:(?:(?:;[-a-zA-Z\d/#&.:=?%@~_]+)*|[a-zA-Z\d]+(?:;[-a-zA-Z\d/#&.:=?%@~_]*)*)?\u0007)|(?:(?:\d{1,4}(?:[;:]\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))/g;

export function stripAnsi(text) {
  if (text === null || text === undefined) return "";
  return String(text).replace(ANSI_RE, "");
}

export function cleanCommandOutput(text) {
  let out = stripAnsi(text);
  out = out.replace(/\r\n/g, "\n");
  // Baris yang ditimpa progress bar (mis. "50%\r100%") dibuang bagian lamanya.
  out = out.replace(/[^\n]*\r/g, "");
  return out.replace(/[ \t]+$/gm, (m) => (m.length > 0 ? m : m));
}
