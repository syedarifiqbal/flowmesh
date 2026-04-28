# ADR-011: Saga Pattern for Pipeline Execution and Fan-Out

**Date:** 2026-04-28
**Status:** Accepted
**Deciders:** Arif Iqbal

## Context

The pipeline service consumes events from `ingestion.events` and must:

1. Find all pipelines configured for the workspace that match the event
2. Execute steps in order for each matching pipeline: **filter → transform → enrich**
3. Fan-out: publish one `pipeline.events` message per destination in the pipeline to the delivery queue

Several failure scenarios exist that need an explicit strategy:

- **Step failure mid-execution** — filter passes, transform throws. What happens to the event?
- **Partial fan-out** — pipeline has 3 destinations. Messages for destinations 1 and 2 are published, then the service crashes before destination 3. Original message is redelivered. Destination 1 and 2 now receive the event twice.
- **Service restart mid-execution** — no in-memory state survives. We need durable execution state.
- **Duplicate delivery from upstream** — ingestion may redeliver if pipeline nacks. Pipeline must not double-process.

The naive approach (no tracking, fire-and-forget fan-out) makes all of these silent data problems.

## Decision

### 1. Execution tracking via `pipeline_executions` table

Every time the pipeline service begins processing a queue message, it creates a `pipeline_execution` record:

```sql
pipeline_executions
  id            UUID  PK
  workspace_id  UUID
  pipeline_id   UUID
  event_id      UUID  -- from payload.eventId
  message_id    UUID  -- from meta.messageId (idempotency key)
  status        ENUM  pending | running | completed | failed
  started_at    TIMESTAMPTZ
  completed_at  TIMESTAMPTZ nullable
  error         TEXT  nullable
```

This gives the DLQ viewer full execution history and makes replay meaningful — you can see exactly which pipeline failed and why.

### 2. Idempotency on `meta.messageId`

Before creating a `pipeline_execution`, check Redis 2 for `meta.messageId` from the incoming queue message. If already seen, ack the message and return — do not process.

Mark `meta.messageId` as processed in Redis 2 **only after** the execution record is written and all fan-out messages are published. This ordering matters: if we crash between marking Redis and publishing, the message is redelivered and re-processed (a brief window of potential duplicate work). Marking after publishing closes this window.

TTL for idempotency keys: 24 hours (same as ingestion).

### 3. Sequential step execution with fail-fast

Steps execute in strict order: filter → transform → enrich. No parallelism.

If any step fails:
- Mark the `pipeline_execution` as `failed`, record the error
- **Nack without requeue** — the message goes directly to the DLQ
- Do not attempt subsequent steps or fan-out

Rationale: partial execution is worse than no execution. If transform corrupts the payload, running enrich on a corrupted payload or delivering it produces wrong data at the destination. Fail clean, let the operator inspect the DLQ and replay.

Filter is the only step that can legitimately "drop" an event — if the filter condition does not match, the pipeline is skipped cleanly (ack the message, no error, no DLQ).

### 4. Deterministic fan-out message IDs

Fan-out publishes one message to `pipeline.events` per destination. Each message must have a unique and **deterministic** `meta.messageId`:

```
fanout_messageId = UUIDv5(namespace: executionId, name: destinationId)
```

Using UUIDv5 (deterministic, not random) means: if the pipeline service crashes mid-fan-out and the original message is redelivered, the retry produces identical `messageId` values for every destination. The delivery service deduplicates by `messageId` — destinations that already received the message will skip the duplicate.

This gives **at-least-once delivery semantics** at the pipeline→delivery boundary with deduplication pushed to the delivery service, which is the appropriate owner of that guarantee.

### 5. Fan-out ordering: publish all, then ack

Sequence for a successful execution:

```
1. Check messageId in Redis 2 → not seen, continue
2. Create pipeline_execution (status: running)
3. Load pipeline config from cache / config-service
4. Execute filter → if no match, ack and return
5. Execute transform
6. Execute enrich
7. Publish N fan-out messages to delivery queue (confirm channel, publisher confirms)
8. Mark pipeline_execution as completed
9. Write messageId to Redis 2
10. Ack original message
```

Steps 7–10 are the commit sequence. If the service crashes anywhere in steps 7–10:
- The original message is redelivered (it was never acked)
- Steps 1–6 are repeated (idempotent — same execution record is found, status is `running` not `completed`)
- Step 7 republishes fan-out messages with the same deterministic messageIds — delivery service deduplicates

If the `pipeline_execution` record already exists with status `completed`, the idempotency check on messageId in Redis 2 catches it first and skips processing entirely.

## Consequences

**Positive:**
- Full execution history in the database — observable and replayable
- Deterministic messageIds make fan-out retries safe without a separate outbox table
- Fail-fast on step errors prevents bad data reaching destinations
- Delivery service already owns deduplication — no new infrastructure needed

**Negative:**
- `pipeline_executions` table grows indefinitely — needs a retention/cleanup job (Phase 3 concern)
- At-least-once means destinations may receive a duplicate in the narrow crash window between fan-out and ack. Destinations should be idempotent consumers where possible (e.g. Postgres destination uses INSERT ON CONFLICT DO NOTHING keyed on `eventId + destinationId`)
- UUIDv5 requires a stable namespace — use the pipeline service's fixed namespace UUID, stored as a constant, never regenerated

**Not chosen:**

- **Outbox pattern** — writes fan-out messages to a DB table transactionally, a poller publishes them. True exactly-once at the cost of another moving part (the poller), more DB load, and more latency. Overkill for the target scale.
- **Parallel step execution** — steps share the same event payload and the output of one feeds the next. Sequential is simpler and correct. Parallelism would require merging payloads, which adds complexity with no throughput benefit at step level (the bottleneck is the fan-out network I/O, not CPU).
- **Nack with requeue on step failure** — causes infinite redelivery loops for deterministic errors (e.g. a transform step that always throws on a specific payload shape). DLQ is the correct destination.
