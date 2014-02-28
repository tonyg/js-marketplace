// DOM fragment display driver

function spawnDOMDriver() {
    var d = new DemandMatcher(["DOM", __, __, __], 0, {demandSideIsSubscription: false});
    d.onDemandIncrease = function (r) {
	var selector = r.pattern[1];
	var fragmentClass = r.pattern[2];
	var fragmentSpec = r.pattern[3];
	World.spawn(new DOMFragment(selector, fragmentClass, fragmentSpec),
		    [sub(["DOM", selector, fragmentClass, fragmentSpec]),
		     sub(["DOM", selector, fragmentClass, fragmentSpec], 0, 1)]);
    };
    World.spawn(d);
}

function DOMFragment(selector, fragmentClass, fragmentSpec) {
    this.selector = selector;
    this.fragmentClass = fragmentClass;
    this.fragmentSpec = fragmentSpec;
    this.nodes = this.buildNodes();
}

DOMFragment.prototype.boot = function () {
    var self = this;
    World.spawn(new World(function () {
	spawnJQueryDriver(self.selector+" > ."+self.fragmentClass, 1);
	World.spawn({
	    maxRouteCount: 0,
	    handleEvent: function (e) {
		if (e.type === "routes") {
		    this.maxRouteCount = Math.max(this.maxRouteCount, e.routes.length);
		    if (e.routes.length < this.maxRouteCount) {
			World.shutdownWorld();
		    }
		}
	    }
	}, [sub(["DOM", self.selector, self.fragmentClass, self.fragmentSpec], 1, 1)]);
    }));
};

DOMFragment.prototype.handleEvent = function (e) {
    if (e.type === "routes" && e.routes.length === 0) {
	for (var i = 0; i < this.nodes.length; i++) {
	    var n = this.nodes[i];
	    n.parentNode.removeChild(n);
	}
	World.exit();
    }
};

DOMFragment.prototype.interpretSpec = function (spec) {
    // Fragment specs are roughly JSON-equivalents of SXML.
    // spec ::== ["tag", {"attr": "value", ...}, spec, spec, ...]
    //         | ["tag", spec, spec, ...]
    //         | "cdata"
    if (typeof(spec) === "string" || typeof(spec) === "number") {
	return document.createTextNode(spec);
    } else if ($.isArray(spec)) {
	var tagName = spec[0];
	var hasAttrs = $.isPlainObject(spec[1]);
	var attrs = hasAttrs ? spec[1] : {};
	var kidIndex = hasAttrs ? 2 : 1;

	var n = document.createElement(tagName);
	for (var i = kidIndex; i < spec.length; i++) {
	    n.appendChild(this.interpretSpec(spec[i]));
	}
	return n;
    }
};

DOMFragment.prototype.buildNodes = function () {
    var self = this;
    var nodes = [];
    $(self.selector).each(function (index, domNode) {
	var n = self.interpretSpec(self.fragmentSpec);
	n.className = self.fragmentClass;
	domNode.appendChild(n);
	nodes.push(n);
    });
    return nodes;
};
