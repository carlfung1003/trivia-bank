/* ==========================================================================
   Recency risk — shared by audit-jeopardy and audit-surveys.
   --------------------------------------------------------------------------
   A trivia bank rots. Not evenly, and not visibly: the clue still reads fine,
   the answer is still spelled right, and the fact quietly stopped being true.
   Two shipped in the last batch and neither audit had anything to say —

     "Nineteen EU countries share this currency,
      introduced as cash in 2002."                   (21 since January 2026)
     "Miyazaki's 2001 bathhouse fantasy is still
      the only hand-drawn feature to take the
      animation Oscar."                              (The Boy and the Heron, 2024)

   What they have in common is a SHAPE, not a subject: a live count, and an
   uncontested superlative. This file flags that shape so an author has to
   look, because no test can know what is true — only which sentences are the
   kind that stop being true.

   Note what both clues also have: a year. The first cut of this file treated
   any date as proof the author had pinned the claim down, and so waved both
   of them straight through. That was backwards. "In 2002" anchors when the
   euro launched; it says nothing about how many countries use it now, and
   "2001" dates the film rather than the record. So an anchor only excuses
   patterns that a date can genuinely fix — `anchorable: true` below. A live
   count and a "still the only" are present-tense no matter what year sits
   beside them, and are never excused.

   The fix in the data is usually to date the claim where it matters ("it
   topped the 2012 poll") or to choose a fact that cannot move ("Vesuvius
   buried it in AD 79").
   ========================================================================== */

const PATTERNS = [
  /* NEVER excused by a date — these are present-tense by construction. */
  { anchorable: false,
    re: /\b(still|remains|remain)\s+(the\s+)?(only|first|last|largest|biggest|highest|tallest|longest|oldest|fastest|richest|most)\b/i,
    why: "'still the only' is a claim about today — date the record or pick one that cannot be beaten" },
  { anchorable: false,
    re: /\b(currently|at present|nowadays|these days|to date|so far|as of today|right now)\b/i,
    why: "explicitly present-tense" },
  { anchorable: false,
    re: /\b(nineteen|twenty|twenty[- ]one|twenty[- ]seven|\d{1,3})\s+(eu\s+|european\s+)?(countries|nations|member states|members)\b/i,
    why: "a live membership count — these change, and a date elsewhere in the clue does not fix one" },
  { anchorable: false,
    re: /\bthe\s+(current|reigning|latest|newest|incumbent)\b/i,
    why: "names a holder rather than a fact" },

  /* Excused when the clue carries a date, because a date can pin these down. */
  { anchorable: true,
    re: /\bis\s+(now\s+)?the\s+(world'?s\s+)?(largest|biggest|tallest|longest|richest|fastest|most\s+\w+)\b/i,
    why: "a live superlative — records fall" },
  { anchorable: true,
    re: /\b(most[- ]watched|best[- ]selling|highest[- ]grossing|top[- ]selling|most\s+downloaded)\b/i,
    why: "a chart position, which moves" },
  { anchorable: true,
    re: /\brecord\s+(holder|for the)\b/i,
    why: "records are broken" },
];

/* A year, a decade or an explicit era means the author has pinned the claim
   to a moment — but only for the patterns that say a date is enough. */
const ANCHORED = /\b(1[0-9]{3}|20[0-9]{2}|AD\s?\d+|BC\b|\d{1,2}(st|nd|rd|th)\s+century|in\s+the\s+\d{4}s)\b/i;

/**
 * @param {string} text  the clue or prompt to check
 * @returns {string[]}   reasons this line may rot; empty when it looks safe
 */
export function recencyRisk(text) {
  const s = String(text || "");
  const anchored = ANCHORED.test(s);
  const hits = [];
  for (const { re, why, anchorable } of PATTERNS) {
    if (anchorable && anchored) continue;
    if (re.test(s)) hits.push(why);
  }
  return hits;
}
