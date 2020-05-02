// Read Configs
const devices = require('./.config/devices.json')
const { passwordhash } = require('./.config/auth.json')
const allowed_codes = (() => {
		try { return require('./allowed_codes.json') }
		catch (e) { return []; }})()

// Dependencies
const express = require('express')
const bodyParser = require('body-parser')
const fs = require('fs')
const { scryptSync, randomBytes } = require('crypto')
const { smarthome } = require('actions-on-google');

// Build up app
const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.set('view engine', 'pug')

const localApi = express();
localApi.use(bodyParser.json());
localApi.get('/', (req, res) => res.send("<h1>Ruediger Local API</h1>"))

const actors = (() => {
	let names = new Set()
	for (id in devices) names.add(devices[id].actor)
	let result = {}
	for (name of names.values()) {
		console.log("Loading actor " + name + " ...")
		let klass = require('./actors/' + name + ".js")
		result[name] = new klass()
	}
	return result;
})();

const hash = (pw) => scryptSync(pw, "", 16).toString("hex")

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

function syncResponse(requestId) {
    let devices_reply = []
    for (id in devices) {
        let device = devices[id]
		let actor = actors[device.actor]
		devices_reply.push(actor.sync(device))
    }
    console.log(`Sync: ${devices_reply.length} devices sent`)
    return {
        requestId: requestId,
        payload: {
            agentUserId: '123',
            devices: devices_reply,
        },
    };
}

home.onSync((body, headers) => {
	console.log("onSync requested")
	if (!checkToken(headers)) return auth_fail(body.requestId)
	return syncResponse(body.requestId)
})

localApi.post('/sync', (req, res) => res.json(syncResponse(req.body.requestId)))


function queryResponse(body) {
	//console.log(JSON.stringify(body, undefined, 4))
    const {requestId} = body;
    const payload = {
        devices: {},
    };
    const queryPromises = [];
    const intent = body.inputs[0];
    for (const device of intent.payload.devices)
    {
		let dev = devices[device.id]
		let actor = actors[dev.actor]
        console.log(`Status of ${device.id} queried`)
		payload.devices[device.id] = actor.query(dev)
    }
    return {
        requestId: requestId,
        payload: payload,
    };
}

home.onQuery((body, headers) => {
	if (!checkToken(headers)) return auth_fail(body.requestId)
	return queryResponse(body);
});

localApi.post('/query', (req, res) => res.json(queryResponse(req.body)))


async function handleExecute(body) {
    const {requestId} = body;
    // Execution results are grouped by status
    const result = {
        ids: [],
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
				let dev = devices[device.id]
				let actor = actors[dev.actor]
				actor.execute(command.execution, dev)
				result.ids.push(device.id)
            }
        }
    }

    return {
        requestId: requestId,
        payload: {
            commands: [result],
        },
    };
}

home.onExecute(async (body, headers) => {
	if (!checkToken(headers)) return auth_fail(body.requestId)
	return await handleExecute(body);
});

localApi.post('/execute', async (req, res) => res.json(await handleExecute(req.body)))

localApi.post('/settings', async (req, res) => {
	await fs.promises.writeFile('settings.json', JSON.stringify(req.body));
})

localApi.get('/settings', async (req, res) => {
	let state = await fs.promises.readFile('settings.json')
	res.json(JSON.parse(state))
})



home.onDisconnect((body) => {
	console.log("Disconnect:")
	console.log(body)
	return {}
})

app.use("/smarthome", home)

module.exports = {
	external: app,
	local: localApi
}
