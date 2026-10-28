// WHAT A Bash CALL PUBLISHES, AND WHERE (DEFAUL-265, docs/specs/image-push-lands-in-the-managed-store-spec.md).
//
// `imagePushTargets(command)` answers one of five ways:
//   {kind:"none"}                — nothing in this command publishes an image.
//   {kind:"targets", refs}       — it publishes to these refs (each `{ref, host, repository}`); the guard
//                                  decides per ref whether this session holds a push_image_grant that covers it.
//   {kind:"sanctioned"}          — `everdict|assay image push` without `--registry`: the product's own path
//                                  into its managed store, already authorized by the control plane it calls.
//   {kind:"refused", why}        — `everdict image push --registry …`: a registry the caller brought, never
//                                  this workspace's managed store.
//   {kind:"unresolvable", why}   — a target this hook cannot read (a shell variable, a compose/bake file, a
//                                  build with no -t/--tag) — refused for the same reason it cannot be checked.
//
// Pure over the command string; no I/O, no process spawn. Read first, because it is the one place every verb
// this guard knows about is named: `docker|podman|nerdctl push`, `buildah push`, `docker build`/`buildx build`
// publishing via `--push` or `--output type=registry`/`push=true`, `buildx bake --push`, `compose push`/
// `compose build --push`, `crane push`/`copy`, `skopeo copy`, `oras push`, `regctl image copy`, and the
// product's own `everdict|assay image push`.
//
// STATED LIMIT (carried in the spec, not fixed here): a push inside a script FILE this command merely invokes
// is not seen — only the Bash command line itself is read.

// ── splitting: `&&` `||` `;` `|` and newlines, quote-aware so a `;` inside a quoted string never splits ──
export function splitSegments(command) {
  const segments = [];
  let cur = "";
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < command.length; i += 1) {
    const c = command[i];
    if (inSingle) {
      cur += c;
      if (c === "'") inSingle = false;
      continue;
    }
    if (inDouble) {
      cur += c;
      if (c === '"') inDouble = false;
      else if (c === "\\" && i + 1 < command.length) {
        cur += command[i + 1];
        i += 1;
      }
      continue;
    }
    if (c === "'") {
      inSingle = true;
      cur += c;
      continue;
    }
    if (c === '"') {
      inDouble = true;
      cur += c;
      continue;
    }
    if (c === "\\" && i + 1 < command.length) {
      cur += c + command[i + 1];
      i += 1;
      continue;
    }
    if (c === "\n" || c === ";") {
      segments.push(cur);
      cur = "";
      continue;
    }
    if ((c === "&" && command[i + 1] === "&") || (c === "|" && command[i + 1] === "|")) {
      segments.push(cur);
      cur = "";
      i += 1;
      continue;
    }
    if (c === "|") {
      segments.push(cur);
      cur = "";
      continue;
    }
    cur += c;
  }
  segments.push(cur);
  return segments.map((s) => s.trim()).filter((s) => s.length > 0);
}

// ── tokenising one segment, quote-aware: quotes are consumed, their CONTENTS (including a bare `$`) survive ──
export function tokenize(segment) {
  const tokens = [];
  let cur = "";
  let has = false;
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < segment.length; i += 1) {
    const c = segment[i];
    if (inSingle) {
      if (c === "'") inSingle = false;
      else cur += c;
      continue;
    }
    if (inDouble) {
      if (c === '"') inDouble = false;
      else if (c === "\\" && i + 1 < segment.length && '"\\$`'.includes(segment[i + 1])) {
        cur += segment[i + 1];
        i += 1;
      } else cur += c;
      continue;
    }
    if (c === "'") {
      inSingle = true;
      has = true;
      continue;
    }
    if (c === '"') {
      inDouble = true;
      has = true;
      continue;
    }
    if (/\s/.test(c)) {
      if (has || cur.length > 0) tokens.push(cur);
      cur = "";
      has = false;
      continue;
    }
    if (c === "\\" && i + 1 < segment.length) {
      cur += segment[i + 1];
      i += 1;
      has = true;
      continue;
    }
    cur += c;
    has = true;
  }
  if (has || cur.length > 0) tokens.push(cur);
  return tokens;
}

