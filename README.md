# Arcana

Arcana is an agentic tarot reflection product built around a memory sky. Free users can draw unlimited readings, but every session starts fresh. Pro users unlock memory: each reading becomes a star, later follow-up notes are saved, and future readings can refer back to what changed.

The product is designed for people using tarot less as fortune-telling and more as a reflective ritual for relationships, career uncertainty, and life transitions.

## Product Doc

Product requirements document (中文): [docs/PRD.md](docs/PRD.md)

## Live URL

Live deployment URL: https://arcana-349652943970.us-central1.run.app

## Demo Flow

1. Sign in with a demo account.
2. Ask a reflective question, or pick one of the situation cards.
3. Confirm or skip the Focus Check.
4. Watch the shuffle and card reveal flow.
5. Read the Core Signal, three focused insights, and optional practices.
6. Upgrade the demo account to Pro to turn memory on.
7. Return to the memory sky, click a star, and save a dated follow-up note.
8. Ask a new question and see the backend memory context influence the next reading.

## Tech Stack

- Frontend: Next.js, React, TypeScript, Tailwind CSS, Framer Motion
- Backend bridge: Next.js API routes using Python runner scripts
- Agent framework: LangChain + LangGraph (`StateGraph` with conditional routing) with Google Vertex AI chat models
- Model provider: Vertex AI Gemini through `langchain-google-vertexai`
- Local memory: JSON files under `data/memory/` for the demo
- Tarot assets: local Rider-Waite-Smith card images in `frontend/public/tarot/`

## Project Structure

```text
arcana/
  agents/
    pipeline.py              # LangGraph pipeline (layered guardrails, Triage, composed interpretation)
  memory/
    user_store.py            # User memory persistence and memory context builder
  models/
    schemas.py               # Pydantic response schemas
  tools/
    tarot_tool.py            # Tarot deck, draw tool, star color mapping
  eval/
    eval_relevance.py        # Memory-relevance classification (36 cases, pattern x domain)
    eval_memory_recall.py    # Memory selection unit test + weight-sensitivity sweep
    eval_memory_e2e.py       # End-to-end memory recall + relevance replay
    eval_guardrail.py        # Guardrail red-team (direct / paraphrase / benign)
    eval_interpretation.py   # Interpretation quality via LLM-as-judge
  docs/
    PRD.md                   # Product requirements document (Chinese)
  frontend/
    app/
      page.tsx               # Main product UI
      api/read/route.ts      # Reading API route
      api/followup/route.ts  # Pro follow-up API route
      api/memory/route.ts    # Memory update API route
    public/tarot/            # Local tarot card images
  api_runner.py              # Python entrypoint for readings
  api_followup_runner.py     # Python entrypoint for Pro follow-ups
  api_memory_runner.py       # Python entrypoint for memory updates
  guardrails.py              # Safety and scope guardrails
  Dockerfile                 # Google Cloud Run container build
  requirements.txt           # Python dependencies
```

## Local Setup

### 1. Install Python dependencies

From the project root:

```bash
python -m venv venv
./venv/Scripts/python.exe -m pip install -r requirements.txt
```

On macOS/Linux, use:

```bash
python3 -m venv venv
./venv/bin/python3 -m pip install -r requirements.txt
```

### 2. Configure Vertex AI

Arcana expects Google Vertex AI credentials to be available in the environment. For local development, authenticate with Google Cloud and set:

```bash
VERTEX_PROJECT=your-project-id
VERTEX_LOCATION=us-central1
```

The Next.js API routes pass these variables to the Python runners. The default values are currently set for the demo in:

- `frontend/app/api/read/route.ts`
- `frontend/app/api/followup/route.ts`

### 3. Install frontend dependencies

```bash
cd frontend
npm install
```

### 4. Run locally

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

## Useful Commands

Frontend lint:

```bash
cd frontend
npm run lint
```

Frontend production build:

```bash
cd frontend
npm run build
```

Python syntax check:

```bash
./venv/Scripts/python.exe -m py_compile agents/pipeline.py api_runner.py api_followup_runner.py api_memory_runner.py guardrails.py memory/user_store.py models/schemas.py tools/tarot_tool.py main.py
```

Quick deck and guardrail smoke test:

