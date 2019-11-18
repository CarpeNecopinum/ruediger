# What is this?

An application to run on your Raspberry-Pi (or similar device) to control 433MHz devices (radio controlled outlets or lamp sockets) via Google Home, without any additional cloud magic in between.


# Allowing the server to open ports 80 and 443 as non-root:

`sudo setcap 'cap_net_bind_service=+ep' $(which node)`

# Setup as a systemd service:

Modify `ruediger.service` and copy it to `/etc/systemd/system/`. Then enable the service with `systemctl enable ruediger` and start it with `systemctl start ruediger`.
