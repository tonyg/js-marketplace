function spawnRoutingTableWidget(selector, fragmentClass, observationLevel) {
    observationLevel = observationLevel || 10;
    // ^ arbitrary: should be Infinity, when route.js supports it. TODO

    World.spawn({
	boot: function () { this.updateState(); },

	state: route.emptyGestalt.serialize(),
	nextState: route.emptyGestalt.serialize(),
	timer: false,

	localGestalt: (sub(       ["DOM", selector, fragmentClass, __], 0, 2)
		       .union(pub(["DOM", selector, fragmentClass, __], 0, 2))
		       .telescoped()),

	digestGestalt: function (g) {
	    return g.stripLabel().erasePath(this.localGestalt).serialize();
	},

	updateState: function () {
	    var elts = ["ul", {"class": "routing-table"},
			["li", ["pre", route.deserializeGestalt(this.state).pretty()]]];
	    World.updateRoutes([sub(__, 0, observationLevel),
				pub(__, 0, observationLevel),
				pub(["DOM", selector, fragmentClass, elts])]);
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
