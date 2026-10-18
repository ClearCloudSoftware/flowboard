#!/bin/sh
# A stuck CLI: ignores SIGTERM, so only SIGKILL ends it.
trap '' TERM
while :; do sleep 1; done
