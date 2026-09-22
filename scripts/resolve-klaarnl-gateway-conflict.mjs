// Deterministically resolve the one merge conflict the KlaarNL fork can hit:
// upstream edits to src/server.ts colliding with the read-gateway export.
//
// The resolution takes upstream's side wholesale and re-appends the single
// export line. The KlaarNL-only read-gateway module lives in a separate file
// upstream never touches, so the line is the entire patch surface. The CI
// validation gate (ci:check, tests, self-host build, tsc) then proves the
// merged tree. Any other conflicted file exits non-zero and fails the run so
// the failure issue fires for a human.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const GIT = "src/server.ts";

function runGit(args) {
  return execFileSync("git", args, { encoding: "utf8" });
}

const conflicted = runGit(["diff", "--name-only", "--diff-filter=U"])
  .split("\n")
  .map((line) => line.trim())
  .filter(Boolean);

if (conflicted.length !== 1 || conflicted[0] !== GIT) {
  console.error(
    `Unhandled merge conflict(s): ${conflicted.join(", ") || "(none detected)"}. Human resolution required.`,
  );
  process.exit(1);
}

// Upstream's side wins outright.
runGit(["checkout", "--theirs", GIT]);

const gatewayExport = 'export { OpenSeoReadGateway } from "./server/read-gateway";';
const comment =
  "// Project-scoped, read-only RPC entrypoint for same-account Worker bindings.";

let source = readFileSync(GIT, "utf8");
if (!source.includes("OpenSeoReadGateway")) {
  if (!source.endsWith("\n")) source += "\n";
  source += `\n${comment}\n${gatewayExport}\n`;
  writeFileSync(GIT, source);
}

runGit(["add", GIT]);
console.log(
  "Resolved the src/server.ts conflict: upstream side kept, read-gateway export re-appended.",
);
