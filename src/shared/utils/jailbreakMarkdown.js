export const MAX_JAILBREAK_MARKDOWN_BYTES = 1024 * 1024;

// Read locally into the draft editor. Importing must never save an assignment.
export async function readJailbreakMarkdown(file) {
  if (!file || !/\.md$/i.test(file.name || "")) {
    throw new Error("Choose a Markdown (.md) file.");
  }
  if (file.size > MAX_JAILBREAK_MARKDOWN_BYTES) {
    throw new Error("Markdown files must be 1 MB or smaller.");
  }
  const text = (await file.text()).replace(/^\uFEFF/, "");
  if (!text.trim()) throw new Error("The Markdown file is empty.");
  if (text.includes("\0")) throw new Error("Choose a plain-text Markdown file.");
  return text;
}
