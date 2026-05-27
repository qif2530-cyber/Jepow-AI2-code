import subprocess
import json

lldb_script = """
target create "native/jepow-cycles/build-cycles-standalone/intern/cycles/app/Blender.app/Contents/MacOS/jepow-cycles-daemon"
process launch -i test_daemon_input.txt
bt
quit
"""

with open('lldb_commands.txt', 'w') as f:
    f.write(lldb_script)

result = subprocess.run(['lldb', '-s', 'lldb_commands.txt'], capture_output=True, text=True)
print(result.stdout)
print(result.stderr)
