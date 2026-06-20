"""Celery application factory."""

import os

from celery import Celery

broker_url = os.environ.get("CELERY_BROKER_URL", "redis://localhost:6379/0")
result_backend = os.environ.get("CELERY_RESULT_BACKEND", "redis://localhost:6379/1")

celery_app = Celery(__name__, broker=broker_url, backend=result_backend)
celery_app.autodiscover_tasks([__name__.rsplit(".", 1)[0]])
