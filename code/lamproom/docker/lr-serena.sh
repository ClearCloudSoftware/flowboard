#!/bin/sh
# Serena with Lamproom's config (/opt/serena) from a home it may write: a box's root is read-only, its /tmp is not.
# The language servers are baked into the image, so nothing is downloaded: a shell step's box is offline.
set -e
home=/tmp/serena
mkdir -p "$home"
[ -e "$home/language_servers" ] || ln -s /opt/serena/language_servers "$home/language_servers"
[ -e "$home/serena_config.yml" ] || cp /opt/serena/serena_config.yml "$home/serena_config.yml"
SERENA_HOME="$home" exec serena "$@"
