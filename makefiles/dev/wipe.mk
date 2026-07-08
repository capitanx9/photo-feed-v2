# Wipe slices — see packages/api/src/posts/management/commands/wipe.py.
#
# Two ladders:
#   seed-*      touch only @seed.local users (safe on stage too)
#   all-*       ignore email domain — real users get deleted
# Both preserve Django superusers unconditionally — wipe.py refuses to
# delete an is_superuser=True row, regardless of scope. `dev-wipe`
# nukes everything at once (still keeps superusers).

.PHONY: dev-wipe dev-wipe-seed dev-wipe-posts dev-wipe-carts dev-wipe-orders \
        dev-wipe-all-users dev-wipe-all-posts dev-wipe-all-carts dev-wipe-all-orders

dev-wipe:
	$(DC_DEV) exec api python manage.py wipe --scope all

dev-wipe-seed:
	$(DC_DEV) exec api python manage.py wipe --scope seed

dev-wipe-posts:
	$(DC_DEV) exec api python manage.py wipe --scope posts

dev-wipe-carts:
	$(DC_DEV) exec api python manage.py wipe --scope carts

dev-wipe-orders:
	$(DC_DEV) exec api python manage.py wipe --scope orders

dev-wipe-all-users:
	$(DC_DEV) exec api python manage.py wipe --scope all-users

dev-wipe-all-posts:
	$(DC_DEV) exec api python manage.py wipe --scope all-posts

dev-wipe-all-carts:
	$(DC_DEV) exec api python manage.py wipe --scope all-carts

dev-wipe-all-orders:
	$(DC_DEV) exec api python manage.py wipe --scope all-orders
