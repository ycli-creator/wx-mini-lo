# Product

<!-- impeccable:product-schema 1 -->

## Platform

Native WeChat Mini Program

## Users

- People who want a private place to manage personal tasks, points, rewards, and life records.
- Couples who create a separate shared space for joint tasks, points, rewards, memories, and communication.
- Users can prefer a record-first experience or a more social experience; this preference is editable rather than permanent.

## Product Purpose

Love Points is a WeChat Mini Program for turning personal progress and a couple's shared plans into tasks, points, rewards, and lasting records. Success means users can keep private material private by default, deliberately share selected moments, and understand which space owns every item and point balance.

## Positioning

Every person always has an independent personal space. Binding with a partner creates a new, separately owned couple space instead of merging two personal accounts. Public community sharing is an optional layer above private personal and couple records, never the default storage destination.

## Operating Context

- The product is a native WeChat Mini Program using CloudBase for identity, storage, cloud functions, and media.
- Users switch globally between their personal space and their active couple space from the personal profile. Tasks, points, rewards, records, and documents follow that selection without repeating the switch on every page.
- A couple space always has two members and is separate from both members' personal spaces.
- Community posts support a title, body, and media. In a couple space, a new post defaults to couple-only visibility; the author must explicitly choose to synchronize it to the public community.
- Public couple content continues to require the product's relationship and privacy safeguards.

## Capabilities and Constraints

### Privacy and onboarding

- First-run onboarding asks the user to choose between “专注记录” and “分享生活”. The choice is a preset that can be changed later from the profile.
- “专注记录” defaults to private visibility, disables identity-code discovery and most public profile details, prioritizes records, tasks, and calendar, and de-emphasizes community and messages without deleting access to them.
- “分享生活” still keeps new content private by default, but gives greater prominence to community synchronization, messages, interactions, and identity-code discovery.
- Switching into the record-first preset offers a choice between hiding all existing public content and applying the preference only to future content.
- A privacy master setting can make all posts couple-only, hide identities and relationship details, and keep only a minimal indication to visitors that the user is currently bound.
- First-use notices explain that personal-space and couple-space points do not transfer, how community sharing works, and where the privacy master setting can be changed.

### Tasks

- Ordinary tasks are divided first into one-time and recurring tasks. The initial recurring options are daily and weekly.
- A task can define its completion requirement, including direct completion, a written note, or required image evidence.
- Completed tasks remain accessible through a dedicated history entry, and every task card opens a progress/detail view regardless of assignee.
- A task assigned to the partner can still be viewed and can send an `@TA` reminder.
- A project task is visually and structurally distinct from an ordinary task, must belong to a couple space, and represents a joint outcome.
- A project contains 2–8 independently completable, unordered steps. Each step can be assigned to either member and can use its own completion requirement.
- Completing a project step does not require partner approval, notifies the other member, and grants 10% of the project's total reward.
- After all steps are complete, one final project completion action is sufficient to grant the remaining reward exactly once.

### Points and rewards

- Personal-space points and couple-space points are isolated and never migrate between spaces.
- Personal-space rewards can only use personal-space points and are configured for the individual user.
- Couple-space rewards use couple-space points and distinguish a reward intended for one person from a reward intended for both members.
- The reward shop follows the global space switch and includes state filters such as all, purchasable, purchased, and pending refund.
- Point changes remain server-authoritative, transactional, idempotent, and represented by immutable ledger entries.

### Home

- The home page is led by a personal, emotional banner rather than a dense functional dashboard.
- The banner can carry personal or couple imagery and relationship context according to the active space.
- Other frequent actions are consolidated beneath the banner into a compact tabbed area rather than a long vertical stack.
- The content emphasis adapts to the active space and the user's record-first or social preset.

### Delivery boundaries

- This phase changes the WeChat Mini Program and its CloudBase data/API model; it does not add payments, logistics, cash value, WebSocket chat, or additional clients.
- Community text and media require platform-appropriate content safety, reporting, privacy, and deletion handling before public release.

## Brand Commitments

- Product name: 爱心点数 / Love Points.
- Positioning line: 情侣共同生活的任务、积分与记录空间.
- Voice is warm without being overly sweet, intimate while respecting individual boundaries, encouraging without creating control, and concise like a natural reminder between partners.
- Existing icon and brand assets live under `docs/assets/`; the primary avatar uses two independent points connected through a shared point.

## Evidence on Hand

- Brand profile and app assets: `docs/BRAND_PROFILE.md` and `docs/assets/`.
- Existing product and engineering context: `README.md`, `docs/DEVELOPMENT_PLAN.md`, and current Mini Program implementation under `miniprogram/`.
- Existing specifications for heat, chat, privacy, and achievements under `docs/`.
- Existing Figma prototype is referenced from `docs/DEVELOPMENT_PLAN.md`; its older flows are evidence, not authority over the newly confirmed space, privacy, task, and home rules.

## Product Principles

1. Private by default, public only through an explicit and understandable action.
2. Personal identity and couple collaboration coexist without merging ownership or balances.
3. Every item visibly belongs to one space, and switching spaces must never create ambiguity.
4. Shared progress should feel cooperative rather than supervisory; reminders and notifications must not create control pressure.
5. The home experience should feel personal first and operational second.

## Accessibility & Inclusion

- Privacy choices must be expressed in plain language and must not rely on color alone.
- All primary controls must meet the Mini Program's existing minimum touch-target standard.
- Social functionality must remain optional so the product is fully usable as a private recording tool.
