const { Mutex } = require('async-mutex')
const util = require('util')
const exec = util.promisify(require('child_process').exec)

const senderMutex = new Mutex()

function sendCode(code, protocol, pulselength) {
	protocol = protocol || 4
	pulselength = pulselength || ""
	senderMutex.runExclusive(() => exec(`codesend ${code} ${protocol} ${pulselength}`))
}

module.exports = class Sender433 {
	execute(execution, device) {
		for (let exe of execution)
		{
			if (exe.command === "action.devices.commands.OnOff") {
				if (exe.params.on == true) {
					console.log(`Command: turn on ${device.name}`)
					device["on"] = true
					sendCode(device.code_on, device.protocol, device.pulselength)
				} else {
					console.log(`Command: turn off ${device.name}`)
					device["on"] = false
					sendCode(device.code_off, device.protocol, device.pulselength)
				}
			}
		}
	}

	query(device) {
        return {
            on: device["on"] || false
        }
	}

	sync(device) {
		return {
			id: id,
			name: {
				defaultNames: [device.name],
				name: device.name,
				nicknames: [device.name]
			},
			willReportState: true,
            traits: ["action.devices.traits.OnOff"],
			type: (device.type || "action.devices.types.OUTLET")
		}
	}
}
