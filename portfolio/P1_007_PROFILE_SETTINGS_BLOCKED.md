# P1-007 — account profile settings final gate

## State

`BLOCKED_ON_ACCOUNT_OWNER_ACTION`.

Repository-side profile content, Portfolio Kit integration, the TTL-bound generated dashboard, Pages deployment workflow, and the bounded account-settings apply/verify mechanism are merged and verified. P1-007 is no longer blocked by a missing implementation path; it is blocked only by account-owner credential/UI actions that the connected GitHub App cannot perform.

## Exact implementation evidence

The profile repository contains the final account-settings mechanism at merge commit `674983d59ab89734ea4e9467364b904cc9920b2f`.

Verified pre-merge head: `76ba13a861396c61481db2b5b02f3297e9b13427`.

Profile evidence run `32202813603`: **SUCCESS**.

Dedicated gate issue: `https://github.com/vigilanty0x/vigilanty0x/issues/4`.

The mechanism:

- defines the canonical state in `profile-settings.json`;
- accepts a fine-grained `PROFILE_ADMIN_TOKEN` only from GitHub Actions secrets;
- authenticates the token owner before mutation;
- enables Pages with `build_type=workflow`;
- applies the profile bio/website and repository homepage;
- merges required topics without deleting existing topics;
- deploys the generated `docs/` dashboard with least-privilege Pages OIDC permissions;
- verifies public metadata, Pages state, topic subsets and exact pin order;
- fails closed on any mismatch;
- never prints the privileged token.

## Current observed public repository state

A read after the mechanism merge still reports:

- `homepage: null`;
- `has_pages: false`;
- `topics: []` on the profile repository.

That is expected because the owner-only apply command has not yet been authorized with the required account token.

## Remaining account-owner actions

1. Create a short-lived fine-grained token for owner `vigilanty0x` with Account **Profile: write**, and repository **Administration: write** + **Pages: write**, limited to the profile/Portfolio Kit/featured repositories recorded in issue #4. Store it only as repository Actions secret `PROFILE_ADMIN_TOKEN`; never paste it into GitHub content or chat.
2. In GitHub `Customize your pins`, select exactly: `apprentice-ai`, `repo-doctor`, `proofgate`, `ai-assistance-manifest`, `model-router`, `local-ai-stack`, in that order.

Once those two owner-only actions exist, A01 can post `/apply-profile-settings` to issue #4. The workflow applies every API-supported setting, deploys Pages, verifies the exact six pins, and P1-007 may move to `VERIFIED` only if the whole job is green.

## Why pins remain manual

GitHub's supported GraphQL surface exposes profile pinned items and whether the viewer may change them, but the published mutation reference does not expose a user-profile repository pin mutation. A01 therefore does not use an undocumented private endpoint or browser-session workaround.

## Safety

No source archive, deletion, redirect, release publication, secret disclosure, unsupported private API, or automatic completion is permitted by this gate.
