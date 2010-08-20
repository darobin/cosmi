
// TODO
//  X wrap all requests to add a "cosmi" field to them where we do our stuff, use a filter
//  X create a wrapper filter that apps can have that can add to wrappers. It
//    has to be called before delegates of course
//  X get the configuration, and build it based on environment
//  X get port supported
//  X in the templates, always expose a "cosmi" object with some useful info.
//  X encoding bug in the pipeline somewhere!!!!!
//  - need to figure out how to handle the model part of this whole thing too
//  - each app ought to define its own admin space, and /admin is just something that
//    maps to them nicely (this means the admin.js module in rbk is just a mapper)
//  - auth: the setup is dynamic but it would be nice to have centralised control
//    over auth, such as stating that something is protected only once (on the thing
//    itself maybe) and leaving it to someone else to actually decide what runs the
//    auth. Mull this over a little. Perhaps we could push to an array that's set up
//    for auth/authz (I think thats' how Connect works it)
//  - use a common Mongo instance for everyone, with just the DB changing — it's easier
//    to manage
//  - it'd be nice to have a way of including "libraries" of pretty much anything,
//    including templates and CSS, in a way that's easy to share. Maybe an app's
//    vendor space could somehow be linked in.
//  - the root module in rbk should just be a thin wrapper around a content.js app
//    that handles versioned document editing
//  - test with vows (and some HTTP lib?)
//  - would be nice to support some form of model versioning. We can detect changes given that
//    we load them ourselves and they're simple data structures. We could run a special update
//    method (given both the old and the new model definitions) whenever we detect a change.
//  - need a way of making subrequests that don't go straight to the browser
//  - add configuration fields for log format and locations
//  - static.js needs (through wrapping or specific selection I guess) to handle X-Sendfile and
//    the nginx equivalent

var connect = require("connect/lib/connect"),
    sys     = require("sys"),
    p       = sys.puts,
    fs      = require("fs"),
    TT      = require("template/lib/Template").Template,
    mongoose = require("mongoose/mongoose").Mongoose,
    _       = require("underscore/underscore")._;

// setup all the basic information for the core application
exports.setup = function (mod) {
    // CONFIGURATION SETUP
    var env = connect.createServer().env;
    var appBase = dirForModule(mod) + "apps/";
    var root = require(appBase + "root/root");
    var conf = _.extend((mod.exports.config.all || {}), (mod.exports.config[env.name] || {}));
    env.port = conf.port;
    var db;
    if (conf.db) db = mongoose.connect(conf.db);
    // BASE SERVER
    var server = connect.createServer([
        { filter: "log" },
        { filter: "body-decoder" },
        { module:   {
            handle: function (req, res, next) {
                req.cosmi = new Cosmi(conf, db);
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

// setup each application
exports.app = function (setup) {
    var mod = setup.module;
    if (!setup.delegates) setup.delegates = [];
    var id = mod.id.replace(/^.*?([^\/]+$)/, "$1");
    // XXX look inside the $app/models and load any js in there
    // if exists list *.js
    try {
        var modelDir = dirForModule(mod) + "models/";
        var files = fs.readdirSync(modelDir)
                      .filter(function (f) {
                          return /\.js$/.test(f); 
                      })
                      .forEach(function (f) {
                          var file = modelDir + f;
                          file = file.replace(/\.js$/, "");
                          var m = require(file);
                          if (m.model) mongoose.model(m.model.name, m.model.definition);
                          if (m.models && _.isArray(m.models)) {
                              m.models.forEach(function (mx) { mongoose.model(mx.model.name, mx.model.definition); })
                          }
                      });
    }
    catch (e) {
        // p(e);
    }
    var stack = [];
    // static
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
    // delegates
    for (var i = 0, n = setup.delegates.length; i < n; i++) {
        var deleg = setup.delegates[i];
        if (deleg.route && deleg.app) {
            var app = deleg.app;
            if (_.isFunction(app)) app = { handle: app };
            stack.push({ module: app, route: deleg.route });
        }
        else {
            sys.debug("Do not know how to process application with no route and app fields.");
        }
    }
    // context
    stack.push({ module: { handle: function (req, res, next) {
        req.cosmi.module = mod;
        next();
    }}});
    // admin
    // XXX  if there's an admin.js in the same directory and the conf is there, we need to load it
    //      it must have some attributes of a proper app (so some of the processing here)
    //      but it doesn't need to reload a bunch of things already done here
    //      perhaps it could just be cosmi.admin()
    // the app itself
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

var Cosmi = exports.Cosmi = function (conf, db) {
    this.wrappers = [];
    this.config = conf;
    this.db = db;
};
Cosmi.prototype = {
    wrappers:   null,
    module:     null,
    config:     null,
    render:     function (file, params) {
        if (!params) params = {};
        var dir = dirForModule(this.module) + "tt/";
        if (!/\.tt$/.test(file)) file += ".tt";
        return this.processTemplate(dir + file, params)
    },
    makeBlocks:    function () {
        var obj = this;
        return {
            "cosmi-parent":  function (ctx) {
                var stash = ctx.stash;
                // safely, if there's no parent we return the last thing, which is nice
                if (!obj.wrappers || obj.wrappers.length === 0) return stash.content;
                var wrap = obj.wrappers.pop();
                return obj.processTemplate(wrap, stash)
            },
        };
    },
    processTemplate:    function (file, params, dir) {
        var path;
        if (!dir) path = [file.replace(/[^\/]+$/, "")];
        else if (!_.isArray(dir)) path = [dir];
        else path = dir;
        var tt = new TT({ INCLUDE_PATH: path, BLOCKS: this.makeBlocks() });
        params.cosmi = this;
        return tt.process(fs.readFileSync(file, "utf8"), params);
    },
    // not here, not needed
    // defineModel:    function (name, defs) {
    //     return mongoose.model(name, defs);
    // },
    model:    function (name) {
        return this.db.model(name);
    },
};
