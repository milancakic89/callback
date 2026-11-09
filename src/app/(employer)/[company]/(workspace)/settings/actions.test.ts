import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireAccountType, hit, rpc } = vi.hoisted(() => ({
  requireAccountType: vi.fn(),
  hit: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/auth/dal", () => ({ requireAccountType }));
vi.mock("@/lib/supabase/rate-limit-store", () => ({ postgresStore: { hit } }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc }) }));

import { STEPS_SAVED_MESSAGE } from "@/lib/companies/candidate-steps";
import { saveCandidateSteps } from "./actions";

const STEP_ID = "22222222-2222-4222-8222-222222222222";
const EMPTY_STATE = {};

function stepsForm(steps: unknown): FormData {
  const formData = new FormData();
  formData.set("steps", typeof steps === "string" ? steps : JSON.stringify(steps));
  return formData;
}

const interview = { id: STEP_ID, name: "Interview", description: "A short call." };
const newStep = { id: null, name: "Offer call", description: "We talk about the offer." };

beforeEach(() => {
  vi.clearAllMocks();
  requireAccountType.mockResolvedValue({
    id: "user-1",
    email: "boss@acme.example",
    accountType: "employer",
    companySlug: "acme",
  });
  hit.mockResolvedValue({ count: 1, resetAt: Date.now() + 60_000 });
  rpc.mockResolvedValue({
    data: [
      {
        id: STEP_ID,
        position: 1,
        name: "Interview",
        description: "A short call.",
        used_at: null,
        updated_at: "2026-11-09T10:00:00+00:00",
      },
    ],
    error: null,
  });
});

describe("saveCandidateSteps", () => {
  it("refuses a bad step before anything else runs, naming the row and the field", async () => {
    const state = await saveCandidateSteps(EMPTY_STATE, stepsForm([interview, { ...newStep, name: "Rejected", description: "" }]));

    expect(Object.keys(state.fieldErrors ?? {}).sort()).toEqual(["steps.1.description", "steps.1.name"]);
    expect(requireAccountType).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("refuses a payload that isn't JSON, a list, or is missing", async () => {
    for (const payload of ["not json", "{}", "null"]) {
      const state = await saveCandidateSteps(EMPTY_STATE, stepsForm(payload));
      expect(state.fieldErrors, payload).toBeDefined();
    }
    const missing = await saveCandidateSteps(EMPTY_STATE, new FormData());
    expect(missing.fieldErrors).toBeDefined();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("refuses 11 steps", async () => {
    const eleven = Array.from({ length: 11 }, (_, index) => ({ id: null, name: `Step ${index}`, description: "text" }));

    const state = await saveCandidateSteps(EMPTY_STATE, stepsForm(eleven));

    expect(state.fieldErrors?.steps).toEqual(["Use at most 10 steps."]);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("needs an employer account", async () => {
    const redirected = new Error("NEXT_REDIRECT");
    requireAccountType.mockRejectedValue(redirected);

    await expect(saveCandidateSteps(EMPTY_STATE, stepsForm([interview]))).rejects.toBe(redirected);
    expect(requireAccountType).toHaveBeenCalledWith("employer");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("sends the whole list, in order, with nothing the form did not send", async () => {
    await saveCandidateSteps(EMPTY_STATE, stepsForm([interview, newStep]));

    expect(rpc).toHaveBeenCalledExactlyOnceWith("save_company_steps", {
      p_steps: [
        { id: STEP_ID, name: "Interview", description: "A short call." },
        { id: null, name: "Offer call", description: "We talk about the offer." },
      ],
    });
  });

  it("sends an empty list to remove every step", async () => {
    rpc.mockResolvedValue({ data: [], error: null });

    const state = await saveCandidateSteps(EMPTY_STATE, stepsForm([]));

    expect(rpc).toHaveBeenCalledExactlyOnceWith("save_company_steps", { p_steps: [] });
    expect(state).toEqual({ message: STEPS_SAVED_MESSAGE, steps: [] });
  });

  it("answers the saved list, so the form starts again from it", async () => {
    const state = await saveCandidateSteps(EMPTY_STATE, stepsForm([interview]));

    expect(state.message).toBe(STEPS_SAVED_MESSAGE);
    expect(state.steps).toEqual([
      {
        id: STEP_ID,
        position: 1,
        name: "Interview",
        description: "A short call.",
        usedAt: null,
        updatedAt: "2026-11-09T10:00:00+00:00",
      },
    ]);
  });

  it("tells the employer which step can't be deleted", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "P0001", message: "step_in_use", details: "Interview" } });

    expect(await saveCandidateSteps(EMPTY_STATE, stepsForm([newStep]))).toEqual({
      error: "“Interview” has been used, so it can't be deleted. Rename it instead.",
    });
  });

  it("says a name used twice, and a name or text the database refused", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "23505", message: "duplicate key" } });
    expect((await saveCandidateSteps(EMPTY_STATE, stepsForm([interview]))).error).toBe(
      "Two steps can't have the same name.",
    );

    rpc.mockResolvedValue({ data: null, error: { code: "23514", message: "check violation" } });
    expect((await saveCandidateSteps(EMPTY_STATE, stepsForm([interview]))).error).toBe(
      "Check the steps: a name or a text is not allowed.",
    );
  });

  it("reports any other database error without its detail", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    rpc.mockResolvedValue({ data: null, error: { code: "XX000", message: "secret detail" } });

    const state = await saveCandidateSteps(EMPTY_STATE, stepsForm([interview]));

    expect(state).toEqual({ error: "Could not save the steps. Try again." });
  });

  it("asks an employer without a company address to set it up first", async () => {
    requireAccountType.mockResolvedValue({ id: "user-1", accountType: "employer", companySlug: null });

    expect(await saveCandidateSteps(EMPTY_STATE, stepsForm([interview]))).toEqual({
      error: "Set up your company first.",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("allows 30 saves an hour", async () => {
    await saveCandidateSteps(EMPTY_STATE, stepsForm([interview]));
    expect(hit).toHaveBeenCalledWith("candidate-steps:user-1", 60 * 60_000);

    hit.mockResolvedValue({ count: 31, resetAt: Date.now() + 60_000 });
    rpc.mockClear();
    expect(await saveCandidateSteps(EMPTY_STATE, stepsForm([interview]))).toEqual({
      error: "You've saved the steps a lot. Try again in an hour.",
    });
    expect(rpc).not.toHaveBeenCalled();
  });
});