const isFlag = (t) => t.startsWith("-") && t !== "-";
const positionalArgs = (tokens) => tokens.filter((t) => !isFlag(t));
const hasFlag = (tokens, name) => tokens.includes(name);
const flagValues = (tokens, names) => {
  const values = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const t = tokens[i];
    for (const name of names) {
      if (t === name && i + 1 < tokens.length) {
        values.push(tokens[i + 1]);
      } else if (t.startsWith(`${name}=`)) {
        values.push(t.slice(name.length + 1));
      }
    }
  }
  return values;
};

// A ref written with a shell expansion cannot be checked, so it is refused for that reason rather than parsed.
const containsShellExpansion = (s) => s.includes("$") || s.includes("`");

// The host is the first `/`-separated component when it contains `.` or `:`, or is `localhost`; otherwise the
// ref is Docker Hub, which is never the store. `@digest` and the LAST component's `:tag` are stripped — a
// digest can only trail the whole ref, and a tag only the final path segment (an earlier one's `:` is a host
// port, already consumed).
export function parseImagePushRef(ref) {
  const digestIdx = ref.indexOf("@");
  const withoutDigest = digestIdx === -1 ? ref : ref.slice(0, digestIdx);
  const segments = withoutDigest.split("/").filter((s) => s.length > 0);
  if (segments.length === 0) return { ref, host: undefined, repository: "" };
  const first = segments[0];
  const hasHost = segments.length > 1 && (first.includes(".") || first.includes(":") || first === "localhost");
  const host = hasHost ? first : undefined;
  const pathSegments = hasHost ? segments.slice(1) : segments;
  const lastIdx = pathSegments.length - 1;
  const last = pathSegments[lastIdx] ?? "";
  const colonIdx = last.lastIndexOf(":");
  const strippedLast = colonIdx === -1 ? last : last.slice(0, colonIdx);
  const repository = [...pathSegments.slice(0, lastIdx), strippedLast].join("/");
  return { ref, host, repository };
}

const refOrUnresolvable = (target) =>
  containsShellExpansion(target)
    ? {
        kind: "unresolvable",
        why: `target "${target}" contains a shell expansion — write the target literally so it can be checked`,
      }
    : { kind: "targets", refs: [parseImagePushRef(target)] };

const refsOrUnresolvable = (targets, whyNone) => {
  if (targets.length === 0) return { kind: "unresolvable", why: whyNone };
  for (const t of targets) if (containsShellExpansion(t)) return refOrUnresolvable(t);
  return { kind: "targets", refs: targets.map(parseImagePushRef) };
};

// `docker build` / `docker buildx build` publish only via `--push`, or `--output`/`-o` naming
// `type=registry`/`push=true` — otherwise it is a local build, not a push. Targets are the `-t`/`--tag` values.
const buildDecision = (args) => {
  const outputs = flagValues(args, ["--output", "-o"]);
  const publishesViaOutput = outputs.some((o) => o.includes("type=registry") || o.includes("push=true"));
  if (!hasFlag(args, "--push") && !publishesViaOutput) return { kind: "none" };
  return refsOrUnresolvable(
    flagValues(args, ["-t", "--tag"]),
    "this build publishes (--push / --output type=registry) but names no -t/--tag — there is no ref to check",
  );
};

// `compose push` and `compose build --push` publish whatever compose.yaml's `image:` fields say — not a ref
// on this command line.
const composeDecision = (args) => {
  if (args[0] === "push")
    return {
      kind: "unresolvable",
      why: "`compose push` publishes the images named in compose.yaml, not a ref on this command line",
    };
  if (args[0] === "build" && hasFlag(args, "--push"))
    return {
      kind: "unresolvable",
      why: "`compose build --push` publishes the images named in compose.yaml, not a ref on this command line",
    };
  return { kind: "none" };
};

