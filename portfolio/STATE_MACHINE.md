# Consolidation state machine

## Evidence vocabulary

| State | Meaning |
| --- | --- |
| `PREPARED` | A change or decision exists in a branch, document, or pull request. |
| `MERGED` | The exact change reached the default branch. |
| `TAGGED` | An immutable version tag points to the intended commit. |
| `RELEASED` | A GitHub Release and installable artefacts exist. |
| `VERIFIED` | Post-publication checks, artefact digests, compatibility, consumers, rollback, and current evidence all pass. |

No state implies a later state. In particular, `PREPARED` is not `RELEASED`, and `MERGED` is not `VERIFIED`.

## Target states

```text
PROPOSED -> REHEARSAL -> READY -> RELEASED -> VERIFIED
      \          \          \          \          \
       +----------+----------+----------+-----------> ROLLED_BACK
```

- `PROPOSED`: product boundary or canonical repository is still being selected.
- `REHEARSAL`: imports or consolidation exist only as reviewable work.
- `READY`: identity, import, compatibility, tests, and review capacity gates pass.
- `RELEASED`: a real installable release exists, but post-release verification may still be pending.
- `VERIFIED`: every mandatory gate passes against current evidence.
- `ROLLED_BACK`: the target or migration was reversed and must not be presented as current.

## Source states

```text
ACTIVE_SOURCE -> FROZEN_SOURCE -> MIGRATION_IN_PROGRESS -> TARGET_RELEASED
       |                                                     |
       |                                                     v
       +-----------------------------------------------> REDIRECTED
                                                             |
                                                             v
                                                   ARCHIVE_CANDIDATE
                                                             |
                                                             v
                                                   ARCHIVE_APPROVED
                                                             |
                                                             v
                                                         ARCHIVED
```

`ACTIVE_TARGET` is used when a target repository is also one of the original source concepts. Any state can move to `ROLLED_BACK` when the registry records the reversal.

## Mandatory archive gate

A source may not enter `ARCHIVE_APPROVED` or `ARCHIVED` unless all of the following are `PASS`:

1. canonical decision;
2. exact import evidence;
3. compatibility and aliases;
4. installable target release;
5. consumer inventory and migration;
6. verified redirect/deprecation path;
7. rehearsed rollback;
8. named human approval with date and rationale.

A missing, stale, inaccessible, or waived mandatory proof is not a pass. The counter-proof tests intentionally attempt illegal archive and release states and must fail.

## Waivers

A waiver requires a named approver, approval date, expiry, and rationale. Waivers never satisfy `humanApproval`, and they cannot transform a target into `VERIFIED`.
