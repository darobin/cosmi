
var sys = require("sys"),
    puts = sys.puts,
    ins = sys.inspect,
    _   = require("underscore/underscore")._;


exports.model = {
    name:       "CosmiUser",
    definition: {
        properties: ["username", "password", { roles: [] }],
        cast:   {
            username:   String,
            password:   String,
        },
        indexes:    [[{ username: 1 }, {unique: true}]],
        methods:    {
        },
        static: {
            authenticate:    function (username, password, cb) {
                this.find({ username: username, password: password}).one(function (user) { if (cb) cb(user); }, true);
            },
        }
    },
};

