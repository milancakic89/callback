import type { AtsName } from "../types";
import type { AtsAdapter } from "./adapter";
import { ashby } from "./ashby";
import { bamboohr } from "./bamboohr";
import { breezy } from "./breezy";
import { greenhouse } from "./greenhouse";
import { lever } from "./lever";
import { personio } from "./personio";
import { pinpoint } from "./pinpoint";
import { recruitee } from "./recruitee";
import { smartrecruiters } from "./smartrecruiters";
import { successfactors } from "./successfactors";
import { talentlyft } from "./talentlyft";
import { workable } from "./workable";
import { workday } from "./workday";

// ATSs that detect.ts recognizes but that have no adapter yet fall back to HTML extraction.
const ADAPTERS: Partial<Record<AtsName, AtsAdapter>> = {
  greenhouse,
  lever,
  ashby,
  workable,
  smartrecruiters,
  recruitee,
  breezy,
  personio,
  workday,
  pinpoint,
  talentlyft,
  bamboohr,
  successfactors,
};

export function getAdapter(name: AtsName): AtsAdapter | null {
  return ADAPTERS[name] ?? null;
}
