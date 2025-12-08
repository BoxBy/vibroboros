# Correlation-Based Idempotency (Design Note)

Purpose: ensure robust, structural idempotency for multi-agent orchestration by correlating each step execution and processing agent responses exactly once.

## Motivation
Time-window guards (e.g., 4 minutes) are patchy and can still allow late A2A messages to cause unintended plan advancement. We replace all time-based gates with correlation IDs and exact-match validation.

## Core Concepts
- workflowId (alias: planId): unique per generated plan/workflow
- stepId: unique per step, derived from workflowId, e.g., `${workflowId}:${index+1}`
- runId (alias: executionId): unique per in-progress dispatch of a step

## Contract
- Orchestrator dispatches A2A with parts[data].correlation: `{ workflowId, planId, stepId, runId, executionId }` (aliases provided for compatibility)
- Specialist agents echo the same `correlation` in their response payloads
- Orchestrator validates incoming responses:
  - correlation.workflowId (or planId) must equal current `workflowId`
  - correlation.stepId must equal current in-progress step's id
  - correlation.runId (or executionId) must equal current `runId`
  - Duplicate runId is ignored via a handled set (idempotent)

## Processing Flow
1) New plan created
   - Assign `workflowId` and step ids
   - Reset `currentStepIndex`, `runId`, and `handledRunIds`
2) Execute next pending step
   - Mark `in-progress`
   - Generate new `runId` and attach to the step
   - Dispatch with `correlation`
3) Handle responses
   - Validate correlation
   - If `needsConfirmation`, block advancement and render diff/command confirmation
   - Else, mark step `completed` and consider next step or finish
4) Late or duplicate A2A
   - Rejected by correlation mismatch or duplicate runId check

## Mapping to Microsoft Agent Framework
- MAF `workflow` ≈ here `plan`
- MAF `run` ≈ here `execution`
- Field mapping
  - workflowId ↔ planId
  - runId ↔ executionId
  - stepId ↔ stepId

## Rationale vs Alternatives
- Correlation validation is deterministic and resistant to delays, out-of-order delivery, and retries
- Works across all agents and transports (A2A, MCP-backed tools) without clock reliance
- Scales to persistent state if needed (e.g., store handled runIds)

## Verification Steps
- E2E
  - Create plan, accept a diff
  - Wait >10 minutes
  - Expect: no re-dispatch, no new diffs
- Duplicate response
  - Replay same response with identical correlation
  - Expect: ignored as duplicate
- Chat history
  - Ensure UI `loadHistory` contains the user's message

## Notes
- All time-based guards removed
- All diff/confirmation flows rely on correlation
- Other agents that respond with `response-code-execution` must echo `correlation`
