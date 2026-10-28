// THE PURE PARTS OF `everdict-api watch` (DEFAUL-959, pub/sub spec §3.2): parse the stream, format a line, decide
// `--until`. No I/O — the door (`bin/everdict-api`) owns the socket, the cursor file and the receipt.

export const LINE_MAX = 300;

/** SSE text → frames. `rest` is the unfinished tail to prepend to the next chunk; comments (`: hb`) are `{comment}` so the caller can count them as activity. */
export const parseSse = (buffer) => {
  const frames = [];
  const blocks = buffer.split(/\r?\n\r?\n/);
  const rest = blocks.pop() ?? "";
  for (const block of blocks) {
    let id;
    let event = "message";
    const data = [];
    let comment = false;
    for (const row of block.split(/\r?\n/)) {
      if (row.startsWith(":")) comment = true;
      else if (row.startsWith("id:")) id = row.slice(3).trim();
      else if (row.startsWith("event:")) event = row.slice(6).trim();
      else if (row.startsWith("data:")) data.push(row.slice(5).replace(/^ /, ""));
    }
    if (data.length === 0 && id === undefined && event === "message") {
      if (comment) frames.push({ comment: true });
      continue;
    }
    let body;
    try {
      body = data.length > 0 ? JSON.parse(data.join("\n")) : undefined;
    } catch {
      body = undefined;
    }
    const pos = Number(id ?? body?.pos);
    frames.push({ event, pos: Number.isInteger(pos) && pos > 0 ? pos : undefined, data: body });
  }
  return { frames, rest };
};

const tokensMatch = (pattern, subject) => {
  const want = pattern.split(".");
  const have = subject.split(".");
  for (const [i, token] of want.entries()) {
    if (token === ">") return have.length > i;
    if (have[i] === undefined || (token !== "*" && token !== have[i])) return false;
  }
  return have.length === want.length;
};

/** The subject a line names: the first the fact is filed under that a pattern matches, else its first. */
export const lineSubject = (fact, patterns) => {
  const subjects = Array.isArray(fact?.subjects) ? fact.subjects.filter((s) => typeof s === "string") : [];
  return subjects.find((s) => patterns.some((p) => tokensMatch(p, s))) ?? subjects[0] ?? "-";
};

const oneLine = (text) =>
  String(text ?? "")
    .replace(/\s+/g, " ")
    .trim();
const clipLine = (line) => (line.length <= LINE_MAX ? line : `${line.slice(0, LINE_MAX - 1)}…`);

/** `pos kind subject - message`, at most LINE_MAX chars. */
export const factLine = (frame, patterns) =>
  clipLine(`${frame.pos} ${frame.event} ${lineSubject(frame.data, patterns)} - ${oneLine(frame.data?.message)}`);

export const controlLine = (frame) => {
  if (frame.event === "withheld")
    return clipLine(
      `${frame.pos ?? frame.data?.pos ?? "-"} withheld - a fact was withheld from this stream; read the record through its door to see it`,
    );
  return clipLine(`- lagging - the stream fell behind and is catching up from pos ${frame.data?.pos ?? "?"}`);
};

export const resyncLines = (oldest) => [
  `resync - the cursor is older than retention; the oldest retained pos is ${oldest}. Events in between are UNKNOWN, not absent.`,
  `read: re-read the state you follow through its door (\`everdict-api ops get_\` / \`list_\`), then re-arm with \`everdict-api watch <patterns> --after ${Math.max(0, Number(oldest) - 1)}\``,
];

/** `--until <kind>[:<field>=<value>]` → a predicate over a fact frame, or an error string. */
export const parseUntil = (spec) => {
  const colon = spec.indexOf(":");
  const kind = colon < 0 ? spec : spec.slice(0, colon);
  if (kind === "") return { error: "--until needs a kind" };
  if (colon < 0) return { match: (frame) => frame.event === kind };
  const eq = spec.indexOf("=", colon);
  if (eq < 0 || eq === colon + 1) return { error: `--until takes <kind>[:<field>=<value>], got "${spec}"` };
  const field = spec.slice(colon + 1, eq).split(".");
  const value = spec.slice(eq + 1);
  const read = (root) =>
    field.reduce((node, key) => (node !== null && typeof node === "object" ? node[key] : undefined), root);
  return {
    match: (frame) =>
      frame.event === kind &&
      [read(frame.data?.payload), read(frame.data)].some((v) => v !== undefined && String(v) === value),
  };
};
