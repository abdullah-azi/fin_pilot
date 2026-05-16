# FinPilot Future Architecture Considerations

## Purpose

This document records infrastructure and AI-framework options that FinPilot may need later, but does not require for the current MVP.

The goal is to avoid premature complexity while keeping a clear reference for future scaling decisions.

## Current MVP Position

FinPilot currently works well with:

- React Native / Expo mobile app
- FastAPI backend
- PostgreSQL database
- REST APIs
- direct AI provider integration through backend services

At this stage, the product does **not** require advanced distributed systems or agent frameworks.

## 1. WebSockets

### Needed now

No.

### When they may become useful

- streaming AI responses in real time
- live dashboard updates
- multi-device real-time sync
- collaborative or shared financial features

### Recommendation

Do not add WebSockets in MVP. Introduce them only when the product has a real real-time requirement.

## 2. Webhooks

### Needed now

No.

### When they may become useful

- bank or transaction sync providers
- payment provider callbacks
- email or notification delivery events
- third-party shopping or pricing integrations

### Recommendation

Add webhooks only when FinPilot depends on external services that push events to the backend.

## 3. Workers

### Needed now

Not required, but likely useful soon after MVP.

### When they may become useful

- generating AI summaries in the background
- scheduled report generation
- recurring financial analysis jobs
- notification scheduling
- price-search or comparison jobs
- long-running data enrichment tasks

### Recommendation

Workers are the first future infrastructure addition most likely to be useful.

## 4. Queues

### Needed now

No.

### When they may become useful

- once background workers are introduced
- retrying failed jobs safely
- handling spikes in AI or analytics workloads
- separating user-facing requests from heavy background processing

### Recommendation

Queues should be added together with a worker system, not before.

## 5. LangChain

### Needed now

No.

### Why not

Current FinPilot AI use cases are still straightforward:

- affordability explanation
- spending summaries
- savings suggestions
- financial guidance based on structured app data

These can be handled cleanly with:

- backend business logic
- prompt construction in Python
- direct model API calls

### When it may become useful

- multi-step tool orchestration
- retrieval pipelines
- more advanced prompt/tool abstractions
- larger multi-provider AI workflows

### Recommendation

Do not use LangChain until backend AI complexity clearly justifies the extra abstraction.

## 6. LangGraph

### Needed now

No.

### Why not

LangGraph is best suited for stateful, multi-step agent workflows with branching logic and tool coordination.

FinPilot does not currently need that level of orchestration.

### When it may become useful

- a financial assistant that reasons through multiple tool steps
- persistent agent state over time
- branching planning workflows
- complex autonomous decision flows

### Recommendation

Avoid LangGraph in MVP and near-term development. Reconsider only if FinPilot evolves into a true multi-step AI agent product.

## Recommended Growth Order

If FinPilot grows in complexity, the preferred order is:

1. Keep REST + direct backend AI integration
2. Add workers for background processing
3. Add queues for reliability and scaling
4. Add webhooks for third-party event integrations
5. Add WebSockets only for real-time product needs
6. Consider LangChain or LangGraph only if AI workflow complexity becomes a real engineering pain point

## Final Position

For the current product stage:

- no WebSockets
- no webhooks
- no queues
- no LangChain
- no LangGraph

Possible future addition with the highest likelihood:

- background workers

This keeps FinPilot simple, maintainable, and aligned with its real product needs.
