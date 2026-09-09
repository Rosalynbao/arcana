import { NextResponse } from "next/server";
import { callWorker } from "../../../lib/pythonWorker";

export async function POST(req: Request) {
  try {
    const { userId, sessionId, note = "", isResolved = false } = await req.json();

    if (!userId || !sessionId) {
      return NextResponse.json({ error: "User id and session id are required." }, { status: 400 });
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- drop the internal request id, keep only the payload
    const { id, ...result } = await callWorker(
      { action: "memory", userId, sessionId, note, isResolved },
      30_000,
    );
    if (result.error) throw new Error(result.error);

    return NextResponse.json(result);
  } catch (error) {
    console.error("Memory route error:", error);
    const message = error instanceof Error ? error.message : "Unknown server error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
