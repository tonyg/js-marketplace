function count_uniq(xs) {
    var r = [];
    if (xs.length === 0) return [];
    var last = xs[0];
    var count = 1;
    function fin() {
	r.push([count, last]);
    }
    for (var i = 1; i < xs.length; i++) {
	if (xs[i] === last) {
	    count++;
	} else {
	    fin();
	    last = xs[i];
	    count = 1;
	}
    }
    fin();
    return r;
}

var G;
$(document).ready(function () {
    G = new Ground(function () {
	console.log('starting ground boot');
	// World.spawn(new Spy("GROUND", true));
	spawnDOMDriver();

	World.spawn({
	    boot: function () { this.updateState(); },
	    state: [],
	    nextState: [],
	    timer: false,
	    digestRoutes: function (rs) {
		var s = [];
		for (var i = 0; i < rs.length; i++) {
		    var p = rs[i].pattern;
		    if (p[0] !== "DOM" || p[1] !== "#spy-holder" || p[2] !== "spy") {
			s.push(JSON.stringify([p,
					       rs[i].isSubscription ? "sub" : "pub",
					       rs[i].level]));
		    }
		}
		s.sort();
		s = count_uniq(s);
		return s;
	    },
	    updateState: function () {
		var elts = ["ul"];
		for (var i = 0; i < this.state.length; i++) {
		    var r = this.state[i];
		    elts.push(["li", r[0], " × ", r[1]]);
		}
		World.updateRoutes([sub(__, 0, Infinity),
				    pub(__, 0, Infinity),
				    pub(["DOM", "#spy-holder", "spy", elts])]);
	    },
	    handleEvent: function (e) {
		if (e.type === "routes") {
		    this.nextState = this.digestRoutes(e.routes);
		    if (!this.timer) {
			var self = this;
			this.timer = setTimeout(World.wrap(function () {
			    if (JSON.stringify(self.nextState) !== JSON.stringify(self.state)) {
				self.state = self.nextState;
				self.updateState();
			    }
			    self.timer = false;
			}), 50);
		    }
		}
	    }
	});

	World.spawn({
	    handleEvent: function (e) {
		if (e.type === "message" && e.message[0] === "jQuery") {
		    World.send("bump_count");
		}
	    }
	}, [pub(["DOM", "#clicker-holder", "clicker",
		 ["button", ["span", {"style": "font-style: italic"}, "Click me!"]]]),
	    pub("bump_count"),
	    sub(["jQuery", "button.clicker", "click", __])]);

	World.spawn({
	    counter: 0,
	    boot: function () {
		this.updateState();
	    },
	    updateState: function () {
		World.updateRoutes([sub("bump_count"),
				    pub(["DOM", "#counter-holder", "counter",
					 ["div",
					  ["p", "The current count is: ", this.counter]]])]);
	    },
	    handleEvent: function (e) {
		if (e.type === "message" && e.message === "bump_count") {
		    this.counter++;
		    this.updateState();
		}
	    }
	});
    });
    G.startStepping();
});