function classifySegment(segment) {
  const tokens = tokenize(segment);
  let i = 0;
  while (i < tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[i])) i += 1;
  if (tokens[i] === "sudo") i += 1;
  const verb = tokens[i];
  const rest = tokens.slice(i + 1);
  if (!verb) return { kind: "none" };

  if (verb === "docker" || verb === "podman" || verb === "nerdctl") {
    const sub = rest[0];
    if (sub === "push") {
      const target = positionalArgs(rest.slice(1))[0];
      return target ? refOrUnresolvable(target) : { kind: "unresolvable", why: `${verb} push given no image` };
    }
    if (sub === "image" && rest[1] === "push") {
      const target = positionalArgs(rest.slice(2))[0];
      return target ? refOrUnresolvable(target) : { kind: "unresolvable", why: `${verb} image push given no image` };
    }
    if (sub === "build") return buildDecision(rest.slice(1));
    if (sub === "buildx" && rest[1] === "build") return buildDecision(rest.slice(2));
    if (sub === "buildx" && rest[1] === "bake") {
      return hasFlag(rest.slice(2), "--push")
        ? {
            kind: "unresolvable",
            why: "`buildx bake --push` publishes the targets named in the bake file, not a ref on this command line",
          }
        : { kind: "none" };
    }
    if (sub === "compose") return composeDecision(rest.slice(1));
    return { kind: "none" };
  }

  if (verb === "docker-compose") return composeDecision(rest);

  if (verb === "buildah" && rest[0] === "push") {
    const positional = positionalArgs(rest.slice(1));
    const target = positional.length > 1 ? positional[1] : positional[0];
    return target ? refOrUnresolvable(target) : { kind: "unresolvable", why: "buildah push given no image" };
  }

  if (verb === "crane") {
    if (rest[0] === "push") {
      const positional = positionalArgs(rest.slice(1));
      const target = positional[1];
      return target ? refOrUnresolvable(target) : { kind: "unresolvable", why: "crane push given no target ref" };
    }
    if (rest[0] === "copy" || rest[0] === "cp") {
      const positional = positionalArgs(rest.slice(1));
      const target = positional[1];
      return target ? refOrUnresolvable(target) : { kind: "unresolvable", why: "crane copy given no destination" };
    }
    return { kind: "none" };
  }

  if (verb === "skopeo" && rest[0] === "copy") {
    const positional = positionalArgs(rest.slice(1));
    const dst = positional[1];
    if (!dst) return { kind: "unresolvable", why: "skopeo copy given no destination" };
    if (containsShellExpansion(dst))
      return {
        kind: "unresolvable",
        why: `target "${dst}" contains a shell expansion — write the target literally so it can be checked`,
      };
    if (!dst.startsWith("docker://")) return { kind: "none" };
    return { kind: "targets", refs: [parseImagePushRef(dst.slice("docker://".length))] };
  }

  if (verb === "oras" && rest[0] === "push") {
    const target = positionalArgs(rest.slice(1))[0];
    return target ? refOrUnresolvable(target) : { kind: "unresolvable", why: "oras push given no ref" };
  }

  if (verb === "regctl" && rest[0] === "image" && rest[1] === "copy") {
    const positional = positionalArgs(rest.slice(2));
    const dst = positional[1];
    return dst ? refOrUnresolvable(dst) : { kind: "unresolvable", why: "regctl image copy given no destination" };
  }

  if ((verb === "everdict" || verb === "assay") && rest[0] === "image" && rest[1] === "push") {
    if (hasFlag(rest, "--registry") || rest.some((t) => t.startsWith("--registry=")))
      return {
        kind: "refused",
        why: "`everdict image push --registry` publishes to a registry you brought — not this workspace's Everdict managed image store",
      };
    return { kind: "sanctioned" };
  }

  return { kind: "none" };
}

export function imagePushTargets(command) {
  if (typeof command !== "string" || command.trim() === "") return { kind: "none" };
  const results = splitSegments(command)
    .map(classifySegment)
    .filter((r) => r.kind !== "none");
  if (results.length === 0) return { kind: "none" };
  const refused = results.find((r) => r.kind === "refused");
  if (refused) return refused;
  const unresolvable = results.find((r) => r.kind === "unresolvable");
  if (unresolvable) return unresolvable;
  const targeted = results.filter((r) => r.kind === "targets");
  if (targeted.length > 0) return { kind: "targets", refs: targeted.flatMap((r) => r.refs) };
  return { kind: "sanctioned" };
}
