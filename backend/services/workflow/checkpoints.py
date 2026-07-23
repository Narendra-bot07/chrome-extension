"""Checkpoint persistence with memory and PostgreSQL implementations."""

from __future__ import annotations

import json
from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime
from threading import RLock
from uuid import uuid4

from psycopg2.extras import Json, RealDictCursor

from .errors import CheckpointError, VersionConflictError
from .models import WorkflowState, utc_now


@dataclass(frozen=True)
class Checkpoint:
    checkpoint_id: str
    workflow_id: str
    node_name: str | None
    revision: int
    state: WorkflowState
    created_at: datetime


class CheckpointStore(ABC):
    @abstractmethod
    def save(self, state: WorkflowState, *, expected_revision: int) -> Checkpoint:
        pass

    @abstractmethod
    def latest(self, workflow_id: str) -> Checkpoint | None:
        pass

    @abstractmethod
    def get(self, workflow_id: str, checkpoint_id: str) -> Checkpoint | None:
        pass

    @abstractmethod
    def invalidate_after(self, workflow_id: str, revision: int) -> int:
        pass


class InMemoryCheckpointStore(CheckpointStore):
    def __init__(self) -> None:
        self._items: dict[str, list[Checkpoint]] = {}
        self._lock = RLock()

    def save(self, state: WorkflowState, *, expected_revision: int) -> Checkpoint:
        with self._lock:
            items = self._items.setdefault(state.workflow_id, [])
            current_revision = items[-1].revision if items else 0
            if current_revision != expected_revision:
                raise VersionConflictError(
                    f"Expected revision {expected_revision}, found {current_revision}"
                )
            revision = current_revision + 1
            checkpoint_id = str(uuid4())
            stored = state.model_copy(
                update={"revision": revision, "last_checkpoint_id": checkpoint_id},
                deep=True,
            )
            checkpoint = Checkpoint(
                checkpoint_id=checkpoint_id,
                workflow_id=state.workflow_id,
                node_name=state.last_successful_node,
                revision=revision,
                state=stored,
                created_at=utc_now(),
            )
            items.append(checkpoint)
            return checkpoint

    def latest(self, workflow_id: str) -> Checkpoint | None:
        with self._lock:
            items = self._items.get(workflow_id, [])
            return items[-1] if items else None

    def get(self, workflow_id: str, checkpoint_id: str) -> Checkpoint | None:
        with self._lock:
            return next(
                (
                    item
                    for item in self._items.get(workflow_id, [])
                    if item.checkpoint_id == checkpoint_id
                ),
                None,
            )

    def invalidate_after(self, workflow_id: str, revision: int) -> int:
        with self._lock:
            items = self._items.get(workflow_id, [])
            retained = [item for item in items if item.revision <= revision]
            removed = len(items) - len(retained)
            self._items[workflow_id] = retained
            return removed


