"""Shared SSRF guard for the JD-extraction pipeline.

Two enforcement points use this, because a single check at the top isn't
enough:

1. graph.run_job_intelligence calls validate_public_url() once, before
   Playwright ever launches -- fast-fails on obviously bad input without
   paying for a browser launch.
2. agents._scrape_job_page installs is_request_url_safe() as a Playwright
   route handler covering EVERY request the page makes: the initial
   navigation, any server-side redirect (a public URL can 302 to an
   internal address), and any JS-initiated subresource fetch/XHR from
   within the rendered page (the browser process shares this backend's
   network reachability, so page script can otherwise probe internal
   services and the scraped HTML would carry the response back out).
   Re-resolving per request also narrows the DNS-rebinding TOCTOU window
   between the one-time validation and actual navigation.
"""
import ipaddress
import socket
from urllib.parse import urlparse

_BLOCKED_HOSTS = {"localhost", "metadata.google.internal"}


def is_public_host(host: str) -> bool:
    host = (host or "").lower()
    if not host or host in _BLOCKED_HOSTS:
        return False
    try:
        addresses = [ipaddress.ip_address(host)]
    except ValueError:
        try:
            addresses = [ipaddress.ip_address(item[4][0]) for item in socket.getaddrinfo(host, None)]
        except socket.gaierror:
            return False
    return not any(
        ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast
        for ip in addresses
    )


def validate_public_url(url: str) -> None:
    """Reject non-web and private-network targets before Playwright navigation."""
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ValueError("A complete HTTP or HTTPS URL is required.")
    if not is_public_host(parsed.hostname):
        raise ValueError("Private network URLs are not permitted.")


def is_request_url_safe(url: str) -> bool:
    """Boolean form for the Playwright route handler, which must always call
    route.continue_/abort and can never let an exception escape into
    Playwright's event loop."""
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"}:
        return False
    return bool(parsed.hostname) and is_public_host(parsed.hostname)
