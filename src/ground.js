/* Ground interface */
var Minimart = require("./minimart.js");
var World = Minimart.World;

function Ground(bootFn) {
    var self = this;
    this.stepperId = null;
    World.withWorldStack([[this, -1]], function () {
	self.world = new World(bootFn);
    });
}

Ground.prototype.step = function () {
    var self = this;
    return World.withWorldStack([[this, -1]], function () {
	return self.world.step();
    });
};

Ground.prototype.checkPid = function (pid) {
    if (pid !== -1) console.error("Weird pid in Ground markPidRunnable", pid);
};

Ground.prototype.markPidRunnable = function (pid) {
    this.checkPid(pid);
    this.startStepping();
};

Ground.prototype.startStepping = function () {
    var self = this;
    if (this.stepperId) return;
    if (this.step()) {
	this.stepperId = setTimeout(function () {
	    self.stepperId = null;
	    self.startStepping();
	}, 0);
    }
};

Ground.prototype.stopStepping = function () {
    if (this.stepperId) {
	clearTimeout(this.stepperId);
	this.stepperId = null;
    }
};

Ground.prototype.enqueueAction = function (pid, action) {
    this.checkPid(pid);
    if (action.type === 'routes') {
	if (!action.gestalt.isEmpty()) {
	    console.error("You have subscribed to a nonexistent event source.",
			  action.gestalt.pretty());
	}
    } else {
	console.error("You have sent a message into the outer void.", action);
    }
};

///////////////////////////////////////////////////////////////////////////

module.exports.Ground = Ground;
