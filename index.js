const pkg = require("./package.json")
const greenlock = require("greenlock-express")
const express = require("express")

const {external, local} = require("./app.js");

greenlock.init(() => ({
    package: {
        name: pkg.name,
        version: pkg.version
    },
    maintainerEmail: pkg.author,
    cluster: false
})).serve((glx) => {
    // protect the Google-facing API with SSL
    glx.serveApp(external);
})

// serve the local API directly
local.listen(8080, () => console.log("Local API started."));
