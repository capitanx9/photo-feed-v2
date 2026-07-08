# Interactive SSM Session Manager tunnel to the stage EC2 host.
# Everything else in stage/ pushes commands non-interactively via
# send-command; use this when you need to poke around by hand.

.PHONY: stage-shell
stage-shell:
	$(SSM_RUN)
