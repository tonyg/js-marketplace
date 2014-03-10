function spawnRoutingTableWidget(selector, fragmentClass) {

    function sortedBy(xs, f) {
	var keys = [];
	var result = [];
	for (var i = 0; i < xs.length; i++) {
	    keys.push([f(xs[i]), i]);
	}
	keys.sort();
	for (var i = 0; i < xs.length; i++) {
	    result.push(xs[keys[i][1]]);
	}
	return result;
    }

    function count_uniqBy(xs, f) {
	var r = [];
	if (xs.length === 0) return [];
	var last = xs[0];
	var lastKey = f(xs[0]);
	var count = 1;
	function fin() {
	    r.push([count, last]);
	}
	for (var i = 1; i < xs.length; i++) {
	    var fi = f(xs[i]);
	    if (fi === lastKey) {
		count++;
	    } else {
		fin();
		last = xs[i];
		lastKey = fi;
		count = 1;
	    }
	}
	fin();
	return r;
    }

    World.spawn({
	boot: function () { this.updateState(); },

	state: [],
	nextState: [],
	timer: false,

	digestRoutes: function (rs) {
	    var s = [];
	    function key(r) { return JSON.stringify([r.pattern, r.level, r.isSubscription]); }
	    for (var i = 0; i < rs.length; i++) {
		var p = rs[i].pattern;
		if (p[0] !== "DOM" || p[1] !== selector || p[2] !== fragmentClass) {
		    s.push(rs[i]);
		}
	    }
	    s = sortedBy(s, key);
	    s = count_uniqBy(s, key);
	    return s;
	},

	updateState: function () {
	    var elts = ["ul", {"class": "routing-table"}];
	    for (var i = 0; i < this.state.length; i++) {
		var r = this.state[i];
		var levelstr;
		switch (r[1].level) {
		case 0: levelstr = "participant"; break;
		case 1: levelstr = "observer"; break;
		case 2: levelstr = "metaobserver"; break;
		default: levelstr = "level " + r[1].level; break;
		}
		var polarity = r[1].isSubscription ? "sub" : "pub";
		var pat = JSON.stringify(r[1].pattern).replace(/{"__":"__"}/g, '★');
		elts.push(["li",
			   ["span", {"class": "repeatcount"}, r[0]],
			   ["span", {"class": "times"}, " × "],
			   ["span", {"class": polarity + " route"},
			    ["span", {"class": "level", "data-level": r[1].level}, levelstr],
			    ["span", {"class": "polarity"}, polarity],
			    ["span", {"class": "pattern"}, pat]]]);
	    }
	    World.updateRoutes([sub(__, 0, Infinity),
				pub(__, 0, Infinity),
				pub(["DOM", selector, fragmentClass, elts])]);
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

}
