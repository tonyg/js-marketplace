// Wake detector - notices when something (such as
// suspension/sleeping!) has caused periodic activities to be
// interrupted, and warns others about it
// Inspired by http://blog.alexmaccaw.com/javascript-wake-event
var Minimart = require("./minimart.js");
var World = Minimart.World;
var sub = Minimart.sub;
var pub = Minimart.pub;
var __ = Minimart.__;

function WakeDetector(period) {
    this.message = "wake";
    this.period = period || 10000;
    this.mostRecentTrigger = +(new Date());
    this.timerId = null;
}

WakeDetector.prototype.boot = function () {
    var self = this;
    World.updateRoutes([pub(this.message)]);
    this.timerId = setInterval(World.wrap(function () { self.trigger(); }), this.period);
};

WakeDetector.prototype.handleEvent = function (e) {};

WakeDetector.prototype.trigger = function () {
    var now = +(new Date());
    if (now - this.mostRecentTrigger > this.period * 1.5) {
	World.send(this.message);
    }
    this.mostRecentTrigger = now;
};

module.exports.WakeDetector = WakeDetector;
