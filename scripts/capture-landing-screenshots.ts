import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium, type BrowserContext, type Page } from "playwright";
import sharp from "sharp";
import {
  DESKTOP_SCALE,
  DESKTOP_VIEWPORT,
  MOBILE_SCALE,
  MOBILE_VIEWPORT,
  REVIEW_SHOTS,
  type ReviewShot,
} from "../src/components/landing/review-shots";

// Takes the landing page's screenshots of Fast Manual Mode (features/landing-screenshots.md) from the
// real review screen, and writes them to public/landing/ as webp, where REVIEW_SHOTS says they go.
//
// Needs the app running (`next dev` or `next start`; BASE_URL, default http://localhost:3000) and an
// EMPLOYER account whose demo job still has its three sample applicants (features/demo-job.md):
// LANDING_SCREENSHOT_EMAIL and LANDING_SCREENSHOT_PASSWORD. Use a throwaway account, and delete it
// afterwards: the script gives the three applicants a status and a heart so the screens show them.
// The status control lists the company's own candidate steps (features/candidate-steps.md), so the
// account first needs two steps named "Screening" and "Interview" in its Settings.
// Run it again whenever the review screen changes.

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const OUTPUT_DIRECTORY = path.join(process.cwd(), "public");

// `next dev` draws its indicator (a <nextjs-portal>) over every page; it must not be in a screenshot.
const HIDE_DEV_INDICATOR = "nextjs-portal { display: none !important; }";
// The PDFs are drawn on canvases once they are loaded and a moment after the screen is ready.
const DOCUMENTS_DRAWN_MS = 2500;
// The cover letter opens after the pointer has rested on it, and takes a moment to unfold.
const LETTER_OPENED_MS = 1500;
const NAVIGATION_TIMEOUT_MS = 120_000;
// A spot on the cover letter that is not text, and one on the top bar, which does nothing.
const ON_THE_LETTER = { x: 1100, y: 500 };
const ON_THE_TOP_BAR = { x: 700, y: 30 };

