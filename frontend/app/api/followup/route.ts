import { NextResponse } from "next/server";
import { execFile } from "child_process";
import util from "util";
import path from "path";

const execFilePromise = util.promisify(execFile);

function hasAny(text: string, terms: string[]) {
  return terms.some((term) => text.includes(term));
}

function getBoundaryResponse(question: string) {
  const text = question.toLowerCase();

  if (hasAny(text, ["suicide", "kill myself", "end my life", "self harm", "hurt myself"])) {
    return {
      blocked: true,
      reply:
        "This needs real support, not a reading. Please contact local emergency services or a trusted person now. If you are in the U.S., call or text 988 for immediate support.",
    };
  }

  if (hasAny(text, ["when will i die", "when am i going to die", "how long will i live", "my death date", "date of my death", "predict my death", "will i die soon", "am i going to die soon", "lifespan", "life expectancy"])) {
    return {
      blocked: true,
      reply:
        "A death prediction would not be ethical. I cannot draw cards to predict when you or another person will die. If this question is coming from fear, try asking what would help you feel more grounded and alive right now.",
    };
  }

  if (hasAny(text, ["kill ", "murder", "hurt someone", "poison", "revenge", "weapon"])) {
    return {
      blocked: true,
      reply:
        "I cannot help plan harm. Arcana can help you name anger, fear, or betrayal, but it will not turn those feelings into instructions.",
    };
  }

  if (hasAny(text, ["hack", "password", "spy on", "track my", "stalk", "blackmail", "dox", "break into"])) {
    return {
      blocked: true,
      reply:
        "That crosses a privacy boundary. I cannot help with spying, hacking, coercion, or invading someone else's privacy.",
    };
  }

  if (hasAny(text, ["diagnose", "cancer", "pregnant", "pregnancy", "disease", "medical", "lawsuit", "legal advice", "stock", "crypto", "lottery"])) {
    return {
      blocked: true,
      reply:
        "This should not be decided by cards. I cannot replace medical, legal, or financial advice.",
    };
  }

  if (hasAny(text, ["make him love me", "make her love me", "force them", "curse", "control them", "manipulate"])) {
    return {
      blocked: true,
      reply:
        "Love readings need consent. I cannot help with controlling another person, but I can help you reflect on boundaries and patterns.",
    };
  }

  return { blocked: false, reply: "" };
}

export async function POST(req: Request) {
  try {
    const { question, reading, userId = "anonymous" } = await req.json();
    const trimmedQuestion = typeof question === "string" ? question.trim() : "";

    if (!trimmedQuestion) {
      return NextResponse.json({ error: "Follow-up question is required." }, { status: 400 });
    }

    if (!reading || typeof reading !== "object") {
      return NextResponse.json({ error: "Reading context is required." }, { status: 400 });
    }

    const boundary = getBoundaryResponse(trimmedQuestion);
    if (boundary.blocked) {
      return NextResponse.json({ reply: boundary.reply, blocked: true });
    }

    const backendRoot = path.join(process.cwd(), "..");
    const isWindows = process.platform === "win32";
    const pythonBin = isWindows
      ? path.join(backendRoot, "venv", "Scripts", "python.exe")
      : path.join(backendRoot, "venv", "bin", "python3");
    const scriptPath = path.join(backendRoot, "api_followup_runner.py");

    const { stdout, stderr } = await execFilePromise(
      pythonBin,
      [scriptPath, trimmedQuestion, JSON.stringify(reading), String(userId)],
      {
        env: {
          ...process.env,
          PYTHONPATH: backendRoot,
          VERTEX_PROJECT: process.env.VERTEX_PROJECT ?? "ieor-4576-487001",
          VERTEX_LOCATION: process.env.VERTEX_LOCATION ?? "us-central1",
        },
        timeout: 120000,
        maxBuffer: 1024 * 1024 * 5,
      },
    );

    if (stderr) console.error("[Python stderr]:", stderr);

    const jsonStart = stdout.indexOf("{");
    if (jsonStart === -1) throw new Error("No JSON in Python output: " + stdout.slice(0, 200));

    const result = JSON.parse(stdout.substring(jsonStart));
    if (result.error) throw new Error(result.error);

    return NextResponse.json(result);
  } catch (error) {
    console.error("Follow-up route error:", error);
    const message = error instanceof Error ? error.message : "Unknown server error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
