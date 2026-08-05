"""
backend/observability/remote_write.py
─────────────────────────────────────────────────────────────────────────────
Pushes the existing Prometheus registry (observability/metrics.py) to Grafana
Cloud's hosted Prometheus (Mimir) on an interval, using the standard
remote_write protocol.

Why hand-rolled protobuf instead of a library: the only maintained PyPI
package for this pulls in grpcio-tools, which force-upgrades `protobuf` to a
major version incompatible with google-ai-generativelanguage/grpcio-status
(both already pinned <6 elsewhere in this project) -- installing it broke
those. The remote_write wire format (WriteRequest -> TimeSeries -> Label /
Sample) is a handful of simple length-delimited/varint fields, cheap enough
to encode by hand and avoid the dependency conflict entirely.

Disabled (no-op) unless GRAFANA_CLOUD_PROM_REMOTE_WRITE_URL is set.
"""

from __future__ import annotations

import asyncio
import base64
import logging
import struct
import time
from typing import Iterable, Optional

import cramjam
import httpx

from observability.config import (
    METRICS_ENABLED,
    GRAFANA_CLOUD_PROM_REMOTE_WRITE_URL,
    GRAFANA_CLOUD_PROM_USERNAME,
    GRAFANA_CLOUD_PROM_API_KEY,
    GRAFANA_CLOUD_PROM_PUSH_INTERVAL_SECONDS,
)

logger = logging.getLogger("tailr4u-api.remote_write")

_ticker_task: Optional[asyncio.Task] = None


# ──────────────────────────────────────────────────────────────────────────
# Minimal protobuf wire-format encoding for prometheus.WriteRequest
# (see https://github.com/prometheus/prometheus/blob/main/prompb/{remote,types}.proto)
# ──────────────────────────────────────────────────────────────────────────
def _varint(n: int) -> bytes:
    out = bytearray()
    while True:
        b = n & 0x7F
        n >>= 7
        if n:
            out.append(b | 0x80)
        else:
            out.append(b)
            return bytes(out)


def _tag(field_number: int, wire_type: int) -> bytes:
    return _varint((field_number << 3) | wire_type)


def _length_delimited(field_number: int, payload: bytes) -> bytes:
    return _tag(field_number, 2) + _varint(len(payload)) + payload


def _encode_label(name: str, value: str) -> bytes:
    # message Label { string name = 1; string value = 2; }
    body = _length_delimited(1, name.encode("utf-8")) + _length_delimited(2, value.encode("utf-8"))
    return body


def _encode_sample(value: float, timestamp_ms: int) -> bytes:
    # message Sample { double value = 1; int64 timestamp = 2; }
    body = _tag(1, 1) + struct.pack("<d", value)
    body += _tag(2, 0) + _varint(timestamp_ms)
    return body


def _encode_timeseries(labels: dict, value: float, timestamp_ms: int) -> bytes:
    # message TimeSeries { repeated Label labels = 1; repeated Sample samples = 2; }
    body = b""
    for name, val in labels.items():
        body += _length_delimited(1, _encode_label(name, val))
    body += _length_delimited(2, _encode_sample(value, timestamp_ms))
    return body


def _encode_write_request(series: Iterable[bytes]) -> bytes:
    # message WriteRequest { repeated TimeSeries timeseries = 1; }
    body = b""
    for ts_bytes in series:
        body += _length_delimited(1, ts_bytes)
    return body


def _valid_label_value(v) -> Optional[str]:
    if v is None:
        return None
    return str(v)


def build_write_request(registry) -> bytes:
    """Flatten every collected Prometheus sample into one remote_write
    WriteRequest. Each exposition-format sample (already broken out per
    label-set by prometheus_client, including histogram buckets/_sum/_count)
    becomes its own single-point TimeSeries at `now`."""
    now_ms = int(time.time() * 1000)
    series_blobs = []
    for metric in registry.collect():
        for sample in metric.samples:
            labels = {"__name__": sample.name}
            for k, v in sample.labels.items():
                sv = _valid_label_value(v)
                if sv is not None:
                    labels[k] = sv
            series_blobs.append(_encode_timeseries(labels, float(sample.value), now_ms))
    return _encode_write_request(series_blobs)


async def push_metrics_once() -> bool:
    """Encode + snappy-compress + POST the current registry snapshot to
    Grafana Cloud. Returns True on a 2xx response, False otherwise. Never
    raises -- observability operations must not affect request handling."""
    if not GRAFANA_CLOUD_PROM_REMOTE_WRITE_URL:
        return False

    from observability.metrics import registry

    try:
        payload = build_write_request(registry)
        compressed = bytes(cramjam.snappy.compress_raw(payload))

        auth = base64.b64encode(
            f"{GRAFANA_CLOUD_PROM_USERNAME}:{GRAFANA_CLOUD_PROM_API_KEY}".encode("utf-8")
        ).decode("ascii")

        headers = {
            "Content-Type": "application/x-protobuf",
            "Content-Encoding": "snappy",
            "X-Prometheus-Remote-Write-Version": "0.1.0",
            "Authorization": f"Basic {auth}",
        }

        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                GRAFANA_CLOUD_PROM_REMOTE_WRITE_URL,
                content=compressed,
                headers=headers,
            )

        if resp.status_code // 100 != 2:
            logger.warning(
                f"[REMOTE_WRITE] Grafana Cloud rejected push: {resp.status_code} {resp.text[:300]}"
            )
            return False
        return True
    except Exception as exc:
        logger.warning(f"[REMOTE_WRITE] Push failed: {exc}")
        return False


async def run_remote_write_ticker():
    """Continuous background worker pushing metrics to Grafana Cloud on an
    interval. No-op loop (just sleeps) when remote_write isn't configured, so
    it's always safe to start."""
    if not METRICS_ENABLED or not GRAFANA_CLOUD_PROM_REMOTE_WRITE_URL:
        logger.info(
            "[REMOTE_WRITE] Disabled (METRICS_ENABLED=false or GRAFANA_CLOUD_PROM_REMOTE_WRITE_URL not set)."
        )
        return

    logger.info(
        f"[REMOTE_WRITE] Pushing metrics to Grafana Cloud every {GRAFANA_CLOUD_PROM_PUSH_INTERVAL_SECONDS}s."
    )
    while True:
        await push_metrics_once()
        await asyncio.sleep(GRAFANA_CLOUD_PROM_PUSH_INTERVAL_SECONDS)


def start_remote_write_ticker():
    """Start the background push ticker. Call once from the FastAPI app's
    lifespan, after the event loop is running."""
    global _ticker_task
    if _ticker_task is None or _ticker_task.done():
        try:
            loop = asyncio.get_running_loop()
            _ticker_task = loop.create_task(run_remote_write_ticker())
        except RuntimeError:
            pass
