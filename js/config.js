/* ==========================================================================
   THE TRIVIA BANK — balance configuration
   --------------------------------------------------------------------------
   Every tunable number in the game lives here. Nothing in engine.js, modes.js
   or lifelines.js may contain a magic number — that rule is what made the
   open-empires and slime-tower rebalances a data edit instead of a refactor.
   ========================================================================== */

export const DIFFICULTY = {
  order: ["easy", "medium", "hard"],
  label: { easy: "Petty", medium: "Grand", hard: "Federal" },
  /* Base payout per correct answer, in credits. */
  base: { easy: 100, medium: 250, hard: 500 },
  /* Seconds on the clock, before mode multipliers. */
  time: { easy: 20, medium: 25, hard: 32 },
  /* How often the crowd (WIRETAP) actually knows the answer. Honest, not
     flattering: on Federal questions the room is genuinely split. */
  crowdAccuracy: { easy: 0.86, medium: 0.62, hard: 0.38 },
};

export const SCORING = {
  /* Speed bonus scales linearly from 1.0 (buzzer) to max (instant). */
  speedBonusMax: 1.5,
  /* Streak multiplier ladder, indexed by consecutive correct answers. */
  streakLadder: [1, 1, 1.2, 1.5, 2, 2.5, 3],
  streakLadderMax: 3,
  /* Typing the answer instead of picking it is worth more. */
  typedMultiplier: 1.5,
  /* DOUBLE DOWN stake multiplier on a correct answer. */
  doubleDownMultiplier: 2,
  /* Credits are displayed on a split-flap board this many digits wide. */
  boardDigits: 7,
};

export const MODES = {
  vault: {
    id: "vault",
    name: "Vault Run",
    tagline: "Twelve locks. Two safe havens. Bank it or push your luck.",
    length: 12,
    /* Difficulty ramp across the run — index maps to question number. */
    ramp: [
      "easy", "easy", "easy", "easy",
      "medium", "medium", "medium", "medium",
      "hard", "hard", "hard", "hard",
    ],
    /* Question indices (0-based) after which the haul is locked in. */
    safeHavens: [3, 7],
    lifelines: ["drill", "wiretap", "freeze", "bypass", "doubledown"],
    timeScale: 1,
    canBank: true,
    livesAlarm: 0,
  },
  blitz: {
    id: "blitz",
    name: "Blitz",
    tagline: "Ninety seconds. No tools. Every second is a lock you didn't pick.",
    length: Infinity,
    clock: 90,
    correctBonusSeconds: 3,
    wrongPenaltySeconds: 5,
    /* The clock can never bank past its starting value. Without this ceiling
       a fast player gains more time than each question costs and Blitz runs
       forever — the headless playtest hit 252 questions and 1.5M credits on a
       90-second mode. The cap keeps every run genuinely finite. */
    clockCap: 90,
    ramp: null,               /* random draw across selected difficulties */
    safeHavens: [],
    lifelines: [],
    timeScale: 0,             /* one shared clock, not per-question */
    canBank: false,
    livesAlarm: 0,
  },
  survival: {
    id: "survival",
    name: "Survival",
    tagline: "Three alarms. Endless vault. The locks get meaner every five.",
    length: Infinity,
    ramp: null,
    /* Difficulty escalates one tier every N questions answered. */
    escalateEvery: 5,
    safeHavens: [],
    lifelines: ["drill", "freeze"],
    timeScale: 0.85,
    canBank: false,
    livesAlarm: 3,
  },
  daily: {
    id: "daily",
    name: "Daily Heist",
    tagline: "Ten locks. Same ten for everyone, everywhere. One attempt.",
    length: 10,
    ramp: [
      "easy", "easy", "easy",
      "medium", "medium", "medium", "medium",
      "hard", "hard", "hard",
    ],
    safeHavens: [],
    lifelines: ["drill", "wiretap"],
    timeScale: 1,
    canBank: false,
    livesAlarm: 0,
    oneAttemptPerDay: true,
  },
};

export const LIFELINES = {
  drill: {
    id: "drill",
    name: "Drill",
    hint: "Burn away two wrong answers.",
    key: "d",
    /* Number of wrong options removed. */
    removes: 2,
    requiresChoice: true,     /* meaningless in typed mode */
  },
  wiretap: {
    id: "wiretap",
    name: "Wiretap",
    hint: "Listen in on what the room thinks.",
    key: "w",
    requiresChoice: true,
    /* Spread of the poll when the crowd is wrong, so it never looks uniform. */
    noiseFloor: 0.04,
  },
  freeze: {
    id: "freeze",
    name: "Freeze",
    hint: "Jam the clock for this lock.",
    key: "f",
    requiresChoice: false,
  },
  bypass: {
    id: "bypass",
    name: "Bypass",
    hint: "Swap this lock for a fresh one. No penalty.",
    key: "b",
    requiresChoice: false,
  },
  doubledown: {
    id: "doubledown",
    name: "Double Down",
    hint: "Double the payout — but a miss costs your unbanked haul.",
    key: "x",
    requiresChoice: false,
    armed: true,              /* declared before answering, not after */
  },
};

