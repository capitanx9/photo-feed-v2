# Wipe slices on stage via SSM AWS-StartInteractiveCommand — synchronous,
# streams output, returns in a few seconds.
#
# Seed-scoped variants force --stage-safe so wipe.py refuses any
# all-* scope. Django superusers are preserved unconditionally by
# wipe.py itself, so `stage-wipe-all-users` still leaves the admin in
# place — it just clears every real and demo account.

.PHONY: stage-wipe-seed stage-wipe-posts stage-wipe-carts stage-wipe-orders \
        stage-wipe-all-users stage-wipe-all-posts stage-wipe-all-carts stage-wipe-all-orders

stage-wipe-seed:
	$(SSM_EXEC) --parameters 'command=["sudo docker exec host-web-1 python manage.py wipe --scope seed --stage-safe"]'

stage-wipe-posts:
	$(SSM_EXEC) --parameters 'command=["sudo docker exec host-web-1 python manage.py wipe --scope posts --stage-safe"]'

stage-wipe-carts:
	$(SSM_EXEC) --parameters 'command=["sudo docker exec host-web-1 python manage.py wipe --scope carts --stage-safe"]'

stage-wipe-orders:
	$(SSM_EXEC) --parameters 'command=["sudo docker exec host-web-1 python manage.py wipe --scope orders --stage-safe"]'

stage-wipe-all-users:
	$(SSM_EXEC) --parameters 'command=["sudo docker exec host-web-1 python manage.py wipe --scope all-users"]'

stage-wipe-all-posts:
	$(SSM_EXEC) --parameters 'command=["sudo docker exec host-web-1 python manage.py wipe --scope all-posts"]'

stage-wipe-all-carts:
	$(SSM_EXEC) --parameters 'command=["sudo docker exec host-web-1 python manage.py wipe --scope all-carts"]'

stage-wipe-all-orders:
	$(SSM_EXEC) --parameters 'command=["sudo docker exec host-web-1 python manage.py wipe --scope all-orders"]'
