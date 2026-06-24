import { RECIPES, type RecipeName } from "../core/config";
import { writePipelineDocs } from "../core/pipeline-doc";
import { getRepoRoot } from "../core/workspace";

const USAGE = `
Usage: bun run doc <codebase|pipeline> [recipe] [--no-open]

  doc codebase               open the code analysis Web view
  doc pipeline               open all recipe pipeline documents
  doc pipeline <recipe>      open one recipe pipeline document
`;

export async function cmdDoc(args: string[]): Promise<void> {
  const view = args[0];
  const noOpen = args.includes("--no-open");
  const recipeArg = args.slice(1).find((arg) => !arg.startsWith("--"));

  if (view !== "codebase" && view !== "pipeline") {
    console.log(USAGE);
    process.exit(view ? 1 : 0);
  }
  if (recipeArg && (view !== "pipeline" || !RECIPES[recipeArg as RecipeName])) {
    console.error(`[doc] Unknown pipeline recipe: ${recipeArg}`);
    console.error(`[doc] Known recipes: ${Object.keys(RECIPES).sort().join(", ")}`);
    process.exit(1);
  }

  if (view === "pipeline") {
    const output = writePipelineDocs();
    console.log(`[doc] Generated recipe pipeline data: ${output}`);
  }

  const hash = view === "codebase"
    ? "#analysis"
    : `#pipeline${recipeArg ? `/${recipeArg}` : ""}`;
  const url = `http://localhost:5173/${hash}`;
  console.log(`[doc] ${view}: ${url}`);

  const viteArgs = ["bunx", "vite", "--host", "127.0.0.1"];
  if (!noOpen) viteArgs.push("--open", `/${hash}`);
  const proc = Bun.spawn(viteArgs, {
    cwd: getRepoRoot(),
    stdio: ["inherit", "inherit", "inherit"],
  });

  let interrupted = false;
  const stop = () => {
    interrupted = true;
    proc.kill("SIGTERM");
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  const exitCode = await proc.exited;
  if (!interrupted && exitCode !== 0) {
    throw new Error(`documentation server exited with code ${exitCode}`);
  }
}
