const util = require('util')
const exec = util.promisify(require('child_process').exec)
const wol = require('wakeonlan')

const mode_attribs = {
    availableModes: [{
        name: "state",
        name_values: [{
            name_synonym: ["Zustand", "Anheit"],
            lang: "de"
        }],
        settings: [{
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
        ],
        ordered: true
    }]
}

function putInStandby(device) {
    if (device.linux_host) {
        exec(`ssh ruediger@${device.linux_host} sudo systemctl suspend -i`).catch(console.log)
    }
}

function powerOff(device) {
    if (device.linux_host) {
        exec(`ssh ruediger@${device.linux_host} sudo systemctl poweroff -i`).catch(console.log)
    }
}

function wakeUp(device) {
    if (device.mac_addr) {
        wol(device.mac_addr).catch(console.log)
    }
}

module.exports = class Computer {
    sync(device) {
        return {
            id: id,
            name: {
                defaultNames: [device.name],
                name: device.name,
                nicknames: [device.name]
            },
            willReportState: true,
            traits: ["action.devices.traits.Modes"],
            type: "action.devices.types.HEATER",
            attributes: mode_attribs
        }
    }

    execute(execution, device) {
        for (let exe of execution) {
            if (exe.command === "action.devices.commands.SetModes") {
                let nextState = exe.params.updateModeSettings.state
                if (nextState == "standby") {
                    putInStandby(device)
                } else if (nextState == "off") {
                    powerOff(device)
                } else if (nextState == "on") {
                    wakeUp(device)
                } else {
                    console.log(`Unknown state ${nextState}`)
                }
                console.log(`Command: set ${device.name} into ${nextState}`)
                device["state"] = nextState
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
