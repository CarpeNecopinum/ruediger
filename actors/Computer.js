const util = require('util')
const magicpacket = require('./lib/magicpacket')
const fs = require('fs')
const exec = util.promisify(require('child_process').exec)
// const exec = (cmd) => new Promise((resolve) => {
// 	console.log("Would now execute " + cmd)
// 	resolve();
// })

const activation_settings = [
	{
        setting_name: "off",
        setting_values: [{
            setting_synonym: ["Aus", "Herunterfahren", "Tot"],
            lang: "de"
        }]
    },
    {
        setting_name: "on",
        setting_values: [{
            setting_synonym: ["An", "Hochfahren", "Läuft", "Lebendig"],
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
        setting_name: "reboot",
        setting_values: [{
            setting_synonym: ["Neustart"],
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

function activation_mode_info(device) {
	return {
		name: "activation",
		name_values: [{
			name_synonym: ["Aktiv"],
			lang: "de"
		}],
		settings: activation_settings,
		ordered: true
	}
}

function os_mode_info(device) {
	return {
		name: "os",
		name_values: [{
			name_synonym: ["OS"],
			lang: "de"
		}],
		settings: os_settings(device),
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
	settings.push({
		setting_name: "unknown",
		setting_values: [{
			setting_synonym: ["unbekannt"],
			lang: "de"
		}]
	})
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

function switchOs(device, system) {
	system_index = device.systems[system]
	fs.writeFile(
		device.grubfile,
		grubcfg(system_index),
		(e) => (e && console.log(e)))
}

module.exports = class Computer {
    sync(device) {
        const result = {
            id: id,
            name: {
                defaultNames: [device.name],
                name: device.name,
                nicknames: [device.name]
            },
            willReportState: true,
            //traits: ["action.devices.traits.Modes", "action.devices.traits.OnOff"],
			traits: ["action.devices.traits.Modes"],
            type: "action.devices.types.HEATER",
            attributes: {
				//availableModes: [state_info(device)]
				availableModes: [activation_mode_info(device), os_mode_info(device)]
			}
        }
		return result
    }

    execute(execution, device) {
        for (let exe of execution) {
            if (exe.command === "action.devices.commands.SetModes") {
				if (exe.params.updateModeSettings.activation) {
	                let nextState = exe.params.updateModeSettings.activation
	                if (nextState == "standby") {
	                    putInStandby(device)
	                } else if (nextState == "off") {
	                    powerOff(device)
	                } else if (nextState == "on") {
	                    wakeUp(device)
					} else if (nextState == "reboot") {
						nextState = "on"
						reboot(device)
	                } else {
						console.log(`Unknown state ${nextState}`)
					}
	                console.log(`Command: set ${device.name} into ${nextState}`)
	                device["activation"] = nextState
				}
				if (exe.params.updateModeSettings.os) {
					let nextOs = exe.params.updateModeSettings.os
					if (nextOs in device.systems) {
						switchOs(device, nextOs)
	                } else {
						console.log(`Unknown OS ${nextOs}`)
					}
					device["os"] = nextOs
				}
            }
        }
    }

    query(device) {
        return {
            currentModeSettings: {
				activation: (device["activation"] || "off"),
                os: (device["os"] || "unknown")
            }
        }
    }
}
