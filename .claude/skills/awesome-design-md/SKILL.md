---
name: awesome-design-md
description: Browse and apply a DESIGN.md — a portable, plain-text design-system spec for AI coding agents — from a curated collection of ~74 real brand design systems. Use when the user wants a UI to visually match a specific brand or product (e.g. "make it look like Stripe", "give it a Notion feel", "match Claude's design").
metadata:
  source: https://github.com/VoltAgent/awesome-design-md
  license: MIT
---

# Awesome DESIGN.md

A curated library of `DESIGN.md` files — plain-text design-system documents that describe a
real product's visual identity (color tokens, type scale, spacing, component patterns, tone)
in a format AI coding agents read directly, no Figma export or JSON schema required.

## When to use

The user wants generated UI to visually match a specific brand or product's look and feel
("build this like Linear", "give the dashboard a Stripe feel", "match Notion's warm minimalism").

## How to use

1. **Find a match.** Search the catalog below for the brand/style the user wants, or browse
   `design-md/` directly (one subdirectory per brand, each with `DESIGN.md` + `README.md`).
2. **Read it.** Open `design-md/<slug>/DESIGN.md` for the full spec: color tokens, typography,
   spacing scale, component conventions, and tone.
3. **Apply it.** Either:
   - Copy the chosen file to the project root as `DESIGN.md` so it persists as the project's
     design reference (`cp .claude/skills/awesome-design-md/design-md/<slug>/DESIGN.md DESIGN.md`), or
   - Read it inline and apply its tokens/patterns directly to the UI being built, without
     copying it into the project.
   Ask the user which they prefer if it isn't clear — copying it in makes it a durable project
   convention; reading it inline is a one-off style reference.
4. **Never mix brand identities** into a project's own product without the user's intent — this
   library is a style reference, not a source of assets/logos to imitate wholesale for a
   commercial clone.

## Catalog

### AI & LLM Platforms
- **claude** — Anthropic's AI assistant. Warm terracotta accent, clean editorial layout
- **cohere** — Enterprise AI platform. Vibrant gradients, data-rich dashboard aesthetic
- **elevenlabs** — AI voice platform. Dark cinematic UI, audio-waveform aesthetics
- **minimax** — AI model provider. Bold dark interface with neon accents
- **mistral.ai** — Open-weight LLM provider. French-engineered minimalism, purple-toned
- **ollama** — Run LLMs locally. Terminal-first, monochrome simplicity
- **opencode.ai** — AI coding platform. Developer-centric dark theme
- **replicate** — Run ML models via API. Clean white canvas, code-forward
- **runwayml** — AI creative-tools platform, editorial film-festival aesthetic
- **together.ai** — Open-source AI infrastructure. Technical, blueprint-style design
- **voltagent** — AI agent framework. Void-black canvas, emerald accent, terminal-native
- **x.ai** — Elon Musk's AI lab. Stark monochrome, futuristic minimalism

### Developer Tools & IDEs
- **cursor** — AI-first code editor. Sleek dark interface, gradient accents
- **expo** — React Native platform. Dark theme, tight letter-spacing, code-centric
- **lovable** — AI full-stack builder. Playful gradients, friendly dev aesthetic
- **raycast** — Productivity launcher. Sleek dark chrome, vibrant gradient accents
- **superhuman** — Fast email client. Premium dark UI, keyboard-first, purple glow
- **vercel** — Frontend deployment platform. Black and white precision, Geist font
- **warp** — Modern terminal. Dark IDE-like interface, block-based command UI

### Backend, Database & DevOps
- **clickhouse** — Fast analytics database. Yellow-accented, technical documentation style
- **composio** — Tool integration platform. Modern dark with colorful integration icons
- **hashicorp** — Infrastructure automation. Enterprise-clean, black and white
- **mongodb** — Document database. Green leaf branding, developer documentation focus
- **posthog** — Product analytics. Playful hedgehog branding, developer-friendly dark UI
- **sanity** — Headless content platform. Dark editorial, coral-red accent
- **sentry** — Error monitoring. Dark dashboard, data-dense, pink-purple accent
- **supabase** — Open-source Firebase alternative. Dark emerald theme, code-first

