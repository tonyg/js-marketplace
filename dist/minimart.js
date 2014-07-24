!function(e){if("object"==typeof exports)module.exports=e();else if("function"==typeof define&&define.amd)define(e);else{var f;"undefined"!=typeof window?f=window:"undefined"!=typeof global?f=global:"undefined"!=typeof self&&(f=self),f.Minimart=e()}}(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(_dereq_,module,exports){
// DOM fragment display driver
var Minimart = _dereq_("./minimart.js");
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

	// Wow! Such XSS! Many hacks! So vulnerability! Amaze!
	var n = document.createElement(tagName);
	for (var attr in attrs) {
	    if (attrs.hasOwnProperty(attr)) {
		n.setAttribute(attr, attrs[attr]);
	    }
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

},{"./minimart.js":4}],2:[function(_dereq_,module,exports){
// JQuery event driver
var Minimart = _dereq_("./minimart.js");
var World = Minimart.World;
var sub = Minimart.sub;
var pub = Minimart.pub;
var __ = Minimart.__;
var _$ = Minimart._$;

function spawnJQueryDriver(baseSelector, metaLevel) {
    metaLevel = metaLevel || 0;
    var d = new Minimart.DemandMatcher(["jQuery", _$, _$, __], metaLevel,
				       {demandSideIsSubscription: true});
    d.onDemandIncrease = function (captures) {
	var selector = captures[0];
	var eventName = captures[1];
	World.spawn(new JQueryEventRouter(baseSelector, selector, eventName, metaLevel),
		    [pub(["jQuery", selector, eventName, __], metaLevel),
		     pub(["jQuery", selector, eventName, __], metaLevel, 1)]);
    };
    World.spawn(d);
}

function JQueryEventRouter(baseSelector, selector, eventName, metaLevel) {
    var self = this;
    this.baseSelector = baseSelector || null;
    this.selector = selector;
    this.eventName = eventName;
    this.metaLevel = metaLevel || 0;
    this.preventDefault = (this.eventName.charAt(0) !== "+");
    this.handler =
	World.wrap(function (e) {
	    World.send(["jQuery", self.selector, self.eventName, e], self.metaLevel);
	    if (self.preventDefault) e.preventDefault();
	    return !self.preventDefault;
	});
    this.computeNodes().on(this.preventDefault ? this.eventName : this.eventName.substring(1),
			   this.handler);
}

JQueryEventRouter.prototype.handleEvent = function (e) {
    if (e.type === "routes" && e.gestalt.isEmpty()) {
	this.computeNodes().off(this.eventName, this.handler);
	World.exit();
    }
};

JQueryEventRouter.prototype.computeNodes = function () {
    if (this.baseSelector) {
	return $(this.baseSelector).children(this.selector).addBack(this.selector);
    } else {
	return $(this.selector);
    }
};

///////////////////////////////////////////////////////////////////////////

module.exports.spawnJQueryDriver = spawnJQueryDriver;

},{"./minimart.js":4}],3:[function(_dereq_,module,exports){
module.exports = _dereq_("./minimart.js");

module.exports.DOM = _dereq_("./dom-driver.js");
module.exports.JQuery = _dereq_("./jquery-driver.js");
module.exports.RoutingTableWidget = _dereq_("./routing-table-widget.js");
module.exports.WebSocket = _dereq_("./websocket-driver.js");

module.exports.Spy = _dereq_("./spy.js").Spy;
module.exports.WakeDetector = _dereq_("./wake-detector.js").WakeDetector;

},{"./dom-driver.js":1,"./jquery-driver.js":2,"./minimart.js":4,"./routing-table-widget.js":6,"./spy.js":7,"./wake-detector.js":8,"./websocket-driver.js":9}],4:[function(_dereq_,module,exports){
var Route = _dereq_("./route.js");

///////////////////////////////////////////////////////////////////////////

// TODO: trigger-guards as per minimart

/*---------------------------------------------------------------------------*/
/* Events and Actions */

var __ = Route.__;
var _$ = Route._$;

function sub(pattern, metaLevel, level) {
    return Route.simpleGestalt(false, pattern, metaLevel, level);
}

function pub(pattern, metaLevel, level) {
    return Route.simpleGestalt(true, pattern, metaLevel, level);
}

function spawn(behavior, initialGestalts) {
    return { type: "spawn",
	     behavior: behavior,
	     initialGestalt: Route.gestaltUnion(initialGestalts || []) };
}

function updateRoutes(gestalts) {
    return { type: "routes", gestalt: Route.gestaltUnion(gestalts) };
}

function pendingRoutingUpdate(aggregate, affectedSubgestalt, knownTarget) {
    return { type: "pendingRoutingUpdate",
	     aggregate: aggregate,
	     affectedSubgestalt: affectedSubgestalt,
	     knownTarget: knownTarget };
}

function sendMessage(m, metaLevel, isFeedback) {
    return { type: "message",
	     metaLevel: (metaLevel === undefined) ? 0 : metaLevel,
	     message: m,
	     isFeedback: (isFeedback === undefined) ? false : isFeedback };
}

function shutdownWorld() {
    return { type: "shutdownWorld" };
}

/*---------------------------------------------------------------------------*/
/* Configurations */

function World(bootFn) {
    this.alive = true;
    this.eventQueue = [];
    this.runnablePids = {};
    this.partialGestalt = Route.emptyGestalt; // Only gestalt from local processes
    this.fullGestalt = Route.emptyGestalt ;; // partialGestalt unioned with downwardGestalt
    this.processTable = {};
    this.tombstones = {};
    this.downwardGestalt = Route.emptyGestalt;
    this.processActions = [];
    this.asChild(-1, bootFn, true);
}

/* Class state / methods */

World.nextPid = 0;

World.stack = [];

World.current = function () {
    return World.stack[World.stack.length - 1][0];
};

World.activePid = function () {
    return World.stack[World.stack.length - 1][1];
};

World.send = function (m, metaLevel, isFeedback) {
    World.current().enqueueAction(World.activePid(), sendMessage(m, metaLevel, isFeedback));
};

World.updateRoutes = function (gestalts) {
    World.current().enqueueAction(World.activePid(), updateRoutes(gestalts));
};

World.spawn = function (behavior, initialGestalts) {
    World.current().enqueueAction(World.activePid(), spawn(behavior, initialGestalts));
};

World.exit = function (exn) {
    World.current().kill(World.activePid(), exn);
};

World.shutdownWorld = function () {
    World.current().enqueueAction(World.activePid(), shutdownWorld());
};

World.withWorldStack = function (stack, f) {
    var oldStack = World.stack;
    World.stack = stack;
    var result = null;
    try {
	result = f();
    } catch (e) {
	World.stack = oldStack;
	throw e;
    }
    World.stack = oldStack;
    return result;
};

World.wrap = function (f) {
    var savedStack = World.stack.slice();
    return function () {
	var actuals = arguments;
	return World.withWorldStack(savedStack, function () {
	    var result = World.current().asChild(World.activePid(), function () {
		return f.apply(null, actuals);
	    });
	    for (var i = World.stack.length - 1; i >= 0; i--) {
		World.stack[i][0].markPidRunnable(World.stack[i][1]);
	    }
	    return result;
	});
    };
};

/* Instance methods */

World.prototype.enqueueAction = function (pid, action) {
    this.processActions.push([pid, action]);
};

// The code is written to maintain the runnablePids set carefully, to
// ensure we can locally decide whether we're inert or not without
// having to search the whole deep process tree.
World.prototype.isInert = function () {
    return this.eventQueue.length === 0
	&& this.processActions.length === 0
	&& Route.is_emptySet(this.runnablePids);
};

World.prototype.markPidRunnable = function (pid) {
    this.runnablePids[pid] = [pid];
};

World.prototype.step = function () {
    this.dispatchEvents();
    this.performActions();
    this.stepChildren();
    return this.alive && !this.isInert();
};

World.prototype.asChild = function (pid, f, omitLivenessCheck) {
    if (!(pid in this.processTable) && !omitLivenessCheck) {
	console.warn("World.asChild eliding invocation of dead process", pid);
	return;
    }

    World.stack.push([this, pid]);
    var result = null;
    try {
	result = f();
    } catch (e) {
	this.kill(pid, e);
    }
    if (World.stack.pop()[0] !== this) {
	throw new Error("Internal error: World stack imbalance");
    }
    return result;
};

World.prototype.kill = function (pid, exn) {
    if (exn && exn.stack) {
	console.log("Process exited", pid, exn, exn.stack);
    } else {
	console.log("Process exited", pid, exn);
    }
    var p = this.processTable[pid];
    if (p && p.behavior.trapexit) {
	this.asChild(pid, function () { return p.behavior.trapexit(exn); });
    }
    delete this.processTable[pid];
    if (p) {
	if (exn) {
	    p.exitReason = exn;
	    this.tombstones[pid] = p;
	}
	this.applyAndIssueRoutingUpdate(p.gestalt, Route.emptyGestalt);
    }
};

World.prototype.stepChildren = function () {
    var pids = this.runnablePids;
    this.runnablePids = {};
    for (var pid in pids) {
	var p = this.processTable[pid];
	if (p && p.behavior.step /* exists, haven't called it yet */) {
	    var childBusy = this.asChild(pid | 0, function () { return p.behavior.step() });
	    if (childBusy) this.markPidRunnable(pid);
	}
    }
};

World.prototype.performActions = function () {
    var queue = this.processActions;
    this.processActions = [];
    var item;
    while ((item = queue.shift()) && this.alive) {
	this.performAction(item[0], item[1]);
    }
};

World.prototype.dispatchEvents = function () {
    var queue = this.eventQueue;
    this.eventQueue = [];
    var item;
    while ((item = queue.shift())) {
	this.dispatchEvent(item);
    }
};

World.prototype.performAction = function (pid, action) {
    switch (action.type) {
    case "spawn":
	var pid = World.nextPid++;
	var newGestalt = action.initialGestalt.label(pid);
	this.processTable[pid] = { gestalt: newGestalt, behavior: action.behavior };
	if (action.behavior.boot) {
	    this.asChild(pid, function () { action.behavior.boot() });
	    this.markPidRunnable(pid);
	}
	this.applyAndIssueRoutingUpdate(Route.emptyGestalt, newGestalt, pid);
	break;
    case "routes":
	if (pid in this.processTable) {
	    // it may not be: this might be the routing update from a
	    // kill of the process
	    var oldGestalt = this.processTable[pid].gestalt;
	    var newGestalt = action.gestalt.label(pid|0);
	    // ^ pid|0: convert pid from string (table key!) to integer
	    this.processTable[pid].gestalt = newGestalt;
	    this.applyAndIssueRoutingUpdate(oldGestalt, newGestalt, pid);
	}
	break;
    case "message":
	if (action.metaLevel === 0) {
	    this.eventQueue.push(action);
	} else {
	    World.send(action.message, action.metaLevel - 1, action.isFeedback);
	}
	break;
    case "shutdownWorld":
	this.alive = false; // force us to stop doing things immediately
	World.exit();
	break;
    default:
	var exn = new Error("Action type " + action.type + " not understood");
	exn.action = action;
	throw exn;
    }
};

World.prototype.updateFullGestalt = function () {
    this.fullGestalt = this.partialGestalt.union(this.downwardGestalt);
};

World.prototype.issueLocalRoutingUpdate = function (affectedSubgestalt, knownTarget) {
    this.eventQueue.push(pendingRoutingUpdate(this.fullGestalt,
					      affectedSubgestalt,
					      knownTarget));
};

World.prototype.applyAndIssueRoutingUpdate = function (oldg, newg, knownTarget) {
    knownTarget = typeof knownTarget === 'undefined' ? null : knownTarget;
    this.partialGestalt = this.partialGestalt.erasePath(oldg).union(newg);
    this.updateFullGestalt();
    this.issueLocalRoutingUpdate(oldg.union(newg), knownTarget);
    World.updateRoutes([this.partialGestalt.drop()]);
};

World.prototype.dispatchEvent = function (e) {
    switch (e.type) {
    case "pendingRoutingUpdate":
	var pids = e.affectedSubgestalt.match(e.aggregate);
	if (e.knownTarget !== null) pids.unshift(e.knownTarget);
	for (var i = 0; i < pids.length; i++) {
	    var pid = pids[i];
	    if (pid === "out") console.warn("Would have delivered a routing update to environment");
	    var p = this.processTable[pid];
	    if (p) {
		var g = e.aggregate.filter(p.gestalt);
		this.asChild(pid, function () { p.behavior.handleEvent(updateRoutes([g])) });
		this.markPidRunnable(pid);
	    }
	}
	break;

    case "message":
	var pids = this.partialGestalt.matchValue(e.message, e.metaLevel, e.isFeedback);
	for (var i = 0; i < pids.length; i++) {
	    var pid = pids[i];
	    var p = this.processTable[pid];
	    this.asChild(pid, function () { p.behavior.handleEvent(e) });
	    this.markPidRunnable(pid);
	}
	break;

    default:
	var exn = new Error("Event type " + e.type + " not dispatchable");
	exn.event = e;
	throw exn;
    }
};

World.prototype.handleEvent = function (e) {
    switch (e.type) {
    case "routes":
	var oldDownward = this.downwardGestalt;
	this.downwardGestalt = e.gestalt.label("out").lift();
	this.updateFullGestalt();
	this.issueLocalRoutingUpdate(oldDownward.union(this.downwardGestalt), null);
	break;
    case "message":
	this.eventQueue.push(sendMessage(e.message, e.metaLevel + 1, e.isFeedback));
	break;
    default:
	var exn = new Error("Event type " + e.type + " not understood");
	exn.event = e;
	throw exn;
    }
};

/* Debugging, management, and monitoring */

World.prototype.processTree = function () {
    var kids = [];
    for (var pid in this.processTable) {
	var p = this.processTable[pid];
	if (p.behavior instanceof World) {
	    kids.push([pid, p.behavior.processTree()]);
	} else {
	    kids.push([pid, p]);
	}
    }
    for (var pid in this.tombstones) {
	kids.push([pid, this.tombstones[pid]]);
    }
    kids.sort();
    return kids;
};

World.prototype.textProcessTree = function (ownPid) {
    var lines = [];

    function dumpProcess(prefix, pid, p) {
	if (p instanceof Array) {
	    lines.push(prefix + '--+ ' + pid);
	    for (var i = 0; i < p.length; i++) {
		dumpProcess(prefix + '  |', p[i][0], p[i][1]);
	    }
	    lines.push(prefix);
	} else {
	    var label = p.behavior.name || p.behavior.constructor.name || '';
	    var tombstoneString = p.exitReason ? ' (EXITED: ' + p.exitReason + ') ' : '';
	    lines.push(prefix + '-- ' + pid + ': ' + label +
		       tombstoneString +
		       JSON.stringify(p.behavior, function (k, v) {
			   return k === 'name' ? undefined : v;
		       }));
	}
    }

    dumpProcess('', ownPid || '', this.processTree());
    return lines.join('\n');
};

World.prototype.clearTombstones = function () {
    this.tombstones = {};
    for (var pid in this.processTable) {
	var p = this.processTable[pid];
	if (p.behavior instanceof World) {
	    p.behavior.clearTombstones();
	}
    }
};

/*---------------------------------------------------------------------------*/
/* Utilities: matching demand for some service */

function DemandMatcher(projection, metaLevel, options) {
    options = $.extend({
	demandLevel: 0,
	supplyLevel: 0,
	demandSideIsSubscription: false
    }, options);
    this.pattern = Route.projectionToPattern(projection);
    this.projectionSpec = Route.compileProjection(projection);
    this.metaLevel = metaLevel | 0;
    this.demandLevel = options.demandLevel;
    this.supplyLevel = options.supplyLevel;
    this.demandSideIsSubscription = options.demandSideIsSubscription;
    this.onDemandIncrease = function (captures) {
	console.error("Unhandled increase in demand for route", captures);
    };
    this.onSupplyDecrease = function (captures) {
	console.error("Unhandled decrease in supply for route", captures);
    };
    this.currentDemand = {};
    this.currentSupply = {};
}

DemandMatcher.prototype.boot = function () {
    var observerLevel = 1 + Math.max(this.demandLevel, this.supplyLevel);
    World.updateRoutes([sub(this.pattern, this.metaLevel, observerLevel),
			pub(this.pattern, this.metaLevel, observerLevel)]);
};

DemandMatcher.prototype.handleEvent = function (e) {
    if (e.type === "routes") {
	this.handleGestalt(e.gestalt);
    }
};

DemandMatcher.prototype.handleGestalt = function (gestalt) {
    var newDemandMatcher = gestalt.project(this.projectionSpec,
					   !this.demandSideIsSubscription,
					   this.metaLevel,
					   this.demandLevel);
    var newSupplyMatcher = gestalt.project(this.projectionSpec,
					   this.demandSideIsSubscription,
					   this.metaLevel,
					   this.supplyLevel);
    var newDemand = Route.arrayToSet(Route.matcherKeys(newDemandMatcher));
    var newSupply = Route.arrayToSet(Route.matcherKeys(newSupplyMatcher));
    var demandDelta = Route.setSubtract(newDemand, this.currentDemand);
    var supplyDelta = Route.setSubtract(this.currentSupply, newSupply);
    var demandIncr = Route.setSubtract(demandDelta, newSupply);
    var supplyDecr = Route.setIntersect(supplyDelta, newDemand);
    this.currentDemand = newDemand;
    this.currentSupply = newSupply;
    for (var k in demandIncr) this.onDemandIncrease(demandIncr[k]);
    for (var k in supplyDecr) this.onSupplyDecrease(supplyDecr[k]);
};

/*---------------------------------------------------------------------------*/
/* Utilities: deduplicator */

function Deduplicator(ttl_ms) {
    this.ttl_ms = ttl_ms || 10000;
    this.queue = [];
    this.map = {};
    this.timerId = null;
}

Deduplicator.prototype.accept = function (m) {
    var s = JSON.stringify(m);
    if (s in this.map) return false;
    var entry = [(+new Date()) + this.ttl_ms, s, m];
    this.map[s] = entry;
    this.queue.push(entry);

    if (this.timerId === null) {
	var self = this;
	this.timerId = setInterval(function () { self.expireMessages(); },
				   this.ttl_ms > 1000 ? 1000 : this.ttl_ms);
    }
    return true;
};

Deduplicator.prototype.expireMessages = function () {
    var now = +new Date();
    while (this.queue.length > 0 && this.queue[0][0] <= now) {
	var entry = this.queue.shift();
	delete this.map[entry[1]];
    }
    if (this.queue.length === 0) {
	clearInterval(this.timerId);
	this.timerId = null;
    }
};

/*---------------------------------------------------------------------------*/
/* Ground interface */

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

module.exports.__ = __;
module.exports._$ = _$;

module.exports.sub = sub;
module.exports.pub = pub;
module.exports.spawn = spawn;
module.exports.updateRoutes = updateRoutes;
module.exports.sendMessage = sendMessage;
module.exports.shutdownWorld = shutdownWorld;

module.exports.World = World;
module.exports.DemandMatcher = DemandMatcher;
module.exports.Deduplicator = Deduplicator;
module.exports.Ground = Ground;
module.exports.Route = Route;

},{"./route.js":5}],5:[function(_dereq_,module,exports){
var __ = "__"; /* wildcard marker */

var SOA = "__["; // start of array
var EOA = "__]"; // end of array

function die(message) {
    throw new Error(message);
}

function $Embedded(matcher) {
    this.matcher = matcher;
}

function embeddedMatcher(matcher) {
    return new $Embedded(matcher);
}

// The pattern argument defaults to wildcard, __.
function $Capture(pattern) {
    this.pattern = (typeof pattern === 'undefined' ? __ : pattern);
}

// Abbreviation: _$(x) <==> new $Capture(x)
function _$(pattern) {
    return new $Capture(pattern);
}

function isCapture(x) { return x instanceof $Capture || x === _$; }
function capturePattern(x) { return x instanceof $Capture ? x.pattern : __; }

var SOC = "__{{"; // start of capture
var EOC = "__}}"; // end of capture

function $Success(value) {
    this.value = value;
}

function $WildcardSequence(matcher) {
    this.matcher = matcher;
}

function $Dict() {
    this.length = 0;
    this.entries = {};
}

$Dict.prototype.get = function (key) {
    return this.entries[key] || emptyMatcher;
};

$Dict.prototype.set = function (key, val) {
    if (!(key in this.entries)) this.length++;
    this.entries[key] = val;
};

$Dict.prototype.clear = function (key) {
    if (key in this.entries) this.length--;
    delete this.entries[key];
};

$Dict.prototype.isEmpty = function () {
    return this.length === 0;
};

$Dict.prototype.copy = function () {
    var other = new $Dict();
    other.length = this.length;
    for (var key in this.entries) {
	if (this.entries.hasOwnProperty(key)) {
	    other.entries[key] = this.entries[key];
	}
    }
    return other;
};

$Dict.prototype.emptyGuard = function () {
    if (this.isEmpty()) return emptyMatcher;
    return this;
};

$Dict.prototype.has = function (key) {
    return key in this.entries;
};

$Dict.prototype.sortedKeys = function () {
    var ks = [];
    for (var k in this.entries) ks.push(k);
    ks.sort();
    return ks;
}

function is_emptyMatcher(m) {
    return (m === emptyMatcher);
}

///////////////////////////////////////////////////////////////////////////
// Constructors

var emptyMatcher = null;

function rsuccess(v) {
    return (v === emptyMatcher) ? emptyMatcher : new $Success(v);
}

function rseq(e, r) {
    if (r === emptyMatcher) return emptyMatcher;
    var s = new $Dict();
    s.set(e, r);
    return s;
}

function rwild(r) {
    return rseq(__, r);
}

function rwildseq(r) {
    return (r === emptyMatcher) ? emptyMatcher : new $WildcardSequence(r);
}

///////////////////////////////////////////////////////////////////////////

function compilePattern(v, p) {
    if (!p) die("compilePattern: missing pattern");
    return walk(p, rseq(EOA, rsuccess(v)));

    function walk(p, acc) {
	if (p === __) return rwild(acc);

	if (Array.isArray(p)) {
	    acc = rseq(EOA, acc);
	    for (var i = p.length - 1; i >= 0; i--) {
		acc = walk(p[i], acc);
	    }
	    return rseq(SOA, acc);
	}

	if (p instanceof $Embedded) {
	    return appendMatcher(p.matcher, function (v) { return acc; });
	} else {
	    return rseq(JSON.stringify(p), acc);
	}
    }
}

function shallowCopyArray(s) {
    return s.slice();
}

function rupdateInplace(r, key, k) {
    if (is_emptyMatcher(k)) {
	r.clear(key);
    } else {
	r.set(key, k);
    }
}

function matcherEquals(a, b) {
    if (a === null) {
	return (b === null);
    }
    if (b === null) return false;

    if (a instanceof $WildcardSequence) {
	if (!(b instanceof $WildcardSequence)) return false;
	a = a.matcher;
	b = b.matcher;
    } else if (b instanceof $WildcardSequence) return false;

    if (a instanceof $Success) {
	if (!(b instanceof $Success)) return false;
	return valuesEqual(a.value, b.value);
    }
    if (b instanceof $Success) return false;

    for (var key in a.entries) {
	if (!b.has(key)) return false;
	if (!matcherEquals(a.entries[key], b.entries[key])) return false;
    }
    return true;
}

function is_keyOpen(k) {
    return k === SOA;
}

function is_keyClose(k) {
    return k === EOA;
}

function is_keyNormal(k) {
    return !(is_keyOpen(k) || is_keyClose(k));
}

///////////////////////////////////////////////////////////////////////////
// Enough of sets to get by with

function arrayToSet(xs) {
    var s = {};
    for (var i = 0; i < xs.length; i++) {
	s[JSON.stringify(xs[i])] = xs[i];
    }
    return s;
}

function setToArray(s) {
    var r = [];
    for (var k in s) r.push(s[k]);
    return r;
}

function setUnion(s1, s2) {
    var s = {};
    setUnionInplace(s, s1);
    setUnionInplace(s, s2);
    return s;
}

function is_emptySet(s) {
    for (var k in s) {
	if (s.hasOwnProperty(k))
	    return false;
    }
    return true;
}

function setSubtract(s1, s2) {
    var s = {};
    for (var key in s1) {
	if (s1.hasOwnProperty(key) && !s2.hasOwnProperty(key)) {
	    s[key] = s1[key];
	}
    }
    return s;
}

function setIntersect(s1, s2) {
    var s = {};
    for (var key in s1) {
	if (s1.hasOwnProperty(key) && s2.hasOwnProperty(key)) {
	    s[key] = s1[key];
	}
    }
    return s;
}

function setUnionInplace(acc, s) {
    for (var key in s) {
	if (s.hasOwnProperty(key)) {
	    acc[key] = s[key];
	}
    }
}

function setEqual(s1, s2) {
    for (var key in s1) {
	if (s1.hasOwnProperty(key)) {
	    if (s1[key] !== s2[key]) return false;
	}
    }
    for (var key in s2) {
	if (s2.hasOwnProperty(key)) {
	    if (s1[key] !== s2[key]) return false;
	}
    }
    return true;
}

///////////////////////////////////////////////////////////////////////////

var unionSuccesses = function (v1, v2) {
    if (v1 === true) return v2;
    if (v2 === true) return v1;
    return setUnion(v1, v2);
};

var intersectSuccesses = function (v1, v2) {
    return v1;
};

var erasePathSuccesses = function (v1, v2) {
    var r = setSubtract(v1, v2);
    if (is_emptySet(r)) return null;
    return r;
};

var matchMatcherSuccesses = function (v1, v2, acc) {
    setUnionInplace(acc, v2);
};

var projectSuccess = function (v) {
    return v;
};

var valuesEqual = function (a, b) {
    return setEqual(a, b);
};

///////////////////////////////////////////////////////////////////////////

function expandWildseq(r) {
    return union(rwild(rwildseq(r)), rseq(EOA, r));
}

function union(o1, o2) {
    return merge(o1, o2);

    function merge(o1, o2) {
	if (is_emptyMatcher(o1)) return o2;
	if (is_emptyMatcher(o2)) return o1;
	return walk(o1, o2);
    }

    function walk(r1, r2) {
	if (r1 instanceof $WildcardSequence) {
	    if (r2 instanceof $WildcardSequence) {
		return rwildseq(walk(r1.matcher, r2.matcher));
	    }
	    r1 = expandWildseq(r1.matcher);
	} else if (r2 instanceof $WildcardSequence) {
	    r2 = expandWildseq(r2.matcher);
	}

	if (r1 instanceof $Success && r2 instanceof $Success) {
	    return rsuccess(unionSuccesses(r1.value, r2.value));
	}

	var w = merge(r1.get(__), r2.get(__));
	if (is_emptyMatcher(w)) {
	    var smaller = r1.length < r2.length ? r1 : r2;
	    var larger  = r1.length < r2.length ? r2 : r1;
	    var target = larger.copy();
	    for (var key in smaller.entries) {
		var k = merge(smaller.get(key), larger.get(key));
		rupdateInplace(target, key, k);
	    }
	    return target.emptyGuard();
	} else {
	    function examineKey(rA, key, rB) {
		if ((key !== __) && !target.has(key)) {
		    var k = merge(rA.get(key), rB.get(key));
		    if (is_keyOpen(key)) {
			rupdateInplace(target, key, merge(rwildseq(w), k));
		    } else if (is_keyClose(key)) {
			if (w instanceof $WildcardSequence) {
			    rupdateInplace(target, key, merge(w.matcher, k));
			} else {
			    rupdateInplace(target, key, k);
			}
		    } else {
			rupdateInplace(target, key, merge(w, k));
		    }
		}
	    }
	    var target = rwild(w).copy();
	    for (var key in r1.entries) { examineKey(r1, key, r2); }
	    for (var key in r2.entries) { examineKey(r2, key, r1); }
	    return target;
	}
    }
}

function unionN() {
    var acc = emptyMatcher;
    for (var i = 0; i < arguments.length; i++) {
	acc = union(acc, arguments[i]);
    }
    return acc;
}

function intersect(o1, o2) {
    if (is_emptyMatcher(o1)) return emptyMatcher;
    if (is_emptyMatcher(o2)) return emptyMatcher;
    return walk(o1, o2);

    function walkFlipped(r2, r1) { return walk(r1, r2); }

    function walk(r1, r2) {
	// INVARIANT: r1 is a part of the original o1, and
	// likewise for r2. This is so that the first arg to
	// intersectSuccesses always comes from r1, and the second
	// from r2.
	if (is_emptyMatcher(r1)) return emptyMatcher;
	if (is_emptyMatcher(r2)) return emptyMatcher;

	if (r1 instanceof $WildcardSequence) {
	    if (r2 instanceof $WildcardSequence) {
		return rwildseq(walk(r1.matcher, r2.matcher));
	    }
	    r1 = expandWildseq(r1.matcher);
	} else if (r2 instanceof $WildcardSequence) {
	    r2 = expandWildseq(r2.matcher);
	}

	if (r1 instanceof $Success && r2 instanceof $Success) {
	    return rsuccess(intersectSuccesses(r1.value, r2.value));
	}

	var w1 = r1.get(__);
	var w2 = r2.get(__);
	var w = walk(w1, w2);

	var target = new $Dict();

	function examineKey(key) {
	    if ((key !== __) && !target.has(key)) {
		var k1 = r1.get(key);
		var k2 = r2.get(key);
		if (is_emptyMatcher(k1)) {
		    if (is_emptyMatcher(k2)) {
			rupdateInplace(target, key, emptyMatcher);
		    } else {
			rupdateInplace(target, key, walkWild(walk, w1, key, k2));
		    }
		} else {
		    if (is_emptyMatcher(k2)) {
			rupdateInplace(target, key, walkWild(walkFlipped, w2, key, k1));
		    } else {
			rupdateInplace(target, key, walk(k1, k2));
		    }
		}
	    }
	}

	if (is_emptyMatcher(w1)) {
	    if (is_emptyMatcher(w2)) {
		for (var key in (r1.length < r2.length ? r1 : r2).entries) examineKey(key);
	    } else {
		for (var key in r1.entries) examineKey(key);
	    }
	} else {
	    if (is_emptyMatcher(w2)) {
		for (var key in r2.entries) examineKey(key);
	    } else {
		rupdateInplace(target, __, w);
		for (var key in r1.entries) examineKey(key);
		for (var key in r2.entries) examineKey(key);
	    }
	}
	return target.emptyGuard();
    }

    function walkWild(walker, w, key, k) {
	if (is_emptyMatcher(w)) return emptyMatcher;
	if (is_keyOpen(key)) return walker(rwildseq(w), k);
	if (is_keyClose(key)) {
	    if (w instanceof $WildcardSequence) return walker(w.matcher, k);
	    return emptyMatcher;
	}
	return walker(w, k);
    }
}

// Removes r2's mappings from r1. Assumes r2 has previously been
// union'd into r1. The erasePathSuccesses function should return
// null to signal "no remaining success values".
function erasePath(o1, o2) {
    return walk(o1, o2);

    function walk(r1, r2) {
	if (is_emptyMatcher(r1)) {
	    return emptyMatcher;
	} else {
	    if (is_emptyMatcher(r2)) {
		return r1;
	    }
	}

	if (r1 instanceof $WildcardSequence) {
	    if (r2 instanceof $WildcardSequence) {
		return rwildseq(walk(r1.matcher, r2.matcher));
	    }
	    r1 = expandWildseq(r1.matcher);
	} else if (r2 instanceof $WildcardSequence) {
	    r2 = expandWildseq(r2.matcher);
	}

	if (r1 instanceof $Success && r2 instanceof $Success) {
	    return rsuccess(erasePathSuccesses(r1.value, r2.value));
	}

	var w1 = r1.get(__);
	var w2 = r2.get(__);
	var w = walk(w1, w2);
	var target;

	function examineKey(key) {
	    if (key !== __) {
		var k1 = r1.get(key);
		var k2 = r2.get(key);
		var updatedK;
		if (is_emptyMatcher(k2)) {
		    updatedK = walkWild(key, k1, w2);
		} else {
		    updatedK = walk(k1, k2);
		}
		// Here we ensure a "minimal" remainder in cases
		// where after an erasure, a particular key's
		// continuation is the same as the wildcard's
		// continuation. TODO: the matcherEquals check may
		// be expensive. If so, how can it be made
		// cheaper?
		if (is_keyOpen(key)) {
		    rupdateInplace(target, key,
				   ((updatedK instanceof $WildcardSequence) &&
				    matcherEquals(updatedK.matcher, w))
				   ? emptyMatcher
				   : updatedK);
		} else if (is_keyClose(key)) {
		    // We take care of this case later, after the
		    // target is fully constructed/rebuilt.
		    rupdateInplace(target, key, updatedK);
		} else {
		    rupdateInplace(target, key,
				   (matcherEquals(updatedK, w) ? emptyMatcher : updatedK));
		}
	    }
	}

	if (is_emptyMatcher(w2)) {
	    target = r1.copy();
	    for (var key in r2.entries) examineKey(key);
	} else {
	    target = new $Dict();
	    rupdateInplace(target, __, w);
	    for (var key in r1.entries) examineKey(key);
	    for (var key in r2.entries) examineKey(key);
	}

	// Here, the target is complete. If it has only two keys,
	// one wild and one is_keyClose, and wild's continuation
	// is a $WildcardSequence and the other continuation is
	// identical to the sequence's continuation, then replace
	// the whole thing with a nested $WildcardSequence.
	// (We know w === target.get(__) from before.)
	//
	// TODO: I suspect actually this applies even if there are
	// more than two keys, so long as all their continuations
	// are identical and there's at least one is_keyClose
	// alongside a wild.
	if (target.length === 2) {
	    var finalW = target.get(__);
	    if (finalW instanceof $WildcardSequence) {
		for (var key in target.entries) {
		    if ((key !== __) && is_keyClose(key)) {
			var k = target.get(key);
			if (matcherEquals(k, finalW.matcher)) {
			    return finalW;
			}
		    }
		}
	    }
	}

	return target.emptyGuard();
    }

    function walkWild(key, k, w) {
	if (is_emptyMatcher(w)) return k;
	if (is_keyOpen(key)) return walk(k, rwildseq(w));
	if (is_keyClose(key)) {
	    if (w instanceof $WildcardSequence) return walk(k, w.matcher);
	    return k;
	}
	return walk(k, w);
    }
}

// Returns null on failed match, otherwise the appropriate success
// value contained in the matcher r.
function matchValue(r, v) {
    var failureResult = null;

    var vs = [v];
    var stack = [[]];

    while (!is_emptyMatcher(r)) {
	if (r instanceof $WildcardSequence) {
	    if (stack.length === 0) return failureResult;
	    vs = stack.pop();
	    r = r.matcher;
	    continue;
	}

	if (r instanceof $Success) {
	    if (vs.length === 0 && stack.length === 0) return r.value;
	    return failureResult;
	}

	if (vs.length === 0) {
	    if (stack.length === 0) return failureResult;
	    vs = stack.pop();
	    r = r.get(EOA);
	    continue;
	}

	var v = vs.shift();

	if (typeof v === 'string' && v.substring(0, 2) === '__') {
	    die("Cannot match special string starting with __");
	}

	if (Array.isArray(v)) {
	    if (SOA in r.entries) {
		r = r.get(SOA);
		stack.push(vs);
		vs = shallowCopyArray(v);
	    } else {
		r = r.get(__);
	    }
	} else {
	    var key;
	    try {
		key = JSON.stringify(v);
	    } catch (exn) {
		// For example, v might be cyclic, as in DOM events.
		key = null;
	    }
	    if (key in r.entries) {
		r = r.get(key);
	    } else {
		r = r.get(__);
	    }
	}
    }

    return failureResult;
}

// TODO: better name for this
function matchMatcher(o1, o2, seed) {
    var acc = typeof seed === 'undefined' ? {} : seed; // will be modified in place
    walk(o1, o2);
    return acc;

    function walkFlipped(r2, r1) { return walk(r1, r2); }

    function walk(r1, r2) {
	if (is_emptyMatcher(r1) || is_emptyMatcher(r2)) return;

	if (r1 instanceof $WildcardSequence) {
	    if (r2 instanceof $WildcardSequence) {
		walk(r1.matcher, r2.matcher);
		return;
	    }
	    r1 = expandWildseq(r1.matcher);
	} else if (r2 instanceof $WildcardSequence) {
	    r2 = expandWildseq(r2.matcher);
	}

	if (r1 instanceof $Success && r2 instanceof $Success) {
	    matchMatcherSuccesses(r1.value, r2.value, acc);
	    return;
	}

	var w1 = r1.get(__);
	var w2 = r2.get(__);
	walk(w1, w2);

	function examineKey(key) {
	    if (key !== __) {
		var k1 = r1.get(key);
		var k2 = r2.get(key);
		if (is_emptyMatcher(k1)) {
		    if (is_emptyMatcher(k2)) {
			return;
		    } else {
			walkWild(walk, w1, key, k2);
		    }
		} else {
		    if (is_emptyMatcher(k2)) {
			walkWild(walkFlipped, w2, key, k1);
		    } else {
			walk(k1, k2);
		    }
		}
	    }
	}

	// Optimize similarly to intersect().
	if (is_emptyMatcher(w1)) {
	    if (is_emptyMatcher(w2)) {
		for (var key in (r1.length < r2.length ? r1 : r2).entries) examineKey(key);
	    } else {
		for (var key in r1.entries) examineKey(key);
	    }
	} else {
	    if (is_emptyMatcher(w2)) {
		for (var key in r2.entries) examineKey(key);
	    } else {
		for (var key in r1.entries) examineKey(key);
		for (var key in r2.entries) examineKey(key);
	    }
	}
    }

    function walkWild(walker, w, key, k) {
	if (is_emptyMatcher(w)) return;
	if (is_keyOpen(key)) {
	    walker(rwildseq(w), k);
	    return;
	}
	if (is_keyClose(key)) {
	    if (w instanceof $WildcardSequence) walker(w.matcher, k);
	    return;
	}
	walker(w, k);
    }
}

function appendMatcher(m, mTailFn) {
    return walk(m);

    function walk(m) {
	if (is_emptyMatcher(m)) return emptyMatcher;
	if (m instanceof $WildcardSequence) return rwildseq(walk(m.matcher));
	if (m instanceof $Success) die("Ill-formed matcher");

	var target = new $Dict();
	for (var key in m.entries) {
	    var k = m.get(key);
	    if (is_keyClose(key) && (k instanceof $Success)) {
		target = union(target, mTailFn(k.value));
	    } else {
		rupdateInplace(target, key, walk(k));
	    }
	}
	return target.emptyGuard();
    }
}

function relabel(m, f) {
    return walk(m);

    function walk(m) {
	if (is_emptyMatcher(m)) return emptyMatcher;
	if (m instanceof $WildcardSequence) return rwildseq(walk(m.matcher));
	if (m instanceof $Success) return rsuccess(f(m.value));

	var target = new $Dict();
	for (var key in m.entries) {
	    rupdateInplace(target, key, walk(m.get(key)));
	}
	return target.emptyGuard();
    }
}

function compileProjection(/* projection, projection, ... */) {
    var acc = [];
    for (var i = 0; i < arguments.length; i++) {
	walk(arguments[i]);
    }
    acc.push(EOA);
    return acc;

    function walk(p) {
	if (isCapture(p)) {
	    acc.push(SOC);
	    walk(capturePattern(p));
	    acc.push(EOC);
	    return;
	}

	if (Array.isArray(p)) {
	    acc.push(SOA);
	    for (var i = 0; i < p.length; i++) {
		walk(p[i]);
	    }
	    acc.push(EOA);
	    return;
	}

	if (p instanceof $Embedded) {
	    die("Cannot embed matcher in projection");
	} else {
	    if (p === __) {
		acc.push(p);
	    } else {
		acc.push(JSON.stringify(p));
	    }
	}
    }
}

function projectionToPattern(p) {
    return walk(p);

    function walk(p) {
	if (isCapture(p)) return walk(capturePattern(p));

	if (Array.isArray(p)) {
	    var result = [];
	    for (var i = 0; i < p.length; i++) {
		result.push(walk(p[i]));
	    }
	    return result;
	}

	if (p instanceof $Embedded) {
	    return p.matcher;
	} else {
	    return p;
	}
    }
}

function project(m, spec) {
    return walk(false, m, 0);

    function walk(isCapturing, m, specIndex) {
	if (specIndex >= spec.length) {
	    if (isCapturing) die("Bad specification: unclosed capture");
	    if (m instanceof $Success) {
		return rseq(EOA, rsuccess(projectSuccess(m.value)));
	    } else {
		return emptyMatcher;
	    }
	}

	if (is_emptyMatcher(m)) return emptyMatcher;

	var item = spec[specIndex];
	var nextIndex = specIndex + 1;

	if (item === EOC) {
	    if (!isCapturing) die("Bad specification: unepxected EOC");
	    return walk(false, m, nextIndex);
	}

	if (item === SOC) {
	    if (isCapturing) die("Bad specification: nested capture");
	    return walk(true, m, nextIndex);
	}

	if (item === __) {
	    if (m instanceof $WildcardSequence) {
		if (isCapturing) {
		    return rwild(walk(isCapturing, m, nextIndex));
		} else {
		    return walk(isCapturing, m, nextIndex);
		}
	    }

	    if (m instanceof $Success) {
		return emptyMatcher;
	    }

	    var target;
	    if (isCapturing) {
		target = new $Dict();
		rupdateInplace(target, __, walk(isCapturing, m.get(__), nextIndex));
		for (var key in m.entries) {
		    if (key !== __) {
			var mk = m.get(key);
			if (is_keyOpen(key)) {
			    function cont(mk2) { return walk(isCapturing, mk2, nextIndex); }
			    rupdateInplace(target, key, captureNested(mk, cont));
			} else if (is_keyClose(key)) {
			    // do nothing
			} else {
			    rupdateInplace(target, key, walk(isCapturing, mk, nextIndex));
			}
		    }
		}
	    } else {
		target = walk(isCapturing, m.get(__), nextIndex);
		for (var key in m.entries) {
		    if (key !== __) {
			var mk = m.get(key);
			if (is_keyOpen(key)) {
			    function cont(mk2) { return walk(isCapturing, mk2, nextIndex); }
			    target = union(target, skipNested(mk, cont));
			} else if (is_keyClose(key)) {
			    // do nothing
			} else {
			    target = union(target, walk(isCapturing, mk, nextIndex));
			}
		    }
		}
	    }
	    return target;
	}

	var result;
	if (m instanceof $WildcardSequence) {
	    if (is_keyOpen(item)) {
		result = walk(isCapturing, rwildseq(m), nextIndex);
	    } else if (is_keyClose(item)) {
		result = walk(isCapturing, m.matcher, nextIndex);
	    } else {
		result = walk(isCapturing, m, nextIndex);
	    }
	} else if (m instanceof $Success) {
	    result = emptyMatcher;
	} else {
	    if (is_keyOpen(item)) {
		result = walk(isCapturing, rwildseq(m.get(__)), nextIndex);
	    } else if (is_keyClose(item)) {
		result = emptyMatcher;
	    } else {
		result = walk(isCapturing, m.get(__), nextIndex);
	    }
	    result = union(result, walk(isCapturing, m.get(item), nextIndex));
	}
	if (isCapturing) {
	    result = rseq(item, result);
	}
	return result;
    }

    function captureNested(m, cont) {
	if (m instanceof $WildcardSequence) {
	    return rwildseq(cont(m.matcher));
	}

	if (is_emptyMatcher(m) || (m instanceof $Success)) {
	    return emptyMatcher;
	}

	var target = new $Dict();
	rupdateInplace(target, __, captureNested(m.get(__), cont));
	for (var key in m.entries) {
	    if (key !== __) {
		var mk = m.get(key);
		if (is_keyOpen(key)) {
		    function cont2(mk2) { return captureNested(mk2, cont); }
		    rupdateInplace(target, key, captureNested(mk, cont2));
		} else if (is_keyClose(key)) {
		    rupdateInplace(target, key, cont(mk));
		} else {
		    rupdateInplace(target, key, captureNested(mk, cont));
		}
	    }
	}
	return target.emptyGuard();
    }

    function skipNested(m, cont) {
	if (m instanceof $WildcardSequence) {
	    return cont(m.matcher);
	}

	if (is_emptyMatcher(m) || (m instanceof $Success)) {
	    return emptyMatcher;
	}

	var target = skipNested(m.get(__), cont);
	for (var key in m.entries) {
	    if (key !== __) {
		var mk = m.get(key);
		if (is_keyOpen(key)) {
		    function cont2(mk2) { return skipNested(mk2, cont); }
		    target = union(target, skipNested(mk, cont2));
		} else if (is_keyClose(key)) {
		    target = union(target, cont(mk));
		} else {
		    target = union(target, skipNested(mk, cont));
		}
	    }
	}
	return target;
    }
}

function matcherKeys(m) {
    if (is_emptyMatcher(m)) return [];
    return walkSeq(m, function (vss, vsk) { return vss; });

    function walk(m, k) {
	if (m instanceof $WildcardSequence) return null;
	if (m instanceof $Success) return [];
	if (m.has(__)) return null;
	var acc = [];
	for (var key in m.entries) {
	    var mk = m.get(key);
	    var piece;
	    if (is_keyOpen(key)) {
		function seqK(vss, vsk) {
		    var acc = [];
		    for (var i = 0; i < vss.length; i++) {
			var vs = vss[i];
			acc = acc.concat(k(transformSeqs(vs, key), vsk));
		    }
		    return acc;
		}
		piece = walkSeq(mk, seqK);
	    } else if (is_keyClose(key)) {
		die("matcherKeys: internal error: unexpected key-close");
	    } else {
		piece = k(JSON.parse(key), mk);
	    }
	    if (piece == null) return null;
	    acc = acc.concat(piece);
	}
	return acc;
    }

    function walkSeq(m, k) {
	if (m instanceof $WildcardSequence) return null;
	if (m instanceof $Success) return k([], emptyMatcher); // TODO: ??
	if (m.has(__)) return null;
	var acc = [];
	for (var key in m.entries) {
	    var mk = m.get(key);
	    var piece;
	    if (is_keyClose(key)) {
		piece = k([[]], mk);
	    } else {
		function outerK(v, vk) {
		    return walkSeq(vk, innerK);
		    function innerK(vss, vsk) {
			var acc = [];
			for (var i = 0; i < vss.length; i++) {
			    var vs = shallowCopyArray(vss[i]);
			    vs.unshift(v);
			    acc.push(vs);
			}
			return k(acc, vsk);
		    }
		}
		piece = walk(rseq(key, mk), outerK);
	    }
	    if (piece == null) return null;
	    acc = acc.concat(piece);
	}
	return acc;
    }

    function transformSeqs(vs, opener) {
	if (opener === SOA) return vs;
	die("Internal error: unknown opener " + opener);
    }
}

function prettyMatcher(m, initialIndent) {
    var acc = [];
    walk(initialIndent || 0, m);
    return acc.join('');

    function walk(i, m) {
	if (is_emptyMatcher(m)) {
	    acc.push("::: no further matches possible");
	    return;
	}
	if (m instanceof $WildcardSequence) {
	    acc.push("...>");
	    walk(i + 4, m.matcher);
	    return;
	}
	if (m instanceof $Success) {
	    var vs = JSON.stringify(typeof m.value === 'object'
				    ? setToArray(m.value)
				    : m.value);
	    acc.push("{" + vs + "}");
	    return;
	}

	if (m.length === 0) {
	    acc.push(" ::: empty hash!");
	    return;
	}

	var needSep = false;
	var keys = m.sortedKeys();
	for (var keyi = 0; keyi < keys.length; keyi++) {
	    var key = keys[keyi];
	    var k = m.entries[key];
	    if (needSep) {
		acc.push("\n");
		acc.push(indentStr(i));
	    } else {
		needSep = true;
	    }
	    acc.push(" ");
	    if (key === __) key = '★';
	    if (key === SOA) key = '<';
	    if (key === EOA) key = '>';
	    acc.push(key);
	    walk(i + key.length + 1, k);
	}
    }

    function indentStr(i) {
	return new Array(i + 1).join(' '); // eww
    }
}

function serializeMatcher(m, serializeSuccess) {
    return walk(m);
    function walk(m) {
	if (is_emptyMatcher(m)) return [];
	if (m instanceof $WildcardSequence) {
	    return ["...)", walk(m.matcher)];
	}
	if (m instanceof $Success) {
	    return ["", serializeSuccess(m.value)];
	}
	var acc = [];
	for (var key in m.entries) {
	    var k = m.entries[key];
	    if (key === __) key = ["__"];
	    else if (key === SOA) key = ["("];
	    else if (key === EOA) key = [")"];
	    else key = JSON.parse(key);
	    acc.push([key, walk(k)]);
	}
	return acc;
    }
}

function deserializeMatcher(r, deserializeSuccess) {
    return walk(r);
    function walk(r) {
	if (r.length === 0) return emptyMatcher;
	if (r[0] === "...)") return rwildseq(walk(r[1]));
	if (r[0] === "") return rsuccess(deserializeSuccess(r[1]));
	var acc = new $Dict();
	for (var i = 0; i < r.length; i++) {
	    var rkey = r[i][0];
	    var rk = r[i][1];
	    var key;
	    if (Array.isArray(rkey)) {
		switch (rkey[0]) {
		case "__": key = __; break;
		case "(": key = SOA; break;
		case ")": key = EOA; break;
		default: die("Invalid serialized special key: " + rkey[0]);
		}
	    } else {
		key = JSON.stringify(rkey);
	    }
	    rupdateInplace(acc, key, walk(rk));
	}
	return acc;
    }
}

///////////////////////////////////////////////////////////////////////////
// Gestalts.
// TODO: support Infinity as a level number

function GestaltLevel(subs, advs) {
    this.subscriptions = subs;
    this.advertisements = advs;
}

GestaltLevel.prototype.isEmpty = function () {
    return is_emptyMatcher(this.subscriptions) && is_emptyMatcher(this.advertisements);
};

GestaltLevel.prototype.equals = function (other) {
    return matcherEquals(this.subscriptions, other.subscriptions)
	&& matcherEquals(this.advertisements, other.advertisements);
};

GestaltLevel.prototype.pretty = function () {
    var acc = [];
    if (!is_emptyMatcher(this.subscriptions)) {
	acc.push("  - subs:");
	acc.push(prettyMatcher(this.subscriptions, 9));
	acc.push("\n");
    }
    if (!is_emptyMatcher(this.advertisements)) {
	acc.push("  - advs:");
	acc.push(prettyMatcher(this.advertisements, 9));
	acc.push("\n");
    }
    return acc.join('');
};

function straightGestaltLevelOp(op) {
    return function (p1, p2) {
	return new GestaltLevel(op(p1.subscriptions, p2.subscriptions),
				op(p1.advertisements, p2.advertisements));
    };
};

var emptyLevel = new GestaltLevel(emptyMatcher, emptyMatcher);
var emptyMetaLevel = [];

function Gestalt(metaLevels) {
    this.metaLevels = metaLevels;
}

Gestalt.prototype.getMetaLevel = function (n) {
    return this.metaLevels[n] || emptyMetaLevel;
};

Gestalt.prototype.getLevel = function (metaLevel, level) {
    return this.getMetaLevel(metaLevel)[level] || emptyLevel;
};

Gestalt.prototype.metaLevelCount = function () { return this.metaLevels.length; };
Gestalt.prototype.levelCount = function (n) { return this.getMetaLevel(n).length; };

Gestalt.prototype.matchValue = function (body, metaLevel, isFeedback) {
    var levels = this.getMetaLevel(metaLevel);
    var pids = {};
    for (var i = 0; i < levels.length; i++) {
	var matcher = (isFeedback ? levels[i].advertisements : levels[i].subscriptions);
	setUnionInplace(pids, matchValue(matcher, body));
    }
    return setToArray(pids);
};

Gestalt.prototype.project = function (spec, getAdvertisements, metaLevel, level) {
    var l = this.getLevel(metaLevel | 0, level | 0);
    var matcher = (getAdvertisements ? l.advertisements : l.subscriptions);
    return project(matcher, spec);
};

Gestalt.prototype.drop = function () {
    var mls = shallowCopyArray(this.metaLevels);
    mls.shift();
    return new Gestalt(mls);
};

Gestalt.prototype.lift = function () {
    var mls = shallowCopyArray(this.metaLevels);
    mls.unshift(emptyMetaLevel);
    return new Gestalt(mls);
};

Gestalt.prototype.equals = function (other) {
    if (this.metaLevels.length !== other.metaLevels.length) return false;
    for (var i = 0; i < this.metaLevels.length; i++) {
	var ls1 = this.metaLevels[i];
	var ls2 = other.metaLevels[i];
	if (ls1.length !== ls2.length) return false;
	for (var j = 0; j < ls1.length; j++) {
	    var p1 = ls1[j];
	    var p2 = ls2[j];
	    if (!p1.equals(p2)) return false;
	}
    }
    return true;
};

function simpleGestalt(isAdv, pat, metaLevel, level) {
    metaLevel = metaLevel || 0;
    level = level || 0;
    var matcher = compilePattern(true, pat);
    var l = new GestaltLevel(isAdv ? emptyMatcher : matcher,
			     isAdv ? matcher : emptyMatcher);
    var levels = [l];
    while (level--) { levels.unshift(emptyLevel); }
    var metaLevels = [levels];
    while (metaLevel--) { metaLevels.unshift(emptyMetaLevel); }
    return new Gestalt(metaLevels);
}

var emptyGestalt = new Gestalt([]);

// Not quite what it says on the tin - the true fullGestalt
// wouldn't be parameterized on the number of levels and
// metalevels, but instead would be full at *all* levels and
// metalevels. Our representation leaks through into the interface
// here :-/
function fullGestalt(nMetalevels, nLevels) {
    var matcher = compilePattern(true, __);
    var l = new GestaltLevel(matcher, matcher);
    var levels = [];
    while (nLevels--) { levels.push(l); }
    var metaLevels = [];
    while (nMetalevels--) { metaLevels.push(levels); }
    return new Gestalt(metaLevels);
}

Gestalt.prototype.isEmpty = function () {
    for (var i = 0; i < this.metaLevels.length; i++) {
	var levels = this.metaLevels[i];
	for (var j = 0; j < levels.length; j++) {
	    if (!levels[j].isEmpty()) return false;
	}
    }
    return true;
};

function maybePushLevel(levels, i, level) {
    if (!level.isEmpty()) {
	while (levels.length < i) levels.push(emptyLevel);
	levels.push(level);
    }
}

function maybePushMetaLevel(metaLevels, i, metaLevel) {
    if (metaLevel.length > 0) {
	while (metaLevels.length < i) metaLevels.push(emptyMetaLevel);
	metaLevels.push(metaLevel);
    }
}

Gestalt.prototype.mapZip = function (other, lengthCombiner, f) {
    var metaLevels = [];
    var mls1 = this.metaLevels;
    var mls2 = other.metaLevels;
    var nm = lengthCombiner(mls1.length, mls2.length);
    for (var i = 0; i < nm; i++) {
	var levels = [];
	var ls1 = mls1[i] || emptyMetaLevel;
	var ls2 = mls2[i] || emptyMetaLevel;
	var nl = lengthCombiner(ls1.length, ls2.length);
	for (var j = 0; j < nl; j++) {
	    var p1 = ls1[j] || emptyLevel;
	    var p2 = ls2[j] || emptyLevel;
	    var p = f(p1, p2);
	    maybePushLevel(levels, j, p);
	}
	maybePushMetaLevel(metaLevels, i, levels);
    }
    return new Gestalt(metaLevels);
};

Gestalt.prototype.union1 = function (other) {
    return this.mapZip(other, Math.max, straightGestaltLevelOp(union));
};

function gestaltUnion(gs) {
    if (gs.length === 0) return emptyGestalt;
    var acc = gs[0];
    for (var i = 1; i < gs.length; i++) {
	acc = acc.union1(gs[i]);
    }
    return acc;
}

Gestalt.prototype.union = function () {
    return arguments.length > 0 ? this.union1(gestaltUnion(arguments)) : this;
};

// Accumulates matchers from higher-numbered levels into
// lower-numbered levels.
function telescopeLevels(levels) {
    var result = shallowCopyArray(levels);
    for (var i = result.length - 2; i >= 0; i--) {
	result[i] =
	    new GestaltLevel(union(result[i].subscriptions, result[i+1].subscriptions),
			     union(result[i].advertisements, result[i+1].advertisements));
    }
    return result;
};

Gestalt.prototype.telescoped = function () {
    var mls = [];
    for (var i = 0; i < this.metaLevels.length; i++) {
	mls.push(telescopeLevels(this.metaLevels[i]));
    }
    return new Gestalt(mls);
};

Gestalt.prototype.filter = function (perspective) {
    var metaLevels = [];
    var mls1 = this.metaLevels;
    var mls2 = perspective.metaLevels;
    var nm = Math.min(mls1.length, mls2.length);
    for (var i = 0; i < nm; i++) {
	var levels = [];
	var ls1 = mls1[i] || emptyMetaLevel;
	var ls2 = mls2[i] || emptyMetaLevel;
	var nl = Math.min(ls1.length, ls2.length - 1);
	for (var j = 0; j < nl; j++) {
	    var p1 = ls1[j] || emptyLevel;
	    var subs = emptyMatcher;
	    var advs = emptyMatcher;
	    for (var k = j + 1; k < ls2.length; k++) {
		var p2 = ls2[k] || emptyLevel;
		subs = union(subs, intersect(p1.subscriptions, p2.advertisements));
		advs = union(advs, intersect(p1.advertisements, p2.subscriptions));
	    }
	    maybePushLevel(levels, j, new GestaltLevel(subs, advs));
	}
	maybePushMetaLevel(metaLevels, i, levels);
    }
    return new Gestalt(metaLevels);
};

Gestalt.prototype.match = function (perspective) {
    var pids = {};
    var nm = Math.min(this.metaLevels.length, perspective.metaLevels.length);
    for (var i = 0; i < nm; i++) {
	var ls1 = this.metaLevels[i] || emptyMetaLevel;
	var ls2 = perspective.metaLevels[i] || emptyMetaLevel;
	var nl = Math.min(ls1.length, ls2.length - 1);
	for (var j = 0; j < nl; j++) {
	    var p1 = ls1[j] || emptyLevel;
	    for (var k = j + 1; k < ls2.length; k++) {
		var p2 = ls2[k] || emptyLevel;
		matchMatcher(p1.subscriptions, p2.advertisements, pids);
		matchMatcher(p1.advertisements, p2.subscriptions, pids);
	    }
	}
    }
    return setToArray(pids);
};

Gestalt.prototype.erasePath = function (path) {
    return this.mapZip(path, Math.max, straightGestaltLevelOp(erasePath));
};

function mapLevels(inputMetaLevels, f, emptyCheck, inputEmptyLevel, outputEmptyLevel) {
    var outputMetaLevels = [];
    for (var i = 0; i < inputMetaLevels.length; i++) {
	var ls = inputMetaLevels[i];
	var levels = [];
	for (var j = 0; j < ls.length; j++) {
	    var p = f(ls[j] || inputEmptyLevel, i, j);
	    if (!emptyCheck(p, i, j)) {
		while (levels.length < j) levels.push(outputEmptyLevel);
		levels.push(p);
	    }
	}
	if (levels.length > 0) {
	    while (outputMetaLevels.length < i) outputMetaLevels.push(emptyMetaLevel);
	    outputMetaLevels.push(levels);
	}
    }
    return outputMetaLevels;
};

Gestalt.prototype.transform = function (f) {
    return new Gestalt(mapLevels(this.metaLevels, function (p, ml, l) {
	return new GestaltLevel(f(p.subscriptions, ml, l, false),
				f(p.advertisements, ml, l, true));
    }, function (p) {
	return p.isEmpty();
    }, emptyLevel, emptyLevel));
};

Gestalt.prototype.stripLabel = function () {
    return this.transform(function (m) { return relabel(m, function (v) { return true; }); });
};

Gestalt.prototype.label = function (pid) {
    var pids = arrayToSet([pid]);
    return this.transform(function (m) { return relabel(m, function (v) { return pids; }); });
};

Gestalt.prototype.pretty = function () {
    var acc = [];
    if (this.isEmpty()) {
	acc.push("EMPTY GESTALT\n");
    } else {
	for (var i = 0; i < this.metaLevels.length; i++) {
	    var ls = this.metaLevels[i];
	    for (var j = 0; j < ls.length; j++) {
		var p = ls[j];
		if (!p.isEmpty()) {
		    acc.push("GESTALT metalevel " + i + " level " + j + ":\n");
		    acc.push(p.pretty());
		}
	    }
	}
    }
    return acc.join('');
};

Gestalt.prototype.serialize = function (serializeSuccess) {
    if (typeof serializeSuccess === 'undefined') {
	serializeSuccess = function (v) { return v === true ? true : setToArray(v); };
    }
    return ["gestalt", mapLevels(this.metaLevels, function (p) {
	return [serializeMatcher(p.subscriptions, serializeSuccess),
		serializeMatcher(p.advertisements, serializeSuccess)];
    }, function (pr) {
	return pr.length === 2 && pr[0].length === 0 && pr[1].length === 0;
    }, emptyLevel, [[],[]])];
};

function deserializeGestalt(r, deserializeSuccess) {
    if (typeof deserializeSuccess === 'undefined') {
	deserializeSuccess = function (v) { return v === true ? true : arrayToSet(v); };
    }
    if (r[0] !== "gestalt") die("Invalid gestalt serialization: " + r);
    return new Gestalt(mapLevels(r[1], function (pr) {
	return new GestaltLevel(deserializeMatcher(pr[0], deserializeSuccess),
				deserializeMatcher(pr[1], deserializeSuccess));
    }, function (p) {
	return p.isEmpty();
    }, [[],[]], emptyLevel));
}

///////////////////////////////////////////////////////////////////////////

module.exports.__ = __;
module.exports.arrayToSet = arrayToSet;
module.exports.setToArray = setToArray;
module.exports.setUnion = setUnion;
module.exports.setSubtract = setSubtract;
module.exports.setIntersect = setIntersect;
module.exports.setEqual = setEqual;
module.exports.is_emptySet = is_emptySet;
module.exports.$Capture = $Capture;
module.exports._$ = _$;
module.exports.is_emptyMatcher = is_emptyMatcher;
module.exports.emptyMatcher = emptyMatcher;
module.exports.embeddedMatcher = embeddedMatcher;
module.exports.compilePattern = compilePattern;
module.exports.union = unionN;
module.exports.intersect = intersect;
module.exports.erasePath = erasePath;
module.exports.matchValue = matchValue;
module.exports.matchMatcher = matchMatcher;
module.exports.appendMatcher = appendMatcher;
module.exports.relabel = relabel;
module.exports.compileProjection = compileProjection;
module.exports.projectionToPattern = projectionToPattern;
module.exports.project = project;
module.exports.matcherKeys = matcherKeys;
module.exports.matcherEquals = matcherEquals;
module.exports.prettyMatcher = prettyMatcher;
module.exports.serializeMatcher = serializeMatcher;
module.exports.deserializeMatcher = deserializeMatcher;

module.exports.GestaltLevel = GestaltLevel;
module.exports.Gestalt = Gestalt;
module.exports.simpleGestalt = simpleGestalt;
module.exports.emptyGestalt = emptyGestalt;
module.exports.fullGestalt = fullGestalt;
module.exports.gestaltUnion = gestaltUnion;
module.exports.deserializeGestalt = deserializeGestalt;

},{}],6:[function(_dereq_,module,exports){
var Minimart = _dereq_("./minimart.js");
var Route = Minimart.Route;
var World = Minimart.World;
var sub = Minimart.sub;
var pub = Minimart.pub;
var __ = Minimart.__;
var _$ = Minimart._$;

function spawnRoutingTableWidget(selector, fragmentClass, observationLevel) {
    observationLevel = observationLevel || 10;
    // ^ arbitrary: should be Infinity, when route.js supports it. TODO

    World.spawn({
	boot: function () { this.updateState(); },

	state: Route.emptyGestalt.serialize(),
	nextState: Route.emptyGestalt.serialize(),
	timer: false,

	localGestalt: (sub(       ["DOM", selector, fragmentClass, __], 0, 2)
		       .union(pub(["DOM", selector, fragmentClass, __], 0, 2))
		       .telescoped()),

	digestGestalt: function (g) {
	    return g.stripLabel().erasePath(this.localGestalt).serialize();
	},

	updateState: function () {
	    var elts = ["pre", Route.deserializeGestalt(this.state).pretty()];
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

module.exports.spawnRoutingTableWidget = spawnRoutingTableWidget;

},{"./minimart.js":4}],7:[function(_dereq_,module,exports){
// Generic Spy
var Minimart = _dereq_("./minimart.js");
var World = Minimart.World;
var sub = Minimart.sub;
var pub = Minimart.pub;
var __ = Minimart.__;
var _$ = Minimart._$;

function Spy(label, useJson, observationLevel) {
    this.label = label || "SPY";
    this.observationLevel = observationLevel || 10; // arbitrary. Should be Infinity. TODO
    this.useJson = useJson;
}

Spy.prototype.boot = function () {
    World.updateRoutes([sub(__, 0, this.observationLevel), pub(__, 0, this.observationLevel)]);
};

Spy.prototype.handleEvent = function (e) {
    switch (e.type) {
    case "routes":
	console.log(this.label, "routes", e.gestalt.pretty());
	break;
    case "message":
	var messageRepr;
	try {
	    messageRepr = this.useJson ? JSON.stringify(e.message) : e.message;
	} catch (exn) {
	    messageRepr = e.message;
	}
	console.log(this.label, "message", messageRepr, e.metaLevel, e.isFeedback);
	break;
    default:
	console.log(this.label, "unknown", e);
	break;
    }
};

module.exports.Spy = Spy;

},{"./minimart.js":4}],8:[function(_dereq_,module,exports){
// Wake detector - notices when something (such as
// suspension/sleeping!) has caused periodic activities to be
// interrupted, and warns others about it
// Inspired by http://blog.alexmaccaw.com/javascript-wake-event
var Minimart = _dereq_("./minimart.js");
var World = Minimart.World;
var sub = Minimart.sub;
var pub = Minimart.pub;
var __ = Minimart.__;
var _$ = Minimart._$;

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

},{"./minimart.js":4}],9:[function(_dereq_,module,exports){
var Minimart = _dereq_("./minimart.js");
var Route = Minimart.Route;
var World = Minimart.World;
var sub = Minimart.sub;
var pub = Minimart.pub;
var __ = Minimart.__;
var _$ = Minimart._$;

///////////////////////////////////////////////////////////////////////////
// WebSocket client driver

var DEFAULT_RECONNECT_DELAY = 100;
var MAX_RECONNECT_DELAY = 30000;
var DEFAULT_IDLE_TIMEOUT = 300000; // 5 minutes
var DEFAULT_PING_INTERVAL = DEFAULT_IDLE_TIMEOUT - 10000;

function WebSocketConnection(label, wsurl, shouldReconnect) {
    this.label = label;
    this.sendsAttempted = 0;
    this.sendsTransmitted = 0;
    this.receiveCount = 0;
    this.sock = null;
    this.wsurl = wsurl;
    this.shouldReconnect = shouldReconnect ? true : false;
    this.reconnectDelay = DEFAULT_RECONNECT_DELAY;
    this.localGestalt = Route.emptyGestalt;
    this.peerGestalt = Route.emptyGestalt;
    this.prevLocalRoutesMessage = null;
    this.prevPeerRoutesMessage = null;
    this.deduplicator = new Minimart.Deduplicator();
    this.connectionCount = 0;

    this.activityTimestamp = 0;
    this.idleTimeout = DEFAULT_IDLE_TIMEOUT;
    this.pingInterval = DEFAULT_PING_INTERVAL;
    this.idleTimer = null;
    this.pingTimer = null;
}

WebSocketConnection.prototype.clearHeartbeatTimers = function () {
    if (this.idleTimer) { clearTimeout(this.idleTimer); this.idleTimer = null; }
    if (this.pingTimer) { clearTimeout(this.pingTimer); this.pingTimer = null; }
};

WebSocketConnection.prototype.recordActivity = function () {
    var self = this;
    this.activityTimestamp = +(new Date());
    this.clearHeartbeatTimers();
    this.idleTimer = setTimeout(function () { self.forceclose(); },
				this.idleTimeout);
    this.pingTimer = setTimeout(function () { self.safeSend(JSON.stringify("ping")) },
				this.pingInterval);
};

WebSocketConnection.prototype.statusRoute = function (status) {
    return pub([this.label + "_state", status]);
};

WebSocketConnection.prototype.relayGestalt = function () {
    return this.statusRoute(this.isConnected() ? "connected" : "disconnected")
	.union(pub([this.label, __, __], 0, 10))
	.union(sub([this.label, __, __], 0, 10));
    // TODO: level 10 is ad-hoc; support infinity at some point in future
};

WebSocketConnection.prototype.aggregateGestalt = function () {
    var self = this;
    return this.peerGestalt.transform(function (m, metaLevel) {
	return Route.compilePattern(true,
				    [self.label, metaLevel, Route.embeddedMatcher(m)]);
    }).union(this.relayGestalt());
};

WebSocketConnection.prototype.boot = function () {
    this.reconnect();
};

WebSocketConnection.prototype.trapexit = function () {
    this.forceclose();
};

WebSocketConnection.prototype.isConnected = function () {
    return this.sock && this.sock.readyState === this.sock.OPEN;
};

WebSocketConnection.prototype.safeSend = function (m) {
    try {
	this.sendsAttempted++;
	if (this.isConnected()) {
	    this.sock.send(m);
	    this.sendsTransmitted++;
	}
    } catch (e) {
	console.warn("Trapped exn while sending", e);
    }
};

WebSocketConnection.prototype.sendLocalRoutes = function () {
    var newLocalRoutesMessage =
	JSON.stringify(encodeEvent(Minimart.updateRoutes([this.localGestalt])));
    if (this.prevLocalRoutesMessage !== newLocalRoutesMessage) {
	this.prevLocalRoutesMessage = newLocalRoutesMessage;
	this.safeSend(newLocalRoutesMessage);
    }
};

WebSocketConnection.prototype.collectMatchers = function (getAdvertisements, level, g) {
    var extractMetaLevels = Route.compileProjection([this.label, _$, __]);
    var mls = Route.matcherKeys(g.project(extractMetaLevels, getAdvertisements, 0, level));
    for (var i = 0; i < mls.length; i++) {
	var metaLevel = mls[i][0]; // only one capture in the projection
	var extractMatchers = Route.compileProjection([this.label, metaLevel, _$]);
	var m = g.project(extractMatchers, getAdvertisements, 0, level);
	this.localGestalt = this.localGestalt.union(Route.simpleGestalt(getAdvertisements,
									Route.embeddedMatcher(m),
									metaLevel,
									level));
    }
};

WebSocketConnection.prototype.handleEvent = function (e) {
    // console.log("WebSocketConnection.handleEvent", e);
    switch (e.type) {
    case "routes":
	// TODO: GROSS - erasing by pid!
	var nLevels = e.gestalt.levelCount(0);
	var relayGestalt = Route.fullGestalt(1, nLevels).label(World.activePid());
	var g = e.gestalt.erasePath(relayGestalt);
	this.localGestalt = Route.emptyGestalt;
	for (var level = 0; level < nLevels; level++) {
	    this.collectMatchers(false, level, g);
	    this.collectMatchers(true, level, g);
	}

	this.sendLocalRoutes();
	break;
    case "message":
	var m = e.message;
	if (m.length && m.length === 3 && m[0] === this.label)
	{
	    var encoded = JSON.stringify(encodeEvent(
		Minimart.sendMessage(m[2], m[1], e.isFeedback)));
	    if (this.deduplicator.accept(encoded)) {
		this.safeSend(encoded);
	    }
	}
	break;
    }
};

WebSocketConnection.prototype.forceclose = function (keepReconnectDelay) {
    if (!keepReconnectDelay) {
	this.reconnectDelay = DEFAULT_RECONNECT_DELAY;
    }
    this.clearHeartbeatTimers();
    if (this.sock) {
	console.log("WebSocketConnection.forceclose called");
	this.sock.close();
	this.sock = null;
    }
};

WebSocketConnection.prototype.reconnect = function () {
    var self = this;
    this.forceclose(true);
    this.connectionCount++;
    this.sock = new WebSocket(this.wsurl);
    this.sock.onopen = World.wrap(function (e) { return self.onopen(e); });
    this.sock.onmessage = World.wrap(function (e) {
	self.receiveCount++;
	return self.onmessage(e);
    });
    this.sock.onclose = World.wrap(function (e) { return self.onclose(e); });
};

WebSocketConnection.prototype.onopen = function (e) {
    console.log("connected to " + this.sock.url);
    this.reconnectDelay = DEFAULT_RECONNECT_DELAY;
    this.prevLocalRoutesMessage = null;
    this.sendLocalRoutes();
};

WebSocketConnection.prototype.onmessage = function (wse) {
    // console.log("onmessage", wse);
    this.recordActivity();

    var j = JSON.parse(wse.data);
    if (j === "ping") {
	this.safeSend(JSON.stringify("pong"));
	return;
    } else if (j === "pong") {
	return; // recordActivity already took care of our timers
    }

    var e = decodeAction(j);
    switch (e.type) {
    case "routes":
	if (this.prevPeerRoutesMessage !== wse.data) {
	    this.prevPeerRoutesMessage = wse.data;
	    this.peerGestalt = e.gestalt;
	    World.updateRoutes([this.aggregateGestalt()]);
	}
	break;
    case "message":
	if (this.deduplicator.accept(wse.data)) {
	    World.send([this.label, e.metaLevel, e.message], 0, e.isFeedback);
	}
	break;
    }
};

WebSocketConnection.prototype.onclose = function (e) {
    var self = this;
    console.log("onclose", e);

    // Update routes to give clients some indication of the discontinuity
    World.updateRoutes([this.aggregateGestalt()]);

    if (this.shouldReconnect) {
	console.log("reconnecting to " + this.wsurl + " in " + this.reconnectDelay + "ms");
	setTimeout(World.wrap(function () { self.reconnect(); }), this.reconnectDelay);
	this.reconnectDelay = this.reconnectDelay * 1.618 + (Math.random() * 1000);
	this.reconnectDelay =
	    this.reconnectDelay > MAX_RECONNECT_DELAY
	    ? MAX_RECONNECT_DELAY + (Math.random() * 1000)
	    : this.reconnectDelay;
    }
};

///////////////////////////////////////////////////////////////////////////
// Wire protocol representation of events and actions

function encodeEvent(e) {
    switch (e.type) {
    case "routes":
	return ["routes", e.gestalt.serialize(function (v) { return true; })];
    case "message":
	return ["message", e.message, e.metaLevel, e.isFeedback];
    }
}

function decodeAction(j) {
    switch (j[0]) {
    case "routes":
	return Minimart.updateRoutes([
	    Route.deserializeGestalt(j[1], function (v) { return true; })]);
    case "message":
	return Minimart.sendMessage(j[1], j[2], j[3]);
    default:
	throw { message: "Invalid JSON-encoded action: " + JSON.stringify(j) };
    }
}

///////////////////////////////////////////////////////////////////////////

module.exports.WebSocketConnection = WebSocketConnection;
module.exports.encodeEvent = encodeEvent;
module.exports.decodeAction = decodeAction;

},{"./minimart.js":4}]},{},[3])
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi9ob21lL3RvbnlnL3NyYy9qcy1tYXJrZXRwbGFjZS9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnJvd3Nlci1wYWNrL19wcmVsdWRlLmpzIiwiL2hvbWUvdG9ueWcvc3JjL2pzLW1hcmtldHBsYWNlL3NyYy9kb20tZHJpdmVyLmpzIiwiL2hvbWUvdG9ueWcvc3JjL2pzLW1hcmtldHBsYWNlL3NyYy9qcXVlcnktZHJpdmVyLmpzIiwiL2hvbWUvdG9ueWcvc3JjL2pzLW1hcmtldHBsYWNlL3NyYy9tYWluLmpzIiwiL2hvbWUvdG9ueWcvc3JjL2pzLW1hcmtldHBsYWNlL3NyYy9taW5pbWFydC5qcyIsIi9ob21lL3RvbnlnL3NyYy9qcy1tYXJrZXRwbGFjZS9zcmMvcm91dGUuanMiLCIvaG9tZS90b255Zy9zcmMvanMtbWFya2V0cGxhY2Uvc3JjL3JvdXRpbmctdGFibGUtd2lkZ2V0LmpzIiwiL2hvbWUvdG9ueWcvc3JjL2pzLW1hcmtldHBsYWNlL3NyYy9zcHkuanMiLCIvaG9tZS90b255Zy9zcmMvanMtbWFya2V0cGxhY2Uvc3JjL3dha2UtZGV0ZWN0b3IuanMiLCIvaG9tZS90b255Zy9zcmMvanMtbWFya2V0cGxhY2Uvc3JjL3dlYnNvY2tldC1kcml2ZXIuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbEdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3pEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNUQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDN2lCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQy8rQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25DQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt0aHJvdyBuZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpfXZhciBmPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChmLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGYsZi5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCIvLyBET00gZnJhZ21lbnQgZGlzcGxheSBkcml2ZXJcbnZhciBNaW5pbWFydCA9IHJlcXVpcmUoXCIuL21pbmltYXJ0LmpzXCIpO1xudmFyIFdvcmxkID0gTWluaW1hcnQuV29ybGQ7XG52YXIgc3ViID0gTWluaW1hcnQuc3ViO1xudmFyIHB1YiA9IE1pbmltYXJ0LnB1YjtcbnZhciBfXyA9IE1pbmltYXJ0Ll9fO1xudmFyIF8kID0gTWluaW1hcnQuXyQ7XG5cbmZ1bmN0aW9uIHNwYXduRE9NRHJpdmVyKCkge1xuICAgIHZhciBkID0gbmV3IE1pbmltYXJ0LkRlbWFuZE1hdGNoZXIoW1wiRE9NXCIsIF8kLCBfJCwgXyRdKTtcbiAgICBkLm9uRGVtYW5kSW5jcmVhc2UgPSBmdW5jdGlvbiAoY2FwdHVyZXMpIHtcblx0dmFyIHNlbGVjdG9yID0gY2FwdHVyZXNbMF07XG5cdHZhciBmcmFnbWVudENsYXNzID0gY2FwdHVyZXNbMV07XG5cdHZhciBmcmFnbWVudFNwZWMgPSBjYXB0dXJlc1syXTtcblx0V29ybGQuc3Bhd24obmV3IERPTUZyYWdtZW50KHNlbGVjdG9yLCBmcmFnbWVudENsYXNzLCBmcmFnbWVudFNwZWMpLFxuXHRcdCAgICBbc3ViKFtcIkRPTVwiLCBzZWxlY3RvciwgZnJhZ21lbnRDbGFzcywgZnJhZ21lbnRTcGVjXSksXG5cdFx0ICAgICBzdWIoW1wiRE9NXCIsIHNlbGVjdG9yLCBmcmFnbWVudENsYXNzLCBmcmFnbWVudFNwZWNdLCAwLCAxKV0pO1xuICAgIH07XG4gICAgV29ybGQuc3Bhd24oZCk7XG59XG5cbmZ1bmN0aW9uIERPTUZyYWdtZW50KHNlbGVjdG9yLCBmcmFnbWVudENsYXNzLCBmcmFnbWVudFNwZWMpIHtcbiAgICB0aGlzLnNlbGVjdG9yID0gc2VsZWN0b3I7XG4gICAgdGhpcy5mcmFnbWVudENsYXNzID0gZnJhZ21lbnRDbGFzcztcbiAgICB0aGlzLmZyYWdtZW50U3BlYyA9IGZyYWdtZW50U3BlYztcbiAgICB0aGlzLm5vZGVzID0gdGhpcy5idWlsZE5vZGVzKCk7XG59XG5cbkRPTUZyYWdtZW50LnByb3RvdHlwZS5ib290ID0gZnVuY3Rpb24gKCkge1xuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICB2YXIgbW9uaXRvcmluZyA9IHN1YihbXCJET01cIiwgc2VsZi5zZWxlY3Rvciwgc2VsZi5mcmFnbWVudENsYXNzLCBzZWxmLmZyYWdtZW50U3BlY10sIDEsIDIpO1xuICAgIFdvcmxkLnNwYXduKG5ldyBXb3JsZChmdW5jdGlvbiAoKSB7XG5cdE1pbmltYXJ0LkpRdWVyeS5zcGF3bkpRdWVyeURyaXZlcihzZWxmLnNlbGVjdG9yK1wiID4gLlwiK3NlbGYuZnJhZ21lbnRDbGFzcywgMSk7XG5cdFdvcmxkLnNwYXduKHtcblx0ICAgIGhhbmRsZUV2ZW50OiBmdW5jdGlvbiAoZSkge1xuXHRcdGlmIChlLnR5cGUgPT09IFwicm91dGVzXCIpIHtcblx0XHQgICAgdmFyIGxldmVsID0gZS5nZXN0YWx0LmdldExldmVsKDEsIDApOyAvLyBmaW5kIHBhcnRpY2lwYW50IHBlZXJzXG5cdFx0ICAgIGlmICghZS5nZXN0YWx0LmlzRW1wdHkoKSAmJiBsZXZlbC5pc0VtcHR5KCkpIHtcblx0XHRcdFdvcmxkLnNodXRkb3duV29ybGQoKTtcblx0XHQgICAgfVxuXHRcdH1cblx0ICAgIH1cblx0fSwgW21vbml0b3JpbmddKTtcbiAgICB9KSk7XG59O1xuXG5ET01GcmFnbWVudC5wcm90b3R5cGUuaGFuZGxlRXZlbnQgPSBmdW5jdGlvbiAoZSkge1xuICAgIGlmIChlLnR5cGUgPT09IFwicm91dGVzXCIgJiYgZS5nZXN0YWx0LmlzRW1wdHkoKSkge1xuXHRmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMubm9kZXMubGVuZ3RoOyBpKyspIHtcblx0ICAgIHZhciBuID0gdGhpcy5ub2Rlc1tpXTtcblx0ICAgIG4ucGFyZW50Tm9kZS5yZW1vdmVDaGlsZChuKTtcblx0fVxuXHRXb3JsZC5leGl0KCk7XG4gICAgfVxufTtcblxuRE9NRnJhZ21lbnQucHJvdG90eXBlLmludGVycHJldFNwZWMgPSBmdW5jdGlvbiAoc3BlYykge1xuICAgIC8vIEZyYWdtZW50IHNwZWNzIGFyZSByb3VnaGx5IEpTT04tZXF1aXZhbGVudHMgb2YgU1hNTC5cbiAgICAvLyBzcGVjIDo6PT0gW1widGFnXCIsIHtcImF0dHJcIjogXCJ2YWx1ZVwiLCAuLi59LCBzcGVjLCBzcGVjLCAuLi5dXG4gICAgLy8gICAgICAgICB8IFtcInRhZ1wiLCBzcGVjLCBzcGVjLCAuLi5dXG4gICAgLy8gICAgICAgICB8IFwiY2RhdGFcIlxuICAgIGlmICh0eXBlb2Yoc3BlYykgPT09IFwic3RyaW5nXCIgfHwgdHlwZW9mKHNwZWMpID09PSBcIm51bWJlclwiKSB7XG5cdHJldHVybiBkb2N1bWVudC5jcmVhdGVUZXh0Tm9kZShzcGVjKTtcbiAgICB9IGVsc2UgaWYgKCQuaXNBcnJheShzcGVjKSkge1xuXHR2YXIgdGFnTmFtZSA9IHNwZWNbMF07XG5cdHZhciBoYXNBdHRycyA9ICQuaXNQbGFpbk9iamVjdChzcGVjWzFdKTtcblx0dmFyIGF0dHJzID0gaGFzQXR0cnMgPyBzcGVjWzFdIDoge307XG5cdHZhciBraWRJbmRleCA9IGhhc0F0dHJzID8gMiA6IDE7XG5cblx0Ly8gV293ISBTdWNoIFhTUyEgTWFueSBoYWNrcyEgU28gdnVsbmVyYWJpbGl0eSEgQW1hemUhXG5cdHZhciBuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCh0YWdOYW1lKTtcblx0Zm9yICh2YXIgYXR0ciBpbiBhdHRycykge1xuXHQgICAgaWYgKGF0dHJzLmhhc093blByb3BlcnR5KGF0dHIpKSB7XG5cdFx0bi5zZXRBdHRyaWJ1dGUoYXR0ciwgYXR0cnNbYXR0cl0pO1xuXHQgICAgfVxuXHR9XG5cdGZvciAodmFyIGkgPSBraWRJbmRleDsgaSA8IHNwZWMubGVuZ3RoOyBpKyspIHtcblx0ICAgIG4uYXBwZW5kQ2hpbGQodGhpcy5pbnRlcnByZXRTcGVjKHNwZWNbaV0pKTtcblx0fVxuXHRyZXR1cm4gbjtcbiAgICB9XG59O1xuXG5ET01GcmFnbWVudC5wcm90b3R5cGUuYnVpbGROb2RlcyA9IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgdmFyIG5vZGVzID0gW107XG4gICAgJChzZWxmLnNlbGVjdG9yKS5lYWNoKGZ1bmN0aW9uIChpbmRleCwgZG9tTm9kZSkge1xuXHR2YXIgbiA9IHNlbGYuaW50ZXJwcmV0U3BlYyhzZWxmLmZyYWdtZW50U3BlYyk7XG5cdG4uY2xhc3NMaXN0LmFkZChzZWxmLmZyYWdtZW50Q2xhc3MpO1xuXHRkb21Ob2RlLmFwcGVuZENoaWxkKG4pO1xuXHRub2Rlcy5wdXNoKG4pO1xuICAgIH0pO1xuICAgIHJldHVybiBub2Rlcztcbn07XG5cbi8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuXG5tb2R1bGUuZXhwb3J0cy5zcGF3bkRPTURyaXZlciA9IHNwYXduRE9NRHJpdmVyO1xuIiwiLy8gSlF1ZXJ5IGV2ZW50IGRyaXZlclxudmFyIE1pbmltYXJ0ID0gcmVxdWlyZShcIi4vbWluaW1hcnQuanNcIik7XG52YXIgV29ybGQgPSBNaW5pbWFydC5Xb3JsZDtcbnZhciBzdWIgPSBNaW5pbWFydC5zdWI7XG52YXIgcHViID0gTWluaW1hcnQucHViO1xudmFyIF9fID0gTWluaW1hcnQuX187XG52YXIgXyQgPSBNaW5pbWFydC5fJDtcblxuZnVuY3Rpb24gc3Bhd25KUXVlcnlEcml2ZXIoYmFzZVNlbGVjdG9yLCBtZXRhTGV2ZWwpIHtcbiAgICBtZXRhTGV2ZWwgPSBtZXRhTGV2ZWwgfHwgMDtcbiAgICB2YXIgZCA9IG5ldyBNaW5pbWFydC5EZW1hbmRNYXRjaGVyKFtcImpRdWVyeVwiLCBfJCwgXyQsIF9fXSwgbWV0YUxldmVsLFxuXHRcdFx0XHQgICAgICAge2RlbWFuZFNpZGVJc1N1YnNjcmlwdGlvbjogdHJ1ZX0pO1xuICAgIGQub25EZW1hbmRJbmNyZWFzZSA9IGZ1bmN0aW9uIChjYXB0dXJlcykge1xuXHR2YXIgc2VsZWN0b3IgPSBjYXB0dXJlc1swXTtcblx0dmFyIGV2ZW50TmFtZSA9IGNhcHR1cmVzWzFdO1xuXHRXb3JsZC5zcGF3bihuZXcgSlF1ZXJ5RXZlbnRSb3V0ZXIoYmFzZVNlbGVjdG9yLCBzZWxlY3RvciwgZXZlbnROYW1lLCBtZXRhTGV2ZWwpLFxuXHRcdCAgICBbcHViKFtcImpRdWVyeVwiLCBzZWxlY3RvciwgZXZlbnROYW1lLCBfX10sIG1ldGFMZXZlbCksXG5cdFx0ICAgICBwdWIoW1wialF1ZXJ5XCIsIHNlbGVjdG9yLCBldmVudE5hbWUsIF9fXSwgbWV0YUxldmVsLCAxKV0pO1xuICAgIH07XG4gICAgV29ybGQuc3Bhd24oZCk7XG59XG5cbmZ1bmN0aW9uIEpRdWVyeUV2ZW50Um91dGVyKGJhc2VTZWxlY3Rvciwgc2VsZWN0b3IsIGV2ZW50TmFtZSwgbWV0YUxldmVsKSB7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIHRoaXMuYmFzZVNlbGVjdG9yID0gYmFzZVNlbGVjdG9yIHx8IG51bGw7XG4gICAgdGhpcy5zZWxlY3RvciA9IHNlbGVjdG9yO1xuICAgIHRoaXMuZXZlbnROYW1lID0gZXZlbnROYW1lO1xuICAgIHRoaXMubWV0YUxldmVsID0gbWV0YUxldmVsIHx8IDA7XG4gICAgdGhpcy5wcmV2ZW50RGVmYXVsdCA9ICh0aGlzLmV2ZW50TmFtZS5jaGFyQXQoMCkgIT09IFwiK1wiKTtcbiAgICB0aGlzLmhhbmRsZXIgPVxuXHRXb3JsZC53cmFwKGZ1bmN0aW9uIChlKSB7XG5cdCAgICBXb3JsZC5zZW5kKFtcImpRdWVyeVwiLCBzZWxmLnNlbGVjdG9yLCBzZWxmLmV2ZW50TmFtZSwgZV0sIHNlbGYubWV0YUxldmVsKTtcblx0ICAgIGlmIChzZWxmLnByZXZlbnREZWZhdWx0KSBlLnByZXZlbnREZWZhdWx0KCk7XG5cdCAgICByZXR1cm4gIXNlbGYucHJldmVudERlZmF1bHQ7XG5cdH0pO1xuICAgIHRoaXMuY29tcHV0ZU5vZGVzKCkub24odGhpcy5wcmV2ZW50RGVmYXVsdCA/IHRoaXMuZXZlbnROYW1lIDogdGhpcy5ldmVudE5hbWUuc3Vic3RyaW5nKDEpLFxuXHRcdFx0ICAgdGhpcy5oYW5kbGVyKTtcbn1cblxuSlF1ZXJ5RXZlbnRSb3V0ZXIucHJvdG90eXBlLmhhbmRsZUV2ZW50ID0gZnVuY3Rpb24gKGUpIHtcbiAgICBpZiAoZS50eXBlID09PSBcInJvdXRlc1wiICYmIGUuZ2VzdGFsdC5pc0VtcHR5KCkpIHtcblx0dGhpcy5jb21wdXRlTm9kZXMoKS5vZmYodGhpcy5ldmVudE5hbWUsIHRoaXMuaGFuZGxlcik7XG5cdFdvcmxkLmV4aXQoKTtcbiAgICB9XG59O1xuXG5KUXVlcnlFdmVudFJvdXRlci5wcm90b3R5cGUuY29tcHV0ZU5vZGVzID0gZnVuY3Rpb24gKCkge1xuICAgIGlmICh0aGlzLmJhc2VTZWxlY3Rvcikge1xuXHRyZXR1cm4gJCh0aGlzLmJhc2VTZWxlY3RvcikuY2hpbGRyZW4odGhpcy5zZWxlY3RvcikuYWRkQmFjayh0aGlzLnNlbGVjdG9yKTtcbiAgICB9IGVsc2Uge1xuXHRyZXR1cm4gJCh0aGlzLnNlbGVjdG9yKTtcbiAgICB9XG59O1xuXG4vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cblxubW9kdWxlLmV4cG9ydHMuc3Bhd25KUXVlcnlEcml2ZXIgPSBzcGF3bkpRdWVyeURyaXZlcjtcbiIsIm1vZHVsZS5leHBvcnRzID0gcmVxdWlyZShcIi4vbWluaW1hcnQuanNcIik7XG5cbm1vZHVsZS5leHBvcnRzLkRPTSA9IHJlcXVpcmUoXCIuL2RvbS1kcml2ZXIuanNcIik7XG5tb2R1bGUuZXhwb3J0cy5KUXVlcnkgPSByZXF1aXJlKFwiLi9qcXVlcnktZHJpdmVyLmpzXCIpO1xubW9kdWxlLmV4cG9ydHMuUm91dGluZ1RhYmxlV2lkZ2V0ID0gcmVxdWlyZShcIi4vcm91dGluZy10YWJsZS13aWRnZXQuanNcIik7XG5tb2R1bGUuZXhwb3J0cy5XZWJTb2NrZXQgPSByZXF1aXJlKFwiLi93ZWJzb2NrZXQtZHJpdmVyLmpzXCIpO1xuXG5tb2R1bGUuZXhwb3J0cy5TcHkgPSByZXF1aXJlKFwiLi9zcHkuanNcIikuU3B5O1xubW9kdWxlLmV4cG9ydHMuV2FrZURldGVjdG9yID0gcmVxdWlyZShcIi4vd2FrZS1kZXRlY3Rvci5qc1wiKS5XYWtlRGV0ZWN0b3I7XG4iLCJ2YXIgUm91dGUgPSByZXF1aXJlKFwiLi9yb3V0ZS5qc1wiKTtcblxuLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXG5cbi8vIFRPRE86IHRyaWdnZXItZ3VhcmRzIGFzIHBlciBtaW5pbWFydFxuXG4vKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG4vKiBFdmVudHMgYW5kIEFjdGlvbnMgKi9cblxudmFyIF9fID0gUm91dGUuX187XG52YXIgXyQgPSBSb3V0ZS5fJDtcblxuZnVuY3Rpb24gc3ViKHBhdHRlcm4sIG1ldGFMZXZlbCwgbGV2ZWwpIHtcbiAgICByZXR1cm4gUm91dGUuc2ltcGxlR2VzdGFsdChmYWxzZSwgcGF0dGVybiwgbWV0YUxldmVsLCBsZXZlbCk7XG59XG5cbmZ1bmN0aW9uIHB1YihwYXR0ZXJuLCBtZXRhTGV2ZWwsIGxldmVsKSB7XG4gICAgcmV0dXJuIFJvdXRlLnNpbXBsZUdlc3RhbHQodHJ1ZSwgcGF0dGVybiwgbWV0YUxldmVsLCBsZXZlbCk7XG59XG5cbmZ1bmN0aW9uIHNwYXduKGJlaGF2aW9yLCBpbml0aWFsR2VzdGFsdHMpIHtcbiAgICByZXR1cm4geyB0eXBlOiBcInNwYXduXCIsXG5cdCAgICAgYmVoYXZpb3I6IGJlaGF2aW9yLFxuXHQgICAgIGluaXRpYWxHZXN0YWx0OiBSb3V0ZS5nZXN0YWx0VW5pb24oaW5pdGlhbEdlc3RhbHRzIHx8IFtdKSB9O1xufVxuXG5mdW5jdGlvbiB1cGRhdGVSb3V0ZXMoZ2VzdGFsdHMpIHtcbiAgICByZXR1cm4geyB0eXBlOiBcInJvdXRlc1wiLCBnZXN0YWx0OiBSb3V0ZS5nZXN0YWx0VW5pb24oZ2VzdGFsdHMpIH07XG59XG5cbmZ1bmN0aW9uIHBlbmRpbmdSb3V0aW5nVXBkYXRlKGFnZ3JlZ2F0ZSwgYWZmZWN0ZWRTdWJnZXN0YWx0LCBrbm93blRhcmdldCkge1xuICAgIHJldHVybiB7IHR5cGU6IFwicGVuZGluZ1JvdXRpbmdVcGRhdGVcIixcblx0ICAgICBhZ2dyZWdhdGU6IGFnZ3JlZ2F0ZSxcblx0ICAgICBhZmZlY3RlZFN1Ymdlc3RhbHQ6IGFmZmVjdGVkU3ViZ2VzdGFsdCxcblx0ICAgICBrbm93blRhcmdldDoga25vd25UYXJnZXQgfTtcbn1cblxuZnVuY3Rpb24gc2VuZE1lc3NhZ2UobSwgbWV0YUxldmVsLCBpc0ZlZWRiYWNrKSB7XG4gICAgcmV0dXJuIHsgdHlwZTogXCJtZXNzYWdlXCIsXG5cdCAgICAgbWV0YUxldmVsOiAobWV0YUxldmVsID09PSB1bmRlZmluZWQpID8gMCA6IG1ldGFMZXZlbCxcblx0ICAgICBtZXNzYWdlOiBtLFxuXHQgICAgIGlzRmVlZGJhY2s6IChpc0ZlZWRiYWNrID09PSB1bmRlZmluZWQpID8gZmFsc2UgOiBpc0ZlZWRiYWNrIH07XG59XG5cbmZ1bmN0aW9uIHNodXRkb3duV29ybGQoKSB7XG4gICAgcmV0dXJuIHsgdHlwZTogXCJzaHV0ZG93bldvcmxkXCIgfTtcbn1cblxuLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuLyogQ29uZmlndXJhdGlvbnMgKi9cblxuZnVuY3Rpb24gV29ybGQoYm9vdEZuKSB7XG4gICAgdGhpcy5hbGl2ZSA9IHRydWU7XG4gICAgdGhpcy5ldmVudFF1ZXVlID0gW107XG4gICAgdGhpcy5ydW5uYWJsZVBpZHMgPSB7fTtcbiAgICB0aGlzLnBhcnRpYWxHZXN0YWx0ID0gUm91dGUuZW1wdHlHZXN0YWx0OyAvLyBPbmx5IGdlc3RhbHQgZnJvbSBsb2NhbCBwcm9jZXNzZXNcbiAgICB0aGlzLmZ1bGxHZXN0YWx0ID0gUm91dGUuZW1wdHlHZXN0YWx0IDs7IC8vIHBhcnRpYWxHZXN0YWx0IHVuaW9uZWQgd2l0aCBkb3dud2FyZEdlc3RhbHRcbiAgICB0aGlzLnByb2Nlc3NUYWJsZSA9IHt9O1xuICAgIHRoaXMudG9tYnN0b25lcyA9IHt9O1xuICAgIHRoaXMuZG93bndhcmRHZXN0YWx0ID0gUm91dGUuZW1wdHlHZXN0YWx0O1xuICAgIHRoaXMucHJvY2Vzc0FjdGlvbnMgPSBbXTtcbiAgICB0aGlzLmFzQ2hpbGQoLTEsIGJvb3RGbiwgdHJ1ZSk7XG59XG5cbi8qIENsYXNzIHN0YXRlIC8gbWV0aG9kcyAqL1xuXG5Xb3JsZC5uZXh0UGlkID0gMDtcblxuV29ybGQuc3RhY2sgPSBbXTtcblxuV29ybGQuY3VycmVudCA9IGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4gV29ybGQuc3RhY2tbV29ybGQuc3RhY2subGVuZ3RoIC0gMV1bMF07XG59O1xuXG5Xb3JsZC5hY3RpdmVQaWQgPSBmdW5jdGlvbiAoKSB7XG4gICAgcmV0dXJuIFdvcmxkLnN0YWNrW1dvcmxkLnN0YWNrLmxlbmd0aCAtIDFdWzFdO1xufTtcblxuV29ybGQuc2VuZCA9IGZ1bmN0aW9uIChtLCBtZXRhTGV2ZWwsIGlzRmVlZGJhY2spIHtcbiAgICBXb3JsZC5jdXJyZW50KCkuZW5xdWV1ZUFjdGlvbihXb3JsZC5hY3RpdmVQaWQoKSwgc2VuZE1lc3NhZ2UobSwgbWV0YUxldmVsLCBpc0ZlZWRiYWNrKSk7XG59O1xuXG5Xb3JsZC51cGRhdGVSb3V0ZXMgPSBmdW5jdGlvbiAoZ2VzdGFsdHMpIHtcbiAgICBXb3JsZC5jdXJyZW50KCkuZW5xdWV1ZUFjdGlvbihXb3JsZC5hY3RpdmVQaWQoKSwgdXBkYXRlUm91dGVzKGdlc3RhbHRzKSk7XG59O1xuXG5Xb3JsZC5zcGF3biA9IGZ1bmN0aW9uIChiZWhhdmlvciwgaW5pdGlhbEdlc3RhbHRzKSB7XG4gICAgV29ybGQuY3VycmVudCgpLmVucXVldWVBY3Rpb24oV29ybGQuYWN0aXZlUGlkKCksIHNwYXduKGJlaGF2aW9yLCBpbml0aWFsR2VzdGFsdHMpKTtcbn07XG5cbldvcmxkLmV4aXQgPSBmdW5jdGlvbiAoZXhuKSB7XG4gICAgV29ybGQuY3VycmVudCgpLmtpbGwoV29ybGQuYWN0aXZlUGlkKCksIGV4bik7XG59O1xuXG5Xb3JsZC5zaHV0ZG93bldvcmxkID0gZnVuY3Rpb24gKCkge1xuICAgIFdvcmxkLmN1cnJlbnQoKS5lbnF1ZXVlQWN0aW9uKFdvcmxkLmFjdGl2ZVBpZCgpLCBzaHV0ZG93bldvcmxkKCkpO1xufTtcblxuV29ybGQud2l0aFdvcmxkU3RhY2sgPSBmdW5jdGlvbiAoc3RhY2ssIGYpIHtcbiAgICB2YXIgb2xkU3RhY2sgPSBXb3JsZC5zdGFjaztcbiAgICBXb3JsZC5zdGFjayA9IHN0YWNrO1xuICAgIHZhciByZXN1bHQgPSBudWxsO1xuICAgIHRyeSB7XG5cdHJlc3VsdCA9IGYoKTtcbiAgICB9IGNhdGNoIChlKSB7XG5cdFdvcmxkLnN0YWNrID0gb2xkU3RhY2s7XG5cdHRocm93IGU7XG4gICAgfVxuICAgIFdvcmxkLnN0YWNrID0gb2xkU3RhY2s7XG4gICAgcmV0dXJuIHJlc3VsdDtcbn07XG5cbldvcmxkLndyYXAgPSBmdW5jdGlvbiAoZikge1xuICAgIHZhciBzYXZlZFN0YWNrID0gV29ybGQuc3RhY2suc2xpY2UoKTtcbiAgICByZXR1cm4gZnVuY3Rpb24gKCkge1xuXHR2YXIgYWN0dWFscyA9IGFyZ3VtZW50cztcblx0cmV0dXJuIFdvcmxkLndpdGhXb3JsZFN0YWNrKHNhdmVkU3RhY2ssIGZ1bmN0aW9uICgpIHtcblx0ICAgIHZhciByZXN1bHQgPSBXb3JsZC5jdXJyZW50KCkuYXNDaGlsZChXb3JsZC5hY3RpdmVQaWQoKSwgZnVuY3Rpb24gKCkge1xuXHRcdHJldHVybiBmLmFwcGx5KG51bGwsIGFjdHVhbHMpO1xuXHQgICAgfSk7XG5cdCAgICBmb3IgKHZhciBpID0gV29ybGQuc3RhY2subGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcblx0XHRXb3JsZC5zdGFja1tpXVswXS5tYXJrUGlkUnVubmFibGUoV29ybGQuc3RhY2tbaV1bMV0pO1xuXHQgICAgfVxuXHQgICAgcmV0dXJuIHJlc3VsdDtcblx0fSk7XG4gICAgfTtcbn07XG5cbi8qIEluc3RhbmNlIG1ldGhvZHMgKi9cblxuV29ybGQucHJvdG90eXBlLmVucXVldWVBY3Rpb24gPSBmdW5jdGlvbiAocGlkLCBhY3Rpb24pIHtcbiAgICB0aGlzLnByb2Nlc3NBY3Rpb25zLnB1c2goW3BpZCwgYWN0aW9uXSk7XG59O1xuXG4vLyBUaGUgY29kZSBpcyB3cml0dGVuIHRvIG1haW50YWluIHRoZSBydW5uYWJsZVBpZHMgc2V0IGNhcmVmdWxseSwgdG9cbi8vIGVuc3VyZSB3ZSBjYW4gbG9jYWxseSBkZWNpZGUgd2hldGhlciB3ZSdyZSBpbmVydCBvciBub3Qgd2l0aG91dFxuLy8gaGF2aW5nIHRvIHNlYXJjaCB0aGUgd2hvbGUgZGVlcCBwcm9jZXNzIHRyZWUuXG5Xb3JsZC5wcm90b3R5cGUuaXNJbmVydCA9IGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4gdGhpcy5ldmVudFF1ZXVlLmxlbmd0aCA9PT0gMFxuXHQmJiB0aGlzLnByb2Nlc3NBY3Rpb25zLmxlbmd0aCA9PT0gMFxuXHQmJiBSb3V0ZS5pc19lbXB0eVNldCh0aGlzLnJ1bm5hYmxlUGlkcyk7XG59O1xuXG5Xb3JsZC5wcm90b3R5cGUubWFya1BpZFJ1bm5hYmxlID0gZnVuY3Rpb24gKHBpZCkge1xuICAgIHRoaXMucnVubmFibGVQaWRzW3BpZF0gPSBbcGlkXTtcbn07XG5cbldvcmxkLnByb3RvdHlwZS5zdGVwID0gZnVuY3Rpb24gKCkge1xuICAgIHRoaXMuZGlzcGF0Y2hFdmVudHMoKTtcbiAgICB0aGlzLnBlcmZvcm1BY3Rpb25zKCk7XG4gICAgdGhpcy5zdGVwQ2hpbGRyZW4oKTtcbiAgICByZXR1cm4gdGhpcy5hbGl2ZSAmJiAhdGhpcy5pc0luZXJ0KCk7XG59O1xuXG5Xb3JsZC5wcm90b3R5cGUuYXNDaGlsZCA9IGZ1bmN0aW9uIChwaWQsIGYsIG9taXRMaXZlbmVzc0NoZWNrKSB7XG4gICAgaWYgKCEocGlkIGluIHRoaXMucHJvY2Vzc1RhYmxlKSAmJiAhb21pdExpdmVuZXNzQ2hlY2spIHtcblx0Y29uc29sZS53YXJuKFwiV29ybGQuYXNDaGlsZCBlbGlkaW5nIGludm9jYXRpb24gb2YgZGVhZCBwcm9jZXNzXCIsIHBpZCk7XG5cdHJldHVybjtcbiAgICB9XG5cbiAgICBXb3JsZC5zdGFjay5wdXNoKFt0aGlzLCBwaWRdKTtcbiAgICB2YXIgcmVzdWx0ID0gbnVsbDtcbiAgICB0cnkge1xuXHRyZXN1bHQgPSBmKCk7XG4gICAgfSBjYXRjaCAoZSkge1xuXHR0aGlzLmtpbGwocGlkLCBlKTtcbiAgICB9XG4gICAgaWYgKFdvcmxkLnN0YWNrLnBvcCgpWzBdICE9PSB0aGlzKSB7XG5cdHRocm93IG5ldyBFcnJvcihcIkludGVybmFsIGVycm9yOiBXb3JsZCBzdGFjayBpbWJhbGFuY2VcIik7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG59O1xuXG5Xb3JsZC5wcm90b3R5cGUua2lsbCA9IGZ1bmN0aW9uIChwaWQsIGV4bikge1xuICAgIGlmIChleG4gJiYgZXhuLnN0YWNrKSB7XG5cdGNvbnNvbGUubG9nKFwiUHJvY2VzcyBleGl0ZWRcIiwgcGlkLCBleG4sIGV4bi5zdGFjayk7XG4gICAgfSBlbHNlIHtcblx0Y29uc29sZS5sb2coXCJQcm9jZXNzIGV4aXRlZFwiLCBwaWQsIGV4bik7XG4gICAgfVxuICAgIHZhciBwID0gdGhpcy5wcm9jZXNzVGFibGVbcGlkXTtcbiAgICBpZiAocCAmJiBwLmJlaGF2aW9yLnRyYXBleGl0KSB7XG5cdHRoaXMuYXNDaGlsZChwaWQsIGZ1bmN0aW9uICgpIHsgcmV0dXJuIHAuYmVoYXZpb3IudHJhcGV4aXQoZXhuKTsgfSk7XG4gICAgfVxuICAgIGRlbGV0ZSB0aGlzLnByb2Nlc3NUYWJsZVtwaWRdO1xuICAgIGlmIChwKSB7XG5cdGlmIChleG4pIHtcblx0ICAgIHAuZXhpdFJlYXNvbiA9IGV4bjtcblx0ICAgIHRoaXMudG9tYnN0b25lc1twaWRdID0gcDtcblx0fVxuXHR0aGlzLmFwcGx5QW5kSXNzdWVSb3V0aW5nVXBkYXRlKHAuZ2VzdGFsdCwgUm91dGUuZW1wdHlHZXN0YWx0KTtcbiAgICB9XG59O1xuXG5Xb3JsZC5wcm90b3R5cGUuc3RlcENoaWxkcmVuID0gZnVuY3Rpb24gKCkge1xuICAgIHZhciBwaWRzID0gdGhpcy5ydW5uYWJsZVBpZHM7XG4gICAgdGhpcy5ydW5uYWJsZVBpZHMgPSB7fTtcbiAgICBmb3IgKHZhciBwaWQgaW4gcGlkcykge1xuXHR2YXIgcCA9IHRoaXMucHJvY2Vzc1RhYmxlW3BpZF07XG5cdGlmIChwICYmIHAuYmVoYXZpb3Iuc3RlcCAvKiBleGlzdHMsIGhhdmVuJ3QgY2FsbGVkIGl0IHlldCAqLykge1xuXHQgICAgdmFyIGNoaWxkQnVzeSA9IHRoaXMuYXNDaGlsZChwaWQgfCAwLCBmdW5jdGlvbiAoKSB7IHJldHVybiBwLmJlaGF2aW9yLnN0ZXAoKSB9KTtcblx0ICAgIGlmIChjaGlsZEJ1c3kpIHRoaXMubWFya1BpZFJ1bm5hYmxlKHBpZCk7XG5cdH1cbiAgICB9XG59O1xuXG5Xb3JsZC5wcm90b3R5cGUucGVyZm9ybUFjdGlvbnMgPSBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIHF1ZXVlID0gdGhpcy5wcm9jZXNzQWN0aW9ucztcbiAgICB0aGlzLnByb2Nlc3NBY3Rpb25zID0gW107XG4gICAgdmFyIGl0ZW07XG4gICAgd2hpbGUgKChpdGVtID0gcXVldWUuc2hpZnQoKSkgJiYgdGhpcy5hbGl2ZSkge1xuXHR0aGlzLnBlcmZvcm1BY3Rpb24oaXRlbVswXSwgaXRlbVsxXSk7XG4gICAgfVxufTtcblxuV29ybGQucHJvdG90eXBlLmRpc3BhdGNoRXZlbnRzID0gZnVuY3Rpb24gKCkge1xuICAgIHZhciBxdWV1ZSA9IHRoaXMuZXZlbnRRdWV1ZTtcbiAgICB0aGlzLmV2ZW50UXVldWUgPSBbXTtcbiAgICB2YXIgaXRlbTtcbiAgICB3aGlsZSAoKGl0ZW0gPSBxdWV1ZS5zaGlmdCgpKSkge1xuXHR0aGlzLmRpc3BhdGNoRXZlbnQoaXRlbSk7XG4gICAgfVxufTtcblxuV29ybGQucHJvdG90eXBlLnBlcmZvcm1BY3Rpb24gPSBmdW5jdGlvbiAocGlkLCBhY3Rpb24pIHtcbiAgICBzd2l0Y2ggKGFjdGlvbi50eXBlKSB7XG4gICAgY2FzZSBcInNwYXduXCI6XG5cdHZhciBwaWQgPSBXb3JsZC5uZXh0UGlkKys7XG5cdHZhciBuZXdHZXN0YWx0ID0gYWN0aW9uLmluaXRpYWxHZXN0YWx0LmxhYmVsKHBpZCk7XG5cdHRoaXMucHJvY2Vzc1RhYmxlW3BpZF0gPSB7IGdlc3RhbHQ6IG5ld0dlc3RhbHQsIGJlaGF2aW9yOiBhY3Rpb24uYmVoYXZpb3IgfTtcblx0aWYgKGFjdGlvbi5iZWhhdmlvci5ib290KSB7XG5cdCAgICB0aGlzLmFzQ2hpbGQocGlkLCBmdW5jdGlvbiAoKSB7IGFjdGlvbi5iZWhhdmlvci5ib290KCkgfSk7XG5cdCAgICB0aGlzLm1hcmtQaWRSdW5uYWJsZShwaWQpO1xuXHR9XG5cdHRoaXMuYXBwbHlBbmRJc3N1ZVJvdXRpbmdVcGRhdGUoUm91dGUuZW1wdHlHZXN0YWx0LCBuZXdHZXN0YWx0LCBwaWQpO1xuXHRicmVhaztcbiAgICBjYXNlIFwicm91dGVzXCI6XG5cdGlmIChwaWQgaW4gdGhpcy5wcm9jZXNzVGFibGUpIHtcblx0ICAgIC8vIGl0IG1heSBub3QgYmU6IHRoaXMgbWlnaHQgYmUgdGhlIHJvdXRpbmcgdXBkYXRlIGZyb20gYVxuXHQgICAgLy8ga2lsbCBvZiB0aGUgcHJvY2Vzc1xuXHQgICAgdmFyIG9sZEdlc3RhbHQgPSB0aGlzLnByb2Nlc3NUYWJsZVtwaWRdLmdlc3RhbHQ7XG5cdCAgICB2YXIgbmV3R2VzdGFsdCA9IGFjdGlvbi5nZXN0YWx0LmxhYmVsKHBpZHwwKTtcblx0ICAgIC8vIF4gcGlkfDA6IGNvbnZlcnQgcGlkIGZyb20gc3RyaW5nICh0YWJsZSBrZXkhKSB0byBpbnRlZ2VyXG5cdCAgICB0aGlzLnByb2Nlc3NUYWJsZVtwaWRdLmdlc3RhbHQgPSBuZXdHZXN0YWx0O1xuXHQgICAgdGhpcy5hcHBseUFuZElzc3VlUm91dGluZ1VwZGF0ZShvbGRHZXN0YWx0LCBuZXdHZXN0YWx0LCBwaWQpO1xuXHR9XG5cdGJyZWFrO1xuICAgIGNhc2UgXCJtZXNzYWdlXCI6XG5cdGlmIChhY3Rpb24ubWV0YUxldmVsID09PSAwKSB7XG5cdCAgICB0aGlzLmV2ZW50UXVldWUucHVzaChhY3Rpb24pO1xuXHR9IGVsc2Uge1xuXHQgICAgV29ybGQuc2VuZChhY3Rpb24ubWVzc2FnZSwgYWN0aW9uLm1ldGFMZXZlbCAtIDEsIGFjdGlvbi5pc0ZlZWRiYWNrKTtcblx0fVxuXHRicmVhaztcbiAgICBjYXNlIFwic2h1dGRvd25Xb3JsZFwiOlxuXHR0aGlzLmFsaXZlID0gZmFsc2U7IC8vIGZvcmNlIHVzIHRvIHN0b3AgZG9pbmcgdGhpbmdzIGltbWVkaWF0ZWx5XG5cdFdvcmxkLmV4aXQoKTtcblx0YnJlYWs7XG4gICAgZGVmYXVsdDpcblx0dmFyIGV4biA9IG5ldyBFcnJvcihcIkFjdGlvbiB0eXBlIFwiICsgYWN0aW9uLnR5cGUgKyBcIiBub3QgdW5kZXJzdG9vZFwiKTtcblx0ZXhuLmFjdGlvbiA9IGFjdGlvbjtcblx0dGhyb3cgZXhuO1xuICAgIH1cbn07XG5cbldvcmxkLnByb3RvdHlwZS51cGRhdGVGdWxsR2VzdGFsdCA9IGZ1bmN0aW9uICgpIHtcbiAgICB0aGlzLmZ1bGxHZXN0YWx0ID0gdGhpcy5wYXJ0aWFsR2VzdGFsdC51bmlvbih0aGlzLmRvd253YXJkR2VzdGFsdCk7XG59O1xuXG5Xb3JsZC5wcm90b3R5cGUuaXNzdWVMb2NhbFJvdXRpbmdVcGRhdGUgPSBmdW5jdGlvbiAoYWZmZWN0ZWRTdWJnZXN0YWx0LCBrbm93blRhcmdldCkge1xuICAgIHRoaXMuZXZlbnRRdWV1ZS5wdXNoKHBlbmRpbmdSb3V0aW5nVXBkYXRlKHRoaXMuZnVsbEdlc3RhbHQsXG5cdFx0XHRcdFx0ICAgICAgYWZmZWN0ZWRTdWJnZXN0YWx0LFxuXHRcdFx0XHRcdCAgICAgIGtub3duVGFyZ2V0KSk7XG59O1xuXG5Xb3JsZC5wcm90b3R5cGUuYXBwbHlBbmRJc3N1ZVJvdXRpbmdVcGRhdGUgPSBmdW5jdGlvbiAob2xkZywgbmV3Zywga25vd25UYXJnZXQpIHtcbiAgICBrbm93blRhcmdldCA9IHR5cGVvZiBrbm93blRhcmdldCA9PT0gJ3VuZGVmaW5lZCcgPyBudWxsIDoga25vd25UYXJnZXQ7XG4gICAgdGhpcy5wYXJ0aWFsR2VzdGFsdCA9IHRoaXMucGFydGlhbEdlc3RhbHQuZXJhc2VQYXRoKG9sZGcpLnVuaW9uKG5ld2cpO1xuICAgIHRoaXMudXBkYXRlRnVsbEdlc3RhbHQoKTtcbiAgICB0aGlzLmlzc3VlTG9jYWxSb3V0aW5nVXBkYXRlKG9sZGcudW5pb24obmV3ZyksIGtub3duVGFyZ2V0KTtcbiAgICBXb3JsZC51cGRhdGVSb3V0ZXMoW3RoaXMucGFydGlhbEdlc3RhbHQuZHJvcCgpXSk7XG59O1xuXG5Xb3JsZC5wcm90b3R5cGUuZGlzcGF0Y2hFdmVudCA9IGZ1bmN0aW9uIChlKSB7XG4gICAgc3dpdGNoIChlLnR5cGUpIHtcbiAgICBjYXNlIFwicGVuZGluZ1JvdXRpbmdVcGRhdGVcIjpcblx0dmFyIHBpZHMgPSBlLmFmZmVjdGVkU3ViZ2VzdGFsdC5tYXRjaChlLmFnZ3JlZ2F0ZSk7XG5cdGlmIChlLmtub3duVGFyZ2V0ICE9PSBudWxsKSBwaWRzLnVuc2hpZnQoZS5rbm93blRhcmdldCk7XG5cdGZvciAodmFyIGkgPSAwOyBpIDwgcGlkcy5sZW5ndGg7IGkrKykge1xuXHQgICAgdmFyIHBpZCA9IHBpZHNbaV07XG5cdCAgICBpZiAocGlkID09PSBcIm91dFwiKSBjb25zb2xlLndhcm4oXCJXb3VsZCBoYXZlIGRlbGl2ZXJlZCBhIHJvdXRpbmcgdXBkYXRlIHRvIGVudmlyb25tZW50XCIpO1xuXHQgICAgdmFyIHAgPSB0aGlzLnByb2Nlc3NUYWJsZVtwaWRdO1xuXHQgICAgaWYgKHApIHtcblx0XHR2YXIgZyA9IGUuYWdncmVnYXRlLmZpbHRlcihwLmdlc3RhbHQpO1xuXHRcdHRoaXMuYXNDaGlsZChwaWQsIGZ1bmN0aW9uICgpIHsgcC5iZWhhdmlvci5oYW5kbGVFdmVudCh1cGRhdGVSb3V0ZXMoW2ddKSkgfSk7XG5cdFx0dGhpcy5tYXJrUGlkUnVubmFibGUocGlkKTtcblx0ICAgIH1cblx0fVxuXHRicmVhaztcblxuICAgIGNhc2UgXCJtZXNzYWdlXCI6XG5cdHZhciBwaWRzID0gdGhpcy5wYXJ0aWFsR2VzdGFsdC5tYXRjaFZhbHVlKGUubWVzc2FnZSwgZS5tZXRhTGV2ZWwsIGUuaXNGZWVkYmFjayk7XG5cdGZvciAodmFyIGkgPSAwOyBpIDwgcGlkcy5sZW5ndGg7IGkrKykge1xuXHQgICAgdmFyIHBpZCA9IHBpZHNbaV07XG5cdCAgICB2YXIgcCA9IHRoaXMucHJvY2Vzc1RhYmxlW3BpZF07XG5cdCAgICB0aGlzLmFzQ2hpbGQocGlkLCBmdW5jdGlvbiAoKSB7IHAuYmVoYXZpb3IuaGFuZGxlRXZlbnQoZSkgfSk7XG5cdCAgICB0aGlzLm1hcmtQaWRSdW5uYWJsZShwaWQpO1xuXHR9XG5cdGJyZWFrO1xuXG4gICAgZGVmYXVsdDpcblx0dmFyIGV4biA9IG5ldyBFcnJvcihcIkV2ZW50IHR5cGUgXCIgKyBlLnR5cGUgKyBcIiBub3QgZGlzcGF0Y2hhYmxlXCIpO1xuXHRleG4uZXZlbnQgPSBlO1xuXHR0aHJvdyBleG47XG4gICAgfVxufTtcblxuV29ybGQucHJvdG90eXBlLmhhbmRsZUV2ZW50ID0gZnVuY3Rpb24gKGUpIHtcbiAgICBzd2l0Y2ggKGUudHlwZSkge1xuICAgIGNhc2UgXCJyb3V0ZXNcIjpcblx0dmFyIG9sZERvd253YXJkID0gdGhpcy5kb3dud2FyZEdlc3RhbHQ7XG5cdHRoaXMuZG93bndhcmRHZXN0YWx0ID0gZS5nZXN0YWx0LmxhYmVsKFwib3V0XCIpLmxpZnQoKTtcblx0dGhpcy51cGRhdGVGdWxsR2VzdGFsdCgpO1xuXHR0aGlzLmlzc3VlTG9jYWxSb3V0aW5nVXBkYXRlKG9sZERvd253YXJkLnVuaW9uKHRoaXMuZG93bndhcmRHZXN0YWx0KSwgbnVsbCk7XG5cdGJyZWFrO1xuICAgIGNhc2UgXCJtZXNzYWdlXCI6XG5cdHRoaXMuZXZlbnRRdWV1ZS5wdXNoKHNlbmRNZXNzYWdlKGUubWVzc2FnZSwgZS5tZXRhTGV2ZWwgKyAxLCBlLmlzRmVlZGJhY2spKTtcblx0YnJlYWs7XG4gICAgZGVmYXVsdDpcblx0dmFyIGV4biA9IG5ldyBFcnJvcihcIkV2ZW50IHR5cGUgXCIgKyBlLnR5cGUgKyBcIiBub3QgdW5kZXJzdG9vZFwiKTtcblx0ZXhuLmV2ZW50ID0gZTtcblx0dGhyb3cgZXhuO1xuICAgIH1cbn07XG5cbi8qIERlYnVnZ2luZywgbWFuYWdlbWVudCwgYW5kIG1vbml0b3JpbmcgKi9cblxuV29ybGQucHJvdG90eXBlLnByb2Nlc3NUcmVlID0gZnVuY3Rpb24gKCkge1xuICAgIHZhciBraWRzID0gW107XG4gICAgZm9yICh2YXIgcGlkIGluIHRoaXMucHJvY2Vzc1RhYmxlKSB7XG5cdHZhciBwID0gdGhpcy5wcm9jZXNzVGFibGVbcGlkXTtcblx0aWYgKHAuYmVoYXZpb3IgaW5zdGFuY2VvZiBXb3JsZCkge1xuXHQgICAga2lkcy5wdXNoKFtwaWQsIHAuYmVoYXZpb3IucHJvY2Vzc1RyZWUoKV0pO1xuXHR9IGVsc2Uge1xuXHQgICAga2lkcy5wdXNoKFtwaWQsIHBdKTtcblx0fVxuICAgIH1cbiAgICBmb3IgKHZhciBwaWQgaW4gdGhpcy50b21ic3RvbmVzKSB7XG5cdGtpZHMucHVzaChbcGlkLCB0aGlzLnRvbWJzdG9uZXNbcGlkXV0pO1xuICAgIH1cbiAgICBraWRzLnNvcnQoKTtcbiAgICByZXR1cm4ga2lkcztcbn07XG5cbldvcmxkLnByb3RvdHlwZS50ZXh0UHJvY2Vzc1RyZWUgPSBmdW5jdGlvbiAob3duUGlkKSB7XG4gICAgdmFyIGxpbmVzID0gW107XG5cbiAgICBmdW5jdGlvbiBkdW1wUHJvY2VzcyhwcmVmaXgsIHBpZCwgcCkge1xuXHRpZiAocCBpbnN0YW5jZW9mIEFycmF5KSB7XG5cdCAgICBsaW5lcy5wdXNoKHByZWZpeCArICctLSsgJyArIHBpZCk7XG5cdCAgICBmb3IgKHZhciBpID0gMDsgaSA8IHAubGVuZ3RoOyBpKyspIHtcblx0XHRkdW1wUHJvY2VzcyhwcmVmaXggKyAnICB8JywgcFtpXVswXSwgcFtpXVsxXSk7XG5cdCAgICB9XG5cdCAgICBsaW5lcy5wdXNoKHByZWZpeCk7XG5cdH0gZWxzZSB7XG5cdCAgICB2YXIgbGFiZWwgPSBwLmJlaGF2aW9yLm5hbWUgfHwgcC5iZWhhdmlvci5jb25zdHJ1Y3Rvci5uYW1lIHx8ICcnO1xuXHQgICAgdmFyIHRvbWJzdG9uZVN0cmluZyA9IHAuZXhpdFJlYXNvbiA/ICcgKEVYSVRFRDogJyArIHAuZXhpdFJlYXNvbiArICcpICcgOiAnJztcblx0ICAgIGxpbmVzLnB1c2gocHJlZml4ICsgJy0tICcgKyBwaWQgKyAnOiAnICsgbGFiZWwgK1xuXHRcdCAgICAgICB0b21ic3RvbmVTdHJpbmcgK1xuXHRcdCAgICAgICBKU09OLnN0cmluZ2lmeShwLmJlaGF2aW9yLCBmdW5jdGlvbiAoaywgdikge1xuXHRcdFx0ICAgcmV0dXJuIGsgPT09ICduYW1lJyA/IHVuZGVmaW5lZCA6IHY7XG5cdFx0ICAgICAgIH0pKTtcblx0fVxuICAgIH1cblxuICAgIGR1bXBQcm9jZXNzKCcnLCBvd25QaWQgfHwgJycsIHRoaXMucHJvY2Vzc1RyZWUoKSk7XG4gICAgcmV0dXJuIGxpbmVzLmpvaW4oJ1xcbicpO1xufTtcblxuV29ybGQucHJvdG90eXBlLmNsZWFyVG9tYnN0b25lcyA9IGZ1bmN0aW9uICgpIHtcbiAgICB0aGlzLnRvbWJzdG9uZXMgPSB7fTtcbiAgICBmb3IgKHZhciBwaWQgaW4gdGhpcy5wcm9jZXNzVGFibGUpIHtcblx0dmFyIHAgPSB0aGlzLnByb2Nlc3NUYWJsZVtwaWRdO1xuXHRpZiAocC5iZWhhdmlvciBpbnN0YW5jZW9mIFdvcmxkKSB7XG5cdCAgICBwLmJlaGF2aW9yLmNsZWFyVG9tYnN0b25lcygpO1xuXHR9XG4gICAgfVxufTtcblxuLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuLyogVXRpbGl0aWVzOiBtYXRjaGluZyBkZW1hbmQgZm9yIHNvbWUgc2VydmljZSAqL1xuXG5mdW5jdGlvbiBEZW1hbmRNYXRjaGVyKHByb2plY3Rpb24sIG1ldGFMZXZlbCwgb3B0aW9ucykge1xuICAgIG9wdGlvbnMgPSAkLmV4dGVuZCh7XG5cdGRlbWFuZExldmVsOiAwLFxuXHRzdXBwbHlMZXZlbDogMCxcblx0ZGVtYW5kU2lkZUlzU3Vic2NyaXB0aW9uOiBmYWxzZVxuICAgIH0sIG9wdGlvbnMpO1xuICAgIHRoaXMucGF0dGVybiA9IFJvdXRlLnByb2plY3Rpb25Ub1BhdHRlcm4ocHJvamVjdGlvbik7XG4gICAgdGhpcy5wcm9qZWN0aW9uU3BlYyA9IFJvdXRlLmNvbXBpbGVQcm9qZWN0aW9uKHByb2plY3Rpb24pO1xuICAgIHRoaXMubWV0YUxldmVsID0gbWV0YUxldmVsIHwgMDtcbiAgICB0aGlzLmRlbWFuZExldmVsID0gb3B0aW9ucy5kZW1hbmRMZXZlbDtcbiAgICB0aGlzLnN1cHBseUxldmVsID0gb3B0aW9ucy5zdXBwbHlMZXZlbDtcbiAgICB0aGlzLmRlbWFuZFNpZGVJc1N1YnNjcmlwdGlvbiA9IG9wdGlvbnMuZGVtYW5kU2lkZUlzU3Vic2NyaXB0aW9uO1xuICAgIHRoaXMub25EZW1hbmRJbmNyZWFzZSA9IGZ1bmN0aW9uIChjYXB0dXJlcykge1xuXHRjb25zb2xlLmVycm9yKFwiVW5oYW5kbGVkIGluY3JlYXNlIGluIGRlbWFuZCBmb3Igcm91dGVcIiwgY2FwdHVyZXMpO1xuICAgIH07XG4gICAgdGhpcy5vblN1cHBseURlY3JlYXNlID0gZnVuY3Rpb24gKGNhcHR1cmVzKSB7XG5cdGNvbnNvbGUuZXJyb3IoXCJVbmhhbmRsZWQgZGVjcmVhc2UgaW4gc3VwcGx5IGZvciByb3V0ZVwiLCBjYXB0dXJlcyk7XG4gICAgfTtcbiAgICB0aGlzLmN1cnJlbnREZW1hbmQgPSB7fTtcbiAgICB0aGlzLmN1cnJlbnRTdXBwbHkgPSB7fTtcbn1cblxuRGVtYW5kTWF0Y2hlci5wcm90b3R5cGUuYm9vdCA9IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgb2JzZXJ2ZXJMZXZlbCA9IDEgKyBNYXRoLm1heCh0aGlzLmRlbWFuZExldmVsLCB0aGlzLnN1cHBseUxldmVsKTtcbiAgICBXb3JsZC51cGRhdGVSb3V0ZXMoW3N1Yih0aGlzLnBhdHRlcm4sIHRoaXMubWV0YUxldmVsLCBvYnNlcnZlckxldmVsKSxcblx0XHRcdHB1Yih0aGlzLnBhdHRlcm4sIHRoaXMubWV0YUxldmVsLCBvYnNlcnZlckxldmVsKV0pO1xufTtcblxuRGVtYW5kTWF0Y2hlci5wcm90b3R5cGUuaGFuZGxlRXZlbnQgPSBmdW5jdGlvbiAoZSkge1xuICAgIGlmIChlLnR5cGUgPT09IFwicm91dGVzXCIpIHtcblx0dGhpcy5oYW5kbGVHZXN0YWx0KGUuZ2VzdGFsdCk7XG4gICAgfVxufTtcblxuRGVtYW5kTWF0Y2hlci5wcm90b3R5cGUuaGFuZGxlR2VzdGFsdCA9IGZ1bmN0aW9uIChnZXN0YWx0KSB7XG4gICAgdmFyIG5ld0RlbWFuZE1hdGNoZXIgPSBnZXN0YWx0LnByb2plY3QodGhpcy5wcm9qZWN0aW9uU3BlYyxcblx0XHRcdFx0XHQgICAhdGhpcy5kZW1hbmRTaWRlSXNTdWJzY3JpcHRpb24sXG5cdFx0XHRcdFx0ICAgdGhpcy5tZXRhTGV2ZWwsXG5cdFx0XHRcdFx0ICAgdGhpcy5kZW1hbmRMZXZlbCk7XG4gICAgdmFyIG5ld1N1cHBseU1hdGNoZXIgPSBnZXN0YWx0LnByb2plY3QodGhpcy5wcm9qZWN0aW9uU3BlYyxcblx0XHRcdFx0XHQgICB0aGlzLmRlbWFuZFNpZGVJc1N1YnNjcmlwdGlvbixcblx0XHRcdFx0XHQgICB0aGlzLm1ldGFMZXZlbCxcblx0XHRcdFx0XHQgICB0aGlzLnN1cHBseUxldmVsKTtcbiAgICB2YXIgbmV3RGVtYW5kID0gUm91dGUuYXJyYXlUb1NldChSb3V0ZS5tYXRjaGVyS2V5cyhuZXdEZW1hbmRNYXRjaGVyKSk7XG4gICAgdmFyIG5ld1N1cHBseSA9IFJvdXRlLmFycmF5VG9TZXQoUm91dGUubWF0Y2hlcktleXMobmV3U3VwcGx5TWF0Y2hlcikpO1xuICAgIHZhciBkZW1hbmREZWx0YSA9IFJvdXRlLnNldFN1YnRyYWN0KG5ld0RlbWFuZCwgdGhpcy5jdXJyZW50RGVtYW5kKTtcbiAgICB2YXIgc3VwcGx5RGVsdGEgPSBSb3V0ZS5zZXRTdWJ0cmFjdCh0aGlzLmN1cnJlbnRTdXBwbHksIG5ld1N1cHBseSk7XG4gICAgdmFyIGRlbWFuZEluY3IgPSBSb3V0ZS5zZXRTdWJ0cmFjdChkZW1hbmREZWx0YSwgbmV3U3VwcGx5KTtcbiAgICB2YXIgc3VwcGx5RGVjciA9IFJvdXRlLnNldEludGVyc2VjdChzdXBwbHlEZWx0YSwgbmV3RGVtYW5kKTtcbiAgICB0aGlzLmN1cnJlbnREZW1hbmQgPSBuZXdEZW1hbmQ7XG4gICAgdGhpcy5jdXJyZW50U3VwcGx5ID0gbmV3U3VwcGx5O1xuICAgIGZvciAodmFyIGsgaW4gZGVtYW5kSW5jcikgdGhpcy5vbkRlbWFuZEluY3JlYXNlKGRlbWFuZEluY3Jba10pO1xuICAgIGZvciAodmFyIGsgaW4gc3VwcGx5RGVjcikgdGhpcy5vblN1cHBseURlY3JlYXNlKHN1cHBseURlY3Jba10pO1xufTtcblxuLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuLyogVXRpbGl0aWVzOiBkZWR1cGxpY2F0b3IgKi9cblxuZnVuY3Rpb24gRGVkdXBsaWNhdG9yKHR0bF9tcykge1xuICAgIHRoaXMudHRsX21zID0gdHRsX21zIHx8IDEwMDAwO1xuICAgIHRoaXMucXVldWUgPSBbXTtcbiAgICB0aGlzLm1hcCA9IHt9O1xuICAgIHRoaXMudGltZXJJZCA9IG51bGw7XG59XG5cbkRlZHVwbGljYXRvci5wcm90b3R5cGUuYWNjZXB0ID0gZnVuY3Rpb24gKG0pIHtcbiAgICB2YXIgcyA9IEpTT04uc3RyaW5naWZ5KG0pO1xuICAgIGlmIChzIGluIHRoaXMubWFwKSByZXR1cm4gZmFsc2U7XG4gICAgdmFyIGVudHJ5ID0gWygrbmV3IERhdGUoKSkgKyB0aGlzLnR0bF9tcywgcywgbV07XG4gICAgdGhpcy5tYXBbc10gPSBlbnRyeTtcbiAgICB0aGlzLnF1ZXVlLnB1c2goZW50cnkpO1xuXG4gICAgaWYgKHRoaXMudGltZXJJZCA9PT0gbnVsbCkge1xuXHR2YXIgc2VsZiA9IHRoaXM7XG5cdHRoaXMudGltZXJJZCA9IHNldEludGVydmFsKGZ1bmN0aW9uICgpIHsgc2VsZi5leHBpcmVNZXNzYWdlcygpOyB9LFxuXHRcdFx0XHQgICB0aGlzLnR0bF9tcyA+IDEwMDAgPyAxMDAwIDogdGhpcy50dGxfbXMpO1xuICAgIH1cbiAgICByZXR1cm4gdHJ1ZTtcbn07XG5cbkRlZHVwbGljYXRvci5wcm90b3R5cGUuZXhwaXJlTWVzc2FnZXMgPSBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIG5vdyA9ICtuZXcgRGF0ZSgpO1xuICAgIHdoaWxlICh0aGlzLnF1ZXVlLmxlbmd0aCA+IDAgJiYgdGhpcy5xdWV1ZVswXVswXSA8PSBub3cpIHtcblx0dmFyIGVudHJ5ID0gdGhpcy5xdWV1ZS5zaGlmdCgpO1xuXHRkZWxldGUgdGhpcy5tYXBbZW50cnlbMV1dO1xuICAgIH1cbiAgICBpZiAodGhpcy5xdWV1ZS5sZW5ndGggPT09IDApIHtcblx0Y2xlYXJJbnRlcnZhbCh0aGlzLnRpbWVySWQpO1xuXHR0aGlzLnRpbWVySWQgPSBudWxsO1xuICAgIH1cbn07XG5cbi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cbi8qIEdyb3VuZCBpbnRlcmZhY2UgKi9cblxuZnVuY3Rpb24gR3JvdW5kKGJvb3RGbikge1xuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICB0aGlzLnN0ZXBwZXJJZCA9IG51bGw7XG4gICAgV29ybGQud2l0aFdvcmxkU3RhY2soW1t0aGlzLCAtMV1dLCBmdW5jdGlvbiAoKSB7XG5cdHNlbGYud29ybGQgPSBuZXcgV29ybGQoYm9vdEZuKTtcbiAgICB9KTtcbn1cblxuR3JvdW5kLnByb3RvdHlwZS5zdGVwID0gZnVuY3Rpb24gKCkge1xuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICByZXR1cm4gV29ybGQud2l0aFdvcmxkU3RhY2soW1t0aGlzLCAtMV1dLCBmdW5jdGlvbiAoKSB7XG5cdHJldHVybiBzZWxmLndvcmxkLnN0ZXAoKTtcbiAgICB9KTtcbn07XG5cbkdyb3VuZC5wcm90b3R5cGUuY2hlY2tQaWQgPSBmdW5jdGlvbiAocGlkKSB7XG4gICAgaWYgKHBpZCAhPT0gLTEpIGNvbnNvbGUuZXJyb3IoXCJXZWlyZCBwaWQgaW4gR3JvdW5kIG1hcmtQaWRSdW5uYWJsZVwiLCBwaWQpO1xufTsgICAgXG5cbkdyb3VuZC5wcm90b3R5cGUubWFya1BpZFJ1bm5hYmxlID0gZnVuY3Rpb24gKHBpZCkge1xuICAgIHRoaXMuY2hlY2tQaWQocGlkKTtcbiAgICB0aGlzLnN0YXJ0U3RlcHBpbmcoKTtcbn07XG5cbkdyb3VuZC5wcm90b3R5cGUuc3RhcnRTdGVwcGluZyA9IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgaWYgKHRoaXMuc3RlcHBlcklkKSByZXR1cm47XG4gICAgaWYgKHRoaXMuc3RlcCgpKSB7XG5cdHRoaXMuc3RlcHBlcklkID0gc2V0VGltZW91dChmdW5jdGlvbiAoKSB7XG5cdCAgICBzZWxmLnN0ZXBwZXJJZCA9IG51bGw7XG5cdCAgICBzZWxmLnN0YXJ0U3RlcHBpbmcoKTtcblx0fSwgMCk7XG4gICAgfVxufTtcblxuR3JvdW5kLnByb3RvdHlwZS5zdG9wU3RlcHBpbmcgPSBmdW5jdGlvbiAoKSB7XG4gICAgaWYgKHRoaXMuc3RlcHBlcklkKSB7XG5cdGNsZWFyVGltZW91dCh0aGlzLnN0ZXBwZXJJZCk7XG5cdHRoaXMuc3RlcHBlcklkID0gbnVsbDtcbiAgICB9XG59O1xuXG5Hcm91bmQucHJvdG90eXBlLmVucXVldWVBY3Rpb24gPSBmdW5jdGlvbiAocGlkLCBhY3Rpb24pIHtcbiAgICB0aGlzLmNoZWNrUGlkKHBpZCk7XG4gICAgaWYgKGFjdGlvbi50eXBlID09PSAncm91dGVzJykge1xuXHRpZiAoIWFjdGlvbi5nZXN0YWx0LmlzRW1wdHkoKSkge1xuXHQgICAgY29uc29sZS5lcnJvcihcIllvdSBoYXZlIHN1YnNjcmliZWQgdG8gYSBub25leGlzdGVudCBldmVudCBzb3VyY2UuXCIsXG5cdFx0XHQgIGFjdGlvbi5nZXN0YWx0LnByZXR0eSgpKTtcblx0fVxuICAgIH0gZWxzZSB7XG5cdGNvbnNvbGUuZXJyb3IoXCJZb3UgaGF2ZSBzZW50IGEgbWVzc2FnZSBpbnRvIHRoZSBvdXRlciB2b2lkLlwiLCBhY3Rpb24pO1xuICAgIH1cbn07XG5cbi8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuXG5tb2R1bGUuZXhwb3J0cy5fXyA9IF9fO1xubW9kdWxlLmV4cG9ydHMuXyQgPSBfJDtcblxubW9kdWxlLmV4cG9ydHMuc3ViID0gc3ViO1xubW9kdWxlLmV4cG9ydHMucHViID0gcHViO1xubW9kdWxlLmV4cG9ydHMuc3Bhd24gPSBzcGF3bjtcbm1vZHVsZS5leHBvcnRzLnVwZGF0ZVJvdXRlcyA9IHVwZGF0ZVJvdXRlcztcbm1vZHVsZS5leHBvcnRzLnNlbmRNZXNzYWdlID0gc2VuZE1lc3NhZ2U7XG5tb2R1bGUuZXhwb3J0cy5zaHV0ZG93bldvcmxkID0gc2h1dGRvd25Xb3JsZDtcblxubW9kdWxlLmV4cG9ydHMuV29ybGQgPSBXb3JsZDtcbm1vZHVsZS5leHBvcnRzLkRlbWFuZE1hdGNoZXIgPSBEZW1hbmRNYXRjaGVyO1xubW9kdWxlLmV4cG9ydHMuRGVkdXBsaWNhdG9yID0gRGVkdXBsaWNhdG9yO1xubW9kdWxlLmV4cG9ydHMuR3JvdW5kID0gR3JvdW5kO1xubW9kdWxlLmV4cG9ydHMuUm91dGUgPSBSb3V0ZTtcbiIsInZhciBfXyA9IFwiX19cIjsgLyogd2lsZGNhcmQgbWFya2VyICovXG5cbnZhciBTT0EgPSBcIl9fW1wiOyAvLyBzdGFydCBvZiBhcnJheVxudmFyIEVPQSA9IFwiX19dXCI7IC8vIGVuZCBvZiBhcnJheVxuXG5mdW5jdGlvbiBkaWUobWVzc2FnZSkge1xuICAgIHRocm93IG5ldyBFcnJvcihtZXNzYWdlKTtcbn1cblxuZnVuY3Rpb24gJEVtYmVkZGVkKG1hdGNoZXIpIHtcbiAgICB0aGlzLm1hdGNoZXIgPSBtYXRjaGVyO1xufVxuXG5mdW5jdGlvbiBlbWJlZGRlZE1hdGNoZXIobWF0Y2hlcikge1xuICAgIHJldHVybiBuZXcgJEVtYmVkZGVkKG1hdGNoZXIpO1xufVxuXG4vLyBUaGUgcGF0dGVybiBhcmd1bWVudCBkZWZhdWx0cyB0byB3aWxkY2FyZCwgX18uXG5mdW5jdGlvbiAkQ2FwdHVyZShwYXR0ZXJuKSB7XG4gICAgdGhpcy5wYXR0ZXJuID0gKHR5cGVvZiBwYXR0ZXJuID09PSAndW5kZWZpbmVkJyA/IF9fIDogcGF0dGVybik7XG59XG5cbi8vIEFiYnJldmlhdGlvbjogXyQoeCkgPD09PiBuZXcgJENhcHR1cmUoeClcbmZ1bmN0aW9uIF8kKHBhdHRlcm4pIHtcbiAgICByZXR1cm4gbmV3ICRDYXB0dXJlKHBhdHRlcm4pO1xufVxuXG5mdW5jdGlvbiBpc0NhcHR1cmUoeCkgeyByZXR1cm4geCBpbnN0YW5jZW9mICRDYXB0dXJlIHx8IHggPT09IF8kOyB9XG5mdW5jdGlvbiBjYXB0dXJlUGF0dGVybih4KSB7IHJldHVybiB4IGluc3RhbmNlb2YgJENhcHR1cmUgPyB4LnBhdHRlcm4gOiBfXzsgfVxuXG52YXIgU09DID0gXCJfX3t7XCI7IC8vIHN0YXJ0IG9mIGNhcHR1cmVcbnZhciBFT0MgPSBcIl9ffX1cIjsgLy8gZW5kIG9mIGNhcHR1cmVcblxuZnVuY3Rpb24gJFN1Y2Nlc3ModmFsdWUpIHtcbiAgICB0aGlzLnZhbHVlID0gdmFsdWU7XG59XG5cbmZ1bmN0aW9uICRXaWxkY2FyZFNlcXVlbmNlKG1hdGNoZXIpIHtcbiAgICB0aGlzLm1hdGNoZXIgPSBtYXRjaGVyO1xufVxuXG5mdW5jdGlvbiAkRGljdCgpIHtcbiAgICB0aGlzLmxlbmd0aCA9IDA7XG4gICAgdGhpcy5lbnRyaWVzID0ge307XG59XG5cbiREaWN0LnByb3RvdHlwZS5nZXQgPSBmdW5jdGlvbiAoa2V5KSB7XG4gICAgcmV0dXJuIHRoaXMuZW50cmllc1trZXldIHx8IGVtcHR5TWF0Y2hlcjtcbn07XG5cbiREaWN0LnByb3RvdHlwZS5zZXQgPSBmdW5jdGlvbiAoa2V5LCB2YWwpIHtcbiAgICBpZiAoIShrZXkgaW4gdGhpcy5lbnRyaWVzKSkgdGhpcy5sZW5ndGgrKztcbiAgICB0aGlzLmVudHJpZXNba2V5XSA9IHZhbDtcbn07XG5cbiREaWN0LnByb3RvdHlwZS5jbGVhciA9IGZ1bmN0aW9uIChrZXkpIHtcbiAgICBpZiAoa2V5IGluIHRoaXMuZW50cmllcykgdGhpcy5sZW5ndGgtLTtcbiAgICBkZWxldGUgdGhpcy5lbnRyaWVzW2tleV07XG59O1xuXG4kRGljdC5wcm90b3R5cGUuaXNFbXB0eSA9IGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4gdGhpcy5sZW5ndGggPT09IDA7XG59O1xuXG4kRGljdC5wcm90b3R5cGUuY29weSA9IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgb3RoZXIgPSBuZXcgJERpY3QoKTtcbiAgICBvdGhlci5sZW5ndGggPSB0aGlzLmxlbmd0aDtcbiAgICBmb3IgKHZhciBrZXkgaW4gdGhpcy5lbnRyaWVzKSB7XG5cdGlmICh0aGlzLmVudHJpZXMuaGFzT3duUHJvcGVydHkoa2V5KSkge1xuXHQgICAgb3RoZXIuZW50cmllc1trZXldID0gdGhpcy5lbnRyaWVzW2tleV07XG5cdH1cbiAgICB9XG4gICAgcmV0dXJuIG90aGVyO1xufTtcblxuJERpY3QucHJvdG90eXBlLmVtcHR5R3VhcmQgPSBmdW5jdGlvbiAoKSB7XG4gICAgaWYgKHRoaXMuaXNFbXB0eSgpKSByZXR1cm4gZW1wdHlNYXRjaGVyO1xuICAgIHJldHVybiB0aGlzO1xufTtcblxuJERpY3QucHJvdG90eXBlLmhhcyA9IGZ1bmN0aW9uIChrZXkpIHtcbiAgICByZXR1cm4ga2V5IGluIHRoaXMuZW50cmllcztcbn07XG5cbiREaWN0LnByb3RvdHlwZS5zb3J0ZWRLZXlzID0gZnVuY3Rpb24gKCkge1xuICAgIHZhciBrcyA9IFtdO1xuICAgIGZvciAodmFyIGsgaW4gdGhpcy5lbnRyaWVzKSBrcy5wdXNoKGspO1xuICAgIGtzLnNvcnQoKTtcbiAgICByZXR1cm4ga3M7XG59XG5cbmZ1bmN0aW9uIGlzX2VtcHR5TWF0Y2hlcihtKSB7XG4gICAgcmV0dXJuIChtID09PSBlbXB0eU1hdGNoZXIpO1xufVxuXG4vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cbi8vIENvbnN0cnVjdG9yc1xuXG52YXIgZW1wdHlNYXRjaGVyID0gbnVsbDtcblxuZnVuY3Rpb24gcnN1Y2Nlc3Modikge1xuICAgIHJldHVybiAodiA9PT0gZW1wdHlNYXRjaGVyKSA/IGVtcHR5TWF0Y2hlciA6IG5ldyAkU3VjY2Vzcyh2KTtcbn1cblxuZnVuY3Rpb24gcnNlcShlLCByKSB7XG4gICAgaWYgKHIgPT09IGVtcHR5TWF0Y2hlcikgcmV0dXJuIGVtcHR5TWF0Y2hlcjtcbiAgICB2YXIgcyA9IG5ldyAkRGljdCgpO1xuICAgIHMuc2V0KGUsIHIpO1xuICAgIHJldHVybiBzO1xufVxuXG5mdW5jdGlvbiByd2lsZChyKSB7XG4gICAgcmV0dXJuIHJzZXEoX18sIHIpO1xufVxuXG5mdW5jdGlvbiByd2lsZHNlcShyKSB7XG4gICAgcmV0dXJuIChyID09PSBlbXB0eU1hdGNoZXIpID8gZW1wdHlNYXRjaGVyIDogbmV3ICRXaWxkY2FyZFNlcXVlbmNlKHIpO1xufVxuXG4vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cblxuZnVuY3Rpb24gY29tcGlsZVBhdHRlcm4odiwgcCkge1xuICAgIGlmICghcCkgZGllKFwiY29tcGlsZVBhdHRlcm46IG1pc3NpbmcgcGF0dGVyblwiKTtcbiAgICByZXR1cm4gd2FsayhwLCByc2VxKEVPQSwgcnN1Y2Nlc3ModikpKTtcblxuICAgIGZ1bmN0aW9uIHdhbGsocCwgYWNjKSB7XG5cdGlmIChwID09PSBfXykgcmV0dXJuIHJ3aWxkKGFjYyk7XG5cblx0aWYgKEFycmF5LmlzQXJyYXkocCkpIHtcblx0ICAgIGFjYyA9IHJzZXEoRU9BLCBhY2MpO1xuXHQgICAgZm9yICh2YXIgaSA9IHAubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcblx0XHRhY2MgPSB3YWxrKHBbaV0sIGFjYyk7XG5cdCAgICB9XG5cdCAgICByZXR1cm4gcnNlcShTT0EsIGFjYyk7XG5cdH1cblxuXHRpZiAocCBpbnN0YW5jZW9mICRFbWJlZGRlZCkge1xuXHQgICAgcmV0dXJuIGFwcGVuZE1hdGNoZXIocC5tYXRjaGVyLCBmdW5jdGlvbiAodikgeyByZXR1cm4gYWNjOyB9KTtcblx0fSBlbHNlIHtcblx0ICAgIHJldHVybiByc2VxKEpTT04uc3RyaW5naWZ5KHApLCBhY2MpO1xuXHR9XG4gICAgfVxufVxuXG5mdW5jdGlvbiBzaGFsbG93Q29weUFycmF5KHMpIHtcbiAgICByZXR1cm4gcy5zbGljZSgpO1xufVxuXG5mdW5jdGlvbiBydXBkYXRlSW5wbGFjZShyLCBrZXksIGspIHtcbiAgICBpZiAoaXNfZW1wdHlNYXRjaGVyKGspKSB7XG5cdHIuY2xlYXIoa2V5KTtcbiAgICB9IGVsc2Uge1xuXHRyLnNldChrZXksIGspO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gbWF0Y2hlckVxdWFscyhhLCBiKSB7XG4gICAgaWYgKGEgPT09IG51bGwpIHtcblx0cmV0dXJuIChiID09PSBudWxsKTtcbiAgICB9XG4gICAgaWYgKGIgPT09IG51bGwpIHJldHVybiBmYWxzZTtcblxuICAgIGlmIChhIGluc3RhbmNlb2YgJFdpbGRjYXJkU2VxdWVuY2UpIHtcblx0aWYgKCEoYiBpbnN0YW5jZW9mICRXaWxkY2FyZFNlcXVlbmNlKSkgcmV0dXJuIGZhbHNlO1xuXHRhID0gYS5tYXRjaGVyO1xuXHRiID0gYi5tYXRjaGVyO1xuICAgIH0gZWxzZSBpZiAoYiBpbnN0YW5jZW9mICRXaWxkY2FyZFNlcXVlbmNlKSByZXR1cm4gZmFsc2U7XG5cbiAgICBpZiAoYSBpbnN0YW5jZW9mICRTdWNjZXNzKSB7XG5cdGlmICghKGIgaW5zdGFuY2VvZiAkU3VjY2VzcykpIHJldHVybiBmYWxzZTtcblx0cmV0dXJuIHZhbHVlc0VxdWFsKGEudmFsdWUsIGIudmFsdWUpO1xuICAgIH1cbiAgICBpZiAoYiBpbnN0YW5jZW9mICRTdWNjZXNzKSByZXR1cm4gZmFsc2U7XG5cbiAgICBmb3IgKHZhciBrZXkgaW4gYS5lbnRyaWVzKSB7XG5cdGlmICghYi5oYXMoa2V5KSkgcmV0dXJuIGZhbHNlO1xuXHRpZiAoIW1hdGNoZXJFcXVhbHMoYS5lbnRyaWVzW2tleV0sIGIuZW50cmllc1trZXldKSkgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICByZXR1cm4gdHJ1ZTtcbn1cblxuZnVuY3Rpb24gaXNfa2V5T3BlbihrKSB7XG4gICAgcmV0dXJuIGsgPT09IFNPQTtcbn1cblxuZnVuY3Rpb24gaXNfa2V5Q2xvc2Uoaykge1xuICAgIHJldHVybiBrID09PSBFT0E7XG59XG5cbmZ1bmN0aW9uIGlzX2tleU5vcm1hbChrKSB7XG4gICAgcmV0dXJuICEoaXNfa2V5T3BlbihrKSB8fCBpc19rZXlDbG9zZShrKSk7XG59XG5cbi8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuLy8gRW5vdWdoIG9mIHNldHMgdG8gZ2V0IGJ5IHdpdGhcblxuZnVuY3Rpb24gYXJyYXlUb1NldCh4cykge1xuICAgIHZhciBzID0ge307XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCB4cy5sZW5ndGg7IGkrKykge1xuXHRzW0pTT04uc3RyaW5naWZ5KHhzW2ldKV0gPSB4c1tpXTtcbiAgICB9XG4gICAgcmV0dXJuIHM7XG59XG5cbmZ1bmN0aW9uIHNldFRvQXJyYXkocykge1xuICAgIHZhciByID0gW107XG4gICAgZm9yICh2YXIgayBpbiBzKSByLnB1c2goc1trXSk7XG4gICAgcmV0dXJuIHI7XG59XG5cbmZ1bmN0aW9uIHNldFVuaW9uKHMxLCBzMikge1xuICAgIHZhciBzID0ge307XG4gICAgc2V0VW5pb25JbnBsYWNlKHMsIHMxKTtcbiAgICBzZXRVbmlvbklucGxhY2UocywgczIpO1xuICAgIHJldHVybiBzO1xufVxuXG5mdW5jdGlvbiBpc19lbXB0eVNldChzKSB7XG4gICAgZm9yICh2YXIgayBpbiBzKSB7XG5cdGlmIChzLmhhc093blByb3BlcnR5KGspKVxuXHQgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICByZXR1cm4gdHJ1ZTtcbn1cblxuZnVuY3Rpb24gc2V0U3VidHJhY3QoczEsIHMyKSB7XG4gICAgdmFyIHMgPSB7fTtcbiAgICBmb3IgKHZhciBrZXkgaW4gczEpIHtcblx0aWYgKHMxLmhhc093blByb3BlcnR5KGtleSkgJiYgIXMyLmhhc093blByb3BlcnR5KGtleSkpIHtcblx0ICAgIHNba2V5XSA9IHMxW2tleV07XG5cdH1cbiAgICB9XG4gICAgcmV0dXJuIHM7XG59XG5cbmZ1bmN0aW9uIHNldEludGVyc2VjdChzMSwgczIpIHtcbiAgICB2YXIgcyA9IHt9O1xuICAgIGZvciAodmFyIGtleSBpbiBzMSkge1xuXHRpZiAoczEuaGFzT3duUHJvcGVydHkoa2V5KSAmJiBzMi5oYXNPd25Qcm9wZXJ0eShrZXkpKSB7XG5cdCAgICBzW2tleV0gPSBzMVtrZXldO1xuXHR9XG4gICAgfVxuICAgIHJldHVybiBzO1xufVxuXG5mdW5jdGlvbiBzZXRVbmlvbklucGxhY2UoYWNjLCBzKSB7XG4gICAgZm9yICh2YXIga2V5IGluIHMpIHtcblx0aWYgKHMuaGFzT3duUHJvcGVydHkoa2V5KSkge1xuXHQgICAgYWNjW2tleV0gPSBzW2tleV07XG5cdH1cbiAgICB9XG59XG5cbmZ1bmN0aW9uIHNldEVxdWFsKHMxLCBzMikge1xuICAgIGZvciAodmFyIGtleSBpbiBzMSkge1xuXHRpZiAoczEuaGFzT3duUHJvcGVydHkoa2V5KSkge1xuXHQgICAgaWYgKHMxW2tleV0gIT09IHMyW2tleV0pIHJldHVybiBmYWxzZTtcblx0fVxuICAgIH1cbiAgICBmb3IgKHZhciBrZXkgaW4gczIpIHtcblx0aWYgKHMyLmhhc093blByb3BlcnR5KGtleSkpIHtcblx0ICAgIGlmIChzMVtrZXldICE9PSBzMltrZXldKSByZXR1cm4gZmFsc2U7XG5cdH1cbiAgICB9XG4gICAgcmV0dXJuIHRydWU7XG59XG5cbi8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuXG52YXIgdW5pb25TdWNjZXNzZXMgPSBmdW5jdGlvbiAodjEsIHYyKSB7XG4gICAgaWYgKHYxID09PSB0cnVlKSByZXR1cm4gdjI7XG4gICAgaWYgKHYyID09PSB0cnVlKSByZXR1cm4gdjE7XG4gICAgcmV0dXJuIHNldFVuaW9uKHYxLCB2Mik7XG59O1xuXG52YXIgaW50ZXJzZWN0U3VjY2Vzc2VzID0gZnVuY3Rpb24gKHYxLCB2Mikge1xuICAgIHJldHVybiB2MTtcbn07XG5cbnZhciBlcmFzZVBhdGhTdWNjZXNzZXMgPSBmdW5jdGlvbiAodjEsIHYyKSB7XG4gICAgdmFyIHIgPSBzZXRTdWJ0cmFjdCh2MSwgdjIpO1xuICAgIGlmIChpc19lbXB0eVNldChyKSkgcmV0dXJuIG51bGw7XG4gICAgcmV0dXJuIHI7XG59O1xuXG52YXIgbWF0Y2hNYXRjaGVyU3VjY2Vzc2VzID0gZnVuY3Rpb24gKHYxLCB2MiwgYWNjKSB7XG4gICAgc2V0VW5pb25JbnBsYWNlKGFjYywgdjIpO1xufTtcblxudmFyIHByb2plY3RTdWNjZXNzID0gZnVuY3Rpb24gKHYpIHtcbiAgICByZXR1cm4gdjtcbn07XG5cbnZhciB2YWx1ZXNFcXVhbCA9IGZ1bmN0aW9uIChhLCBiKSB7XG4gICAgcmV0dXJuIHNldEVxdWFsKGEsIGIpO1xufTtcblxuLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXG5cbmZ1bmN0aW9uIGV4cGFuZFdpbGRzZXEocikge1xuICAgIHJldHVybiB1bmlvbihyd2lsZChyd2lsZHNlcShyKSksIHJzZXEoRU9BLCByKSk7XG59XG5cbmZ1bmN0aW9uIHVuaW9uKG8xLCBvMikge1xuICAgIHJldHVybiBtZXJnZShvMSwgbzIpO1xuXG4gICAgZnVuY3Rpb24gbWVyZ2UobzEsIG8yKSB7XG5cdGlmIChpc19lbXB0eU1hdGNoZXIobzEpKSByZXR1cm4gbzI7XG5cdGlmIChpc19lbXB0eU1hdGNoZXIobzIpKSByZXR1cm4gbzE7XG5cdHJldHVybiB3YWxrKG8xLCBvMik7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gd2FsayhyMSwgcjIpIHtcblx0aWYgKHIxIGluc3RhbmNlb2YgJFdpbGRjYXJkU2VxdWVuY2UpIHtcblx0ICAgIGlmIChyMiBpbnN0YW5jZW9mICRXaWxkY2FyZFNlcXVlbmNlKSB7XG5cdFx0cmV0dXJuIHJ3aWxkc2VxKHdhbGsocjEubWF0Y2hlciwgcjIubWF0Y2hlcikpO1xuXHQgICAgfVxuXHQgICAgcjEgPSBleHBhbmRXaWxkc2VxKHIxLm1hdGNoZXIpO1xuXHR9IGVsc2UgaWYgKHIyIGluc3RhbmNlb2YgJFdpbGRjYXJkU2VxdWVuY2UpIHtcblx0ICAgIHIyID0gZXhwYW5kV2lsZHNlcShyMi5tYXRjaGVyKTtcblx0fVxuXG5cdGlmIChyMSBpbnN0YW5jZW9mICRTdWNjZXNzICYmIHIyIGluc3RhbmNlb2YgJFN1Y2Nlc3MpIHtcblx0ICAgIHJldHVybiByc3VjY2Vzcyh1bmlvblN1Y2Nlc3NlcyhyMS52YWx1ZSwgcjIudmFsdWUpKTtcblx0fVxuXG5cdHZhciB3ID0gbWVyZ2UocjEuZ2V0KF9fKSwgcjIuZ2V0KF9fKSk7XG5cdGlmIChpc19lbXB0eU1hdGNoZXIodykpIHtcblx0ICAgIHZhciBzbWFsbGVyID0gcjEubGVuZ3RoIDwgcjIubGVuZ3RoID8gcjEgOiByMjtcblx0ICAgIHZhciBsYXJnZXIgID0gcjEubGVuZ3RoIDwgcjIubGVuZ3RoID8gcjIgOiByMTtcblx0ICAgIHZhciB0YXJnZXQgPSBsYXJnZXIuY29weSgpO1xuXHQgICAgZm9yICh2YXIga2V5IGluIHNtYWxsZXIuZW50cmllcykge1xuXHRcdHZhciBrID0gbWVyZ2Uoc21hbGxlci5nZXQoa2V5KSwgbGFyZ2VyLmdldChrZXkpKTtcblx0XHRydXBkYXRlSW5wbGFjZSh0YXJnZXQsIGtleSwgayk7XG5cdCAgICB9XG5cdCAgICByZXR1cm4gdGFyZ2V0LmVtcHR5R3VhcmQoKTtcblx0fSBlbHNlIHtcblx0ICAgIGZ1bmN0aW9uIGV4YW1pbmVLZXkockEsIGtleSwgckIpIHtcblx0XHRpZiAoKGtleSAhPT0gX18pICYmICF0YXJnZXQuaGFzKGtleSkpIHtcblx0XHQgICAgdmFyIGsgPSBtZXJnZShyQS5nZXQoa2V5KSwgckIuZ2V0KGtleSkpO1xuXHRcdCAgICBpZiAoaXNfa2V5T3BlbihrZXkpKSB7XG5cdFx0XHRydXBkYXRlSW5wbGFjZSh0YXJnZXQsIGtleSwgbWVyZ2UocndpbGRzZXEodyksIGspKTtcblx0XHQgICAgfSBlbHNlIGlmIChpc19rZXlDbG9zZShrZXkpKSB7XG5cdFx0XHRpZiAodyBpbnN0YW5jZW9mICRXaWxkY2FyZFNlcXVlbmNlKSB7XG5cdFx0XHQgICAgcnVwZGF0ZUlucGxhY2UodGFyZ2V0LCBrZXksIG1lcmdlKHcubWF0Y2hlciwgaykpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdCAgICBydXBkYXRlSW5wbGFjZSh0YXJnZXQsIGtleSwgayk7XG5cdFx0XHR9XG5cdFx0ICAgIH0gZWxzZSB7XG5cdFx0XHRydXBkYXRlSW5wbGFjZSh0YXJnZXQsIGtleSwgbWVyZ2UodywgaykpO1xuXHRcdCAgICB9XG5cdFx0fVxuXHQgICAgfVxuXHQgICAgdmFyIHRhcmdldCA9IHJ3aWxkKHcpLmNvcHkoKTtcblx0ICAgIGZvciAodmFyIGtleSBpbiByMS5lbnRyaWVzKSB7IGV4YW1pbmVLZXkocjEsIGtleSwgcjIpOyB9XG5cdCAgICBmb3IgKHZhciBrZXkgaW4gcjIuZW50cmllcykgeyBleGFtaW5lS2V5KHIyLCBrZXksIHIxKTsgfVxuXHQgICAgcmV0dXJuIHRhcmdldDtcblx0fVxuICAgIH1cbn1cblxuZnVuY3Rpb24gdW5pb25OKCkge1xuICAgIHZhciBhY2MgPSBlbXB0eU1hdGNoZXI7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBhcmd1bWVudHMubGVuZ3RoOyBpKyspIHtcblx0YWNjID0gdW5pb24oYWNjLCBhcmd1bWVudHNbaV0pO1xuICAgIH1cbiAgICByZXR1cm4gYWNjO1xufVxuXG5mdW5jdGlvbiBpbnRlcnNlY3QobzEsIG8yKSB7XG4gICAgaWYgKGlzX2VtcHR5TWF0Y2hlcihvMSkpIHJldHVybiBlbXB0eU1hdGNoZXI7XG4gICAgaWYgKGlzX2VtcHR5TWF0Y2hlcihvMikpIHJldHVybiBlbXB0eU1hdGNoZXI7XG4gICAgcmV0dXJuIHdhbGsobzEsIG8yKTtcblxuICAgIGZ1bmN0aW9uIHdhbGtGbGlwcGVkKHIyLCByMSkgeyByZXR1cm4gd2FsayhyMSwgcjIpOyB9XG5cbiAgICBmdW5jdGlvbiB3YWxrKHIxLCByMikge1xuXHQvLyBJTlZBUklBTlQ6IHIxIGlzIGEgcGFydCBvZiB0aGUgb3JpZ2luYWwgbzEsIGFuZFxuXHQvLyBsaWtld2lzZSBmb3IgcjIuIFRoaXMgaXMgc28gdGhhdCB0aGUgZmlyc3QgYXJnIHRvXG5cdC8vIGludGVyc2VjdFN1Y2Nlc3NlcyBhbHdheXMgY29tZXMgZnJvbSByMSwgYW5kIHRoZSBzZWNvbmRcblx0Ly8gZnJvbSByMi5cblx0aWYgKGlzX2VtcHR5TWF0Y2hlcihyMSkpIHJldHVybiBlbXB0eU1hdGNoZXI7XG5cdGlmIChpc19lbXB0eU1hdGNoZXIocjIpKSByZXR1cm4gZW1wdHlNYXRjaGVyO1xuXG5cdGlmIChyMSBpbnN0YW5jZW9mICRXaWxkY2FyZFNlcXVlbmNlKSB7XG5cdCAgICBpZiAocjIgaW5zdGFuY2VvZiAkV2lsZGNhcmRTZXF1ZW5jZSkge1xuXHRcdHJldHVybiByd2lsZHNlcSh3YWxrKHIxLm1hdGNoZXIsIHIyLm1hdGNoZXIpKTtcblx0ICAgIH1cblx0ICAgIHIxID0gZXhwYW5kV2lsZHNlcShyMS5tYXRjaGVyKTtcblx0fSBlbHNlIGlmIChyMiBpbnN0YW5jZW9mICRXaWxkY2FyZFNlcXVlbmNlKSB7XG5cdCAgICByMiA9IGV4cGFuZFdpbGRzZXEocjIubWF0Y2hlcik7XG5cdH1cblxuXHRpZiAocjEgaW5zdGFuY2VvZiAkU3VjY2VzcyAmJiByMiBpbnN0YW5jZW9mICRTdWNjZXNzKSB7XG5cdCAgICByZXR1cm4gcnN1Y2Nlc3MoaW50ZXJzZWN0U3VjY2Vzc2VzKHIxLnZhbHVlLCByMi52YWx1ZSkpO1xuXHR9XG5cblx0dmFyIHcxID0gcjEuZ2V0KF9fKTtcblx0dmFyIHcyID0gcjIuZ2V0KF9fKTtcblx0dmFyIHcgPSB3YWxrKHcxLCB3Mik7XG5cblx0dmFyIHRhcmdldCA9IG5ldyAkRGljdCgpO1xuXG5cdGZ1bmN0aW9uIGV4YW1pbmVLZXkoa2V5KSB7XG5cdCAgICBpZiAoKGtleSAhPT0gX18pICYmICF0YXJnZXQuaGFzKGtleSkpIHtcblx0XHR2YXIgazEgPSByMS5nZXQoa2V5KTtcblx0XHR2YXIgazIgPSByMi5nZXQoa2V5KTtcblx0XHRpZiAoaXNfZW1wdHlNYXRjaGVyKGsxKSkge1xuXHRcdCAgICBpZiAoaXNfZW1wdHlNYXRjaGVyKGsyKSkge1xuXHRcdFx0cnVwZGF0ZUlucGxhY2UodGFyZ2V0LCBrZXksIGVtcHR5TWF0Y2hlcik7XG5cdFx0ICAgIH0gZWxzZSB7XG5cdFx0XHRydXBkYXRlSW5wbGFjZSh0YXJnZXQsIGtleSwgd2Fsa1dpbGQod2FsaywgdzEsIGtleSwgazIpKTtcblx0XHQgICAgfVxuXHRcdH0gZWxzZSB7XG5cdFx0ICAgIGlmIChpc19lbXB0eU1hdGNoZXIoazIpKSB7XG5cdFx0XHRydXBkYXRlSW5wbGFjZSh0YXJnZXQsIGtleSwgd2Fsa1dpbGQod2Fsa0ZsaXBwZWQsIHcyLCBrZXksIGsxKSk7XG5cdFx0ICAgIH0gZWxzZSB7XG5cdFx0XHRydXBkYXRlSW5wbGFjZSh0YXJnZXQsIGtleSwgd2FsayhrMSwgazIpKTtcblx0XHQgICAgfVxuXHRcdH1cblx0ICAgIH1cblx0fVxuXG5cdGlmIChpc19lbXB0eU1hdGNoZXIodzEpKSB7XG5cdCAgICBpZiAoaXNfZW1wdHlNYXRjaGVyKHcyKSkge1xuXHRcdGZvciAodmFyIGtleSBpbiAocjEubGVuZ3RoIDwgcjIubGVuZ3RoID8gcjEgOiByMikuZW50cmllcykgZXhhbWluZUtleShrZXkpO1xuXHQgICAgfSBlbHNlIHtcblx0XHRmb3IgKHZhciBrZXkgaW4gcjEuZW50cmllcykgZXhhbWluZUtleShrZXkpO1xuXHQgICAgfVxuXHR9IGVsc2Uge1xuXHQgICAgaWYgKGlzX2VtcHR5TWF0Y2hlcih3MikpIHtcblx0XHRmb3IgKHZhciBrZXkgaW4gcjIuZW50cmllcykgZXhhbWluZUtleShrZXkpO1xuXHQgICAgfSBlbHNlIHtcblx0XHRydXBkYXRlSW5wbGFjZSh0YXJnZXQsIF9fLCB3KTtcblx0XHRmb3IgKHZhciBrZXkgaW4gcjEuZW50cmllcykgZXhhbWluZUtleShrZXkpO1xuXHRcdGZvciAodmFyIGtleSBpbiByMi5lbnRyaWVzKSBleGFtaW5lS2V5KGtleSk7XG5cdCAgICB9XG5cdH1cblx0cmV0dXJuIHRhcmdldC5lbXB0eUd1YXJkKCk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gd2Fsa1dpbGQod2Fsa2VyLCB3LCBrZXksIGspIHtcblx0aWYgKGlzX2VtcHR5TWF0Y2hlcih3KSkgcmV0dXJuIGVtcHR5TWF0Y2hlcjtcblx0aWYgKGlzX2tleU9wZW4oa2V5KSkgcmV0dXJuIHdhbGtlcihyd2lsZHNlcSh3KSwgayk7XG5cdGlmIChpc19rZXlDbG9zZShrZXkpKSB7XG5cdCAgICBpZiAodyBpbnN0YW5jZW9mICRXaWxkY2FyZFNlcXVlbmNlKSByZXR1cm4gd2Fsa2VyKHcubWF0Y2hlciwgayk7XG5cdCAgICByZXR1cm4gZW1wdHlNYXRjaGVyO1xuXHR9XG5cdHJldHVybiB3YWxrZXIodywgayk7XG4gICAgfVxufVxuXG4vLyBSZW1vdmVzIHIyJ3MgbWFwcGluZ3MgZnJvbSByMS4gQXNzdW1lcyByMiBoYXMgcHJldmlvdXNseSBiZWVuXG4vLyB1bmlvbidkIGludG8gcjEuIFRoZSBlcmFzZVBhdGhTdWNjZXNzZXMgZnVuY3Rpb24gc2hvdWxkIHJldHVyblxuLy8gbnVsbCB0byBzaWduYWwgXCJubyByZW1haW5pbmcgc3VjY2VzcyB2YWx1ZXNcIi5cbmZ1bmN0aW9uIGVyYXNlUGF0aChvMSwgbzIpIHtcbiAgICByZXR1cm4gd2FsayhvMSwgbzIpO1xuXG4gICAgZnVuY3Rpb24gd2FsayhyMSwgcjIpIHtcblx0aWYgKGlzX2VtcHR5TWF0Y2hlcihyMSkpIHtcblx0ICAgIHJldHVybiBlbXB0eU1hdGNoZXI7XG5cdH0gZWxzZSB7XG5cdCAgICBpZiAoaXNfZW1wdHlNYXRjaGVyKHIyKSkge1xuXHRcdHJldHVybiByMTtcblx0ICAgIH1cblx0fVxuXG5cdGlmIChyMSBpbnN0YW5jZW9mICRXaWxkY2FyZFNlcXVlbmNlKSB7XG5cdCAgICBpZiAocjIgaW5zdGFuY2VvZiAkV2lsZGNhcmRTZXF1ZW5jZSkge1xuXHRcdHJldHVybiByd2lsZHNlcSh3YWxrKHIxLm1hdGNoZXIsIHIyLm1hdGNoZXIpKTtcblx0ICAgIH1cblx0ICAgIHIxID0gZXhwYW5kV2lsZHNlcShyMS5tYXRjaGVyKTtcblx0fSBlbHNlIGlmIChyMiBpbnN0YW5jZW9mICRXaWxkY2FyZFNlcXVlbmNlKSB7XG5cdCAgICByMiA9IGV4cGFuZFdpbGRzZXEocjIubWF0Y2hlcik7XG5cdH1cblxuXHRpZiAocjEgaW5zdGFuY2VvZiAkU3VjY2VzcyAmJiByMiBpbnN0YW5jZW9mICRTdWNjZXNzKSB7XG5cdCAgICByZXR1cm4gcnN1Y2Nlc3MoZXJhc2VQYXRoU3VjY2Vzc2VzKHIxLnZhbHVlLCByMi52YWx1ZSkpO1xuXHR9XG5cblx0dmFyIHcxID0gcjEuZ2V0KF9fKTtcblx0dmFyIHcyID0gcjIuZ2V0KF9fKTtcblx0dmFyIHcgPSB3YWxrKHcxLCB3Mik7XG5cdHZhciB0YXJnZXQ7XG5cblx0ZnVuY3Rpb24gZXhhbWluZUtleShrZXkpIHtcblx0ICAgIGlmIChrZXkgIT09IF9fKSB7XG5cdFx0dmFyIGsxID0gcjEuZ2V0KGtleSk7XG5cdFx0dmFyIGsyID0gcjIuZ2V0KGtleSk7XG5cdFx0dmFyIHVwZGF0ZWRLO1xuXHRcdGlmIChpc19lbXB0eU1hdGNoZXIoazIpKSB7XG5cdFx0ICAgIHVwZGF0ZWRLID0gd2Fsa1dpbGQoa2V5LCBrMSwgdzIpO1xuXHRcdH0gZWxzZSB7XG5cdFx0ICAgIHVwZGF0ZWRLID0gd2FsayhrMSwgazIpO1xuXHRcdH1cblx0XHQvLyBIZXJlIHdlIGVuc3VyZSBhIFwibWluaW1hbFwiIHJlbWFpbmRlciBpbiBjYXNlc1xuXHRcdC8vIHdoZXJlIGFmdGVyIGFuIGVyYXN1cmUsIGEgcGFydGljdWxhciBrZXknc1xuXHRcdC8vIGNvbnRpbnVhdGlvbiBpcyB0aGUgc2FtZSBhcyB0aGUgd2lsZGNhcmQnc1xuXHRcdC8vIGNvbnRpbnVhdGlvbi4gVE9ETzogdGhlIG1hdGNoZXJFcXVhbHMgY2hlY2sgbWF5XG5cdFx0Ly8gYmUgZXhwZW5zaXZlLiBJZiBzbywgaG93IGNhbiBpdCBiZSBtYWRlXG5cdFx0Ly8gY2hlYXBlcj9cblx0XHRpZiAoaXNfa2V5T3BlbihrZXkpKSB7XG5cdFx0ICAgIHJ1cGRhdGVJbnBsYWNlKHRhcmdldCwga2V5LFxuXHRcdFx0XHQgICAoKHVwZGF0ZWRLIGluc3RhbmNlb2YgJFdpbGRjYXJkU2VxdWVuY2UpICYmXG5cdFx0XHRcdCAgICBtYXRjaGVyRXF1YWxzKHVwZGF0ZWRLLm1hdGNoZXIsIHcpKVxuXHRcdFx0XHQgICA/IGVtcHR5TWF0Y2hlclxuXHRcdFx0XHQgICA6IHVwZGF0ZWRLKTtcblx0XHR9IGVsc2UgaWYgKGlzX2tleUNsb3NlKGtleSkpIHtcblx0XHQgICAgLy8gV2UgdGFrZSBjYXJlIG9mIHRoaXMgY2FzZSBsYXRlciwgYWZ0ZXIgdGhlXG5cdFx0ICAgIC8vIHRhcmdldCBpcyBmdWxseSBjb25zdHJ1Y3RlZC9yZWJ1aWx0LlxuXHRcdCAgICBydXBkYXRlSW5wbGFjZSh0YXJnZXQsIGtleSwgdXBkYXRlZEspO1xuXHRcdH0gZWxzZSB7XG5cdFx0ICAgIHJ1cGRhdGVJbnBsYWNlKHRhcmdldCwga2V5LFxuXHRcdFx0XHQgICAobWF0Y2hlckVxdWFscyh1cGRhdGVkSywgdykgPyBlbXB0eU1hdGNoZXIgOiB1cGRhdGVkSykpO1xuXHRcdH1cblx0ICAgIH1cblx0fVxuXG5cdGlmIChpc19lbXB0eU1hdGNoZXIodzIpKSB7XG5cdCAgICB0YXJnZXQgPSByMS5jb3B5KCk7XG5cdCAgICBmb3IgKHZhciBrZXkgaW4gcjIuZW50cmllcykgZXhhbWluZUtleShrZXkpO1xuXHR9IGVsc2Uge1xuXHQgICAgdGFyZ2V0ID0gbmV3ICREaWN0KCk7XG5cdCAgICBydXBkYXRlSW5wbGFjZSh0YXJnZXQsIF9fLCB3KTtcblx0ICAgIGZvciAodmFyIGtleSBpbiByMS5lbnRyaWVzKSBleGFtaW5lS2V5KGtleSk7XG5cdCAgICBmb3IgKHZhciBrZXkgaW4gcjIuZW50cmllcykgZXhhbWluZUtleShrZXkpO1xuXHR9XG5cblx0Ly8gSGVyZSwgdGhlIHRhcmdldCBpcyBjb21wbGV0ZS4gSWYgaXQgaGFzIG9ubHkgdHdvIGtleXMsXG5cdC8vIG9uZSB3aWxkIGFuZCBvbmUgaXNfa2V5Q2xvc2UsIGFuZCB3aWxkJ3MgY29udGludWF0aW9uXG5cdC8vIGlzIGEgJFdpbGRjYXJkU2VxdWVuY2UgYW5kIHRoZSBvdGhlciBjb250aW51YXRpb24gaXNcblx0Ly8gaWRlbnRpY2FsIHRvIHRoZSBzZXF1ZW5jZSdzIGNvbnRpbnVhdGlvbiwgdGhlbiByZXBsYWNlXG5cdC8vIHRoZSB3aG9sZSB0aGluZyB3aXRoIGEgbmVzdGVkICRXaWxkY2FyZFNlcXVlbmNlLlxuXHQvLyAoV2Uga25vdyB3ID09PSB0YXJnZXQuZ2V0KF9fKSBmcm9tIGJlZm9yZS4pXG5cdC8vXG5cdC8vIFRPRE86IEkgc3VzcGVjdCBhY3R1YWxseSB0aGlzIGFwcGxpZXMgZXZlbiBpZiB0aGVyZSBhcmVcblx0Ly8gbW9yZSB0aGFuIHR3byBrZXlzLCBzbyBsb25nIGFzIGFsbCB0aGVpciBjb250aW51YXRpb25zXG5cdC8vIGFyZSBpZGVudGljYWwgYW5kIHRoZXJlJ3MgYXQgbGVhc3Qgb25lIGlzX2tleUNsb3NlXG5cdC8vIGFsb25nc2lkZSBhIHdpbGQuXG5cdGlmICh0YXJnZXQubGVuZ3RoID09PSAyKSB7XG5cdCAgICB2YXIgZmluYWxXID0gdGFyZ2V0LmdldChfXyk7XG5cdCAgICBpZiAoZmluYWxXIGluc3RhbmNlb2YgJFdpbGRjYXJkU2VxdWVuY2UpIHtcblx0XHRmb3IgKHZhciBrZXkgaW4gdGFyZ2V0LmVudHJpZXMpIHtcblx0XHQgICAgaWYgKChrZXkgIT09IF9fKSAmJiBpc19rZXlDbG9zZShrZXkpKSB7XG5cdFx0XHR2YXIgayA9IHRhcmdldC5nZXQoa2V5KTtcblx0XHRcdGlmIChtYXRjaGVyRXF1YWxzKGssIGZpbmFsVy5tYXRjaGVyKSkge1xuXHRcdFx0ICAgIHJldHVybiBmaW5hbFc7XG5cdFx0XHR9XG5cdFx0ICAgIH1cblx0XHR9XG5cdCAgICB9XG5cdH1cblxuXHRyZXR1cm4gdGFyZ2V0LmVtcHR5R3VhcmQoKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiB3YWxrV2lsZChrZXksIGssIHcpIHtcblx0aWYgKGlzX2VtcHR5TWF0Y2hlcih3KSkgcmV0dXJuIGs7XG5cdGlmIChpc19rZXlPcGVuKGtleSkpIHJldHVybiB3YWxrKGssIHJ3aWxkc2VxKHcpKTtcblx0aWYgKGlzX2tleUNsb3NlKGtleSkpIHtcblx0ICAgIGlmICh3IGluc3RhbmNlb2YgJFdpbGRjYXJkU2VxdWVuY2UpIHJldHVybiB3YWxrKGssIHcubWF0Y2hlcik7XG5cdCAgICByZXR1cm4gaztcblx0fVxuXHRyZXR1cm4gd2FsayhrLCB3KTtcbiAgICB9XG59XG5cbi8vIFJldHVybnMgbnVsbCBvbiBmYWlsZWQgbWF0Y2gsIG90aGVyd2lzZSB0aGUgYXBwcm9wcmlhdGUgc3VjY2Vzc1xuLy8gdmFsdWUgY29udGFpbmVkIGluIHRoZSBtYXRjaGVyIHIuXG5mdW5jdGlvbiBtYXRjaFZhbHVlKHIsIHYpIHtcbiAgICB2YXIgZmFpbHVyZVJlc3VsdCA9IG51bGw7XG5cbiAgICB2YXIgdnMgPSBbdl07XG4gICAgdmFyIHN0YWNrID0gW1tdXTtcblxuICAgIHdoaWxlICghaXNfZW1wdHlNYXRjaGVyKHIpKSB7XG5cdGlmIChyIGluc3RhbmNlb2YgJFdpbGRjYXJkU2VxdWVuY2UpIHtcblx0ICAgIGlmIChzdGFjay5sZW5ndGggPT09IDApIHJldHVybiBmYWlsdXJlUmVzdWx0O1xuXHQgICAgdnMgPSBzdGFjay5wb3AoKTtcblx0ICAgIHIgPSByLm1hdGNoZXI7XG5cdCAgICBjb250aW51ZTtcblx0fVxuXG5cdGlmIChyIGluc3RhbmNlb2YgJFN1Y2Nlc3MpIHtcblx0ICAgIGlmICh2cy5sZW5ndGggPT09IDAgJiYgc3RhY2subGVuZ3RoID09PSAwKSByZXR1cm4gci52YWx1ZTtcblx0ICAgIHJldHVybiBmYWlsdXJlUmVzdWx0O1xuXHR9XG5cblx0aWYgKHZzLmxlbmd0aCA9PT0gMCkge1xuXHQgICAgaWYgKHN0YWNrLmxlbmd0aCA9PT0gMCkgcmV0dXJuIGZhaWx1cmVSZXN1bHQ7XG5cdCAgICB2cyA9IHN0YWNrLnBvcCgpO1xuXHQgICAgciA9IHIuZ2V0KEVPQSk7XG5cdCAgICBjb250aW51ZTtcblx0fVxuXG5cdHZhciB2ID0gdnMuc2hpZnQoKTtcblxuXHRpZiAodHlwZW9mIHYgPT09ICdzdHJpbmcnICYmIHYuc3Vic3RyaW5nKDAsIDIpID09PSAnX18nKSB7XG5cdCAgICBkaWUoXCJDYW5ub3QgbWF0Y2ggc3BlY2lhbCBzdHJpbmcgc3RhcnRpbmcgd2l0aCBfX1wiKTtcblx0fVxuXG5cdGlmIChBcnJheS5pc0FycmF5KHYpKSB7XG5cdCAgICBpZiAoU09BIGluIHIuZW50cmllcykge1xuXHRcdHIgPSByLmdldChTT0EpO1xuXHRcdHN0YWNrLnB1c2godnMpO1xuXHRcdHZzID0gc2hhbGxvd0NvcHlBcnJheSh2KTtcblx0ICAgIH0gZWxzZSB7XG5cdFx0ciA9IHIuZ2V0KF9fKTtcblx0ICAgIH1cblx0fSBlbHNlIHtcblx0ICAgIHZhciBrZXk7XG5cdCAgICB0cnkge1xuXHRcdGtleSA9IEpTT04uc3RyaW5naWZ5KHYpO1xuXHQgICAgfSBjYXRjaCAoZXhuKSB7XG5cdFx0Ly8gRm9yIGV4YW1wbGUsIHYgbWlnaHQgYmUgY3ljbGljLCBhcyBpbiBET00gZXZlbnRzLlxuXHRcdGtleSA9IG51bGw7XG5cdCAgICB9XG5cdCAgICBpZiAoa2V5IGluIHIuZW50cmllcykge1xuXHRcdHIgPSByLmdldChrZXkpO1xuXHQgICAgfSBlbHNlIHtcblx0XHRyID0gci5nZXQoX18pO1xuXHQgICAgfVxuXHR9XG4gICAgfVxuXG4gICAgcmV0dXJuIGZhaWx1cmVSZXN1bHQ7XG59XG5cbi8vIFRPRE86IGJldHRlciBuYW1lIGZvciB0aGlzXG5mdW5jdGlvbiBtYXRjaE1hdGNoZXIobzEsIG8yLCBzZWVkKSB7XG4gICAgdmFyIGFjYyA9IHR5cGVvZiBzZWVkID09PSAndW5kZWZpbmVkJyA/IHt9IDogc2VlZDsgLy8gd2lsbCBiZSBtb2RpZmllZCBpbiBwbGFjZVxuICAgIHdhbGsobzEsIG8yKTtcbiAgICByZXR1cm4gYWNjO1xuXG4gICAgZnVuY3Rpb24gd2Fsa0ZsaXBwZWQocjIsIHIxKSB7IHJldHVybiB3YWxrKHIxLCByMik7IH1cblxuICAgIGZ1bmN0aW9uIHdhbGsocjEsIHIyKSB7XG5cdGlmIChpc19lbXB0eU1hdGNoZXIocjEpIHx8IGlzX2VtcHR5TWF0Y2hlcihyMikpIHJldHVybjtcblxuXHRpZiAocjEgaW5zdGFuY2VvZiAkV2lsZGNhcmRTZXF1ZW5jZSkge1xuXHQgICAgaWYgKHIyIGluc3RhbmNlb2YgJFdpbGRjYXJkU2VxdWVuY2UpIHtcblx0XHR3YWxrKHIxLm1hdGNoZXIsIHIyLm1hdGNoZXIpO1xuXHRcdHJldHVybjtcblx0ICAgIH1cblx0ICAgIHIxID0gZXhwYW5kV2lsZHNlcShyMS5tYXRjaGVyKTtcblx0fSBlbHNlIGlmIChyMiBpbnN0YW5jZW9mICRXaWxkY2FyZFNlcXVlbmNlKSB7XG5cdCAgICByMiA9IGV4cGFuZFdpbGRzZXEocjIubWF0Y2hlcik7XG5cdH1cblxuXHRpZiAocjEgaW5zdGFuY2VvZiAkU3VjY2VzcyAmJiByMiBpbnN0YW5jZW9mICRTdWNjZXNzKSB7XG5cdCAgICBtYXRjaE1hdGNoZXJTdWNjZXNzZXMocjEudmFsdWUsIHIyLnZhbHVlLCBhY2MpO1xuXHQgICAgcmV0dXJuO1xuXHR9XG5cblx0dmFyIHcxID0gcjEuZ2V0KF9fKTtcblx0dmFyIHcyID0gcjIuZ2V0KF9fKTtcblx0d2Fsayh3MSwgdzIpO1xuXG5cdGZ1bmN0aW9uIGV4YW1pbmVLZXkoa2V5KSB7XG5cdCAgICBpZiAoa2V5ICE9PSBfXykge1xuXHRcdHZhciBrMSA9IHIxLmdldChrZXkpO1xuXHRcdHZhciBrMiA9IHIyLmdldChrZXkpO1xuXHRcdGlmIChpc19lbXB0eU1hdGNoZXIoazEpKSB7XG5cdFx0ICAgIGlmIChpc19lbXB0eU1hdGNoZXIoazIpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0ICAgIH0gZWxzZSB7XG5cdFx0XHR3YWxrV2lsZCh3YWxrLCB3MSwga2V5LCBrMik7XG5cdFx0ICAgIH1cblx0XHR9IGVsc2Uge1xuXHRcdCAgICBpZiAoaXNfZW1wdHlNYXRjaGVyKGsyKSkge1xuXHRcdFx0d2Fsa1dpbGQod2Fsa0ZsaXBwZWQsIHcyLCBrZXksIGsxKTtcblx0XHQgICAgfSBlbHNlIHtcblx0XHRcdHdhbGsoazEsIGsyKTtcblx0XHQgICAgfVxuXHRcdH1cblx0ICAgIH1cblx0fVxuXG5cdC8vIE9wdGltaXplIHNpbWlsYXJseSB0byBpbnRlcnNlY3QoKS5cblx0aWYgKGlzX2VtcHR5TWF0Y2hlcih3MSkpIHtcblx0ICAgIGlmIChpc19lbXB0eU1hdGNoZXIodzIpKSB7XG5cdFx0Zm9yICh2YXIga2V5IGluIChyMS5sZW5ndGggPCByMi5sZW5ndGggPyByMSA6IHIyKS5lbnRyaWVzKSBleGFtaW5lS2V5KGtleSk7XG5cdCAgICB9IGVsc2Uge1xuXHRcdGZvciAodmFyIGtleSBpbiByMS5lbnRyaWVzKSBleGFtaW5lS2V5KGtleSk7XG5cdCAgICB9XG5cdH0gZWxzZSB7XG5cdCAgICBpZiAoaXNfZW1wdHlNYXRjaGVyKHcyKSkge1xuXHRcdGZvciAodmFyIGtleSBpbiByMi5lbnRyaWVzKSBleGFtaW5lS2V5KGtleSk7XG5cdCAgICB9IGVsc2Uge1xuXHRcdGZvciAodmFyIGtleSBpbiByMS5lbnRyaWVzKSBleGFtaW5lS2V5KGtleSk7XG5cdFx0Zm9yICh2YXIga2V5IGluIHIyLmVudHJpZXMpIGV4YW1pbmVLZXkoa2V5KTtcblx0ICAgIH1cblx0fVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIHdhbGtXaWxkKHdhbGtlciwgdywga2V5LCBrKSB7XG5cdGlmIChpc19lbXB0eU1hdGNoZXIodykpIHJldHVybjtcblx0aWYgKGlzX2tleU9wZW4oa2V5KSkge1xuXHQgICAgd2Fsa2VyKHJ3aWxkc2VxKHcpLCBrKTtcblx0ICAgIHJldHVybjtcblx0fVxuXHRpZiAoaXNfa2V5Q2xvc2Uoa2V5KSkge1xuXHQgICAgaWYgKHcgaW5zdGFuY2VvZiAkV2lsZGNhcmRTZXF1ZW5jZSkgd2Fsa2VyKHcubWF0Y2hlciwgayk7XG5cdCAgICByZXR1cm47XG5cdH1cblx0d2Fsa2VyKHcsIGspO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gYXBwZW5kTWF0Y2hlcihtLCBtVGFpbEZuKSB7XG4gICAgcmV0dXJuIHdhbGsobSk7XG5cbiAgICBmdW5jdGlvbiB3YWxrKG0pIHtcblx0aWYgKGlzX2VtcHR5TWF0Y2hlcihtKSkgcmV0dXJuIGVtcHR5TWF0Y2hlcjtcblx0aWYgKG0gaW5zdGFuY2VvZiAkV2lsZGNhcmRTZXF1ZW5jZSkgcmV0dXJuIHJ3aWxkc2VxKHdhbGsobS5tYXRjaGVyKSk7XG5cdGlmIChtIGluc3RhbmNlb2YgJFN1Y2Nlc3MpIGRpZShcIklsbC1mb3JtZWQgbWF0Y2hlclwiKTtcblxuXHR2YXIgdGFyZ2V0ID0gbmV3ICREaWN0KCk7XG5cdGZvciAodmFyIGtleSBpbiBtLmVudHJpZXMpIHtcblx0ICAgIHZhciBrID0gbS5nZXQoa2V5KTtcblx0ICAgIGlmIChpc19rZXlDbG9zZShrZXkpICYmIChrIGluc3RhbmNlb2YgJFN1Y2Nlc3MpKSB7XG5cdFx0dGFyZ2V0ID0gdW5pb24odGFyZ2V0LCBtVGFpbEZuKGsudmFsdWUpKTtcblx0ICAgIH0gZWxzZSB7XG5cdFx0cnVwZGF0ZUlucGxhY2UodGFyZ2V0LCBrZXksIHdhbGsoaykpO1xuXHQgICAgfVxuXHR9XG5cdHJldHVybiB0YXJnZXQuZW1wdHlHdWFyZCgpO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gcmVsYWJlbChtLCBmKSB7XG4gICAgcmV0dXJuIHdhbGsobSk7XG5cbiAgICBmdW5jdGlvbiB3YWxrKG0pIHtcblx0aWYgKGlzX2VtcHR5TWF0Y2hlcihtKSkgcmV0dXJuIGVtcHR5TWF0Y2hlcjtcblx0aWYgKG0gaW5zdGFuY2VvZiAkV2lsZGNhcmRTZXF1ZW5jZSkgcmV0dXJuIHJ3aWxkc2VxKHdhbGsobS5tYXRjaGVyKSk7XG5cdGlmIChtIGluc3RhbmNlb2YgJFN1Y2Nlc3MpIHJldHVybiByc3VjY2VzcyhmKG0udmFsdWUpKTtcblxuXHR2YXIgdGFyZ2V0ID0gbmV3ICREaWN0KCk7XG5cdGZvciAodmFyIGtleSBpbiBtLmVudHJpZXMpIHtcblx0ICAgIHJ1cGRhdGVJbnBsYWNlKHRhcmdldCwga2V5LCB3YWxrKG0uZ2V0KGtleSkpKTtcblx0fVxuXHRyZXR1cm4gdGFyZ2V0LmVtcHR5R3VhcmQoKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGNvbXBpbGVQcm9qZWN0aW9uKC8qIHByb2plY3Rpb24sIHByb2plY3Rpb24sIC4uLiAqLykge1xuICAgIHZhciBhY2MgPSBbXTtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGFyZ3VtZW50cy5sZW5ndGg7IGkrKykge1xuXHR3YWxrKGFyZ3VtZW50c1tpXSk7XG4gICAgfVxuICAgIGFjYy5wdXNoKEVPQSk7XG4gICAgcmV0dXJuIGFjYztcblxuICAgIGZ1bmN0aW9uIHdhbGsocCkge1xuXHRpZiAoaXNDYXB0dXJlKHApKSB7XG5cdCAgICBhY2MucHVzaChTT0MpO1xuXHQgICAgd2FsayhjYXB0dXJlUGF0dGVybihwKSk7XG5cdCAgICBhY2MucHVzaChFT0MpO1xuXHQgICAgcmV0dXJuO1xuXHR9XG5cblx0aWYgKEFycmF5LmlzQXJyYXkocCkpIHtcblx0ICAgIGFjYy5wdXNoKFNPQSk7XG5cdCAgICBmb3IgKHZhciBpID0gMDsgaSA8IHAubGVuZ3RoOyBpKyspIHtcblx0XHR3YWxrKHBbaV0pO1xuXHQgICAgfVxuXHQgICAgYWNjLnB1c2goRU9BKTtcblx0ICAgIHJldHVybjtcblx0fVxuXG5cdGlmIChwIGluc3RhbmNlb2YgJEVtYmVkZGVkKSB7XG5cdCAgICBkaWUoXCJDYW5ub3QgZW1iZWQgbWF0Y2hlciBpbiBwcm9qZWN0aW9uXCIpO1xuXHR9IGVsc2Uge1xuXHQgICAgaWYgKHAgPT09IF9fKSB7XG5cdFx0YWNjLnB1c2gocCk7XG5cdCAgICB9IGVsc2Uge1xuXHRcdGFjYy5wdXNoKEpTT04uc3RyaW5naWZ5KHApKTtcblx0ICAgIH1cblx0fVxuICAgIH1cbn1cblxuZnVuY3Rpb24gcHJvamVjdGlvblRvUGF0dGVybihwKSB7XG4gICAgcmV0dXJuIHdhbGsocCk7XG5cbiAgICBmdW5jdGlvbiB3YWxrKHApIHtcblx0aWYgKGlzQ2FwdHVyZShwKSkgcmV0dXJuIHdhbGsoY2FwdHVyZVBhdHRlcm4ocCkpO1xuXG5cdGlmIChBcnJheS5pc0FycmF5KHApKSB7XG5cdCAgICB2YXIgcmVzdWx0ID0gW107XG5cdCAgICBmb3IgKHZhciBpID0gMDsgaSA8IHAubGVuZ3RoOyBpKyspIHtcblx0XHRyZXN1bHQucHVzaCh3YWxrKHBbaV0pKTtcblx0ICAgIH1cblx0ICAgIHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRpZiAocCBpbnN0YW5jZW9mICRFbWJlZGRlZCkge1xuXHQgICAgcmV0dXJuIHAubWF0Y2hlcjtcblx0fSBlbHNlIHtcblx0ICAgIHJldHVybiBwO1xuXHR9XG4gICAgfVxufVxuXG5mdW5jdGlvbiBwcm9qZWN0KG0sIHNwZWMpIHtcbiAgICByZXR1cm4gd2FsayhmYWxzZSwgbSwgMCk7XG5cbiAgICBmdW5jdGlvbiB3YWxrKGlzQ2FwdHVyaW5nLCBtLCBzcGVjSW5kZXgpIHtcblx0aWYgKHNwZWNJbmRleCA+PSBzcGVjLmxlbmd0aCkge1xuXHQgICAgaWYgKGlzQ2FwdHVyaW5nKSBkaWUoXCJCYWQgc3BlY2lmaWNhdGlvbjogdW5jbG9zZWQgY2FwdHVyZVwiKTtcblx0ICAgIGlmIChtIGluc3RhbmNlb2YgJFN1Y2Nlc3MpIHtcblx0XHRyZXR1cm4gcnNlcShFT0EsIHJzdWNjZXNzKHByb2plY3RTdWNjZXNzKG0udmFsdWUpKSk7XG5cdCAgICB9IGVsc2Uge1xuXHRcdHJldHVybiBlbXB0eU1hdGNoZXI7XG5cdCAgICB9XG5cdH1cblxuXHRpZiAoaXNfZW1wdHlNYXRjaGVyKG0pKSByZXR1cm4gZW1wdHlNYXRjaGVyO1xuXG5cdHZhciBpdGVtID0gc3BlY1tzcGVjSW5kZXhdO1xuXHR2YXIgbmV4dEluZGV4ID0gc3BlY0luZGV4ICsgMTtcblxuXHRpZiAoaXRlbSA9PT0gRU9DKSB7XG5cdCAgICBpZiAoIWlzQ2FwdHVyaW5nKSBkaWUoXCJCYWQgc3BlY2lmaWNhdGlvbjogdW5lcHhlY3RlZCBFT0NcIik7XG5cdCAgICByZXR1cm4gd2FsayhmYWxzZSwgbSwgbmV4dEluZGV4KTtcblx0fVxuXG5cdGlmIChpdGVtID09PSBTT0MpIHtcblx0ICAgIGlmIChpc0NhcHR1cmluZykgZGllKFwiQmFkIHNwZWNpZmljYXRpb246IG5lc3RlZCBjYXB0dXJlXCIpO1xuXHQgICAgcmV0dXJuIHdhbGsodHJ1ZSwgbSwgbmV4dEluZGV4KTtcblx0fVxuXG5cdGlmIChpdGVtID09PSBfXykge1xuXHQgICAgaWYgKG0gaW5zdGFuY2VvZiAkV2lsZGNhcmRTZXF1ZW5jZSkge1xuXHRcdGlmIChpc0NhcHR1cmluZykge1xuXHRcdCAgICByZXR1cm4gcndpbGQod2Fsayhpc0NhcHR1cmluZywgbSwgbmV4dEluZGV4KSk7XG5cdFx0fSBlbHNlIHtcblx0XHQgICAgcmV0dXJuIHdhbGsoaXNDYXB0dXJpbmcsIG0sIG5leHRJbmRleCk7XG5cdFx0fVxuXHQgICAgfVxuXG5cdCAgICBpZiAobSBpbnN0YW5jZW9mICRTdWNjZXNzKSB7XG5cdFx0cmV0dXJuIGVtcHR5TWF0Y2hlcjtcblx0ICAgIH1cblxuXHQgICAgdmFyIHRhcmdldDtcblx0ICAgIGlmIChpc0NhcHR1cmluZykge1xuXHRcdHRhcmdldCA9IG5ldyAkRGljdCgpO1xuXHRcdHJ1cGRhdGVJbnBsYWNlKHRhcmdldCwgX18sIHdhbGsoaXNDYXB0dXJpbmcsIG0uZ2V0KF9fKSwgbmV4dEluZGV4KSk7XG5cdFx0Zm9yICh2YXIga2V5IGluIG0uZW50cmllcykge1xuXHRcdCAgICBpZiAoa2V5ICE9PSBfXykge1xuXHRcdFx0dmFyIG1rID0gbS5nZXQoa2V5KTtcblx0XHRcdGlmIChpc19rZXlPcGVuKGtleSkpIHtcblx0XHRcdCAgICBmdW5jdGlvbiBjb250KG1rMikgeyByZXR1cm4gd2Fsayhpc0NhcHR1cmluZywgbWsyLCBuZXh0SW5kZXgpOyB9XG5cdFx0XHQgICAgcnVwZGF0ZUlucGxhY2UodGFyZ2V0LCBrZXksIGNhcHR1cmVOZXN0ZWQobWssIGNvbnQpKTtcblx0XHRcdH0gZWxzZSBpZiAoaXNfa2V5Q2xvc2Uoa2V5KSkge1xuXHRcdFx0ICAgIC8vIGRvIG5vdGhpbmdcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHQgICAgcnVwZGF0ZUlucGxhY2UodGFyZ2V0LCBrZXksIHdhbGsoaXNDYXB0dXJpbmcsIG1rLCBuZXh0SW5kZXgpKTtcblx0XHRcdH1cblx0XHQgICAgfVxuXHRcdH1cblx0ICAgIH0gZWxzZSB7XG5cdFx0dGFyZ2V0ID0gd2Fsayhpc0NhcHR1cmluZywgbS5nZXQoX18pLCBuZXh0SW5kZXgpO1xuXHRcdGZvciAodmFyIGtleSBpbiBtLmVudHJpZXMpIHtcblx0XHQgICAgaWYgKGtleSAhPT0gX18pIHtcblx0XHRcdHZhciBtayA9IG0uZ2V0KGtleSk7XG5cdFx0XHRpZiAoaXNfa2V5T3BlbihrZXkpKSB7XG5cdFx0XHQgICAgZnVuY3Rpb24gY29udChtazIpIHsgcmV0dXJuIHdhbGsoaXNDYXB0dXJpbmcsIG1rMiwgbmV4dEluZGV4KTsgfVxuXHRcdFx0ICAgIHRhcmdldCA9IHVuaW9uKHRhcmdldCwgc2tpcE5lc3RlZChtaywgY29udCkpO1xuXHRcdFx0fSBlbHNlIGlmIChpc19rZXlDbG9zZShrZXkpKSB7XG5cdFx0XHQgICAgLy8gZG8gbm90aGluZ1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdCAgICB0YXJnZXQgPSB1bmlvbih0YXJnZXQsIHdhbGsoaXNDYXB0dXJpbmcsIG1rLCBuZXh0SW5kZXgpKTtcblx0XHRcdH1cblx0XHQgICAgfVxuXHRcdH1cblx0ICAgIH1cblx0ICAgIHJldHVybiB0YXJnZXQ7XG5cdH1cblxuXHR2YXIgcmVzdWx0O1xuXHRpZiAobSBpbnN0YW5jZW9mICRXaWxkY2FyZFNlcXVlbmNlKSB7XG5cdCAgICBpZiAoaXNfa2V5T3BlbihpdGVtKSkge1xuXHRcdHJlc3VsdCA9IHdhbGsoaXNDYXB0dXJpbmcsIHJ3aWxkc2VxKG0pLCBuZXh0SW5kZXgpO1xuXHQgICAgfSBlbHNlIGlmIChpc19rZXlDbG9zZShpdGVtKSkge1xuXHRcdHJlc3VsdCA9IHdhbGsoaXNDYXB0dXJpbmcsIG0ubWF0Y2hlciwgbmV4dEluZGV4KTtcblx0ICAgIH0gZWxzZSB7XG5cdFx0cmVzdWx0ID0gd2Fsayhpc0NhcHR1cmluZywgbSwgbmV4dEluZGV4KTtcblx0ICAgIH1cblx0fSBlbHNlIGlmIChtIGluc3RhbmNlb2YgJFN1Y2Nlc3MpIHtcblx0ICAgIHJlc3VsdCA9IGVtcHR5TWF0Y2hlcjtcblx0fSBlbHNlIHtcblx0ICAgIGlmIChpc19rZXlPcGVuKGl0ZW0pKSB7XG5cdFx0cmVzdWx0ID0gd2Fsayhpc0NhcHR1cmluZywgcndpbGRzZXEobS5nZXQoX18pKSwgbmV4dEluZGV4KTtcblx0ICAgIH0gZWxzZSBpZiAoaXNfa2V5Q2xvc2UoaXRlbSkpIHtcblx0XHRyZXN1bHQgPSBlbXB0eU1hdGNoZXI7XG5cdCAgICB9IGVsc2Uge1xuXHRcdHJlc3VsdCA9IHdhbGsoaXNDYXB0dXJpbmcsIG0uZ2V0KF9fKSwgbmV4dEluZGV4KTtcblx0ICAgIH1cblx0ICAgIHJlc3VsdCA9IHVuaW9uKHJlc3VsdCwgd2Fsayhpc0NhcHR1cmluZywgbS5nZXQoaXRlbSksIG5leHRJbmRleCkpO1xuXHR9XG5cdGlmIChpc0NhcHR1cmluZykge1xuXHQgICAgcmVzdWx0ID0gcnNlcShpdGVtLCByZXN1bHQpO1xuXHR9XG5cdHJldHVybiByZXN1bHQ7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gY2FwdHVyZU5lc3RlZChtLCBjb250KSB7XG5cdGlmIChtIGluc3RhbmNlb2YgJFdpbGRjYXJkU2VxdWVuY2UpIHtcblx0ICAgIHJldHVybiByd2lsZHNlcShjb250KG0ubWF0Y2hlcikpO1xuXHR9XG5cblx0aWYgKGlzX2VtcHR5TWF0Y2hlcihtKSB8fCAobSBpbnN0YW5jZW9mICRTdWNjZXNzKSkge1xuXHQgICAgcmV0dXJuIGVtcHR5TWF0Y2hlcjtcblx0fVxuXG5cdHZhciB0YXJnZXQgPSBuZXcgJERpY3QoKTtcblx0cnVwZGF0ZUlucGxhY2UodGFyZ2V0LCBfXywgY2FwdHVyZU5lc3RlZChtLmdldChfXyksIGNvbnQpKTtcblx0Zm9yICh2YXIga2V5IGluIG0uZW50cmllcykge1xuXHQgICAgaWYgKGtleSAhPT0gX18pIHtcblx0XHR2YXIgbWsgPSBtLmdldChrZXkpO1xuXHRcdGlmIChpc19rZXlPcGVuKGtleSkpIHtcblx0XHQgICAgZnVuY3Rpb24gY29udDIobWsyKSB7IHJldHVybiBjYXB0dXJlTmVzdGVkKG1rMiwgY29udCk7IH1cblx0XHQgICAgcnVwZGF0ZUlucGxhY2UodGFyZ2V0LCBrZXksIGNhcHR1cmVOZXN0ZWQobWssIGNvbnQyKSk7XG5cdFx0fSBlbHNlIGlmIChpc19rZXlDbG9zZShrZXkpKSB7XG5cdFx0ICAgIHJ1cGRhdGVJbnBsYWNlKHRhcmdldCwga2V5LCBjb250KG1rKSk7XG5cdFx0fSBlbHNlIHtcblx0XHQgICAgcnVwZGF0ZUlucGxhY2UodGFyZ2V0LCBrZXksIGNhcHR1cmVOZXN0ZWQobWssIGNvbnQpKTtcblx0XHR9XG5cdCAgICB9XG5cdH1cblx0cmV0dXJuIHRhcmdldC5lbXB0eUd1YXJkKCk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gc2tpcE5lc3RlZChtLCBjb250KSB7XG5cdGlmIChtIGluc3RhbmNlb2YgJFdpbGRjYXJkU2VxdWVuY2UpIHtcblx0ICAgIHJldHVybiBjb250KG0ubWF0Y2hlcik7XG5cdH1cblxuXHRpZiAoaXNfZW1wdHlNYXRjaGVyKG0pIHx8IChtIGluc3RhbmNlb2YgJFN1Y2Nlc3MpKSB7XG5cdCAgICByZXR1cm4gZW1wdHlNYXRjaGVyO1xuXHR9XG5cblx0dmFyIHRhcmdldCA9IHNraXBOZXN0ZWQobS5nZXQoX18pLCBjb250KTtcblx0Zm9yICh2YXIga2V5IGluIG0uZW50cmllcykge1xuXHQgICAgaWYgKGtleSAhPT0gX18pIHtcblx0XHR2YXIgbWsgPSBtLmdldChrZXkpO1xuXHRcdGlmIChpc19rZXlPcGVuKGtleSkpIHtcblx0XHQgICAgZnVuY3Rpb24gY29udDIobWsyKSB7IHJldHVybiBza2lwTmVzdGVkKG1rMiwgY29udCk7IH1cblx0XHQgICAgdGFyZ2V0ID0gdW5pb24odGFyZ2V0LCBza2lwTmVzdGVkKG1rLCBjb250MikpO1xuXHRcdH0gZWxzZSBpZiAoaXNfa2V5Q2xvc2Uoa2V5KSkge1xuXHRcdCAgICB0YXJnZXQgPSB1bmlvbih0YXJnZXQsIGNvbnQobWspKTtcblx0XHR9IGVsc2Uge1xuXHRcdCAgICB0YXJnZXQgPSB1bmlvbih0YXJnZXQsIHNraXBOZXN0ZWQobWssIGNvbnQpKTtcblx0XHR9XG5cdCAgICB9XG5cdH1cblx0cmV0dXJuIHRhcmdldDtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIG1hdGNoZXJLZXlzKG0pIHtcbiAgICBpZiAoaXNfZW1wdHlNYXRjaGVyKG0pKSByZXR1cm4gW107XG4gICAgcmV0dXJuIHdhbGtTZXEobSwgZnVuY3Rpb24gKHZzcywgdnNrKSB7IHJldHVybiB2c3M7IH0pO1xuXG4gICAgZnVuY3Rpb24gd2FsayhtLCBrKSB7XG5cdGlmIChtIGluc3RhbmNlb2YgJFdpbGRjYXJkU2VxdWVuY2UpIHJldHVybiBudWxsO1xuXHRpZiAobSBpbnN0YW5jZW9mICRTdWNjZXNzKSByZXR1cm4gW107XG5cdGlmIChtLmhhcyhfXykpIHJldHVybiBudWxsO1xuXHR2YXIgYWNjID0gW107XG5cdGZvciAodmFyIGtleSBpbiBtLmVudHJpZXMpIHtcblx0ICAgIHZhciBtayA9IG0uZ2V0KGtleSk7XG5cdCAgICB2YXIgcGllY2U7XG5cdCAgICBpZiAoaXNfa2V5T3BlbihrZXkpKSB7XG5cdFx0ZnVuY3Rpb24gc2VxSyh2c3MsIHZzaykge1xuXHRcdCAgICB2YXIgYWNjID0gW107XG5cdFx0ICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdnNzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHR2YXIgdnMgPSB2c3NbaV07XG5cdFx0XHRhY2MgPSBhY2MuY29uY2F0KGsodHJhbnNmb3JtU2Vxcyh2cywga2V5KSwgdnNrKSk7XG5cdFx0ICAgIH1cblx0XHQgICAgcmV0dXJuIGFjYztcblx0XHR9XG5cdFx0cGllY2UgPSB3YWxrU2VxKG1rLCBzZXFLKTtcblx0ICAgIH0gZWxzZSBpZiAoaXNfa2V5Q2xvc2Uoa2V5KSkge1xuXHRcdGRpZShcIm1hdGNoZXJLZXlzOiBpbnRlcm5hbCBlcnJvcjogdW5leHBlY3RlZCBrZXktY2xvc2VcIik7XG5cdCAgICB9IGVsc2Uge1xuXHRcdHBpZWNlID0gayhKU09OLnBhcnNlKGtleSksIG1rKTtcblx0ICAgIH1cblx0ICAgIGlmIChwaWVjZSA9PSBudWxsKSByZXR1cm4gbnVsbDtcblx0ICAgIGFjYyA9IGFjYy5jb25jYXQocGllY2UpO1xuXHR9XG5cdHJldHVybiBhY2M7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gd2Fsa1NlcShtLCBrKSB7XG5cdGlmIChtIGluc3RhbmNlb2YgJFdpbGRjYXJkU2VxdWVuY2UpIHJldHVybiBudWxsO1xuXHRpZiAobSBpbnN0YW5jZW9mICRTdWNjZXNzKSByZXR1cm4gayhbXSwgZW1wdHlNYXRjaGVyKTsgLy8gVE9ETzogPz9cblx0aWYgKG0uaGFzKF9fKSkgcmV0dXJuIG51bGw7XG5cdHZhciBhY2MgPSBbXTtcblx0Zm9yICh2YXIga2V5IGluIG0uZW50cmllcykge1xuXHQgICAgdmFyIG1rID0gbS5nZXQoa2V5KTtcblx0ICAgIHZhciBwaWVjZTtcblx0ICAgIGlmIChpc19rZXlDbG9zZShrZXkpKSB7XG5cdFx0cGllY2UgPSBrKFtbXV0sIG1rKTtcblx0ICAgIH0gZWxzZSB7XG5cdFx0ZnVuY3Rpb24gb3V0ZXJLKHYsIHZrKSB7XG5cdFx0ICAgIHJldHVybiB3YWxrU2VxKHZrLCBpbm5lckspO1xuXHRcdCAgICBmdW5jdGlvbiBpbm5lcksodnNzLCB2c2spIHtcblx0XHRcdHZhciBhY2MgPSBbXTtcblx0XHRcdGZvciAodmFyIGkgPSAwOyBpIDwgdnNzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHQgICAgdmFyIHZzID0gc2hhbGxvd0NvcHlBcnJheSh2c3NbaV0pO1xuXHRcdFx0ICAgIHZzLnVuc2hpZnQodik7XG5cdFx0XHQgICAgYWNjLnB1c2godnMpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGsoYWNjLCB2c2spO1xuXHRcdCAgICB9XG5cdFx0fVxuXHRcdHBpZWNlID0gd2Fsayhyc2VxKGtleSwgbWspLCBvdXRlckspO1xuXHQgICAgfVxuXHQgICAgaWYgKHBpZWNlID09IG51bGwpIHJldHVybiBudWxsO1xuXHQgICAgYWNjID0gYWNjLmNvbmNhdChwaWVjZSk7XG5cdH1cblx0cmV0dXJuIGFjYztcbiAgICB9XG5cbiAgICBmdW5jdGlvbiB0cmFuc2Zvcm1TZXFzKHZzLCBvcGVuZXIpIHtcblx0aWYgKG9wZW5lciA9PT0gU09BKSByZXR1cm4gdnM7XG5cdGRpZShcIkludGVybmFsIGVycm9yOiB1bmtub3duIG9wZW5lciBcIiArIG9wZW5lcik7XG4gICAgfVxufVxuXG5mdW5jdGlvbiBwcmV0dHlNYXRjaGVyKG0sIGluaXRpYWxJbmRlbnQpIHtcbiAgICB2YXIgYWNjID0gW107XG4gICAgd2Fsayhpbml0aWFsSW5kZW50IHx8IDAsIG0pO1xuICAgIHJldHVybiBhY2Muam9pbignJyk7XG5cbiAgICBmdW5jdGlvbiB3YWxrKGksIG0pIHtcblx0aWYgKGlzX2VtcHR5TWF0Y2hlcihtKSkge1xuXHQgICAgYWNjLnB1c2goXCI6Ojogbm8gZnVydGhlciBtYXRjaGVzIHBvc3NpYmxlXCIpO1xuXHQgICAgcmV0dXJuO1xuXHR9XG5cdGlmIChtIGluc3RhbmNlb2YgJFdpbGRjYXJkU2VxdWVuY2UpIHtcblx0ICAgIGFjYy5wdXNoKFwiLi4uPlwiKTtcblx0ICAgIHdhbGsoaSArIDQsIG0ubWF0Y2hlcik7XG5cdCAgICByZXR1cm47XG5cdH1cblx0aWYgKG0gaW5zdGFuY2VvZiAkU3VjY2Vzcykge1xuXHQgICAgdmFyIHZzID0gSlNPTi5zdHJpbmdpZnkodHlwZW9mIG0udmFsdWUgPT09ICdvYmplY3QnXG5cdFx0XHRcdCAgICA/IHNldFRvQXJyYXkobS52YWx1ZSlcblx0XHRcdFx0ICAgIDogbS52YWx1ZSk7XG5cdCAgICBhY2MucHVzaChcIntcIiArIHZzICsgXCJ9XCIpO1xuXHQgICAgcmV0dXJuO1xuXHR9XG5cblx0aWYgKG0ubGVuZ3RoID09PSAwKSB7XG5cdCAgICBhY2MucHVzaChcIiA6OjogZW1wdHkgaGFzaCFcIik7XG5cdCAgICByZXR1cm47XG5cdH1cblxuXHR2YXIgbmVlZFNlcCA9IGZhbHNlO1xuXHR2YXIga2V5cyA9IG0uc29ydGVkS2V5cygpO1xuXHRmb3IgKHZhciBrZXlpID0gMDsga2V5aSA8IGtleXMubGVuZ3RoOyBrZXlpKyspIHtcblx0ICAgIHZhciBrZXkgPSBrZXlzW2tleWldO1xuXHQgICAgdmFyIGsgPSBtLmVudHJpZXNba2V5XTtcblx0ICAgIGlmIChuZWVkU2VwKSB7XG5cdFx0YWNjLnB1c2goXCJcXG5cIik7XG5cdFx0YWNjLnB1c2goaW5kZW50U3RyKGkpKTtcblx0ICAgIH0gZWxzZSB7XG5cdFx0bmVlZFNlcCA9IHRydWU7XG5cdCAgICB9XG5cdCAgICBhY2MucHVzaChcIiBcIik7XG5cdCAgICBpZiAoa2V5ID09PSBfXykga2V5ID0gJ+KYhSc7XG5cdCAgICBpZiAoa2V5ID09PSBTT0EpIGtleSA9ICc8Jztcblx0ICAgIGlmIChrZXkgPT09IEVPQSkga2V5ID0gJz4nO1xuXHQgICAgYWNjLnB1c2goa2V5KTtcblx0ICAgIHdhbGsoaSArIGtleS5sZW5ndGggKyAxLCBrKTtcblx0fVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGluZGVudFN0cihpKSB7XG5cdHJldHVybiBuZXcgQXJyYXkoaSArIDEpLmpvaW4oJyAnKTsgLy8gZXd3XG4gICAgfVxufVxuXG5mdW5jdGlvbiBzZXJpYWxpemVNYXRjaGVyKG0sIHNlcmlhbGl6ZVN1Y2Nlc3MpIHtcbiAgICByZXR1cm4gd2FsayhtKTtcbiAgICBmdW5jdGlvbiB3YWxrKG0pIHtcblx0aWYgKGlzX2VtcHR5TWF0Y2hlcihtKSkgcmV0dXJuIFtdO1xuXHRpZiAobSBpbnN0YW5jZW9mICRXaWxkY2FyZFNlcXVlbmNlKSB7XG5cdCAgICByZXR1cm4gW1wiLi4uKVwiLCB3YWxrKG0ubWF0Y2hlcildO1xuXHR9XG5cdGlmIChtIGluc3RhbmNlb2YgJFN1Y2Nlc3MpIHtcblx0ICAgIHJldHVybiBbXCJcIiwgc2VyaWFsaXplU3VjY2VzcyhtLnZhbHVlKV07XG5cdH1cblx0dmFyIGFjYyA9IFtdO1xuXHRmb3IgKHZhciBrZXkgaW4gbS5lbnRyaWVzKSB7XG5cdCAgICB2YXIgayA9IG0uZW50cmllc1trZXldO1xuXHQgICAgaWYgKGtleSA9PT0gX18pIGtleSA9IFtcIl9fXCJdO1xuXHQgICAgZWxzZSBpZiAoa2V5ID09PSBTT0EpIGtleSA9IFtcIihcIl07XG5cdCAgICBlbHNlIGlmIChrZXkgPT09IEVPQSkga2V5ID0gW1wiKVwiXTtcblx0ICAgIGVsc2Uga2V5ID0gSlNPTi5wYXJzZShrZXkpO1xuXHQgICAgYWNjLnB1c2goW2tleSwgd2FsayhrKV0pO1xuXHR9XG5cdHJldHVybiBhY2M7XG4gICAgfVxufVxuXG5mdW5jdGlvbiBkZXNlcmlhbGl6ZU1hdGNoZXIociwgZGVzZXJpYWxpemVTdWNjZXNzKSB7XG4gICAgcmV0dXJuIHdhbGsocik7XG4gICAgZnVuY3Rpb24gd2FsayhyKSB7XG5cdGlmIChyLmxlbmd0aCA9PT0gMCkgcmV0dXJuIGVtcHR5TWF0Y2hlcjtcblx0aWYgKHJbMF0gPT09IFwiLi4uKVwiKSByZXR1cm4gcndpbGRzZXEod2FsayhyWzFdKSk7XG5cdGlmIChyWzBdID09PSBcIlwiKSByZXR1cm4gcnN1Y2Nlc3MoZGVzZXJpYWxpemVTdWNjZXNzKHJbMV0pKTtcblx0dmFyIGFjYyA9IG5ldyAkRGljdCgpO1xuXHRmb3IgKHZhciBpID0gMDsgaSA8IHIubGVuZ3RoOyBpKyspIHtcblx0ICAgIHZhciBya2V5ID0gcltpXVswXTtcblx0ICAgIHZhciByayA9IHJbaV1bMV07XG5cdCAgICB2YXIga2V5O1xuXHQgICAgaWYgKEFycmF5LmlzQXJyYXkocmtleSkpIHtcblx0XHRzd2l0Y2ggKHJrZXlbMF0pIHtcblx0XHRjYXNlIFwiX19cIjoga2V5ID0gX187IGJyZWFrO1xuXHRcdGNhc2UgXCIoXCI6IGtleSA9IFNPQTsgYnJlYWs7XG5cdFx0Y2FzZSBcIilcIjoga2V5ID0gRU9BOyBicmVhaztcblx0XHRkZWZhdWx0OiBkaWUoXCJJbnZhbGlkIHNlcmlhbGl6ZWQgc3BlY2lhbCBrZXk6IFwiICsgcmtleVswXSk7XG5cdFx0fVxuXHQgICAgfSBlbHNlIHtcblx0XHRrZXkgPSBKU09OLnN0cmluZ2lmeShya2V5KTtcblx0ICAgIH1cblx0ICAgIHJ1cGRhdGVJbnBsYWNlKGFjYywga2V5LCB3YWxrKHJrKSk7XG5cdH1cblx0cmV0dXJuIGFjYztcbiAgICB9XG59XG5cbi8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuLy8gR2VzdGFsdHMuXG4vLyBUT0RPOiBzdXBwb3J0IEluZmluaXR5IGFzIGEgbGV2ZWwgbnVtYmVyXG5cbmZ1bmN0aW9uIEdlc3RhbHRMZXZlbChzdWJzLCBhZHZzKSB7XG4gICAgdGhpcy5zdWJzY3JpcHRpb25zID0gc3VicztcbiAgICB0aGlzLmFkdmVydGlzZW1lbnRzID0gYWR2cztcbn1cblxuR2VzdGFsdExldmVsLnByb3RvdHlwZS5pc0VtcHR5ID0gZnVuY3Rpb24gKCkge1xuICAgIHJldHVybiBpc19lbXB0eU1hdGNoZXIodGhpcy5zdWJzY3JpcHRpb25zKSAmJiBpc19lbXB0eU1hdGNoZXIodGhpcy5hZHZlcnRpc2VtZW50cyk7XG59O1xuXG5HZXN0YWx0TGV2ZWwucHJvdG90eXBlLmVxdWFscyA9IGZ1bmN0aW9uIChvdGhlcikge1xuICAgIHJldHVybiBtYXRjaGVyRXF1YWxzKHRoaXMuc3Vic2NyaXB0aW9ucywgb3RoZXIuc3Vic2NyaXB0aW9ucylcblx0JiYgbWF0Y2hlckVxdWFscyh0aGlzLmFkdmVydGlzZW1lbnRzLCBvdGhlci5hZHZlcnRpc2VtZW50cyk7XG59O1xuXG5HZXN0YWx0TGV2ZWwucHJvdG90eXBlLnByZXR0eSA9IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgYWNjID0gW107XG4gICAgaWYgKCFpc19lbXB0eU1hdGNoZXIodGhpcy5zdWJzY3JpcHRpb25zKSkge1xuXHRhY2MucHVzaChcIiAgLSBzdWJzOlwiKTtcblx0YWNjLnB1c2gocHJldHR5TWF0Y2hlcih0aGlzLnN1YnNjcmlwdGlvbnMsIDkpKTtcblx0YWNjLnB1c2goXCJcXG5cIik7XG4gICAgfVxuICAgIGlmICghaXNfZW1wdHlNYXRjaGVyKHRoaXMuYWR2ZXJ0aXNlbWVudHMpKSB7XG5cdGFjYy5wdXNoKFwiICAtIGFkdnM6XCIpO1xuXHRhY2MucHVzaChwcmV0dHlNYXRjaGVyKHRoaXMuYWR2ZXJ0aXNlbWVudHMsIDkpKTtcblx0YWNjLnB1c2goXCJcXG5cIik7XG4gICAgfVxuICAgIHJldHVybiBhY2Muam9pbignJyk7XG59O1xuXG5mdW5jdGlvbiBzdHJhaWdodEdlc3RhbHRMZXZlbE9wKG9wKSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uIChwMSwgcDIpIHtcblx0cmV0dXJuIG5ldyBHZXN0YWx0TGV2ZWwob3AocDEuc3Vic2NyaXB0aW9ucywgcDIuc3Vic2NyaXB0aW9ucyksXG5cdFx0XHRcdG9wKHAxLmFkdmVydGlzZW1lbnRzLCBwMi5hZHZlcnRpc2VtZW50cykpO1xuICAgIH07XG59O1xuXG52YXIgZW1wdHlMZXZlbCA9IG5ldyBHZXN0YWx0TGV2ZWwoZW1wdHlNYXRjaGVyLCBlbXB0eU1hdGNoZXIpO1xudmFyIGVtcHR5TWV0YUxldmVsID0gW107XG5cbmZ1bmN0aW9uIEdlc3RhbHQobWV0YUxldmVscykge1xuICAgIHRoaXMubWV0YUxldmVscyA9IG1ldGFMZXZlbHM7XG59XG5cbkdlc3RhbHQucHJvdG90eXBlLmdldE1ldGFMZXZlbCA9IGZ1bmN0aW9uIChuKSB7XG4gICAgcmV0dXJuIHRoaXMubWV0YUxldmVsc1tuXSB8fCBlbXB0eU1ldGFMZXZlbDtcbn07XG5cbkdlc3RhbHQucHJvdG90eXBlLmdldExldmVsID0gZnVuY3Rpb24gKG1ldGFMZXZlbCwgbGV2ZWwpIHtcbiAgICByZXR1cm4gdGhpcy5nZXRNZXRhTGV2ZWwobWV0YUxldmVsKVtsZXZlbF0gfHwgZW1wdHlMZXZlbDtcbn07XG5cbkdlc3RhbHQucHJvdG90eXBlLm1ldGFMZXZlbENvdW50ID0gZnVuY3Rpb24gKCkgeyByZXR1cm4gdGhpcy5tZXRhTGV2ZWxzLmxlbmd0aDsgfTtcbkdlc3RhbHQucHJvdG90eXBlLmxldmVsQ291bnQgPSBmdW5jdGlvbiAobikgeyByZXR1cm4gdGhpcy5nZXRNZXRhTGV2ZWwobikubGVuZ3RoOyB9O1xuXG5HZXN0YWx0LnByb3RvdHlwZS5tYXRjaFZhbHVlID0gZnVuY3Rpb24gKGJvZHksIG1ldGFMZXZlbCwgaXNGZWVkYmFjaykge1xuICAgIHZhciBsZXZlbHMgPSB0aGlzLmdldE1ldGFMZXZlbChtZXRhTGV2ZWwpO1xuICAgIHZhciBwaWRzID0ge307XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsZXZlbHMubGVuZ3RoOyBpKyspIHtcblx0dmFyIG1hdGNoZXIgPSAoaXNGZWVkYmFjayA/IGxldmVsc1tpXS5hZHZlcnRpc2VtZW50cyA6IGxldmVsc1tpXS5zdWJzY3JpcHRpb25zKTtcblx0c2V0VW5pb25JbnBsYWNlKHBpZHMsIG1hdGNoVmFsdWUobWF0Y2hlciwgYm9keSkpO1xuICAgIH1cbiAgICByZXR1cm4gc2V0VG9BcnJheShwaWRzKTtcbn07XG5cbkdlc3RhbHQucHJvdG90eXBlLnByb2plY3QgPSBmdW5jdGlvbiAoc3BlYywgZ2V0QWR2ZXJ0aXNlbWVudHMsIG1ldGFMZXZlbCwgbGV2ZWwpIHtcbiAgICB2YXIgbCA9IHRoaXMuZ2V0TGV2ZWwobWV0YUxldmVsIHwgMCwgbGV2ZWwgfCAwKTtcbiAgICB2YXIgbWF0Y2hlciA9IChnZXRBZHZlcnRpc2VtZW50cyA/IGwuYWR2ZXJ0aXNlbWVudHMgOiBsLnN1YnNjcmlwdGlvbnMpO1xuICAgIHJldHVybiBwcm9qZWN0KG1hdGNoZXIsIHNwZWMpO1xufTtcblxuR2VzdGFsdC5wcm90b3R5cGUuZHJvcCA9IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgbWxzID0gc2hhbGxvd0NvcHlBcnJheSh0aGlzLm1ldGFMZXZlbHMpO1xuICAgIG1scy5zaGlmdCgpO1xuICAgIHJldHVybiBuZXcgR2VzdGFsdChtbHMpO1xufTtcblxuR2VzdGFsdC5wcm90b3R5cGUubGlmdCA9IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgbWxzID0gc2hhbGxvd0NvcHlBcnJheSh0aGlzLm1ldGFMZXZlbHMpO1xuICAgIG1scy51bnNoaWZ0KGVtcHR5TWV0YUxldmVsKTtcbiAgICByZXR1cm4gbmV3IEdlc3RhbHQobWxzKTtcbn07XG5cbkdlc3RhbHQucHJvdG90eXBlLmVxdWFscyA9IGZ1bmN0aW9uIChvdGhlcikge1xuICAgIGlmICh0aGlzLm1ldGFMZXZlbHMubGVuZ3RoICE9PSBvdGhlci5tZXRhTGV2ZWxzLmxlbmd0aCkgcmV0dXJuIGZhbHNlO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5tZXRhTGV2ZWxzLmxlbmd0aDsgaSsrKSB7XG5cdHZhciBsczEgPSB0aGlzLm1ldGFMZXZlbHNbaV07XG5cdHZhciBsczIgPSBvdGhlci5tZXRhTGV2ZWxzW2ldO1xuXHRpZiAobHMxLmxlbmd0aCAhPT0gbHMyLmxlbmd0aCkgcmV0dXJuIGZhbHNlO1xuXHRmb3IgKHZhciBqID0gMDsgaiA8IGxzMS5sZW5ndGg7IGorKykge1xuXHQgICAgdmFyIHAxID0gbHMxW2pdO1xuXHQgICAgdmFyIHAyID0gbHMyW2pdO1xuXHQgICAgaWYgKCFwMS5lcXVhbHMocDIpKSByZXR1cm4gZmFsc2U7XG5cdH1cbiAgICB9XG4gICAgcmV0dXJuIHRydWU7XG59O1xuXG5mdW5jdGlvbiBzaW1wbGVHZXN0YWx0KGlzQWR2LCBwYXQsIG1ldGFMZXZlbCwgbGV2ZWwpIHtcbiAgICBtZXRhTGV2ZWwgPSBtZXRhTGV2ZWwgfHwgMDtcbiAgICBsZXZlbCA9IGxldmVsIHx8IDA7XG4gICAgdmFyIG1hdGNoZXIgPSBjb21waWxlUGF0dGVybih0cnVlLCBwYXQpO1xuICAgIHZhciBsID0gbmV3IEdlc3RhbHRMZXZlbChpc0FkdiA/IGVtcHR5TWF0Y2hlciA6IG1hdGNoZXIsXG5cdFx0XHQgICAgIGlzQWR2ID8gbWF0Y2hlciA6IGVtcHR5TWF0Y2hlcik7XG4gICAgdmFyIGxldmVscyA9IFtsXTtcbiAgICB3aGlsZSAobGV2ZWwtLSkgeyBsZXZlbHMudW5zaGlmdChlbXB0eUxldmVsKTsgfVxuICAgIHZhciBtZXRhTGV2ZWxzID0gW2xldmVsc107XG4gICAgd2hpbGUgKG1ldGFMZXZlbC0tKSB7IG1ldGFMZXZlbHMudW5zaGlmdChlbXB0eU1ldGFMZXZlbCk7IH1cbiAgICByZXR1cm4gbmV3IEdlc3RhbHQobWV0YUxldmVscyk7XG59XG5cbnZhciBlbXB0eUdlc3RhbHQgPSBuZXcgR2VzdGFsdChbXSk7XG5cbi8vIE5vdCBxdWl0ZSB3aGF0IGl0IHNheXMgb24gdGhlIHRpbiAtIHRoZSB0cnVlIGZ1bGxHZXN0YWx0XG4vLyB3b3VsZG4ndCBiZSBwYXJhbWV0ZXJpemVkIG9uIHRoZSBudW1iZXIgb2YgbGV2ZWxzIGFuZFxuLy8gbWV0YWxldmVscywgYnV0IGluc3RlYWQgd291bGQgYmUgZnVsbCBhdCAqYWxsKiBsZXZlbHMgYW5kXG4vLyBtZXRhbGV2ZWxzLiBPdXIgcmVwcmVzZW50YXRpb24gbGVha3MgdGhyb3VnaCBpbnRvIHRoZSBpbnRlcmZhY2Vcbi8vIGhlcmUgOi0vXG5mdW5jdGlvbiBmdWxsR2VzdGFsdChuTWV0YWxldmVscywgbkxldmVscykge1xuICAgIHZhciBtYXRjaGVyID0gY29tcGlsZVBhdHRlcm4odHJ1ZSwgX18pO1xuICAgIHZhciBsID0gbmV3IEdlc3RhbHRMZXZlbChtYXRjaGVyLCBtYXRjaGVyKTtcbiAgICB2YXIgbGV2ZWxzID0gW107XG4gICAgd2hpbGUgKG5MZXZlbHMtLSkgeyBsZXZlbHMucHVzaChsKTsgfVxuICAgIHZhciBtZXRhTGV2ZWxzID0gW107XG4gICAgd2hpbGUgKG5NZXRhbGV2ZWxzLS0pIHsgbWV0YUxldmVscy5wdXNoKGxldmVscyk7IH1cbiAgICByZXR1cm4gbmV3IEdlc3RhbHQobWV0YUxldmVscyk7XG59XG5cbkdlc3RhbHQucHJvdG90eXBlLmlzRW1wdHkgPSBmdW5jdGlvbiAoKSB7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLm1ldGFMZXZlbHMubGVuZ3RoOyBpKyspIHtcblx0dmFyIGxldmVscyA9IHRoaXMubWV0YUxldmVsc1tpXTtcblx0Zm9yICh2YXIgaiA9IDA7IGogPCBsZXZlbHMubGVuZ3RoOyBqKyspIHtcblx0ICAgIGlmICghbGV2ZWxzW2pdLmlzRW1wdHkoKSkgcmV0dXJuIGZhbHNlO1xuXHR9XG4gICAgfVxuICAgIHJldHVybiB0cnVlO1xufTtcblxuZnVuY3Rpb24gbWF5YmVQdXNoTGV2ZWwobGV2ZWxzLCBpLCBsZXZlbCkge1xuICAgIGlmICghbGV2ZWwuaXNFbXB0eSgpKSB7XG5cdHdoaWxlIChsZXZlbHMubGVuZ3RoIDwgaSkgbGV2ZWxzLnB1c2goZW1wdHlMZXZlbCk7XG5cdGxldmVscy5wdXNoKGxldmVsKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIG1heWJlUHVzaE1ldGFMZXZlbChtZXRhTGV2ZWxzLCBpLCBtZXRhTGV2ZWwpIHtcbiAgICBpZiAobWV0YUxldmVsLmxlbmd0aCA+IDApIHtcblx0d2hpbGUgKG1ldGFMZXZlbHMubGVuZ3RoIDwgaSkgbWV0YUxldmVscy5wdXNoKGVtcHR5TWV0YUxldmVsKTtcblx0bWV0YUxldmVscy5wdXNoKG1ldGFMZXZlbCk7XG4gICAgfVxufVxuXG5HZXN0YWx0LnByb3RvdHlwZS5tYXBaaXAgPSBmdW5jdGlvbiAob3RoZXIsIGxlbmd0aENvbWJpbmVyLCBmKSB7XG4gICAgdmFyIG1ldGFMZXZlbHMgPSBbXTtcbiAgICB2YXIgbWxzMSA9IHRoaXMubWV0YUxldmVscztcbiAgICB2YXIgbWxzMiA9IG90aGVyLm1ldGFMZXZlbHM7XG4gICAgdmFyIG5tID0gbGVuZ3RoQ29tYmluZXIobWxzMS5sZW5ndGgsIG1sczIubGVuZ3RoKTtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IG5tOyBpKyspIHtcblx0dmFyIGxldmVscyA9IFtdO1xuXHR2YXIgbHMxID0gbWxzMVtpXSB8fCBlbXB0eU1ldGFMZXZlbDtcblx0dmFyIGxzMiA9IG1sczJbaV0gfHwgZW1wdHlNZXRhTGV2ZWw7XG5cdHZhciBubCA9IGxlbmd0aENvbWJpbmVyKGxzMS5sZW5ndGgsIGxzMi5sZW5ndGgpO1xuXHRmb3IgKHZhciBqID0gMDsgaiA8IG5sOyBqKyspIHtcblx0ICAgIHZhciBwMSA9IGxzMVtqXSB8fCBlbXB0eUxldmVsO1xuXHQgICAgdmFyIHAyID0gbHMyW2pdIHx8IGVtcHR5TGV2ZWw7XG5cdCAgICB2YXIgcCA9IGYocDEsIHAyKTtcblx0ICAgIG1heWJlUHVzaExldmVsKGxldmVscywgaiwgcCk7XG5cdH1cblx0bWF5YmVQdXNoTWV0YUxldmVsKG1ldGFMZXZlbHMsIGksIGxldmVscyk7XG4gICAgfVxuICAgIHJldHVybiBuZXcgR2VzdGFsdChtZXRhTGV2ZWxzKTtcbn07XG5cbkdlc3RhbHQucHJvdG90eXBlLnVuaW9uMSA9IGZ1bmN0aW9uIChvdGhlcikge1xuICAgIHJldHVybiB0aGlzLm1hcFppcChvdGhlciwgTWF0aC5tYXgsIHN0cmFpZ2h0R2VzdGFsdExldmVsT3AodW5pb24pKTtcbn07XG5cbmZ1bmN0aW9uIGdlc3RhbHRVbmlvbihncykge1xuICAgIGlmIChncy5sZW5ndGggPT09IDApIHJldHVybiBlbXB0eUdlc3RhbHQ7XG4gICAgdmFyIGFjYyA9IGdzWzBdO1xuICAgIGZvciAodmFyIGkgPSAxOyBpIDwgZ3MubGVuZ3RoOyBpKyspIHtcblx0YWNjID0gYWNjLnVuaW9uMShnc1tpXSk7XG4gICAgfVxuICAgIHJldHVybiBhY2M7XG59XG5cbkdlc3RhbHQucHJvdG90eXBlLnVuaW9uID0gZnVuY3Rpb24gKCkge1xuICAgIHJldHVybiBhcmd1bWVudHMubGVuZ3RoID4gMCA/IHRoaXMudW5pb24xKGdlc3RhbHRVbmlvbihhcmd1bWVudHMpKSA6IHRoaXM7XG59O1xuXG4vLyBBY2N1bXVsYXRlcyBtYXRjaGVycyBmcm9tIGhpZ2hlci1udW1iZXJlZCBsZXZlbHMgaW50b1xuLy8gbG93ZXItbnVtYmVyZWQgbGV2ZWxzLlxuZnVuY3Rpb24gdGVsZXNjb3BlTGV2ZWxzKGxldmVscykge1xuICAgIHZhciByZXN1bHQgPSBzaGFsbG93Q29weUFycmF5KGxldmVscyk7XG4gICAgZm9yICh2YXIgaSA9IHJlc3VsdC5sZW5ndGggLSAyOyBpID49IDA7IGktLSkge1xuXHRyZXN1bHRbaV0gPVxuXHQgICAgbmV3IEdlc3RhbHRMZXZlbCh1bmlvbihyZXN1bHRbaV0uc3Vic2NyaXB0aW9ucywgcmVzdWx0W2krMV0uc3Vic2NyaXB0aW9ucyksXG5cdFx0XHQgICAgIHVuaW9uKHJlc3VsdFtpXS5hZHZlcnRpc2VtZW50cywgcmVzdWx0W2krMV0uYWR2ZXJ0aXNlbWVudHMpKTtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbn07XG5cbkdlc3RhbHQucHJvdG90eXBlLnRlbGVzY29wZWQgPSBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIG1scyA9IFtdO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5tZXRhTGV2ZWxzLmxlbmd0aDsgaSsrKSB7XG5cdG1scy5wdXNoKHRlbGVzY29wZUxldmVscyh0aGlzLm1ldGFMZXZlbHNbaV0pKTtcbiAgICB9XG4gICAgcmV0dXJuIG5ldyBHZXN0YWx0KG1scyk7XG59O1xuXG5HZXN0YWx0LnByb3RvdHlwZS5maWx0ZXIgPSBmdW5jdGlvbiAocGVyc3BlY3RpdmUpIHtcbiAgICB2YXIgbWV0YUxldmVscyA9IFtdO1xuICAgIHZhciBtbHMxID0gdGhpcy5tZXRhTGV2ZWxzO1xuICAgIHZhciBtbHMyID0gcGVyc3BlY3RpdmUubWV0YUxldmVscztcbiAgICB2YXIgbm0gPSBNYXRoLm1pbihtbHMxLmxlbmd0aCwgbWxzMi5sZW5ndGgpO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbm07IGkrKykge1xuXHR2YXIgbGV2ZWxzID0gW107XG5cdHZhciBsczEgPSBtbHMxW2ldIHx8IGVtcHR5TWV0YUxldmVsO1xuXHR2YXIgbHMyID0gbWxzMltpXSB8fCBlbXB0eU1ldGFMZXZlbDtcblx0dmFyIG5sID0gTWF0aC5taW4obHMxLmxlbmd0aCwgbHMyLmxlbmd0aCAtIDEpO1xuXHRmb3IgKHZhciBqID0gMDsgaiA8IG5sOyBqKyspIHtcblx0ICAgIHZhciBwMSA9IGxzMVtqXSB8fCBlbXB0eUxldmVsO1xuXHQgICAgdmFyIHN1YnMgPSBlbXB0eU1hdGNoZXI7XG5cdCAgICB2YXIgYWR2cyA9IGVtcHR5TWF0Y2hlcjtcblx0ICAgIGZvciAodmFyIGsgPSBqICsgMTsgayA8IGxzMi5sZW5ndGg7IGsrKykge1xuXHRcdHZhciBwMiA9IGxzMltrXSB8fCBlbXB0eUxldmVsO1xuXHRcdHN1YnMgPSB1bmlvbihzdWJzLCBpbnRlcnNlY3QocDEuc3Vic2NyaXB0aW9ucywgcDIuYWR2ZXJ0aXNlbWVudHMpKTtcblx0XHRhZHZzID0gdW5pb24oYWR2cywgaW50ZXJzZWN0KHAxLmFkdmVydGlzZW1lbnRzLCBwMi5zdWJzY3JpcHRpb25zKSk7XG5cdCAgICB9XG5cdCAgICBtYXliZVB1c2hMZXZlbChsZXZlbHMsIGosIG5ldyBHZXN0YWx0TGV2ZWwoc3VicywgYWR2cykpO1xuXHR9XG5cdG1heWJlUHVzaE1ldGFMZXZlbChtZXRhTGV2ZWxzLCBpLCBsZXZlbHMpO1xuICAgIH1cbiAgICByZXR1cm4gbmV3IEdlc3RhbHQobWV0YUxldmVscyk7XG59O1xuXG5HZXN0YWx0LnByb3RvdHlwZS5tYXRjaCA9IGZ1bmN0aW9uIChwZXJzcGVjdGl2ZSkge1xuICAgIHZhciBwaWRzID0ge307XG4gICAgdmFyIG5tID0gTWF0aC5taW4odGhpcy5tZXRhTGV2ZWxzLmxlbmd0aCwgcGVyc3BlY3RpdmUubWV0YUxldmVscy5sZW5ndGgpO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbm07IGkrKykge1xuXHR2YXIgbHMxID0gdGhpcy5tZXRhTGV2ZWxzW2ldIHx8IGVtcHR5TWV0YUxldmVsO1xuXHR2YXIgbHMyID0gcGVyc3BlY3RpdmUubWV0YUxldmVsc1tpXSB8fCBlbXB0eU1ldGFMZXZlbDtcblx0dmFyIG5sID0gTWF0aC5taW4obHMxLmxlbmd0aCwgbHMyLmxlbmd0aCAtIDEpO1xuXHRmb3IgKHZhciBqID0gMDsgaiA8IG5sOyBqKyspIHtcblx0ICAgIHZhciBwMSA9IGxzMVtqXSB8fCBlbXB0eUxldmVsO1xuXHQgICAgZm9yICh2YXIgayA9IGogKyAxOyBrIDwgbHMyLmxlbmd0aDsgaysrKSB7XG5cdFx0dmFyIHAyID0gbHMyW2tdIHx8IGVtcHR5TGV2ZWw7XG5cdFx0bWF0Y2hNYXRjaGVyKHAxLnN1YnNjcmlwdGlvbnMsIHAyLmFkdmVydGlzZW1lbnRzLCBwaWRzKTtcblx0XHRtYXRjaE1hdGNoZXIocDEuYWR2ZXJ0aXNlbWVudHMsIHAyLnN1YnNjcmlwdGlvbnMsIHBpZHMpO1xuXHQgICAgfVxuXHR9XG4gICAgfVxuICAgIHJldHVybiBzZXRUb0FycmF5KHBpZHMpO1xufTtcblxuR2VzdGFsdC5wcm90b3R5cGUuZXJhc2VQYXRoID0gZnVuY3Rpb24gKHBhdGgpIHtcbiAgICByZXR1cm4gdGhpcy5tYXBaaXAocGF0aCwgTWF0aC5tYXgsIHN0cmFpZ2h0R2VzdGFsdExldmVsT3AoZXJhc2VQYXRoKSk7XG59O1xuXG5mdW5jdGlvbiBtYXBMZXZlbHMoaW5wdXRNZXRhTGV2ZWxzLCBmLCBlbXB0eUNoZWNrLCBpbnB1dEVtcHR5TGV2ZWwsIG91dHB1dEVtcHR5TGV2ZWwpIHtcbiAgICB2YXIgb3V0cHV0TWV0YUxldmVscyA9IFtdO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgaW5wdXRNZXRhTGV2ZWxzLmxlbmd0aDsgaSsrKSB7XG5cdHZhciBscyA9IGlucHV0TWV0YUxldmVsc1tpXTtcblx0dmFyIGxldmVscyA9IFtdO1xuXHRmb3IgKHZhciBqID0gMDsgaiA8IGxzLmxlbmd0aDsgaisrKSB7XG5cdCAgICB2YXIgcCA9IGYobHNbal0gfHwgaW5wdXRFbXB0eUxldmVsLCBpLCBqKTtcblx0ICAgIGlmICghZW1wdHlDaGVjayhwLCBpLCBqKSkge1xuXHRcdHdoaWxlIChsZXZlbHMubGVuZ3RoIDwgaikgbGV2ZWxzLnB1c2gob3V0cHV0RW1wdHlMZXZlbCk7XG5cdFx0bGV2ZWxzLnB1c2gocCk7XG5cdCAgICB9XG5cdH1cblx0aWYgKGxldmVscy5sZW5ndGggPiAwKSB7XG5cdCAgICB3aGlsZSAob3V0cHV0TWV0YUxldmVscy5sZW5ndGggPCBpKSBvdXRwdXRNZXRhTGV2ZWxzLnB1c2goZW1wdHlNZXRhTGV2ZWwpO1xuXHQgICAgb3V0cHV0TWV0YUxldmVscy5wdXNoKGxldmVscyk7XG5cdH1cbiAgICB9XG4gICAgcmV0dXJuIG91dHB1dE1ldGFMZXZlbHM7XG59O1xuXG5HZXN0YWx0LnByb3RvdHlwZS50cmFuc2Zvcm0gPSBmdW5jdGlvbiAoZikge1xuICAgIHJldHVybiBuZXcgR2VzdGFsdChtYXBMZXZlbHModGhpcy5tZXRhTGV2ZWxzLCBmdW5jdGlvbiAocCwgbWwsIGwpIHtcblx0cmV0dXJuIG5ldyBHZXN0YWx0TGV2ZWwoZihwLnN1YnNjcmlwdGlvbnMsIG1sLCBsLCBmYWxzZSksXG5cdFx0XHRcdGYocC5hZHZlcnRpc2VtZW50cywgbWwsIGwsIHRydWUpKTtcbiAgICB9LCBmdW5jdGlvbiAocCkge1xuXHRyZXR1cm4gcC5pc0VtcHR5KCk7XG4gICAgfSwgZW1wdHlMZXZlbCwgZW1wdHlMZXZlbCkpO1xufTtcblxuR2VzdGFsdC5wcm90b3R5cGUuc3RyaXBMYWJlbCA9IGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4gdGhpcy50cmFuc2Zvcm0oZnVuY3Rpb24gKG0pIHsgcmV0dXJuIHJlbGFiZWwobSwgZnVuY3Rpb24gKHYpIHsgcmV0dXJuIHRydWU7IH0pOyB9KTtcbn07XG5cbkdlc3RhbHQucHJvdG90eXBlLmxhYmVsID0gZnVuY3Rpb24gKHBpZCkge1xuICAgIHZhciBwaWRzID0gYXJyYXlUb1NldChbcGlkXSk7XG4gICAgcmV0dXJuIHRoaXMudHJhbnNmb3JtKGZ1bmN0aW9uIChtKSB7IHJldHVybiByZWxhYmVsKG0sIGZ1bmN0aW9uICh2KSB7IHJldHVybiBwaWRzOyB9KTsgfSk7XG59O1xuXG5HZXN0YWx0LnByb3RvdHlwZS5wcmV0dHkgPSBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIGFjYyA9IFtdO1xuICAgIGlmICh0aGlzLmlzRW1wdHkoKSkge1xuXHRhY2MucHVzaChcIkVNUFRZIEdFU1RBTFRcXG5cIik7XG4gICAgfSBlbHNlIHtcblx0Zm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLm1ldGFMZXZlbHMubGVuZ3RoOyBpKyspIHtcblx0ICAgIHZhciBscyA9IHRoaXMubWV0YUxldmVsc1tpXTtcblx0ICAgIGZvciAodmFyIGogPSAwOyBqIDwgbHMubGVuZ3RoOyBqKyspIHtcblx0XHR2YXIgcCA9IGxzW2pdO1xuXHRcdGlmICghcC5pc0VtcHR5KCkpIHtcblx0XHQgICAgYWNjLnB1c2goXCJHRVNUQUxUIG1ldGFsZXZlbCBcIiArIGkgKyBcIiBsZXZlbCBcIiArIGogKyBcIjpcXG5cIik7XG5cdFx0ICAgIGFjYy5wdXNoKHAucHJldHR5KCkpO1xuXHRcdH1cblx0ICAgIH1cblx0fVxuICAgIH1cbiAgICByZXR1cm4gYWNjLmpvaW4oJycpO1xufTtcblxuR2VzdGFsdC5wcm90b3R5cGUuc2VyaWFsaXplID0gZnVuY3Rpb24gKHNlcmlhbGl6ZVN1Y2Nlc3MpIHtcbiAgICBpZiAodHlwZW9mIHNlcmlhbGl6ZVN1Y2Nlc3MgPT09ICd1bmRlZmluZWQnKSB7XG5cdHNlcmlhbGl6ZVN1Y2Nlc3MgPSBmdW5jdGlvbiAodikgeyByZXR1cm4gdiA9PT0gdHJ1ZSA/IHRydWUgOiBzZXRUb0FycmF5KHYpOyB9O1xuICAgIH1cbiAgICByZXR1cm4gW1wiZ2VzdGFsdFwiLCBtYXBMZXZlbHModGhpcy5tZXRhTGV2ZWxzLCBmdW5jdGlvbiAocCkge1xuXHRyZXR1cm4gW3NlcmlhbGl6ZU1hdGNoZXIocC5zdWJzY3JpcHRpb25zLCBzZXJpYWxpemVTdWNjZXNzKSxcblx0XHRzZXJpYWxpemVNYXRjaGVyKHAuYWR2ZXJ0aXNlbWVudHMsIHNlcmlhbGl6ZVN1Y2Nlc3MpXTtcbiAgICB9LCBmdW5jdGlvbiAocHIpIHtcblx0cmV0dXJuIHByLmxlbmd0aCA9PT0gMiAmJiBwclswXS5sZW5ndGggPT09IDAgJiYgcHJbMV0ubGVuZ3RoID09PSAwO1xuICAgIH0sIGVtcHR5TGV2ZWwsIFtbXSxbXV0pXTtcbn07XG5cbmZ1bmN0aW9uIGRlc2VyaWFsaXplR2VzdGFsdChyLCBkZXNlcmlhbGl6ZVN1Y2Nlc3MpIHtcbiAgICBpZiAodHlwZW9mIGRlc2VyaWFsaXplU3VjY2VzcyA9PT0gJ3VuZGVmaW5lZCcpIHtcblx0ZGVzZXJpYWxpemVTdWNjZXNzID0gZnVuY3Rpb24gKHYpIHsgcmV0dXJuIHYgPT09IHRydWUgPyB0cnVlIDogYXJyYXlUb1NldCh2KTsgfTtcbiAgICB9XG4gICAgaWYgKHJbMF0gIT09IFwiZ2VzdGFsdFwiKSBkaWUoXCJJbnZhbGlkIGdlc3RhbHQgc2VyaWFsaXphdGlvbjogXCIgKyByKTtcbiAgICByZXR1cm4gbmV3IEdlc3RhbHQobWFwTGV2ZWxzKHJbMV0sIGZ1bmN0aW9uIChwcikge1xuXHRyZXR1cm4gbmV3IEdlc3RhbHRMZXZlbChkZXNlcmlhbGl6ZU1hdGNoZXIocHJbMF0sIGRlc2VyaWFsaXplU3VjY2VzcyksXG5cdFx0XHRcdGRlc2VyaWFsaXplTWF0Y2hlcihwclsxXSwgZGVzZXJpYWxpemVTdWNjZXNzKSk7XG4gICAgfSwgZnVuY3Rpb24gKHApIHtcblx0cmV0dXJuIHAuaXNFbXB0eSgpO1xuICAgIH0sIFtbXSxbXV0sIGVtcHR5TGV2ZWwpKTtcbn1cblxuLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXG5cbm1vZHVsZS5leHBvcnRzLl9fID0gX187XG5tb2R1bGUuZXhwb3J0cy5hcnJheVRvU2V0ID0gYXJyYXlUb1NldDtcbm1vZHVsZS5leHBvcnRzLnNldFRvQXJyYXkgPSBzZXRUb0FycmF5O1xubW9kdWxlLmV4cG9ydHMuc2V0VW5pb24gPSBzZXRVbmlvbjtcbm1vZHVsZS5leHBvcnRzLnNldFN1YnRyYWN0ID0gc2V0U3VidHJhY3Q7XG5tb2R1bGUuZXhwb3J0cy5zZXRJbnRlcnNlY3QgPSBzZXRJbnRlcnNlY3Q7XG5tb2R1bGUuZXhwb3J0cy5zZXRFcXVhbCA9IHNldEVxdWFsO1xubW9kdWxlLmV4cG9ydHMuaXNfZW1wdHlTZXQgPSBpc19lbXB0eVNldDtcbm1vZHVsZS5leHBvcnRzLiRDYXB0dXJlID0gJENhcHR1cmU7XG5tb2R1bGUuZXhwb3J0cy5fJCA9IF8kO1xubW9kdWxlLmV4cG9ydHMuaXNfZW1wdHlNYXRjaGVyID0gaXNfZW1wdHlNYXRjaGVyO1xubW9kdWxlLmV4cG9ydHMuZW1wdHlNYXRjaGVyID0gZW1wdHlNYXRjaGVyO1xubW9kdWxlLmV4cG9ydHMuZW1iZWRkZWRNYXRjaGVyID0gZW1iZWRkZWRNYXRjaGVyO1xubW9kdWxlLmV4cG9ydHMuY29tcGlsZVBhdHRlcm4gPSBjb21waWxlUGF0dGVybjtcbm1vZHVsZS5leHBvcnRzLnVuaW9uID0gdW5pb25OO1xubW9kdWxlLmV4cG9ydHMuaW50ZXJzZWN0ID0gaW50ZXJzZWN0O1xubW9kdWxlLmV4cG9ydHMuZXJhc2VQYXRoID0gZXJhc2VQYXRoO1xubW9kdWxlLmV4cG9ydHMubWF0Y2hWYWx1ZSA9IG1hdGNoVmFsdWU7XG5tb2R1bGUuZXhwb3J0cy5tYXRjaE1hdGNoZXIgPSBtYXRjaE1hdGNoZXI7XG5tb2R1bGUuZXhwb3J0cy5hcHBlbmRNYXRjaGVyID0gYXBwZW5kTWF0Y2hlcjtcbm1vZHVsZS5leHBvcnRzLnJlbGFiZWwgPSByZWxhYmVsO1xubW9kdWxlLmV4cG9ydHMuY29tcGlsZVByb2plY3Rpb24gPSBjb21waWxlUHJvamVjdGlvbjtcbm1vZHVsZS5leHBvcnRzLnByb2plY3Rpb25Ub1BhdHRlcm4gPSBwcm9qZWN0aW9uVG9QYXR0ZXJuO1xubW9kdWxlLmV4cG9ydHMucHJvamVjdCA9IHByb2plY3Q7XG5tb2R1bGUuZXhwb3J0cy5tYXRjaGVyS2V5cyA9IG1hdGNoZXJLZXlzO1xubW9kdWxlLmV4cG9ydHMubWF0Y2hlckVxdWFscyA9IG1hdGNoZXJFcXVhbHM7XG5tb2R1bGUuZXhwb3J0cy5wcmV0dHlNYXRjaGVyID0gcHJldHR5TWF0Y2hlcjtcbm1vZHVsZS5leHBvcnRzLnNlcmlhbGl6ZU1hdGNoZXIgPSBzZXJpYWxpemVNYXRjaGVyO1xubW9kdWxlLmV4cG9ydHMuZGVzZXJpYWxpemVNYXRjaGVyID0gZGVzZXJpYWxpemVNYXRjaGVyO1xuXG5tb2R1bGUuZXhwb3J0cy5HZXN0YWx0TGV2ZWwgPSBHZXN0YWx0TGV2ZWw7XG5tb2R1bGUuZXhwb3J0cy5HZXN0YWx0ID0gR2VzdGFsdDtcbm1vZHVsZS5leHBvcnRzLnNpbXBsZUdlc3RhbHQgPSBzaW1wbGVHZXN0YWx0O1xubW9kdWxlLmV4cG9ydHMuZW1wdHlHZXN0YWx0ID0gZW1wdHlHZXN0YWx0O1xubW9kdWxlLmV4cG9ydHMuZnVsbEdlc3RhbHQgPSBmdWxsR2VzdGFsdDtcbm1vZHVsZS5leHBvcnRzLmdlc3RhbHRVbmlvbiA9IGdlc3RhbHRVbmlvbjtcbm1vZHVsZS5leHBvcnRzLmRlc2VyaWFsaXplR2VzdGFsdCA9IGRlc2VyaWFsaXplR2VzdGFsdDtcbiIsInZhciBNaW5pbWFydCA9IHJlcXVpcmUoXCIuL21pbmltYXJ0LmpzXCIpO1xudmFyIFJvdXRlID0gTWluaW1hcnQuUm91dGU7XG52YXIgV29ybGQgPSBNaW5pbWFydC5Xb3JsZDtcbnZhciBzdWIgPSBNaW5pbWFydC5zdWI7XG52YXIgcHViID0gTWluaW1hcnQucHViO1xudmFyIF9fID0gTWluaW1hcnQuX187XG52YXIgXyQgPSBNaW5pbWFydC5fJDtcblxuZnVuY3Rpb24gc3Bhd25Sb3V0aW5nVGFibGVXaWRnZXQoc2VsZWN0b3IsIGZyYWdtZW50Q2xhc3MsIG9ic2VydmF0aW9uTGV2ZWwpIHtcbiAgICBvYnNlcnZhdGlvbkxldmVsID0gb2JzZXJ2YXRpb25MZXZlbCB8fCAxMDtcbiAgICAvLyBeIGFyYml0cmFyeTogc2hvdWxkIGJlIEluZmluaXR5LCB3aGVuIHJvdXRlLmpzIHN1cHBvcnRzIGl0LiBUT0RPXG5cbiAgICBXb3JsZC5zcGF3bih7XG5cdGJvb3Q6IGZ1bmN0aW9uICgpIHsgdGhpcy51cGRhdGVTdGF0ZSgpOyB9LFxuXG5cdHN0YXRlOiBSb3V0ZS5lbXB0eUdlc3RhbHQuc2VyaWFsaXplKCksXG5cdG5leHRTdGF0ZTogUm91dGUuZW1wdHlHZXN0YWx0LnNlcmlhbGl6ZSgpLFxuXHR0aW1lcjogZmFsc2UsXG5cblx0bG9jYWxHZXN0YWx0OiAoc3ViKCAgICAgICBbXCJET01cIiwgc2VsZWN0b3IsIGZyYWdtZW50Q2xhc3MsIF9fXSwgMCwgMilcblx0XHQgICAgICAgLnVuaW9uKHB1YihbXCJET01cIiwgc2VsZWN0b3IsIGZyYWdtZW50Q2xhc3MsIF9fXSwgMCwgMikpXG5cdFx0ICAgICAgIC50ZWxlc2NvcGVkKCkpLFxuXG5cdGRpZ2VzdEdlc3RhbHQ6IGZ1bmN0aW9uIChnKSB7XG5cdCAgICByZXR1cm4gZy5zdHJpcExhYmVsKCkuZXJhc2VQYXRoKHRoaXMubG9jYWxHZXN0YWx0KS5zZXJpYWxpemUoKTtcblx0fSxcblxuXHR1cGRhdGVTdGF0ZTogZnVuY3Rpb24gKCkge1xuXHQgICAgdmFyIGVsdHMgPSBbXCJwcmVcIiwgUm91dGUuZGVzZXJpYWxpemVHZXN0YWx0KHRoaXMuc3RhdGUpLnByZXR0eSgpXTtcblx0ICAgIFdvcmxkLnVwZGF0ZVJvdXRlcyhbc3ViKF9fLCAwLCBvYnNlcnZhdGlvbkxldmVsKSxcblx0XHRcdFx0cHViKF9fLCAwLCBvYnNlcnZhdGlvbkxldmVsKSxcblx0XHRcdFx0cHViKFtcIkRPTVwiLCBzZWxlY3RvciwgZnJhZ21lbnRDbGFzcywgZWx0c10pXSk7XG5cdH0sXG5cblx0aGFuZGxlRXZlbnQ6IGZ1bmN0aW9uIChlKSB7XG5cdCAgICB2YXIgc2VsZiA9IHRoaXM7XG5cdCAgICBpZiAoZS50eXBlID09PSBcInJvdXRlc1wiKSB7XG5cdFx0c2VsZi5uZXh0U3RhdGUgPSBzZWxmLmRpZ2VzdEdlc3RhbHQoZS5nZXN0YWx0KTtcblx0XHRpZiAoc2VsZi50aW1lcikge1xuXHRcdCAgICBjbGVhclRpbWVvdXQoc2VsZi50aW1lcik7XG5cdFx0ICAgIHNlbGYudGltZXIgPSBmYWxzZTtcblx0XHR9XG5cdFx0c2VsZi50aW1lciA9IHNldFRpbWVvdXQoV29ybGQud3JhcChmdW5jdGlvbiAoKSB7XG5cdFx0ICAgIGlmIChKU09OLnN0cmluZ2lmeShzZWxmLm5leHRTdGF0ZSkgIT09IEpTT04uc3RyaW5naWZ5KHNlbGYuc3RhdGUpKSB7XG5cdFx0XHRzZWxmLnN0YXRlID0gc2VsZi5uZXh0U3RhdGU7XG5cdFx0XHRzZWxmLnVwZGF0ZVN0YXRlKCk7XG5cdFx0ICAgIH1cblx0XHQgICAgc2VsZi50aW1lciA9IGZhbHNlO1xuXHRcdH0pLCA1MCk7XG5cdCAgICB9XG5cdH1cbiAgICB9KTtcblxufVxuXG5tb2R1bGUuZXhwb3J0cy5zcGF3blJvdXRpbmdUYWJsZVdpZGdldCA9IHNwYXduUm91dGluZ1RhYmxlV2lkZ2V0O1xuIiwiLy8gR2VuZXJpYyBTcHlcbnZhciBNaW5pbWFydCA9IHJlcXVpcmUoXCIuL21pbmltYXJ0LmpzXCIpO1xudmFyIFdvcmxkID0gTWluaW1hcnQuV29ybGQ7XG52YXIgc3ViID0gTWluaW1hcnQuc3ViO1xudmFyIHB1YiA9IE1pbmltYXJ0LnB1YjtcbnZhciBfXyA9IE1pbmltYXJ0Ll9fO1xudmFyIF8kID0gTWluaW1hcnQuXyQ7XG5cbmZ1bmN0aW9uIFNweShsYWJlbCwgdXNlSnNvbiwgb2JzZXJ2YXRpb25MZXZlbCkge1xuICAgIHRoaXMubGFiZWwgPSBsYWJlbCB8fCBcIlNQWVwiO1xuICAgIHRoaXMub2JzZXJ2YXRpb25MZXZlbCA9IG9ic2VydmF0aW9uTGV2ZWwgfHwgMTA7IC8vIGFyYml0cmFyeS4gU2hvdWxkIGJlIEluZmluaXR5LiBUT0RPXG4gICAgdGhpcy51c2VKc29uID0gdXNlSnNvbjtcbn1cblxuU3B5LnByb3RvdHlwZS5ib290ID0gZnVuY3Rpb24gKCkge1xuICAgIFdvcmxkLnVwZGF0ZVJvdXRlcyhbc3ViKF9fLCAwLCB0aGlzLm9ic2VydmF0aW9uTGV2ZWwpLCBwdWIoX18sIDAsIHRoaXMub2JzZXJ2YXRpb25MZXZlbCldKTtcbn07XG5cblNweS5wcm90b3R5cGUuaGFuZGxlRXZlbnQgPSBmdW5jdGlvbiAoZSkge1xuICAgIHN3aXRjaCAoZS50eXBlKSB7XG4gICAgY2FzZSBcInJvdXRlc1wiOlxuXHRjb25zb2xlLmxvZyh0aGlzLmxhYmVsLCBcInJvdXRlc1wiLCBlLmdlc3RhbHQucHJldHR5KCkpO1xuXHRicmVhaztcbiAgICBjYXNlIFwibWVzc2FnZVwiOlxuXHR2YXIgbWVzc2FnZVJlcHI7XG5cdHRyeSB7XG5cdCAgICBtZXNzYWdlUmVwciA9IHRoaXMudXNlSnNvbiA/IEpTT04uc3RyaW5naWZ5KGUubWVzc2FnZSkgOiBlLm1lc3NhZ2U7XG5cdH0gY2F0Y2ggKGV4bikge1xuXHQgICAgbWVzc2FnZVJlcHIgPSBlLm1lc3NhZ2U7XG5cdH1cblx0Y29uc29sZS5sb2codGhpcy5sYWJlbCwgXCJtZXNzYWdlXCIsIG1lc3NhZ2VSZXByLCBlLm1ldGFMZXZlbCwgZS5pc0ZlZWRiYWNrKTtcblx0YnJlYWs7XG4gICAgZGVmYXVsdDpcblx0Y29uc29sZS5sb2codGhpcy5sYWJlbCwgXCJ1bmtub3duXCIsIGUpO1xuXHRicmVhaztcbiAgICB9XG59O1xuXG5tb2R1bGUuZXhwb3J0cy5TcHkgPSBTcHk7XG4iLCIvLyBXYWtlIGRldGVjdG9yIC0gbm90aWNlcyB3aGVuIHNvbWV0aGluZyAoc3VjaCBhc1xuLy8gc3VzcGVuc2lvbi9zbGVlcGluZyEpIGhhcyBjYXVzZWQgcGVyaW9kaWMgYWN0aXZpdGllcyB0byBiZVxuLy8gaW50ZXJydXB0ZWQsIGFuZCB3YXJucyBvdGhlcnMgYWJvdXQgaXRcbi8vIEluc3BpcmVkIGJ5IGh0dHA6Ly9ibG9nLmFsZXhtYWNjYXcuY29tL2phdmFzY3JpcHQtd2FrZS1ldmVudFxudmFyIE1pbmltYXJ0ID0gcmVxdWlyZShcIi4vbWluaW1hcnQuanNcIik7XG52YXIgV29ybGQgPSBNaW5pbWFydC5Xb3JsZDtcbnZhciBzdWIgPSBNaW5pbWFydC5zdWI7XG52YXIgcHViID0gTWluaW1hcnQucHViO1xudmFyIF9fID0gTWluaW1hcnQuX187XG52YXIgXyQgPSBNaW5pbWFydC5fJDtcblxuZnVuY3Rpb24gV2FrZURldGVjdG9yKHBlcmlvZCkge1xuICAgIHRoaXMubWVzc2FnZSA9IFwid2FrZVwiO1xuICAgIHRoaXMucGVyaW9kID0gcGVyaW9kIHx8IDEwMDAwO1xuICAgIHRoaXMubW9zdFJlY2VudFRyaWdnZXIgPSArKG5ldyBEYXRlKCkpO1xuICAgIHRoaXMudGltZXJJZCA9IG51bGw7XG59XG5cbldha2VEZXRlY3Rvci5wcm90b3R5cGUuYm9vdCA9IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgV29ybGQudXBkYXRlUm91dGVzKFtwdWIodGhpcy5tZXNzYWdlKV0pO1xuICAgIHRoaXMudGltZXJJZCA9IHNldEludGVydmFsKFdvcmxkLndyYXAoZnVuY3Rpb24gKCkgeyBzZWxmLnRyaWdnZXIoKTsgfSksIHRoaXMucGVyaW9kKTtcbn07XG5cbldha2VEZXRlY3Rvci5wcm90b3R5cGUuaGFuZGxlRXZlbnQgPSBmdW5jdGlvbiAoZSkge307XG5cbldha2VEZXRlY3Rvci5wcm90b3R5cGUudHJpZ2dlciA9IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgbm93ID0gKyhuZXcgRGF0ZSgpKTtcbiAgICBpZiAobm93IC0gdGhpcy5tb3N0UmVjZW50VHJpZ2dlciA+IHRoaXMucGVyaW9kICogMS41KSB7XG5cdFdvcmxkLnNlbmQodGhpcy5tZXNzYWdlKTtcbiAgICB9XG4gICAgdGhpcy5tb3N0UmVjZW50VHJpZ2dlciA9IG5vdztcbn07XG5cbm1vZHVsZS5leHBvcnRzLldha2VEZXRlY3RvciA9IFdha2VEZXRlY3RvcjtcbiIsInZhciBNaW5pbWFydCA9IHJlcXVpcmUoXCIuL21pbmltYXJ0LmpzXCIpO1xudmFyIFJvdXRlID0gTWluaW1hcnQuUm91dGU7XG52YXIgV29ybGQgPSBNaW5pbWFydC5Xb3JsZDtcbnZhciBzdWIgPSBNaW5pbWFydC5zdWI7XG52YXIgcHViID0gTWluaW1hcnQucHViO1xudmFyIF9fID0gTWluaW1hcnQuX187XG52YXIgXyQgPSBNaW5pbWFydC5fJDtcblxuLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXG4vLyBXZWJTb2NrZXQgY2xpZW50IGRyaXZlclxuXG52YXIgREVGQVVMVF9SRUNPTk5FQ1RfREVMQVkgPSAxMDA7XG52YXIgTUFYX1JFQ09OTkVDVF9ERUxBWSA9IDMwMDAwO1xudmFyIERFRkFVTFRfSURMRV9USU1FT1VUID0gMzAwMDAwOyAvLyA1IG1pbnV0ZXNcbnZhciBERUZBVUxUX1BJTkdfSU5URVJWQUwgPSBERUZBVUxUX0lETEVfVElNRU9VVCAtIDEwMDAwO1xuXG5mdW5jdGlvbiBXZWJTb2NrZXRDb25uZWN0aW9uKGxhYmVsLCB3c3VybCwgc2hvdWxkUmVjb25uZWN0KSB7XG4gICAgdGhpcy5sYWJlbCA9IGxhYmVsO1xuICAgIHRoaXMuc2VuZHNBdHRlbXB0ZWQgPSAwO1xuICAgIHRoaXMuc2VuZHNUcmFuc21pdHRlZCA9IDA7XG4gICAgdGhpcy5yZWNlaXZlQ291bnQgPSAwO1xuICAgIHRoaXMuc29jayA9IG51bGw7XG4gICAgdGhpcy53c3VybCA9IHdzdXJsO1xuICAgIHRoaXMuc2hvdWxkUmVjb25uZWN0ID0gc2hvdWxkUmVjb25uZWN0ID8gdHJ1ZSA6IGZhbHNlO1xuICAgIHRoaXMucmVjb25uZWN0RGVsYXkgPSBERUZBVUxUX1JFQ09OTkVDVF9ERUxBWTtcbiAgICB0aGlzLmxvY2FsR2VzdGFsdCA9IFJvdXRlLmVtcHR5R2VzdGFsdDtcbiAgICB0aGlzLnBlZXJHZXN0YWx0ID0gUm91dGUuZW1wdHlHZXN0YWx0O1xuICAgIHRoaXMucHJldkxvY2FsUm91dGVzTWVzc2FnZSA9IG51bGw7XG4gICAgdGhpcy5wcmV2UGVlclJvdXRlc01lc3NhZ2UgPSBudWxsO1xuICAgIHRoaXMuZGVkdXBsaWNhdG9yID0gbmV3IE1pbmltYXJ0LkRlZHVwbGljYXRvcigpO1xuICAgIHRoaXMuY29ubmVjdGlvbkNvdW50ID0gMDtcblxuICAgIHRoaXMuYWN0aXZpdHlUaW1lc3RhbXAgPSAwO1xuICAgIHRoaXMuaWRsZVRpbWVvdXQgPSBERUZBVUxUX0lETEVfVElNRU9VVDtcbiAgICB0aGlzLnBpbmdJbnRlcnZhbCA9IERFRkFVTFRfUElOR19JTlRFUlZBTDtcbiAgICB0aGlzLmlkbGVUaW1lciA9IG51bGw7XG4gICAgdGhpcy5waW5nVGltZXIgPSBudWxsO1xufVxuXG5XZWJTb2NrZXRDb25uZWN0aW9uLnByb3RvdHlwZS5jbGVhckhlYXJ0YmVhdFRpbWVycyA9IGZ1bmN0aW9uICgpIHtcbiAgICBpZiAodGhpcy5pZGxlVGltZXIpIHsgY2xlYXJUaW1lb3V0KHRoaXMuaWRsZVRpbWVyKTsgdGhpcy5pZGxlVGltZXIgPSBudWxsOyB9XG4gICAgaWYgKHRoaXMucGluZ1RpbWVyKSB7IGNsZWFyVGltZW91dCh0aGlzLnBpbmdUaW1lcik7IHRoaXMucGluZ1RpbWVyID0gbnVsbDsgfVxufTtcblxuV2ViU29ja2V0Q29ubmVjdGlvbi5wcm90b3R5cGUucmVjb3JkQWN0aXZpdHkgPSBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIHRoaXMuYWN0aXZpdHlUaW1lc3RhbXAgPSArKG5ldyBEYXRlKCkpO1xuICAgIHRoaXMuY2xlYXJIZWFydGJlYXRUaW1lcnMoKTtcbiAgICB0aGlzLmlkbGVUaW1lciA9IHNldFRpbWVvdXQoZnVuY3Rpb24gKCkgeyBzZWxmLmZvcmNlY2xvc2UoKTsgfSxcblx0XHRcdFx0dGhpcy5pZGxlVGltZW91dCk7XG4gICAgdGhpcy5waW5nVGltZXIgPSBzZXRUaW1lb3V0KGZ1bmN0aW9uICgpIHsgc2VsZi5zYWZlU2VuZChKU09OLnN0cmluZ2lmeShcInBpbmdcIikpIH0sXG5cdFx0XHRcdHRoaXMucGluZ0ludGVydmFsKTtcbn07XG5cbldlYlNvY2tldENvbm5lY3Rpb24ucHJvdG90eXBlLnN0YXR1c1JvdXRlID0gZnVuY3Rpb24gKHN0YXR1cykge1xuICAgIHJldHVybiBwdWIoW3RoaXMubGFiZWwgKyBcIl9zdGF0ZVwiLCBzdGF0dXNdKTtcbn07XG5cbldlYlNvY2tldENvbm5lY3Rpb24ucHJvdG90eXBlLnJlbGF5R2VzdGFsdCA9IGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4gdGhpcy5zdGF0dXNSb3V0ZSh0aGlzLmlzQ29ubmVjdGVkKCkgPyBcImNvbm5lY3RlZFwiIDogXCJkaXNjb25uZWN0ZWRcIilcblx0LnVuaW9uKHB1YihbdGhpcy5sYWJlbCwgX18sIF9fXSwgMCwgMTApKVxuXHQudW5pb24oc3ViKFt0aGlzLmxhYmVsLCBfXywgX19dLCAwLCAxMCkpO1xuICAgIC8vIFRPRE86IGxldmVsIDEwIGlzIGFkLWhvYzsgc3VwcG9ydCBpbmZpbml0eSBhdCBzb21lIHBvaW50IGluIGZ1dHVyZVxufTtcblxuV2ViU29ja2V0Q29ubmVjdGlvbi5wcm90b3R5cGUuYWdncmVnYXRlR2VzdGFsdCA9IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgcmV0dXJuIHRoaXMucGVlckdlc3RhbHQudHJhbnNmb3JtKGZ1bmN0aW9uIChtLCBtZXRhTGV2ZWwpIHtcblx0cmV0dXJuIFJvdXRlLmNvbXBpbGVQYXR0ZXJuKHRydWUsXG5cdFx0XHRcdCAgICBbc2VsZi5sYWJlbCwgbWV0YUxldmVsLCBSb3V0ZS5lbWJlZGRlZE1hdGNoZXIobSldKTtcbiAgICB9KS51bmlvbih0aGlzLnJlbGF5R2VzdGFsdCgpKTtcbn07XG5cbldlYlNvY2tldENvbm5lY3Rpb24ucHJvdG90eXBlLmJvb3QgPSBmdW5jdGlvbiAoKSB7XG4gICAgdGhpcy5yZWNvbm5lY3QoKTtcbn07XG5cbldlYlNvY2tldENvbm5lY3Rpb24ucHJvdG90eXBlLnRyYXBleGl0ID0gZnVuY3Rpb24gKCkge1xuICAgIHRoaXMuZm9yY2VjbG9zZSgpO1xufTtcblxuV2ViU29ja2V0Q29ubmVjdGlvbi5wcm90b3R5cGUuaXNDb25uZWN0ZWQgPSBmdW5jdGlvbiAoKSB7XG4gICAgcmV0dXJuIHRoaXMuc29jayAmJiB0aGlzLnNvY2sucmVhZHlTdGF0ZSA9PT0gdGhpcy5zb2NrLk9QRU47XG59O1xuXG5XZWJTb2NrZXRDb25uZWN0aW9uLnByb3RvdHlwZS5zYWZlU2VuZCA9IGZ1bmN0aW9uIChtKSB7XG4gICAgdHJ5IHtcblx0dGhpcy5zZW5kc0F0dGVtcHRlZCsrO1xuXHRpZiAodGhpcy5pc0Nvbm5lY3RlZCgpKSB7XG5cdCAgICB0aGlzLnNvY2suc2VuZChtKTtcblx0ICAgIHRoaXMuc2VuZHNUcmFuc21pdHRlZCsrO1xuXHR9XG4gICAgfSBjYXRjaCAoZSkge1xuXHRjb25zb2xlLndhcm4oXCJUcmFwcGVkIGV4biB3aGlsZSBzZW5kaW5nXCIsIGUpO1xuICAgIH1cbn07XG5cbldlYlNvY2tldENvbm5lY3Rpb24ucHJvdG90eXBlLnNlbmRMb2NhbFJvdXRlcyA9IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgbmV3TG9jYWxSb3V0ZXNNZXNzYWdlID1cblx0SlNPTi5zdHJpbmdpZnkoZW5jb2RlRXZlbnQoTWluaW1hcnQudXBkYXRlUm91dGVzKFt0aGlzLmxvY2FsR2VzdGFsdF0pKSk7XG4gICAgaWYgKHRoaXMucHJldkxvY2FsUm91dGVzTWVzc2FnZSAhPT0gbmV3TG9jYWxSb3V0ZXNNZXNzYWdlKSB7XG5cdHRoaXMucHJldkxvY2FsUm91dGVzTWVzc2FnZSA9IG5ld0xvY2FsUm91dGVzTWVzc2FnZTtcblx0dGhpcy5zYWZlU2VuZChuZXdMb2NhbFJvdXRlc01lc3NhZ2UpO1xuICAgIH1cbn07XG5cbldlYlNvY2tldENvbm5lY3Rpb24ucHJvdG90eXBlLmNvbGxlY3RNYXRjaGVycyA9IGZ1bmN0aW9uIChnZXRBZHZlcnRpc2VtZW50cywgbGV2ZWwsIGcpIHtcbiAgICB2YXIgZXh0cmFjdE1ldGFMZXZlbHMgPSBSb3V0ZS5jb21waWxlUHJvamVjdGlvbihbdGhpcy5sYWJlbCwgXyQsIF9fXSk7XG4gICAgdmFyIG1scyA9IFJvdXRlLm1hdGNoZXJLZXlzKGcucHJvamVjdChleHRyYWN0TWV0YUxldmVscywgZ2V0QWR2ZXJ0aXNlbWVudHMsIDAsIGxldmVsKSk7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBtbHMubGVuZ3RoOyBpKyspIHtcblx0dmFyIG1ldGFMZXZlbCA9IG1sc1tpXVswXTsgLy8gb25seSBvbmUgY2FwdHVyZSBpbiB0aGUgcHJvamVjdGlvblxuXHR2YXIgZXh0cmFjdE1hdGNoZXJzID0gUm91dGUuY29tcGlsZVByb2plY3Rpb24oW3RoaXMubGFiZWwsIG1ldGFMZXZlbCwgXyRdKTtcblx0dmFyIG0gPSBnLnByb2plY3QoZXh0cmFjdE1hdGNoZXJzLCBnZXRBZHZlcnRpc2VtZW50cywgMCwgbGV2ZWwpO1xuXHR0aGlzLmxvY2FsR2VzdGFsdCA9IHRoaXMubG9jYWxHZXN0YWx0LnVuaW9uKFJvdXRlLnNpbXBsZUdlc3RhbHQoZ2V0QWR2ZXJ0aXNlbWVudHMsXG5cdFx0XHRcdFx0XHRcdFx0XHRSb3V0ZS5lbWJlZGRlZE1hdGNoZXIobSksXG5cdFx0XHRcdFx0XHRcdFx0XHRtZXRhTGV2ZWwsXG5cdFx0XHRcdFx0XHRcdFx0XHRsZXZlbCkpO1xuICAgIH1cbn07XG5cbldlYlNvY2tldENvbm5lY3Rpb24ucHJvdG90eXBlLmhhbmRsZUV2ZW50ID0gZnVuY3Rpb24gKGUpIHtcbiAgICAvLyBjb25zb2xlLmxvZyhcIldlYlNvY2tldENvbm5lY3Rpb24uaGFuZGxlRXZlbnRcIiwgZSk7XG4gICAgc3dpdGNoIChlLnR5cGUpIHtcbiAgICBjYXNlIFwicm91dGVzXCI6XG5cdC8vIFRPRE86IEdST1NTIC0gZXJhc2luZyBieSBwaWQhXG5cdHZhciBuTGV2ZWxzID0gZS5nZXN0YWx0LmxldmVsQ291bnQoMCk7XG5cdHZhciByZWxheUdlc3RhbHQgPSBSb3V0ZS5mdWxsR2VzdGFsdCgxLCBuTGV2ZWxzKS5sYWJlbChXb3JsZC5hY3RpdmVQaWQoKSk7XG5cdHZhciBnID0gZS5nZXN0YWx0LmVyYXNlUGF0aChyZWxheUdlc3RhbHQpO1xuXHR0aGlzLmxvY2FsR2VzdGFsdCA9IFJvdXRlLmVtcHR5R2VzdGFsdDtcblx0Zm9yICh2YXIgbGV2ZWwgPSAwOyBsZXZlbCA8IG5MZXZlbHM7IGxldmVsKyspIHtcblx0ICAgIHRoaXMuY29sbGVjdE1hdGNoZXJzKGZhbHNlLCBsZXZlbCwgZyk7XG5cdCAgICB0aGlzLmNvbGxlY3RNYXRjaGVycyh0cnVlLCBsZXZlbCwgZyk7XG5cdH1cblxuXHR0aGlzLnNlbmRMb2NhbFJvdXRlcygpO1xuXHRicmVhaztcbiAgICBjYXNlIFwibWVzc2FnZVwiOlxuXHR2YXIgbSA9IGUubWVzc2FnZTtcblx0aWYgKG0ubGVuZ3RoICYmIG0ubGVuZ3RoID09PSAzICYmIG1bMF0gPT09IHRoaXMubGFiZWwpXG5cdHtcblx0ICAgIHZhciBlbmNvZGVkID0gSlNPTi5zdHJpbmdpZnkoZW5jb2RlRXZlbnQoXG5cdFx0TWluaW1hcnQuc2VuZE1lc3NhZ2UobVsyXSwgbVsxXSwgZS5pc0ZlZWRiYWNrKSkpO1xuXHQgICAgaWYgKHRoaXMuZGVkdXBsaWNhdG9yLmFjY2VwdChlbmNvZGVkKSkge1xuXHRcdHRoaXMuc2FmZVNlbmQoZW5jb2RlZCk7XG5cdCAgICB9XG5cdH1cblx0YnJlYWs7XG4gICAgfVxufTtcblxuV2ViU29ja2V0Q29ubmVjdGlvbi5wcm90b3R5cGUuZm9yY2VjbG9zZSA9IGZ1bmN0aW9uIChrZWVwUmVjb25uZWN0RGVsYXkpIHtcbiAgICBpZiAoIWtlZXBSZWNvbm5lY3REZWxheSkge1xuXHR0aGlzLnJlY29ubmVjdERlbGF5ID0gREVGQVVMVF9SRUNPTk5FQ1RfREVMQVk7XG4gICAgfVxuICAgIHRoaXMuY2xlYXJIZWFydGJlYXRUaW1lcnMoKTtcbiAgICBpZiAodGhpcy5zb2NrKSB7XG5cdGNvbnNvbGUubG9nKFwiV2ViU29ja2V0Q29ubmVjdGlvbi5mb3JjZWNsb3NlIGNhbGxlZFwiKTtcblx0dGhpcy5zb2NrLmNsb3NlKCk7XG5cdHRoaXMuc29jayA9IG51bGw7XG4gICAgfVxufTtcblxuV2ViU29ja2V0Q29ubmVjdGlvbi5wcm90b3R5cGUucmVjb25uZWN0ID0gZnVuY3Rpb24gKCkge1xuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICB0aGlzLmZvcmNlY2xvc2UodHJ1ZSk7XG4gICAgdGhpcy5jb25uZWN0aW9uQ291bnQrKztcbiAgICB0aGlzLnNvY2sgPSBuZXcgV2ViU29ja2V0KHRoaXMud3N1cmwpO1xuICAgIHRoaXMuc29jay5vbm9wZW4gPSBXb3JsZC53cmFwKGZ1bmN0aW9uIChlKSB7IHJldHVybiBzZWxmLm9ub3BlbihlKTsgfSk7XG4gICAgdGhpcy5zb2NrLm9ubWVzc2FnZSA9IFdvcmxkLndyYXAoZnVuY3Rpb24gKGUpIHtcblx0c2VsZi5yZWNlaXZlQ291bnQrKztcblx0cmV0dXJuIHNlbGYub25tZXNzYWdlKGUpO1xuICAgIH0pO1xuICAgIHRoaXMuc29jay5vbmNsb3NlID0gV29ybGQud3JhcChmdW5jdGlvbiAoZSkgeyByZXR1cm4gc2VsZi5vbmNsb3NlKGUpOyB9KTtcbn07XG5cbldlYlNvY2tldENvbm5lY3Rpb24ucHJvdG90eXBlLm9ub3BlbiA9IGZ1bmN0aW9uIChlKSB7XG4gICAgY29uc29sZS5sb2coXCJjb25uZWN0ZWQgdG8gXCIgKyB0aGlzLnNvY2sudXJsKTtcbiAgICB0aGlzLnJlY29ubmVjdERlbGF5ID0gREVGQVVMVF9SRUNPTk5FQ1RfREVMQVk7XG4gICAgdGhpcy5wcmV2TG9jYWxSb3V0ZXNNZXNzYWdlID0gbnVsbDtcbiAgICB0aGlzLnNlbmRMb2NhbFJvdXRlcygpO1xufTtcblxuV2ViU29ja2V0Q29ubmVjdGlvbi5wcm90b3R5cGUub25tZXNzYWdlID0gZnVuY3Rpb24gKHdzZSkge1xuICAgIC8vIGNvbnNvbGUubG9nKFwib25tZXNzYWdlXCIsIHdzZSk7XG4gICAgdGhpcy5yZWNvcmRBY3Rpdml0eSgpO1xuXG4gICAgdmFyIGogPSBKU09OLnBhcnNlKHdzZS5kYXRhKTtcbiAgICBpZiAoaiA9PT0gXCJwaW5nXCIpIHtcblx0dGhpcy5zYWZlU2VuZChKU09OLnN0cmluZ2lmeShcInBvbmdcIikpO1xuXHRyZXR1cm47XG4gICAgfSBlbHNlIGlmIChqID09PSBcInBvbmdcIikge1xuXHRyZXR1cm47IC8vIHJlY29yZEFjdGl2aXR5IGFscmVhZHkgdG9vayBjYXJlIG9mIG91ciB0aW1lcnNcbiAgICB9XG5cbiAgICB2YXIgZSA9IGRlY29kZUFjdGlvbihqKTtcbiAgICBzd2l0Y2ggKGUudHlwZSkge1xuICAgIGNhc2UgXCJyb3V0ZXNcIjpcblx0aWYgKHRoaXMucHJldlBlZXJSb3V0ZXNNZXNzYWdlICE9PSB3c2UuZGF0YSkge1xuXHQgICAgdGhpcy5wcmV2UGVlclJvdXRlc01lc3NhZ2UgPSB3c2UuZGF0YTtcblx0ICAgIHRoaXMucGVlckdlc3RhbHQgPSBlLmdlc3RhbHQ7XG5cdCAgICBXb3JsZC51cGRhdGVSb3V0ZXMoW3RoaXMuYWdncmVnYXRlR2VzdGFsdCgpXSk7XG5cdH1cblx0YnJlYWs7XG4gICAgY2FzZSBcIm1lc3NhZ2VcIjpcblx0aWYgKHRoaXMuZGVkdXBsaWNhdG9yLmFjY2VwdCh3c2UuZGF0YSkpIHtcblx0ICAgIFdvcmxkLnNlbmQoW3RoaXMubGFiZWwsIGUubWV0YUxldmVsLCBlLm1lc3NhZ2VdLCAwLCBlLmlzRmVlZGJhY2spO1xuXHR9XG5cdGJyZWFrO1xuICAgIH1cbn07XG5cbldlYlNvY2tldENvbm5lY3Rpb24ucHJvdG90eXBlLm9uY2xvc2UgPSBmdW5jdGlvbiAoZSkge1xuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICBjb25zb2xlLmxvZyhcIm9uY2xvc2VcIiwgZSk7XG5cbiAgICAvLyBVcGRhdGUgcm91dGVzIHRvIGdpdmUgY2xpZW50cyBzb21lIGluZGljYXRpb24gb2YgdGhlIGRpc2NvbnRpbnVpdHlcbiAgICBXb3JsZC51cGRhdGVSb3V0ZXMoW3RoaXMuYWdncmVnYXRlR2VzdGFsdCgpXSk7XG5cbiAgICBpZiAodGhpcy5zaG91bGRSZWNvbm5lY3QpIHtcblx0Y29uc29sZS5sb2coXCJyZWNvbm5lY3RpbmcgdG8gXCIgKyB0aGlzLndzdXJsICsgXCIgaW4gXCIgKyB0aGlzLnJlY29ubmVjdERlbGF5ICsgXCJtc1wiKTtcblx0c2V0VGltZW91dChXb3JsZC53cmFwKGZ1bmN0aW9uICgpIHsgc2VsZi5yZWNvbm5lY3QoKTsgfSksIHRoaXMucmVjb25uZWN0RGVsYXkpO1xuXHR0aGlzLnJlY29ubmVjdERlbGF5ID0gdGhpcy5yZWNvbm5lY3REZWxheSAqIDEuNjE4ICsgKE1hdGgucmFuZG9tKCkgKiAxMDAwKTtcblx0dGhpcy5yZWNvbm5lY3REZWxheSA9XG5cdCAgICB0aGlzLnJlY29ubmVjdERlbGF5ID4gTUFYX1JFQ09OTkVDVF9ERUxBWVxuXHQgICAgPyBNQVhfUkVDT05ORUNUX0RFTEFZICsgKE1hdGgucmFuZG9tKCkgKiAxMDAwKVxuXHQgICAgOiB0aGlzLnJlY29ubmVjdERlbGF5O1xuICAgIH1cbn07XG5cbi8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuLy8gV2lyZSBwcm90b2NvbCByZXByZXNlbnRhdGlvbiBvZiBldmVudHMgYW5kIGFjdGlvbnNcblxuZnVuY3Rpb24gZW5jb2RlRXZlbnQoZSkge1xuICAgIHN3aXRjaCAoZS50eXBlKSB7XG4gICAgY2FzZSBcInJvdXRlc1wiOlxuXHRyZXR1cm4gW1wicm91dGVzXCIsIGUuZ2VzdGFsdC5zZXJpYWxpemUoZnVuY3Rpb24gKHYpIHsgcmV0dXJuIHRydWU7IH0pXTtcbiAgICBjYXNlIFwibWVzc2FnZVwiOlxuXHRyZXR1cm4gW1wibWVzc2FnZVwiLCBlLm1lc3NhZ2UsIGUubWV0YUxldmVsLCBlLmlzRmVlZGJhY2tdO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gZGVjb2RlQWN0aW9uKGopIHtcbiAgICBzd2l0Y2ggKGpbMF0pIHtcbiAgICBjYXNlIFwicm91dGVzXCI6XG5cdHJldHVybiBNaW5pbWFydC51cGRhdGVSb3V0ZXMoW1xuXHQgICAgUm91dGUuZGVzZXJpYWxpemVHZXN0YWx0KGpbMV0sIGZ1bmN0aW9uICh2KSB7IHJldHVybiB0cnVlOyB9KV0pO1xuICAgIGNhc2UgXCJtZXNzYWdlXCI6XG5cdHJldHVybiBNaW5pbWFydC5zZW5kTWVzc2FnZShqWzFdLCBqWzJdLCBqWzNdKTtcbiAgICBkZWZhdWx0OlxuXHR0aHJvdyB7IG1lc3NhZ2U6IFwiSW52YWxpZCBKU09OLWVuY29kZWQgYWN0aW9uOiBcIiArIEpTT04uc3RyaW5naWZ5KGopIH07XG4gICAgfVxufVxuXG4vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cblxubW9kdWxlLmV4cG9ydHMuV2ViU29ja2V0Q29ubmVjdGlvbiA9IFdlYlNvY2tldENvbm5lY3Rpb247XG5tb2R1bGUuZXhwb3J0cy5lbmNvZGVFdmVudCA9IGVuY29kZUV2ZW50O1xubW9kdWxlLmV4cG9ydHMuZGVjb2RlQWN0aW9uID0gZGVjb2RlQWN0aW9uO1xuIl19
(3)
});
