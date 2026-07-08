# Bulk-approve every pending Order on stage via synchronous SSM exec.

.PHONY: stage-approve-all
stage-approve-all:
	$(SSM_EXEC) --parameters 'command=["sudo docker exec host-web-1 python manage.py approve_orders"]'
