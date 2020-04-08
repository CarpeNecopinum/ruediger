const util = require('util')
const exec = util.promisify(require('child_process').exec)
const magicpacket = require('./lib/magicpacket')
const fs = require('fs')

const activation_settings = [
	{
        setting_name: "off",
        setting_values: [{
            setting_synonym: ["Aus", "Tot"],
            lang: "de"
        }]
    },
    {
        setting_name: "standby",
        setting_values: [{
            setting_synonym: ["Standby", "Schlafend", "Bewusstlos"],
            lang: "de"
        }]
    },
    {
        setting_name: "on",
        setting_values: [{
            setting_synonym: ["An", "Läuft", "Lebendig"],
            lang: "de"
        }]
    }
]

function state_info(device) {
	return {
	    name: "state",
	    name_values: [{
	        name_synonym: ["Zustand", "Anheit"],
	        lang: "de"
	    }],
	    settings: [...activation_settings, ...os_settings(device)],
	    ordered: true
	}
}

function os_settings(device) {
	settings = []
	for (name in device.systems) {
		settings.push({
			setting_name: name,
			setting_values: [{
				setting_synonym: [name],
				lang: "de"
			}]
		})
	}
	return settings;
}

function putInStandby(device) {
    if (device.linux_host) {
        exec(`ssh ruediger@${device.linux_host} sudo systemctl suspend -i`).catch(console.log)
    }
    if (device.windows_host) {
	exec(`ssh '${device.windows_user}'@${device.windows_host} rundll32.exe powrprof.dll,SetSuspendState Standby`)
    }
}

function powerOff(device) {
    if (device.linux_host) {
        exec(`ssh ruediger@${device.linux_host} sudo systemctl poweroff -i`).catch(console.log)
    }
    if (device.windows_host) {
       	exec(`ssh '${device.windows_user}'@${device.windows_host} shutdown /s /t 3`).catch(console.log)
    }
}

function reboot(device) {
    if (device.linux_host) {
        exec(`ssh ruediger@${device.linux_host} sudo systemctl reboot -i`).catch(console.log)
    }
    if (device.windows_host) {
       	exec(`ssh '${device.windows_user}'@${device.windows_host} shutdown /r /t 3`).catch(console.log)
    }
}

function wakeUp(device) {
    if (device.mac_addr) {
        magicpacket(device.mac_addr).catch(console.log)
    }
}

const grubcfg = (entry) =>
`set next_entry="${entry}"
save_env next_entry

configfile /grub/grub.cfg
`

function rebootInto(device, system) {
	system_index = device.systems[system]
	fs.writeFile(
		device.grubfile,
		grubcfg(system_index),
		(e) => (e && console.log(e)))
	reboot(device)
}

module.exports = class Computer {
    sync(device) {
        result = {
            id: id,
            name: {
                defaultNames: [device.name],
                name: device.name,
                nicknames: [device.name]
            },
            willReportState: true,
            traits: ["action.devices.traits.Modes", "action.devices.traits.OnOff"],
            type: "action.devices.types.HEATER",
            attributes: {
				availableModes: [state_info(device)]
			}
        }
		console.log(JSON.stringify(result, null, 4));
		return result
    }

    execute(execution, device) {
        for (let exe of execution) {
            if (exe.command === "action.devices.commands.SetModes") {
				if (exe.params.updateModeSettings.state) {
	                let nextState = exe.params.updateModeSettings.state
	                if (nextState == "standby") {
	                    putInStandby(device)
	                } else if (nextState == "off") {
	                    powerOff(device)
	                } else if (nextState == "on") {
	                    wakeUp(device)
	                } else if (nextState in device.systems) {
						rebootInto(device, nextState)
	                } else {
						console.log(`Unknown state ${nextState}`)
					}
	                console.log(`Command: set ${device.name} into ${nextState}`)
	                device["state"] = nextState
				}
            }
        }
    }

    query(device) {
        return {
            on: (device["state"] == "on"),
            currentModeSettings: {
                state: (device["state"] || "off")
            }
        }
    }
}
