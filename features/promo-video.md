# Promo video

**Status:** implemented, 2026-11-14, on the branch `feat/promo-video`. The video's project lives outside this repo, in `../promo-video` (`/Users/milancakic/Documents/projects/CV-tracker/promo-video`); only this plan is in the repo. Checks passed: `npx tsc --noEmit` (strict, no `any`); 41 stills (one or more per beat, in `out/stills/`) looked at and fixed; `out/callback-promo.mp4` rendered with `ffprobe` showing 60.000 s (1,800 frames), 1920x1080, 30 fps, H.264 High, yuv420p, no audio (175 MB at CRF 16; the film grain is most of the bitrate); `out/callback-promo-poster.png` (frame 1,740 of the end card). Deviations: the `/jobs` screenshot has the search "designer" typed in and the dev-tools badge and the "Showing 1-20 of N" job count hidden (no number about Callback's jobs); the logo is shown from `logo-on-dark@4x.png`, an upscale of `logo-on-dark.png` (the app only has it at 266 x 61); `letter-desktop.webp` is copied but not used by the storyboard.

## What
A 60-second promotional video for Callback: motion design, not a screen recording. English on-screen text, 1920×1080, 30 fps (1,800 frames), H.264 MP4. It tells one story across both sides, in the landing page's voice: a candidate applies and hears nothing, recruiters are buried in documents, Callback fixes both, ending on "Every application deserves a response."

No voice-over and no music in the file: the owner adds a licensed track later (the cuts land on round seconds, so a track at about 120 BPM fits). No sound effects.

## Rules for the content
- **Only what works today** (features/landing.md, "Two audiences, honestly labelled"). In: searching the job list, saving, applying with a CV and cover letter, tracking applications (Pending → Got offer), posting and publishing a job, Fast Manual Mode (CV and cover letter side by side, the keyword check, hiring stages, Next), "Nothing is rejected automatically", interview invitations with a Google Meet link that the candidate confirms. **Out:** automatic candidate status updates (coming soon), anything about AI, any number about Callback's users, jobs or speed.
- **No invented product numbers.** The only figures are the ones on the real screenshots (sample data) and the interview's time and length.
- **Fictional people only**: the demo job's candidates (Ana Novak, Jonas Weber, Priya Raman), the demo company Halden, the role Senior Product Designer.
- **No third-party logos.** "Google Meet" is named in text, with a generic video icon.

## Look
- The landing page's design system (`src/components/landing/landing.css`): background `#09090b`, surface `#0e0e11`, lines `rgb(255 255 255 / 0.07)` and `/ 0.12`, text `#ededeb`, muted `#a1a1a8`, subtle `#6d6d76`, lime `#c6f24e` (on lime `#0b0d05`), paper `#fcfbf8`, ink `#1c1c1e`. Easing `cubic-bezier(0.2, 0.7, 0.2, 1)` or Remotion springs with no overshoot past a few percent.
- Type: Geist (headlines 600 weight, tight tracking −0.03em; 104 px for scene titles, 64 px for beat titles, 32 px for captions) and Geist Mono (eyebrows: 22 px, uppercase, 0.18em tracking, lime).
- One lime accent per frame at most: the key word of a headline, the button pressed, the stage set.
- A quiet, living background on every scene: a very slow drifting lime radial glow at 4–6 % opacity, a fine film grain (SVG noise at 3–4 %), and a vignette. Safe margins 120 px left and right, 96 px top and bottom.
- Product screens sit in a browser frame (rounded 20 px, a dark title bar with three muted dots and a URL pill in Geist Mono, a 1 px `line-strong` border, a large soft shadow and a faint lime glow under it), placed in 3D (perspective about 2,400 px, a few degrees of rotateX/rotateY) and moved by a slow camera: push-ins and pans, never faster than the eye can read.
- UI cards made for the video (job card, application rows, invitation cards) copy the app's real components in shape and wording (rounded 16 px, surface background, line borders, the status pills as in the review screen), so nothing looks like a different product.
- A cursor (a clean white arrow with a soft shadow) moves with eased paths and "presses" buttons: the button scales to 0.96 and back, and a lime ring ripples out.
- Every headline enters word by word (rise 24 px, blur 8 px → 0, opacity 0 → 1, 3 frames between words) and leaves together (fade and rise 12 px over 10 frames).

## Storyboard
Frames at 30 fps. Scenes are joined with 15-frame transitions (fade, or a slide with fade for the scene changes marked so); the scene lengths below already include their share, and the total is exactly 1,800 frames.

