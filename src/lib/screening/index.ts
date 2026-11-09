import "server-only";
import { toScreeningColumns, type ScreeningColumns, type ScreeningCv, type ScreeningEngine, type ScreeningFilters } from "./engine";
import { keywordEngine } from "./keyword-engine";

// The engine the app uses. **This is the one line to change** to screen with something else, such as
// a real ATS or a model behind an API: any object with an `id` and a `screen()` fits
// (src/lib/screening/engine.ts), and nothing else in the app knows which engine it is.
export const screeningEngine: ScreeningEngine = keywordEngine;

// Screens one CV and returns what to store on the application, or null when there is nothing to store:
// the job has no filters, or the engine failed. A failure is logged, never thrown, so a problem with
// the screening can't stop an application from being made.
export async function screenCv(cv: ScreeningCv, filters: ScreeningFilters): Promise<ScreeningColumns | null> {
  if (filters.required.length + filters.optional.length === 0) return null;
  try {
    const outcome = await screeningEngine.screen(cv, filters);
    return toScreeningColumns(outcome, screeningEngine.id, filters, new Date());
  } catch (error) {
    console.error("screening failed for", cv.fileName, error);
    return null;
  }
}
