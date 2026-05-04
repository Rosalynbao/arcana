"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  Bookmark,
  CheckCircle2,
  Clock3,
  CreditCard,
  Trash2,
  Flame,
  Link2,
  Lock,
  LogOut,
  MessageCircle,
  Send,
  ShieldAlert,
  Sparkles,
  User,
  WandSparkles,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type ViewState = "sky" | "reframe" | "loading" | "reading";
type Weather = "major" | "cups" | "wands" | "swords" | "pentacles";

interface BoundaryCheck {
  blocked: boolean;
  title: string;
  message: string;
}

interface UserAccount {
  email: string;
  name: string;
  plan: "free" | "pro";
  followUpsUsed: number;
}

interface ChatMessage {
  role: "user" | "reader";
  content: string;
}

interface QuestionReframe {
  shouldTrigger: boolean;
  intensity: "light" | "deep";
  prompt: string;
  options: [string, string];
  psychologyNote: string;
}

interface ReadingData {
  intent: string;
  spread_name: string;
  card_positions: string[];
  cards_drawn: string[];
  pre_consult_question: string;
  interpretation: string;
  summary_advice: string;
  star_color: string;
  session_id: string;
  memory_enabled: boolean;
}

interface AmbientStar {
  id: number;
  left: string;
  top: string;
  size: string;
  delay: number;
}

interface MemoryStar {
  id: string;
  question: string;
  intent: string;
  color: string;
  left: string;
  top: string;
  date: string;
  cards: string[];
  spread: string;
  summary: string;
  unresolved: boolean;
  favorite?: boolean;
  note?: string;
  lastCheckIn?: string;
  lastCheckInAt?: string;
  followUps?: MemoryFollowUp[];
}

interface MemoryFollowUp {
  date: string;
  status: string;
  note: string;
}

interface TodayOracle {
  card: string;
  image: string;
}

interface OracleReading {
  title: string;
  lines: string[];
  practice: string;
}

interface PromptCard {
  label: string;
  question: string;
  tone: string;
}

const MAJOR_FILE: Record<string, string> = {
  "The Fool": "ar00",
  "The Magician": "ar01",
  "The High Priestess": "ar02",
  "The Empress": "ar03",
  "The Emperor": "ar04",
  "The Hierophant": "ar05",
  "The Lovers": "ar06",
  "The Chariot": "ar07",
  Strength: "ar08",
  "The Hermit": "ar09",
  "Wheel of Fortune": "ar10",
  Justice: "ar11",
  "The Hanged Man": "ar12",
  Death: "ar13",
  Temperance: "ar14",
  "The Devil": "ar15",
  "The Tower": "ar16",
  "The Star": "ar17",
  "The Moon": "ar18",
  "The Sun": "ar19",
  Judgement: "ar20",
  "The World": "ar21",
};

const SUIT_PREFIX: Record<string, string> = {
  Cups: "cu",
  Wands: "wa",
  Swords: "sw",
  Pentacles: "pe",
};

const RANK_FILE: Record<string, string> = {
  Ace: "ac",
  Two: "02",
  Three: "03",
  Four: "04",
  Five: "05",
  Six: "06",
  Seven: "07",
  Eight: "08",
  Nine: "09",
  Ten: "10",
  Page: "pa",
  Knight: "kn",
  Queen: "qu",
  King: "ki",
};

const SHUFFLE_BACKS = Array.from({ length: 14 }, (_, index) => index);
const SHUFFLE_STEPS = [
  "splitting the deck",
  "shuffling without looking",
  "cutting the deck",
  "drawing the spread",
];

const STAR_LEGEND = [
  { label: "Love / Cups", color: "#e879a0", note: "emotion and attachment" },
  { label: "Work / Wands", color: "#f97316", note: "movement and ambition" },
  { label: "Clarity / Swords", color: "#7eb3f7", note: "conflict and thought" },
  { label: "Grounding / Pentacles", color: "#86efac", note: "stability and resources" },
  { label: "Major Arcana", color: "#b388ff", note: "larger life pattern" },
];

const seededRandom = (seed: number) => {
  const value = Math.sin(seed * 9301 + 49297) * 233280;
  return value - Math.floor(value);
};

const hashText = (text: string) =>
  text.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);

const getMemoryDateLabel = () =>
  new Date().toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

const getAccountUserId = (account: UserAccount | null) =>
  account?.email.trim().toLowerCase() || "anonymous-demo";

const getMemoryStorageKey = (account: UserAccount | null) =>
  `arcana-memory-stars:${getAccountUserId(account)}`;

const getBoundaryResponse = (question: string): BoundaryCheck => {
  const text = question.toLowerCase();
  const hasAny = (terms: string[]) => terms.some((term) => text.includes(term));

  if (hasAny(["suicide", "kill myself", "end my life", "self harm", "hurt myself"])) {
    return {
      blocked: true,
      title: "This needs real support, not a reading",
      message:
        "I cannot draw cards for immediate self-harm or crisis questions. Please contact local emergency services or a trusted person now. If you are in the U.S., call or text 988 for immediate support.",
    };
  }

  if (hasAny(["when will i die", "when am i going to die", "how long will i live", "my death date", "date of my death", "predict my death", "will i die soon", "am i going to die soon", "lifespan", "life expectancy"])) {
    return {
      blocked: true,
      title: "A death prediction would not be ethical",
      message:
        "I cannot draw cards to predict when you or another person will die. If this question is coming from fear, try asking: What would help me feel more grounded and alive right now?",
    };
  }

  if (hasAny(["kill ", "murder", "hurt someone", "poison", "revenge", "weapon"])) {
    return {
      blocked: true,
      title: "I cannot help plan harm",
      message:
        "Arcana can help you name anger, fear, or betrayal, but it will not turn those feelings into instructions. Try asking: What is the safest next step for me right now?",
    };
  }

  if (hasAny(["hack", "password", "spy on", "track my", "stalk", "blackmail", "dox", "break into"])) {
    return {
      blocked: true,
      title: "That crosses a privacy boundary",
      message:
        "I cannot draw for questions about spying, hacking, coercion, or invading someone else's privacy. A better reading would ask what clarity or boundary you need without violating another person.",
    };
  }

  if (hasAny(["diagnose", "cancer", "pregnant", "pregnancy", "disease", "medical", "lawsuit", "legal advice", "stock", "crypto", "lottery"])) {
    return {
      blocked: true,
      title: "This should not be decided by cards",
      message:
        "I cannot replace medical, legal, or financial advice. If you want, reframe the question around your emotions, preparation, or the conversation you need to have with a qualified professional.",
    };
  }

  if (hasAny(["make him love me", "make her love me", "force them", "curse", "control them", "manipulate"])) {
    return {
      blocked: true,
      title: "Love readings need consent",
      message:
        "I cannot help with controlling another person. You can still ask a powerful question: What pattern am I repeating, and what boundary would help me love without losing myself?",
    };
  }

  const tarotSignals = [
    "love",
    "relationship",
    "career",
    "job",
    "work",
    "future",
    "choice",
    "decision",
    "feel",
    "stuck",
    "move",
    "path",
    "should",
    "why",
    "friend",
    "family",
    "money",
    "growth",
    "healing",
  ];
  const offTopicSignals = ["code", "debug", "recipe", "homework", "translate", "weather", "calculate", "math", "summarize"];

  if (!hasAny(tarotSignals) && hasAny(offTopicSignals)) {
    return {
      blocked: true,
      title: "This is outside a tarot reading",
      message:
        "Arcana is built for reflective questions about choices, relationships, emotions, and life patterns. Try turning this into a personal question, such as: What am I avoiding in this decision?",
    };
  }

  return {
    blocked: false,
    title: "",
    message: "",
  };
};

const createAmbientStars = (): AmbientStar[] =>
  Array.from({ length: 90 }).map((_, i) => ({
    id: i,
    left: `${(seededRandom(i + 1) * 100).toFixed(4)}%`,
    top: `${(seededRandom(i + 101) * 100).toFixed(4)}%`,
    size: `${(seededRandom(i + 201) * 2.2 + 0.7).toFixed(4)}px`,
    delay: seededRandom(i + 301) * 5,
  }));

const getWeather = (cards: string[]): Weather => {
  const counts: Record<Weather, number> = {
    major: 0,
    cups: 0,
    wands: 0,
    swords: 0,
    pentacles: 0,
  };

  cards.forEach((card) => {
    if (card.includes("Cups")) counts.cups += 1;
    else if (card.includes("Wands")) counts.wands += 1;
    else if (card.includes("Swords")) counts.swords += 1;
    else if (card.includes("Pentacles")) counts.pentacles += 1;
    else counts.major += 1;
  });

  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] as Weather;
};

const getWeatherClass = (weather: Weather) => {
  if (weather === "cups") {
    return "bg-[radial-gradient(circle_at_70%_18%,rgba(226,232,240,0.32),transparent_8%),radial-gradient(circle_at_50%_22%,rgba(232,121,160,0.18),transparent_36%),linear-gradient(to_bottom,rgba(9,15,35,0.25),rgba(0,0,0,0.82))]";
  }
  if (weather === "wands") {
    return "bg-[radial-gradient(circle_at_50%_70%,rgba(249,115,22,0.28),transparent_34%),radial-gradient(circle_at_35%_30%,rgba(251,191,36,0.14),transparent_30%),linear-gradient(to_bottom,rgba(18,8,3,0.2),rgba(0,0,0,0.82))]";
  }
  if (weather === "swords") {
    return "bg-[radial-gradient(circle_at_35%_18%,rgba(100,116,139,0.32),transparent_28%),radial-gradient(circle_at_70%_38%,rgba(126,179,247,0.12),transparent_30%),linear-gradient(to_bottom,rgba(2,6,23,0.35),rgba(0,0,0,0.88))]";
  }
  if (weather === "pentacles") {
    return "bg-[radial-gradient(circle_at_48%_68%,rgba(134,239,172,0.2),transparent_34%),radial-gradient(circle_at_70%_22%,rgba(250,204,21,0.1),transparent_26%),linear-gradient(to_bottom,rgba(2,20,12,0.26),rgba(0,0,0,0.82))]";
  }
  return "bg-[radial-gradient(circle_at_50%_18%,rgba(179,136,255,0.18),transparent_35%),linear-gradient(to_bottom,rgba(15,23,42,0.18),rgba(0,0,0,0.82))]";
};

const getWeatherMood = (weather: Weather) =>
  ({
    cups: "The atmosphere is soft and lunar: emotion, memory, and attachment are leading the reading.",
    wands: "The atmosphere is warm and restless: desire, movement, and creative pressure are in the room.",
    swords: "The atmosphere is sharp and clouded: thought, tension, and choice need careful handling.",
    pentacles: "The atmosphere is grounded and green-gold: stability, body, work, and resources want attention.",
    major: "The atmosphere is violet and wide: this reading carries a larger archetypal charge.",
  })[weather];

const splitReading = (text: string) =>
  text
    .replace(/\*\*/g, "")
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter((part) => {
      const normalized = part.toLowerCase().replace(/[^\w\s]/g, "").trim();
      return (
        normalized.length > 24 &&
        !normalized.startsWith("welcome") &&
        !normalized.includes("honor to sit with you")
      );
    })
    .slice(0, 6);

