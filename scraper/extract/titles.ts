import { cleanText, plain } from "../text";

const ROLE_WORDS =
  /\b(developer|engineer|engineering|inzenjer|programer|programmer|qa|tester|testing|designer|dizajner|analyst|analiticar|manager|menadzer|lead|architect|arhitekta|devops|sre|data|scientist|intern|internship|praksa|praktikant|support|podrska|sales|prodaj\w*|hr|recruiter|regruter|talent|specialist|specijalista|consultant|konsultant|administrator|admin|officer|director|direktor|coordinator|koordinator|accountant|racunovodja|frontend|front-end|backend|back-end|full ?stack|fullstack|android|ios|mobile|java|python|\.net|php|react|node|golang|c\+\+|c#|embedded|security|cloud|product owner|scrum|marketing|writer|technician|tehnicar|operater|operator|assistant|asistent|saradnik|associate|expert|ekspert|head of|cto|ml|ai|machine learning|game|artist|animator|producer|owner|representative|agent|executive|strucnjak|referent|pm)\b/;

const NOT_A_TITLE =
  /^(apply( now)?|learn more|read more|more|details|view( job| details| position| more)?|see (more|details)|saznaj vise|prijavi se|pogledaj|detaljnije|vise|opsirnije|open|careers?|jobs?|karijera|join us)$/;

export function looksLikeJobTitle(value: string | null | undefined): boolean {
  const text = cleanText(value);
  if (text.length < 3 || text.length > 120) return false;
  // One word is usually a department link ("Engineering"), not a posting.
  const words = text.split(" ").length;
  if (words < 2 || words > 14) return false;
  const simple = plain(text);
  return !NOT_A_TITLE.test(simple) && ROLE_WORDS.test(simple);
}
