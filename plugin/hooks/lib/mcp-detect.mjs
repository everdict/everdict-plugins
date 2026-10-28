// Is an MCP server named `everdict` configured for this checkout? Reads ONLY server-name keys — never values.
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const keys = (obj) => (obj && typeof obj === "object" ? Object.keys(obj) : []);
const readJson = (file) => {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return undefined;
  }
};

// → "user" | "local" | "project" | undefined — the `claude mcp remove -s` scope that matched.
export const detectEverdictMcp = (root, home = os.homedir()) => {
  if (root && keys(readJson(path.join(root, ".mcp.json"))?.mcpServers).includes("everdict")) return "project";
  const claude = readJson(path.join(home, ".claude.json"));
  if (root && keys(claude?.projects?.[root]?.mcpServers).includes("everdict")) return "local";
  if (keys(claude?.mcpServers).includes("everdict")) return "user";
  return undefined;
};

export const mcpLine = (scope) =>
  scope
    ? `- An \`everdict\` MCP server is configured (${scope} scope): the plugin is REST-only, so it only costs ~4k tokens a session — \`claude mcp remove everdict -s ${scope}\`.`
    : undefined;

if (import.meta.url === `file://${process.argv[1]}`) {
  const line = mcpLine(detectEverdictMcp(process.argv[2] ?? process.cwd()));
  if (line) console.log(line);
}
