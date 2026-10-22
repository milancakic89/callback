import { plain } from "./text";
import type { RawJob } from "./types";

// Matched against plain() text, so no diacritics: "Niš" → "nis", "Čačak" → "cacak".
const SERBIAN_PLACES =
  /\b(serbia|srbija|srbiji|beograd|belgrade|novi sad|nis|kragujevac|cacak|subotica|zrenjanin|pancevo|kraljevo|novi pazar|leskovac|valjevo|sabac|smederevo|sombor|uzice|vrsac|krusevac|zajecar|pirot|loznica|sremska mitrovica|indjija|vranje|kikinda|jagodina)\b/;

const REMOTE = /\b(remote|anywhere|work from home|wfh|fully distributed|rad od kuce|rad na daljinu|daljinski)\b/;

// Words that say how, or roughly where, remote work happens without tying it to one country.
const REMOTE_NOISE =
  /\b(remote|anywhere|worldwide|global|globally|international|europe|european|europa|eu|emea|cee|central|eastern|western|southern|south|east|north|balkans?|region|regions|cet|cest|gmt|utc|time ?zones?|tz|work from home|wfh|fully|distributed|first|only|based|friendly|hybrid|or|and|in|from|any|location|locations|multiple|flexible|home|office|full ?time|part ?time|rad|od|kuce|na|daljinu|daljinski|countries|country)\b/g;

// Unmistakably elsewhere. Checked in titles and URLs ("SRE — UK", "Counsel (NAMER)"), so no
// ambiguous short words like "us".
const FOREIGN_MARKERS =
  /\b(usa|united states|uk|united kingdom|england|london|germany|deutschland|berlin|munich|france|paris|spain|madrid|italy|milan|netherlands|amsterdam|poland|warsaw|krakow|romania|bucharest|bulgaria|croatia|zagreb|hungary|budapest|india|bangalore|bengaluru|hyderabad|pune|mumbai|canada|toronto|australia|brazil|mexico|argentina|philippines|singapore|japan|china|israel|ireland|dublin|portugal|lisbon|czech|prague|austria|vienna|switzerland|zurich|sweden|norway|denmark|finland|estonia|ukraine|turkey|dubai|uae|saudi|namer|latam|apac|americas?|amercias|north america)\b/;

const REMOTE_SCOPES: [RegExp, string][] = [
  [/\bemea\b/, "EMEA"],
  [/\b(cee|central (and )?eastern europe|eastern europe)\b/, "CEE"],
  [/\bbalkans?\b/, "Balkans"],
  [/\b(europe|european|europa|eu)\b/, "Europe"],
  [/\b(worldwide|global|globally|anywhere|international)\b/, "Worldwide"],
];

export function isSerbianPlace(text: string): boolean {
  return SERBIAN_PLACES.test(plain(text));
}

const HYBRID_WORK = /\b(hybrid|hibrid\w*)\b/;
const ON_SITE_WORK =
  /\bon[- ]?site\b|\bin[- ]?office\b|\bin the office\b|\bu kancelariji\b|\biz kancelarije\b/;

export type WorkMode = "REMOTE" | "HYBRID" | "ON_SITE";

// Computed at publish time (scraper/stages/publish.ts), once the description is final. Not stored
// in jobs.json — see features/dashboard.md.
export function detectWorkMode(job: {
  title: string;
  locationRaw: string | null;
  description: string | null;
  isRemote: boolean;
}): WorkMode | null {
  const titleAndLocation = plain(`${job.title} ${job.locationRaw ?? ""}`);

  // Title/location win outright: "Hybrid — Belgrade" beats a job marked remote upstream.
  if (HYBRID_WORK.test(titleAndLocation)) return "HYBRID";
  if (job.isRemote) return "REMOTE";
  if (ON_SITE_WORK.test(titleAndLocation)) return "ON_SITE";

  if (job.description) {
    const text = plain(job.description);
    const hasHybrid = HYBRID_WORK.test(text);
    const hasRemote = REMOTE.test(text);
    const hasOnSite = ON_SITE_WORK.test(text);
    // Hybrid mentioned alongside another mode ("remote-first, hybrid available") still means hybrid.
    if (hasHybrid) return "HYBRID";
    // Remote and on-site together is contradictory (e.g. boilerplate "remote-friendly" culture
    // copy next to an on-site requirement) — safer to leave it unknown than guess.
    if (hasRemote && hasOnSite) return null;
    if (hasRemote) return "REMOTE";
    if (hasOnSite) return "ON_SITE";
  }

  return null;
}

export type Placement = {
  keep: boolean;
  country: "RS" | null;
  isRemote: boolean;
  remoteScope: string | null;
};

// Keeps jobs in Serbia, and remote jobs not tied to another country.
export function placeJob(job: RawJob, companyOffices: string[]): Placement {
  // "U.S." → "US", so the abbreviation survives as one word.
  const raw = (job.location ?? "").replace(/\b([A-Za-z])\.([A-Za-z])\.?/g, "$1$2");
  const text = plain(raw);
  const title = plain(job.title);
  const isRemote = job.remote === true || REMOTE.test(text) || REMOTE.test(title);
  const foreignHint = FOREIGN_MARKERS.test(title) || FOREIGN_MARKERS.test(plain(job.url ?? ""));

  if (job.countryCode === "rs" || SERBIAN_PLACES.test(text) || /\bRS\b/.test(raw)) {
    return { keep: true, country: "RS", isRemote, remoteScope: null };
  }

  if (isRemote) {
    const leftover = text.replace(REMOTE_NOISE, " ").replace(/[^a-z]+/g, " ");
    // "Remote, California, United States" leaves "california united states" behind.
    const tiedElsewhere = job.countryCode !== null || /[a-z]{2,}/.test(leftover) || foreignHint;
    const remoteScope = REMOTE_SCOPES.find(([re]) => re.test(text))?.[1] ?? null;
    return { keep: !tiedElsewhere, country: null, isRemote: true, remoteScope };
  }

  // No location on the posting: trust it only when the company has no offices outside Serbia
  // and nothing in the title or URL points elsewhere.
  if (!raw.trim() && job.countryCode === null) {
    const serbianOnly = companyOffices.every((office) => isSerbianPlace(office));
    return { keep: serbianOnly && !foreignHint, country: null, isRemote: false, remoteScope: null };
  }

  return { keep: false, country: null, isRemote: false, remoteScope: null };
}