export const DISTRACTORS = {
  /* How many options a multiple-choice question shows. */
  optionCount: 4,
  /* Prefer distractors that share the answer's detected type; fall back to
     same-category, then same-difficulty, then anywhere in the bank. */
  tierWeights: { sameTypeSameCat: 1, sameType: 0.75, sameCat: 0.4, any: 0.1 },
  /* Numeric distractors are generated by perturbing the real answer rather
     than borrowed, so "1969" never sits next to "Mount Sainte-Victoire". */
  numericJitter: [0.08, 0.17, 0.31],
  yearJitter: [2, 3, 5, 7, 11, 14],
  /* Reject a borrowed distractor if it is this similar to the real answer. */
  maxSimilarity: 0.82,
};

export const FX = {
  /* Freeze-frame on a correct answer. The single highest-ROI piece of juice
     in the whole game (shadow-sovereign's melee lesson, applied to quiz). */
  hitPauseMs: 60,
  hitPauseWrongMs: 110,
  shakeMs: 420,
  shakeMagnitude: 9,
  particleCount: 34,
  particleCountBig: 90,
  /* Streak level at which the background vault door starts opening. */
  heatStreakStart: 2,
  heatStreakFull: 6,
  /* Clock fraction below which the heartbeat treatment engages. */
  criticalClockFraction: 0.22,
  counterRollMs: 620,
};

export const AUDIO = {
  masterGain: 0.32,
  /* Every sound is synthesised — no asset files, no network, no licensing.
     Frequencies in Hz, durations in seconds. */
  tumbler:   { freq: 880,  decay: 0.08, type: "square",   gain: 0.16 },
  correct:   { freq: 523.25, decay: 0.5, type: "triangle", gain: 0.3  },
  wrong:     { freq: 98,   decay: 0.7,  type: "sawtooth", gain: 0.26 },
  klaxon:    { freq: 220,  decay: 0.9,  type: "square",   gain: 0.2  },
  tick:      { freq: 1200, decay: 0.03, type: "sine",     gain: 0.07 },
  heartbeat: { freq: 62,   decay: 0.26, type: "sine",     gain: 0.34 },
  bank:      { freq: 1046.5, decay: 0.9, type: "triangle", gain: 0.3 },
  vault:     { freq: 44,   decay: 2.2,  type: "sawtooth", gain: 0.3  },
  drill:     { freq: 140,  decay: 0.55, type: "sawtooth", gain: 0.18 },
  /* Ascending arpeggio played on a banked run, in semitones from base. */
  fanfare: [0, 4, 7, 12, 16, 19],
};

export const STORE = {
  key: "trivia-bank/v1",
  /* Achievements are pure predicates over a finished run + lifetime stats. */
  achievements: [
    { id: "first-haul",   name: "First Haul",     hint: "Bank a Vault Run."                       },
    { id: "clean-vault",  name: "Clean Sweep",    hint: "Finish a Vault Run with no wrong answers." },
    { id: "no-tools",     name: "Bare Hands",     hint: "Clear a Vault Run without a single tool." },
    { id: "deep-six",     name: "Deep Six",       hint: "Reach question 30 in Survival."           },
    { id: "century",      name: "Century",        hint: "Answer 100 questions correctly, lifetime." },
    { id: "polymath",     name: "Polymath",       hint: "Answer correctly in all 12 categories."   },
    { id: "speed-demon",  name: "Speed Demon",    hint: "Answer correctly with 90% of clock left." },
    { id: "week-streak",  name: "Regular",        hint: "Play the Daily Heist 7 days running."     },
    { id: "typed-true",   name: "No Nets",        hint: "Clear a full run in Type-It mode."        },
    { id: "double-or",    name: "Double or Nothing", hint: "Win a Double Down on a Federal lock."  },
  ],
};

/* Categories are read from the bank at load time; this only fixes their
   display order and gives each a mono sigil (never an emoji — house rule). */
export const CATEGORY_SIGILS = {
  "Geography":          "▲",  /* ▲ */
  "History":            "◆",  /* ◆ */
  "Science & Nature":   "✦",  /* ✦ */
  "Art & Architecture": "◯",  /* ◯ */
  "Literature":         "■",  /* ■ */
  "Music":              "♪",  /* ♪ */
  "Film & TV":          "▶",  /* ▶ */
  "Food & Drink":       "◐",  /* ◐ */
  "Sports & Games":     "✥",  /* ✥ */
  "Technology":         "⌘",  /* ⌘ */
  "Language & Words":   "¶",  /* ¶ */
  "Odds & Ends":        "⁂",  /* ⁂ */
};

export const DEFAULT_SIGIL = "○";