### Productivity & SaaS
- **cal** — Open-source scheduling (Cal.com). Clean neutral UI, developer-oriented simplicity
- **intercom** — Customer messaging. Friendly blue palette, conversational UI patterns
- **linear.app** — Project management for engineers. Ultra-minimal, precise, purple accent
- **mintlify** — Documentation platform. Clean, green-accented, reading-optimized
- **notion** — All-in-one workspace. Warm minimalism, serif headings, soft surfaces
- **resend** — Email API for developers. Minimal dark theme, monospace accents
- **zapier** — Automation platform. Warm orange, friendly illustration-driven

### Design & Creative Tools
- **airtable** — Spreadsheet-database hybrid. Colorful, friendly, structured data aesthetic
- **clay** — Creative agency. Organic shapes, soft gradients, art-directed layout
- **figma** — Collaborative design tool. Vibrant multi-color, playful yet professional
- **framer** — Website builder. Bold black and blue, motion-first, design-forward
- **miro** — Visual collaboration. Bright yellow accent, infinite canvas aesthetic
- **webflow** — Visual web builder. Blue-accented, polished marketing site aesthetic

### Fintech & Crypto
- **binance** — Crypto exchange. Bold Binance Yellow on monochrome, trading-floor urgency
- **coinbase** — Crypto exchange. Clean blue identity, trust-focused, institutional feel
- **kraken** — Crypto trading platform. Purple-accented dark UI, data-dense dashboards
- **mastercard** — Global payments network. Warm cream canvas, orbital pill shapes
- **revolut** — Digital banking. Sleek dark interface, gradient cards, fintech precision
- **stripe** — Payment infrastructure. Signature purple gradients, weight-300 elegance
- **wise** — International money transfer. Bright green accent, friendly and clear

### E-commerce & Retail
- **airbnb** — Travel marketplace. Warm coral accent, photography-driven, rounded UI
- **meta** — Tech retail store. Photography-first, binary light/dark surfaces, Meta Blue CTAs
- **nike** — Athletic retail. Monochrome UI, massive uppercase Futura, full-bleed photography
- **shopify** — E-commerce platform. Dark-first cinematic, neon green accent
- **starbucks** — Coffee retail flagship. Earth-green system, warm cream canvas

### Media & Consumer Tech
- **apple** — Consumer electronics. Premium white space, SF Pro, cinematic imagery
- **hp** — PC and printer maker. Pure white canvas, HP Electric Blue signal CTA
- **ibm** — Enterprise technology. Carbon design system, structured blue palette
- **nvidia** — GPU computing. Green-black energy, technical power aesthetic
- **pinterest** — Visual discovery platform. Red accent, masonry grid, image-first
- **playstation** — Gaming console retail. Three-surface channel layout, cyan hover-scale
- **spacex** — Space technology. Stark black and white, full-bleed imagery, futuristic
- **spotify** — Music streaming. Vibrant green on dark, bold type, album-art-driven
- **theverge** — Tech editorial media. Acid-mint and ultraviolet accents
- **uber** — Mobility platform. Bold black and white, tight type, urban energy
- **vodafone** — Global telecom brand. Monumental uppercase display, Vodafone Red bands
- **wired** — Tech magazine. Paper-white broadsheet density, custom serif, ink-blue links

### Automotive
- **bmw** — Luxury automotive. Dark premium surfaces, precise German engineering aesthetic
- **bmw-m** — Performance automotive. Motorsport-inspired contrast, M color accents
- **bugatti** — Luxury hypercar. Cinema-black canvas, monochrome austerity
- **ferrari** — Luxury automotive. Chiaroscuro black-white editorial, Ferrari Red
- **lamborghini** — Luxury automotive. True black cathedral, gold accent
- **renault** — French automotive. Vivid aurora gradients, zero-radius buttons
- **tesla** — Electric vehicles. Radical subtraction, cinematic full-viewport photography

### Retro Web — DESIGN.md Nostalgia
- **dell-1996** — Catalog-era enterprise web. Black page frame, flat color-block cards, GIF stickers
- **nintendo-2001** — Y2K "console chrome" web. Brushed-metal panels, halftone-dotted nav

## Attribution

Collection sourced from [VoltAgent/awesome-design-md](https://github.com/VoltAgent/awesome-design-md)
(MIT licensed). See `LICENSE` in this skill directory.
