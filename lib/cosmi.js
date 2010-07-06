
// TODO
//  X wrap all requests to add a "cosmi" field to them where we do our stuff, use a filter
//  X create a wrapper filter that apps can have that can add to wrappers. It
//    has to be called before delegates of course
//  X get the configuration, and build it based on environment
//  X get port supported
//  - in the templates, always expose a "cosmi" object with some useful info.
//    Instead of the parent-wrap pseudo wrapper, this can point to the parent
//    correctly at runtime with cosmi.parentWrapper
//  - auth: the setup is dynamic but it would be nice to have centralised control
//    over auth, such as stating that something is protected only once (on the thing
//    itself maybe) and leaving it to someone else to actually decide what runs the
//    auth. Mull this over a little. Perhaps we could push to an array that's set up
//    for auth/authz (I think thats' how Connect works it)
//  - need to figure out how to handle the model part of this whole thing too
//  - it'd be nice to have a way of including "libraries" of pretty much anything,
//    including templates and CSS, in a way that's easy to share. Maybe an app's
//    vendor space could somehow be linked in.
//  - each app ought to define its own admin space, and /admin is just something that
//    maps to them nicely
//  - the root module in rbk should just be a thin wrapper around a content.js app
//    that handles versioned document editing
//  - use a common Mongo instance for everyone, with just the DB changing — it's easier
//    to manage
//  - test with vows (and some HTTP lib? Ramble?)

var connect = require("../vendor/connect/lib/connect"),
    sys     = require("sys"),
    _       = require("../vendor/underscore/underscore")._;

exports.setup = function (mod) {
    sys.puts(sys.inspect());
    var env = connect.createServer().env;
    var appBase = dirForModule(mod) + "apps/";
    var root = require(appBase + "root/root");
    var conf = _.extend((mod.exports.config.all || {}), (mod.exports.config[env.name] || {}));
    env.port = conf.port;
    var server = connect.createServer([
        // XXX needs to get configuration from config.js
        { filter: "log" },
        { module:   {
            handle: function (req, res, next) {
                req.cosmi = new Cosmi(conf);
                next();
            }
        }},
        // conditional GET, cache, gzip
        // { filter: "conditional-get" },
        // { filter: "cache" },
        // { filter: "gzip" },
        { module: root },
        { filter: "error-handler" }
    ]);
    _.extend(server, mod.exports);
    mod.exports = server;
};

exports.app = function (setup) {
    // this is where we add the app specific static handling
    // and also set up the configuration for templates, compilers
    var mod = setup.module;
    if (!setup.delegates) setup.delegates = [];
    var id = mod.id.replace(/^.*?([^\/]+$)/, "$1");
    var stack = [];
    //  XXX handle x-sendfile (or the nginx equivalent) based on configuration: wrap static.js
    stack.push({ provider: "static", root: dirForModule(mod) + "/static", route: "/static/" + id  });
    //  wrapper templates
    if (setup.wrappers) {
        var ws = setup.wrappers;
        var func;
        if (_.isArray(ws)) {
            func = function (req, res, next) {
                for (var i = 0, n = ws.length; i < n; i++) req.cosmi.wrappers.push(ttForModule(mod, ws[i]));
                next();
            };
        }
        else if (_.isFunction(ws)) {
            func = function (req, res, next) {
                var wraps = ws(req, res);
                if (wraps) {
                    for (var i = 0, n = wraps.length; i < n; i++)
                        req.cosmi.wrappers.push(ttForModule(mod, wraps[i]));
                }
                else { // return falsy causes the list to be killed
                    req.cosmi.wrappers = [];
                }
                next();
            };
        }
        stack.push({ module: { handle: func }});
    }
    //  XXX we might wrap apps if we need to, not sure
    for (var i = 0, n = setup.delegates.length; i < n; i++) {
        var deleg = setup.delegates[i];
        if (deleg.route && deleg.app) {
            stack.push({ module: deleg.app, route: deleg.route });
        }
        else {
            sys.debug("Do not know how to process application with no route and app fields.");
        }
    }
    stack.push({ module: { handle: setup.app } });
    var server = connect.createServer(stack);
    _.extend(server, mod.exports);
    mod.exports = server;
};

function dirForModule (mod) {
    if (!mod) return;
    return mod.filename.replace(/[^\/]+\.js$/, "");
};

function ttForModule (mod, tt) {
    // XXX maybe we should normalise the path?
    if (!/\.tt$/.test(tt)) tt += ".tt";
    return dirForModule(mod) + "tt/" + tt;
}

var Cosmi = exports.Cosmi = function (conf) {
    this.wrappers = [];
    this.config = conf;
};
Cosmi.prototype = {
    test:   "Cosmi is cool!",
    wrappers:   null,
};
