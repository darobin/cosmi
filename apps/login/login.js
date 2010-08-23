
var sys = require("sys"),
    puts = sys.puts,
    ins = sys.inspect;

require("cosmi").app({
    module:     module,
    wrappers:   false,
    app:    function  (req, res, next) {
        // on GET, just return the login box
        // on POST, run the auth and return JSON indicating success or failure, with a cookie
    }
});
