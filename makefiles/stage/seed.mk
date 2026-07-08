# Seed slices on stage via SSM send-command.

.PHONY: stage-seed stage-seed-users stage-seed-posts stage-seed-carts stage-seed-orders

stage-seed:
	$(SSM_EXEC) --parameters 'commands=["sudo docker exec host-web-1 python manage.py seed --users 5 --posts 3"]'

stage-seed-users:
	$(SSM_EXEC) --parameters 'commands=["sudo docker exec host-web-1 python manage.py seed --users 5 --posts 0 --skip-posts"]'

stage-seed-posts:
	$(SSM_EXEC) --parameters 'commands=["sudo docker exec host-web-1 python manage.py seed --users 5 --posts 3 --skip-carts --skip-orders"]'

stage-seed-carts:
	$(SSM_EXEC) --parameters 'commands=["sudo docker exec host-web-1 python manage.py seed --users 5 --posts 0 --skip-orders"]'

stage-seed-orders:
	$(SSM_EXEC) --parameters 'commands=["sudo docker exec host-web-1 python manage.py seed --users 5 --posts 0 --skip-carts"]'