| # | Time | Scene | What happens |
|---|---|---|---|
| 1 | 0:00–0:06 | **Silence** | Black opens to the background. A small application card in the centre: "Senior Product Designer · Halden", a line "Application sent" with a check. Top right, a Geist Mono counter ticks "DAY 1" → "DAY 21" (eased, faster in the middle). Headline beats: "You applied." then "Then… nothing." The card slowly greys out and drifts back; a faint "No reply" label appears under it. |
| 2 | 0:06–0:11 | **The pile** | Ten to twelve document cards and browser-tab chips ("CV_final_v3.pdf", "Cover_letter.pdf", "Resume (1).pdf", "Inbox", "Downloads", "Untitled spreadsheet") drift in from the edges at different depths (parallax, slight rotation) and crowd the frame. Headline over a dim scrim: "Recruiters? Buried in PDFs and tabs." On the last 20 frames everything is swept to the right and blurred out. |
| 3 | 0:11–0:16 | **Reveal** | A thin lime line draws across the centre, then splits; `logo-on-dark.png` scales from 0.92 to 1 with blur 12 → 0. Under it, word by word: "Every application deserves a response." with "response." in lime. Hold. |
| 4 | 0:16–0:27 | **For candidates** (slide in) | Eyebrow "FOR CANDIDATES". Three beats of 110 frames: **(a)** "Search every open role in one list." with the real `/jobs` screenshot in the browser frame (URL `callback.rs/jobs`), tilted, slow push-in; four filter chips pop in one after another: Title, Company, Location, Remote. **(b)** "Apply with your CV." A job card (Senior Product Designer, Halden, Belgrade, Hybrid) and a PDF card "Ana_Novak_CV.pdf"; the cursor drags the PDF onto the card's lime "Apply" button, which turns into "Applied ✓". **(c)** "Track every application." Three application rows (role, company, a status pill); the cursor sets the first row's pill from "Pending" to "Got offer", which turns lime. |
| 5 | 0:27–0:44 | **For employers** (slide in) | Eyebrow "FOR EMPLOYERS". **(a)** 0:27–0:31 "Post a job. Publish it to the board." A job form card (title, location, requirements as chips: Figma, Design systems, 5+ years experience, English) and a "Publish" button the cursor presses; a "Published" pill and the company address `callback.rs/halden` appear. **(b)** 0:31–0:40 the title "Two documents. One decision. Next." (Fast Manual Mode's own line) over the real review screenshot (`review-desktop.webp`) in the browser frame, then a camera move across it with captions at the bottom: "The original CV and cover letter, side by side." (push to the two documents) → "A keyword check against your requirements." (pan to the screening overview; a lime outline draws around "Required 4/4") → "Set the stage. Press Next." (pan to the stage grid: an outline around "Interview", then the "Next" button pulses and the screen cross-fades to `status-desktop.webp`, the next candidate). **(c)** 0:40–0:44 "Nothing is rejected automatically. You decide." Large type, the words "You decide." in lime. |
| 6 | 0:44–0:54 | **Interviews** (slide in) | Eyebrow "INTERVIEWS". **(a)** 0:44–0:49 "Invite to an interview. Google Meet included." An employer-side invitation card: Ana Novak, Senior Product Designer, "Sun 15 Nov · 10:00", "45 min · Google Meet", a short message line; the cursor presses "Send invitation"; a small envelope flies out to the right. **(b)** 0:49–0:54 "The candidate confirms. Everyone knows where they stand." The candidate's card "You're invited to an interview" (Halden, Senior Product Designer, the time and length) with Confirm and Decline; the cursor presses Confirm; the card becomes "Interview confirmed" with a lime "Open Google Meet" button, and a calendar event chip slides in under it: "Interview: Ana Novak (Senior Product Designer) · 10:00–10:45". |
| 7 | 0:54–1:00 | **End card** | The logo, the line "Every application deserves a response.", two pills: a lime "Find a job" and an outlined "Start hiring", and `callback.rs` in Geist Mono under them; a small muted line "Free for candidates." The last 15 frames fade to black. |

## Assets
- `public/logo-on-dark.png` and `public/landing/review-desktop.webp`, `status-desktop.webp`, `letter-desktop.webp` (2880×1800), copied from this repo into the video project's `public/`.
- **`jobs-desktop.png`**: a new screenshot of the public job list, taken with this repo's Playwright (Chromium) at 1440×900, device scale 2, from the running dev server `http://localhost:3000/jobs` (or `https://callback.rs/jobs` if it isn't running), after the list has rendered. Signed out; nothing private is on that page.