// What each of the three sample applicants is given, in the order the playlist shows them.
const APPLICANTS = [
  { name: "Ana Novak", status: "Interview", liked: true },
  { name: "Jonas Weber", status: "Screening", liked: false },
  { name: "Priya Raman", status: "Applied", liked: false },
];

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set. See the top of scripts/capture-landing-screenshots.ts.`);
  return value;
}

async function signInAndOpenReview(page: Page, email: string, password: string): Promise<void> {
  await page.goto(`${BASE_URL}/sign-in`, { waitUntil: "load", timeout: NAVIGATION_TIMEOUT_MS });
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.click('button[type="submit"]');
  // An employer lands on their company's home, where the demo job's card has "Lets start".
  await page.getByRole("link", { name: /lets start/i }).click({ timeout: NAVIGATION_TIMEOUT_MS });
  await waitForDocuments(page);
  await page.addStyleTag({ content: HIDE_DEV_INDICATOR });
}

async function waitForDocuments(page: Page): Promise<void> {
  await page.waitForSelector("canvas", { timeout: NAVIGATION_TIMEOUT_MS });
  await page.waitForTimeout(DOCUMENTS_DRAWN_MS);
}

async function openApplicant(page: Page, name: string): Promise<void> {
  await page.getByRole("navigation", { name: "Candidates" }).getByRole("button", { name }).click();
  await waitForDocuments(page);
}

async function setStatus(page: Page, status: string): Promise<void> {
  const button = page.getByRole("group", { name: "Status" }).getByRole("button", { name: new RegExp(`^${status}`) });
  if ((await button.getAttribute("aria-pressed")) !== "true") await button.click();
}

async function setLiked(page: Page, liked: boolean): Promise<void> {
  const likeButton = page.getByRole("button", { name: "Like this candidate" });
  const unlikeButton = page.getByRole("button", { name: "Liked. Remove the heart" });
  if (liked && (await likeButton.count()) > 0) await likeButton.click();
  if (!liked && (await unlikeButton.count()) > 0) await unlikeButton.click();
}

// Gives each applicant their status and heart, and marks the first two viewed with Next (the arrow
// key), so the playlist shows a mix of "New", "Viewed", statuses and a heart. Priya stays new.
// Returns the address of each applicant's review, for the phone's screens.
async function prepareApplicants(page: Page): Promise<Record<string, string>> {
  const addresses: Record<string, string> = {};
  for (const applicant of APPLICANTS) {
    await openApplicant(page, applicant.name);
    await setStatus(page, applicant.status);
    await setLiked(page, applicant.liked);
    addresses[applicant.name] = page.url();
    if (applicant.name !== "Priya Raman") await page.keyboard.press("ArrowRight");
    // Let the background save of the status, the heart and the viewed mark finish.
    await page.waitForTimeout(800);
  }
  return addresses;
}

async function writeWebp(screenshot: Buffer, publicPath: string): Promise<void> {
  const file = path.join(OUTPUT_DIRECTORY, publicPath);
  await mkdir(path.dirname(file), { recursive: true });
  await sharp(screenshot).webp({ quality: 86, effort: 5 }).toFile(file);
  console.log(`wrote ${path.relative(process.cwd(), file)}`);
}

async function captureDesktop(page: Page, shots: Record<ReviewShot["id"], ReviewShot>): Promise<void> {
  await openApplicant(page, "Ana Novak");
  await page.mouse.move(ON_THE_TOP_BAR.x, ON_THE_TOP_BAR.y);
  await writeWebp(await page.screenshot(), shots.review.desktop.src);

  await openApplicant(page, "Jonas Weber");
  await page.mouse.move(ON_THE_LETTER.x, ON_THE_LETTER.y);
  await page.waitForTimeout(LETTER_OPENED_MS);
  await writeWebp(await page.screenshot(), shots.letter.desktop.src);
  await page.mouse.move(ON_THE_TOP_BAR.x, ON_THE_TOP_BAR.y);
  await page.waitForTimeout(LETTER_OPENED_MS);

  await page.getByRole("combobox", { name: "Filter by status" }).click();
  await page.waitForTimeout(700);
  await writeWebp(await page.screenshot(), shots.status.desktop.src);
  await page.keyboard.press("Escape");
}

async function captureMobile(
  context: BrowserContext,
  addresses: Record<string, string>,
  shots: Record<ReviewShot["id"], ReviewShot>,
): Promise<void> {
  const page = await context.newPage();

  async function openView(applicantName: string, tab: "CV" | "Cover letter" | "Overview"): Promise<void> {
    await page.goto(addresses[applicantName], { waitUntil: "load", timeout: NAVIGATION_TIMEOUT_MS });
    await waitForDocuments(page);
    await page.addStyleTag({ content: HIDE_DEV_INDICATOR });
    await page.getByRole("tab", { name: tab }).click();
    await page.waitForTimeout(DOCUMENTS_DRAWN_MS / 2);
  }

  await openView("Ana Novak", "CV");
  await writeWebp(await page.screenshot(), shots.review.mobile.src);
  await openView("Jonas Weber", "Cover letter");
  await writeWebp(await page.screenshot(), shots.letter.mobile.src);
  await openView("Jonas Weber", "Overview");
  await writeWebp(await page.screenshot(), shots.status.mobile.src);
}

async function main(): Promise<void> {
  const email = requiredEnvironment("LANDING_SCREENSHOT_EMAIL");
  const password = requiredEnvironment("LANDING_SCREENSHOT_PASSWORD");
  const shots = Object.fromEntries(REVIEW_SHOTS.map((shot) => [shot.id, shot])) as Record<ReviewShot["id"], ReviewShot>;

  const browser = await chromium.launch();
  try {
    const desktopContext = await browser.newContext({
      viewport: DESKTOP_VIEWPORT,
      deviceScaleFactor: DESKTOP_SCALE,
    });
    const desktopPage = await desktopContext.newPage();
    await signInAndOpenReview(desktopPage, email, password);
    const addresses = await prepareApplicants(desktopPage);
    await captureDesktop(desktopPage, shots);

    // The phone signs in with the desktop's session.
    const phoneContext = await browser.newContext({
      viewport: MOBILE_VIEWPORT,
      deviceScaleFactor: MOBILE_SCALE,
      isMobile: true,
      hasTouch: true,
      storageState: await desktopContext.storageState(),
    });
    await captureMobile(phoneContext, addresses, shots);
  } finally {
    await browser.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
