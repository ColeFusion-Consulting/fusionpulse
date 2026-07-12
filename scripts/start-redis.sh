#!/bin/bash
# Start Redis if not already running
if ! pgrep -x redis-server > /dev/null 2>&1; then
  redis-server /etc/redis/redis.conf
fi
