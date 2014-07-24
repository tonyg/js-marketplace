var Minimart = require("./minimart.js");
var Route = Minimart.Route;
var World = Minimart.World;
var sub = Minimart.sub;
var pub = Minimart.pub;
var __ = Minimart.__;
var _$ = Minimart._$;

function spawnRoutingTableWidget(selector, fragmentClass, domWrap, observationLevel) {
    observationLevel = observationLevel || 10;
    // ^ arbitrary: should be Infinity, when route.js supports it. TODO
    domWrap = domWrap || Minimart.DOM.defaultWrapFunction;

    World.spawn({
	boot: function () { this.updateState(); },

	state: Route.emptyGestalt.serialize(),
	nextState: Route.emptyGestalt.serialize(),
	timer: false,

	localGestalt: (sub(       domWrap(selector, fragmentClass, __), 0, 2)
		       .union(pub(domWrap(selector, fragmentClass, __), 0, 2))
		       .telescoped()),

	digestGestalt: function (g) {
	    return g.stripLabel().erasePath(this.localGestalt).serialize();
	},

	updateState: function () {
	    var elts = ["pre", Route.deserializeGestalt(this.state).pretty()];
	    World.updateRoutes([sub(__, 0, observationLevel),
				pub(__, 0, observationLevel),
				pub(domWrap(selector, fragmentClass, elts))]);
	},

	handleEvent: function (e) {
	    var self = this;
	    if (e.type === "routes") {
		self.nextState = self.digestGestalt(e.gestalt);
		if (self.timer) {
		    clearTimeout(self.timer);
		    self.timer = false;
		}
		self.timer = setTimeout(World.wrap(function () {
		    if (JSON.stringify(self.nextState) !== JSON.stringify(self.state)) {
			self.state = self.nextState;
			self.updateState();
		    }
		    self.timer = false;
		}), 50);
	    }
	}
    });

}

module.exports.spawnRoutingTableWidget = spawnRoutingTableWidget;
