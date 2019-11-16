const pkg = require("./package.json")
const greenlock = require("greenlock-express")

greenlock.init(() => ({
    package: {
        name: pkg.name,
        version: pkg.version
    },
    maintainerEmail: pkg.author,
    cluster: false
})).serve((glx) => {
    var app = require("./app.js");
    glx.serveApp(app);
})
