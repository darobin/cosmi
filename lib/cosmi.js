
// NOTES
//  createServer can be used for sub-apps, it responds to handle()

var connect = require("../vendor/connect/lib/connect"),
    sys     = require("sys");

exports.setup = function (mod) {
    var appBase = dirForModule(mod) + "apps/";
    var root = require(appBase + "root/root");
    // get all the required configuration from the target module
    //  need to get a module that does for static:
    //      /static/$app-name/...
    //  and can handle x-sendfile (or the nginx equivalent)
    //  need a way of doing the dispatching just like in polity.coop
    // set a server up
    mod.exports = connect.createServer([
        // XXX needs to get configuration from config.js
        { filter: "log" },
        // conditional GET, cache, gzip
        // { filter: "conditional-get" },
        // { filter: "cache" },
        // { filter: "gzip" },
        { module: root },
        // static
        // {provider: "static", root: __dirname + "/public"},
        // prettify exceptions
        { filter: "error-handler" }
    ]);
};

exports.app = function (mod, cb) {
    // this is where we add the app specific static handling
    // and also set up the configuration for templates, compilers
    var id = mod.id.replace(/^.*?([^\/]+$)/, "$1");
    mod.exports = connect.createServer([
        { provider: "static", root: dirForModule(mod) + "/static", route: "/static/" + id  },
        { module: {
            handle:     function (req, res, next) {
                res.writeHead(200, { 'Content-Type': 'text/plain' });
                res.end("Application root being called");
                next();
            }
        }}
    ])
};

function dirForModule (mod) {
    if (!mod) return;
    return mod.filename.replace(/[^\/]+\.js$/, "");
};
