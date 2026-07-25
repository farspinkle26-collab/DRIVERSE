// A small, purpose-built frontmatter reader/writer for our flat post schema.
// We deliberately avoid a general YAML dependency: every frontmatter value here
// is a scalar (string / number / boolean), so a line-based parser is safe,
// dependency-free, and round-trips cleanly. Anything it doesn't understand is
// preserved as a raw string.

export type Scalar = string | number | boolean | null;

/** Split a raw markdown file into its frontmatter block and body. */
export function splitFrontmatter(raw: string): { yaml: string; body: string } {
  const normalized = raw.replace(/\r\n/g, "\n");
  const match = normalized.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { yaml: "", body: normalized };
  return { yaml: match[1], body: match[2] };
}

function parseScalar(rawValue: string): Scalar {
  let v = rawValue.trim();
  if (v === "" || v === "~" || v === "null") return null;
  // Quoted string — unwrap and unescape.
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    const inner = v.slice(1, -1);
    return v[0] === '"' ? inner.replace(/\\"/g, '"').replace(/\\\\/g, "\\") : inner;
  }
  if (v === "true") return true;
  if (v === "false") return false;
  // Numbers (int/float). Guard against things like "2025-07-20" being coerced.
  if (/^-?\d+(\.\d+)?$/.test(v)) {
    const n = Number(v);
    if (!Number.isNaN(n)) return n;
  }
  return v;
}

/** Parse a flat scalar frontmatter block into a plain object. */
export function parseFrontmatter(yaml: string): Record<string, Scalar> {
  const out: Record<string, Scalar> = {};
  for (const line of yaml.split("\n")) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    if (!key) continue;
    // Strip trailing inline comments only when the value isn't quoted.
    let valuePart = line.slice(idx + 1);
    const trimmed = valuePart.trim();
    if (!(trimmed.startsWith('"') || trimmed.startsWith("'"))) {
      const hashIdx = valuePart.indexOf(" #");
      if (hashIdx !== -1) valuePart = valuePart.slice(0, hashIdx);
    }
    out[key] = parseScalar(valuePart);
  }
  return out;
}

function needsQuoting(v: string): boolean {
  if (v === "") return true;
  // Quote when the value could be misread as another type, or has leading/
  // trailing whitespace or a leading char YAML treats specially.
  if (/^(true|false|null|~)$/.test(v)) return true;
  if (/^-?\d+(\.\d+)?$/.test(v)) return true;
  if (v !== v.trim()) return true;
  if (/^[\s>|@`%&*!?{}\[\],#"']/.test(v)) return true;
  if (v.includes(": ") || v.endsWith(":")) return true;
  if (v.includes("\n")) return true;
  return false;
}

function serializeScalar(v: Scalar): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return String(v);
  const s = String(v);
  if (needsQuoting(s)) {
    return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return s;
}

/**
 * Serialize an ordered set of key/value pairs to a frontmatter block, keeping
 * the caller's key order. Keys with `undefined` values are skipped; explicit
 * `null` is written as an empty value.
 */
export function serializeFrontmatter(
  entries: [string, Scalar | undefined][],
): string {
  const lines: string[] = ["---"];
  for (const [key, value] of entries) {
    if (value === undefined) continue;
    lines.push(`${key}: ${serializeScalar(value ?? null)}`);
  }
  lines.push("---");
  return lines.join("\n");
}
