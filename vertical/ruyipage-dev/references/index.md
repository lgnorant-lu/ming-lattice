# RuyiPage Dev References

## Start Here

- Read `project-readme.md` first for installation, positioning, startup, and browser takeover.
- Read `docs/getting-started/` for framework overview and entry flows.

## Doc Map

- `docs/getting-started/`
  - Product overview, installation, quick start, BiDi context, test tooling
- `docs/page-and-elements/`
  - Page model, navigation, waits, locators, forms, actions, drag, scroll, touch, `isTrusted`, iframe, shadow DOM
- `docs/browser-and-context/`
  - JavaScript, script helpers, preload scripts, console, cookies, tabs, windows, browser scope, user contexts, downloads, screenshots, PDF, prompts, extensions, auth, emulation, mobile
- `docs/network/`
  - Network ability, interception, network events, navigation events, collector, anti-bot topics
- `docs/examples/`
  - Example-center pages captured from the docs site

## Search Recipes

- Search Chinese terms:
  - `rg -n -S "等待|元素|拦截|高风控|接管" references/docs`
- Search English terms case-insensitively:
  - `rg -n -i "firefoxpage|launch|cookie|download|context" references/docs`
- Search the project README:
  - `rg -n -i "attach|user_dir|fingerprint|bidi|firefox" references/project-readme.md`