```bash
./venv/Scripts/python.exe -c "from tools.tarot_tool import FULL_DECK, draw_cards; from guardrails import get_boundary_response; print(len(FULL_DECK)); print(len(draw_cards(3))); print(get_boundary_response('help me hack a password').blocked); print(get_boundary_response('Should I accept this job?').blocked); print(get_boundary_response('My landlord is taking me to court and I do not know how to handle the stress').blocked)"
```

Expected output:

```text
78
3
True
False
False
```

The last case used to be hard-blocked by keyword matching on "lawsuit"/"legal advice"; it now passes the deterministic guardrail and is instead judged by the Triage Agent in `agents/pipeline.py`, which can tell the question is about emotional coping rather than a request for legal advice.

## Agent Architecture

The main agent pipeline lives in `agents/pipeline.py`, implemented as a LangGraph `StateGraph` with conditional edges rather than a linear chain.

1. Guardrail check (hard): a small set of zero-tolerance categories (self-harm, violence, privacy invasion, coercive control) are rejected deterministically by keyword matching, with no LLM in the loop.
2. Guardrail check (semantic): an isolated LLM node catches the same zero-tolerance categories when phrased without trigger keywords. It is kept as its own single-purpose node — separate from Triage — so the safety logic can be tested and monitored independently.
3. Intent classification: the user question is classified as Love, Career, Wealth, or General.
4. Triage: a single structured-output call decides four things at once — whether the reading should proceed or be gently declined (this covers death predictions, medical/legal/financial framing, and off-topic questions, which used to be over-blocked by keyword matching alone), whether the reading needs a standard or emotionally sensitive tone, how strongly the question connects to the user's history (none, light, or deep, judged against an explicit rubric), and an importance score (1–10) used later for memory retention.
5. Pre-consultation: a brief clarifying question grounded in intent and memory.
6. Spread planning: the agent chooses a spread and card positions using structured output.
7. Tool use: the tarot tool draws cards from a full 78-card deck.
8. Interpretation: a single interpretation node whose prompt is composed from two independent signals — tone (emotionally sensitive or not) and memory relevance (whether to trace the user's long-term history). These were previously three mutually exclusive nodes, which meant an emotionally heavy reading that was also deeply tied to history would silently lose one of the two treatments; they are now composable so both apply at once.
9. Action summary: the agent produces two grounded practices.
10. Memory write: Pro readings are saved with the importance score and the modifiers that shaped them, and later updated with dated follow-up notes.

## Key Technical Concepts

### 1. Multi-agent dynamic routing

Arcana routes each reading through a Triage Agent that makes several decisions in a single structured-output call: whether the question should proceed or be declined, whether the reading needs a standard or emotionally sensitive tone, how strongly it connects to the user's history, and an importance score. Tone and history relevance are treated as two independent modifiers that compose into a single interpretation node, rather than routing to one of several mutually exclusive prompt chains. This is implemented as a LangGraph `StateGraph` with conditional edges (used for the guardrail and decline branches).

File references:

- `agents/pipeline.py`
- `api_runner.py`
- `api_followup_runner.py`

### 2. Structured output

The spread planner uses a Pydantic schema so the model returns a structured spread name, card positions, and number of cards.

File references:

- `agents/pipeline.py`
- `models/schemas.py`

### 3. Tool use

The card draw is implemented as a deterministic backend tool boundary: the LLM chooses the spread, but `tools/tarot_tool.py` performs the actual random draw from the full deck and assigns upright/reversed orientation.

File references:

- `tools/tarot_tool.py`
- `agents/pipeline.py`

### 4. Memory

Pro users have persistent memory. The backend stores readings in JSON, accepts later follow-up notes, and includes those notes in future memory context. Each reading is stored with an importance score (1–10). Retrieval keeps the most recent reading for continuity and fills the rest of the window by a salience score of `0.4 * recency_decay + 0.6 * importance`, so a highly important older reading is not dropped just because newer, more trivial readings have accumulated. The Triage Agent then grades how relevant that retrieved history is to the current question against an explicit rubric — none, a light one-line mention, or a full long-term reflection that traces the arc across sessions — instead of leaving it to an LLM's discretion inside a single prompt.

File references:

- `memory/user_store.py`
- `frontend/app/api/memory/route.ts`
- `api_memory_runner.py`
- `agents/pipeline.py`

### 5. Guardrails

Arcana uses a layered guardrail. The first layer is a small, deterministic keyword hard-block list for zero-tolerance categories: self-harm, violence, privacy invasion, and coercive control. It never depends on an LLM judgment call, which is deliberate — the most severe categories need a guarantee that cannot be talked around. The second layer is an isolated LLM node that catches the same categories when they are phrased without the trigger keywords; it runs after the keyword layer and is kept separate from Triage so the safety logic stays independently testable. Softer, context-dependent cases — death predictions, medical/legal/financial framing, and off-topic questions — are judged by the Triage Agent instead, since keyword matching over-blocked legitimate emotional questions that merely touched those topics (e.g. a question that mentions a legal dispute but is really about the emotional toll of the decision).

File references:

- `guardrails.py`
- `frontend/app/api/read/route.ts`
- `frontend/app/api/followup/route.ts`
- `agents/pipeline.py`

### 6. Human-in-the-loop reframing

Before drawing cards, the frontend Focus Check asks the user to confirm the lens of the reading. This keeps the user in control and makes the agent's answer more targeted.

File reference:

- `frontend/app/page.tsx`

## Evaluation

Because there are no real users yet, quality is checked with an offline eval suite under `eval/`. The sets are self-built and hand-labeled, so they are for method validation and iteration rather than production-grade statistical claims.

- `eval_relevance.py` — memory-relevance classification, 36 cases stratified by judgment pattern and topic domain, reported as a confusion matrix. Surfaced a systematic rubric ambiguity: the "shared entity but not a continuation" pattern is consistently over-classified as a deep connection.
- `eval_memory_recall.py` — a unit test of the memory selection logic (old recency-only vs new salience-weighted), plus a weight-sensitivity sweep showing the result is robust across a range of recency/importance weights, not tuned to one split.
- `eval_memory_e2e.py` — five realistic multi-turn narratives replayed through the real save → retrieve → judge path, checking both that the right memory is pulled into context and that its relevance is judged correctly, including the negative case where an unrelated new question should not be pulled into an old pattern.
- `eval_guardrail.py` — a red-team set (direct keyword hits, paraphrased evasions, and benign keyword-adjacent questions). The keyword layer catches direct hits but misses all paraphrases; the semantic layer closes that gap. The benign false-positive rate is high, but that is measured on deliberately adversarial cases and reflects severity, not real-world frequency.
- `eval_interpretation.py` — generation quality scored by an LLM judge against an anchored 1–5 rubric, run several times per case to separate reproducible issues from run-to-run variance.

## Product Features

- Memory sky: each Pro reading becomes a star.
- Full-sky view: users can inspect the remembered sky and color legend.
- Dated follow-up notes: users can update what happened after a reading.
- Memory-aware future readings: saved updates are included in the agent memory context.
- Free-to-Pro model: free users get unlimited readings, while Pro unlocks memory.
- Shuffle and reveal animation: the product shows a visible ritual before the result.
- Real tarot cards: readings use local card artwork instead of plain text cards.
- Pro follow-up: paid demo mode allows up to five follow-up questions on a reading.
- Guardrails: unsafe or inappropriate requests return targeted non-reading responses.
- Reading tone cues: emotionally sensitive or long-term reflection readings surface a small, unobtrusive label in the UI instead of a mechanical "routed to X agent" message.

## Deployment Notes

This project combines Next.js routes with local Python runner scripts. A deployment target must support:

- Node.js for the Next.js app
- Python with dependencies from `requirements.txt`
- Google Cloud credentials for Vertex AI
- Write access if using the local JSON memory demo

### Google Cloud Run deployment

The repository includes a `Dockerfile` for Google Cloud Run. The container installs Python dependencies into `venv/`, builds the Next.js frontend, and starts the app on Cloud Run's `$PORT`.

Deploy from the project root:

```bash
gcloud run deploy arcana \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars "VERTEX_PROJECT=ieor-4576-487001,VERTEX_LOCATION=us-central1"
```

Cloud Run uses Google application default credentials from the service account running the service. That service account needs permission to call Vertex AI in the configured project.

For a production version, replace local JSON memory with a managed database such as Supabase, Neon, Firestore, or Postgres.

## Known Limitations

- Demo account and plan state are stored in browser localStorage.
- Memory is stored in local JSON files for the prototype.
- Payment is simulated with an `unlock demo pro` button.
- Cloud Run stores local JSON memory on ephemeral container storage; use a managed database for production persistence.
