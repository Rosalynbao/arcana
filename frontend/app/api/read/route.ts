import { NextResponse } from 'next/server';
import { callWorker } from '../../../lib/pythonWorker';

function hasAny(text: string, terms: string[]) {
  return terms.some((term) => text.includes(term));
}

// Zero-tolerance categories only. Softer, context-dependent calls (death predictions,
// medical/legal/financial mentions, off-topic questions) are judged by the Triage Agent
// in the Python pipeline, since keyword matching over-blocks legitimate emotional
// questions that merely touch those topics. Keep this in sync with guardrails.py.
function getBoundaryResponse(question: string) {
  const text = question.toLowerCase();

  if (hasAny(text, ["suicide", "kill myself", "end my life", "self harm", "hurt myself"])) {
    return {
      blocked: true,
      title: "This needs real support, not a reading",
      message:
        "I cannot draw cards for immediate self-harm or crisis questions. Please contact local emergency services or a trusted person now. If you are in the U.S., call or text 988 for immediate support.",
    };
  }

  if (hasAny(text, ["kill ", "murder", "hurt someone", "poison", "revenge", "weapon"])) {
    return {
      blocked: true,
      title: "I cannot help plan harm",
      message:
        "Arcana can help you name anger, fear, or betrayal, but it will not turn those feelings into instructions. Try asking: What is the safest next step for me right now?",
    };
  }

  if (hasAny(text, ["hack", "password", "spy on", "track my", "stalk", "blackmail", "dox", "break into"])) {
    return {
      blocked: true,
      title: "That crosses a privacy boundary",
      message:
        "I cannot draw for questions about spying, hacking, coercion, or invading someone else's privacy. A better reading would ask what clarity or boundary you need without violating another person.",
    };
  }

  if (hasAny(text, ["make him love me", "make her love me", "force them", "curse", "control them", "manipulate"])) {
    return {
      blocked: true,
      title: "Love readings need consent",
      message:
        "I cannot help with controlling another person. You can still ask a powerful question: What pattern am I repeating, and what boundary would help me love without losing myself?",
    };
  }

  return { blocked: false };
}

export async function POST(req: Request) {
  try {
    const { question, userId = "anonymous", remember = false } = await req.json();
    const trimmedQuestion = typeof question === "string" ? question.trim() : "";

    if (!trimmedQuestion) {
      return NextResponse.json({ error: "Question is required." }, { status: 400 });
    }

    const boundary = getBoundaryResponse(trimmedQuestion);
    if (boundary.blocked) {
      return NextResponse.json(boundary);
    }

    console.log("[Node] Running Python reading pipeline");

    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- drop the internal request id, keep only the payload
    const { id, ...result } = await callWorker({
      action: "read",
      question: trimmedQuestion,
      userId,
      remember,
    });
    if (result.error) throw new Error(result.error);

    return NextResponse.json(result);

  } catch (error) {
    console.error("Route error:", error);
    const message =
      error instanceof Error ? error.message : "Unknown server error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
