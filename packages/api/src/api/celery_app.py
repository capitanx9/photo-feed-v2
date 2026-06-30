"""Celery application factory."""

import os

import django
from celery import Celery

# Django needs to be configured before autodiscover_tasks can walk
# INSTALLED_APPS, since some apps' tasks.py imports models.
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "api.settings")
django.setup()

broker_url = os.environ.get("CELERY_BROKER_URL", "redis://localhost:6379/0")
result_backend = os.environ.get("CELERY_RESULT_BACKEND", "redis://localhost:6379/1")

celery_app = Celery("api", broker=broker_url, backend=result_backend)
# No packages= arg: defaults to settings.INSTALLED_APPS, which finds
# tasks.py inside every Django app (api, ai, …) automatically.
celery_app.autodiscover_tasks()

# Tests set CELERY_TASK_ALWAYS_EAGER=1 to run tasks inline; the worker
# process picks them up from Redis otherwise.
if os.environ.get("CELERY_TASK_ALWAYS_EAGER", "").lower() in ("1", "true", "yes"):
    celery_app.conf.task_always_eager = True
    celery_app.conf.task_eager_propagates = False
