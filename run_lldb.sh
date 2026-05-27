#!/bin/bash
lldb native/jepow-cycles/build-cycles-standalone/intern/cycles/app/Blender.app/Contents/MacOS/jepow-cycles-daemon << 'LLDB_EOF'
settings set target.input-path test_daemon_input.txt
run --stdio
bt
quit
LLDB_EOF
