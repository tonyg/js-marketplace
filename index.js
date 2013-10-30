function Spy() {
}

Spy.prototype.boot = function () {
    World.updateRoutes([sub(__, 0, 1000), pub(__, 0, 1000)]);
};

Spy.prototype.handleEvent = function (e) {
    console.log("SPY", e);
};

function JQueryEventRouter(selector, eventName) {
    var self = this;
    this.selector = selector;
    this.eventName = eventName;
    this.handler =
	World.wrap(function (e) { World.send(["jQuery", self.selector, self.eventName, e]); });
    $(this.selector).on(this.eventName, this.handler);
}

JQueryEventRouter.prototype.handleEvent = function (e) {
    if (e.type === "routes" && e.routes.length === 0) {
	$(this.selector).off(this.eventName, this.handler);
	World.exit();
    }
};

function spawnJQueryDriver() {
    var d = new DemandMatcher(["jQuery", __, __, __]);
    d.onDemandIncrease = function (r) {
	var selector = r.pattern[1];
	var eventName = r.pattern[2];
	World.spawn(new JQueryEventRouter(selector, eventName),
		    [pub(["jQuery", selector, eventName, __]),
		     pub(["jQuery", selector, eventName, __], 0, 1)]);
    };
    World.spawn(d);
}

var g = new Ground(function () {
    console.log('starting ground boot');
    World.spawn(new Spy());
    spawnJQueryDriver();
    World.spawn({
	// step: function () { console.log('dummy step'); },
	boot: function () {
	    console.log('dummy boot');
	    World.updateRoutes([sub(["jQuery", "#testButton", "click", __]),
				sub(["jQuery", "#testButton2", "click", __]),
				sub(__, 1)]);
	    World.send({msg: 'hello outer world'}, 1);
	    World.send({msg: 'hello inner world'}, 0);
	    // World.spawn(new World(function () {
	    // 	World.spawn({
	    // 	    boot: function () {
	    // 		console.log('w1p1');
	    // 		World.updateRoutes([sub('w1p1')]);
	    // 	    },
	    // 	    handleEvent: function (e) { console.log('w1p1', e); }
	    // 	})
	    // }))
	    // World.spawn(new World(function () {
	    // 	World.spawn({
	    // 	    boot: function () {
	    // 		console.log('w2p2');
	    // 		World.updateRoutes([sub('w2p2')]);
	    // 	    },
	    // 	    handleEvent: function (e) { console.log('w2p2', e); }
	    // 	})
	    // }));
	},
	handleEvent: function (e) {
	    if (e.type === "message" && e.message[0] === "jQuery") {
		if (e.message[1] === "#testButton") {
		    console.log("got a click");
		    World.updateRoutes([sub(["jQuery", "#testButton2", "click", __])]);
		} else {
		    console.log("got a click 2");
		    // World.exit();
		}
	    }
	}
    });
});

g.startStepping();