const normalizeReadingMarkers = (text: string) =>
  text
    .replace(/\r/g, "")
    .replace(/["""]/g, '"')
    .replace(/['']/g, "'")
    .replace(/\s+(?=(?:Core Signal|TL;DR)\s*:)/gi, "\n")
    .replace(/\s+(?=(?:Insight|Point)\s*\d+\s*:)/gi, "\n")
    .replace(/\s+(?=\d+\.\s)/g, "\n");

const getInsightCards = (text: string) => {
  const cleaned = normalizeReadingMarkers(text);
  const withoutCore = cleaned.replace(/(?:Core Signal|TL;DR)\s*:\s*[\s\S]*?(?=\n\s*(?:Insight|Point)\s*\d+\s*:|$)/i, "");
  const markerRegex = /(?:Insight|Point)\s*\d+\s*:\s*/gi;
  const markers = [...withoutCore.matchAll(markerRegex)];
  const explicitInsights = markers.map((match, index) => {
    const start = (match.index ?? 0) + match[0].length;
    const end = markers[index + 1]?.index ?? withoutCore.length;
    return withoutCore.slice(start, end).trim();
  });

  const usableInsights = explicitInsights.filter((line) => {
    const compact = compactText(line);
    return compact.length > 12 && !/^[.\s]+$/.test(compact);
  });

  if (usableInsights.length > 0) {
    return usableInsights.slice(0, 3).map((insight) => compactText(insight));
  }

  const paragraphs = splitReading(withoutCore);
  if (paragraphs.length >= 3) {
    return paragraphs.slice(0, 3).map((paragraph) => compactText(paragraph));
  }

  const fallbackInsights = withoutCore
    .replace(/(?:Core Signal|TL;DR):\s*.+?(?:\n|$)/i, "")
    .replace(/(?:Insight|Point)\s*\d+\s*:/gi, "")
    .split(/(?<=[.!?])\s+(?=[A-Z])/)
    .map((part) => part.trim())
    .filter((part) => {
      const normalized = part.toLowerCase();
      return (
        part.length > 45 &&
        !normalized.startsWith("insight") &&
        !normalized.startsWith("tl;dr")
      );
    })
    .slice(0, 3)
    .map((insight) => compactText(insight));

  return fallbackInsights.length > 0
    ? fallbackInsights
    : ["The spread is pointing to a pattern worth noticing before you decide what to do next."];
};

const INSIGHT_ANGLES = ["Root Pattern", "Present Tension", "Next Move"];
const INSIGHT_GUIDES = [
  "What keeps repeating underneath the question.",
  "What is active in the situation right now.",
  "The smallest useful direction to test next.",
];

const compactText = (text: string, maxLength = 190) => {
  const normalized = text
    .replace(/^[-*\d.\s]+/, "")
    .replace(/^Insight\s*\d+\s*:\s*/i, "")
    .replace(/\*\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (normalized.length <= maxLength) return normalized;

  const clipped = normalized.slice(0, maxLength);
  const lastBreak = Math.max(clipped.lastIndexOf("."), clipped.lastIndexOf(","), clipped.lastIndexOf(" "));
  const end = lastBreak > 80 ? lastBreak : maxLength;
  return `${clipped.slice(0, end).trim()}...`;
};

const getTldr = (text: string) => {
  const normalized = normalizeReadingMarkers(text);
  const explicit = normalized.match(/(?:Core Signal|TL;DR):\s*(.+?)(?:\n|$)/i);
  if (explicit?.[1]) return compactText(explicit[1], 150);

  const firstInsight = getInsightCards(text)[0] ?? text;
  return compactText(firstInsight, 150);
};

const getActionItems = (text: string) => {
  const normalized = text.trim();
  const matches = [...normalized.matchAll(/\d+\.\s*([\s\S]*?)(?=\n\s*\d+\.|$)/g)];
  const rawItems = matches.length > 0 ? matches.map((match) => match[1]) : normalized.split(/\n+/);

  return rawItems
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 2)
    .map((item) => {
      const titleMatch = item.match(/^\*\*([^*]+)\*\*:?\s*(.*)$/);
      return {
        title: titleMatch?.[1] ?? "Practice",
        body: compactText(titleMatch?.[2] || item.replace(/\*\*/g, ""), 170),
      };
    });
};

const renderInlineMarkdown = (text: string) => {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);

  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong className="font-semibold text-gray-100" key={`${part}-${index}`}>
          {part.slice(2, -2)}
        </strong>
      );
    }

    return <span key={`${part}-${index}`}>{part}</span>;
  });
};

function MarkdownText({ text }: { text: string }) {
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);

  return (
    <div className="space-y-4">
      {lines.map((line, index) => (
        <p className="leading-7 text-gray-300" key={`${line}-${index}`}>
          {renderInlineMarkdown(line)}
        </p>
      ))}
    </div>
  );
}

const getCardBaseName = (card: string) => card.replace(/\s+\((Upright|Reversed)\)$/i, "");
const isReversed = (card: string) => card.toLowerCase().includes("reversed");

const getTarotImage = (card: string) => {
  const baseName = getCardBaseName(card);
  if (MAJOR_FILE[baseName]) return `/tarot/${MAJOR_FILE[baseName]}.jpg`;

  const [rank, , suit] = baseName.split(" ");
  if (rank && suit && RANK_FILE[rank] && SUIT_PREFIX[suit]) {
    return `/tarot/${SUIT_PREFIX[suit]}${RANK_FILE[rank]}.jpg`;
  }

  return "/tarot/ar00.jpg";
};

const getOracleCard = () => {
  const majors = Object.keys(MAJOR_FILE);
  const index = Math.floor(Math.random() * majors.length);
  return majors[index];
};

const getOracleReading = (card: string): OracleReading => {
  const readings: Record<string, OracleReading> = {
    "The Fool": {
      title: "Begin before you feel fully ready",
      lines: [
        "The Fool arrives when life asks for movement before certainty.",
        "Today, notice where caution has become a costume for fear.",
        "You do not need to leap wildly, but one honest first step wants air.",
      ],
      practice: "Name one small action that would make the next door visible.",
    },
    "The Magician": {
      title: "Use what is already in your hands",
      lines: [
        "The Magician points to agency, timing, and attention.",
        "Today, your power is not in having more options, but in arranging the tools you already have.",
        "Choose one intention and let the scattered pieces serve it.",
      ],
      practice: "Write the one sentence you want your day to obey.",
    },
    "The High Priestess": {
      title: "Let the quiet evidence speak",
      lines: [
        "The High Priestess does not rush to explain herself.",
        "Today, listen for the information beneath the obvious conversation.",
        "Your intuition may be quieter than anxiety, but it is usually more precise.",
      ],
      practice: "Before answering anyone, pause long enough to feel your real yes or no.",
    },
    "The Empress": {
      title: "Return to what nourishes you",
      lines: [
        "The Empress brings attention back to care, body, and creative abundance.",
        "Today, productivity may begin with softness rather than force.",
        "Something grows better when it is tended, not judged.",
      ],
      practice: "Give one neglected part of your life a visible act of care.",
    },
    "The Emperor": {
      title: "Give the day a stronger container",
      lines: [
        "The Emperor asks for structure that protects rather than controls.",
        "Today, boundaries are not a wall against life; they are the architecture that lets life move.",
        "Decide what deserves your authority.",
      ],
      practice: "Set one clear limit before the day starts making decisions for you.",
    },
    "The Hierophant": {
      title: "Question the rule you inherited",
      lines: [
        "The Hierophant speaks through tradition, belonging, and learned expectations.",
        "Today, notice which rule you are following because it is wise, and which one you follow because it is familiar.",
        "A truer path may still need a ritual, but not a cage.",
      ],
      practice: "Rewrite one should-statement into a chosen value.",
    },
    "The Lovers": {
      title: "Choose from alignment, not hunger",
      lines: [
        "The Lovers is less about romance than the integrity of choice.",
        "Today, desire and values need to sit at the same table.",
        "The question is not only what you want, but what kind of self your wanting creates.",
      ],
      practice: "Ask whether your next yes brings you closer to yourself.",
    },
    "The Chariot": {
      title: "Move with both hands on the reins",
      lines: [
        "The Chariot appears when opposing forces need direction.",
        "Today, progress comes from steering tension rather than eliminating it.",
        "You can carry doubt and still move cleanly.",
      ],
      practice: "Pick the one direction that deserves your energy for the next hour.",
    },
    Strength: {
      title: "Use gentleness as discipline",
      lines: [
        "Strength is calm power, not performance.",
        "Today, the wild feeling does not need to be defeated; it needs to be met without surrendering the room.",
        "Soft control may work better than force.",
      ],
      practice: "Respond to one trigger with steadiness instead of speed.",
    },
    "The Hermit": {
      title: "Withdraw enough to hear yourself",
      lines: [
        "The Hermit asks for solitude with a purpose.",
        "Today, distance may reveal what constant input has blurred.",
        "The lamp is small, but it is enough for the next step.",
      ],
      practice: "Take ten quiet minutes before seeking another opinion.",
    },
    "Wheel of Fortune": {
      title: "Notice the turning point",
      lines: [
        "The Wheel marks cycles, timing, and change that cannot be negotiated with forever.",
        "Today, ask what is rotating back into view.",
        "A pattern may be ending because you are finally seeing it clearly.",
      ],
      practice: "Name what is changing without trying to control the whole turn.",
    },
    Justice: {
      title: "Tell the truth without decoration",
      lines: [
        "Justice asks for clean seeing and accountable choice.",
        "Today, separate facts from the story wrapped around them.",
        "The fairest answer may also be the simplest one.",
      ],
      practice: "Write the plain fact you have been softening or avoiding.",
    },
    "The Hanged Man": {
      title: "Stop pushing from the old angle",
      lines: [
        "The Hanged Man brings sacred delay and altered perspective.",
        "Today, stuckness may be asking you to look differently, not push harder.",
        "The pause is not empty if it changes what you can see.",
      ],
      practice: "Ask what becomes visible if you do nothing for one breath longer.",
    },
    Death: {
      title: "Let the finished thing be finished",
      lines: [
        "Death is the intelligence of endings.",
        "Today, something may need your consent to be complete.",
        "Release is not rejection; sometimes it is respect for what has already changed.",
      ],
      practice: "Name one ending you can stop arguing with.",
    },
    Temperance: {
      title: "Blend instead of forcing a verdict",
      lines: [
        "Temperance brings integration, pacing, and emotional alchemy.",
        "Today, the answer may be neither extreme.",
        "What matters is the proportion: how much patience, how much action, how much trust.",
      ],
      practice: "Adjust one habit by ten percent rather than trying to transform everything.",
    },
    "The Devil": {
      title: "See the bargain clearly",
      lines: [
        "The Devil shows where attachment disguises itself as necessity.",
        "Today, ask what you keep choosing because it gives short-term relief.",
        "Freedom begins when the chain becomes visible.",
      ],
      practice: "Name the reward that keeps one pattern alive.",
    },
    "The Tower": {
      title: "Let false stability fall away",
      lines: [
        "The Tower arrives when truth interrupts a structure that could not hold.",
        "Today, disruption may be revealing what was already unstable.",
        "Do not confuse collapse with failure if it returns you to reality.",
      ],
      practice: "Identify what is actually still standing.",
    },
    "The Star": {
      title: "Let hope become a practice",
      lines: [
        "The Star is quiet restoration after intensity.",
        "Today, healing may feel subtle, but it is not small.",
        "Let yourself receive evidence that life is not only the wound.",
      ],
      practice: "Do one thing that helps your future self trust you.",
    },
    "The Moon": {
      title: "Move slowly through uncertainty",
      lines: [
        "The Moon speaks when the path is real but not fully lit.",
        "Today, do not demand certainty from a moment built out of fog.",
        "Your task is to distinguish intuition from projection.",
      ],
      practice: "Delay one reactive decision until your nervous system settles.",
    },
    "The Sun": {
      title: "Let clarity be simple",
      lines: [
        "The Sun brings warmth, truth, and visible life.",
        "Today, look for the answer that does not need elaborate defense.",
        "Joy can be evidence, not a distraction.",
      ],
      practice: "Choose the option that makes your body feel more open.",
    },
    Judgement: {
      title: "Answer the call without rehearsing the old self",
      lines: [
        "Judgement appears when a larger version of your life asks to be heard.",
        "Today, something in you may be ready to stop explaining why it stayed asleep.",
        "The call is not punishment; it is invitation.",
      ],
      practice: "Write what you would do if you trusted that you had changed.",
    },
    "The World": {
      title: "Complete the circle with intention",
      lines: [
        "The World marks integration, completion, and arrival.",
        "Today, notice what has come full circle.",
        "You may not need another sign; you may need to honor the threshold you already crossed.",
      ],
      practice: "Close one loop before opening the next.",
    },
  };

  return readings[card] ?? readings["The Star"];
};

const PROMPT_CARDS: PromptCard[] = [
  {
    label: "Love feels unclear",
    question: "Someone I care about feels distant. What should I understand before I react?",
    tone: "Attachment",
  },
  {
    label: "Career crossroads",
    question: "I am facing a work decision. What should I consider before choosing my next step?",
    tone: "Values",
  },
  {
    label: "I feel stuck",
    question: "I feel stuck and unsure what I am really avoiding. What pattern should I notice?",
    tone: "Pattern",
  },
  {
    label: "A new beginning",
    question: "I am considering a new beginning. What energy should I bring with me?",
    tone: "Transition",
  },
];

const getQuestionReframe = (question: string): QuestionReframe => {
  const lower = question.toLowerCase();
  const emotionalWords = /(cold|distant|anxious|afraid|worried|confused|hurt|stuck|lost|panic|upset|angry|sad)/i;
  const otherDirected = /\b(he|she|they|him|her|them|my partner|my boss|my ex)\b/i;
  const clearDecision = /\bshould i (accept|take|choose|leave|move|quit|start|end)\b/i;
  const relationship = /(love|relationship|partner|reconcile|breakup|dating|future together)/i;
  const work = /(job|career|work|offer|interview|salary|business)/i;
  const wantsValidation = /(still|future|feel|think|love me|like me|will i|get|happen|right)/i;

  if (relationship.test(lower) || otherDirected.test(lower)) {
    return {
      shouldTrigger: true,
      intensity: "deep",
      prompt:
        "I notice your question centers on another person's signals. Should this reading focus on their possible direction, or on what you can choose next?",
      options: ["Their inner direction", "My next step"],
      psychologyNote: emotionalWords.test(lower)
        ? "Attachment theory suggests that uncertainty can pull attention toward the other person's signals. Choosing a focus helps return agency without dismissing the feeling."
        : "Mentalization separates what another person might feel from what you can actually know. This keeps the reading grounded instead of mind-reading.",
    };
  }

  if (work.test(lower)) {
    return {
      shouldTrigger: true,
      intensity: clearDecision.test(lower) && !emotionalWords.test(lower) ? "light" : "deep",
      prompt:
        clearDecision.test(lower)
          ? "Your question is already clear. I can draw right away, or you can choose a lens for the reading."
          : "I notice your question mixes outcome and pressure. Should this reading focus on the opportunity, or on the work life you are trying to build?",
      options: ["The opportunity", "My readiness"],
      psychologyNote: wantsValidation.test(lower)
        ? "Values-based therapy separates external approval from internal alignment. This helps the reading stay practical without turning the outcome into a judgment of worth."
        : "Career decisions often involve risk tolerance and identity. A focused frame helps distinguish the job from the kind of life it trains you to live.",
    };
  }

  return {
    shouldTrigger: true,
    intensity: clearDecision.test(lower) && !emotionalWords.test(lower) ? "light" : "deep",
    prompt:
      clearDecision.test(lower)
        ? "Your question is already clear. I can draw right away, or you can choose a lens for the reading."
        : "I want to make sure I understand. Should this reading help you name the pattern, or choose the next move?",
    options: ["Name the pattern", "Choose the next move"],
    psychologyNote: emotionalWords.test(lower)
      ? "Emotion-focused therapy treats strong emotion as information, not noise. Naming the frame can make the reading calmer and more useful."
      : "Narrative therapy treats questions as stories in progress. A small clarification can make the answer feel less generic while keeping you in control.",
  };
};

export default function Home() {
  const [account, setAccount] = useState<UserAccount | null>(null);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginName, setLoginName] = useState("");
  const [view, setView] = useState<ViewState>("sky");
  const [userQuestion, setUserQuestion] = useState("");
  const [questionMirror, setQuestionMirror] = useState<QuestionReframe | null>(null);
  const [refinedQuestion, setRefinedQuestion] = useState("");
  const [psychologyNote, setPsychologyNote] = useState("");
  const [reading, setReading] = useState<ReadingData | null>(null);
  const [revealedCards, setRevealedCards] = useState<boolean[]>([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [memoryStars, setMemoryStars] = useState<MemoryStar[]>([]);
  const [selectedStar, setSelectedStar] = useState<MemoryStar | null>(null);
  const [todayOracle, setTodayOracle] = useState<TodayOracle | null>(null);
  const [loadingStep, setLoadingStep] = useState(0);
  const [followUpInput, setFollowUpInput] = useState("");
  const [followUpMessages, setFollowUpMessages] = useState<ChatMessage[]>([]);
  const [followUpSending, setFollowUpSending] = useState(false);
  const [boundaryResponse, setBoundaryResponse] = useState<BoundaryCheck | null>(null);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [memoryCheckIn, setMemoryCheckIn] = useState("");
  const [selectedCheckIn, setSelectedCheckIn] = useState("");
  const [checkInNotice, setCheckInNotice] = useState("");
  const [dismissedCheckInId, setDismissedCheckInId] = useState("");
  const [memorySaveStatus, setMemorySaveStatus] = useState("");
  const [fullSkyOpen, setFullSkyOpen] = useState(false);
  const [oracleOpen, setOracleOpen] = useState(false);

  const ambientStars = useMemo(() => createAmbientStars(), []);
  const activeUserId = getAccountUserId(account);
  const memoryStorageKey = getMemoryStorageKey(account);
  const memoryEnabled = account?.plan === "pro";
  const currentWeather = reading ? getWeather(reading.cards_drawn) : "major";
  const oracleReading = todayOracle ? getOracleReading(todayOracle.card) : null;
  const allRevealed = revealedCards.length > 0 && revealedCards.every(Boolean);
  const readingParts = getInsightCards(reading?.interpretation ?? "");
  const readingTldr = reading ? getTldr(reading.interpretation) : "";
  const actionItems = reading ? getActionItems(reading.summary_advice) : [];
  const repeatedCard = useMemo(() => {
    if (!reading || memoryStars.length === 0) return null;
    const previousStars = memoryStars.filter((star) => star.id !== reading.session_id);
    if (previousStars.length === 0) return null;

    return reading.cards_drawn.find((card) =>
      previousStars.some((star) =>
        star.cards.some((pastCard) => getCardBaseName(pastCard) === getCardBaseName(card)),
      ),
    );
  }, [memoryStars, reading]);
  const returnPromptStar = useMemo(() => {
    if (checkInNotice) return null;
    if (!memoryEnabled) return null;
    const visibleStars = memoryStars.filter((star) => star.id !== dismissedCheckInId);
    return visibleStars.find((star) => star.unresolved) ?? visibleStars[0] ?? null;
  }, [checkInNotice, dismissedCheckInId, memoryEnabled, memoryStars]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const savedAccount = window.localStorage.getItem("arcana-account");
      if (savedAccount) setAccount(JSON.parse(savedAccount));

      const oracleDismissed = window.sessionStorage.getItem("arcana-oracle-dismissed");
      if (!oracleDismissed && Math.random() > 0.45) {
        const card = getOracleCard();
        setTodayOracle({
          card,
          image: getTarotImage(card),
        });
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!memoryEnabled) {
      setMemoryStars([]);
      return;
    }

    const raw = window.localStorage.getItem(memoryStorageKey);
    if (raw) {
      setMemoryStars(JSON.parse(raw));
      return;
    }

    if (memoryStorageKey === "arcana-memory-stars:anonymous-demo") {
      const legacyRaw = window.localStorage.getItem("arcana-memory-stars");
      if (legacyRaw) {
        setMemoryStars(JSON.parse(legacyRaw));
        return;
      }
    }

    setMemoryStars([]);
  }, [memoryEnabled, memoryStorageKey]);

  useEffect(() => {
    if (view !== "loading") return;

    const timer = window.setInterval(() => {
      setLoadingStep((step) => (step + 1) % 4);
    }, 1800);

    return () => window.clearInterval(timer);
  }, [view]);

  useEffect(() => {
    if (view !== "reading" || !reading) return;

    const timers = reading.cards_drawn.map((_, index) =>
      window.setTimeout(() => {
        setRevealedCards((prev) =>
          prev.map((value, current) => (current === index ? true : value)),
        );
      }, (index + 1) * 3000),
    );

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [reading, view]);

  const persistMemoryStars = (stars: MemoryStar[]) => {
    if (!memoryEnabled) return;
    setMemoryStars(stars);
    window.localStorage.setItem(memoryStorageKey, JSON.stringify(stars));
  };

  const persistAccount = (nextAccount: UserAccount | null) => {
    setAccount(nextAccount);
    if (nextAccount) {
      window.localStorage.setItem("arcana-account", JSON.stringify(nextAccount));
    } else {
      window.localStorage.removeItem("arcana-account");
    }
  };

  const handleLogin = () => {
    const email = loginEmail.trim();
    if (!email) return;
    persistAccount({
      email,
      name: loginName.trim() || email.split("@")[0],
      plan: "free",
      followUpsUsed: 0,
    });
    setLoginEmail("");
    setLoginName("");
    setAccountMenuOpen(false);
  };

  const handleLogout = () => {
    persistAccount(null);
    setAccountMenuOpen(false);
    setReading(null);
    setRevealedCards([]);
    setFollowUpMessages([]);
    setFollowUpInput("");
    setBoundaryResponse(null);
    setErrorMessage("");
    setSelectedStar(null);
    setView("sky");
  };

  const addMemoryStar = (result: ReadingData, question: string) => {
    if (!result.memory_enabled || !memoryEnabled) return;

    const seed = hashText(result.session_id || question);
    const nextStar: MemoryStar = {
      id: result.session_id,
      question,
      intent: result.intent,
      color: result.star_color,
      left: `${(10 + seededRandom(seed + 11) * 80).toFixed(4)}%`,
      top: `${(14 + seededRandom(seed + 17) * 72).toFixed(4)}%`,
      date: new Date().toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
      cards: result.cards_drawn,
      spread: result.spread_name,
      summary: result.summary_advice,
      unresolved: true,
      favorite: false,
      note: "",
      lastCheckIn: "",
      lastCheckInAt: "",
      followUps: [],
    };

    persistMemoryStars([nextStar, ...memoryStars].slice(0, 36));
  };

  const handleStartReading = async () => {
    const question = userQuestion.trim();
    if (!question) return;

    setErrorMessage("");
    setBoundaryResponse(null);
    setSelectedStar(null);
    const boundary = getBoundaryResponse(question);
    if (boundary.blocked) {
      setBoundaryResponse(boundary);
      setView("sky");
      return;
    }
    const reframe = getQuestionReframe(question);
    setQuestionMirror(reframe);
    setPsychologyNote(reframe.psychologyNote);
    setRefinedQuestion(question);
    setView("reframe");
  };

  const choosePromptCard = (question: string) => {
    setUserQuestion(question);
    const reframe = getQuestionReframe(question);
    setErrorMessage("");
    setBoundaryResponse(null);
    setSelectedStar(null);
    setQuestionMirror(reframe);
    setPsychologyNote(reframe.psychologyNote);
    setRefinedQuestion(question);
    setView("reframe");
  };

  const handleConfirmedReading = async (overrideQuestion?: string) => {
    const question = ((overrideQuestion ?? refinedQuestion) || userQuestion).trim();
    if (!question) return;

    setUserQuestion(question);
    setErrorMessage("");
    setBoundaryResponse(null);
    setSelectedStar(null);
    const boundary = getBoundaryResponse(question);
    if (boundary.blocked) {
      setBoundaryResponse(boundary);
      setView("sky");
      return;
    }
    setLoadingStep(0);
    setView("loading");

    try {
      const res = await fetch("/api/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, userId: activeUserId, remember: memoryEnabled }),
      });

      const data = await res.json();
      if (data.blocked) {
        setBoundaryResponse({
          blocked: true,
          title: data.title || "This question needs a different kind of answer",
          message: data.message || "Arcana cannot draw cards for this question.",
        });
        setView("sky");
        return;
      }
      if (!res.ok || data.error) {
        throw new Error(data.error || "The reading could not be completed.");
      }

      setReading(data);
      setRevealedCards(new Array(data.cards_drawn.length).fill(false));
      setFollowUpMessages([]);
      addMemoryStar(data, question);
      setView("reading");
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "The reading could not be completed.",
      );
      setView("sky");
    }
  };

  const acceptTodayOracle = () => {
    if (!todayOracle) return;
    setOracleOpen(true);
    window.sessionStorage.setItem("arcana-oracle-dismissed", "true");
  };

  const dismissTodayOracle = () => {
    setTodayOracle(null);
    setOracleOpen(false);
    window.sessionStorage.setItem("arcana-oracle-dismissed", "true");
  };

  const revealCard = (index: number) => {
    setRevealedCards((prev) =>
      prev.map((value, current) => (current === index ? true : value)),
    );
  };

  const openMemoryStar = (star: MemoryStar) => {
    setMemorySaveStatus("");
    setFullSkyOpen(false);
    setSelectedStar(star);
  };

  const syncStarMemory = async (star: MemoryStar) => {
    if (!memoryEnabled) return;

    setMemorySaveStatus("saving");
    try {
      const res = await fetch("/api/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: activeUserId,
          sessionId: star.id,
          note: star.note ?? "",
          isResolved: !star.unresolved,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "Memory could not be saved.");
      }
      setMemorySaveStatus(data.updated ? "saved" : "local");
    } catch {
      setMemorySaveStatus("error");
    }
  };

  const toggleResolved = (star: MemoryStar) => {
    const next = { ...star, unresolved: !star.unresolved };
    const updated = memoryStars.map((item) => (item.id === star.id ? next : item));
    persistMemoryStars(updated);
    setSelectedStar(next);
    void syncStarMemory(next);
  };

  const toggleFavorite = (star: MemoryStar) => {
    const next = { ...star, favorite: !star.favorite };
    const updated = memoryStars.map((item) => (item.id === star.id ? next : item));
    persistMemoryStars(updated);
    setSelectedStar(next);
  };

  const updateNote = (star: MemoryStar, note: string) => {
    const next = { ...star, note };
    const updated = memoryStars.map((item) => (item.id === star.id ? next : item));
    persistMemoryStars(updated);
    setSelectedStar(next);
    setMemorySaveStatus("");
  };

  const saveSelectedStarNote = () => {
    if (!selectedStar) return;
    void syncStarMemory(selectedStar);
  };

  const recordMemoryCheckIn = (star: MemoryStar, response: string) => {
    const trimmed = response.trim();
    if (!trimmed) return;

    const date = getMemoryDateLabel();
    const status = selectedCheckIn || "Update";
    const followUp = {
      date,
      status,
      note: trimmed,
    };
    const previousNote = star.note?.trim();
    const datedNote = `[${date}] ${status}: ${trimmed}`;
    const next = {
      ...star,
      unresolved: false,
      note: previousNote ? `${previousNote}\n\n${datedNote}` : datedNote,
      lastCheckIn: trimmed,
      lastCheckInAt: date,
      followUps: [...(star.followUps ?? []), followUp],
    };
    const updated = memoryStars.map((item) => (item.id === star.id ? next : item));
    persistMemoryStars(updated);
    if (selectedStar?.id === star.id) setSelectedStar(next);
    setMemoryCheckIn("");
    setSelectedCheckIn("");
    setDismissedCheckInId(star.id);
    setCheckInNotice("Your follow-up has been saved to memory.");
    void syncStarMemory(next);
  };

  const unlockDemoPro = () => {
    if (!account) return;
    persistAccount({ ...account, plan: "pro", followUpsUsed: 0 });
  };

  const upgradeToMemory = () => {
    if (!account) {
      setErrorMessage("Sign in to turn memory on.");
      setView("sky");
      return;
    }
    persistAccount({ ...account, plan: "pro", followUpsUsed: 0 });
  };

  const sendFollowUp = async () => {
    const content = followUpInput.trim();
    if (!content || !account || !reading || followUpSending) return;

    if (account.plan !== "pro") return;
    if (followUpMessages.filter((message) => message.role === "user").length >= 5) return;

    const boundary = getBoundaryResponse(content);
    if (boundary.blocked) {
      setFollowUpInput("");
      setFollowUpMessages((messages) => [
        ...messages,
        { role: "user", content },
        { role: "reader", content: `${boundary.title}. ${boundary.message}` },
      ]);
      return;
    }

    setFollowUpInput("");
    setFollowUpMessages((messages) => [
      ...messages,
      { role: "user", content },
    ]);
    setFollowUpSending(true);

    try {
      const res = await fetch("/api/followup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: content,
          reading: {
            ...reading,
            question: userQuestion,
          },
          userId: activeUserId,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "The follow-up could not be completed.");
      }

      const nextAccount = {
        ...account,
        followUpsUsed: account.followUpsUsed + 1,
      };
      persistAccount(nextAccount);
      setFollowUpMessages((messages) => [
        ...messages,
        { role: "reader", content: data.reply },
      ]);
    } catch (err) {
      setFollowUpMessages((messages) => [
        ...messages,
        {
          role: "reader",
          content:
            err instanceof Error
              ? `I could not complete that follow-up: ${err.message}`
              : "I could not complete that follow-up.",
        },
      ]);
    } finally {
      setFollowUpSending(false);
    }
  };

  const chooseReframeOption = (option: string) => {
    const base = userQuestion.trim();
    const nextQuestion = `${base} Focus this reading on: ${option}.`;
    setRefinedQuestion(nextQuestion);
    void handleConfirmedReading(nextQuestion);
  };

  const deleteMemoryStar = (star: MemoryStar) => {
    const updated = memoryStars.filter((item) => item.id !== star.id);
    persistMemoryStars(updated);
    setSelectedStar(null);
  };

  const submitReturnCheckIn = () => {
    if (!returnPromptStar) return;
    const response = memoryCheckIn.trim() || selectedCheckIn;
    recordMemoryCheckIn(returnPromptStar, response);
  };

  const resetToSky = () => {
    setView("sky");
    setFullSkyOpen(false);
    setUserQuestion("");
    setReading(null);
    setRevealedCards([]);
    setErrorMessage("");
    setBoundaryResponse(null);
  };

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-black text-white">
      <div className="pointer-events-none absolute inset-0">
        {ambientStars.map((star) => (
          <motion.div
            animate={{ opacity: [0.12, 0.78, 0.12] }}
            className="absolute rounded-full bg-white"
            key={star.id}
            style={{
              left: star.left,
              top: star.top,
              width: star.size,
              height: star.size,
            }}
            transition={{
              delay: star.delay,
              duration: 3 + star.delay,
              repeat: Infinity,
            }}
          />
        ))}
      </div>

      <div className={`pointer-events-none absolute inset-0 ${getWeatherClass(currentWeather)}`} />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,transparent_46%,rgba(0,0,0,0.72)_100%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-gradient-to-b from-white/[0.03] to-transparent" />
      {currentWeather === "swords" && (
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_10%,rgba(15,23,42,0.62),transparent_44%)]" />
      )}

      <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-40">
        {memoryStars.slice(0, 12).map((star, index) => {
          const next = memoryStars[index + 1];
          if (!next) return null;
          return (
            <line
              key={`${star.id}-${next.id}`}
              stroke={star.color}
              strokeDasharray="3 10"
              strokeWidth="0.8"
              x1={star.left}
              x2={next.left}
              y1={star.top}
              y2={next.top}
            />
          );
        })}
      </svg>

      <section className="relative z-10 flex min-h-screen flex-col px-5 py-6 sm:px-8">
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <button
              className="font-serif text-2xl tracking-[0.28em] text-gray-100"
              onClick={resetToSky}
            >
              ARCANA
            </button>
            {view === "sky" && (
              <button
                className="rounded-full border border-violet-200/25 bg-violet-950/20 px-4 py-2 text-xs uppercase tracking-[0.22em] text-violet-100 shadow-[0_0_30px_rgba(179,136,255,0.1)] transition hover:border-violet-100/50 hover:bg-violet-300/10"
                onClick={() => {
                  setSelectedStar(null);
                  setFullSkyOpen((open) => !open);
                }}
                type="button"
              >
                {fullSkyOpen ? "close sky" : "view full sky"}
              </button>
            )}
          </div>
          <div className="relative flex items-center gap-3 text-xs uppercase tracking-widest text-gray-500">
            {account ? (
              <div className="relative">
                <button
                  className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/35 px-3 py-2 text-gray-300 transition hover:border-violet-200/30 hover:bg-white/5"
                  onClick={() => setAccountMenuOpen((open) => !open)}
                  type="button"
                >
                  <User className="h-4 w-4" />
                  <span className="hidden max-w-28 truncate sm:inline">{account.name}</span>
                  <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-violet-100/80">
                    {account.plan === "pro" ? "Pro" : "Free"}
                  </span>
                </button>
                <AnimatePresence>
                  {accountMenuOpen && (
                    <motion.div
                      animate={{ opacity: 1, y: 0 }}
                      className="absolute right-0 top-12 z-30 w-72 rounded-3xl border border-white/10 bg-black/88 p-5 text-left normal-case tracking-normal shadow-[0_0_70px_rgba(179,136,255,0.14)] backdrop-blur-md"
                      exit={{ opacity: 0, y: -8 }}
                      initial={{ opacity: 0, y: -8 }}
                    >
                      <p className="text-[10px] uppercase tracking-[0.28em] text-gray-500">
                        account
                      </p>
                      <h3 className="mt-3 truncate font-serif text-xl text-gray-100">
                        {account.name}
                      </h3>
                      <p className="mt-1 truncate text-sm text-gray-500">
                        {account.email}
                      </p>
                      <div className="mt-5 flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                        <span className="text-xs uppercase tracking-[0.22em] text-gray-500">
                          plan
                        </span>
                        <button
                          className="rounded-full border border-violet-200/20 px-3 py-1 text-xs uppercase tracking-[0.18em] text-violet-100 transition hover:bg-violet-100 hover:text-black"
                          onClick={() =>
                            persistAccount({
                              ...account,
                              plan: account.plan === "pro" ? "free" : "pro",
                            })
                          }
                          type="button"
                        >
                          {account.plan === "pro" ? "Pro" : "Free"}
                        </button>
                      </div>
                      <p className="mt-3 text-xs leading-5 text-gray-500">
                        {account.plan === "pro"
                          ? "Memory is on. Arcana can use your past readings when it answers."
                          : "Free readings are unlimited, but Arcana starts fresh every time."}
                      </p>
                      <button
                        className="mt-4 flex w-full items-center justify-center gap-2 rounded-full border border-rose-200/20 px-4 py-3 text-xs uppercase tracking-[0.22em] text-rose-100/80 transition hover:bg-rose-200/10"
                        onClick={handleLogout}
                        type="button"
                      >
                        <LogOut className="h-4 w-4" />
                        logout
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ) : (
              <button
                className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-2 text-gray-300"
                onClick={() => setErrorMessage("Sign in to save your sky.")}
                type="button"
              >
                <User className="h-4 w-4" />
                Sign in
              </button>
            )}
            <span>{memoryEnabled ? `${memoryStars.length} memory stars` : "memory off"}</span>
          </div>
        </header>

        {!account && !fullSkyOpen && (
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            className="absolute left-1/2 top-24 z-20 w-[min(92vw,420px)] -translate-x-1/2 rounded-[28px] border border-white/10 bg-black/80 p-6 shadow-[0_0_80px_rgba(179,136,255,0.14)] backdrop-blur-md"
            initial={{ opacity: 0, y: -12 }}
          >
            <div className="mb-5 flex items-center gap-3">
              <div className="rounded-full border border-violet-200/20 p-3">
                <Lock className="h-5 w-5 text-violet-100" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.26em] text-gray-500">
                  account demo
                </p>
                <h2 className="font-serif text-xl text-gray-100">
                  Sign in for the memory layer
                </h2>
              </div>
            </div>
            <input
              className="mb-3 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-gray-100 outline-none focus:border-violet-200/40"
              onChange={(event) => setLoginEmail(event.target.value)}
              placeholder="email"
              value={loginEmail}
            />
            <input
              className="mb-4 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-gray-100 outline-none focus:border-violet-200/40"
              onChange={(event) => setLoginName(event.target.value)}
              placeholder="display name"
              value={loginName}
            />
            <button
              className="w-full rounded-full bg-gray-100 px-4 py-3 text-xs uppercase tracking-[0.24em] text-black disabled:opacity-40"
              disabled={!loginEmail.trim()}
              onClick={handleLogin}
              type="button"
            >
              enter demo account
            </button>
            <p className="mt-3 text-center text-xs leading-5 text-gray-500">
              Free readings stay unlimited. Pro turns your readings into a remembered sky.
            </p>
          </motion.div>
        )}

        <div className="relative flex flex-1 items-center justify-center">
          <AnimatePresence>
            {memoryStars.map((star) => (
              <motion.button
                animate={{
                  opacity: star.unresolved ? [0.55, 1, 0.55] : 0.82,
                  scale: star.unresolved ? [1, 1.28, 1] : 1,
                }}
                className="absolute rounded-full"
                key={star.id}
                onClick={() => openMemoryStar(star)}
                style={{
                  left: star.left,
                  top: star.top,
                  backgroundColor: star.color,
                  boxShadow: `0 0 18px ${star.color}`,
                  height: star.unresolved ? 12 : 9,
                  width: star.unresolved ? 12 : 9,
                }}
                transition={{ duration: 2.6, repeat: Infinity }}
              />
            ))}
          </AnimatePresence>

          {view === "sky" && (
            <motion.div
              animate={{ opacity: 1, y: 0 }}
              className={`w-full max-w-3xl text-center transition duration-500 ${
                fullSkyOpen ? "pointer-events-none scale-95 opacity-0 blur-md" : ""
              }`}
              initial={{ opacity: 0, y: 18 }}
            >
              <div className="mx-auto mb-8 flex h-28 w-20 items-center justify-center rounded-xl border border-violet-200/30 bg-violet-950/40 shadow-[0_0_45px_rgba(179,136,255,0.28)]">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 16, repeat: Infinity, ease: "linear" }}
                >
                  <WandSparkles className="h-9 w-9 text-violet-100/70" />
                </motion.div>
              </div>
              <h1 className="font-serif text-4xl tracking-[0.22em] text-gray-100 sm:text-6xl">
                ARCANA
              </h1>
              <p className="mx-auto mt-5 max-w-xl text-sm leading-6 text-gray-400">
                Every reading becomes a star. Return later, and the sky remembers
                what kept glowing.
              </p>
              {checkInNotice && (
                <motion.div
                  animate={{ opacity: 1, y: 0 }}
                  className="mx-auto mt-6 max-w-xl rounded-full border border-emerald-200/20 bg-emerald-950/20 px-5 py-3 text-sm text-emerald-100/80"
                  initial={{ opacity: 0, y: 8 }}
                >
                  {checkInNotice}
                </motion.div>
              )}
              {returnPromptStar && (
                <motion.div
                  animate={{ opacity: 1, y: 0 }}
                  className="mx-auto mt-8 max-w-2xl rounded-[28px] border border-violet-200/20 bg-black/45 p-5 text-left shadow-[0_0_70px_rgba(179,136,255,0.12)] backdrop-blur-md"
                  initial={{ opacity: 0, y: 12 }}
                >
                  <p className="text-xs uppercase tracking-[0.28em] text-violet-200/70">
                    memory check-in
                  </p>
                  <h2 className="mt-3 font-serif text-2xl leading-tight text-gray-100">
                    Last time, you asked about &ldquo;{returnPromptStar.question}&rdquo;.
                  </h2>
                  <p className="mt-3 text-sm leading-7 text-gray-400">
                    Did anything shift since then? Your reply will be attached to that star, and the star will stop blinking.
                  </p>
                  <div className="mt-5 grid gap-3 sm:grid-cols-3">
                    {["It changed", "Still unresolved", "I moved on"].map((option) => (
                      <button
                        className={`rounded-full border px-4 py-3 text-xs uppercase tracking-[0.18em] transition ${
                          selectedCheckIn === option
                            ? "border-violet-100 bg-violet-100 text-black"
                            : "border-white/10 text-gray-300 hover:border-violet-200/30 hover:bg-violet-300/10"
                        }`}
                        key={option}
                        onClick={() => {
                          setSelectedCheckIn(option);
                          setCheckInNotice("");
                        }}
                        type="button"
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                  <div className="mt-4 flex gap-2">
                    <input
                      className="min-w-0 flex-1 rounded-full border border-white/10 bg-black/45 px-4 py-3 text-sm text-gray-100 outline-none placeholder:text-gray-600 focus:border-violet-200/40"
                      onChange={(event) => {
                        setMemoryCheckIn(event.target.value);
                        setCheckInNotice("");
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          submitReturnCheckIn();
                        }
                      }}
                      placeholder="Or write a quick update..."
                      value={memoryCheckIn}
                    />
                    <button
                      className="rounded-full bg-gray-100 px-5 py-3 text-xs uppercase tracking-[0.2em] text-black disabled:opacity-30"
                      disabled={!memoryCheckIn.trim() && !selectedCheckIn}
                      onClick={submitReturnCheckIn}
                      type="button"
                    >
                      save
                    </button>
                  </div>
                  <button
                    className="mt-4 text-xs uppercase tracking-[0.24em] text-violet-100/70 transition hover:text-violet-100"
                    onClick={() => {
                      setUserQuestion("What should I notice today?");
                      setView("sky");
                    }}
                    type="button"
                  >
                    skip check-in and draw today&rsquo;s cards
                  </button>
                </motion.div>
              )}
              <div className="mx-auto mt-8 grid max-w-4xl gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {PROMPT_CARDS.map((card) => (
                  <button
                    className="rounded-3xl border border-white/10 bg-white/[0.04] p-4 text-left transition hover:border-violet-200/30 hover:bg-violet-300/10"
                    key={card.label}
                    onClick={() => choosePromptCard(card.question)}
                    type="button"
                  >
                    <p className="text-[10px] uppercase tracking-[0.26em] text-violet-200/60">
                      {card.tone}
                    </p>
                    <h3 className="mt-3 font-serif text-lg leading-6 text-gray-100">
                      {card.label}
                    </h3>
                    <p className="mt-3 text-xs leading-5 text-gray-500">
                      {card.question}
                    </p>
                  </button>
                ))}
              </div>
              <div className="mx-auto mt-8 flex max-w-2xl items-end gap-3 border-b border-gray-700/80 pb-3">
                <textarea
                  className="h-20 flex-1 resize-none bg-transparent text-base leading-relaxed text-gray-100 outline-none placeholder:text-gray-600"
                  onChange={(event) => setUserQuestion(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      handleStartReading();
                    }
                  }}
                  placeholder="Whisper a question into the sky..."
                  value={userQuestion}
                />
                <button
                  className="mb-1 rounded-full bg-gray-100 p-3 text-black transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-30"
                  disabled={!userQuestion.trim()}
                  onClick={handleStartReading}
                >
                  <ArrowRight className="h-5 w-5" />
                </button>
              </div>
              {errorMessage && (
                <p className="mt-4 text-sm text-rose-300">{errorMessage}</p>
              )}
              {boundaryResponse?.blocked && (
                <motion.div
                  animate={{ opacity: 1, y: 0 }}
                  className="mx-auto mt-6 max-w-2xl rounded-3xl border border-rose-200/20 bg-rose-950/15 p-5 text-left shadow-[0_0_60px_rgba(244,63,94,0.08)] backdrop-blur-md"
                  initial={{ opacity: 0, y: 12 }}
                >
                  <div className="mb-3 flex items-center gap-3">
                    <div className="rounded-full border border-rose-200/20 p-2">
                      <ShieldAlert className="h-4 w-4 text-rose-100/80" />
                    </div>
                    <p className="text-xs uppercase tracking-[0.24em] text-rose-100/60">
                      no cards drawn
                    </p>
                  </div>
                  <h3 className="font-serif text-xl text-gray-100">
                    {boundaryResponse.title}
                  </h3>
                  <p className="mt-3 text-sm leading-7 text-gray-300">
                    {boundaryResponse.message}
                  </p>
                </motion.div>
              )}
              {memoryStars.length === 0 && (
                <p className="mt-6 text-xs uppercase tracking-widest text-gray-600">
                  {memoryEnabled
                    ? "Your sky is empty. The first Pro reading will become its first star."
                    : "Free readings are unlimited. Memory is unlocked with Pro."}
                </p>
              )}
              {todayOracle && !oracleOpen && (
                <motion.div
                  animate={{ opacity: 1, y: 0 }}
                  className="mx-auto mt-8 flex max-w-lg items-center gap-4 border border-violet-200/20 bg-violet-950/20 p-4 text-left"
                  initial={{ opacity: 0, y: 12 }}
                >
                  <img
                    alt={todayOracle.card}
                    className="h-24 w-16 rounded object-cover"
                    src={todayOracle.image}
                  />
                  <div className="flex-1">
                    <p className="text-xs uppercase tracking-widest text-violet-200/70">
                      today&rsquo;s oracle
                    </p>
                    <p className="mt-2 text-sm text-gray-200">
                      {todayOracle.card} wants to speak first.
                    </p>
                    <div className="mt-3 flex gap-2">
                      <button
                        className="border border-violet-200/40 px-3 py-2 text-xs uppercase tracking-widest text-violet-100"
                        onClick={acceptTodayOracle}
                      >
                        listen
                      </button>
                      <button
                        className="px-3 py-2 text-xs uppercase tracking-widest text-gray-500"
                        onClick={dismissTodayOracle}
                      >
                        not today
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
              {todayOracle && oracleOpen && oracleReading && (
                <motion.div
                  animate={{ opacity: 1, y: 0 }}
                  className="relative mx-auto mt-8 max-w-3xl overflow-hidden rounded-[32px] border border-violet-200/20 bg-[linear-gradient(135deg,rgba(31,18,56,0.82),rgba(0,0,0,0.72))] p-6 text-left shadow-[0_0_90px_rgba(179,136,255,0.16)] backdrop-blur-md"
                  initial={{ opacity: 0, y: 18 }}
                >
                  <div className="pointer-events-none absolute inset-0 opacity-50">
                    {[0, 1, 2, 3, 4].map((bar) => (
                      <motion.span
                        animate={{ scaleY: [0.35, 1, 0.45] }}
                        className="absolute bottom-0 w-px origin-bottom bg-violet-100/25"
                        key={bar}
                        style={{ height: `${36 + bar * 14}%`, left: `${16 + bar * 16}%` }}
                        transition={{
                          delay: bar * 0.14,
                          duration: 1.8,
                          repeat: Infinity,
                          repeatType: "mirror",
                        }}
                      />
                    ))}
                  </div>
                  <div className="relative grid gap-6 md:grid-cols-[150px_1fr]">
                    <div>
                      <img
                        alt={todayOracle.card}
                        className="h-56 w-36 rounded-2xl border border-white/20 object-cover shadow-[0_0_45px_rgba(179,136,255,0.18)]"
                        src={todayOracle.image}
                      />
                      <button
                        className="mt-4 w-36 rounded-full border border-white/10 px-3 py-2 text-xs uppercase tracking-[0.2em] text-gray-400 transition hover:text-gray-100"
                        onClick={dismissTodayOracle}
                        type="button"
                      >
                        close
                      </button>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.34em] text-violet-200/70">
                        today&rsquo;s oracle
                      </p>
                      <h2 className="mt-3 font-serif text-3xl leading-tight text-gray-100">
                        {todayOracle.card}
                      </h2>
                      <p className="mt-3 font-serif text-xl leading-8 text-violet-100">
                        {oracleReading.title}
                      </p>
                      <div className="mt-6 space-y-4">
                        {oracleReading.lines.map((line, index) => (
                          <motion.p
                            animate={{ opacity: 1, y: 0 }}
                            className="text-sm leading-7 text-gray-300"
                            initial={{ opacity: 0, y: 10 }}
                            key={line}
                            transition={{ delay: 0.25 + index * 0.35 }}
                          >
                            {line}
                          </motion.p>
                        ))}
                      </div>
                      <motion.div
                        animate={{ opacity: 1, y: 0 }}
                        className="mt-6 rounded-2xl border border-white/10 bg-black/25 p-4"
                        initial={{ opacity: 0, y: 10 }}
                        transition={{ delay: 1.35 }}
                      >
                        <p className="text-xs uppercase tracking-[0.28em] text-gray-500">
                          practice
                        </p>
                        <p className="mt-2 text-sm leading-7 text-gray-200">
                          {oracleReading.practice}
                        </p>
                      </motion.div>
                    </div>
                  </div>
                </motion.div>
              )}
            </motion.div>
          )}

          {view === "loading" && (
            <motion.div
              animate={{ opacity: 1, scale: 1 }}
              className="flex w-full max-w-3xl flex-col items-center text-center"
              initial={{ opacity: 0, scale: 0.96 }}
            >
              <div className="relative h-72 w-full max-w-xl">
                <div className="absolute left-1/2 top-12 h-48 w-32 -translate-x-1/2">
                  {SHUFFLE_BACKS.map((card) => (
                    <motion.div
                      animate={{
                        rotate:
                          loadingStep === 0
                            ? card * 1.8 - 12
                            : loadingStep === 1
                              ? [card % 2 === 0 ? -18 : 18, card % 2 === 0 ? 14 : -14, card * 0.4 - 3]
                              : loadingStep === 2
                                ? card * 0.2
                                : card * 0.5 - 3,
                        x:
                          loadingStep === 0
                            ? card % 2 === 0
                              ? -70
                              : 70
                            : loadingStep === 1
                              ? [card % 2 === 0 ? -88 : 88, 0, card * 0.8 - 5]
                              : loadingStep === 2
                                ? card % 2 === 0
                                  ? -20
                                  : 20
                                : card * 0.4 - 3,
                        y:
                          loadingStep === 3 && card > 10
                            ? 36 + (card - 10) * 8
                            : loadingStep === 2
                              ? [0, -18, 0]
                              : card * 0.45,
                      }}
                      className="absolute inset-0 rounded-2xl border border-violet-100/25 bg-[radial-gradient(circle_at_50%_35%,rgba(255,255,255,0.16),transparent_18%),linear-gradient(135deg,rgba(49,46,129,0.98),rgba(15,23,42,0.98))] shadow-[0_0_35px_rgba(179,136,255,0.18)]"
                      key={card}
                      transition={{
                        delay: card * 0.025,
                        duration: loadingStep === 1 ? 0.9 : 0.65,
                        ease: "easeInOut",
                      }}
                    >
                      <div className="absolute inset-3 rounded-xl border border-white/10" />
                      <Sparkles className="absolute left-1/2 top-1/2 h-7 w-7 -translate-x-1/2 -translate-y-1/2 text-violet-100/35" />
                    </motion.div>
                  ))}
                </div>
                {[0, 1, 2].map((card) => (
                  <motion.div
                    animate={{
                      opacity: loadingStep === 3 ? 1 : 0,
                      rotate: card * 7 - 7,
                      x: card * 105 - 105,
                      y: loadingStep === 3 ? 168 : 142,
                    }}
                    className="absolute left-1/2 top-0 h-32 w-20 rounded-xl border border-violet-100/35 bg-[linear-gradient(135deg,rgba(76,29,149,0.95),rgba(2,6,23,0.98))] shadow-[0_0_30px_rgba(179,136,255,0.18)]"
                    initial={{ opacity: 0 }}
                    key={`draw-${card}`}
                    transition={{ delay: card * 0.12, duration: 0.55 }}
                  />
                ))}
                <motion.div
                  animate={{ scale: [1, 1.35, 1], opacity: [0.2, 0.75, 0.2] }}
                  className="absolute left-1/2 top-10 h-52 w-52 -translate-x-1/2 rounded-full border border-violet-200/20"
                  transition={{ duration: 2, repeat: Infinity }}
                />
              </div>
              <p className="text-sm uppercase tracking-[0.26em] text-gray-400">
                {SHUFFLE_STEPS[loadingStep]}
              </p>
              <p className="mt-4 max-w-md text-sm leading-6 text-gray-500">
                The spread is not assigned until the deck is cut. No cards are shown before the draw completes.
              </p>
            </motion.div>
          )}

          {view === "reframe" && (
            <motion.div
              animate={{ opacity: 1, y: 0 }}
              className={`w-full ${questionMirror?.intensity === "light" ? "max-w-xl" : "max-w-3xl"}`}
              initial={{ opacity: 0, y: 18 }}
            >
              <div
                className={`border border-violet-200/20 bg-black/55 text-center shadow-[0_0_80px_rgba(179,136,255,0.12)] backdrop-blur-md ${
                  questionMirror?.intensity === "light"
                    ? "rounded-[24px] p-5 sm:p-6"
                    : "rounded-[32px] p-6 sm:p-9"
                }`}
              >
                <p className="text-xs uppercase tracking-[0.34em] text-violet-200/70">
                  {questionMirror?.intensity === "light" ? "quick focus" : "focus check"}
                </p>
                <h2
                  className={`mt-5 font-serif text-gray-100 ${
                    questionMirror?.intensity === "light"
                      ? "text-xl leading-8 sm:text-2xl sm:leading-9"
                      : "text-2xl leading-9 sm:text-4xl sm:leading-[3rem]"
                  }`}
                >
                  {questionMirror?.prompt}
                </h2>
                {questionMirror?.intensity === "deep" && (
                  <div className="mx-auto mt-6 max-w-2xl rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-left">
                    <p className="mb-2 text-xs uppercase tracking-[0.24em] text-gray-500">
                      psychology note
                    </p>
                    <p className="text-sm leading-7 text-gray-300">
                      {psychologyNote}
                    </p>
                  </div>
                )}
                {questionMirror?.intensity === "light" ? (
                  <>
                    <button
                      className="mt-7 w-full rounded-full bg-gray-100 px-5 py-4 text-xs uppercase tracking-[0.24em] text-black transition hover:bg-white"
                      onClick={() => handleConfirmedReading(userQuestion)}
                      type="button"
                    >
                      skip and draw directly
                    </button>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <button
                        className="rounded-full border border-violet-200/25 px-5 py-3 text-xs uppercase tracking-[0.22em] text-violet-100/80 transition hover:bg-violet-300/10"
                        onClick={() => chooseReframeOption(questionMirror?.options[0] ?? "The first focus")}
                        type="button"
                      >
                        {questionMirror?.options[0]}
                      </button>
                      <button
                        className="rounded-full border border-violet-200/25 px-5 py-3 text-xs uppercase tracking-[0.22em] text-violet-100/80 transition hover:bg-violet-300/10"
                        onClick={() => chooseReframeOption(questionMirror?.options[1] ?? "The second focus")}
                        type="button"
                      >
                        {questionMirror?.options[1]}
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="mt-7 grid gap-3 sm:grid-cols-2">
                    <button
                      className="rounded-full border border-violet-200/30 px-5 py-3 text-xs uppercase tracking-[0.22em] text-violet-100 transition hover:bg-violet-300/10"
                      onClick={() => chooseReframeOption(questionMirror?.options[0] ?? "The first focus")}
                      type="button"
                    >
                      {questionMirror?.options[0]}
                    </button>
                    <button
                      className="rounded-full border border-violet-200/30 px-5 py-3 text-xs uppercase tracking-[0.22em] text-violet-100 transition hover:bg-violet-300/10"
                      onClick={() => chooseReframeOption(questionMirror?.options[1] ?? "The second focus")}
                      type="button"
                    >
                      {questionMirror?.options[1]}
                    </button>
                  </div>
                )}
                {questionMirror?.intensity === "deep" && (
                  <div className="mt-5 rounded-2xl border border-white/10 bg-black/35 p-4 text-left">
                    <p className="mb-2 text-xs uppercase tracking-[0.24em] text-gray-500">
                      not quite right?
                    </p>
                    <textarea
                      className="h-20 w-full resize-none bg-transparent text-sm leading-6 text-gray-100 outline-none placeholder:text-gray-600"
                      onChange={(event) => setRefinedQuestion(event.target.value)}
                      placeholder="Clarify the question in your own words..."
                      value={refinedQuestion}
                    />
                    <button
                      className="mt-3 rounded-full border border-white/10 px-4 py-2 text-xs uppercase tracking-[0.22em] text-gray-300 transition hover:bg-white/5"
                      onClick={() => handleConfirmedReading(refinedQuestion)}
                      type="button"
                    >
                      draw with my wording
                    </button>
                  </div>
                )}
                {questionMirror?.intensity === "deep" && (
                  <button
                    className="mt-5 text-xs uppercase tracking-[0.24em] text-gray-500 transition hover:text-gray-300"
                    onClick={() => handleConfirmedReading(userQuestion)}
                    type="button"
                  >
                    skip and draw directly
                  </button>
                )}
              </div>
            </motion.div>
          )}

          {view === "reading" && reading && (
            <motion.div
              animate={{ opacity: 1, y: 0 }}
              className="max-h-[calc(100vh-96px)] w-full max-w-7xl overflow-y-auto px-1 py-8"
              initial={{ opacity: 0, y: 20 }}
            >
              <div className="mx-auto mb-12 max-w-3xl text-center">
                <p className="text-xs uppercase tracking-[0.38em] text-gray-500">
                  {reading.spread_name}
                </p>
                <h2 className="mx-auto mt-5 font-serif text-3xl leading-tight text-gray-100 sm:text-5xl">
                  &ldquo;{userQuestion}&rdquo;
                </h2>
                <div className="mx-auto mt-6 h-px w-28 bg-gradient-to-r from-transparent via-gray-500 to-transparent" />
              </div>

              <div className="mx-auto grid max-w-6xl gap-8 md:grid-cols-3">
                {reading.cards_drawn.map((card, index) => (
                  <div
                    className="group relative rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.025))] p-4 shadow-[0_28px_90px_rgba(0,0,0,0.45)] backdrop-blur-sm"
                    key={`${card}-${index}`}
                  >
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <p className="text-[11px] uppercase tracking-[0.24em] text-gray-500">
                        {reading.card_positions[index]}
                      </p>
                      <span className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 text-xs text-gray-500">
                        {index + 1}
                      </span>
                    </div>
                    <button
                      className="relative mx-auto block h-[24rem] w-64"
                      onClick={() => revealCard(index)}
                      type="button"
                    >
                      <AnimatePresence mode="wait">
                        {!revealedCards[index] ? (
                          <motion.div
                            animate={{ opacity: 1, scale: 1 }}
                            className="absolute inset-0 overflow-hidden rounded-[18px] border border-violet-100/30 bg-[radial-gradient(circle_at_50%_30%,rgba(255,255,255,0.18),transparent_20%),linear-gradient(135deg,#312e81,#020617_72%)] shadow-[0_0_45px_rgba(179,136,255,0.18)]"
                            exit={{ opacity: 0, scale: 0.96 }}
                            initial={{ opacity: 0, scale: 0.96 }}
                            key="back"
                          >
                          <div className="absolute inset-3 rounded-[14px] border border-white/10" />
                          <div className="absolute inset-7 rounded-full border border-violet-100/15" />
                          <Sparkles className="absolute left-1/2 top-1/2 h-12 w-12 -translate-x-1/2 -translate-y-1/2 text-violet-100/55" />
                          <p className="absolute bottom-9 left-0 right-0 text-center text-[10px] uppercase tracking-[0.28em] text-violet-100/45">
                            awaiting reveal
                          </p>
                          <motion.div
                            animate={{ scaleX: 1 }}
                            className="absolute bottom-6 left-1/2 h-1 w-36 -translate-x-1/2 origin-left rounded-full bg-violet-100"
                            initial={{ scaleX: 0 }}
                            transition={{ duration: 3, delay: index * 3 }}
                          />
                          </motion.div>
                        ) : (
                          <motion.div
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            className="absolute inset-0 rounded-[20px] border border-white/30 bg-[#f5ead3] p-2 shadow-[0_20px_60px_rgba(0,0,0,0.55)]"
                            initial={{ opacity: 0, scale: 0.96, y: 8 }}
                            key="front"
                          >
                          <div className="relative h-full overflow-hidden rounded-[14px] border border-stone-900/25 bg-stone-100">
                            <img
                              alt={card}
                              className={`h-full w-full object-cover ${isReversed(card) ? "rotate-180" : ""}`}
                              onError={(event) => {
                                event.currentTarget.onerror = null;
                                event.currentTarget.src = "/tarot/ar00.jpg";
                              }}
                              src={getTarotImage(card)}
                            />
                            <div className="absolute inset-0 flex items-end bg-gradient-to-t from-black/45 via-transparent to-transparent p-4">
                              <p className="font-serif text-lg leading-tight text-white drop-shadow">
                                {getCardBaseName(card)}
                              </p>
                            </div>
                          </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </button>
                    <div className="mx-auto mt-5 max-w-64 text-center">
                      <p className="font-serif text-xl text-gray-100">
                        {getCardBaseName(card)}
                      </p>
                      <p className="mt-1 text-xs uppercase tracking-[0.22em] text-gray-500">
                        {isReversed(card) ? "reversed" : "upright"}
                      </p>
                    </div>
                    {!revealedCards[index] && (
                      <p className="mt-4 text-center text-xs uppercase tracking-[0.22em] text-gray-600">
                        reveals in {(index + 1) * 3}s / tap to reveal now
                      </p>
                    )}
                  </div>
                ))}
              </div>

              {allRevealed && (
                <motion.div
                  animate={{ opacity: 1, y: 0 }}
                  className="mx-auto mt-16 max-w-5xl"
                  initial={{ opacity: 0, y: 20 }}
                >
                  <div className="rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.025))] p-6 shadow-[0_30px_100px_rgba(0,0,0,0.42)] backdrop-blur-md sm:p-10">
                    <div className="mb-9 text-center">
                      <p className="text-xs uppercase tracking-[0.35em] text-gray-500">
                        the reading
                      </p>
                      <h3 className="mt-4 font-serif text-3xl text-gray-100">
                        Three things the spread is asking you to notice
                      </h3>
                    </div>
                    <div className="mb-7 rounded-3xl border border-violet-200/20 bg-violet-950/20 px-5 py-5 text-center">
                      <p className="mb-2 text-xs uppercase tracking-[0.3em] text-violet-200/70">
                        Core Signal
                      </p>
                      <p className="mx-auto max-w-2xl font-serif text-xl leading-8 text-gray-100">
                        {readingTldr}
                      </p>
                    </div>
                    <p className="mx-auto mb-8 max-w-2xl text-center text-sm leading-7 text-gray-400">
                      {getWeatherMood(currentWeather)}
                    </p>
                    {!reading.memory_enabled && (
                      <div className="mx-auto mb-8 max-w-2xl rounded-3xl border border-amber-200/20 bg-amber-950/10 p-5 text-center">
                        <p className="text-xs uppercase tracking-[0.28em] text-amber-100/60">
                          memory off
                        </p>
                        <p className="mt-3 text-sm leading-7 text-gray-300">
                          This Free reading is unlimited, but it will not become a star in your sky. Pro turns memory on so Arcana can recognize your patterns over time.
                        </p>
                        <button
                          className="mt-4 rounded-full bg-amber-100 px-5 py-3 text-xs uppercase tracking-[0.22em] text-black transition hover:bg-white"
                          onClick={upgradeToMemory}
                          type="button"
                        >
                          turn memory on
                        </button>
                      </div>
                    )}
                    <div className="grid gap-4 md:grid-cols-3">
                      {readingParts.map((part, index) => (
                        <motion.article
                          animate={{ opacity: 1, y: 0 }}
                          className="rounded-2xl border border-white/8 bg-black/24 px-5 py-5 text-[15px] leading-8 text-gray-300"
                          initial={{ opacity: 0, y: 12 }}
                          key={part}
                          transition={{ delay: index * 0.12 }}
                        >
                          <p className="mb-2 text-xs uppercase tracking-[0.28em] text-gray-600">
                            {INSIGHT_ANGLES[index] ?? `Insight ${index + 1}`}
                          </p>
                          <p className="mb-4 text-xs leading-5 text-gray-500">
                            {INSIGHT_GUIDES[index] ?? "A focused angle from the spread."}
                          </p>
                          <p>{renderInlineMarkdown(part)}</p>
                        </motion.article>
                      ))}
                    </div>
                    {repeatedCard && (
                      <div className="mt-8 rounded-3xl border border-violet-300/20 bg-violet-950/20 p-6 backdrop-blur-md">
                        <div className="mb-4 flex items-center gap-2 text-xs uppercase tracking-[0.28em] text-violet-200/70">
                          <Link2 className="h-4 w-4" />
                          time-line echo
                        </div>
                        <p className="text-sm leading-7 text-gray-300">
                          {getCardBaseName(repeatedCard)} has appeared before in your sky. Arcana reads this as a recurring question, not a repeated answer.
                        </p>
                      </div>
                    )}
                    <details className="mt-8 rounded-3xl border border-white/10 bg-black/30 p-6 backdrop-blur-md">
                      <summary className="cursor-pointer list-none">
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <p className="text-xs uppercase tracking-[0.28em] text-gray-500">
                              after the reading
                            </p>
                            <h4 className="mt-2 font-serif text-xl text-gray-100">
                              Open two grounded practices
                            </h4>
                          </div>
                          <Flame className="h-5 w-5 text-gray-400" />
                        </div>
                      </summary>
                      <div className="mt-5 grid gap-3 md:grid-cols-2">
                        {actionItems.map((item, index) => (
                          <div
                            className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"
                            key={`${item.title}-${index}`}
                          >
                            <p className="mb-2 text-xs uppercase tracking-[0.22em] text-gray-500">
                              practice {index + 1}
                            </p>
                            <h4 className="font-serif text-lg text-gray-100">
                              {item.title}
                            </h4>
                            <p className="mt-2 text-sm leading-6 text-gray-300">
                              {item.body}
                            </p>
                          </div>
                        ))}
                      </div>
                    </details>
                    <details className="mt-8 rounded-3xl border border-violet-200/20 bg-violet-950/15 p-6 backdrop-blur-md">
                      <summary className="cursor-pointer list-none">
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <p className="text-xs uppercase tracking-[0.28em] text-violet-200/70">
                              pro follow-up
                            </p>
                            <h4 className="mt-2 font-serif text-xl text-gray-100">
                              Want to go one layer deeper?
                            </h4>
                          </div>
                          <MessageCircle className="h-5 w-5 text-violet-100/70" />
                        </div>
                      </summary>
                      <div className="mt-5">
                      <div className="mb-4 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.28em] text-violet-200/70">
                          <MessageCircle className="h-4 w-4" />
                          pro follow-up
                        </div>
                        <span className="rounded-full border border-white/10 px-2 py-1 text-[10px] uppercase tracking-widest text-gray-500">
                          {followUpMessages.filter((message) => message.role === "user").length}/5
                        </span>
                      </div>
                      {account?.plan !== "pro" ? (
                        <div>
                          <p className="text-sm leading-7 text-gray-300">
                            Continue with the same AI tarot reader for up to 5 focused follow-up questions. Locked for Free accounts in this demo.
                          </p>
                          <button
                            className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-violet-100 px-4 py-3 text-xs uppercase tracking-[0.22em] text-black"
                            onClick={unlockDemoPro}
                            type="button"
                          >
                            <CreditCard className="h-4 w-4" />
                            unlock demo pro
                          </button>
                        </div>
                      ) : (
                        <div>
                          <div className="mb-4 max-h-56 space-y-3 overflow-y-auto rounded-2xl border border-white/10 bg-black/30 p-3">
                            {followUpMessages.length === 0 ? (
                              <p className="p-3 text-sm leading-6 text-gray-500">
                                Ask about a card, a contradiction, or the next practical step.
                              </p>
                            ) : (
                              followUpMessages.map((message, index) => (
                                <div
                                  className={`rounded-2xl px-4 py-3 text-sm leading-6 ${
                                    message.role === "user"
                                      ? "ml-6 bg-white/10 text-gray-100"
                                      : "mr-6 bg-violet-950/35 text-gray-300"
                                  }`}
                                  key={`${message.role}-${index}`}
                                >
                                  {message.content}
                                </div>
                              ))
                            )}
                            {followUpSending && (
                              <div className="mr-6 rounded-2xl bg-violet-950/20 px-4 py-3 text-sm leading-6 text-gray-500">
                                Arcana is reading the thread...
                              </div>
                            )}
                          </div>
                          <div className="flex gap-2">
                            <input
                              className="min-w-0 flex-1 rounded-full border border-white/10 bg-black/45 px-4 py-3 text-sm text-gray-100 outline-none focus:border-violet-200/40"
                              disabled={followUpSending || followUpMessages.filter((message) => message.role === "user").length >= 5}
                              onChange={(event) => setFollowUpInput(event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  event.preventDefault();
                                  void sendFollowUp();
                                }
                              }}
                              placeholder="Ask a follow-up..."
                              value={followUpInput}
                            />
                            <button
                              className="rounded-full bg-gray-100 p-3 text-black disabled:opacity-30"
                              disabled={
                                !followUpInput.trim() ||
                                followUpSending ||
                                followUpMessages.filter((message) => message.role === "user").length >= 5
                              }
                              onClick={() => void sendFollowUp()}
                              type="button"
                            >
                              <Send className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      )}
                      </div>
                    </details>
                    <button
                      className="mx-auto mt-8 block rounded-full border border-gray-700 px-8 py-4 text-xs uppercase tracking-[0.28em] text-gray-300 transition hover:border-gray-300 hover:bg-white/5"
                      onClick={resetToSky}
                    >
                      return to sky
                    </button>
                  </div>
                </motion.div>
              )}
            </motion.div>
          )}

          {view === "sky" && fullSkyOpen && (
            <motion.div
              animate={{ opacity: 1, y: 0 }}
              className="pointer-events-none absolute inset-0 flex items-end justify-center px-4 pb-8"
              initial={{ opacity: 0, y: 16 }}
            >
              <div className="pointer-events-auto w-full max-w-5xl rounded-[28px] border border-white/10 bg-black/35 p-5 shadow-[0_0_70px_rgba(179,136,255,0.1)] backdrop-blur-sm">
                {memoryStars.length === 0 ? (
                  <div className="text-center">
                    <p className="text-xs uppercase tracking-[0.3em] text-gray-500">
                      empty sky
                    </p>
                    <h2 className="mt-3 font-serif text-2xl text-gray-100">
                      {memoryEnabled ? "No memory stars yet" : "Memory is off"}
                    </h2>
                    <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-gray-400">
                      {memoryEnabled
                        ? "Your next Pro reading will become the first star in this sky."
                        : "Free readings stay unlimited, but they do not remain here. Turn on Pro memory to let the sky remember you."}
                    </p>
                    {!memoryEnabled && (
                      <button
                        className="mt-5 rounded-full bg-violet-100 px-5 py-3 text-xs uppercase tracking-[0.22em] text-black transition hover:bg-white"
                        onClick={upgradeToMemory}
                        type="button"
                      >
                        turn memory on
                      </button>
                    )}
                  </div>
                ) : (
                  <div>
                    <div className="mb-4 flex items-center justify-between gap-4">
                      <div>
                        <p className="text-xs uppercase tracking-[0.3em] text-gray-500">
                          memory sky
                        </p>
                        <h2 className="mt-2 font-serif text-2xl text-gray-100">
                          {memoryStars.length} remembered {memoryStars.length === 1 ? "reading" : "readings"}
                        </h2>
                      </div>
                      <p className="max-w-xs text-right text-xs leading-5 text-gray-500">
                        Click any star to update what happened. Saved updates shape future readings.
                      </p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                      {STAR_LEGEND.map((item) => (
                        <div
                          className="rounded-2xl border border-white/10 bg-white/[0.03] p-3"
                          key={item.label}
                        >
                          <div className="mb-2 flex items-center gap-2">
                            <span
                              className="h-3 w-3 rounded-full"
                              style={{
                                backgroundColor: item.color,
                                boxShadow: `0 0 14px ${item.color}`,
                              }}
                            />
                            <p className="text-[10px] uppercase tracking-[0.2em] text-gray-300">
                              {item.label}
                            </p>
                          </div>
                          <p className="text-xs leading-5 text-gray-500">
                            {item.note}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </div>
      </section>

      <AnimatePresence>
        {selectedStar && (
          <motion.div
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-20 overflow-y-auto bg-black/55 px-4 py-8 backdrop-blur-sm sm:px-6"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            onClick={() => setSelectedStar(null)}
          >
            <motion.article
              animate={{ opacity: 1, y: 0 }}
              className="mx-auto w-full max-w-2xl rounded-[28px] border border-white/10 bg-black/78 p-6 shadow-[0_0_80px_rgba(179,136,255,0.12)] backdrop-blur-md sm:p-8"
              initial={{ opacity: 0, y: 18 }}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mb-4 flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-widest text-gray-500">
                    {selectedStar.date} / {selectedStar.spread}
                  </p>
                  <h3 className="mt-2 font-serif text-xl text-gray-100">
                    {selectedStar.question}
                  </h3>
                </div>
                <button
                  className="rounded-full border border-white/10 p-3 transition hover:bg-white/5"
                  onClick={() => toggleFavorite(selectedStar)}
                  type="button"
                >
                  <Bookmark
                    className="h-5 w-5"
                    fill={selectedStar.favorite ? selectedStar.color : "none"}
                    style={{ color: selectedStar.color }}
                  />
                </button>
              </div>
              <div className="mb-5 rounded-2xl border border-violet-200/20 bg-violet-950/20 p-4">
                <p className="mb-2 text-xs uppercase tracking-[0.28em] text-violet-200/70">
                  Core Signal
                </p>
                <p className="font-serif text-lg leading-7 text-gray-100">
                  {getTldr(selectedStar.summary)}
                </p>
              </div>
              <div className="mb-5 flex flex-wrap gap-2">
                {selectedStar.cards.map((card) => (
                  <span
                    className="border border-gray-700 px-2 py-1 text-xs text-gray-300"
                    key={card}
                  >
                    {card}
                  </span>
                ))}
              </div>
              <div className="max-h-64 overflow-y-auto rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm">
                <MarkdownText text={selectedStar.summary} />
              </div>
              {(selectedStar.lastCheckInAt || selectedStar.followUps?.length) && (
                <div className="mt-5 rounded-2xl border border-emerald-200/15 bg-emerald-950/10 p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <p className="text-xs uppercase tracking-[0.24em] text-emerald-100/60">
                      follow-up history
                    </p>
                    {selectedStar.lastCheckInAt && (
                      <span className="text-xs text-gray-500">
                        last updated {selectedStar.lastCheckInAt}
                      </span>
                    )}
                  </div>
                  <div className="space-y-3">
                    {(selectedStar.followUps ?? []).map((item, index) => (
                      <div
                        className="rounded-2xl border border-white/10 bg-black/25 p-3"
                        key={`${item.date}-${index}`}
                      >
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <p className="text-xs uppercase tracking-[0.2em] text-gray-400">
                            {item.status}
                          </p>
                          <span className="text-xs text-gray-600">{item.date}</span>
                        </div>
                        <p className="text-sm leading-6 text-gray-300">{item.note}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <label className="mt-5 block">
                <span className="text-xs uppercase tracking-[0.24em] text-gray-500">
                  follow-up note
                </span>
                <p className="mt-2 text-xs leading-5 text-gray-500">
                  Save what happened after this reading. Pro memory will use it in future interpretations.
                </p>
                <textarea
                  className="mt-2 h-24 w-full resize-none rounded-2xl border border-white/10 bg-black/45 p-4 text-sm leading-6 text-gray-200 outline-none transition focus:border-violet-200/40"
                  onChange={(event) => updateNote(selectedStar, event.target.value)}
                  placeholder="What changed after this reading?"
                  value={selectedStar.note ?? ""}
                />
              </label>
              <div className="mt-3 flex items-center justify-between gap-3">
                <button
                  className="rounded-full bg-gray-100 px-5 py-3 text-xs uppercase tracking-[0.22em] text-black transition hover:bg-white"
                  onClick={saveSelectedStarNote}
                  type="button"
                >
                  save to memory
                </button>
                {memorySaveStatus && (
                  <span className="text-xs uppercase tracking-[0.2em] text-gray-500">
                    {memorySaveStatus}
                  </span>
                )}
              </div>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <button
                  className="flex items-center justify-center gap-2 rounded-full border border-gray-600 px-4 py-3 text-xs uppercase tracking-widest text-gray-300 transition hover:bg-white/5"
                  onClick={() => toggleResolved(selectedStar)}
                  type="button"
                >
                  {selectedStar.unresolved ? (
                    <Clock3 className="h-4 w-4" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  {selectedStar.unresolved ? "mark followed up" : "reopen thread"}
                </button>
                <button
                  className="rounded-full border border-gray-700 px-4 py-3 text-xs uppercase tracking-widest text-gray-500 transition hover:text-gray-300"
                  onClick={() => setSelectedStar(null)}
                  type="button"
                >
                  close
                </button>
                <button
                  className="rounded-full border border-violet-200/30 px-4 py-3 text-xs uppercase tracking-widest text-violet-100 transition hover:bg-violet-300/10 sm:col-span-2"
                  onClick={() => {
                    setSelectedStar(null);
                    setFullSkyOpen(true);
                  }}
                  type="button"
                >
                  show full sky
                </button>
                <button
                  className="flex items-center justify-center gap-2 rounded-full border border-rose-400/30 px-4 py-3 text-xs uppercase tracking-widest text-rose-200/80 transition hover:bg-rose-500/10 sm:col-span-2"
                  onClick={() => deleteMemoryStar(selectedStar)}
                  type="button"
                >
                  <Trash2 className="h-4 w-4" />
                  delete this star
                </button>
              </div>
            </motion.article>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
