# P1-007 — account profile settings blocker

## State

`BLOCKED` at the account-settings layer. Repository-side profile content and the generated evidence dashboard are already merged and verified.

## What was checked

The authenticated GitHub connector can read the current profile, repositories, pull requests, branches, files, workflows, and related evidence. Tool discovery was also performed specifically for profile, pin, topic, and update operations.

The currently exposed connector surface contains a **read-only profile action** but no supported mutation for:

- account display name / bio / homepage;
- pinned repositories;
- repository topics / About metadata through an account-level profile action;
- GitHub Pages activation/settings.

No unsupported REST call, browser automation, external credential reuse, or guessed endpoint was used to bypass that limitation.

## Already complete on the repository side

- canonical featured projects are aligned with the prepared final portfolio;
- the profile README is evidence-first;
- the public dashboard is generated from a TTL-bound live source;
- transitional identities are not promoted as final featured products;
- public profile CI is explicit-runner, SHA-pinned, and fail-closed.

## Exit gate

P1-007 can move out of `BLOCKED` only when a supported GitHub account/repository metadata mutation path is available, then the selected homepage, pinned repositories, and topics must be checked against verified target state before and after the change.
