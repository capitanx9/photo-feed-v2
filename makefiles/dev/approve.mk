# Bulk-approve every pending Order — same effect as running the admin
# action on the full pending queryset. Wakes any wait-confirm long-poll.

.PHONY: dev-approve-all
dev-approve-all:
	$(DC_DEV) exec api python manage.py approve_orders
