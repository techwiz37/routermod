const INLINE_RE =
  /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(__[^_\n]+__)|(~~[^~\n]+~~)|(\*[^*\n]+\*)|(_[^_\n]+_)|(\[[^\]\n]+\]\([^)\s]+\))|(\bhttps?:\/\/[^\s<>()[\]]+)/g;

function renderInline(text) {
  const nodes = [];
  let last = 0;
  let key = 0;
  let m;
  INLINE_RE.lastIndex = 0;
  while ((m = INLINE_RE.exec(text))) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("`")) {
      nodes.push(
        <code key={`c${key++}`} className="rounded bg-surface-2 border border-border px-1 py-0.5 font-mono text-[0.9em] break-words">
          {tok.slice(1, -1)}
        </code>
      );
    } else if (tok.startsWith("**") || tok.startsWith("__")) {
      nodes.push(
        <strong key={`b${key++}`} className="font-semibold text-text">
          {tok.slice(2, -2)}
        </strong>
      );
    } else if (tok.startsWith("~~")) {
      nodes.push(
        <del key={`d${key++}`} className="opacity-60">
          {tok.slice(2, -2)}
        </del>
      );
    } else if (tok.startsWith("[")) {
      const cut = tok.indexOf("](");
      const label = tok.slice(1, cut);
      const href = tok.slice(cut + 2, -1);
      nodes.push(
        <a
          key={`a${key++}`}
          href={href}
          target="_blank"
          rel="noreferrer noopener"
          className="text-primary underline underline-offset-2 hover:opacity-80"
        >
          {label}
        </a>
      );
    } else if (/^https?:\/\//.test(tok)) {
      nodes.push(
        <a
          key={`u${key++}`}
          href={tok}
          target="_blank"
          rel="noreferrer noopener"
          className="text-primary underline underline-offset-2 break-all hover:opacity-80"
        >
          {tok}
        </a>
      );
    } else {
      nodes.push(
        <em key={`i${key++}`} className="italic">
          {tok.slice(1, -1)}
        </em>
      );
    }
    last = m.index + tok.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function isBlockStart(line) {
  return (
    /^\s*```/.test(line) ||
    /^\s*#{1,6}\s+/.test(line) ||
    /^\s*>\s?/.test(line) ||
    /^\s*([-*+]|\d+[.)])\s+/.test(line) ||
    /^\s{0,3}([-*_])\s*(\1\s*){2,}$/.test(line)
  );
}

export function renderMarkdown(source) {
  const lines = String(source || "").replace(/\r\n/g, "\n").split("\n");
  const out = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (/^\s*```/.test(line)) {
      const body = [];
      i += 1;
      while (i < lines.length && !/^\s*```/.test(lines[i])) {
        body.push(lines[i]);
        i += 1;
      }
      i += 1;
      out.push(
        <pre
          key={`pre${key++}`}
          className="my-1 rounded-xl border border-border bg-surface-2 px-3 py-2 font-mono text-[11px] leading-relaxed text-text overflow-x-auto whitespace-pre-wrap break-words"
        >
          <code>{body.join("\n")}</code>
        </pre>
      );
      continue;
    }

    const heading = line.match(/^\s*(#{1,6})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      out.push(
        <p
          key={`h${key++}`}
          className={`mt-1 font-semibold text-text ${level <= 2 ? "text-[1.05em]" : "text-[1em]"}`}
        >
          {renderInline(heading[2])}
        </p>
      );
      i += 1;
      continue;
    }

    if (/^\s{0,3}([-*_])\s*(\1\s*){2,}$/.test(line)) {
      out.push(<hr key={`hr${key++}`} className="my-2 border-border" />);
      i += 1;
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      const body = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        body.push(lines[i].replace(/^\s*>\s?/, ""));
        i += 1;
      }
      out.push(
        <div key={`q${key++}`} className="my-1 border-l-2 border-primary/40 pl-3 text-text-muted italic">
          {body.map((b, n) => (
            <p key={n} className="whitespace-pre-wrap">
              {renderInline(b)}
            </p>
          ))}
        </div>
      );
      continue;
    }

    if (/^\s*([-*+]|\d+[.)])\s+/.test(line)) {
      const ordered = /^\s*\d+[.)]\s+/.test(line);
      const items = [];
      while (i < lines.length && /^\s*([-*+]|\d+[.)])\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*(?:[-*+]|\d+[.)])\s+/, ""));
        i += 1;
      }
      const Tag = ordered ? "ol" : "ul";
      out.push(
        <Tag
          key={`l${key++}`}
          className={`my-1 space-y-1 pl-5 ${ordered ? "list-decimal" : "list-disc"}`}
        >
          {items.map((item, n) => (
            <li key={n} className="whitespace-pre-wrap">
              {renderInline(item)}
            </li>
          ))}
        </Tag>
      );
      continue;
    }

    const para = [line];
    i += 1;
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) {
      para.push(lines[i]);
      i += 1;
    }
    out.push(
      <p key={`p${key++}`} className="whitespace-pre-wrap">
        {renderInline(para.join("\n"))}
      </p>
    );
  }

  return out;
}
