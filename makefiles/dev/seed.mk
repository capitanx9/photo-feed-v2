# Seed slices — see packages/api/src/posts/management/commands/seed.py.
#
# The full seed creates 5 users x 3 posts each, drops 2 items into each
# user's cart, and files a pending order per user. The scoped targets
# below share the same defaults but stop early.

.PHONY: dev-seed dev-seed-users dev-seed-posts dev-seed-carts dev-seed-orders
dev-seed:
	$(DC_DEV) exec api python manage.py seed --users 5 --posts 3

dev-seed-users:
	$(DC_DEV) exec api python manage.py seed --users 5 --posts 0 --skip-posts

dev-seed-posts:
	$(DC_DEV) exec api python manage.py seed --users 5 --posts 3 --skip-carts --skip-orders

dev-seed-carts:
	$(DC_DEV) exec api python manage.py seed --users 5 --posts 0 --skip-orders

dev-seed-orders:
	$(DC_DEV) exec api python manage.py seed --users 5 --posts 0 --skip-carts
