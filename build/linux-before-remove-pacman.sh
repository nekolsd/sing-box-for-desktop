#!/bin/bash

if [ -d /run/systemd/system ]; then
    systemctl disable --now sing-box-daemon-nekolsd.service || true
fi
