
// NOTES
// ...

var connect = require("../vendor/connect/lib/connect"),
    sys     = require("sys");

exports.setup = function (mod) {
    var appBase = dirForModule(mod) + "apps/";
    var root = require(appBase + "root/root");
    // - get all the required configuration from the target module
    // - need a way of doing the dispatching just like in polity.coop
    mod.exports = connect.createServer([
        // XXX needs to get configuration from config.js
        { filter: "log" },
        // conditional GET, cache, gzip
        // { filter: "conditional-get" },
        // { filter: "cache" },
        // { filter: "gzip" },
        { module: root },
        // prettify exceptions
        { filter: "error-handler" }
    ]);
};

exports.app = function (mod, delegates, cb) {
    // this is where we add the app specific static handling
    // and also set up the configuration for templates, compilers
    var id = mod.id.replace(/^.*?([^\/]+$)/, "$1");
    var stack = [];
    //  XXX handle x-sendfile (or the nginx equivalent) based on configuration
    stack.push({ provider: "static", root: dirForModule(mod) + "/static", route: "/static/" + id  });
    //  XXX we might wrap apps so as to call next ourselves (which is nice if it isn't called) and to
    //      provide our own context object for template services and the such
    for (var i = 0, n = delegates.length; i < n; i++) {
        var deleg = delegates[i];
        if (deleg.route && deleg.app) {
            stack.push({ module: deleg.app, route: deleg.route });
        }
        else {
            sys.debug("Do not know how to process application with no route and app fields.");
        }
    }
    stack.push({ module: { handle: cb } });
    mod.exports = connect.createServer(stack);
};

function dirForModule (mod) {
    if (!mod) return;
    return mod.filename.replace(/[^\/]+\.js$/, "");
};
