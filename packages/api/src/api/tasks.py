"""Background tasks."""

from .celery_app import celery_app


@celery_app.task
def add(x: int, y: int) -> int:
    """Example task — call with: add.delay(2, 3)."""
    return x + y
