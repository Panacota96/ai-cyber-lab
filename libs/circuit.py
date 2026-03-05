from __future__ import annotations

import time
from dataclasses import dataclass


@dataclass
class CircuitState:
    failures: int = 0
    opened_until: float = 0.0


class CircuitBreaker:
    def __init__(self, name: str, failure_threshold: int = 3, reset_timeout_s: float = 30.0):
        self.name = name
        self.failure_threshold = failure_threshold
        self.reset_timeout_s = reset_timeout_s
        self.state = CircuitState()

    def allow(self) -> bool:
        now = time.monotonic()
        if self.state.opened_until <= now:
            return True
        return False

    def record_success(self) -> None:
        self.state.failures = 0
        self.state.opened_until = 0.0

    def record_failure(self) -> None:
        self.state.failures += 1
        if self.state.failures >= self.failure_threshold:
            self.state.opened_until = time.monotonic() + self.reset_timeout_s

    def snapshot(self) -> dict[str, float | int | str | bool]:
        now = time.monotonic()
        return {
            "name": self.name,
            "failures": self.state.failures,
            "open": self.state.opened_until > now,
            "seconds_until_half_open": max(0.0, self.state.opened_until - now),
        }
