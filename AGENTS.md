
<!-- BEGIN:nextjs-agent-rules -->
This is a common error when doing things 
(Next.js encountered the unstable value Date.now() while prerendering.), make sure to avoid it

- No any type
- Do not modify existing unit tests just to pass it successfuly
- Do not create dependencies between classes, functions, rather provide them as params
- Template larger then 300 lines should be treated as large component, and try breaking it into smaller ones
- After refactoring all tests must pass in order to consider something successful
- No variables such as "a", "b" or "tmp", it must be named so that it is understandable, even for temporary variables
- For common functions create utility functions, and make sure before making new one, that such doesn not allready exists
- Every component must have unit tests
- No file should be edited on main branch, switch branches first, ask for branch name


- Opus is used for planing
- Sonet for implementing a plan by default
- Every plan must be first saved into features folder

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
