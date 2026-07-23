# Agentic Workflow Infrastructure

This package is the business-agnostic orchestration foundation for future AI
agents. It does not contain JD, resume, ATS, compatibility, tailoring, or skill
reasoning.

## Runtime flow

```text
START
  -> validate_workflow
  -> master_orchestrator
  -> execute_next
  -> validate_output
  -> checkpoint
  -> master_orchestrator
  -> ...
  -> finish
  -> END
```

`execute_next` may route to bounded retry, bounded repair, user confirmation,
safe failure, cancellation, or completion.

## Registering a future node

Implement `WorkflowNode`, declare `NodeMetadata`, and register the instance in
`workflow_node_registry`. A node receives a deep-copied `WorkflowState` and
returns either a new state or an explicit patch.

```python
class ExampleNode(WorkflowNode):
    metadata = NodeMetadata(
        name="example",
        version="1.0.0",
        dependencies=(),
        supported_inputs=(),
        produced_outputs=("result",),
    )

    def execute(self, state: WorkflowState):
        return {
            "node_outputs": {
                **state.node_outputs,
                "example": {"result": "completed"},
            }
        }


workflow_node_registry.register(ExampleNode())
```

Nodes cannot change workflow identity, versions, routing, checkpoint revision,
execution history, counters, or completion collections. Those fields belong to
the runtime.

## Persistence

Apply:

`supabase/migrations/20260724040000_create_workflow_orchestration.sql`

Production APIs use `PostgresCheckpointStore`. Tests use
`InMemoryCheckpointStore`. Checkpoints use optimistic revisions and are scoped
to the authenticated owner.

## API

Authenticated endpoints are mounted below `/api/v1/workflows`:

- `POST /` creates and runs a workflow.
- `GET /{workflow_id}` reads the latest checkpoint.
- `POST /{workflow_id}/resume` resumes the latest or selected checkpoint.
- `POST /{workflow_id}/confirm` supplies a human decision.
- `POST /{workflow_id}/cancel` requests safe cancellation.

## Safety and observability

Logs contain workflow metadata, counters, versions, durations, error codes, and
checkpoint IDs. They do not contain node payloads, prompts, resumes, job
descriptions, tokens, or other sensitive content.

The state is validated at entry, before routing, after node output, and before
checkpoint persistence. Node retries and repairs are bounded by both workflow
and node policies.
