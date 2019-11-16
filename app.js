// Read Configs
const devices = require('./.config/devices.json')
const { passwordhash } = require('./.config/auth.json')
const allowed_codes = (() => {
		try { return require('./allowed_codes.json') }
		catch (e) { return []; }})()

// Dependencies
const express = require('express');
const bodyParser = require('body-parser');
const util = require('util');
const exec = util.promisify(require('child_process').exec);
const { scryptSync, randomBytes } = require('crypto')
const { Mutex } = require('async-mutex')

// Build up app
const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.set('view engine', 'pug')

const {smarthome} = require('actions-on-google');

const hash = (pw) => scryptSync(pw, "", 16).toString("hex")

const sendCode = (() => {
	const mutex = new Mutex()
	return function(code, protocol, pulselength) {
		pulselength = pulselength || ""
		mutex.runExclusive(() => exec(`codesend ${code} ${protocol} ${pulselength}`))
	}
})();

function checkToken(header)
{
	token = header["authorization"].substr(7)
	result = allowed_codes.includes(token)
	return result
}

const auth_fail = (id) => ({
		requestId: id,
		payload: {
			errorCode: "authFailure"
		}
	})

app.get("/auth", (req, res) => {
	res.render("auth", {})
})

app.post("/auth", (req, res) => {
	if (hash(req.body.pw) === passwordhash) {
		const code = randomBytes(32).toString("hex")
		allowed_codes.push(code)
		fs.writeFile("./allowed_codes.json",
			JSON.stringify(allowed_codes, null, 4),
			(e) => (e || console.log("Updated allowed_codes.json")))
	    const result = req.query.redirect_uri + `?code=${code}&state=` + req.query.state
		res.redirect(result)
	} else {
		res.redirect("/auth")
	}
})

app.all("/token", (request, response) => {
    const grantType = request.query.grant_type
        ? request.query.grant_type
        : request.body.grant_type;
	const code = request.query.code
        ? request.query.code
        : request.body.code;

    const HTTP_STATUS_OK = 200;

    let obj = {}
    if (grantType === 'authorization_code') {
        obj = {
            token_type: 'bearer',
            access_token: code
        };
    }
    response.status(HTTP_STATUS_OK).json(obj);
})

home = smarthome({debug: false})

home.onSync((body, headers) => {
	console.log(headers)
	if (!checkToken(headers)) return auth_fail(body.requestId)

    let devices_reply = []
    for (id in devices) {
        let device = devices[id]
        devices_reply.push(Object.assign(
			{},
			{
	            id: id,
	            name: {
	                defaultNames: [device.name],
	                name: device.name,
	                nicknames: [device.name]
	            },
	            willReportState: true
	        },
			device.ghome))
    }
    console.log(`Sync: ${devices_reply.length} devices sent`)
    return {
        requestId: body.requestId,
        payload: {
            agentUserId: '123',
            devices: devices_reply,
        },
    };
})


home.onQuery((body, headers) => {
	if (!checkToken(headers)) return auth_fail(body.requestId)

    const {requestId} = body;
    const payload = {
        devices: {},
    };
    const queryPromises = [];
    const intent = body.inputs[0];
    for (const device of intent.payload.devices)
    {
        console.log(`Status of ${device.id} queried`)
        payload.devices[device.id] = {
            on: devices[device.id]["on"] || false
        };
    }
    return {
        requestId: requestId,
        payload: payload,
    };
});

home.onExecute(async (body, headers) => {
	if (!checkToken(headers)) return auth_fail(body.requestId)

    const {requestId} = body;
    // Execution results are grouped by status
    const result = {
        ids: [requestId],
        status: 'SUCCESS',
        states: {
            online: true,
        },
    };

    var commands = body.inputs[0].payload.commands

    for (input of body.inputs)
    {
        var commands = input.payload.commands
        for (command of commands)
        {
            for (device of command.devices)
            {
                for (exe of command.execution)
                {
                    if (exe.command === "action.devices.commands.OnOff") {
						let dev = devices[device.id]
                        if (exe.params.on == true) {
                            console.log(`Command: turn on ${device.id}`)
                            dev["on"] = true
                            sendCode(dev.code_on, dev.protocol, dev.pulselength)
                        } else {
                            console.log(`Command: turn off ${device.id}`)
                            dev["on"] = false
                            sendCode(dev.code_off, dev.protocol, dev.pulselength)
                        }
                    }
                }
            }
        }
    }

    return {
        requestId: requestId,
        payload: {
            commands: [result],
        },
    };
});

home.onDisconnect((body) => {
	console.log("Disconnect:")
	console.log(body)
	return {}
})

app.use("/smarthome", home)

module.exports = app