class PostgresCheckpointStore(CheckpointStore):
    """Durable store using the application's existing psycopg2 connection."""

    def __init__(self, connection, *, owner_id: str) -> None:
        self.connection = connection
        self.owner_id = owner_id

    def save(self, state: WorkflowState, *, expected_revision: int) -> Checkpoint:
        if state.owner_id != self.owner_id:
            raise CheckpointError("Workflow owner does not match checkpoint store")
        checkpoint_id = str(uuid4())
        revision = expected_revision + 1
        stored = state.model_copy(
            update={"revision": revision, "last_checkpoint_id": checkpoint_id}, deep=True
        )
        try:
            with self.connection.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(
                    """
                    SELECT revision FROM workflow_runs
                    WHERE workflow_id = %s AND owner_id = %s FOR UPDATE
                    """,
                    (state.workflow_id, self.owner_id),
                )
                row = cursor.fetchone()
                actual_revision = row["revision"] if row else 0
                if actual_revision != expected_revision:
                    raise VersionConflictError(
                        f"Expected revision {expected_revision}, found {actual_revision}"
                    )
                cursor.execute(
                    """
                    INSERT INTO workflow_runs
                        (workflow_id, owner_id, request_id, status, revision, state, created_at, updated_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (workflow_id) DO UPDATE SET
                        status = EXCLUDED.status,
                        revision = EXCLUDED.revision,
                        state = EXCLUDED.state,
                        updated_at = EXCLUDED.updated_at
                    WHERE workflow_runs.owner_id = EXCLUDED.owner_id
                    """,
                    (
                        stored.workflow_id,
                        self.owner_id,
                        stored.request_id,
                        stored.workflow_status.value,
                        revision,
                        Json(stored.model_dump(mode="json")),
                        stored.created_at,
                        stored.updated_at,
                    ),
                )
                cursor.execute(
                    """
                    INSERT INTO workflow_checkpoints
                        (checkpoint_id, workflow_id, node_name, revision, state)
                    VALUES (%s, %s, %s, %s, %s)
                    """,
                    (
                        checkpoint_id,
                        stored.workflow_id,
                        stored.last_successful_node,
                        revision,
                        Json(stored.model_dump(mode="json")),
                    ),
                )
            self.connection.commit()
        except VersionConflictError:
            self.connection.rollback()
            raise
        except Exception as exc:
            self.connection.rollback()
            raise CheckpointError("Unable to persist workflow checkpoint") from exc
        return Checkpoint(
            checkpoint_id=checkpoint_id,
            workflow_id=stored.workflow_id,
            node_name=stored.last_successful_node,
            revision=revision,
            state=stored,
            created_at=utc_now(),
        )

    def latest(self, workflow_id: str) -> Checkpoint | None:
        return self._load(
            """
            SELECT checkpoint_id, workflow_id, node_name, revision, state, created_at
            FROM workflow_checkpoints
            WHERE workflow_id = %s
              AND workflow_id IN (
                  SELECT workflow_id FROM workflow_runs WHERE owner_id = %s
              )
            ORDER BY revision DESC LIMIT 1
            """,
            (workflow_id, self.owner_id),
        )

    def get(self, workflow_id: str, checkpoint_id: str) -> Checkpoint | None:
        return self._load(
            """
            SELECT checkpoint_id, workflow_id, node_name, revision, state, created_at
            FROM workflow_checkpoints
            WHERE workflow_id = %s AND checkpoint_id = %s
              AND workflow_id IN (
                  SELECT workflow_id FROM workflow_runs WHERE owner_id = %s
              )
            """,
            (workflow_id, checkpoint_id, self.owner_id),
        )

    def _load(self, query: str, params: tuple) -> Checkpoint | None:
        try:
            with self.connection.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(query, params)
                row = cursor.fetchone()
            if not row:
                return None
            raw_state = row["state"]
            if isinstance(raw_state, str):
                raw_state = json.loads(raw_state)
            return Checkpoint(
                checkpoint_id=str(row["checkpoint_id"]),
                workflow_id=str(row["workflow_id"]),
                node_name=row["node_name"],
                revision=row["revision"],
                state=WorkflowState.model_validate(raw_state),
                created_at=row["created_at"],
            )
        except Exception as exc:
            raise CheckpointError("Unable to load workflow checkpoint") from exc

    def invalidate_after(self, workflow_id: str, revision: int) -> int:
        try:
            with self.connection.cursor() as cursor:
                cursor.execute(
                    """
                    DELETE FROM workflow_checkpoints
                    WHERE workflow_id = %s AND revision > %s
                      AND workflow_id IN (
                          SELECT workflow_id FROM workflow_runs WHERE owner_id = %s
                      )
                    """,
                    (workflow_id, revision, self.owner_id),
                )
                removed = cursor.rowcount
                cursor.execute(
                    """
                    UPDATE workflow_runs
                    SET revision = %s,
                        state = (
                            SELECT state FROM workflow_checkpoints
                            WHERE workflow_id = %s AND revision = %s
                        ),
                        status = (
                            SELECT state->>'workflow_status' FROM workflow_checkpoints
                            WHERE workflow_id = %s AND revision = %s
                        ),
                        updated_at = NOW()
                    WHERE workflow_id = %s AND owner_id = %s
                    """,
                    (
                        revision,
                        workflow_id,
                        revision,
                        workflow_id,
                        revision,
                        workflow_id,
                        self.owner_id,
                    ),
                )
            self.connection.commit()
            return removed
        except Exception as exc:
            self.connection.rollback()
            raise CheckpointError("Unable to invalidate checkpoints") from exc
