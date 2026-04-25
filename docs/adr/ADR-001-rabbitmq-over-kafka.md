# ADR-001: RabbitMQ over Kafka for Event Queue

**Date:** 2026-04-25
**Status:** Accepted
**Deciders:** Arif Iqbal

## Context

FlowMesh needs a message queue between the Ingestion service and the Pipeline/Delivery services. Events must be buffered during downstream outages, delivered at least once, and dead-lettered after max retries. The two main candidates are RabbitMQ and Apache Kafka.

FlowMesh targets a single-server Docker Compose deployment costing ~$30/month. The primary users are solo developers and small teams, not enterprises running millions of events per second.

## Decision

Use RabbitMQ as the message queue for all event pipeline queues and the dead letter queue.

## Consequences

### Positive
- RabbitMQ runs in a single Docker container with no ZooKeeper or KRaft dependency — simpler ops for self-hosters
- Built-in dead letter queue support via exchange and queue configuration — no custom DLQ logic needed
- Message TTL, per-message routing, and priority queues are native features
- Lower memory footprint at small to medium scale — fits in a $30/month VPS alongside other services
- Management UI included out of the box — useful for debugging without extra tooling

### Negative
- RabbitMQ does not retain messages after acknowledgment — replay requires the DLQ, not re-reading a log
- Kafka's consumer group offset model is more elegant for scaling multiple pipeline workers
- Throughput ceiling is lower than Kafka — at very high event rates (millions/second) RabbitMQ would need clustering

### Neutral
- RabbitMQ uses AMQP; Kafka uses its own protocol — both have good client libraries for Node.js and Go

## Alternatives Considered

### Apache Kafka
Kafka's log-based architecture is excellent for event replay and high-throughput workloads. However, it requires ZooKeeper (legacy) or KRaft (newer), adds significant operational complexity, and uses considerably more memory at idle. For FlowMesh's target deployment size, this is over-engineering. If a future enterprise customer needs Kafka throughput, the Delivery service's queue consumer can be swapped without changing the rest of the architecture.

### Redis Streams
Redis Streams would reduce the dependency count by reusing the existing Redis instances. However, mixing durable event queuing with Redis's cache-oriented deployment model is risky — a misconfigured eviction policy could silently drop events. Keeping queue concerns separate from cache concerns is the safer design.
