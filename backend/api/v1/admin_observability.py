"""Admin-only observability views built on top of the existing Prometheus
registry (observability/metrics.py) and the request ring buffer
(observability/middleware.py) -- no external Grafana/Prometheus server
required to actually SEE this data; those remain a valid option later for
long-term retention/alerting, this just makes what's already collected
visible from inside the app itself."""
from typing import Any, Dict
from fastapi import APIRouter, Depends
from observability.metrics import registry
from observability.middleware import get_recent_requests
from api.v1.admin_abuse import verify_admin_access

router = APIRouter(prefix="/admin/observability", tags=["admin-observability"])


def _collect_samples() -> Dict[str, list]:
    """Flatten every collector's samples into name -> [sample, ...]."""
    by_name: Dict[str, list] = {}
    for metric in registry.collect():
        for sample in metric.samples:
            by_name.setdefault(sample.name, []).append(sample)
    return by_name


@router.get("/summary")
async def observability_summary(admin_user: Dict[str, Any] = Depends(verify_admin_access)):
    samples = _collect_samples()

    totals = {"requests": 0, "2xx": 0, "4xx": 0, "5xx": 0, "1xx": 0, "3xx": 0}
    # method+route -> {status_class -> count}
    per_route_status: Dict[tuple, Dict[str, int]] = {}
    for sample in samples.get("http_requests_total", []):
        method = sample.labels.get("method", "?")
        route = sample.labels.get("route", "?")
        status_class = sample.labels.get("status_class", "?")
        count = int(sample.value)
        totals["requests"] += count
        if status_class in totals:
            totals[status_class] += count
        key = (method, route)
        per_route_status.setdefault(key, {})
        per_route_status[key][status_class] = per_route_status[key].get(status_class, 0) + count

    # method+route -> {sum, count} from the latency histogram
    per_route_latency: Dict[tuple, Dict[str, float]] = {}
    for sample in samples.get("http_request_duration_seconds_sum", []):
        key = (sample.labels.get("method", "?"), sample.labels.get("route", "?"))
        per_route_latency.setdefault(key, {})["sum"] = sample.value
    for sample in samples.get("http_request_duration_seconds_count", []):
        key = (sample.labels.get("method", "?"), sample.labels.get("route", "?"))
        per_route_latency.setdefault(key, {})["count"] = sample.value

    all_keys = set(per_route_status) | set(per_route_latency)
    routes = []
    for method, route in all_keys:
        status_counts = per_route_status.get((method, route), {})
        latency = per_route_latency.get((method, route), {})
        count = latency.get("count") or sum(status_counts.values())
        avg_ms = (latency["sum"] / latency["count"] * 1000) if latency.get("count") else None
        total = sum(status_counts.values())
        errors = status_counts.get("4xx", 0) + status_counts.get("5xx", 0)
        routes.append({
            "method": method,
            "route": route,
            "total": total,
            "2xx": status_counts.get("2xx", 0),
            "3xx": status_counts.get("3xx", 0),
            "4xx": status_counts.get("4xx", 0),
            "5xx": status_counts.get("5xx", 0),
            "avg_ms": round(avg_ms, 1) if avg_ms is not None else None,
            "error_rate": round(errors / total * 100, 2) if total else 0.0,
        })
    routes.sort(key=lambda r: r["total"], reverse=True)

    in_progress = sum(
        int(s.value) for s in samples.get("http_requests_in_progress", [])
    )

    def _first_value(name: str, default: float = 0.0) -> float:
        vals = samples.get(name, [])
        return vals[0].value if vals else default

    cpu_seconds = _first_value("process_cpu_seconds_total")
    memory_bytes = _first_value("process_resident_memory_bytes")
    virtual_bytes = _first_value("process_virtual_memory_bytes")
    open_fds = _first_value("process_open_fds")
    start_time = _first_value("process_start_time_seconds")
    import time as _time
    uptime_seconds = (_time.time() - start_time) if start_time else None

    total_requests = totals["requests"]
    error_total = totals["4xx"] + totals["5xx"]

    return {
        "totals": {
            **totals,
            "error_rate": round(error_total / total_requests * 100, 2) if total_requests else 0.0,
            "in_progress": in_progress,
        },
        "routes": routes,
        "resources": {
            "cpu_seconds_total": round(cpu_seconds, 2),
            "memory_mb": round(memory_bytes / (1024 * 1024), 1),
            "virtual_memory_mb": round(virtual_bytes / (1024 * 1024), 1),
            "open_fds": int(open_fds),
            "uptime_seconds": round(uptime_seconds) if uptime_seconds is not None else None,
        },
    }


@router.get("/requests")
async def observability_recent_requests(
    limit: int = 200,
    admin_user: Dict[str, Any] = Depends(verify_admin_access),
):
    return {"requests": get_recent_requests(min(max(limit, 1), 1000))}
