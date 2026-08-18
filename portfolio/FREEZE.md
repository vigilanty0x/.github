# Consolidation freeze

The freeze is active while the portfolio has more work in review than can be inspected safely.

## Blocked by default

- creation of another public repository;
- opening non-urgent pull requests;
- feature work on source repositories being consolidated;
- source archive or deletion;
- publication of a release without the full release gate.

Only a security-critical fix or a release blocker may bypass the freeze, and only with explicit human approval plus evidence. A bypass does not waive compatibility, rollback, consumer, or public-boundary checks.

## Stop-the-line thresholds

- maximum open pull requests: **50**;
- maximum active consolidations: **2**;
- maximum draft age before triage: **14 days**;
- maximum evidence age: **30 days**.

The live collector reports every threshold breach and exits non-zero in strict mode. It performs no mutation.

## Source work during freeze

A source may receive a critical fix only when the same fix is either ported to the target or explicitly recorded as target-not-applicable. New features belong in the target rehearsal, not in a source scheduled for migration.

## Exit conditions

The freeze is reviewed, not automatically removed. Removal requires:

1. pull-request backlog below threshold;
2. no unowned P0 item;
3. at most two active consolidations;
4. current registry evidence;
5. explicit human approval recorded in a reviewed change.