## The project (`../promo-video`)
- Its own `package.json` (private, ESM), exact versions: `remotion`, `@remotion/cli`, `@remotion/transitions` and `@remotion/google-fonts` at `4.0.539` (2026-10-26), `react` and `react-dom` at `19.3.0` (as the app), `typescript` and `@types/react` matching the app's. Scripts: `studio` (`remotion studio`), `still` and `render`.
- `remotion.config.ts`: JPEG frames at high quality, overwrite output.
- `src/index.ts` (registerRoot), `src/Root.tsx` (one composition, `CallbackPromo`, 1920×1080, 30 fps, 1,800 frames), `src/theme.ts` (the tokens above, fonts loaded with `@remotion/google-fonts/Geist` and `GeistMono`), `src/components/` (Background, BrowserFrame, Eyebrow, Headline (word-by-word), Caption, Pill, Cursor, DocumentCard, plus the cards of scenes 4–6), `src/scenes/` (one file per scene), sequenced with `TransitionSeries`. Shared timing helpers (eases, word stagger) in one module; no magic numbers repeated across scenes.
- Strict TypeScript, no `any`, descriptive names (this repo's rules carry over).
- Remotion's license: free for individuals and companies of up to three people; a larger company needs a company license.
- `out/` and `node_modules/` are not kept in version control (a `.gitignore`), if the folder is ever made a repository.

## Checks
- `npx tsc --noEmit` in the video project passes.
- Stills (`remotion still`) of at least one frame per beat, looked at: text inside the safe margins, nothing clipped or overlapping, the lime used once per frame, the screenshots sharp.
- The full render: `out/callback-promo.mp4`, and `ffprobe` shows 60.0 s, 1920×1080, 30 fps, H.264, yuv420p. Also `out/callback-promo-poster.png` (a frame of the end card) for a `<video poster>`.
- Nothing in this repo changes but this file.

## Revision, 2026-11-14: jobs posted on Callback, and a status that updates itself
**Why (the owner).** The video promotes jobs posted on Callback, not the scraped list: no third-party company or job board may appear. And the candidate must not be seen setting their own status: for a job posted on Callback it follows the company's stage by itself.

**What the app does** (checked in the code): a job posted on Callback carries the "Auto-tracked" badge (`src/components/jobs/auto-tracked-badge.tsx`: a dark badge with a lightning icon, the tooltip "Posted on Callback. Your application status updates automatically."), and its row on the job board and in the candidate's applications is lime-tinted (`NATIVE_ROW_CLASS`: a lime fill at about 40 %, lime lines above and below, a dark 6 px bar on the left, the title bold). The candidate's status is the stage the company set, with no dropdown (`candidateStatusView`): "Applied", then the company's own step by name ("Screening", "Interview" in the demo company), then "Got offer" or "Rejected". Sending the candidate an email about it is still coming soon, so the video shows the status changing in their list, never a notification.

**Changes.**
- **Beat 4a**, now "Apply to companies hiring on Callback." The real `/jobs` screenshot (`jobs-desktop.png`) is no longer used anywhere. In its place, a job board built for the video in the browser frame (`callback.rs/jobs`), in the light style of the real table (white page, black header row: Title, Location, Company, Posted, Work mode), with five rows, all posted on Callback and drawn as native rows with the "Auto-tracked" badge after the title: Senior Product Designer · Halden · Belgrade, Serbia · Hybrid; UX Researcher · Lumen Labs · Novi Sad, Serbia · Remote; Brand Designer · Orchard & Co · Belgrade, Serbia · On-site; Frontend Engineer · Fernway · Remote · Remote; Product Manager · Quillstone · Belgrade, Serbia · Hybrid. "Posted" in relative words (today, yesterday, 2 days ago). The four filter chips stay. Same camera (tilt, slow push-in).
- **Beat 4c**, now "Your status updates itself." No cursor. The candidate's applications as three rows in the same native style (Senior Product Designer · Halden, UX Researcher · Lumen Labs, Brand Designer · Orchard & Co), each with the "Auto-tracked" badge and a status as plain text in a pill (no dropdown chevron). The first row's status changes on its own, about every 0.8 s: Applied → Screening → Interview → Got offer, each change a short cross-fade with a soft lime pulse on the row; "Got offer" ends in the lime pill. Partway through, the badge's tooltip appears above it with the app's own text: "Posted on Callback. Your application status updates automatically."
- **Beat 4b** stays, with its job card given the "Auto-tracked" badge so it reads as the same job as in 4a.
- Nothing else changes. The total stays 1,800 frames.
- The outputs are rendered again (master, web version at CRF 22 with faststart, poster) and copied over `job-manager/public/videos/callback-promo.mp4` and `callback-promo-poster.webp`.

**Status (revision):** implemented, 2026-11-14, in `../promo-video`: beats 4a, 4b and 4c as above, `jobs-desktop.png` and its capture script deleted (nothing renders a third-party company or job board), total still 1,800 frames. `npx tsc --noEmit` passes; 4a, 4b and 4c stills looked at (each status change, the pulse and the tooltip); master `out/callback-promo.mp4` re-rendered (60.000 s, 1920x1080, 30 fps, H.264 High, yuv420p, 175.8 MB), web version `out/callback-promo-web.mp4` (CRF 22, faststart, no audio, 16.4 MB) and poster `out/callback-promo-poster.png` / `.webp` made. The agent's copy over `public/videos/` was blocked by the permission system; it was done afterwards at the owner's request (the file there is byte for byte the new web version) and committed in `9dcd199`.

## Revision, 2026-11-14 (2): a voiceover in the video
**Why (the owner).** The video needs sound: a voice telling the story, embedded in the MP4 itself, not a script to voice somewhere else.

**The voice.** There is no ElevenLabs or OpenAI key on this machine, and the macOS voices installed are the robotic ones. So the voice is **Kokoro-82M** (Apache 2.0: commercial use allowed, no attribution required), run locally with the npm package `kokoro-js` (ONNX on the CPU), model `onnx-community/Kokoro-82M-v1.0-ONNX` at `fp32`, voice `af_heart` (a warm American female voice, the model's best-rated), speed 1.0. The voice and the speed are one constant each, so another voice is a one-line change and a new run.

**The script** (about 120 words). Absolute frames in the finished video, at 30 fps. A line starts a few frames after its headline (or the logo) appears, so the voice and the text land together, and must be over by its last frame. Scene starts: silence 0, pile 180, reveal 330, candidates 480 (beats at 480, 590, 700), employers 810 (post 810, review 930, decide 1200), interviews 1320 (invite 1320, confirm 1470), end card 1620.

| Id | Starts | Over by | Line | On screen then |
|---|---|---|---|---|
| `silence-applied` | 40 | 104 | You applied. | "You applied." (36) |
| `silence-nothing` | 112 | 190 | Then… nothing. | "Then… nothing." (108) |
| `pile` | 208 | 380 | Recruiters? Buried in PDFs, inboxes and tabs. | the pile's headline (204) |
| `reveal-meet` | the logo's frame + 6 | 388 | Meet Callback. | the logo (read from `RevealScene.tsx`) |
| `reveal-tagline` | 396 | 476 | Because every application deserves a response. | the tagline (392) |
| `candidates-search` | 490 | 598 | For candidates: apply to companies hiring on Callback. | 4a (484) |
| `candidates-apply` | 602 | 706 | Apply with the CV you already have. | 4b (594) |
| `candidates-track` | 712 | 816 | Your status updates itself. No more guessing. | 4c (704) |
| `employers-post` | 820 | 932 | For employers: post a job, and publish it. | 5a (814) |
| `employers-documents` | 940 | 1036 | See the original CV and cover letter, side by side. | the title (936), caption 1 (986) |
| `employers-keywords` | 1040 | 1120 | With a keyword check against your requirements. | caption 2 (1050) |
| `employers-next` | 1125 | 1200 | Then set the stage, and press Next. | caption 3 (1110) |
| `employers-decide` | 1212 | 1318 | Nothing is rejected automatically. You decide. | 5c (1206) |
| `interviews-invite` | 1330 | 1466 | Invite them to an interview, with Google Meet included. | 6a (1324) |
| `interviews-confirm` | 1480 | 1616 | The candidate confirms, and everyone knows where they stand. | 6b (1474) |
| `end` | 1646 | 1770 | Callback. Find a job, or start hiring, at callback dot R S. | the end card (1642); the fade to black starts at 1785 |

A line that runs past its "over by" frame is shortened (the fallbacks: `candidates-search` → "Apply to companies hiring on Callback.", `end` → "Find a job or start hiring at callback dot R S.") or spoken at up to 1.1; the visuals are never moved for the voice. "callback dot R S" is spelled so the voice reads the domain as letters.

**How it is built** (in `../promo-video`):
- `src/voiceover.json`: the lines above (`id`, `text`, `startFrame`, `endFrame`), the one source both the generator and the composition read.
- `scripts/generate-voiceover.mjs` (`npm run voiceover`): one WAV per line in `public/voiceover/<id>.wav`; it measures each clip and fails, naming the line, if it runs past `endFrame`. `kokoro-js` at an exact version at least two weeks old, as a devDependency.
- `src/components/Voiceover.tsx`: one `<Sequence from={startFrame}>` with an `<Audio>` per line, at the top of `CallbackPromo` (outside the `TransitionSeries`, so the frames are absolute). From now on `npm run render` has the voice.
- **Voice only, no music**: there is no licensed track on hand. Music can be added later under the voice (ducked) from a track the owner picks.
- **Outputs:** the composition's audio rendered alone (`--codec=wav`), loudness-normalised to −16 LUFS integrated with true peak at most −1.5 dBTP (ffmpeg `loudnorm`, two passes), as AAC 48 kHz stereo 192 kbps, and muxed into the existing master `out/callback-promo.mp4` and web version `out/callback-promo-web.mp4` with the video stream copied: the frames stay exactly as they were, and nothing is re-encoded. Then copied over `public/videos/callback-promo.mp4` here. The poster doesn't change.

**Checks.** `npx tsc --noEmit` passes. `npm run voiceover` passes its fit check. `ffprobe` on both MP4s: one H.264 stream and one AAC stream, both 60.0 s, and the video stream identical to the previous file's. `ffmpeg -af ebur128` measures about −16 LUFS. `silencedetect` puts the start of speech within 0.2 s of each line's `startFrame`. Nothing in this repo changes but this file and `public/videos/callback-promo.mp4`.

**Status (voiceover):** implemented, 2026-11-14, in `../promo-video`, as planned, with `kokoro-js` 1.2.1 (2025-05-03), voice `af_heart`. Two lines needed `speed` 1.1 to fit, `reveal-meet` (also started at the logo's frame + 4, i.e. 362, not + 6) and `employers-documents`; no fallback text was needed. Kokoro's 0.3 s of leading silence is trimmed from every clip. Checks: `npx tsc --noEmit` passes; `npm run voiceover` reports all 16 lines fit; both MP4s have one H.264 and one AAC stream (LC, 48 kHz, stereo), both exactly 60.000 s; the video stream's md5 is unchanged (`de836f4f…` web, `cdf38362…` master); −16.0 LUFS integrated, true peak −1.5 dBTP; speech starts within 0.03 s of every line's `startFrame`. Web version 17.4 MB (AAC averages ~131 kbps, the track being mostly silence), copied over `public/videos/callback-promo.mp4`. No unit tests: the promo project has no test runner. Not listened to by a person yet. Not committed.

## Revision, 2026-11-14 (3): a subtle music bed under the voice
**Why (the owner).** "Some subtle music: not distracting, but not quiet between the words." Today the gaps between the lines are silence, which feels empty.

**Where the music comes from.** No licensed track is on hand, and the open music models are either non-commercial (MusicGen's weights are CC BY-NC) or too heavy for this machine. So the music is **composed in code** for this video: original, with no licence to track, and its changes land on the scene changes. It is synthesised in Node (no numpy here), with ffmpeg for the reverb (`afir` with a generated impulse response) and the final polish. Everything random comes from a seeded generator, so the same run gives the same file.

**The piece.** 120 BPM, so a beat is exactly 15 frames and a bar exactly 2 s (60 frames); D major. Warm and soft: rounded tones, no sharp transients, nothing above a gentle shimmer.
| Bars | Time | Scene | Music |
|---|---|---|---|
| 1–3 | 0–6 s | Silence | A soft fade-in (1.5 s) to a dark, low-passed pad (Bm(add9), then Gmaj7), and a single low felt-piano note now and then. Sparse, a little uneasy. |
| 4–6 | 6–12 s | The pile | The pad goes on; a soft, low-passed bass pulse in eighth notes adds tension; a quiet filtered-noise riser from 10.0 s to the logo. |
| — | 11.93 s (frame 358) | The logo | A soft "bloom": a short, low sub swell, and the pad's filter opens over about a second. |
| 7–8 | 12–16 s | Reveal | The pad opens to D major (Dmaj9, then A(add9)), bright but still slow. No beat yet. |
| 9–27 | 16–54 s | Candidates, employers, interviews | The body: one chord a bar, Dmaj7, A/C♯, Bm7, Gmaj7, looped. A soft eighth-note pluck arpeggio (electric piano or marimba-like, highs rolled off, a little stereo delay), a root-note bass, a soft round kick on beats 1 and 3, and a very quiet shaker on the off-beats. From bar 23 (44 s, interviews) a higher pluck layer for a small lift. |
| 28–30 | 54–60 s | End card | The rhythm stops; one last Dmaj9 (pad, a plucked chord and the bass) rings out with the reverb and fades to nothing by 60 s (the picture fades to black from 59.5 s). |

**Levels.** "Not quiet between the words": the music is always there under the voice. On its own, the music's integrated loudness sits **12 dB below the voice's** (one constant). While a line is actually being spoken, it dips by **only 3 dB** (down over 6 frames, starting 3 frames before the speech, back up over 12 frames after it), so it never drops away between the words or the lines. The first scene is a few dB quieter than the body, as part of the composition. The whole mix (voice + music) is then normalised as before: −16 LUFS integrated, true peak at most −1.5 dBTP.

**How it is built** (in `../promo-video`):
- `scripts/compose-music.mjs` (`npm run music`): writes `public/music/bed.wav`, 48 kHz stereo, exactly 60.000 s. The tempo, the key, the chords, the section bars and the level of each instrument are named constants at the top.
- `scripts/generate-voiceover.mjs` also writes each line's measured length in frames to `src/voiceover-durations.json`, so the dip follows the real speech, not the line's window.
- `src/music-ducking.ts`: a pure function, the music's volume at a frame, given the lines, their lengths, the dip and the ramps as parameters.
- `src/components/MusicBed.tsx`: one `<Audio>` for `music/bed.wav` from frame 0, its `volume` that function. It is rendered next to `<Voiceover>` in `CallbackPromo`, outside the `TransitionSeries`.
- **Outputs**, as for the voice: the audio rendered alone, normalised in two passes, AAC 48 kHz stereo 192 kbps, muxed into the master and the web MP4s with the video stream copied (it replaces the voice-only track). Also `out/music-bed-preview.m4a`, the music alone, for listening, and `out/music-spectrum.png` and `out/mix-spectrum.png` (`showspectrumpic`), to check the shape by eye.

**Checks.** `npx tsc --noEmit` passes. `npm run music` twice gives the same md5. `bed.wav` is 60.000 s and its true peak is below −1 dBTP. The music alone measures 12 ± 1 dB below the voice alone (`ebur128`). The final mix measures −16 LUFS and a true peak of at most −1.5 dBTP. `silencedetect` (−50 dB, 0.3 s) finds no silence in the final mix between 1.5 s and 59.5 s. Both MP4s have one H.264 and one AAC stream, both 60.000 s, and an unchanged video md5. Then the web version is copied over `public/videos/callback-promo.mp4` here.

**Status (music):** implemented, 2026-11-14, in `../promo-video`, as planned. `scripts/compose-music.mjs` (`npm run music`, seed `0x0ca11bac`, the same md5 on every run) and `scripts/master-audio.mjs` (`npm run audio`: the audio render, the two-pass loudnorm, the AAC and the mux, in one rerunnable script). `src/music-ducking.ts`, `src/components/MusicBed.tsx` and `src/voiceover-durations.json` (the voice clips came out byte-identical on regeneration). Remotion rounds a frame-varying volume to multiples of 1/97, so the bed's output gain is set so the base volume is exactly 24/97 and the 3 dB dip exactly 17/97. Checks: `npx tsc --noEmit` passes. The bed alone at base volume measures 12.0 dB under the voice; with the dips counted, 14.1 dB. In the body's gaps the music is about 11 dB under the speech, and the only silence in the mix is the first 0.48 s of the fade-in. Final mix −16.0 LUFS, true peak −1.7 dBTP. To hold that, an `alimiter` sits before loudnorm's second pass; it touches 1.45 % of the audio, by at most 3.3 dB. One H.264 and one AAC stream, both 60.000 s; video md5 unchanged. Web version 17.9 MB, copied over `public/videos/callback-promo.mp4`. A music-only preview is in `out/music-bed-preview.m4a`. No unit tests: the promo project has no test runner. Not listened to by a person yet. Not committed.

## Revision, 2026-11-15 (4): the film on the landing page
**Why (the owner).** "Put it somewhere on the landing page, your choice."

**Where.** A new section right under the hero, before "The problem" (`src/app/page.tsx`): the film opens with the same problem, so it leads straight into that section. The hero itself doesn't change.

**The section** (`src/components/landing/promo-film.tsx`, a server component):
- The landing page's own parts: `Container`, `Eyebrow` ("In 60 seconds"), a short heading ("See how Callback works.") and one muted line ("For candidates and employers: from the application to the interview."), `data-reveal` like the other sections, `id="film"`, a top border like "The problem".
- The video in a frame in the landing page's style: rounded, the `--l-line-strong` border, the product shot's shadow, `aspect-video`, so nothing shifts while the poster loads.
- Under it, a small mono line: "1:00 · Sound on · Captions available".

**The player** (`src/components/landing/promo-video-player.tsx`, a client component, kept small):
- `<video preload="none" playsInline poster="/videos/callback-promo-poster.webp">`, with `<source src="/videos/callback-promo.mp4" type="video/mp4">` and `<track kind="captions" src="/videos/callback-promo.en.vtt" srclang="en" label="English">` (off by default: the film already has its headlines on screen).
- **`preload="none"`:** nothing of the 17.9 MB file loads until the visitor presses play; only the poster (about 160 KB) does. **No autoplay**: the film has a voice, and browsers block autoplay with sound anyway.
- **Progressive enhancement.** The server markup is a plain `<video controls>`, which plays without JavaScript. Once hydrated (`useSyncExternalStore`, not a `useEffect` that sets state), the native controls are hidden behind an overlay: a large lime round play button with the accessible name "Play the 60-second film", and "Watch the film · 1:00" beside it. Pressing it calls `play()`, removes the overlay and shows the native controls. If `play()` is refused, the controls show anyway.
- The markup is a presentational part (`PromoVideoFrame`, with `enhanced`, `started` and `onPlay` as props) inside a thin stateful wrapper, so both states can be render-tested.
- The file paths are constants in one place (`src/components/landing/promo-video-files.ts`).

**Poster.** The current poster is the end card, and it would repeat the hero's tagline right under the hero. The new poster is a frame of beat 4a (the Callback job board with the "Auto-tracked" rows and "Apply to companies hiring on Callback."), once that frame is fully drawn. It is rendered with `remotion still`, saved as WebP at about quality 80, 1920×1080, and copied over `public/videos/callback-promo-poster.webp`. The end card stays in `../promo-video/out/`.

**Captions.**
- `../promo-video/scripts/write-captions.mjs` (`npm run captions`) writes `out/callback-promo.en.vtt` from `src/voiceover.json` and `src/voiceover-durations.json`: one cue per line, from `startFrame` to the end of the speech plus a few frames.
- An optional `caption` field in `voiceover.json` covers a line whose written text differs from the spoken one: `end` reads "Callback. Find a job, or start hiring, at callback.rs.", not "callback dot R S". The file is copied to `public/videos/callback-promo.en.vtt`.

**Not changed, and why:**
- **The CSP:** `default-src 'self'` already covers `media-src`, and the poster is under `img-src 'self'`.
- **The proxy matcher:** a path with a dot is never a workspace path (`isWorkspacePath`), so nobody is redirected, and the global rate limit stays on the media requests.
- **The Caddyfile:** `encode` doesn't compress `video/mp4`, and Caddy passes `Range` requests through.
- **The privacy policy:** the film is served from our own server, with no third-party player or tracking.

**The landing doc.** In `features/landing.md`:
- Add the section to the page structure.
- Correct the copy rule. Since `features/candidate-steps.md` (2026-11-09), a candidate's status does follow the company's stage, so "your application status updates automatically" is true. What is still not built is *telling* the candidate (an email), and neither the page nor the film may claim that.

**Tests** (vitest, render tests like the rest of `src/components/landing`):
- `promo-film.test.ts`: the eyebrow, heading and line; the section's `id`.
- `promo-video-player.test.ts`: `PromoVideoFrame` in its three states:
  - not enhanced: native controls, no overlay;
  - enhanced, not started: the overlay button with its accessible name, no `controls`;
  - started: `controls`, no overlay.
  In every state: `preload="none"`, `playsinline`, the poster, the source with its type, and the track with `kind`, `srclang` and `label`.
- A test that each path in `promo-video-files.ts` exists under `public/`, so a renamed file fails a test and not the page.
- No existing test is changed.

**Checks.**
- `npm test`, `npm run lint`, `npx tsc --noEmit` and `npm run build` pass, and `/` is still prerendered as before.
- On a production build (`npm run build && npm start`):
  - `curl -H "Range: bytes=0-1"` on the MP4 answers 206 with `Content-Range` (Safari needs it for video);
  - the VTT answers `text/vtt`;
  - the page loads no byte of the MP4 before play.
- In Chromium (the repo's Playwright), at 1440, 768, 390 and 320 px:
  - no horizontal overflow, no console errors, no CSP violation;
  - the overlay's button starts the film (`currentTime` advances);
  - captions can be turned on;
  - the section is checked with reduced motion as well.
- `public/videos/callback-promo-music-only.m4a` (a listening copy) is not committed.

**Status (landing page):** implemented, 2026-11-15, on the branch `feat/promo-video`, as planned, with the deviations below. Not committed.
- **In `../promo-video`:** `caption` added to `VoiceoverLine` and set on `end` only ("Callback. Find a job, or start hiring, at callback.rs."); no `text` changed, the voice and the audio were not regenerated. `scripts/write-captions.mjs` (`npm run captions`) writes `out/callback-promo.en.vtt` (16 cues, `WEBVTT`, `HH:MM:SS.mmm`). `scripts/png-to-webp.mjs` (`npm run webp -- <in.png> <out.webp> [quality] [width]`, sharp from this repo's `node_modules`) made `out/callback-promo-cover.webp`. `npx tsc --noEmit` passes there.
- **The poster** is frame 568 of beat 4a (beat frame 88), 1920x1080 WebP at quality 80, 67 KB (the end card it replaces was 161 KB). Stills of 560, 568 and 575 were looked at; all three have the headline, the four chips and the five rows fully drawn, and 568 is the safest: the last chip is in by beat frame ~83 and the exit fade starts at 98 (frame 578). The plan's 590 is the first frame of beat 4b, so it was not used. `out/callback-promo-cover.webp` and `out/callback-promo.en.vtt` were copied into `public/videos/` (`callback-promo-poster.webp` overwritten, `callback-promo.en.vtt` new); no permission was refused.
- **In this repo:** `src/components/landing/promo-video-files.ts`, `promo-video-player.tsx` (`PromoVideoFrame`, presentational, and `PromoVideoPlayer`, the stateful wrapper), `promo-film.tsx`, `use-hydrated.ts` (the `useSyncExternalStore` hook, kept apart so it can be reused and tested), `<PromoFilm />` after `<Hero>` in `src/app/page.tsx`, the `.l-film-play*` rules in `landing.css`, and `features/landing.md` (a new row 2 in the page structure, the rows after it renumbered, the copy rule corrected: a candidate's status updating by itself is true, telling the candidate is not built). The play button is a lime disc inside a dark pill ("Watch the film · 1:00"); the button is the disc, named "Play the 60-second film", and its `::after` covers the whole frame so a click anywhere on the poster plays. The focus ring is white with a dark gap (visible on the poster of any colour). The disc's hover scale is on an inner element (a transformed button would shrink its own `::after`). Pressing it sets `started` first and then calls `play()`, so a refusal still leaves the native controls showing; the focus moves to the video. The line under the frame uses `--l-fg-muted`, not `--l-fg-subtle` (about 3.9:1 on the page background, too faint for the information it carries).
- **Tests:** `promo-film.test.ts`, `promo-video-player.test.ts` (the three states, each with `preload="none"`, `playsInline`, the poster, the source with its type, the track with `kind`, `srcLang` and `label`; and the wrapper's server markup), `promo-video-files.test.ts` (each path exists under `public/`; the MP4 starts with `ftyp`, the poster is a 1920x1080 WebP, the captions start with `WEBVTT` and write the domain as `callback.rs`) and `use-hydrated.test.ts`: 4 files, 37 tests. No existing test was changed. React writes `playsInline` and `srcLang` in camel case, which HTML reads without regard to case, so those two assertions are case-insensitive.
- **Checks:** `npm test` 138 files, 1,321 tests pass (134 and 1,284 before); `npm run lint` and `npx tsc --noEmit` pass; `npm run build` passes and its route table is identical to the one from before the change (`/` is still `○ Static`, revalidate 1h, expire 1d).
  - **Production server** (`next start`, port 3100, because port 3000 is held by your own `next dev`, which was left alone): `Range: bytes=0-1` on the MP4 gives 206 with `Content-Range: bytes 0-1/17880601` and `Accept-Ranges: bytes`; the VTT gives `Content-Type: text/vtt; charset=UTF-8`; the poster gives 200 `image/webp`.
  - **Chromium (Playwright), 148 of 148 checks:** at 1440, 768, 390 and 320 px, each with motion and with `reducedMotion: 'reduce'`: no horizontal overflow (before and after play), no console errors or warnings, no CSP violation, the MP4 not requested before the click and then answered with a 206, one English captions track that can be set to `showing`, the play button found by its name, a 16:9 frame (288x162 at 320 px), the clicked button playing the film (`currentTime` about 1.4 s after 1.6 s, with sound: the headless browser did not need the page muted), the overlay gone and the native controls back, and the focus on the video. Also: Enter on the focused button starts the film; the button shows a 3 px white focus ring from the keyboard; with JavaScript off the film is a plain `<video controls>` with no play button.
- **Not done / not checked:** Safari and Firefox (Safari needs the 206 the server gives, but it was not run); the film was not watched or listened to in the browser beyond the first seconds; the captions were not read on screen, only switched on; no real device. The plan's "port 3000" was not used for the reason above.
