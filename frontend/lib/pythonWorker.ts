import { spawn, ChildProcessWithoutNullStreams } from "child_process";
import path from "path";
import readline from "readline";

// Keeps ONE long-lived Python process per Node server instance, instead of the old
// pattern of execFile-ing a brand-new `python api_runner.py` for every single request.
// That old pattern re-imported langchain/langgraph/langchain-google-vertexai and
// re-built the ChatVertexAI client on every request, which was pure overhead sitting
// in front of the actual model calls. This module is a singleton (module-level state
// survives across requests handled by the same server process) so the pipeline is
// constructed once and reused. No new infrastructure/service — same container.

export type WorkerResponse = { id: number | null; error?: string; [key: string]: unknown };

let worker: ChildProcessWithoutNullStreams | null = null;
let rl: readline.Interface | null = null;
let reqCounter = 0;
const pending = new Map<
  number,
  { resolve: (value: WorkerResponse) => void; reject: (err: Error) => void }
>();

function backendRoot() {
  return path.join(process.cwd(), "..");
}

function pythonBin() {
  const root = backendRoot();
  return process.platform === "win32"
    ? path.join(root, "venv", "Scripts", "python.exe")
    : path.join(root, "venv", "bin", "python3");
}

function ensureWorker(): ChildProcessWithoutNullStreams {
  if (worker && !worker.killed) return worker;

  const root = backendRoot();
  const proc = spawn(pythonBin(), [path.join(root, "worker.py")], {
    cwd: root,
    env: {
      ...process.env,
      PYTHONPATH: root,
      PYTHONUNBUFFERED: "1",
      VERTEX_PROJECT: process.env.VERTEX_PROJECT ?? "ieor-4576-487001",
      VERTEX_LOCATION: process.env.VERTEX_LOCATION ?? "us-central1",
    },
  });

  proc.stderr.on("data", (chunk) => {
    console.error("[python worker]", chunk.toString().trim());
  });

  const lineReader = readline.createInterface({ input: proc.stdout });
  lineReader.on("line", (line) => {
    let msg: WorkerResponse;
    try {
      msg = JSON.parse(line);
    } catch {
      console.error("[python worker] non-JSON line:", line);
      return;
    }
    const entry = pending.get(msg.id as number);
    if (!entry) return;
    pending.delete(msg.id as number);
    entry.resolve(msg);
  });

  proc.on("exit", (code) => {
    console.error(`[python worker] exited with code ${code}`);
    if (worker === proc) worker = null;
    if (rl === lineReader) rl = null;
    for (const entry of pending.values()) {
      entry.reject(new Error("Python worker exited unexpectedly"));
    }
    pending.clear();
  });

  worker = proc;
  rl = lineReader;
  return proc;
}

export function callWorker(
  payload: Record<string, unknown>,
  timeoutMs = 120_000,
): Promise<WorkerResponse> {
  const proc = ensureWorker();
  const id = ++reqCounter;

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error("Python worker request timed out"));
    }, timeoutMs);

    pending.set(id, {
      resolve: (msg) => {
        clearTimeout(timer);
        resolve(msg);
      },
      reject: (err) => {
        clearTimeout(timer);
        reject(err);
      },
    });

    proc.stdin.write(JSON.stringify({ id, ...payload }) + "\n");
  });
}
