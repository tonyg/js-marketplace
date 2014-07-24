// DOM fragment display driver
var Minimart = require("./minimart.js");
var World = Minimart.World;
var sub = Minimart.sub;
var pub = Minimart.pub;
var __ = Minimart.__;
var _$ = Minimart._$;

function spawnDOMDriver() {
    var d = new Minimart.DemandMatcher(["DOM", _$, _$, _$]);
    d.onDemandIncrease = function (captures) {
	var selector = captures[0];
	var fragmentClass = captures[1];
	var fragmentSpec = captures[2];
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
    var monitoring = sub(["DOM", self.selector, self.fragmentClass, self.fragmentSpec], 1, 2);
    World.spawn(new World(function () {
	Minimart.JQuery.spawnJQueryDriver(self.selector+" > ."+self.fragmentClass, 1);
	World.spawn({
	    handleEvent: function (e) {
		if (e.type === "routes") {
		    var level = e.gestalt.getLevel(1, 0); // find participant peers
		    if (!e.gestalt.isEmpty() && level.isEmpty()) {
			World.shutdownWorld();
		    }
		}
	    }
	}, [monitoring]);
    }));
};

DOMFragment.prototype.handleEvent = function (e) {
    if (e.type === "routes" && e.gestalt.isEmpty()) {
	for (var i = 0; i < this.nodes.length; i++) {
	    var n = this.nodes[i];
	    n.parentNode.removeChild(n);
	}
	World.exit();
    }
};

function isAttributes(x) {
    return (x instanceof Array) && ((x.length === 0) || (x[0] instanceof Array));
}

DOMFragment.prototype.interpretSpec = function (spec) {
    // Fragment specs are roughly JSON-equivalents of SXML.
    // spec ::== ["tag", {"attr": "value", ...}, spec, spec, ...]
    //         | ["tag", spec, spec, ...]
    //         | "cdata"
    if (typeof(spec) === "string" || typeof(spec) === "number") {
	return document.createTextNode(spec);
    } else if ($.isArray(spec)) {
	var tagName = spec[0];
	var hasAttrs = isAttributes(spec[1]);
	var attrs = hasAttrs ? spec[1] : {};
	var kidIndex = hasAttrs ? 2 : 1;

	// Wow! Such XSS! Many hacks! So vulnerability! Amaze!
	var n = document.createElement(tagName);
	for (var i = 0; i < attrs.length; i++) {
	    n.setAttribute(attrs[i][0], attrs[i][1]);
	}
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
	n.classList.add(self.fragmentClass);
	domNode.appendChild(n);
	nodes.push(n);
    });
    return nodes;
};

///////////////////////////////////////////////////////////////////////////

module.exports.spawnDOMDriver = spawnDOMDriver;
