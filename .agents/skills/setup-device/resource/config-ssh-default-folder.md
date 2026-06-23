# SSH config snippet — set default folder on device login
#
# Add to ~/.ssh/config on the devel machine.
# Replace <device-hostname> and <folder-path> as needed.

Host <device-hostname>.local <device-hostname>
  HostName <device-hostname>.local
  User nv
  RemoteCommand cd <folder-path> && exec bash -l
  RequestTTY yes

# Example for device {DEVICE} with Localization_ws workspace:
# Host 192.168.55.1
#   HostName 192.168.55.1
#   User nv
#   RemoteCommand cd /home/nv/Localization_ws && exec bash -l
#   RequestTTY yes
