# Arcana

Arcana is an agentic tarot reflection product built around a memory sky. Free users can draw unlimited readings, but every session starts fresh. Pro users unlock memory: each reading becomes a star, later follow-up notes are saved, and future readings can refer back to what changed.

The product is designed for people using tarot less as fortune-telling and more as a reflective ritual for relationships, career uncertainty, and life transitions.

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
- Local memory: JSON files under `data/memory/` for the class demo
- Tarot assets: local Rider-Waite-Smith card images in `frontend/public/tarot/`

## Project Structure

```text
arcana/
  agents/
    pipeline.py              # LangGraph multi-agent pipeline (Triage + 3 interpretation agents)
  memory/
    user_store.py            # User memory persistence and memory context builder
  models/
    schemas.py               # Pydantic response schemas
  tools/
    tarot_tool.py            # Tarot deck, draw tool, star color mapping
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

The Next.js API routes pass these variables to the Python runners. The default values are currently set for the class demo in:

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

1. Guardrail check (hard): a small set of zero-tolerance categories (self-harm, violence, privacy invasion, coercive control) are rejected deterministically, with no LLM in the loop.
2. Intent classification: the user question is classified as Love, Career, Wealth, or General.
3. Triage: a single structured-output call decides three things at once — whether the reading should proceed or be gently declined (this now covers death predictions, medical/legal/financial framing, and off-topic questions, which used to be over-blocked by keyword matching alone), whether the reading needs a standard or emotionally sensitive tone, and how strongly the question connects to the user's history (none, light, or deep).
4. Pre-consultation: a brief clarifying question grounded in intent and memory.
5. Spread planning: the agent chooses a spread and card positions using structured output.
6. Tool use: the tarot tool draws cards from a full 78-card deck.
7. Interpretation: the graph routes to one of three distinct interpretation agents based on the Triage decision — standard, emotionally sensitive, or long-term reflection (which traces recurring patterns across a Pro user's past readings instead of repeating the same advice).
8. Action summary: the agent produces two grounded practices.
9. Memory write: Pro readings are saved with which interpretation route was taken, and later updated with dated follow-up notes.

## Class Concepts Used

### 1. Multi-agent dynamic routing

Arcana routes each reading through a Triage Agent that makes three decisions in a single structured-output call: whether the question should proceed or be declined, whether the reading needs a standard or emotionally sensitive tone, and how strongly it connects to the user's history. Based on that decision, the graph dispatches to one of three distinct interpretation agents — standard, emotionally sensitive, or long-term reflection — each with its own prompt and framing, rather than a single fixed prompt chain. This is implemented as a LangGraph `StateGraph` with conditional edges.

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

Pro users have persistent memory. The backend stores readings in JSON, accepts later follow-up notes, and includes those notes in future memory context. The Triage Agent grades how relevant that history is to the current question — none, a light one-line mention, or a full long-term reflection reading that traces the arc across sessions — instead of leaving it to an LLM's discretion inside a single prompt.

File references:

- `memory/user_store.py`
- `frontend/app/api/memory/route.ts`
- `api_memory_runner.py`
- `agents/pipeline.py`

### 5. Guardrails

Arcana keeps a small, deterministic hard-block list for zero-tolerance categories: self-harm, violence, privacy invasion, and coercive control. These run in both the API route and the Python pipeline and never depend on an LLM judgment call. Softer, context-dependent cases — death predictions, medical/legal/financial framing, and off-topic questions — are judged by the Triage Agent instead, since keyword matching over-blocked legitimate emotional questions that merely touched those topics (e.g. a question that mentions a legal dispute but is really about the emotional toll of the decision).

File references:

- `guardrails.py`
- `frontend/app/api/read/route.ts`
- `frontend/app/api/followup/route.ts`
- `agents/pipeline.py`

### 6. Human-in-the-loop reframing

Before drawing cards, the frontend Focus Check asks the user to confirm the lens of the reading. This keeps the user in control and makes the agent's answer more targeted.

File reference:

- `frontend/app/page.tsx`

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
- Memory is stored in local JSON files for the class prototype.
- Payment is simulated with an `unlock demo pro` button.
- Cloud Run stores local JSON memory on ephemeral container storage; use a managed database for production persistence.
