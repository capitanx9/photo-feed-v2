# AWS + workspace housekeeping.

.PHONY: aws-whoami install lock clean
aws-whoami:
	aws sts get-caller-identity --profile $(STAGE_PROFILE)

install:
	$(UV) sync

lock:
	$(UV) lock

clean:
	rm -rf __pycache__ .mypy_cache .pytest_cache .ruff_cache dist build *.egg-info .venv
	find . -name "*.pyc" -delete
