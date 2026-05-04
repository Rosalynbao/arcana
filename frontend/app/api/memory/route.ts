import { NextResponse } from "next/server";
import { execFile } from "child_process";
import util from "util";
import path from "path";

const execFilePromise = util.promisify(execFile);

export async function POST(req: Request) {
  try {
    const { userId, sessionId, note = "", isResolved = false } = await req.json();

    if (!userId || !sessionId) {
      return NextResponse.json({ error: "User id and session id are required." }, { status: 400 });
    }

    const backendRoot = path.join(process.cwd(), "..");
    const isWindows = process.platform === "win32";
    const pythonBin = isWindows
      ? path.join(backendRoot, "venv", "Scripts", "python.exe")
      : path.join(backendRoot, "venv", "bin", "python3");
    const scriptPath = path.join(backendRoot, "api_memory_runner.py");

    const { stdout, stderr } = await execFilePromise(
      pythonBin,
      [scriptPath, String(userId), String(sessionId), String(note), isResolved ? "true" : "false"],
      {
        env: {
          ...process.env,
          PYTHONPATH: backendRoot,
        },
        timeout: 30000,
        maxBuffer: 1024 * 1024,
      },
    );

    if (stderr) console.error("[Python stderr]:", stderr);

    const jsonStart = stdout.indexOf("{");
    if (jsonStart === -1) throw new Error("No JSON in Python output: " + stdout.slice(0, 200));

    const result = JSON.parse(stdout.substring(jsonStart));
    if (result.error) throw new Error(result.error);

    return NextResponse.json(result);
  } catch (error) {
    console.error("Memory route error:", error);
    const message = error instanceof Error ? error.message : "Unknown server error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
