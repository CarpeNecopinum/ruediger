#!/usr/bin/node
if (process.argv.length !== 4) {
    console.log("Usage: switch.js device on/off")
    process.exit(0)
}

const [_, __, device, state] = process.argv

const fetch = require('node-fetch')
async function post_json(url, data) {
    if (typeof data != "string")
        data = JSON.stringify(data)

    return await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: data
    })
}

post_json("http://raspberrypi:8080/execute", {
    requestId: Date.now(),
    inputs: [
        {
            payload: {
                commands: [
                    {
                        devices: [
                            {
                                id: device
                            }
                        ],
                        execution: [
                            {
                                command: "action.devices.commands.OnOff",
                                params: {
                                    on: ["on", "1", "yes"].includes(state)
                                }
                            }
                        ]
                    }
                ]
            }
        }
    ]
})
