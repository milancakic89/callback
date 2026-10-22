import type { Page } from "playwright";
import { settle } from "../browser";
import { isSerbianPlace } from "../normalize";

const SERBIA_LABEL = /serbia|srbija|belgrade|beograd|novi sad/i;
const LOAD_MORE =
  /load more|show more|view more|see more|show all|view all|see all|more (jobs|positions)|u[cč]itaj jo[sš]|prika[zž]i sve|vidi sve|vi[sš]e oglasa|jo[sš] oglasa/i;

// Picks Serbia (or a Serbian city) in a country/location filter. True when something was selected.
export async function selectSerbia(page: Page): Promise<boolean> {
  for (const select of await page.locator("select").all()) {
    const options = await select
      .locator("option")
      .evaluateAll((nodes) =>
        nodes.map((node) => ({
          value: (node as HTMLOptionElement).value,
          label: node.textContent ?? "",
        })),
      )
      .catch(() => []);
    const match = options.find((option) => isSerbianPlace(option.label));
    if (!match) continue;
    try {
      await select.selectOption(match.value, { timeout: 5000 });
      await settle(page);
      return true;
    } catch {
      // Hidden or disabled select; try the next one.
    }
  }

  // Checkbox and button style filters.
  const filter = page
    .locator("label, [role=option], [role=checkbox], [role=tab]")
    .filter({ hasText: SERBIA_LABEL })
    .first();
  if ((await filter.count()) && (await filter.isVisible().catch(() => false))) {
    try {
      await filter.click({ timeout: 5000 });
      await settle(page);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

// Clicks "Load more" / "Show all" until it disappears (at most 5 times).
export async function expandListings(page: Page): Promise<boolean> {
  let clicked = false;
  for (let i = 0; i < 5; i++) {
    const button = page.locator("button, [role=button]").filter({ hasText: LOAD_MORE }).first();
    if (!(await button.count()) || !(await button.isVisible().catch(() => false))) break;
    try {
      await button.click({ timeout: 5000 });
    } catch {
      break;
    }
    clicked = true;
    await settle(page);
  }
  return clicked;
}
