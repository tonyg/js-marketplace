!function(e){if("object"==typeof exports)module.exports=e();else if("function"==typeof define&&define.amd)define(e);else{var f;"undefined"!=typeof window?f=window:"undefined"!=typeof global?f=global:"undefined"!=typeof self&&(f=self),f.Minimart=e()}}(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(_dereq_,module,exports){
var Reflect = _dereq_("./reflect.js");
var Minimart = _dereq_("./minimart.js");
var World = Minimart.World;
var Route = Minimart.Route;

Actor._chunks = null;

function Actor(ctor) {
    var oldChunks = Actor._chunks;
    try {
	Actor._chunks = [];
	var behavior = new ctor();
	return finalizeActor(behavior, Actor._chunks);
    } catch (e) {
	Actor._chunks = oldChunks;
	throw e;
    }
}

function checkChunks(type) {
    if (!Actor._chunks) {
	throw new Error("Call to Actor."+type+" outside of Actor constructor");
    }
}

function extractChunk(type, kind, defaultOptions, args) {
    var rawProjectionFn = args[0]
    var options = null;
    var handler = null;
    if (typeof rawProjectionFn !== 'function') {
	throw new Error("Actor."+type+" expects a function producing a pattern as first argument");
    }
    for (var i = 1; i < args.length; i++) { // NB: skip the first arg - it's rawProjectionFn
	if (typeof args[i] === 'function') {
	    if (handler !== null) { throw new Error("Too many handler functions in Actor."+type); }
	    handler = args[i];
	} else if (typeof args[i] === 'object') {
	    if (options !== null) { throw new Error("Too many options arguments in Actor."+type); }
	    options = args[i];
	} else {
	    throw new Error("Unrecognised argument in Actor."+type);
	}
    }
    options = options || {};
    for (var k in options) {
	if (!(k in defaultOptions)) {
	    throw new Error("Unrecognised option '"+k+"' in Actor."+type);
	}
    }
    for (var k in defaultOptions) {
	if (!(k in options)) {
	    options[k] = defaultOptions[k];
	}
    }
    return {
	type: type,
	kind: kind,
	rawProjectionFn: rawProjectionFn,
	options: options,
	handler: handler
    };
}

function recordChunk(chunk) {
    Actor._chunks.push(chunk);
}

function chunkExtractor(type, kind, defaultOptions) {
    return function (/* ... */) {
	checkChunks(type);
	recordChunk(extractChunk(type,
				 kind,
				 defaultOptions,
				 Array.prototype.slice.call(arguments)));
    };
}

var participantDefaults = {
    metaLevel: 0,
    when: function () { return true; }
};

var observerDefaults = {
    metaLevel: 0,
    level: 0,
    when: function () { return true; },
    presence: null,
    name: null,
    set: null,
    added: null,
    removed: null
};

Actor.advertise = chunkExtractor('advertise', 'participant', participantDefaults);
Actor.subscribe = chunkExtractor('subscribe', 'participant', participantDefaults);

Actor.observeAdvertisers = chunkExtractor('observeAdvertisers', 'observer', observerDefaults);
Actor.observeSubscribers = chunkExtractor('observeSubscribers', 'observer', observerDefaults);

Actor.observeGestalt = function (gestaltFn, eventHandlerFn) {
    checkChunks('observeGestalt');
    recordChunk({
	type: 'observeGestalt',
	kind: 'raw',
	gestaltFn: gestaltFn,
	options: {
	    when: function () { return true; }
	},
	eventHandlerFn: eventHandlerFn
    });
};

function finalizeActor(behavior, chunks) {
    var oldBoot = behavior.boot;
    var oldHandleEvent = behavior.handleEvent;
    var projections = {};
    var compiledProjections = {};
    var previousObjs = {};

    behavior.boot = function () {
	if (oldBoot) { oldBoot.call(this); }
	for (var i = 0; i < chunks.length; i++) {
	    var chunk = chunks[i];
	    if (chunk.kind === 'observer') {
		if (chunk.options.presence) { this[chunk.options.presence] = false; }
		if (chunk.options.name) { this[chunk.options.name] = []; }
		if (chunk.options.added) { this[chunk.options.added] = []; }
		if (chunk.options.removed) { this[chunk.options.removed] = []; }
	    }
	}
	this.updateRoutes();
    };

    behavior.updateRoutes = function () {
	var newRoutes = Route.emptyGestalt;
	for (var i = 0; i < chunks.length; i++) {
	    var chunk = chunks[i];
	    if (chunk.options.when.call(this)) {
		switch (chunk.kind) {
		case 'raw':
		    newRoutes = newRoutes.union(chunk.gestaltFn.call(this));
		    break;
		case 'participant':
		    var proj = chunk.rawProjectionFn.call(this);
		    projections[i] = proj;
		    var g = Route.simpleGestalt(chunk.type === 'advertise',
						Route.projectionToPattern(proj),
						chunk.options.metaLevel,
						0);
		    newRoutes = newRoutes.union(g);
		    break;
		case 'observer':
		    var proj = chunk.rawProjectionFn.call(this);
		    projections[i] = proj;
		    compiledProjections[i] = Route.compileProjection(proj);
		    var g = Route.simpleGestalt(chunk.type === 'observeSubscribers',
						Route.projectionToPattern(proj),
						chunk.options.metaLevel,
						chunk.options.level + 1);
		    newRoutes = newRoutes.union(g);
		    if (chunk.options.added || chunk.options.removed) {
			previousObjs[i] = Route.arrayToSet([]);
		    }
		    break;
		default:
		    throw new Error("Unsupported chunk type/kind: "+chunk.type+"/"+chunk.kind);
		}
	    }
	}
	World.updateRoutes([newRoutes]);
    };

    behavior.handleEvent = function (e) {
	if (oldHandleEvent) { oldHandleEvent.call(this, e); }
	for (var i = 0; i < chunks.length; i++) {
	    var chunk = chunks[i];
	    switch (chunk.kind) {
	    case 'raw':
		chunk.eventHandlerFn.call(this, e);
		break;
	    case 'participant':
		if (chunk.handler
		    && (e.type === 'message')
		    && (e.metaLevel === chunk.options.metaLevel)
		    && (e.isFeedback === (chunk.type === 'advertise')))
		{
		    var matchResult = Route.matchPattern(e.message, projections[i]);
		    if (matchResult) {
			kwApply(chunk.handler, this, matchResult);
		    }
		}
		break;
	    case 'observer':
		if (e.type === 'routes') {
		    var projectionResult = e.gestalt.project(compiledProjections[i],
							     chunk.type !== 'observeSubscribers',
							     chunk.options.metaLevel,
							     chunk.options.level);

		    var isPresent = !Route.is_emptyMatcher(projectionResult);
		    if (chunk.options.presence) {
			this[chunk.options.presence] = isPresent;
		    }

		    var objs = [];
		    if (isPresent) {
			var keys = Route.matcherKeys(projectionResult);
			if (keys === null) {
			    console.warn("Wildcard detected while projecting ("
					 +JSON.stringify(chunk.options)+")");
			} else {
			    objs = Route.matcherKeysToObjects(keys, compiledProjections[i]);
			    if (chunk.options.set) {
				for (var j = 0; j < objs.length; j++) {
				    objs[j] = chunk.options.set.call(this, objs[j]);
				}
			    }
			}
		    }
		    if (chunk.options.name) {
			this[chunk.options.name] = objs;
		    }

		    if (chunk.options.added || chunk.options.removed) {
			var objSet = Route.arrayToSet(objs);

			if (chunk.options.added) {
			    this[chunk.options.added] =
				Route.setToArray(Route.setSubtract(objSet, previousObjs[i]));
			}

			if (chunk.options.removed) {
			    this[chunk.options.removed] =
				Route.setToArray(Route.setSubtract(previousObjs[i], objSet));
			}

			previousObjs[i] = objSet;
		    }

		    if (chunk.handler) {
			chunk.handler.call(this);
		    }
		}
		break;
	    default:
		throw new Error("Unsupported chunk type/kind: "+chunk.type+"/"+chunk.kind);
	    }
	}
    };

    return behavior;
}

function kwApply(f, thisArg, args) {
    var formals = Reflect.formalParameters(f);
    var actuals = []
    for (var i = 0; i < formals.length; i++) {
	var formal = formals[i];
	if (!(formal in args)) {
	    throw new Error("Function parameter '"+formal+"' not present in args");
	}
	actuals.push(args[formal]);
    }
    return f.apply(thisArg, actuals);
}

///////////////////////////////////////////////////////////////////////////

module.exports.Actor = Actor;
module.exports.kwApply = kwApply;

},{"./minimart.js":7,"./reflect.js":8}],2:[function(_dereq_,module,exports){
// Wire protocol representation of events and actions

var Route = _dereq_("./route.js");

function _encode(e) {
    switch (e.type) {
    case "routes":
	return ["routes", e.gestalt.serialize(function (v) { return true; })];
    case "message":
	return ["message", e.message, e.metaLevel, e.isFeedback];
    }
}

function _decode(what) {
  return function (j) {
    switch (j[0]) {
    case "routes":
      return Minimart.updateRoutes([
	Route.deserializeGestalt(j[1], function (v) { return true; })]);
    case "message":
      return Minimart.sendMessage(j[1], j[2], j[3]);
    default:
      throw { message: "Invalid JSON-encoded " + what + ": " + JSON.stringify(j) };
    }
  };
}

///////////////////////////////////////////////////////////////////////////

module.exports.encodeEvent = _encode;
module.exports.decodeEvent = _decode("event");
module.exports.encodeAction = _encode;
module.exports.decodeAction = _decode("action");

},{"./route.js":9}],3:[function(_dereq_,module,exports){
// DOM fragment display driver
var Minimart = _dereq_("./minimart.js");
var World = Minimart.World;
var sub = Minimart.sub;
var pub = Minimart.pub;
var __ = Minimart.__;
var _$ = Minimart._$;

function spawnDOMDriver(domWrapFunction, jQueryWrapFunction) {
    domWrapFunction = domWrapFunction || defaultWrapFunction;
    var d = new Minimart.DemandMatcher(domWrapFunction(_$, _$, _$));
    d.onDemandIncrease = function (captures) {
	var selector = captures[0];
	var fragmentClass = captures[1];
	var fragmentSpec = captures[2];
	World.spawn(new DOMFragment(selector,
				    fragmentClass,
				    fragmentSpec,
				    domWrapFunction,
				    jQueryWrapFunction),
		    [sub(domWrapFunction(selector, fragmentClass, fragmentSpec)),
		     sub(domWrapFunction(selector, fragmentClass, fragmentSpec), 0, 1)]);
    };
    World.spawn(d);
}

function defaultWrapFunction(selector, fragmentClass, fragmentSpec) {
    return ["DOM", selector, fragmentClass, fragmentSpec];
}

function DOMFragment(selector, fragmentClass, fragmentSpec, domWrapFunction, jQueryWrapFunction) {
    this.selector = selector;
    this.fragmentClass = fragmentClass;
    this.fragmentSpec = fragmentSpec;
    this.domWrapFunction = domWrapFunction;
    this.jQueryWrapFunction = jQueryWrapFunction;
    this.nodes = this.buildNodes();
}

DOMFragment.prototype.boot = function () {
    var self = this;
    var monitoring =
	sub(this.domWrapFunction(self.selector, self.fragmentClass, self.fragmentSpec), 1, 2);
    World.spawn(new World(function () {
	Minimart.JQuery.spawnJQueryDriver(self.selector+" > ."+self.fragmentClass,
					  1,
					  self.jQueryWrapFunction);
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
    return Array.isArray(x) && ((x.length === 0) || Array.isArray(x[0]));
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
module.exports.defaultWrapFunction = defaultWrapFunction;

},{"./minimart.js":7}],4:[function(_dereq_,module,exports){
/* Ground interface */
var Minimart = _dereq_("./minimart.js");
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

},{"./minimart.js":7}],5:[function(_dereq_,module,exports){
// JQuery event driver
var Minimart = _dereq_("./minimart.js");
var World = Minimart.World;
var sub = Minimart.sub;
var pub = Minimart.pub;
var __ = Minimart.__;
var _$ = Minimart._$;

function spawnJQueryDriver(baseSelector, metaLevel, wrapFunction) {
    metaLevel = metaLevel || 0;
    wrapFunction = wrapFunction || defaultWrapFunction;
    var d = new Minimart.DemandMatcher(wrapFunction(_$, _$, __), metaLevel,
				       {demandSideIsSubscription: true});
    d.onDemandIncrease = function (captures) {
	var selector = captures[0];
	var eventName = captures[1];
	World.spawn(new JQueryEventRouter(baseSelector,
					  selector,
					  eventName,
					  metaLevel,
					  wrapFunction),
		    [pub(wrapFunction(selector, eventName, __), metaLevel),
		     pub(wrapFunction(selector, eventName, __), metaLevel, 1)]);
    };
    World.spawn(d);
}

function defaultWrapFunction(selector, eventName, eventValue) {
    return ["jQuery", selector, eventName, eventValue];
}

function JQueryEventRouter(baseSelector, selector, eventName, metaLevel, wrapFunction) {
    var self = this;
    this.baseSelector = baseSelector || null;
    this.selector = selector;
    this.eventName = eventName;
    this.metaLevel = metaLevel || 0;
    this.wrapFunction = wrapFunction || defaultWrapFunction;
    this.preventDefault = (this.eventName.charAt(0) !== "+");
    this.handler =
	World.wrap(function (e) {
	    World.send(self.wrapFunction(self.selector, self.eventName, e), self.metaLevel);
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

function simplifyDOMEvent(e) {
    var keys = [];
    for (var k in e) {
	var v = e[k];
	if (typeof v === 'object') continue;
	if (typeof v === 'function') continue;
	keys.push(k);
    }
    keys.sort();
    var simplified = [];
    for (var i = 0; i < keys.length; i++) {
	simplified.push([keys[i], e[keys[i]]]);
    }
    return simplified;
}

///////////////////////////////////////////////////////////////////////////

module.exports.spawnJQueryDriver = spawnJQueryDriver;
module.exports.simplifyDOMEvent = simplifyDOMEvent;
module.exports.defaultWrapFunction = defaultWrapFunction;

},{"./minimart.js":7}],6:[function(_dereq_,module,exports){
module.exports = _dereq_("./minimart.js");

module.exports.DOM = _dereq_("./dom-driver.js");
module.exports.JQuery = _dereq_("./jquery-driver.js");
module.exports.RoutingTableWidget = _dereq_("./routing-table-widget.js");
module.exports.WebSocket = _dereq_("./websocket-driver.js");
module.exports.Reflect = _dereq_("./reflect.js");

module.exports.Ground = _dereq_("./ground.js").Ground;
module.exports.Actor = _dereq_("./actor.js").Actor;
module.exports.Spy = _dereq_("./spy.js").Spy;
module.exports.WakeDetector = _dereq_("./wake-detector.js").WakeDetector;

var Worker = _dereq_("./worker.js");
module.exports.Worker = Worker.Worker;
module.exports.WorkerGround = Worker.WorkerGround;

},{"./actor.js":1,"./dom-driver.js":3,"./ground.js":4,"./jquery-driver.js":5,"./minimart.js":7,"./reflect.js":8,"./routing-table-widget.js":10,"./spy.js":11,"./wake-detector.js":13,"./websocket-driver.js":14,"./worker.js":15}],7:[function(_dereq_,module,exports){
var Route = _dereq_("./route.js");
var Util = _dereq_("./util.js");

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
	if (Array.isArray(p)) {
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
    options = Util.extend({
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
module.exports.Route = Route;

},{"./route.js":9,"./util.js":12}],8:[function(_dereq_,module,exports){
// Reflection on function formal parameter lists.
// This module is based on Angular's "injector" code,
// https://github.com/angular/angular.js/blob/master/src/auto/injector.js,
// MIT licensed, and hence:
// Copyright (c) 2010-2014 Google, Inc. http://angularjs.org
// Copyright (c) 2014 Tony Garnock-Jones

var FN_ARGS = /^function\s*[^\(]*\(\s*([^\)]*)\)/m;
var FN_ARG_SPLIT = /,/;
var STRIP_COMMENTS = /((\/\/.*$)|(\/\*[\s\S]*?\*\/))/mg;

function formalParameters(fn) {
    var result = [];

    var fnText = fn.toString().replace(STRIP_COMMENTS, '');
    var argDecl = fnText.match(FN_ARGS);
    var args = argDecl[1].split(FN_ARG_SPLIT);
    for (var i = 0; i < args.length; i++) {
	var trimmed = args[i].trim();
	if (trimmed) { result.push(trimmed); }
    }

    return result;
}

module.exports.formalParameters = formalParameters;

},{}],9:[function(_dereq_,module,exports){
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

// The name argument should be a string or null; it defaults to null.
// The pattern argument defaults to wildcard, __.
function $Capture(name, pattern) {
    this.name = name || null;
    this.pattern = (typeof pattern === 'undefined' ? __ : pattern);
}

// Abbreviation: _$(...) <==> new $Capture(...)
function _$(name, pattern) {
    return new $Capture(name, pattern);
}

function isCapture(x) { return x instanceof $Capture || x === _$; }
function captureName(x) { return x instanceof $Capture ? x.name : null; }
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

function matchPattern(v, p) {
    var captureCount = 0;
    var result = {};
    try {
	walk(v, p);
    } catch (e) {
	if (e.matchPatternFailed) return null;
	throw e;
    }
    result.length = captureCount;
    return result;

    function walk(v, p) {
	if (p === v) return;

	if (p === __) return;

	if (Array.isArray(p) && Array.isArray(v) && p.length === v.length) {
	    for (var i = 0; i < p.length; i++) {
		walk(v[i], p[i]);
	    }
	    return;
	}

	if (isCapture(p)) {
	    var thisCapture = captureCount++;
	    walk(v, capturePattern(p));
	    result[captureName(p) || ('$' + thisCapture)] = v;
	    return;
	}

	if (p instanceof $Embedded) {
	    die("$Embedded patterns not supported in matchPattern()");
	}

	throw {matchPatternFailed: true};
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
    var names = [];
    var acc = [];
    for (var i = 0; i < arguments.length; i++) {
	walk(arguments[i]);
    }
    acc.push(EOA);
    return {names: names, spec: acc};

    function walk(p) {
	if (isCapture(p)) {
	    names.push(captureName(p));
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

function project(m, compiledProjection) {
    var spec = compiledProjection.spec;
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

function matcherKeysToObjects(matcherKeysResult, compiledProjection) {
    if (matcherKeysResult === null) return null;
    var result = [];
    for (var i = 0; i < matcherKeysResult.length; i++) {
	var e = matcherKeysResult[i];
	var d = {};
	for (var j = 0; j < e.length; j++) {
	    d[compiledProjection.names[j] || ('$' + j)] = e[j];
	}
	result.push(d);
    }
    return result;
}

function projectObjects(m, compiledProjection) {
    return matcherKeysToObjects(matcherKeys(project(m, compiledProjection)), compiledProjection);
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
module.exports.matchPattern = matchPattern;
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
module.exports.matcherKeysToObjects = matcherKeysToObjects;
module.exports.projectObjects = projectObjects;
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

},{}],10:[function(_dereq_,module,exports){
var Minimart = _dereq_("./minimart.js");
var Route = Minimart.Route;
var World = Minimart.World;
var sub = Minimart.sub;
var pub = Minimart.pub;
var __ = Minimart.__;

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

},{"./minimart.js":7}],11:[function(_dereq_,module,exports){
// Generic Spy
var Minimart = _dereq_("./minimart.js");
var World = Minimart.World;
var sub = Minimart.sub;
var pub = Minimart.pub;
var __ = Minimart.__;

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

},{"./minimart.js":7}],12:[function(_dereq_,module,exports){
// Minimal jQueryish utilities. Reimplemented because jQuery needs
// window to exist, and we want to run in Web Worker context as well.

function extend(what, _with) {
  for (var prop in _with) {
    if (_with.hasOwnProperty(prop)) {
      what[prop] = _with[prop];
    }
  }
  return what;
}

module.exports.extend = extend;

},{}],13:[function(_dereq_,module,exports){
// Wake detector - notices when something (such as
// suspension/sleeping!) has caused periodic activities to be
// interrupted, and warns others about it
// Inspired by http://blog.alexmaccaw.com/javascript-wake-event
var Minimart = _dereq_("./minimart.js");
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

},{"./minimart.js":7}],14:[function(_dereq_,module,exports){
var Minimart = _dereq_("./minimart.js");
var Codec = _dereq_("./codec.js");
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
	JSON.stringify(Codec.encodeEvent(Minimart.updateRoutes([this.localGestalt])));
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
	    var encoded = JSON.stringify(Codec.encodeEvent(
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

    var e = Codec.decodeAction(j);
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

module.exports.WebSocketConnection = WebSocketConnection;

},{"./codec.js":2,"./minimart.js":7}],15:[function(_dereq_,module,exports){
/* Web Worker interface */
var Ground = _dereq_("./ground.js").Ground;
var Util = _dereq_("./util.js");
var Codec = _dereq_("./codec.js");

var Minimart = _dereq_("./minimart.js");
var World = Minimart.World;
var sub = Minimart.sub;
var pub = Minimart.pub;
var __ = Minimart.__;

var BuiltinWorker = typeof window !== 'undefined' && window.Worker;

///////////////////////////////////////////////////////////////////////////

function Worker(scriptUrl) {
  this.scriptUrl = scriptUrl;
  this.w = new BuiltinWorker(scriptUrl);
}

Worker.prototype.boot = function () {
  this.w.onmessage = World.wrap(function (e) {
    console.log("Received from worker", JSON.stringify(e.data));
    World.current().enqueueAction(World.activePid(), Codec.decodeAction(e.data));
  });
};

Worker.prototype.handleEvent = function (e) {
  console.log("Sending to worker", JSON.stringify(Codec.encodeEvent(e)));
  this.w.postMessage(Codec.encodeEvent(e));
};

///////////////////////////////////////////////////////////////////////////

function WorkerGround(bootFn) {
  var self = this;
  Ground.call(this, bootFn);
  onmessage = function (e) {
    console.log("Received from main page", JSON.stringify(e.data));
    self.world.handleEvent(Codec.decodeEvent(e.data));
    self.startStepping();
  };
}

WorkerGround.prototype = Util.extend({}, Ground.prototype);

WorkerGround.prototype.enqueueAction = function (pid, action) {
  console.log("Sending to main page", JSON.stringify(Codec.encodeAction(action)));
  postMessage(Codec.encodeAction(action));
  console.log("Sent to main page");
};

///////////////////////////////////////////////////////////////////////////

module.exports.Worker = Worker;
module.exports.WorkerGround = WorkerGround;

},{"./codec.js":2,"./ground.js":4,"./minimart.js":7,"./util.js":12}]},{},[6])
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi9Vc2Vycy90b255Zy9zcmMvanMtbWFya2V0cGxhY2Uvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXItcGFjay9fcHJlbHVkZS5qcyIsIi9Vc2Vycy90b255Zy9zcmMvanMtbWFya2V0cGxhY2Uvc3JjL2FjdG9yLmpzIiwiL1VzZXJzL3RvbnlnL3NyYy9qcy1tYXJrZXRwbGFjZS9zcmMvY29kZWMuanMiLCIvVXNlcnMvdG9ueWcvc3JjL2pzLW1hcmtldHBsYWNlL3NyYy9kb20tZHJpdmVyLmpzIiwiL1VzZXJzL3RvbnlnL3NyYy9qcy1tYXJrZXRwbGFjZS9zcmMvZ3JvdW5kLmpzIiwiL1VzZXJzL3RvbnlnL3NyYy9qcy1tYXJrZXRwbGFjZS9zcmMvanF1ZXJ5LWRyaXZlci5qcyIsIi9Vc2Vycy90b255Zy9zcmMvanMtbWFya2V0cGxhY2Uvc3JjL21haW4uanMiLCIvVXNlcnMvdG9ueWcvc3JjL2pzLW1hcmtldHBsYWNlL3NyYy9taW5pbWFydC5qcyIsIi9Vc2Vycy90b255Zy9zcmMvanMtbWFya2V0cGxhY2Uvc3JjL3JlZmxlY3QuanMiLCIvVXNlcnMvdG9ueWcvc3JjL2pzLW1hcmtldHBsYWNlL3NyYy9yb3V0ZS5qcyIsIi9Vc2Vycy90b255Zy9zcmMvanMtbWFya2V0cGxhY2Uvc3JjL3JvdXRpbmctdGFibGUtd2lkZ2V0LmpzIiwiL1VzZXJzL3RvbnlnL3NyYy9qcy1tYXJrZXRwbGFjZS9zcmMvc3B5LmpzIiwiL1VzZXJzL3RvbnlnL3NyYy9qcy1tYXJrZXRwbGFjZS9zcmMvdXRpbC5qcyIsIi9Vc2Vycy90b255Zy9zcmMvanMtbWFya2V0cGxhY2Uvc3JjL3dha2UtZGV0ZWN0b3IuanMiLCIvVXNlcnMvdG9ueWcvc3JjL2pzLW1hcmtldHBsYWNlL3NyYy93ZWJzb2NrZXQtZHJpdmVyLmpzIiwiL1VzZXJzL3RvbnlnL3NyYy9qcy1tYXJrZXRwbGFjZS9zcmMvd29ya2VyLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDOVFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25IQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzdEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcGZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqakRBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4REE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6T0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3Rocm93IG5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIil9dmFyIGY9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGYuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sZixmLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsInZhciBSZWZsZWN0ID0gcmVxdWlyZShcIi4vcmVmbGVjdC5qc1wiKTtcbnZhciBNaW5pbWFydCA9IHJlcXVpcmUoXCIuL21pbmltYXJ0LmpzXCIpO1xudmFyIFdvcmxkID0gTWluaW1hcnQuV29ybGQ7XG52YXIgUm91dGUgPSBNaW5pbWFydC5Sb3V0ZTtcblxuQWN0b3IuX2NodW5rcyA9IG51bGw7XG5cbmZ1bmN0aW9uIEFjdG9yKGN0b3IpIHtcbiAgICB2YXIgb2xkQ2h1bmtzID0gQWN0b3IuX2NodW5rcztcbiAgICB0cnkge1xuXHRBY3Rvci5fY2h1bmtzID0gW107XG5cdHZhciBiZWhhdmlvciA9IG5ldyBjdG9yKCk7XG5cdHJldHVybiBmaW5hbGl6ZUFjdG9yKGJlaGF2aW9yLCBBY3Rvci5fY2h1bmtzKTtcbiAgICB9IGNhdGNoIChlKSB7XG5cdEFjdG9yLl9jaHVua3MgPSBvbGRDaHVua3M7XG5cdHRocm93IGU7XG4gICAgfVxufVxuXG5mdW5jdGlvbiBjaGVja0NodW5rcyh0eXBlKSB7XG4gICAgaWYgKCFBY3Rvci5fY2h1bmtzKSB7XG5cdHRocm93IG5ldyBFcnJvcihcIkNhbGwgdG8gQWN0b3IuXCIrdHlwZStcIiBvdXRzaWRlIG9mIEFjdG9yIGNvbnN0cnVjdG9yXCIpO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gZXh0cmFjdENodW5rKHR5cGUsIGtpbmQsIGRlZmF1bHRPcHRpb25zLCBhcmdzKSB7XG4gICAgdmFyIHJhd1Byb2plY3Rpb25GbiA9IGFyZ3NbMF1cbiAgICB2YXIgb3B0aW9ucyA9IG51bGw7XG4gICAgdmFyIGhhbmRsZXIgPSBudWxsO1xuICAgIGlmICh0eXBlb2YgcmF3UHJvamVjdGlvbkZuICE9PSAnZnVuY3Rpb24nKSB7XG5cdHRocm93IG5ldyBFcnJvcihcIkFjdG9yLlwiK3R5cGUrXCIgZXhwZWN0cyBhIGZ1bmN0aW9uIHByb2R1Y2luZyBhIHBhdHRlcm4gYXMgZmlyc3QgYXJndW1lbnRcIik7XG4gICAgfVxuICAgIGZvciAodmFyIGkgPSAxOyBpIDwgYXJncy5sZW5ndGg7IGkrKykgeyAvLyBOQjogc2tpcCB0aGUgZmlyc3QgYXJnIC0gaXQncyByYXdQcm9qZWN0aW9uRm5cblx0aWYgKHR5cGVvZiBhcmdzW2ldID09PSAnZnVuY3Rpb24nKSB7XG5cdCAgICBpZiAoaGFuZGxlciAhPT0gbnVsbCkgeyB0aHJvdyBuZXcgRXJyb3IoXCJUb28gbWFueSBoYW5kbGVyIGZ1bmN0aW9ucyBpbiBBY3Rvci5cIit0eXBlKTsgfVxuXHQgICAgaGFuZGxlciA9IGFyZ3NbaV07XG5cdH0gZWxzZSBpZiAodHlwZW9mIGFyZ3NbaV0gPT09ICdvYmplY3QnKSB7XG5cdCAgICBpZiAob3B0aW9ucyAhPT0gbnVsbCkgeyB0aHJvdyBuZXcgRXJyb3IoXCJUb28gbWFueSBvcHRpb25zIGFyZ3VtZW50cyBpbiBBY3Rvci5cIit0eXBlKTsgfVxuXHQgICAgb3B0aW9ucyA9IGFyZ3NbaV07XG5cdH0gZWxzZSB7XG5cdCAgICB0aHJvdyBuZXcgRXJyb3IoXCJVbnJlY29nbmlzZWQgYXJndW1lbnQgaW4gQWN0b3IuXCIrdHlwZSk7XG5cdH1cbiAgICB9XG4gICAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG4gICAgZm9yICh2YXIgayBpbiBvcHRpb25zKSB7XG5cdGlmICghKGsgaW4gZGVmYXVsdE9wdGlvbnMpKSB7XG5cdCAgICB0aHJvdyBuZXcgRXJyb3IoXCJVbnJlY29nbmlzZWQgb3B0aW9uICdcIitrK1wiJyBpbiBBY3Rvci5cIit0eXBlKTtcblx0fVxuICAgIH1cbiAgICBmb3IgKHZhciBrIGluIGRlZmF1bHRPcHRpb25zKSB7XG5cdGlmICghKGsgaW4gb3B0aW9ucykpIHtcblx0ICAgIG9wdGlvbnNba10gPSBkZWZhdWx0T3B0aW9uc1trXTtcblx0fVxuICAgIH1cbiAgICByZXR1cm4ge1xuXHR0eXBlOiB0eXBlLFxuXHRraW5kOiBraW5kLFxuXHRyYXdQcm9qZWN0aW9uRm46IHJhd1Byb2plY3Rpb25Gbixcblx0b3B0aW9uczogb3B0aW9ucyxcblx0aGFuZGxlcjogaGFuZGxlclxuICAgIH07XG59XG5cbmZ1bmN0aW9uIHJlY29yZENodW5rKGNodW5rKSB7XG4gICAgQWN0b3IuX2NodW5rcy5wdXNoKGNodW5rKTtcbn1cblxuZnVuY3Rpb24gY2h1bmtFeHRyYWN0b3IodHlwZSwga2luZCwgZGVmYXVsdE9wdGlvbnMpIHtcbiAgICByZXR1cm4gZnVuY3Rpb24gKC8qIC4uLiAqLykge1xuXHRjaGVja0NodW5rcyh0eXBlKTtcblx0cmVjb3JkQ2h1bmsoZXh0cmFjdENodW5rKHR5cGUsXG5cdFx0XHRcdCBraW5kLFxuXHRcdFx0XHQgZGVmYXVsdE9wdGlvbnMsXG5cdFx0XHRcdCBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMpKSk7XG4gICAgfTtcbn1cblxudmFyIHBhcnRpY2lwYW50RGVmYXVsdHMgPSB7XG4gICAgbWV0YUxldmVsOiAwLFxuICAgIHdoZW46IGZ1bmN0aW9uICgpIHsgcmV0dXJuIHRydWU7IH1cbn07XG5cbnZhciBvYnNlcnZlckRlZmF1bHRzID0ge1xuICAgIG1ldGFMZXZlbDogMCxcbiAgICBsZXZlbDogMCxcbiAgICB3aGVuOiBmdW5jdGlvbiAoKSB7IHJldHVybiB0cnVlOyB9LFxuICAgIHByZXNlbmNlOiBudWxsLFxuICAgIG5hbWU6IG51bGwsXG4gICAgc2V0OiBudWxsLFxuICAgIGFkZGVkOiBudWxsLFxuICAgIHJlbW92ZWQ6IG51bGxcbn07XG5cbkFjdG9yLmFkdmVydGlzZSA9IGNodW5rRXh0cmFjdG9yKCdhZHZlcnRpc2UnLCAncGFydGljaXBhbnQnLCBwYXJ0aWNpcGFudERlZmF1bHRzKTtcbkFjdG9yLnN1YnNjcmliZSA9IGNodW5rRXh0cmFjdG9yKCdzdWJzY3JpYmUnLCAncGFydGljaXBhbnQnLCBwYXJ0aWNpcGFudERlZmF1bHRzKTtcblxuQWN0b3Iub2JzZXJ2ZUFkdmVydGlzZXJzID0gY2h1bmtFeHRyYWN0b3IoJ29ic2VydmVBZHZlcnRpc2VycycsICdvYnNlcnZlcicsIG9ic2VydmVyRGVmYXVsdHMpO1xuQWN0b3Iub2JzZXJ2ZVN1YnNjcmliZXJzID0gY2h1bmtFeHRyYWN0b3IoJ29ic2VydmVTdWJzY3JpYmVycycsICdvYnNlcnZlcicsIG9ic2VydmVyRGVmYXVsdHMpO1xuXG5BY3Rvci5vYnNlcnZlR2VzdGFsdCA9IGZ1bmN0aW9uIChnZXN0YWx0Rm4sIGV2ZW50SGFuZGxlckZuKSB7XG4gICAgY2hlY2tDaHVua3MoJ29ic2VydmVHZXN0YWx0Jyk7XG4gICAgcmVjb3JkQ2h1bmsoe1xuXHR0eXBlOiAnb2JzZXJ2ZUdlc3RhbHQnLFxuXHRraW5kOiAncmF3Jyxcblx0Z2VzdGFsdEZuOiBnZXN0YWx0Rm4sXG5cdG9wdGlvbnM6IHtcblx0ICAgIHdoZW46IGZ1bmN0aW9uICgpIHsgcmV0dXJuIHRydWU7IH1cblx0fSxcblx0ZXZlbnRIYW5kbGVyRm46IGV2ZW50SGFuZGxlckZuXG4gICAgfSk7XG59O1xuXG5mdW5jdGlvbiBmaW5hbGl6ZUFjdG9yKGJlaGF2aW9yLCBjaHVua3MpIHtcbiAgICB2YXIgb2xkQm9vdCA9IGJlaGF2aW9yLmJvb3Q7XG4gICAgdmFyIG9sZEhhbmRsZUV2ZW50ID0gYmVoYXZpb3IuaGFuZGxlRXZlbnQ7XG4gICAgdmFyIHByb2plY3Rpb25zID0ge307XG4gICAgdmFyIGNvbXBpbGVkUHJvamVjdGlvbnMgPSB7fTtcbiAgICB2YXIgcHJldmlvdXNPYmpzID0ge307XG5cbiAgICBiZWhhdmlvci5ib290ID0gZnVuY3Rpb24gKCkge1xuXHRpZiAob2xkQm9vdCkgeyBvbGRCb290LmNhbGwodGhpcyk7IH1cblx0Zm9yICh2YXIgaSA9IDA7IGkgPCBjaHVua3MubGVuZ3RoOyBpKyspIHtcblx0ICAgIHZhciBjaHVuayA9IGNodW5rc1tpXTtcblx0ICAgIGlmIChjaHVuay5raW5kID09PSAnb2JzZXJ2ZXInKSB7XG5cdFx0aWYgKGNodW5rLm9wdGlvbnMucHJlc2VuY2UpIHsgdGhpc1tjaHVuay5vcHRpb25zLnByZXNlbmNlXSA9IGZhbHNlOyB9XG5cdFx0aWYgKGNodW5rLm9wdGlvbnMubmFtZSkgeyB0aGlzW2NodW5rLm9wdGlvbnMubmFtZV0gPSBbXTsgfVxuXHRcdGlmIChjaHVuay5vcHRpb25zLmFkZGVkKSB7IHRoaXNbY2h1bmsub3B0aW9ucy5hZGRlZF0gPSBbXTsgfVxuXHRcdGlmIChjaHVuay5vcHRpb25zLnJlbW92ZWQpIHsgdGhpc1tjaHVuay5vcHRpb25zLnJlbW92ZWRdID0gW107IH1cblx0ICAgIH1cblx0fVxuXHR0aGlzLnVwZGF0ZVJvdXRlcygpO1xuICAgIH07XG5cbiAgICBiZWhhdmlvci51cGRhdGVSb3V0ZXMgPSBmdW5jdGlvbiAoKSB7XG5cdHZhciBuZXdSb3V0ZXMgPSBSb3V0ZS5lbXB0eUdlc3RhbHQ7XG5cdGZvciAodmFyIGkgPSAwOyBpIDwgY2h1bmtzLmxlbmd0aDsgaSsrKSB7XG5cdCAgICB2YXIgY2h1bmsgPSBjaHVua3NbaV07XG5cdCAgICBpZiAoY2h1bmsub3B0aW9ucy53aGVuLmNhbGwodGhpcykpIHtcblx0XHRzd2l0Y2ggKGNodW5rLmtpbmQpIHtcblx0XHRjYXNlICdyYXcnOlxuXHRcdCAgICBuZXdSb3V0ZXMgPSBuZXdSb3V0ZXMudW5pb24oY2h1bmsuZ2VzdGFsdEZuLmNhbGwodGhpcykpO1xuXHRcdCAgICBicmVhaztcblx0XHRjYXNlICdwYXJ0aWNpcGFudCc6XG5cdFx0ICAgIHZhciBwcm9qID0gY2h1bmsucmF3UHJvamVjdGlvbkZuLmNhbGwodGhpcyk7XG5cdFx0ICAgIHByb2plY3Rpb25zW2ldID0gcHJvajtcblx0XHQgICAgdmFyIGcgPSBSb3V0ZS5zaW1wbGVHZXN0YWx0KGNodW5rLnR5cGUgPT09ICdhZHZlcnRpc2UnLFxuXHRcdFx0XHRcdFx0Um91dGUucHJvamVjdGlvblRvUGF0dGVybihwcm9qKSxcblx0XHRcdFx0XHRcdGNodW5rLm9wdGlvbnMubWV0YUxldmVsLFxuXHRcdFx0XHRcdFx0MCk7XG5cdFx0ICAgIG5ld1JvdXRlcyA9IG5ld1JvdXRlcy51bmlvbihnKTtcblx0XHQgICAgYnJlYWs7XG5cdFx0Y2FzZSAnb2JzZXJ2ZXInOlxuXHRcdCAgICB2YXIgcHJvaiA9IGNodW5rLnJhd1Byb2plY3Rpb25Gbi5jYWxsKHRoaXMpO1xuXHRcdCAgICBwcm9qZWN0aW9uc1tpXSA9IHByb2o7XG5cdFx0ICAgIGNvbXBpbGVkUHJvamVjdGlvbnNbaV0gPSBSb3V0ZS5jb21waWxlUHJvamVjdGlvbihwcm9qKTtcblx0XHQgICAgdmFyIGcgPSBSb3V0ZS5zaW1wbGVHZXN0YWx0KGNodW5rLnR5cGUgPT09ICdvYnNlcnZlU3Vic2NyaWJlcnMnLFxuXHRcdFx0XHRcdFx0Um91dGUucHJvamVjdGlvblRvUGF0dGVybihwcm9qKSxcblx0XHRcdFx0XHRcdGNodW5rLm9wdGlvbnMubWV0YUxldmVsLFxuXHRcdFx0XHRcdFx0Y2h1bmsub3B0aW9ucy5sZXZlbCArIDEpO1xuXHRcdCAgICBuZXdSb3V0ZXMgPSBuZXdSb3V0ZXMudW5pb24oZyk7XG5cdFx0ICAgIGlmIChjaHVuay5vcHRpb25zLmFkZGVkIHx8IGNodW5rLm9wdGlvbnMucmVtb3ZlZCkge1xuXHRcdFx0cHJldmlvdXNPYmpzW2ldID0gUm91dGUuYXJyYXlUb1NldChbXSk7XG5cdFx0ICAgIH1cblx0XHQgICAgYnJlYWs7XG5cdFx0ZGVmYXVsdDpcblx0XHQgICAgdGhyb3cgbmV3IEVycm9yKFwiVW5zdXBwb3J0ZWQgY2h1bmsgdHlwZS9raW5kOiBcIitjaHVuay50eXBlK1wiL1wiK2NodW5rLmtpbmQpO1xuXHRcdH1cblx0ICAgIH1cblx0fVxuXHRXb3JsZC51cGRhdGVSb3V0ZXMoW25ld1JvdXRlc10pO1xuICAgIH07XG5cbiAgICBiZWhhdmlvci5oYW5kbGVFdmVudCA9IGZ1bmN0aW9uIChlKSB7XG5cdGlmIChvbGRIYW5kbGVFdmVudCkgeyBvbGRIYW5kbGVFdmVudC5jYWxsKHRoaXMsIGUpOyB9XG5cdGZvciAodmFyIGkgPSAwOyBpIDwgY2h1bmtzLmxlbmd0aDsgaSsrKSB7XG5cdCAgICB2YXIgY2h1bmsgPSBjaHVua3NbaV07XG5cdCAgICBzd2l0Y2ggKGNodW5rLmtpbmQpIHtcblx0ICAgIGNhc2UgJ3Jhdyc6XG5cdFx0Y2h1bmsuZXZlbnRIYW5kbGVyRm4uY2FsbCh0aGlzLCBlKTtcblx0XHRicmVhaztcblx0ICAgIGNhc2UgJ3BhcnRpY2lwYW50Jzpcblx0XHRpZiAoY2h1bmsuaGFuZGxlclxuXHRcdCAgICAmJiAoZS50eXBlID09PSAnbWVzc2FnZScpXG5cdFx0ICAgICYmIChlLm1ldGFMZXZlbCA9PT0gY2h1bmsub3B0aW9ucy5tZXRhTGV2ZWwpXG5cdFx0ICAgICYmIChlLmlzRmVlZGJhY2sgPT09IChjaHVuay50eXBlID09PSAnYWR2ZXJ0aXNlJykpKVxuXHRcdHtcblx0XHQgICAgdmFyIG1hdGNoUmVzdWx0ID0gUm91dGUubWF0Y2hQYXR0ZXJuKGUubWVzc2FnZSwgcHJvamVjdGlvbnNbaV0pO1xuXHRcdCAgICBpZiAobWF0Y2hSZXN1bHQpIHtcblx0XHRcdGt3QXBwbHkoY2h1bmsuaGFuZGxlciwgdGhpcywgbWF0Y2hSZXN1bHQpO1xuXHRcdCAgICB9XG5cdFx0fVxuXHRcdGJyZWFrO1xuXHQgICAgY2FzZSAnb2JzZXJ2ZXInOlxuXHRcdGlmIChlLnR5cGUgPT09ICdyb3V0ZXMnKSB7XG5cdFx0ICAgIHZhciBwcm9qZWN0aW9uUmVzdWx0ID0gZS5nZXN0YWx0LnByb2plY3QoY29tcGlsZWRQcm9qZWN0aW9uc1tpXSxcblx0XHRcdFx0XHRcdFx0ICAgICBjaHVuay50eXBlICE9PSAnb2JzZXJ2ZVN1YnNjcmliZXJzJyxcblx0XHRcdFx0XHRcdFx0ICAgICBjaHVuay5vcHRpb25zLm1ldGFMZXZlbCxcblx0XHRcdFx0XHRcdFx0ICAgICBjaHVuay5vcHRpb25zLmxldmVsKTtcblxuXHRcdCAgICB2YXIgaXNQcmVzZW50ID0gIVJvdXRlLmlzX2VtcHR5TWF0Y2hlcihwcm9qZWN0aW9uUmVzdWx0KTtcblx0XHQgICAgaWYgKGNodW5rLm9wdGlvbnMucHJlc2VuY2UpIHtcblx0XHRcdHRoaXNbY2h1bmsub3B0aW9ucy5wcmVzZW5jZV0gPSBpc1ByZXNlbnQ7XG5cdFx0ICAgIH1cblxuXHRcdCAgICB2YXIgb2JqcyA9IFtdO1xuXHRcdCAgICBpZiAoaXNQcmVzZW50KSB7XG5cdFx0XHR2YXIga2V5cyA9IFJvdXRlLm1hdGNoZXJLZXlzKHByb2plY3Rpb25SZXN1bHQpO1xuXHRcdFx0aWYgKGtleXMgPT09IG51bGwpIHtcblx0XHRcdCAgICBjb25zb2xlLndhcm4oXCJXaWxkY2FyZCBkZXRlY3RlZCB3aGlsZSBwcm9qZWN0aW5nIChcIlxuXHRcdFx0XHRcdCArSlNPTi5zdHJpbmdpZnkoY2h1bmsub3B0aW9ucykrXCIpXCIpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdCAgICBvYmpzID0gUm91dGUubWF0Y2hlcktleXNUb09iamVjdHMoa2V5cywgY29tcGlsZWRQcm9qZWN0aW9uc1tpXSk7XG5cdFx0XHQgICAgaWYgKGNodW5rLm9wdGlvbnMuc2V0KSB7XG5cdFx0XHRcdGZvciAodmFyIGogPSAwOyBqIDwgb2Jqcy5sZW5ndGg7IGorKykge1xuXHRcdFx0XHQgICAgb2Jqc1tqXSA9IGNodW5rLm9wdGlvbnMuc2V0LmNhbGwodGhpcywgb2Jqc1tqXSk7XG5cdFx0XHRcdH1cblx0XHRcdCAgICB9XG5cdFx0XHR9XG5cdFx0ICAgIH1cblx0XHQgICAgaWYgKGNodW5rLm9wdGlvbnMubmFtZSkge1xuXHRcdFx0dGhpc1tjaHVuay5vcHRpb25zLm5hbWVdID0gb2Jqcztcblx0XHQgICAgfVxuXG5cdFx0ICAgIGlmIChjaHVuay5vcHRpb25zLmFkZGVkIHx8IGNodW5rLm9wdGlvbnMucmVtb3ZlZCkge1xuXHRcdFx0dmFyIG9ialNldCA9IFJvdXRlLmFycmF5VG9TZXQob2Jqcyk7XG5cblx0XHRcdGlmIChjaHVuay5vcHRpb25zLmFkZGVkKSB7XG5cdFx0XHQgICAgdGhpc1tjaHVuay5vcHRpb25zLmFkZGVkXSA9XG5cdFx0XHRcdFJvdXRlLnNldFRvQXJyYXkoUm91dGUuc2V0U3VidHJhY3Qob2JqU2V0LCBwcmV2aW91c09ianNbaV0pKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGNodW5rLm9wdGlvbnMucmVtb3ZlZCkge1xuXHRcdFx0ICAgIHRoaXNbY2h1bmsub3B0aW9ucy5yZW1vdmVkXSA9XG5cdFx0XHRcdFJvdXRlLnNldFRvQXJyYXkoUm91dGUuc2V0U3VidHJhY3QocHJldmlvdXNPYmpzW2ldLCBvYmpTZXQpKTtcblx0XHRcdH1cblxuXHRcdFx0cHJldmlvdXNPYmpzW2ldID0gb2JqU2V0O1xuXHRcdCAgICB9XG5cblx0XHQgICAgaWYgKGNodW5rLmhhbmRsZXIpIHtcblx0XHRcdGNodW5rLmhhbmRsZXIuY2FsbCh0aGlzKTtcblx0XHQgICAgfVxuXHRcdH1cblx0XHRicmVhaztcblx0ICAgIGRlZmF1bHQ6XG5cdFx0dGhyb3cgbmV3IEVycm9yKFwiVW5zdXBwb3J0ZWQgY2h1bmsgdHlwZS9raW5kOiBcIitjaHVuay50eXBlK1wiL1wiK2NodW5rLmtpbmQpO1xuXHQgICAgfVxuXHR9XG4gICAgfTtcblxuICAgIHJldHVybiBiZWhhdmlvcjtcbn1cblxuZnVuY3Rpb24ga3dBcHBseShmLCB0aGlzQXJnLCBhcmdzKSB7XG4gICAgdmFyIGZvcm1hbHMgPSBSZWZsZWN0LmZvcm1hbFBhcmFtZXRlcnMoZik7XG4gICAgdmFyIGFjdHVhbHMgPSBbXVxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgZm9ybWFscy5sZW5ndGg7IGkrKykge1xuXHR2YXIgZm9ybWFsID0gZm9ybWFsc1tpXTtcblx0aWYgKCEoZm9ybWFsIGluIGFyZ3MpKSB7XG5cdCAgICB0aHJvdyBuZXcgRXJyb3IoXCJGdW5jdGlvbiBwYXJhbWV0ZXIgJ1wiK2Zvcm1hbCtcIicgbm90IHByZXNlbnQgaW4gYXJnc1wiKTtcblx0fVxuXHRhY3R1YWxzLnB1c2goYXJnc1tmb3JtYWxdKTtcbiAgICB9XG4gICAgcmV0dXJuIGYuYXBwbHkodGhpc0FyZywgYWN0dWFscyk7XG59XG5cbi8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuXG5tb2R1bGUuZXhwb3J0cy5BY3RvciA9IEFjdG9yO1xubW9kdWxlLmV4cG9ydHMua3dBcHBseSA9IGt3QXBwbHk7XG4iLCIvLyBXaXJlIHByb3RvY29sIHJlcHJlc2VudGF0aW9uIG9mIGV2ZW50cyBhbmQgYWN0aW9uc1xuXG52YXIgUm91dGUgPSByZXF1aXJlKFwiLi9yb3V0ZS5qc1wiKTtcblxuZnVuY3Rpb24gX2VuY29kZShlKSB7XG4gICAgc3dpdGNoIChlLnR5cGUpIHtcbiAgICBjYXNlIFwicm91dGVzXCI6XG5cdHJldHVybiBbXCJyb3V0ZXNcIiwgZS5nZXN0YWx0LnNlcmlhbGl6ZShmdW5jdGlvbiAodikgeyByZXR1cm4gdHJ1ZTsgfSldO1xuICAgIGNhc2UgXCJtZXNzYWdlXCI6XG5cdHJldHVybiBbXCJtZXNzYWdlXCIsIGUubWVzc2FnZSwgZS5tZXRhTGV2ZWwsIGUuaXNGZWVkYmFja107XG4gICAgfVxufVxuXG5mdW5jdGlvbiBfZGVjb2RlKHdoYXQpIHtcbiAgcmV0dXJuIGZ1bmN0aW9uIChqKSB7XG4gICAgc3dpdGNoIChqWzBdKSB7XG4gICAgY2FzZSBcInJvdXRlc1wiOlxuICAgICAgcmV0dXJuIE1pbmltYXJ0LnVwZGF0ZVJvdXRlcyhbXG5cdFJvdXRlLmRlc2VyaWFsaXplR2VzdGFsdChqWzFdLCBmdW5jdGlvbiAodikgeyByZXR1cm4gdHJ1ZTsgfSldKTtcbiAgICBjYXNlIFwibWVzc2FnZVwiOlxuICAgICAgcmV0dXJuIE1pbmltYXJ0LnNlbmRNZXNzYWdlKGpbMV0sIGpbMl0sIGpbM10pO1xuICAgIGRlZmF1bHQ6XG4gICAgICB0aHJvdyB7IG1lc3NhZ2U6IFwiSW52YWxpZCBKU09OLWVuY29kZWQgXCIgKyB3aGF0ICsgXCI6IFwiICsgSlNPTi5zdHJpbmdpZnkoaikgfTtcbiAgICB9XG4gIH07XG59XG5cbi8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuXG5tb2R1bGUuZXhwb3J0cy5lbmNvZGVFdmVudCA9IF9lbmNvZGU7XG5tb2R1bGUuZXhwb3J0cy5kZWNvZGVFdmVudCA9IF9kZWNvZGUoXCJldmVudFwiKTtcbm1vZHVsZS5leHBvcnRzLmVuY29kZUFjdGlvbiA9IF9lbmNvZGU7XG5tb2R1bGUuZXhwb3J0cy5kZWNvZGVBY3Rpb24gPSBfZGVjb2RlKFwiYWN0aW9uXCIpO1xuIiwiLy8gRE9NIGZyYWdtZW50IGRpc3BsYXkgZHJpdmVyXG52YXIgTWluaW1hcnQgPSByZXF1aXJlKFwiLi9taW5pbWFydC5qc1wiKTtcbnZhciBXb3JsZCA9IE1pbmltYXJ0LldvcmxkO1xudmFyIHN1YiA9IE1pbmltYXJ0LnN1YjtcbnZhciBwdWIgPSBNaW5pbWFydC5wdWI7XG52YXIgX18gPSBNaW5pbWFydC5fXztcbnZhciBfJCA9IE1pbmltYXJ0Ll8kO1xuXG5mdW5jdGlvbiBzcGF3bkRPTURyaXZlcihkb21XcmFwRnVuY3Rpb24sIGpRdWVyeVdyYXBGdW5jdGlvbikge1xuICAgIGRvbVdyYXBGdW5jdGlvbiA9IGRvbVdyYXBGdW5jdGlvbiB8fCBkZWZhdWx0V3JhcEZ1bmN0aW9uO1xuICAgIHZhciBkID0gbmV3IE1pbmltYXJ0LkRlbWFuZE1hdGNoZXIoZG9tV3JhcEZ1bmN0aW9uKF8kLCBfJCwgXyQpKTtcbiAgICBkLm9uRGVtYW5kSW5jcmVhc2UgPSBmdW5jdGlvbiAoY2FwdHVyZXMpIHtcblx0dmFyIHNlbGVjdG9yID0gY2FwdHVyZXNbMF07XG5cdHZhciBmcmFnbWVudENsYXNzID0gY2FwdHVyZXNbMV07XG5cdHZhciBmcmFnbWVudFNwZWMgPSBjYXB0dXJlc1syXTtcblx0V29ybGQuc3Bhd24obmV3IERPTUZyYWdtZW50KHNlbGVjdG9yLFxuXHRcdFx0XHQgICAgZnJhZ21lbnRDbGFzcyxcblx0XHRcdFx0ICAgIGZyYWdtZW50U3BlYyxcblx0XHRcdFx0ICAgIGRvbVdyYXBGdW5jdGlvbixcblx0XHRcdFx0ICAgIGpRdWVyeVdyYXBGdW5jdGlvbiksXG5cdFx0ICAgIFtzdWIoZG9tV3JhcEZ1bmN0aW9uKHNlbGVjdG9yLCBmcmFnbWVudENsYXNzLCBmcmFnbWVudFNwZWMpKSxcblx0XHQgICAgIHN1Yihkb21XcmFwRnVuY3Rpb24oc2VsZWN0b3IsIGZyYWdtZW50Q2xhc3MsIGZyYWdtZW50U3BlYyksIDAsIDEpXSk7XG4gICAgfTtcbiAgICBXb3JsZC5zcGF3bihkKTtcbn1cblxuZnVuY3Rpb24gZGVmYXVsdFdyYXBGdW5jdGlvbihzZWxlY3RvciwgZnJhZ21lbnRDbGFzcywgZnJhZ21lbnRTcGVjKSB7XG4gICAgcmV0dXJuIFtcIkRPTVwiLCBzZWxlY3RvciwgZnJhZ21lbnRDbGFzcywgZnJhZ21lbnRTcGVjXTtcbn1cblxuZnVuY3Rpb24gRE9NRnJhZ21lbnQoc2VsZWN0b3IsIGZyYWdtZW50Q2xhc3MsIGZyYWdtZW50U3BlYywgZG9tV3JhcEZ1bmN0aW9uLCBqUXVlcnlXcmFwRnVuY3Rpb24pIHtcbiAgICB0aGlzLnNlbGVjdG9yID0gc2VsZWN0b3I7XG4gICAgdGhpcy5mcmFnbWVudENsYXNzID0gZnJhZ21lbnRDbGFzcztcbiAgICB0aGlzLmZyYWdtZW50U3BlYyA9IGZyYWdtZW50U3BlYztcbiAgICB0aGlzLmRvbVdyYXBGdW5jdGlvbiA9IGRvbVdyYXBGdW5jdGlvbjtcbiAgICB0aGlzLmpRdWVyeVdyYXBGdW5jdGlvbiA9IGpRdWVyeVdyYXBGdW5jdGlvbjtcbiAgICB0aGlzLm5vZGVzID0gdGhpcy5idWlsZE5vZGVzKCk7XG59XG5cbkRPTUZyYWdtZW50LnByb3RvdHlwZS5ib290ID0gZnVuY3Rpb24gKCkge1xuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICB2YXIgbW9uaXRvcmluZyA9XG5cdHN1Yih0aGlzLmRvbVdyYXBGdW5jdGlvbihzZWxmLnNlbGVjdG9yLCBzZWxmLmZyYWdtZW50Q2xhc3MsIHNlbGYuZnJhZ21lbnRTcGVjKSwgMSwgMik7XG4gICAgV29ybGQuc3Bhd24obmV3IFdvcmxkKGZ1bmN0aW9uICgpIHtcblx0TWluaW1hcnQuSlF1ZXJ5LnNwYXduSlF1ZXJ5RHJpdmVyKHNlbGYuc2VsZWN0b3IrXCIgPiAuXCIrc2VsZi5mcmFnbWVudENsYXNzLFxuXHRcdFx0XHRcdCAgMSxcblx0XHRcdFx0XHQgIHNlbGYualF1ZXJ5V3JhcEZ1bmN0aW9uKTtcblx0V29ybGQuc3Bhd24oe1xuXHQgICAgaGFuZGxlRXZlbnQ6IGZ1bmN0aW9uIChlKSB7XG5cdFx0aWYgKGUudHlwZSA9PT0gXCJyb3V0ZXNcIikge1xuXHRcdCAgICB2YXIgbGV2ZWwgPSBlLmdlc3RhbHQuZ2V0TGV2ZWwoMSwgMCk7IC8vIGZpbmQgcGFydGljaXBhbnQgcGVlcnNcblx0XHQgICAgaWYgKCFlLmdlc3RhbHQuaXNFbXB0eSgpICYmIGxldmVsLmlzRW1wdHkoKSkge1xuXHRcdFx0V29ybGQuc2h1dGRvd25Xb3JsZCgpO1xuXHRcdCAgICB9XG5cdFx0fVxuXHQgICAgfVxuXHR9LCBbbW9uaXRvcmluZ10pO1xuICAgIH0pKTtcbn07XG5cbkRPTUZyYWdtZW50LnByb3RvdHlwZS5oYW5kbGVFdmVudCA9IGZ1bmN0aW9uIChlKSB7XG4gICAgaWYgKGUudHlwZSA9PT0gXCJyb3V0ZXNcIiAmJiBlLmdlc3RhbHQuaXNFbXB0eSgpKSB7XG5cdGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5ub2Rlcy5sZW5ndGg7IGkrKykge1xuXHQgICAgdmFyIG4gPSB0aGlzLm5vZGVzW2ldO1xuXHQgICAgbi5wYXJlbnROb2RlLnJlbW92ZUNoaWxkKG4pO1xuXHR9XG5cdFdvcmxkLmV4aXQoKTtcbiAgICB9XG59O1xuXG5mdW5jdGlvbiBpc0F0dHJpYnV0ZXMoeCkge1xuICAgIHJldHVybiBBcnJheS5pc0FycmF5KHgpICYmICgoeC5sZW5ndGggPT09IDApIHx8IEFycmF5LmlzQXJyYXkoeFswXSkpO1xufVxuXG5ET01GcmFnbWVudC5wcm90b3R5cGUuaW50ZXJwcmV0U3BlYyA9IGZ1bmN0aW9uIChzcGVjKSB7XG4gICAgLy8gRnJhZ21lbnQgc3BlY3MgYXJlIHJvdWdobHkgSlNPTi1lcXVpdmFsZW50cyBvZiBTWE1MLlxuICAgIC8vIHNwZWMgOjo9PSBbXCJ0YWdcIiwge1wiYXR0clwiOiBcInZhbHVlXCIsIC4uLn0sIHNwZWMsIHNwZWMsIC4uLl1cbiAgICAvLyAgICAgICAgIHwgW1widGFnXCIsIHNwZWMsIHNwZWMsIC4uLl1cbiAgICAvLyAgICAgICAgIHwgXCJjZGF0YVwiXG4gICAgaWYgKHR5cGVvZihzcGVjKSA9PT0gXCJzdHJpbmdcIiB8fCB0eXBlb2Yoc3BlYykgPT09IFwibnVtYmVyXCIpIHtcblx0cmV0dXJuIGRvY3VtZW50LmNyZWF0ZVRleHROb2RlKHNwZWMpO1xuICAgIH0gZWxzZSBpZiAoJC5pc0FycmF5KHNwZWMpKSB7XG5cdHZhciB0YWdOYW1lID0gc3BlY1swXTtcblx0dmFyIGhhc0F0dHJzID0gaXNBdHRyaWJ1dGVzKHNwZWNbMV0pO1xuXHR2YXIgYXR0cnMgPSBoYXNBdHRycyA/IHNwZWNbMV0gOiB7fTtcblx0dmFyIGtpZEluZGV4ID0gaGFzQXR0cnMgPyAyIDogMTtcblxuXHQvLyBXb3chIFN1Y2ggWFNTISBNYW55IGhhY2tzISBTbyB2dWxuZXJhYmlsaXR5ISBBbWF6ZSFcblx0dmFyIG4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KHRhZ05hbWUpO1xuXHRmb3IgKHZhciBpID0gMDsgaSA8IGF0dHJzLmxlbmd0aDsgaSsrKSB7XG5cdCAgICBuLnNldEF0dHJpYnV0ZShhdHRyc1tpXVswXSwgYXR0cnNbaV1bMV0pO1xuXHR9XG5cdGZvciAodmFyIGkgPSBraWRJbmRleDsgaSA8IHNwZWMubGVuZ3RoOyBpKyspIHtcblx0ICAgIG4uYXBwZW5kQ2hpbGQodGhpcy5pbnRlcnByZXRTcGVjKHNwZWNbaV0pKTtcblx0fVxuXHRyZXR1cm4gbjtcbiAgICB9XG59O1xuXG5ET01GcmFnbWVudC5wcm90b3R5cGUuYnVpbGROb2RlcyA9IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgdmFyIG5vZGVzID0gW107XG4gICAgJChzZWxmLnNlbGVjdG9yKS5lYWNoKGZ1bmN0aW9uIChpbmRleCwgZG9tTm9kZSkge1xuXHR2YXIgbiA9IHNlbGYuaW50ZXJwcmV0U3BlYyhzZWxmLmZyYWdtZW50U3BlYyk7XG5cdG4uY2xhc3NMaXN0LmFkZChzZWxmLmZyYWdtZW50Q2xhc3MpO1xuXHRkb21Ob2RlLmFwcGVuZENoaWxkKG4pO1xuXHRub2Rlcy5wdXNoKG4pO1xuICAgIH0pO1xuICAgIHJldHVybiBub2Rlcztcbn07XG5cbi8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuXG5tb2R1bGUuZXhwb3J0cy5zcGF3bkRPTURyaXZlciA9IHNwYXduRE9NRHJpdmVyO1xubW9kdWxlLmV4cG9ydHMuZGVmYXVsdFdyYXBGdW5jdGlvbiA9IGRlZmF1bHRXcmFwRnVuY3Rpb247XG4iLCIvKiBHcm91bmQgaW50ZXJmYWNlICovXG52YXIgTWluaW1hcnQgPSByZXF1aXJlKFwiLi9taW5pbWFydC5qc1wiKTtcbnZhciBXb3JsZCA9IE1pbmltYXJ0LldvcmxkO1xuXG5mdW5jdGlvbiBHcm91bmQoYm9vdEZuKSB7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIHRoaXMuc3RlcHBlcklkID0gbnVsbDtcbiAgICBXb3JsZC53aXRoV29ybGRTdGFjayhbW3RoaXMsIC0xXV0sIGZ1bmN0aW9uICgpIHtcblx0c2VsZi53b3JsZCA9IG5ldyBXb3JsZChib290Rm4pO1xuICAgIH0pO1xufVxuXG5Hcm91bmQucHJvdG90eXBlLnN0ZXAgPSBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIHJldHVybiBXb3JsZC53aXRoV29ybGRTdGFjayhbW3RoaXMsIC0xXV0sIGZ1bmN0aW9uICgpIHtcblx0cmV0dXJuIHNlbGYud29ybGQuc3RlcCgpO1xuICAgIH0pO1xufTtcblxuR3JvdW5kLnByb3RvdHlwZS5jaGVja1BpZCA9IGZ1bmN0aW9uIChwaWQpIHtcbiAgICBpZiAocGlkICE9PSAtMSkgY29uc29sZS5lcnJvcihcIldlaXJkIHBpZCBpbiBHcm91bmQgbWFya1BpZFJ1bm5hYmxlXCIsIHBpZCk7XG59O1xuXG5Hcm91bmQucHJvdG90eXBlLm1hcmtQaWRSdW5uYWJsZSA9IGZ1bmN0aW9uIChwaWQpIHtcbiAgICB0aGlzLmNoZWNrUGlkKHBpZCk7XG4gICAgdGhpcy5zdGFydFN0ZXBwaW5nKCk7XG59O1xuXG5Hcm91bmQucHJvdG90eXBlLnN0YXJ0U3RlcHBpbmcgPSBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIGlmICh0aGlzLnN0ZXBwZXJJZCkgcmV0dXJuO1xuICAgIGlmICh0aGlzLnN0ZXAoKSkge1xuXHR0aGlzLnN0ZXBwZXJJZCA9IHNldFRpbWVvdXQoZnVuY3Rpb24gKCkge1xuXHQgICAgc2VsZi5zdGVwcGVySWQgPSBudWxsO1xuXHQgICAgc2VsZi5zdGFydFN0ZXBwaW5nKCk7XG5cdH0sIDApO1xuICAgIH1cbn07XG5cbkdyb3VuZC5wcm90b3R5cGUuc3RvcFN0ZXBwaW5nID0gZnVuY3Rpb24gKCkge1xuICAgIGlmICh0aGlzLnN0ZXBwZXJJZCkge1xuXHRjbGVhclRpbWVvdXQodGhpcy5zdGVwcGVySWQpO1xuXHR0aGlzLnN0ZXBwZXJJZCA9IG51bGw7XG4gICAgfVxufTtcblxuR3JvdW5kLnByb3RvdHlwZS5lbnF1ZXVlQWN0aW9uID0gZnVuY3Rpb24gKHBpZCwgYWN0aW9uKSB7XG4gICAgdGhpcy5jaGVja1BpZChwaWQpO1xuICAgIGlmIChhY3Rpb24udHlwZSA9PT0gJ3JvdXRlcycpIHtcblx0aWYgKCFhY3Rpb24uZ2VzdGFsdC5pc0VtcHR5KCkpIHtcblx0ICAgIGNvbnNvbGUuZXJyb3IoXCJZb3UgaGF2ZSBzdWJzY3JpYmVkIHRvIGEgbm9uZXhpc3RlbnQgZXZlbnQgc291cmNlLlwiLFxuXHRcdFx0ICBhY3Rpb24uZ2VzdGFsdC5wcmV0dHkoKSk7XG5cdH1cbiAgICB9IGVsc2Uge1xuXHRjb25zb2xlLmVycm9yKFwiWW91IGhhdmUgc2VudCBhIG1lc3NhZ2UgaW50byB0aGUgb3V0ZXIgdm9pZC5cIiwgYWN0aW9uKTtcbiAgICB9XG59O1xuXG4vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cblxubW9kdWxlLmV4cG9ydHMuR3JvdW5kID0gR3JvdW5kO1xuIiwiLy8gSlF1ZXJ5IGV2ZW50IGRyaXZlclxudmFyIE1pbmltYXJ0ID0gcmVxdWlyZShcIi4vbWluaW1hcnQuanNcIik7XG52YXIgV29ybGQgPSBNaW5pbWFydC5Xb3JsZDtcbnZhciBzdWIgPSBNaW5pbWFydC5zdWI7XG52YXIgcHViID0gTWluaW1hcnQucHViO1xudmFyIF9fID0gTWluaW1hcnQuX187XG52YXIgXyQgPSBNaW5pbWFydC5fJDtcblxuZnVuY3Rpb24gc3Bhd25KUXVlcnlEcml2ZXIoYmFzZVNlbGVjdG9yLCBtZXRhTGV2ZWwsIHdyYXBGdW5jdGlvbikge1xuICAgIG1ldGFMZXZlbCA9IG1ldGFMZXZlbCB8fCAwO1xuICAgIHdyYXBGdW5jdGlvbiA9IHdyYXBGdW5jdGlvbiB8fCBkZWZhdWx0V3JhcEZ1bmN0aW9uO1xuICAgIHZhciBkID0gbmV3IE1pbmltYXJ0LkRlbWFuZE1hdGNoZXIod3JhcEZ1bmN0aW9uKF8kLCBfJCwgX18pLCBtZXRhTGV2ZWwsXG5cdFx0XHRcdCAgICAgICB7ZGVtYW5kU2lkZUlzU3Vic2NyaXB0aW9uOiB0cnVlfSk7XG4gICAgZC5vbkRlbWFuZEluY3JlYXNlID0gZnVuY3Rpb24gKGNhcHR1cmVzKSB7XG5cdHZhciBzZWxlY3RvciA9IGNhcHR1cmVzWzBdO1xuXHR2YXIgZXZlbnROYW1lID0gY2FwdHVyZXNbMV07XG5cdFdvcmxkLnNwYXduKG5ldyBKUXVlcnlFdmVudFJvdXRlcihiYXNlU2VsZWN0b3IsXG5cdFx0XHRcdFx0ICBzZWxlY3Rvcixcblx0XHRcdFx0XHQgIGV2ZW50TmFtZSxcblx0XHRcdFx0XHQgIG1ldGFMZXZlbCxcblx0XHRcdFx0XHQgIHdyYXBGdW5jdGlvbiksXG5cdFx0ICAgIFtwdWIod3JhcEZ1bmN0aW9uKHNlbGVjdG9yLCBldmVudE5hbWUsIF9fKSwgbWV0YUxldmVsKSxcblx0XHQgICAgIHB1Yih3cmFwRnVuY3Rpb24oc2VsZWN0b3IsIGV2ZW50TmFtZSwgX18pLCBtZXRhTGV2ZWwsIDEpXSk7XG4gICAgfTtcbiAgICBXb3JsZC5zcGF3bihkKTtcbn1cblxuZnVuY3Rpb24gZGVmYXVsdFdyYXBGdW5jdGlvbihzZWxlY3RvciwgZXZlbnROYW1lLCBldmVudFZhbHVlKSB7XG4gICAgcmV0dXJuIFtcImpRdWVyeVwiLCBzZWxlY3RvciwgZXZlbnROYW1lLCBldmVudFZhbHVlXTtcbn1cblxuZnVuY3Rpb24gSlF1ZXJ5RXZlbnRSb3V0ZXIoYmFzZVNlbGVjdG9yLCBzZWxlY3RvciwgZXZlbnROYW1lLCBtZXRhTGV2ZWwsIHdyYXBGdW5jdGlvbikge1xuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICB0aGlzLmJhc2VTZWxlY3RvciA9IGJhc2VTZWxlY3RvciB8fCBudWxsO1xuICAgIHRoaXMuc2VsZWN0b3IgPSBzZWxlY3RvcjtcbiAgICB0aGlzLmV2ZW50TmFtZSA9IGV2ZW50TmFtZTtcbiAgICB0aGlzLm1ldGFMZXZlbCA9IG1ldGFMZXZlbCB8fCAwO1xuICAgIHRoaXMud3JhcEZ1bmN0aW9uID0gd3JhcEZ1bmN0aW9uIHx8IGRlZmF1bHRXcmFwRnVuY3Rpb247XG4gICAgdGhpcy5wcmV2ZW50RGVmYXVsdCA9ICh0aGlzLmV2ZW50TmFtZS5jaGFyQXQoMCkgIT09IFwiK1wiKTtcbiAgICB0aGlzLmhhbmRsZXIgPVxuXHRXb3JsZC53cmFwKGZ1bmN0aW9uIChlKSB7XG5cdCAgICBXb3JsZC5zZW5kKHNlbGYud3JhcEZ1bmN0aW9uKHNlbGYuc2VsZWN0b3IsIHNlbGYuZXZlbnROYW1lLCBlKSwgc2VsZi5tZXRhTGV2ZWwpO1xuXHQgICAgaWYgKHNlbGYucHJldmVudERlZmF1bHQpIGUucHJldmVudERlZmF1bHQoKTtcblx0ICAgIHJldHVybiAhc2VsZi5wcmV2ZW50RGVmYXVsdDtcblx0fSk7XG4gICAgdGhpcy5jb21wdXRlTm9kZXMoKS5vbih0aGlzLnByZXZlbnREZWZhdWx0ID8gdGhpcy5ldmVudE5hbWUgOiB0aGlzLmV2ZW50TmFtZS5zdWJzdHJpbmcoMSksXG5cdFx0XHQgICB0aGlzLmhhbmRsZXIpO1xufVxuXG5KUXVlcnlFdmVudFJvdXRlci5wcm90b3R5cGUuaGFuZGxlRXZlbnQgPSBmdW5jdGlvbiAoZSkge1xuICAgIGlmIChlLnR5cGUgPT09IFwicm91dGVzXCIgJiYgZS5nZXN0YWx0LmlzRW1wdHkoKSkge1xuXHR0aGlzLmNvbXB1dGVOb2RlcygpLm9mZih0aGlzLmV2ZW50TmFtZSwgdGhpcy5oYW5kbGVyKTtcblx0V29ybGQuZXhpdCgpO1xuICAgIH1cbn07XG5cbkpRdWVyeUV2ZW50Um91dGVyLnByb3RvdHlwZS5jb21wdXRlTm9kZXMgPSBmdW5jdGlvbiAoKSB7XG4gICAgaWYgKHRoaXMuYmFzZVNlbGVjdG9yKSB7XG5cdHJldHVybiAkKHRoaXMuYmFzZVNlbGVjdG9yKS5jaGlsZHJlbih0aGlzLnNlbGVjdG9yKS5hZGRCYWNrKHRoaXMuc2VsZWN0b3IpO1xuICAgIH0gZWxzZSB7XG5cdHJldHVybiAkKHRoaXMuc2VsZWN0b3IpO1xuICAgIH1cbn07XG5cbmZ1bmN0aW9uIHNpbXBsaWZ5RE9NRXZlbnQoZSkge1xuICAgIHZhciBrZXlzID0gW107XG4gICAgZm9yICh2YXIgayBpbiBlKSB7XG5cdHZhciB2ID0gZVtrXTtcblx0aWYgKHR5cGVvZiB2ID09PSAnb2JqZWN0JykgY29udGludWU7XG5cdGlmICh0eXBlb2YgdiA9PT0gJ2Z1bmN0aW9uJykgY29udGludWU7XG5cdGtleXMucHVzaChrKTtcbiAgICB9XG4gICAga2V5cy5zb3J0KCk7XG4gICAgdmFyIHNpbXBsaWZpZWQgPSBbXTtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGtleXMubGVuZ3RoOyBpKyspIHtcblx0c2ltcGxpZmllZC5wdXNoKFtrZXlzW2ldLCBlW2tleXNbaV1dXSk7XG4gICAgfVxuICAgIHJldHVybiBzaW1wbGlmaWVkO1xufVxuXG4vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cblxubW9kdWxlLmV4cG9ydHMuc3Bhd25KUXVlcnlEcml2ZXIgPSBzcGF3bkpRdWVyeURyaXZlcjtcbm1vZHVsZS5leHBvcnRzLnNpbXBsaWZ5RE9NRXZlbnQgPSBzaW1wbGlmeURPTUV2ZW50O1xubW9kdWxlLmV4cG9ydHMuZGVmYXVsdFdyYXBGdW5jdGlvbiA9IGRlZmF1bHRXcmFwRnVuY3Rpb247XG4iLCJtb2R1bGUuZXhwb3J0cyA9IHJlcXVpcmUoXCIuL21pbmltYXJ0LmpzXCIpO1xuXG5tb2R1bGUuZXhwb3J0cy5ET00gPSByZXF1aXJlKFwiLi9kb20tZHJpdmVyLmpzXCIpO1xubW9kdWxlLmV4cG9ydHMuSlF1ZXJ5ID0gcmVxdWlyZShcIi4vanF1ZXJ5LWRyaXZlci5qc1wiKTtcbm1vZHVsZS5leHBvcnRzLlJvdXRpbmdUYWJsZVdpZGdldCA9IHJlcXVpcmUoXCIuL3JvdXRpbmctdGFibGUtd2lkZ2V0LmpzXCIpO1xubW9kdWxlLmV4cG9ydHMuV2ViU29ja2V0ID0gcmVxdWlyZShcIi4vd2Vic29ja2V0LWRyaXZlci5qc1wiKTtcbm1vZHVsZS5leHBvcnRzLlJlZmxlY3QgPSByZXF1aXJlKFwiLi9yZWZsZWN0LmpzXCIpO1xuXG5tb2R1bGUuZXhwb3J0cy5Hcm91bmQgPSByZXF1aXJlKFwiLi9ncm91bmQuanNcIikuR3JvdW5kO1xubW9kdWxlLmV4cG9ydHMuQWN0b3IgPSByZXF1aXJlKFwiLi9hY3Rvci5qc1wiKS5BY3Rvcjtcbm1vZHVsZS5leHBvcnRzLlNweSA9IHJlcXVpcmUoXCIuL3NweS5qc1wiKS5TcHk7XG5tb2R1bGUuZXhwb3J0cy5XYWtlRGV0ZWN0b3IgPSByZXF1aXJlKFwiLi93YWtlLWRldGVjdG9yLmpzXCIpLldha2VEZXRlY3RvcjtcblxudmFyIFdvcmtlciA9IHJlcXVpcmUoXCIuL3dvcmtlci5qc1wiKTtcbm1vZHVsZS5leHBvcnRzLldvcmtlciA9IFdvcmtlci5Xb3JrZXI7XG5tb2R1bGUuZXhwb3J0cy5Xb3JrZXJHcm91bmQgPSBXb3JrZXIuV29ya2VyR3JvdW5kO1xuIiwidmFyIFJvdXRlID0gcmVxdWlyZShcIi4vcm91dGUuanNcIik7XG52YXIgVXRpbCA9IHJlcXVpcmUoXCIuL3V0aWwuanNcIik7XG5cbi8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuXG4vLyBUT0RPOiB0cmlnZ2VyLWd1YXJkcyBhcyBwZXIgbWluaW1hcnRcblxuLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuLyogRXZlbnRzIGFuZCBBY3Rpb25zICovXG5cbnZhciBfXyA9IFJvdXRlLl9fO1xudmFyIF8kID0gUm91dGUuXyQ7XG5cbmZ1bmN0aW9uIHN1YihwYXR0ZXJuLCBtZXRhTGV2ZWwsIGxldmVsKSB7XG4gICAgcmV0dXJuIFJvdXRlLnNpbXBsZUdlc3RhbHQoZmFsc2UsIHBhdHRlcm4sIG1ldGFMZXZlbCwgbGV2ZWwpO1xufVxuXG5mdW5jdGlvbiBwdWIocGF0dGVybiwgbWV0YUxldmVsLCBsZXZlbCkge1xuICAgIHJldHVybiBSb3V0ZS5zaW1wbGVHZXN0YWx0KHRydWUsIHBhdHRlcm4sIG1ldGFMZXZlbCwgbGV2ZWwpO1xufVxuXG5mdW5jdGlvbiBzcGF3bihiZWhhdmlvciwgaW5pdGlhbEdlc3RhbHRzKSB7XG4gICAgcmV0dXJuIHsgdHlwZTogXCJzcGF3blwiLFxuXHQgICAgIGJlaGF2aW9yOiBiZWhhdmlvcixcblx0ICAgICBpbml0aWFsR2VzdGFsdDogUm91dGUuZ2VzdGFsdFVuaW9uKGluaXRpYWxHZXN0YWx0cyB8fCBbXSkgfTtcbn1cblxuZnVuY3Rpb24gdXBkYXRlUm91dGVzKGdlc3RhbHRzKSB7XG4gICAgcmV0dXJuIHsgdHlwZTogXCJyb3V0ZXNcIiwgZ2VzdGFsdDogUm91dGUuZ2VzdGFsdFVuaW9uKGdlc3RhbHRzKSB9O1xufVxuXG5mdW5jdGlvbiBwZW5kaW5nUm91dGluZ1VwZGF0ZShhZ2dyZWdhdGUsIGFmZmVjdGVkU3ViZ2VzdGFsdCwga25vd25UYXJnZXQpIHtcbiAgICByZXR1cm4geyB0eXBlOiBcInBlbmRpbmdSb3V0aW5nVXBkYXRlXCIsXG5cdCAgICAgYWdncmVnYXRlOiBhZ2dyZWdhdGUsXG5cdCAgICAgYWZmZWN0ZWRTdWJnZXN0YWx0OiBhZmZlY3RlZFN1Ymdlc3RhbHQsXG5cdCAgICAga25vd25UYXJnZXQ6IGtub3duVGFyZ2V0IH07XG59XG5cbmZ1bmN0aW9uIHNlbmRNZXNzYWdlKG0sIG1ldGFMZXZlbCwgaXNGZWVkYmFjaykge1xuICAgIHJldHVybiB7IHR5cGU6IFwibWVzc2FnZVwiLFxuXHQgICAgIG1ldGFMZXZlbDogKG1ldGFMZXZlbCA9PT0gdW5kZWZpbmVkKSA/IDAgOiBtZXRhTGV2ZWwsXG5cdCAgICAgbWVzc2FnZTogbSxcblx0ICAgICBpc0ZlZWRiYWNrOiAoaXNGZWVkYmFjayA9PT0gdW5kZWZpbmVkKSA/IGZhbHNlIDogaXNGZWVkYmFjayB9O1xufVxuXG5mdW5jdGlvbiBzaHV0ZG93bldvcmxkKCkge1xuICAgIHJldHVybiB7IHR5cGU6IFwic2h1dGRvd25Xb3JsZFwiIH07XG59XG5cbi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cbi8qIENvbmZpZ3VyYXRpb25zICovXG5cbmZ1bmN0aW9uIFdvcmxkKGJvb3RGbikge1xuICAgIHRoaXMuYWxpdmUgPSB0cnVlO1xuICAgIHRoaXMuZXZlbnRRdWV1ZSA9IFtdO1xuICAgIHRoaXMucnVubmFibGVQaWRzID0ge307XG4gICAgdGhpcy5wYXJ0aWFsR2VzdGFsdCA9IFJvdXRlLmVtcHR5R2VzdGFsdDsgLy8gT25seSBnZXN0YWx0IGZyb20gbG9jYWwgcHJvY2Vzc2VzXG4gICAgdGhpcy5mdWxsR2VzdGFsdCA9IFJvdXRlLmVtcHR5R2VzdGFsdCA7OyAvLyBwYXJ0aWFsR2VzdGFsdCB1bmlvbmVkIHdpdGggZG93bndhcmRHZXN0YWx0XG4gICAgdGhpcy5wcm9jZXNzVGFibGUgPSB7fTtcbiAgICB0aGlzLnRvbWJzdG9uZXMgPSB7fTtcbiAgICB0aGlzLmRvd253YXJkR2VzdGFsdCA9IFJvdXRlLmVtcHR5R2VzdGFsdDtcbiAgICB0aGlzLnByb2Nlc3NBY3Rpb25zID0gW107XG4gICAgdGhpcy5hc0NoaWxkKC0xLCBib290Rm4sIHRydWUpO1xufVxuXG4vKiBDbGFzcyBzdGF0ZSAvIG1ldGhvZHMgKi9cblxuV29ybGQubmV4dFBpZCA9IDA7XG5cbldvcmxkLnN0YWNrID0gW107XG5cbldvcmxkLmN1cnJlbnQgPSBmdW5jdGlvbiAoKSB7XG4gICAgcmV0dXJuIFdvcmxkLnN0YWNrW1dvcmxkLnN0YWNrLmxlbmd0aCAtIDFdWzBdO1xufTtcblxuV29ybGQuYWN0aXZlUGlkID0gZnVuY3Rpb24gKCkge1xuICAgIHJldHVybiBXb3JsZC5zdGFja1tXb3JsZC5zdGFjay5sZW5ndGggLSAxXVsxXTtcbn07XG5cbldvcmxkLnNlbmQgPSBmdW5jdGlvbiAobSwgbWV0YUxldmVsLCBpc0ZlZWRiYWNrKSB7XG4gICAgV29ybGQuY3VycmVudCgpLmVucXVldWVBY3Rpb24oV29ybGQuYWN0aXZlUGlkKCksIHNlbmRNZXNzYWdlKG0sIG1ldGFMZXZlbCwgaXNGZWVkYmFjaykpO1xufTtcblxuV29ybGQudXBkYXRlUm91dGVzID0gZnVuY3Rpb24gKGdlc3RhbHRzKSB7XG4gICAgV29ybGQuY3VycmVudCgpLmVucXVldWVBY3Rpb24oV29ybGQuYWN0aXZlUGlkKCksIHVwZGF0ZVJvdXRlcyhnZXN0YWx0cykpO1xufTtcblxuV29ybGQuc3Bhd24gPSBmdW5jdGlvbiAoYmVoYXZpb3IsIGluaXRpYWxHZXN0YWx0cykge1xuICAgIFdvcmxkLmN1cnJlbnQoKS5lbnF1ZXVlQWN0aW9uKFdvcmxkLmFjdGl2ZVBpZCgpLCBzcGF3bihiZWhhdmlvciwgaW5pdGlhbEdlc3RhbHRzKSk7XG59O1xuXG5Xb3JsZC5leGl0ID0gZnVuY3Rpb24gKGV4bikge1xuICAgIFdvcmxkLmN1cnJlbnQoKS5raWxsKFdvcmxkLmFjdGl2ZVBpZCgpLCBleG4pO1xufTtcblxuV29ybGQuc2h1dGRvd25Xb3JsZCA9IGZ1bmN0aW9uICgpIHtcbiAgICBXb3JsZC5jdXJyZW50KCkuZW5xdWV1ZUFjdGlvbihXb3JsZC5hY3RpdmVQaWQoKSwgc2h1dGRvd25Xb3JsZCgpKTtcbn07XG5cbldvcmxkLndpdGhXb3JsZFN0YWNrID0gZnVuY3Rpb24gKHN0YWNrLCBmKSB7XG4gICAgdmFyIG9sZFN0YWNrID0gV29ybGQuc3RhY2s7XG4gICAgV29ybGQuc3RhY2sgPSBzdGFjaztcbiAgICB2YXIgcmVzdWx0ID0gbnVsbDtcbiAgICB0cnkge1xuXHRyZXN1bHQgPSBmKCk7XG4gICAgfSBjYXRjaCAoZSkge1xuXHRXb3JsZC5zdGFjayA9IG9sZFN0YWNrO1xuXHR0aHJvdyBlO1xuICAgIH1cbiAgICBXb3JsZC5zdGFjayA9IG9sZFN0YWNrO1xuICAgIHJldHVybiByZXN1bHQ7XG59O1xuXG5Xb3JsZC53cmFwID0gZnVuY3Rpb24gKGYpIHtcbiAgICB2YXIgc2F2ZWRTdGFjayA9IFdvcmxkLnN0YWNrLnNsaWNlKCk7XG4gICAgcmV0dXJuIGZ1bmN0aW9uICgpIHtcblx0dmFyIGFjdHVhbHMgPSBhcmd1bWVudHM7XG5cdHJldHVybiBXb3JsZC53aXRoV29ybGRTdGFjayhzYXZlZFN0YWNrLCBmdW5jdGlvbiAoKSB7XG5cdCAgICB2YXIgcmVzdWx0ID0gV29ybGQuY3VycmVudCgpLmFzQ2hpbGQoV29ybGQuYWN0aXZlUGlkKCksIGZ1bmN0aW9uICgpIHtcblx0XHRyZXR1cm4gZi5hcHBseShudWxsLCBhY3R1YWxzKTtcblx0ICAgIH0pO1xuXHQgICAgZm9yICh2YXIgaSA9IFdvcmxkLnN0YWNrLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG5cdFx0V29ybGQuc3RhY2tbaV1bMF0ubWFya1BpZFJ1bm5hYmxlKFdvcmxkLnN0YWNrW2ldWzFdKTtcblx0ICAgIH1cblx0ICAgIHJldHVybiByZXN1bHQ7XG5cdH0pO1xuICAgIH07XG59O1xuXG4vKiBJbnN0YW5jZSBtZXRob2RzICovXG5cbldvcmxkLnByb3RvdHlwZS5lbnF1ZXVlQWN0aW9uID0gZnVuY3Rpb24gKHBpZCwgYWN0aW9uKSB7XG4gICAgdGhpcy5wcm9jZXNzQWN0aW9ucy5wdXNoKFtwaWQsIGFjdGlvbl0pO1xufTtcblxuLy8gVGhlIGNvZGUgaXMgd3JpdHRlbiB0byBtYWludGFpbiB0aGUgcnVubmFibGVQaWRzIHNldCBjYXJlZnVsbHksIHRvXG4vLyBlbnN1cmUgd2UgY2FuIGxvY2FsbHkgZGVjaWRlIHdoZXRoZXIgd2UncmUgaW5lcnQgb3Igbm90IHdpdGhvdXRcbi8vIGhhdmluZyB0byBzZWFyY2ggdGhlIHdob2xlIGRlZXAgcHJvY2VzcyB0cmVlLlxuV29ybGQucHJvdG90eXBlLmlzSW5lcnQgPSBmdW5jdGlvbiAoKSB7XG4gICAgcmV0dXJuIHRoaXMuZXZlbnRRdWV1ZS5sZW5ndGggPT09IDBcblx0JiYgdGhpcy5wcm9jZXNzQWN0aW9ucy5sZW5ndGggPT09IDBcblx0JiYgUm91dGUuaXNfZW1wdHlTZXQodGhpcy5ydW5uYWJsZVBpZHMpO1xufTtcblxuV29ybGQucHJvdG90eXBlLm1hcmtQaWRSdW5uYWJsZSA9IGZ1bmN0aW9uIChwaWQpIHtcbiAgICB0aGlzLnJ1bm5hYmxlUGlkc1twaWRdID0gW3BpZF07XG59O1xuXG5Xb3JsZC5wcm90b3R5cGUuc3RlcCA9IGZ1bmN0aW9uICgpIHtcbiAgICB0aGlzLmRpc3BhdGNoRXZlbnRzKCk7XG4gICAgdGhpcy5wZXJmb3JtQWN0aW9ucygpO1xuICAgIHRoaXMuc3RlcENoaWxkcmVuKCk7XG4gICAgcmV0dXJuIHRoaXMuYWxpdmUgJiYgIXRoaXMuaXNJbmVydCgpO1xufTtcblxuV29ybGQucHJvdG90eXBlLmFzQ2hpbGQgPSBmdW5jdGlvbiAocGlkLCBmLCBvbWl0TGl2ZW5lc3NDaGVjaykge1xuICAgIGlmICghKHBpZCBpbiB0aGlzLnByb2Nlc3NUYWJsZSkgJiYgIW9taXRMaXZlbmVzc0NoZWNrKSB7XG5cdGNvbnNvbGUud2FybihcIldvcmxkLmFzQ2hpbGQgZWxpZGluZyBpbnZvY2F0aW9uIG9mIGRlYWQgcHJvY2Vzc1wiLCBwaWQpO1xuXHRyZXR1cm47XG4gICAgfVxuXG4gICAgV29ybGQuc3RhY2sucHVzaChbdGhpcywgcGlkXSk7XG4gICAgdmFyIHJlc3VsdCA9IG51bGw7XG4gICAgdHJ5IHtcblx0cmVzdWx0ID0gZigpO1xuICAgIH0gY2F0Y2ggKGUpIHtcblx0dGhpcy5raWxsKHBpZCwgZSk7XG4gICAgfVxuICAgIGlmIChXb3JsZC5zdGFjay5wb3AoKVswXSAhPT0gdGhpcykge1xuXHR0aHJvdyBuZXcgRXJyb3IoXCJJbnRlcm5hbCBlcnJvcjogV29ybGQgc3RhY2sgaW1iYWxhbmNlXCIpO1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xufTtcblxuV29ybGQucHJvdG90eXBlLmtpbGwgPSBmdW5jdGlvbiAocGlkLCBleG4pIHtcbiAgICBpZiAoZXhuICYmIGV4bi5zdGFjaykge1xuXHRjb25zb2xlLmxvZyhcIlByb2Nlc3MgZXhpdGVkXCIsIHBpZCwgZXhuLCBleG4uc3RhY2spO1xuICAgIH0gZWxzZSB7XG5cdGNvbnNvbGUubG9nKFwiUHJvY2VzcyBleGl0ZWRcIiwgcGlkLCBleG4pO1xuICAgIH1cbiAgICB2YXIgcCA9IHRoaXMucHJvY2Vzc1RhYmxlW3BpZF07XG4gICAgaWYgKHAgJiYgcC5iZWhhdmlvci50cmFwZXhpdCkge1xuXHR0aGlzLmFzQ2hpbGQocGlkLCBmdW5jdGlvbiAoKSB7IHJldHVybiBwLmJlaGF2aW9yLnRyYXBleGl0KGV4bik7IH0pO1xuICAgIH1cbiAgICBkZWxldGUgdGhpcy5wcm9jZXNzVGFibGVbcGlkXTtcbiAgICBpZiAocCkge1xuXHRpZiAoZXhuKSB7XG5cdCAgICBwLmV4aXRSZWFzb24gPSBleG47XG5cdCAgICB0aGlzLnRvbWJzdG9uZXNbcGlkXSA9IHA7XG5cdH1cblx0dGhpcy5hcHBseUFuZElzc3VlUm91dGluZ1VwZGF0ZShwLmdlc3RhbHQsIFJvdXRlLmVtcHR5R2VzdGFsdCk7XG4gICAgfVxufTtcblxuV29ybGQucHJvdG90eXBlLnN0ZXBDaGlsZHJlbiA9IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgcGlkcyA9IHRoaXMucnVubmFibGVQaWRzO1xuICAgIHRoaXMucnVubmFibGVQaWRzID0ge307XG4gICAgZm9yICh2YXIgcGlkIGluIHBpZHMpIHtcblx0dmFyIHAgPSB0aGlzLnByb2Nlc3NUYWJsZVtwaWRdO1xuXHRpZiAocCAmJiBwLmJlaGF2aW9yLnN0ZXAgLyogZXhpc3RzLCBoYXZlbid0IGNhbGxlZCBpdCB5ZXQgKi8pIHtcblx0ICAgIHZhciBjaGlsZEJ1c3kgPSB0aGlzLmFzQ2hpbGQocGlkIHwgMCwgZnVuY3Rpb24gKCkgeyByZXR1cm4gcC5iZWhhdmlvci5zdGVwKCkgfSk7XG5cdCAgICBpZiAoY2hpbGRCdXN5KSB0aGlzLm1hcmtQaWRSdW5uYWJsZShwaWQpO1xuXHR9XG4gICAgfVxufTtcblxuV29ybGQucHJvdG90eXBlLnBlcmZvcm1BY3Rpb25zID0gZnVuY3Rpb24gKCkge1xuICAgIHZhciBxdWV1ZSA9IHRoaXMucHJvY2Vzc0FjdGlvbnM7XG4gICAgdGhpcy5wcm9jZXNzQWN0aW9ucyA9IFtdO1xuICAgIHZhciBpdGVtO1xuICAgIHdoaWxlICgoaXRlbSA9IHF1ZXVlLnNoaWZ0KCkpICYmIHRoaXMuYWxpdmUpIHtcblx0dGhpcy5wZXJmb3JtQWN0aW9uKGl0ZW1bMF0sIGl0ZW1bMV0pO1xuICAgIH1cbn07XG5cbldvcmxkLnByb3RvdHlwZS5kaXNwYXRjaEV2ZW50cyA9IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgcXVldWUgPSB0aGlzLmV2ZW50UXVldWU7XG4gICAgdGhpcy5ldmVudFF1ZXVlID0gW107XG4gICAgdmFyIGl0ZW07XG4gICAgd2hpbGUgKChpdGVtID0gcXVldWUuc2hpZnQoKSkpIHtcblx0dGhpcy5kaXNwYXRjaEV2ZW50KGl0ZW0pO1xuICAgIH1cbn07XG5cbldvcmxkLnByb3RvdHlwZS5wZXJmb3JtQWN0aW9uID0gZnVuY3Rpb24gKHBpZCwgYWN0aW9uKSB7XG4gICAgc3dpdGNoIChhY3Rpb24udHlwZSkge1xuICAgIGNhc2UgXCJzcGF3blwiOlxuXHR2YXIgcGlkID0gV29ybGQubmV4dFBpZCsrO1xuXHR2YXIgbmV3R2VzdGFsdCA9IGFjdGlvbi5pbml0aWFsR2VzdGFsdC5sYWJlbChwaWQpO1xuXHR0aGlzLnByb2Nlc3NUYWJsZVtwaWRdID0geyBnZXN0YWx0OiBuZXdHZXN0YWx0LCBiZWhhdmlvcjogYWN0aW9uLmJlaGF2aW9yIH07XG5cdGlmIChhY3Rpb24uYmVoYXZpb3IuYm9vdCkge1xuXHQgICAgdGhpcy5hc0NoaWxkKHBpZCwgZnVuY3Rpb24gKCkgeyBhY3Rpb24uYmVoYXZpb3IuYm9vdCgpIH0pO1xuXHQgICAgdGhpcy5tYXJrUGlkUnVubmFibGUocGlkKTtcblx0fVxuXHR0aGlzLmFwcGx5QW5kSXNzdWVSb3V0aW5nVXBkYXRlKFJvdXRlLmVtcHR5R2VzdGFsdCwgbmV3R2VzdGFsdCwgcGlkKTtcblx0YnJlYWs7XG4gICAgY2FzZSBcInJvdXRlc1wiOlxuXHRpZiAocGlkIGluIHRoaXMucHJvY2Vzc1RhYmxlKSB7XG5cdCAgICAvLyBpdCBtYXkgbm90IGJlOiB0aGlzIG1pZ2h0IGJlIHRoZSByb3V0aW5nIHVwZGF0ZSBmcm9tIGFcblx0ICAgIC8vIGtpbGwgb2YgdGhlIHByb2Nlc3Ncblx0ICAgIHZhciBvbGRHZXN0YWx0ID0gdGhpcy5wcm9jZXNzVGFibGVbcGlkXS5nZXN0YWx0O1xuXHQgICAgdmFyIG5ld0dlc3RhbHQgPSBhY3Rpb24uZ2VzdGFsdC5sYWJlbChwaWR8MCk7XG5cdCAgICAvLyBeIHBpZHwwOiBjb252ZXJ0IHBpZCBmcm9tIHN0cmluZyAodGFibGUga2V5ISkgdG8gaW50ZWdlclxuXHQgICAgdGhpcy5wcm9jZXNzVGFibGVbcGlkXS5nZXN0YWx0ID0gbmV3R2VzdGFsdDtcblx0ICAgIHRoaXMuYXBwbHlBbmRJc3N1ZVJvdXRpbmdVcGRhdGUob2xkR2VzdGFsdCwgbmV3R2VzdGFsdCwgcGlkKTtcblx0fVxuXHRicmVhaztcbiAgICBjYXNlIFwibWVzc2FnZVwiOlxuXHRpZiAoYWN0aW9uLm1ldGFMZXZlbCA9PT0gMCkge1xuXHQgICAgdGhpcy5ldmVudFF1ZXVlLnB1c2goYWN0aW9uKTtcblx0fSBlbHNlIHtcblx0ICAgIFdvcmxkLnNlbmQoYWN0aW9uLm1lc3NhZ2UsIGFjdGlvbi5tZXRhTGV2ZWwgLSAxLCBhY3Rpb24uaXNGZWVkYmFjayk7XG5cdH1cblx0YnJlYWs7XG4gICAgY2FzZSBcInNodXRkb3duV29ybGRcIjpcblx0dGhpcy5hbGl2ZSA9IGZhbHNlOyAvLyBmb3JjZSB1cyB0byBzdG9wIGRvaW5nIHRoaW5ncyBpbW1lZGlhdGVseVxuXHRXb3JsZC5leGl0KCk7XG5cdGJyZWFrO1xuICAgIGRlZmF1bHQ6XG5cdHZhciBleG4gPSBuZXcgRXJyb3IoXCJBY3Rpb24gdHlwZSBcIiArIGFjdGlvbi50eXBlICsgXCIgbm90IHVuZGVyc3Rvb2RcIik7XG5cdGV4bi5hY3Rpb24gPSBhY3Rpb247XG5cdHRocm93IGV4bjtcbiAgICB9XG59O1xuXG5Xb3JsZC5wcm90b3R5cGUudXBkYXRlRnVsbEdlc3RhbHQgPSBmdW5jdGlvbiAoKSB7XG4gICAgdGhpcy5mdWxsR2VzdGFsdCA9IHRoaXMucGFydGlhbEdlc3RhbHQudW5pb24odGhpcy5kb3dud2FyZEdlc3RhbHQpO1xufTtcblxuV29ybGQucHJvdG90eXBlLmlzc3VlTG9jYWxSb3V0aW5nVXBkYXRlID0gZnVuY3Rpb24gKGFmZmVjdGVkU3ViZ2VzdGFsdCwga25vd25UYXJnZXQpIHtcbiAgICB0aGlzLmV2ZW50UXVldWUucHVzaChwZW5kaW5nUm91dGluZ1VwZGF0ZSh0aGlzLmZ1bGxHZXN0YWx0LFxuXHRcdFx0XHRcdCAgICAgIGFmZmVjdGVkU3ViZ2VzdGFsdCxcblx0XHRcdFx0XHQgICAgICBrbm93blRhcmdldCkpO1xufTtcblxuV29ybGQucHJvdG90eXBlLmFwcGx5QW5kSXNzdWVSb3V0aW5nVXBkYXRlID0gZnVuY3Rpb24gKG9sZGcsIG5ld2csIGtub3duVGFyZ2V0KSB7XG4gICAga25vd25UYXJnZXQgPSB0eXBlb2Yga25vd25UYXJnZXQgPT09ICd1bmRlZmluZWQnID8gbnVsbCA6IGtub3duVGFyZ2V0O1xuICAgIHRoaXMucGFydGlhbEdlc3RhbHQgPSB0aGlzLnBhcnRpYWxHZXN0YWx0LmVyYXNlUGF0aChvbGRnKS51bmlvbihuZXdnKTtcbiAgICB0aGlzLnVwZGF0ZUZ1bGxHZXN0YWx0KCk7XG4gICAgdGhpcy5pc3N1ZUxvY2FsUm91dGluZ1VwZGF0ZShvbGRnLnVuaW9uKG5ld2cpLCBrbm93blRhcmdldCk7XG4gICAgV29ybGQudXBkYXRlUm91dGVzKFt0aGlzLnBhcnRpYWxHZXN0YWx0LmRyb3AoKV0pO1xufTtcblxuV29ybGQucHJvdG90eXBlLmRpc3BhdGNoRXZlbnQgPSBmdW5jdGlvbiAoZSkge1xuICAgIHN3aXRjaCAoZS50eXBlKSB7XG4gICAgY2FzZSBcInBlbmRpbmdSb3V0aW5nVXBkYXRlXCI6XG5cdHZhciBwaWRzID0gZS5hZmZlY3RlZFN1Ymdlc3RhbHQubWF0Y2goZS5hZ2dyZWdhdGUpO1xuXHRpZiAoZS5rbm93blRhcmdldCAhPT0gbnVsbCkgcGlkcy51bnNoaWZ0KGUua25vd25UYXJnZXQpO1xuXHRmb3IgKHZhciBpID0gMDsgaSA8IHBpZHMubGVuZ3RoOyBpKyspIHtcblx0ICAgIHZhciBwaWQgPSBwaWRzW2ldO1xuXHQgICAgaWYgKHBpZCA9PT0gXCJvdXRcIikgY29uc29sZS53YXJuKFwiV291bGQgaGF2ZSBkZWxpdmVyZWQgYSByb3V0aW5nIHVwZGF0ZSB0byBlbnZpcm9ubWVudFwiKTtcblx0ICAgIHZhciBwID0gdGhpcy5wcm9jZXNzVGFibGVbcGlkXTtcblx0ICAgIGlmIChwKSB7XG5cdFx0dmFyIGcgPSBlLmFnZ3JlZ2F0ZS5maWx0ZXIocC5nZXN0YWx0KTtcblx0XHR0aGlzLmFzQ2hpbGQocGlkLCBmdW5jdGlvbiAoKSB7IHAuYmVoYXZpb3IuaGFuZGxlRXZlbnQodXBkYXRlUm91dGVzKFtnXSkpIH0pO1xuXHRcdHRoaXMubWFya1BpZFJ1bm5hYmxlKHBpZCk7XG5cdCAgICB9XG5cdH1cblx0YnJlYWs7XG5cbiAgICBjYXNlIFwibWVzc2FnZVwiOlxuXHR2YXIgcGlkcyA9IHRoaXMucGFydGlhbEdlc3RhbHQubWF0Y2hWYWx1ZShlLm1lc3NhZ2UsIGUubWV0YUxldmVsLCBlLmlzRmVlZGJhY2spO1xuXHRmb3IgKHZhciBpID0gMDsgaSA8IHBpZHMubGVuZ3RoOyBpKyspIHtcblx0ICAgIHZhciBwaWQgPSBwaWRzW2ldO1xuXHQgICAgdmFyIHAgPSB0aGlzLnByb2Nlc3NUYWJsZVtwaWRdO1xuXHQgICAgdGhpcy5hc0NoaWxkKHBpZCwgZnVuY3Rpb24gKCkgeyBwLmJlaGF2aW9yLmhhbmRsZUV2ZW50KGUpIH0pO1xuXHQgICAgdGhpcy5tYXJrUGlkUnVubmFibGUocGlkKTtcblx0fVxuXHRicmVhaztcblxuICAgIGRlZmF1bHQ6XG5cdHZhciBleG4gPSBuZXcgRXJyb3IoXCJFdmVudCB0eXBlIFwiICsgZS50eXBlICsgXCIgbm90IGRpc3BhdGNoYWJsZVwiKTtcblx0ZXhuLmV2ZW50ID0gZTtcblx0dGhyb3cgZXhuO1xuICAgIH1cbn07XG5cbldvcmxkLnByb3RvdHlwZS5oYW5kbGVFdmVudCA9IGZ1bmN0aW9uIChlKSB7XG4gICAgc3dpdGNoIChlLnR5cGUpIHtcbiAgICBjYXNlIFwicm91dGVzXCI6XG5cdHZhciBvbGREb3dud2FyZCA9IHRoaXMuZG93bndhcmRHZXN0YWx0O1xuXHR0aGlzLmRvd253YXJkR2VzdGFsdCA9IGUuZ2VzdGFsdC5sYWJlbChcIm91dFwiKS5saWZ0KCk7XG5cdHRoaXMudXBkYXRlRnVsbEdlc3RhbHQoKTtcblx0dGhpcy5pc3N1ZUxvY2FsUm91dGluZ1VwZGF0ZShvbGREb3dud2FyZC51bmlvbih0aGlzLmRvd253YXJkR2VzdGFsdCksIG51bGwpO1xuXHRicmVhaztcbiAgICBjYXNlIFwibWVzc2FnZVwiOlxuXHR0aGlzLmV2ZW50UXVldWUucHVzaChzZW5kTWVzc2FnZShlLm1lc3NhZ2UsIGUubWV0YUxldmVsICsgMSwgZS5pc0ZlZWRiYWNrKSk7XG5cdGJyZWFrO1xuICAgIGRlZmF1bHQ6XG5cdHZhciBleG4gPSBuZXcgRXJyb3IoXCJFdmVudCB0eXBlIFwiICsgZS50eXBlICsgXCIgbm90IHVuZGVyc3Rvb2RcIik7XG5cdGV4bi5ldmVudCA9IGU7XG5cdHRocm93IGV4bjtcbiAgICB9XG59O1xuXG4vKiBEZWJ1Z2dpbmcsIG1hbmFnZW1lbnQsIGFuZCBtb25pdG9yaW5nICovXG5cbldvcmxkLnByb3RvdHlwZS5wcm9jZXNzVHJlZSA9IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIga2lkcyA9IFtdO1xuICAgIGZvciAodmFyIHBpZCBpbiB0aGlzLnByb2Nlc3NUYWJsZSkge1xuXHR2YXIgcCA9IHRoaXMucHJvY2Vzc1RhYmxlW3BpZF07XG5cdGlmIChwLmJlaGF2aW9yIGluc3RhbmNlb2YgV29ybGQpIHtcblx0ICAgIGtpZHMucHVzaChbcGlkLCBwLmJlaGF2aW9yLnByb2Nlc3NUcmVlKCldKTtcblx0fSBlbHNlIHtcblx0ICAgIGtpZHMucHVzaChbcGlkLCBwXSk7XG5cdH1cbiAgICB9XG4gICAgZm9yICh2YXIgcGlkIGluIHRoaXMudG9tYnN0b25lcykge1xuXHRraWRzLnB1c2goW3BpZCwgdGhpcy50b21ic3RvbmVzW3BpZF1dKTtcbiAgICB9XG4gICAga2lkcy5zb3J0KCk7XG4gICAgcmV0dXJuIGtpZHM7XG59O1xuXG5Xb3JsZC5wcm90b3R5cGUudGV4dFByb2Nlc3NUcmVlID0gZnVuY3Rpb24gKG93blBpZCkge1xuICAgIHZhciBsaW5lcyA9IFtdO1xuXG4gICAgZnVuY3Rpb24gZHVtcFByb2Nlc3MocHJlZml4LCBwaWQsIHApIHtcblx0aWYgKEFycmF5LmlzQXJyYXkocCkpIHtcblx0ICAgIGxpbmVzLnB1c2gocHJlZml4ICsgJy0tKyAnICsgcGlkKTtcblx0ICAgIGZvciAodmFyIGkgPSAwOyBpIDwgcC5sZW5ndGg7IGkrKykge1xuXHRcdGR1bXBQcm9jZXNzKHByZWZpeCArICcgIHwnLCBwW2ldWzBdLCBwW2ldWzFdKTtcblx0ICAgIH1cblx0ICAgIGxpbmVzLnB1c2gocHJlZml4KTtcblx0fSBlbHNlIHtcblx0ICAgIHZhciBsYWJlbCA9IHAuYmVoYXZpb3IubmFtZSB8fCBwLmJlaGF2aW9yLmNvbnN0cnVjdG9yLm5hbWUgfHwgJyc7XG5cdCAgICB2YXIgdG9tYnN0b25lU3RyaW5nID0gcC5leGl0UmVhc29uID8gJyAoRVhJVEVEOiAnICsgcC5leGl0UmVhc29uICsgJykgJyA6ICcnO1xuXHQgICAgbGluZXMucHVzaChwcmVmaXggKyAnLS0gJyArIHBpZCArICc6ICcgKyBsYWJlbCArXG5cdFx0ICAgICAgIHRvbWJzdG9uZVN0cmluZyArXG5cdFx0ICAgICAgIEpTT04uc3RyaW5naWZ5KHAuYmVoYXZpb3IsIGZ1bmN0aW9uIChrLCB2KSB7XG5cdFx0XHQgICByZXR1cm4gayA9PT0gJ25hbWUnID8gdW5kZWZpbmVkIDogdjtcblx0XHQgICAgICAgfSkpO1xuXHR9XG4gICAgfVxuXG4gICAgZHVtcFByb2Nlc3MoJycsIG93blBpZCB8fCAnJywgdGhpcy5wcm9jZXNzVHJlZSgpKTtcbiAgICByZXR1cm4gbGluZXMuam9pbignXFxuJyk7XG59O1xuXG5Xb3JsZC5wcm90b3R5cGUuY2xlYXJUb21ic3RvbmVzID0gZnVuY3Rpb24gKCkge1xuICAgIHRoaXMudG9tYnN0b25lcyA9IHt9O1xuICAgIGZvciAodmFyIHBpZCBpbiB0aGlzLnByb2Nlc3NUYWJsZSkge1xuXHR2YXIgcCA9IHRoaXMucHJvY2Vzc1RhYmxlW3BpZF07XG5cdGlmIChwLmJlaGF2aW9yIGluc3RhbmNlb2YgV29ybGQpIHtcblx0ICAgIHAuYmVoYXZpb3IuY2xlYXJUb21ic3RvbmVzKCk7XG5cdH1cbiAgICB9XG59O1xuXG4vKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG4vKiBVdGlsaXRpZXM6IG1hdGNoaW5nIGRlbWFuZCBmb3Igc29tZSBzZXJ2aWNlICovXG5cbmZ1bmN0aW9uIERlbWFuZE1hdGNoZXIocHJvamVjdGlvbiwgbWV0YUxldmVsLCBvcHRpb25zKSB7XG4gICAgb3B0aW9ucyA9IFV0aWwuZXh0ZW5kKHtcblx0ZGVtYW5kTGV2ZWw6IDAsXG5cdHN1cHBseUxldmVsOiAwLFxuXHRkZW1hbmRTaWRlSXNTdWJzY3JpcHRpb246IGZhbHNlXG4gICAgfSwgb3B0aW9ucyk7XG4gICAgdGhpcy5wYXR0ZXJuID0gUm91dGUucHJvamVjdGlvblRvUGF0dGVybihwcm9qZWN0aW9uKTtcbiAgICB0aGlzLnByb2plY3Rpb25TcGVjID0gUm91dGUuY29tcGlsZVByb2plY3Rpb24ocHJvamVjdGlvbik7XG4gICAgdGhpcy5tZXRhTGV2ZWwgPSBtZXRhTGV2ZWwgfCAwO1xuICAgIHRoaXMuZGVtYW5kTGV2ZWwgPSBvcHRpb25zLmRlbWFuZExldmVsO1xuICAgIHRoaXMuc3VwcGx5TGV2ZWwgPSBvcHRpb25zLnN1cHBseUxldmVsO1xuICAgIHRoaXMuZGVtYW5kU2lkZUlzU3Vic2NyaXB0aW9uID0gb3B0aW9ucy5kZW1hbmRTaWRlSXNTdWJzY3JpcHRpb247XG4gICAgdGhpcy5vbkRlbWFuZEluY3JlYXNlID0gZnVuY3Rpb24gKGNhcHR1cmVzKSB7XG5cdGNvbnNvbGUuZXJyb3IoXCJVbmhhbmRsZWQgaW5jcmVhc2UgaW4gZGVtYW5kIGZvciByb3V0ZVwiLCBjYXB0dXJlcyk7XG4gICAgfTtcbiAgICB0aGlzLm9uU3VwcGx5RGVjcmVhc2UgPSBmdW5jdGlvbiAoY2FwdHVyZXMpIHtcblx0Y29uc29sZS5lcnJvcihcIlVuaGFuZGxlZCBkZWNyZWFzZSBpbiBzdXBwbHkgZm9yIHJvdXRlXCIsIGNhcHR1cmVzKTtcbiAgICB9O1xuICAgIHRoaXMuY3VycmVudERlbWFuZCA9IHt9O1xuICAgIHRoaXMuY3VycmVudFN1cHBseSA9IHt9O1xufVxuXG5EZW1hbmRNYXRjaGVyLnByb3RvdHlwZS5ib290ID0gZnVuY3Rpb24gKCkge1xuICAgIHZhciBvYnNlcnZlckxldmVsID0gMSArIE1hdGgubWF4KHRoaXMuZGVtYW5kTGV2ZWwsIHRoaXMuc3VwcGx5TGV2ZWwpO1xuICAgIFdvcmxkLnVwZGF0ZVJvdXRlcyhbc3ViKHRoaXMucGF0dGVybiwgdGhpcy5tZXRhTGV2ZWwsIG9ic2VydmVyTGV2ZWwpLFxuXHRcdFx0cHViKHRoaXMucGF0dGVybiwgdGhpcy5tZXRhTGV2ZWwsIG9ic2VydmVyTGV2ZWwpXSk7XG59O1xuXG5EZW1hbmRNYXRjaGVyLnByb3RvdHlwZS5oYW5kbGVFdmVudCA9IGZ1bmN0aW9uIChlKSB7XG4gICAgaWYgKGUudHlwZSA9PT0gXCJyb3V0ZXNcIikge1xuXHR0aGlzLmhhbmRsZUdlc3RhbHQoZS5nZXN0YWx0KTtcbiAgICB9XG59O1xuXG5EZW1hbmRNYXRjaGVyLnByb3RvdHlwZS5oYW5kbGVHZXN0YWx0ID0gZnVuY3Rpb24gKGdlc3RhbHQpIHtcbiAgICB2YXIgbmV3RGVtYW5kTWF0Y2hlciA9IGdlc3RhbHQucHJvamVjdCh0aGlzLnByb2plY3Rpb25TcGVjLFxuXHRcdFx0XHRcdCAgICF0aGlzLmRlbWFuZFNpZGVJc1N1YnNjcmlwdGlvbixcblx0XHRcdFx0XHQgICB0aGlzLm1ldGFMZXZlbCxcblx0XHRcdFx0XHQgICB0aGlzLmRlbWFuZExldmVsKTtcbiAgICB2YXIgbmV3U3VwcGx5TWF0Y2hlciA9IGdlc3RhbHQucHJvamVjdCh0aGlzLnByb2plY3Rpb25TcGVjLFxuXHRcdFx0XHRcdCAgIHRoaXMuZGVtYW5kU2lkZUlzU3Vic2NyaXB0aW9uLFxuXHRcdFx0XHRcdCAgIHRoaXMubWV0YUxldmVsLFxuXHRcdFx0XHRcdCAgIHRoaXMuc3VwcGx5TGV2ZWwpO1xuICAgIHZhciBuZXdEZW1hbmQgPSBSb3V0ZS5hcnJheVRvU2V0KFJvdXRlLm1hdGNoZXJLZXlzKG5ld0RlbWFuZE1hdGNoZXIpKTtcbiAgICB2YXIgbmV3U3VwcGx5ID0gUm91dGUuYXJyYXlUb1NldChSb3V0ZS5tYXRjaGVyS2V5cyhuZXdTdXBwbHlNYXRjaGVyKSk7XG4gICAgdmFyIGRlbWFuZERlbHRhID0gUm91dGUuc2V0U3VidHJhY3QobmV3RGVtYW5kLCB0aGlzLmN1cnJlbnREZW1hbmQpO1xuICAgIHZhciBzdXBwbHlEZWx0YSA9IFJvdXRlLnNldFN1YnRyYWN0KHRoaXMuY3VycmVudFN1cHBseSwgbmV3U3VwcGx5KTtcbiAgICB2YXIgZGVtYW5kSW5jciA9IFJvdXRlLnNldFN1YnRyYWN0KGRlbWFuZERlbHRhLCBuZXdTdXBwbHkpO1xuICAgIHZhciBzdXBwbHlEZWNyID0gUm91dGUuc2V0SW50ZXJzZWN0KHN1cHBseURlbHRhLCBuZXdEZW1hbmQpO1xuICAgIHRoaXMuY3VycmVudERlbWFuZCA9IG5ld0RlbWFuZDtcbiAgICB0aGlzLmN1cnJlbnRTdXBwbHkgPSBuZXdTdXBwbHk7XG4gICAgZm9yICh2YXIgayBpbiBkZW1hbmRJbmNyKSB0aGlzLm9uRGVtYW5kSW5jcmVhc2UoZGVtYW5kSW5jcltrXSk7XG4gICAgZm9yICh2YXIgayBpbiBzdXBwbHlEZWNyKSB0aGlzLm9uU3VwcGx5RGVjcmVhc2Uoc3VwcGx5RGVjcltrXSk7XG59O1xuXG4vKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG4vKiBVdGlsaXRpZXM6IGRlZHVwbGljYXRvciAqL1xuXG5mdW5jdGlvbiBEZWR1cGxpY2F0b3IodHRsX21zKSB7XG4gICAgdGhpcy50dGxfbXMgPSB0dGxfbXMgfHwgMTAwMDA7XG4gICAgdGhpcy5xdWV1ZSA9IFtdO1xuICAgIHRoaXMubWFwID0ge307XG4gICAgdGhpcy50aW1lcklkID0gbnVsbDtcbn1cblxuRGVkdXBsaWNhdG9yLnByb3RvdHlwZS5hY2NlcHQgPSBmdW5jdGlvbiAobSkge1xuICAgIHZhciBzID0gSlNPTi5zdHJpbmdpZnkobSk7XG4gICAgaWYgKHMgaW4gdGhpcy5tYXApIHJldHVybiBmYWxzZTtcbiAgICB2YXIgZW50cnkgPSBbKCtuZXcgRGF0ZSgpKSArIHRoaXMudHRsX21zLCBzLCBtXTtcbiAgICB0aGlzLm1hcFtzXSA9IGVudHJ5O1xuICAgIHRoaXMucXVldWUucHVzaChlbnRyeSk7XG5cbiAgICBpZiAodGhpcy50aW1lcklkID09PSBudWxsKSB7XG5cdHZhciBzZWxmID0gdGhpcztcblx0dGhpcy50aW1lcklkID0gc2V0SW50ZXJ2YWwoZnVuY3Rpb24gKCkgeyBzZWxmLmV4cGlyZU1lc3NhZ2VzKCk7IH0sXG5cdFx0XHRcdCAgIHRoaXMudHRsX21zID4gMTAwMCA/IDEwMDAgOiB0aGlzLnR0bF9tcyk7XG4gICAgfVxuICAgIHJldHVybiB0cnVlO1xufTtcblxuRGVkdXBsaWNhdG9yLnByb3RvdHlwZS5leHBpcmVNZXNzYWdlcyA9IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgbm93ID0gK25ldyBEYXRlKCk7XG4gICAgd2hpbGUgKHRoaXMucXVldWUubGVuZ3RoID4gMCAmJiB0aGlzLnF1ZXVlWzBdWzBdIDw9IG5vdykge1xuXHR2YXIgZW50cnkgPSB0aGlzLnF1ZXVlLnNoaWZ0KCk7XG5cdGRlbGV0ZSB0aGlzLm1hcFtlbnRyeVsxXV07XG4gICAgfVxuICAgIGlmICh0aGlzLnF1ZXVlLmxlbmd0aCA9PT0gMCkge1xuXHRjbGVhckludGVydmFsKHRoaXMudGltZXJJZCk7XG5cdHRoaXMudGltZXJJZCA9IG51bGw7XG4gICAgfVxufTtcblxuLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXG5cbm1vZHVsZS5leHBvcnRzLl9fID0gX187XG5tb2R1bGUuZXhwb3J0cy5fJCA9IF8kO1xuXG5tb2R1bGUuZXhwb3J0cy5zdWIgPSBzdWI7XG5tb2R1bGUuZXhwb3J0cy5wdWIgPSBwdWI7XG5tb2R1bGUuZXhwb3J0cy5zcGF3biA9IHNwYXduO1xubW9kdWxlLmV4cG9ydHMudXBkYXRlUm91dGVzID0gdXBkYXRlUm91dGVzO1xubW9kdWxlLmV4cG9ydHMuc2VuZE1lc3NhZ2UgPSBzZW5kTWVzc2FnZTtcbm1vZHVsZS5leHBvcnRzLnNodXRkb3duV29ybGQgPSBzaHV0ZG93bldvcmxkO1xuXG5tb2R1bGUuZXhwb3J0cy5Xb3JsZCA9IFdvcmxkO1xubW9kdWxlLmV4cG9ydHMuRGVtYW5kTWF0Y2hlciA9IERlbWFuZE1hdGNoZXI7XG5tb2R1bGUuZXhwb3J0cy5EZWR1cGxpY2F0b3IgPSBEZWR1cGxpY2F0b3I7XG5tb2R1bGUuZXhwb3J0cy5Sb3V0ZSA9IFJvdXRlO1xuIiwiLy8gUmVmbGVjdGlvbiBvbiBmdW5jdGlvbiBmb3JtYWwgcGFyYW1ldGVyIGxpc3RzLlxuLy8gVGhpcyBtb2R1bGUgaXMgYmFzZWQgb24gQW5ndWxhcidzIFwiaW5qZWN0b3JcIiBjb2RlLFxuLy8gaHR0cHM6Ly9naXRodWIuY29tL2FuZ3VsYXIvYW5ndWxhci5qcy9ibG9iL21hc3Rlci9zcmMvYXV0by9pbmplY3Rvci5qcyxcbi8vIE1JVCBsaWNlbnNlZCwgYW5kIGhlbmNlOlxuLy8gQ29weXJpZ2h0IChjKSAyMDEwLTIwMTQgR29vZ2xlLCBJbmMuIGh0dHA6Ly9hbmd1bGFyanMub3JnXG4vLyBDb3B5cmlnaHQgKGMpIDIwMTQgVG9ueSBHYXJub2NrLUpvbmVzXG5cbnZhciBGTl9BUkdTID0gL15mdW5jdGlvblxccypbXlxcKF0qXFwoXFxzKihbXlxcKV0qKVxcKS9tO1xudmFyIEZOX0FSR19TUExJVCA9IC8sLztcbnZhciBTVFJJUF9DT01NRU5UUyA9IC8oKFxcL1xcLy4qJCl8KFxcL1xcKltcXHNcXFNdKj9cXCpcXC8pKS9tZztcblxuZnVuY3Rpb24gZm9ybWFsUGFyYW1ldGVycyhmbikge1xuICAgIHZhciByZXN1bHQgPSBbXTtcblxuICAgIHZhciBmblRleHQgPSBmbi50b1N0cmluZygpLnJlcGxhY2UoU1RSSVBfQ09NTUVOVFMsICcnKTtcbiAgICB2YXIgYXJnRGVjbCA9IGZuVGV4dC5tYXRjaChGTl9BUkdTKTtcbiAgICB2YXIgYXJncyA9IGFyZ0RlY2xbMV0uc3BsaXQoRk5fQVJHX1NQTElUKTtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGFyZ3MubGVuZ3RoOyBpKyspIHtcblx0dmFyIHRyaW1tZWQgPSBhcmdzW2ldLnRyaW0oKTtcblx0aWYgKHRyaW1tZWQpIHsgcmVzdWx0LnB1c2godHJpbW1lZCk7IH1cbiAgICB9XG5cbiAgICByZXR1cm4gcmVzdWx0O1xufVxuXG5tb2R1bGUuZXhwb3J0cy5mb3JtYWxQYXJhbWV0ZXJzID0gZm9ybWFsUGFyYW1ldGVycztcbiIsInZhciBfXyA9IFwiX19cIjsgLyogd2lsZGNhcmQgbWFya2VyICovXG5cbnZhciBTT0EgPSBcIl9fW1wiOyAvLyBzdGFydCBvZiBhcnJheVxudmFyIEVPQSA9IFwiX19dXCI7IC8vIGVuZCBvZiBhcnJheVxuXG5mdW5jdGlvbiBkaWUobWVzc2FnZSkge1xuICAgIHRocm93IG5ldyBFcnJvcihtZXNzYWdlKTtcbn1cblxuZnVuY3Rpb24gJEVtYmVkZGVkKG1hdGNoZXIpIHtcbiAgICB0aGlzLm1hdGNoZXIgPSBtYXRjaGVyO1xufVxuXG5mdW5jdGlvbiBlbWJlZGRlZE1hdGNoZXIobWF0Y2hlcikge1xuICAgIHJldHVybiBuZXcgJEVtYmVkZGVkKG1hdGNoZXIpO1xufVxuXG4vLyBUaGUgbmFtZSBhcmd1bWVudCBzaG91bGQgYmUgYSBzdHJpbmcgb3IgbnVsbDsgaXQgZGVmYXVsdHMgdG8gbnVsbC5cbi8vIFRoZSBwYXR0ZXJuIGFyZ3VtZW50IGRlZmF1bHRzIHRvIHdpbGRjYXJkLCBfXy5cbmZ1bmN0aW9uICRDYXB0dXJlKG5hbWUsIHBhdHRlcm4pIHtcbiAgICB0aGlzLm5hbWUgPSBuYW1lIHx8IG51bGw7XG4gICAgdGhpcy5wYXR0ZXJuID0gKHR5cGVvZiBwYXR0ZXJuID09PSAndW5kZWZpbmVkJyA/IF9fIDogcGF0dGVybik7XG59XG5cbi8vIEFiYnJldmlhdGlvbjogXyQoLi4uKSA8PT0+IG5ldyAkQ2FwdHVyZSguLi4pXG5mdW5jdGlvbiBfJChuYW1lLCBwYXR0ZXJuKSB7XG4gICAgcmV0dXJuIG5ldyAkQ2FwdHVyZShuYW1lLCBwYXR0ZXJuKTtcbn1cblxuZnVuY3Rpb24gaXNDYXB0dXJlKHgpIHsgcmV0dXJuIHggaW5zdGFuY2VvZiAkQ2FwdHVyZSB8fCB4ID09PSBfJDsgfVxuZnVuY3Rpb24gY2FwdHVyZU5hbWUoeCkgeyByZXR1cm4geCBpbnN0YW5jZW9mICRDYXB0dXJlID8geC5uYW1lIDogbnVsbDsgfVxuZnVuY3Rpb24gY2FwdHVyZVBhdHRlcm4oeCkgeyByZXR1cm4geCBpbnN0YW5jZW9mICRDYXB0dXJlID8geC5wYXR0ZXJuIDogX187IH1cblxudmFyIFNPQyA9IFwiX197e1wiOyAvLyBzdGFydCBvZiBjYXB0dXJlXG52YXIgRU9DID0gXCJfX319XCI7IC8vIGVuZCBvZiBjYXB0dXJlXG5cbmZ1bmN0aW9uICRTdWNjZXNzKHZhbHVlKSB7XG4gICAgdGhpcy52YWx1ZSA9IHZhbHVlO1xufVxuXG5mdW5jdGlvbiAkV2lsZGNhcmRTZXF1ZW5jZShtYXRjaGVyKSB7XG4gICAgdGhpcy5tYXRjaGVyID0gbWF0Y2hlcjtcbn1cblxuZnVuY3Rpb24gJERpY3QoKSB7XG4gICAgdGhpcy5sZW5ndGggPSAwO1xuICAgIHRoaXMuZW50cmllcyA9IHt9O1xufVxuXG4kRGljdC5wcm90b3R5cGUuZ2V0ID0gZnVuY3Rpb24gKGtleSkge1xuICAgIHJldHVybiB0aGlzLmVudHJpZXNba2V5XSB8fCBlbXB0eU1hdGNoZXI7XG59O1xuXG4kRGljdC5wcm90b3R5cGUuc2V0ID0gZnVuY3Rpb24gKGtleSwgdmFsKSB7XG4gICAgaWYgKCEoa2V5IGluIHRoaXMuZW50cmllcykpIHRoaXMubGVuZ3RoKys7XG4gICAgdGhpcy5lbnRyaWVzW2tleV0gPSB2YWw7XG59O1xuXG4kRGljdC5wcm90b3R5cGUuY2xlYXIgPSBmdW5jdGlvbiAoa2V5KSB7XG4gICAgaWYgKGtleSBpbiB0aGlzLmVudHJpZXMpIHRoaXMubGVuZ3RoLS07XG4gICAgZGVsZXRlIHRoaXMuZW50cmllc1trZXldO1xufTtcblxuJERpY3QucHJvdG90eXBlLmlzRW1wdHkgPSBmdW5jdGlvbiAoKSB7XG4gICAgcmV0dXJuIHRoaXMubGVuZ3RoID09PSAwO1xufTtcblxuJERpY3QucHJvdG90eXBlLmNvcHkgPSBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIG90aGVyID0gbmV3ICREaWN0KCk7XG4gICAgb3RoZXIubGVuZ3RoID0gdGhpcy5sZW5ndGg7XG4gICAgZm9yICh2YXIga2V5IGluIHRoaXMuZW50cmllcykge1xuXHRpZiAodGhpcy5lbnRyaWVzLmhhc093blByb3BlcnR5KGtleSkpIHtcblx0ICAgIG90aGVyLmVudHJpZXNba2V5XSA9IHRoaXMuZW50cmllc1trZXldO1xuXHR9XG4gICAgfVxuICAgIHJldHVybiBvdGhlcjtcbn07XG5cbiREaWN0LnByb3RvdHlwZS5lbXB0eUd1YXJkID0gZnVuY3Rpb24gKCkge1xuICAgIGlmICh0aGlzLmlzRW1wdHkoKSkgcmV0dXJuIGVtcHR5TWF0Y2hlcjtcbiAgICByZXR1cm4gdGhpcztcbn07XG5cbiREaWN0LnByb3RvdHlwZS5oYXMgPSBmdW5jdGlvbiAoa2V5KSB7XG4gICAgcmV0dXJuIGtleSBpbiB0aGlzLmVudHJpZXM7XG59O1xuXG4kRGljdC5wcm90b3R5cGUuc29ydGVkS2V5cyA9IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIga3MgPSBbXTtcbiAgICBmb3IgKHZhciBrIGluIHRoaXMuZW50cmllcykga3MucHVzaChrKTtcbiAgICBrcy5zb3J0KCk7XG4gICAgcmV0dXJuIGtzO1xufVxuXG5mdW5jdGlvbiBpc19lbXB0eU1hdGNoZXIobSkge1xuICAgIHJldHVybiAobSA9PT0gZW1wdHlNYXRjaGVyKTtcbn1cblxuLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXG4vLyBDb25zdHJ1Y3RvcnNcblxudmFyIGVtcHR5TWF0Y2hlciA9IG51bGw7XG5cbmZ1bmN0aW9uIHJzdWNjZXNzKHYpIHtcbiAgICByZXR1cm4gKHYgPT09IGVtcHR5TWF0Y2hlcikgPyBlbXB0eU1hdGNoZXIgOiBuZXcgJFN1Y2Nlc3Modik7XG59XG5cbmZ1bmN0aW9uIHJzZXEoZSwgcikge1xuICAgIGlmIChyID09PSBlbXB0eU1hdGNoZXIpIHJldHVybiBlbXB0eU1hdGNoZXI7XG4gICAgdmFyIHMgPSBuZXcgJERpY3QoKTtcbiAgICBzLnNldChlLCByKTtcbiAgICByZXR1cm4gcztcbn1cblxuZnVuY3Rpb24gcndpbGQocikge1xuICAgIHJldHVybiByc2VxKF9fLCByKTtcbn1cblxuZnVuY3Rpb24gcndpbGRzZXEocikge1xuICAgIHJldHVybiAociA9PT0gZW1wdHlNYXRjaGVyKSA/IGVtcHR5TWF0Y2hlciA6IG5ldyAkV2lsZGNhcmRTZXF1ZW5jZShyKTtcbn1cblxuLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXG5cbmZ1bmN0aW9uIGNvbXBpbGVQYXR0ZXJuKHYsIHApIHtcbiAgICBpZiAoIXApIGRpZShcImNvbXBpbGVQYXR0ZXJuOiBtaXNzaW5nIHBhdHRlcm5cIik7XG4gICAgcmV0dXJuIHdhbGsocCwgcnNlcShFT0EsIHJzdWNjZXNzKHYpKSk7XG5cbiAgICBmdW5jdGlvbiB3YWxrKHAsIGFjYykge1xuXHRpZiAocCA9PT0gX18pIHJldHVybiByd2lsZChhY2MpO1xuXG5cdGlmIChBcnJheS5pc0FycmF5KHApKSB7XG5cdCAgICBhY2MgPSByc2VxKEVPQSwgYWNjKTtcblx0ICAgIGZvciAodmFyIGkgPSBwLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG5cdFx0YWNjID0gd2FsayhwW2ldLCBhY2MpO1xuXHQgICAgfVxuXHQgICAgcmV0dXJuIHJzZXEoU09BLCBhY2MpO1xuXHR9XG5cblx0aWYgKHAgaW5zdGFuY2VvZiAkRW1iZWRkZWQpIHtcblx0ICAgIHJldHVybiBhcHBlbmRNYXRjaGVyKHAubWF0Y2hlciwgZnVuY3Rpb24gKHYpIHsgcmV0dXJuIGFjYzsgfSk7XG5cdH0gZWxzZSB7XG5cdCAgICByZXR1cm4gcnNlcShKU09OLnN0cmluZ2lmeShwKSwgYWNjKTtcblx0fVxuICAgIH1cbn1cblxuZnVuY3Rpb24gbWF0Y2hQYXR0ZXJuKHYsIHApIHtcbiAgICB2YXIgY2FwdHVyZUNvdW50ID0gMDtcbiAgICB2YXIgcmVzdWx0ID0ge307XG4gICAgdHJ5IHtcblx0d2Fsayh2LCBwKTtcbiAgICB9IGNhdGNoIChlKSB7XG5cdGlmIChlLm1hdGNoUGF0dGVybkZhaWxlZCkgcmV0dXJuIG51bGw7XG5cdHRocm93IGU7XG4gICAgfVxuICAgIHJlc3VsdC5sZW5ndGggPSBjYXB0dXJlQ291bnQ7XG4gICAgcmV0dXJuIHJlc3VsdDtcblxuICAgIGZ1bmN0aW9uIHdhbGsodiwgcCkge1xuXHRpZiAocCA9PT0gdikgcmV0dXJuO1xuXG5cdGlmIChwID09PSBfXykgcmV0dXJuO1xuXG5cdGlmIChBcnJheS5pc0FycmF5KHApICYmIEFycmF5LmlzQXJyYXkodikgJiYgcC5sZW5ndGggPT09IHYubGVuZ3RoKSB7XG5cdCAgICBmb3IgKHZhciBpID0gMDsgaSA8IHAubGVuZ3RoOyBpKyspIHtcblx0XHR3YWxrKHZbaV0sIHBbaV0pO1xuXHQgICAgfVxuXHQgICAgcmV0dXJuO1xuXHR9XG5cblx0aWYgKGlzQ2FwdHVyZShwKSkge1xuXHQgICAgdmFyIHRoaXNDYXB0dXJlID0gY2FwdHVyZUNvdW50Kys7XG5cdCAgICB3YWxrKHYsIGNhcHR1cmVQYXR0ZXJuKHApKTtcblx0ICAgIHJlc3VsdFtjYXB0dXJlTmFtZShwKSB8fCAoJyQnICsgdGhpc0NhcHR1cmUpXSA9IHY7XG5cdCAgICByZXR1cm47XG5cdH1cblxuXHRpZiAocCBpbnN0YW5jZW9mICRFbWJlZGRlZCkge1xuXHQgICAgZGllKFwiJEVtYmVkZGVkIHBhdHRlcm5zIG5vdCBzdXBwb3J0ZWQgaW4gbWF0Y2hQYXR0ZXJuKClcIik7XG5cdH1cblxuXHR0aHJvdyB7bWF0Y2hQYXR0ZXJuRmFpbGVkOiB0cnVlfTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIHNoYWxsb3dDb3B5QXJyYXkocykge1xuICAgIHJldHVybiBzLnNsaWNlKCk7XG59XG5cbmZ1bmN0aW9uIHJ1cGRhdGVJbnBsYWNlKHIsIGtleSwgaykge1xuICAgIGlmIChpc19lbXB0eU1hdGNoZXIoaykpIHtcblx0ci5jbGVhcihrZXkpO1xuICAgIH0gZWxzZSB7XG5cdHIuc2V0KGtleSwgayk7XG4gICAgfVxufVxuXG5mdW5jdGlvbiBtYXRjaGVyRXF1YWxzKGEsIGIpIHtcbiAgICBpZiAoYSA9PT0gbnVsbCkge1xuXHRyZXR1cm4gKGIgPT09IG51bGwpO1xuICAgIH1cbiAgICBpZiAoYiA9PT0gbnVsbCkgcmV0dXJuIGZhbHNlO1xuXG4gICAgaWYgKGEgaW5zdGFuY2VvZiAkV2lsZGNhcmRTZXF1ZW5jZSkge1xuXHRpZiAoIShiIGluc3RhbmNlb2YgJFdpbGRjYXJkU2VxdWVuY2UpKSByZXR1cm4gZmFsc2U7XG5cdGEgPSBhLm1hdGNoZXI7XG5cdGIgPSBiLm1hdGNoZXI7XG4gICAgfSBlbHNlIGlmIChiIGluc3RhbmNlb2YgJFdpbGRjYXJkU2VxdWVuY2UpIHJldHVybiBmYWxzZTtcblxuICAgIGlmIChhIGluc3RhbmNlb2YgJFN1Y2Nlc3MpIHtcblx0aWYgKCEoYiBpbnN0YW5jZW9mICRTdWNjZXNzKSkgcmV0dXJuIGZhbHNlO1xuXHRyZXR1cm4gdmFsdWVzRXF1YWwoYS52YWx1ZSwgYi52YWx1ZSk7XG4gICAgfVxuICAgIGlmIChiIGluc3RhbmNlb2YgJFN1Y2Nlc3MpIHJldHVybiBmYWxzZTtcblxuICAgIGZvciAodmFyIGtleSBpbiBhLmVudHJpZXMpIHtcblx0aWYgKCFiLmhhcyhrZXkpKSByZXR1cm4gZmFsc2U7XG5cdGlmICghbWF0Y2hlckVxdWFscyhhLmVudHJpZXNba2V5XSwgYi5lbnRyaWVzW2tleV0pKSByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIHJldHVybiB0cnVlO1xufVxuXG5mdW5jdGlvbiBpc19rZXlPcGVuKGspIHtcbiAgICByZXR1cm4gayA9PT0gU09BO1xufVxuXG5mdW5jdGlvbiBpc19rZXlDbG9zZShrKSB7XG4gICAgcmV0dXJuIGsgPT09IEVPQTtcbn1cblxuZnVuY3Rpb24gaXNfa2V5Tm9ybWFsKGspIHtcbiAgICByZXR1cm4gIShpc19rZXlPcGVuKGspIHx8IGlzX2tleUNsb3NlKGspKTtcbn1cblxuLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXG4vLyBFbm91Z2ggb2Ygc2V0cyB0byBnZXQgYnkgd2l0aFxuXG5mdW5jdGlvbiBhcnJheVRvU2V0KHhzKSB7XG4gICAgdmFyIHMgPSB7fTtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHhzLmxlbmd0aDsgaSsrKSB7XG5cdHNbSlNPTi5zdHJpbmdpZnkoeHNbaV0pXSA9IHhzW2ldO1xuICAgIH1cbiAgICByZXR1cm4gcztcbn1cblxuZnVuY3Rpb24gc2V0VG9BcnJheShzKSB7XG4gICAgdmFyIHIgPSBbXTtcbiAgICBmb3IgKHZhciBrIGluIHMpIHIucHVzaChzW2tdKTtcbiAgICByZXR1cm4gcjtcbn1cblxuZnVuY3Rpb24gc2V0VW5pb24oczEsIHMyKSB7XG4gICAgdmFyIHMgPSB7fTtcbiAgICBzZXRVbmlvbklucGxhY2UocywgczEpO1xuICAgIHNldFVuaW9uSW5wbGFjZShzLCBzMik7XG4gICAgcmV0dXJuIHM7XG59XG5cbmZ1bmN0aW9uIGlzX2VtcHR5U2V0KHMpIHtcbiAgICBmb3IgKHZhciBrIGluIHMpIHtcblx0aWYgKHMuaGFzT3duUHJvcGVydHkoaykpXG5cdCAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIHJldHVybiB0cnVlO1xufVxuXG5mdW5jdGlvbiBzZXRTdWJ0cmFjdChzMSwgczIpIHtcbiAgICB2YXIgcyA9IHt9O1xuICAgIGZvciAodmFyIGtleSBpbiBzMSkge1xuXHRpZiAoczEuaGFzT3duUHJvcGVydHkoa2V5KSAmJiAhczIuaGFzT3duUHJvcGVydHkoa2V5KSkge1xuXHQgICAgc1trZXldID0gczFba2V5XTtcblx0fVxuICAgIH1cbiAgICByZXR1cm4gcztcbn1cblxuZnVuY3Rpb24gc2V0SW50ZXJzZWN0KHMxLCBzMikge1xuICAgIHZhciBzID0ge307XG4gICAgZm9yICh2YXIga2V5IGluIHMxKSB7XG5cdGlmIChzMS5oYXNPd25Qcm9wZXJ0eShrZXkpICYmIHMyLmhhc093blByb3BlcnR5KGtleSkpIHtcblx0ICAgIHNba2V5XSA9IHMxW2tleV07XG5cdH1cbiAgICB9XG4gICAgcmV0dXJuIHM7XG59XG5cbmZ1bmN0aW9uIHNldFVuaW9uSW5wbGFjZShhY2MsIHMpIHtcbiAgICBmb3IgKHZhciBrZXkgaW4gcykge1xuXHRpZiAocy5oYXNPd25Qcm9wZXJ0eShrZXkpKSB7XG5cdCAgICBhY2Nba2V5XSA9IHNba2V5XTtcblx0fVxuICAgIH1cbn1cblxuZnVuY3Rpb24gc2V0RXF1YWwoczEsIHMyKSB7XG4gICAgZm9yICh2YXIga2V5IGluIHMxKSB7XG5cdGlmIChzMS5oYXNPd25Qcm9wZXJ0eShrZXkpKSB7XG5cdCAgICBpZiAoczFba2V5XSAhPT0gczJba2V5XSkgcmV0dXJuIGZhbHNlO1xuXHR9XG4gICAgfVxuICAgIGZvciAodmFyIGtleSBpbiBzMikge1xuXHRpZiAoczIuaGFzT3duUHJvcGVydHkoa2V5KSkge1xuXHQgICAgaWYgKHMxW2tleV0gIT09IHMyW2tleV0pIHJldHVybiBmYWxzZTtcblx0fVxuICAgIH1cbiAgICByZXR1cm4gdHJ1ZTtcbn1cblxuLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXG5cbnZhciB1bmlvblN1Y2Nlc3NlcyA9IGZ1bmN0aW9uICh2MSwgdjIpIHtcbiAgICBpZiAodjEgPT09IHRydWUpIHJldHVybiB2MjtcbiAgICBpZiAodjIgPT09IHRydWUpIHJldHVybiB2MTtcbiAgICByZXR1cm4gc2V0VW5pb24odjEsIHYyKTtcbn07XG5cbnZhciBpbnRlcnNlY3RTdWNjZXNzZXMgPSBmdW5jdGlvbiAodjEsIHYyKSB7XG4gICAgcmV0dXJuIHYxO1xufTtcblxudmFyIGVyYXNlUGF0aFN1Y2Nlc3NlcyA9IGZ1bmN0aW9uICh2MSwgdjIpIHtcbiAgICB2YXIgciA9IHNldFN1YnRyYWN0KHYxLCB2Mik7XG4gICAgaWYgKGlzX2VtcHR5U2V0KHIpKSByZXR1cm4gbnVsbDtcbiAgICByZXR1cm4gcjtcbn07XG5cbnZhciBtYXRjaE1hdGNoZXJTdWNjZXNzZXMgPSBmdW5jdGlvbiAodjEsIHYyLCBhY2MpIHtcbiAgICBzZXRVbmlvbklucGxhY2UoYWNjLCB2Mik7XG59O1xuXG52YXIgcHJvamVjdFN1Y2Nlc3MgPSBmdW5jdGlvbiAodikge1xuICAgIHJldHVybiB2O1xufTtcblxudmFyIHZhbHVlc0VxdWFsID0gZnVuY3Rpb24gKGEsIGIpIHtcbiAgICByZXR1cm4gc2V0RXF1YWwoYSwgYik7XG59O1xuXG4vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cblxuZnVuY3Rpb24gZXhwYW5kV2lsZHNlcShyKSB7XG4gICAgcmV0dXJuIHVuaW9uKHJ3aWxkKHJ3aWxkc2VxKHIpKSwgcnNlcShFT0EsIHIpKTtcbn1cblxuZnVuY3Rpb24gdW5pb24obzEsIG8yKSB7XG4gICAgcmV0dXJuIG1lcmdlKG8xLCBvMik7XG5cbiAgICBmdW5jdGlvbiBtZXJnZShvMSwgbzIpIHtcblx0aWYgKGlzX2VtcHR5TWF0Y2hlcihvMSkpIHJldHVybiBvMjtcblx0aWYgKGlzX2VtcHR5TWF0Y2hlcihvMikpIHJldHVybiBvMTtcblx0cmV0dXJuIHdhbGsobzEsIG8yKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiB3YWxrKHIxLCByMikge1xuXHRpZiAocjEgaW5zdGFuY2VvZiAkV2lsZGNhcmRTZXF1ZW5jZSkge1xuXHQgICAgaWYgKHIyIGluc3RhbmNlb2YgJFdpbGRjYXJkU2VxdWVuY2UpIHtcblx0XHRyZXR1cm4gcndpbGRzZXEod2FsayhyMS5tYXRjaGVyLCByMi5tYXRjaGVyKSk7XG5cdCAgICB9XG5cdCAgICByMSA9IGV4cGFuZFdpbGRzZXEocjEubWF0Y2hlcik7XG5cdH0gZWxzZSBpZiAocjIgaW5zdGFuY2VvZiAkV2lsZGNhcmRTZXF1ZW5jZSkge1xuXHQgICAgcjIgPSBleHBhbmRXaWxkc2VxKHIyLm1hdGNoZXIpO1xuXHR9XG5cblx0aWYgKHIxIGluc3RhbmNlb2YgJFN1Y2Nlc3MgJiYgcjIgaW5zdGFuY2VvZiAkU3VjY2Vzcykge1xuXHQgICAgcmV0dXJuIHJzdWNjZXNzKHVuaW9uU3VjY2Vzc2VzKHIxLnZhbHVlLCByMi52YWx1ZSkpO1xuXHR9XG5cblx0dmFyIHcgPSBtZXJnZShyMS5nZXQoX18pLCByMi5nZXQoX18pKTtcblx0aWYgKGlzX2VtcHR5TWF0Y2hlcih3KSkge1xuXHQgICAgdmFyIHNtYWxsZXIgPSByMS5sZW5ndGggPCByMi5sZW5ndGggPyByMSA6IHIyO1xuXHQgICAgdmFyIGxhcmdlciAgPSByMS5sZW5ndGggPCByMi5sZW5ndGggPyByMiA6IHIxO1xuXHQgICAgdmFyIHRhcmdldCA9IGxhcmdlci5jb3B5KCk7XG5cdCAgICBmb3IgKHZhciBrZXkgaW4gc21hbGxlci5lbnRyaWVzKSB7XG5cdFx0dmFyIGsgPSBtZXJnZShzbWFsbGVyLmdldChrZXkpLCBsYXJnZXIuZ2V0KGtleSkpO1xuXHRcdHJ1cGRhdGVJbnBsYWNlKHRhcmdldCwga2V5LCBrKTtcblx0ICAgIH1cblx0ICAgIHJldHVybiB0YXJnZXQuZW1wdHlHdWFyZCgpO1xuXHR9IGVsc2Uge1xuXHQgICAgZnVuY3Rpb24gZXhhbWluZUtleShyQSwga2V5LCByQikge1xuXHRcdGlmICgoa2V5ICE9PSBfXykgJiYgIXRhcmdldC5oYXMoa2V5KSkge1xuXHRcdCAgICB2YXIgayA9IG1lcmdlKHJBLmdldChrZXkpLCByQi5nZXQoa2V5KSk7XG5cdFx0ICAgIGlmIChpc19rZXlPcGVuKGtleSkpIHtcblx0XHRcdHJ1cGRhdGVJbnBsYWNlKHRhcmdldCwga2V5LCBtZXJnZShyd2lsZHNlcSh3KSwgaykpO1xuXHRcdCAgICB9IGVsc2UgaWYgKGlzX2tleUNsb3NlKGtleSkpIHtcblx0XHRcdGlmICh3IGluc3RhbmNlb2YgJFdpbGRjYXJkU2VxdWVuY2UpIHtcblx0XHRcdCAgICBydXBkYXRlSW5wbGFjZSh0YXJnZXQsIGtleSwgbWVyZ2Uody5tYXRjaGVyLCBrKSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0ICAgIHJ1cGRhdGVJbnBsYWNlKHRhcmdldCwga2V5LCBrKTtcblx0XHRcdH1cblx0XHQgICAgfSBlbHNlIHtcblx0XHRcdHJ1cGRhdGVJbnBsYWNlKHRhcmdldCwga2V5LCBtZXJnZSh3LCBrKSk7XG5cdFx0ICAgIH1cblx0XHR9XG5cdCAgICB9XG5cdCAgICB2YXIgdGFyZ2V0ID0gcndpbGQodykuY29weSgpO1xuXHQgICAgZm9yICh2YXIga2V5IGluIHIxLmVudHJpZXMpIHsgZXhhbWluZUtleShyMSwga2V5LCByMik7IH1cblx0ICAgIGZvciAodmFyIGtleSBpbiByMi5lbnRyaWVzKSB7IGV4YW1pbmVLZXkocjIsIGtleSwgcjEpOyB9XG5cdCAgICByZXR1cm4gdGFyZ2V0O1xuXHR9XG4gICAgfVxufVxuXG5mdW5jdGlvbiB1bmlvbk4oKSB7XG4gICAgdmFyIGFjYyA9IGVtcHR5TWF0Y2hlcjtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGFyZ3VtZW50cy5sZW5ndGg7IGkrKykge1xuXHRhY2MgPSB1bmlvbihhY2MsIGFyZ3VtZW50c1tpXSk7XG4gICAgfVxuICAgIHJldHVybiBhY2M7XG59XG5cbmZ1bmN0aW9uIGludGVyc2VjdChvMSwgbzIpIHtcbiAgICBpZiAoaXNfZW1wdHlNYXRjaGVyKG8xKSkgcmV0dXJuIGVtcHR5TWF0Y2hlcjtcbiAgICBpZiAoaXNfZW1wdHlNYXRjaGVyKG8yKSkgcmV0dXJuIGVtcHR5TWF0Y2hlcjtcbiAgICByZXR1cm4gd2FsayhvMSwgbzIpO1xuXG4gICAgZnVuY3Rpb24gd2Fsa0ZsaXBwZWQocjIsIHIxKSB7IHJldHVybiB3YWxrKHIxLCByMik7IH1cblxuICAgIGZ1bmN0aW9uIHdhbGsocjEsIHIyKSB7XG5cdC8vIElOVkFSSUFOVDogcjEgaXMgYSBwYXJ0IG9mIHRoZSBvcmlnaW5hbCBvMSwgYW5kXG5cdC8vIGxpa2V3aXNlIGZvciByMi4gVGhpcyBpcyBzbyB0aGF0IHRoZSBmaXJzdCBhcmcgdG9cblx0Ly8gaW50ZXJzZWN0U3VjY2Vzc2VzIGFsd2F5cyBjb21lcyBmcm9tIHIxLCBhbmQgdGhlIHNlY29uZFxuXHQvLyBmcm9tIHIyLlxuXHRpZiAoaXNfZW1wdHlNYXRjaGVyKHIxKSkgcmV0dXJuIGVtcHR5TWF0Y2hlcjtcblx0aWYgKGlzX2VtcHR5TWF0Y2hlcihyMikpIHJldHVybiBlbXB0eU1hdGNoZXI7XG5cblx0aWYgKHIxIGluc3RhbmNlb2YgJFdpbGRjYXJkU2VxdWVuY2UpIHtcblx0ICAgIGlmIChyMiBpbnN0YW5jZW9mICRXaWxkY2FyZFNlcXVlbmNlKSB7XG5cdFx0cmV0dXJuIHJ3aWxkc2VxKHdhbGsocjEubWF0Y2hlciwgcjIubWF0Y2hlcikpO1xuXHQgICAgfVxuXHQgICAgcjEgPSBleHBhbmRXaWxkc2VxKHIxLm1hdGNoZXIpO1xuXHR9IGVsc2UgaWYgKHIyIGluc3RhbmNlb2YgJFdpbGRjYXJkU2VxdWVuY2UpIHtcblx0ICAgIHIyID0gZXhwYW5kV2lsZHNlcShyMi5tYXRjaGVyKTtcblx0fVxuXG5cdGlmIChyMSBpbnN0YW5jZW9mICRTdWNjZXNzICYmIHIyIGluc3RhbmNlb2YgJFN1Y2Nlc3MpIHtcblx0ICAgIHJldHVybiByc3VjY2VzcyhpbnRlcnNlY3RTdWNjZXNzZXMocjEudmFsdWUsIHIyLnZhbHVlKSk7XG5cdH1cblxuXHR2YXIgdzEgPSByMS5nZXQoX18pO1xuXHR2YXIgdzIgPSByMi5nZXQoX18pO1xuXHR2YXIgdyA9IHdhbGsodzEsIHcyKTtcblxuXHR2YXIgdGFyZ2V0ID0gbmV3ICREaWN0KCk7XG5cblx0ZnVuY3Rpb24gZXhhbWluZUtleShrZXkpIHtcblx0ICAgIGlmICgoa2V5ICE9PSBfXykgJiYgIXRhcmdldC5oYXMoa2V5KSkge1xuXHRcdHZhciBrMSA9IHIxLmdldChrZXkpO1xuXHRcdHZhciBrMiA9IHIyLmdldChrZXkpO1xuXHRcdGlmIChpc19lbXB0eU1hdGNoZXIoazEpKSB7XG5cdFx0ICAgIGlmIChpc19lbXB0eU1hdGNoZXIoazIpKSB7XG5cdFx0XHRydXBkYXRlSW5wbGFjZSh0YXJnZXQsIGtleSwgZW1wdHlNYXRjaGVyKTtcblx0XHQgICAgfSBlbHNlIHtcblx0XHRcdHJ1cGRhdGVJbnBsYWNlKHRhcmdldCwga2V5LCB3YWxrV2lsZCh3YWxrLCB3MSwga2V5LCBrMikpO1xuXHRcdCAgICB9XG5cdFx0fSBlbHNlIHtcblx0XHQgICAgaWYgKGlzX2VtcHR5TWF0Y2hlcihrMikpIHtcblx0XHRcdHJ1cGRhdGVJbnBsYWNlKHRhcmdldCwga2V5LCB3YWxrV2lsZCh3YWxrRmxpcHBlZCwgdzIsIGtleSwgazEpKTtcblx0XHQgICAgfSBlbHNlIHtcblx0XHRcdHJ1cGRhdGVJbnBsYWNlKHRhcmdldCwga2V5LCB3YWxrKGsxLCBrMikpO1xuXHRcdCAgICB9XG5cdFx0fVxuXHQgICAgfVxuXHR9XG5cblx0aWYgKGlzX2VtcHR5TWF0Y2hlcih3MSkpIHtcblx0ICAgIGlmIChpc19lbXB0eU1hdGNoZXIodzIpKSB7XG5cdFx0Zm9yICh2YXIga2V5IGluIChyMS5sZW5ndGggPCByMi5sZW5ndGggPyByMSA6IHIyKS5lbnRyaWVzKSBleGFtaW5lS2V5KGtleSk7XG5cdCAgICB9IGVsc2Uge1xuXHRcdGZvciAodmFyIGtleSBpbiByMS5lbnRyaWVzKSBleGFtaW5lS2V5KGtleSk7XG5cdCAgICB9XG5cdH0gZWxzZSB7XG5cdCAgICBpZiAoaXNfZW1wdHlNYXRjaGVyKHcyKSkge1xuXHRcdGZvciAodmFyIGtleSBpbiByMi5lbnRyaWVzKSBleGFtaW5lS2V5KGtleSk7XG5cdCAgICB9IGVsc2Uge1xuXHRcdHJ1cGRhdGVJbnBsYWNlKHRhcmdldCwgX18sIHcpO1xuXHRcdGZvciAodmFyIGtleSBpbiByMS5lbnRyaWVzKSBleGFtaW5lS2V5KGtleSk7XG5cdFx0Zm9yICh2YXIga2V5IGluIHIyLmVudHJpZXMpIGV4YW1pbmVLZXkoa2V5KTtcblx0ICAgIH1cblx0fVxuXHRyZXR1cm4gdGFyZ2V0LmVtcHR5R3VhcmQoKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiB3YWxrV2lsZCh3YWxrZXIsIHcsIGtleSwgaykge1xuXHRpZiAoaXNfZW1wdHlNYXRjaGVyKHcpKSByZXR1cm4gZW1wdHlNYXRjaGVyO1xuXHRpZiAoaXNfa2V5T3BlbihrZXkpKSByZXR1cm4gd2Fsa2VyKHJ3aWxkc2VxKHcpLCBrKTtcblx0aWYgKGlzX2tleUNsb3NlKGtleSkpIHtcblx0ICAgIGlmICh3IGluc3RhbmNlb2YgJFdpbGRjYXJkU2VxdWVuY2UpIHJldHVybiB3YWxrZXIody5tYXRjaGVyLCBrKTtcblx0ICAgIHJldHVybiBlbXB0eU1hdGNoZXI7XG5cdH1cblx0cmV0dXJuIHdhbGtlcih3LCBrKTtcbiAgICB9XG59XG5cbi8vIFJlbW92ZXMgcjIncyBtYXBwaW5ncyBmcm9tIHIxLiBBc3N1bWVzIHIyIGhhcyBwcmV2aW91c2x5IGJlZW5cbi8vIHVuaW9uJ2QgaW50byByMS4gVGhlIGVyYXNlUGF0aFN1Y2Nlc3NlcyBmdW5jdGlvbiBzaG91bGQgcmV0dXJuXG4vLyBudWxsIHRvIHNpZ25hbCBcIm5vIHJlbWFpbmluZyBzdWNjZXNzIHZhbHVlc1wiLlxuZnVuY3Rpb24gZXJhc2VQYXRoKG8xLCBvMikge1xuICAgIHJldHVybiB3YWxrKG8xLCBvMik7XG5cbiAgICBmdW5jdGlvbiB3YWxrKHIxLCByMikge1xuXHRpZiAoaXNfZW1wdHlNYXRjaGVyKHIxKSkge1xuXHQgICAgcmV0dXJuIGVtcHR5TWF0Y2hlcjtcblx0fSBlbHNlIHtcblx0ICAgIGlmIChpc19lbXB0eU1hdGNoZXIocjIpKSB7XG5cdFx0cmV0dXJuIHIxO1xuXHQgICAgfVxuXHR9XG5cblx0aWYgKHIxIGluc3RhbmNlb2YgJFdpbGRjYXJkU2VxdWVuY2UpIHtcblx0ICAgIGlmIChyMiBpbnN0YW5jZW9mICRXaWxkY2FyZFNlcXVlbmNlKSB7XG5cdFx0cmV0dXJuIHJ3aWxkc2VxKHdhbGsocjEubWF0Y2hlciwgcjIubWF0Y2hlcikpO1xuXHQgICAgfVxuXHQgICAgcjEgPSBleHBhbmRXaWxkc2VxKHIxLm1hdGNoZXIpO1xuXHR9IGVsc2UgaWYgKHIyIGluc3RhbmNlb2YgJFdpbGRjYXJkU2VxdWVuY2UpIHtcblx0ICAgIHIyID0gZXhwYW5kV2lsZHNlcShyMi5tYXRjaGVyKTtcblx0fVxuXG5cdGlmIChyMSBpbnN0YW5jZW9mICRTdWNjZXNzICYmIHIyIGluc3RhbmNlb2YgJFN1Y2Nlc3MpIHtcblx0ICAgIHJldHVybiByc3VjY2VzcyhlcmFzZVBhdGhTdWNjZXNzZXMocjEudmFsdWUsIHIyLnZhbHVlKSk7XG5cdH1cblxuXHR2YXIgdzEgPSByMS5nZXQoX18pO1xuXHR2YXIgdzIgPSByMi5nZXQoX18pO1xuXHR2YXIgdyA9IHdhbGsodzEsIHcyKTtcblx0dmFyIHRhcmdldDtcblxuXHRmdW5jdGlvbiBleGFtaW5lS2V5KGtleSkge1xuXHQgICAgaWYgKGtleSAhPT0gX18pIHtcblx0XHR2YXIgazEgPSByMS5nZXQoa2V5KTtcblx0XHR2YXIgazIgPSByMi5nZXQoa2V5KTtcblx0XHR2YXIgdXBkYXRlZEs7XG5cdFx0aWYgKGlzX2VtcHR5TWF0Y2hlcihrMikpIHtcblx0XHQgICAgdXBkYXRlZEsgPSB3YWxrV2lsZChrZXksIGsxLCB3Mik7XG5cdFx0fSBlbHNlIHtcblx0XHQgICAgdXBkYXRlZEsgPSB3YWxrKGsxLCBrMik7XG5cdFx0fVxuXHRcdC8vIEhlcmUgd2UgZW5zdXJlIGEgXCJtaW5pbWFsXCIgcmVtYWluZGVyIGluIGNhc2VzXG5cdFx0Ly8gd2hlcmUgYWZ0ZXIgYW4gZXJhc3VyZSwgYSBwYXJ0aWN1bGFyIGtleSdzXG5cdFx0Ly8gY29udGludWF0aW9uIGlzIHRoZSBzYW1lIGFzIHRoZSB3aWxkY2FyZCdzXG5cdFx0Ly8gY29udGludWF0aW9uLiBUT0RPOiB0aGUgbWF0Y2hlckVxdWFscyBjaGVjayBtYXlcblx0XHQvLyBiZSBleHBlbnNpdmUuIElmIHNvLCBob3cgY2FuIGl0IGJlIG1hZGVcblx0XHQvLyBjaGVhcGVyP1xuXHRcdGlmIChpc19rZXlPcGVuKGtleSkpIHtcblx0XHQgICAgcnVwZGF0ZUlucGxhY2UodGFyZ2V0LCBrZXksXG5cdFx0XHRcdCAgICgodXBkYXRlZEsgaW5zdGFuY2VvZiAkV2lsZGNhcmRTZXF1ZW5jZSkgJiZcblx0XHRcdFx0ICAgIG1hdGNoZXJFcXVhbHModXBkYXRlZEsubWF0Y2hlciwgdykpXG5cdFx0XHRcdCAgID8gZW1wdHlNYXRjaGVyXG5cdFx0XHRcdCAgIDogdXBkYXRlZEspO1xuXHRcdH0gZWxzZSBpZiAoaXNfa2V5Q2xvc2Uoa2V5KSkge1xuXHRcdCAgICAvLyBXZSB0YWtlIGNhcmUgb2YgdGhpcyBjYXNlIGxhdGVyLCBhZnRlciB0aGVcblx0XHQgICAgLy8gdGFyZ2V0IGlzIGZ1bGx5IGNvbnN0cnVjdGVkL3JlYnVpbHQuXG5cdFx0ICAgIHJ1cGRhdGVJbnBsYWNlKHRhcmdldCwga2V5LCB1cGRhdGVkSyk7XG5cdFx0fSBlbHNlIHtcblx0XHQgICAgcnVwZGF0ZUlucGxhY2UodGFyZ2V0LCBrZXksXG5cdFx0XHRcdCAgIChtYXRjaGVyRXF1YWxzKHVwZGF0ZWRLLCB3KSA/IGVtcHR5TWF0Y2hlciA6IHVwZGF0ZWRLKSk7XG5cdFx0fVxuXHQgICAgfVxuXHR9XG5cblx0aWYgKGlzX2VtcHR5TWF0Y2hlcih3MikpIHtcblx0ICAgIHRhcmdldCA9IHIxLmNvcHkoKTtcblx0ICAgIGZvciAodmFyIGtleSBpbiByMi5lbnRyaWVzKSBleGFtaW5lS2V5KGtleSk7XG5cdH0gZWxzZSB7XG5cdCAgICB0YXJnZXQgPSBuZXcgJERpY3QoKTtcblx0ICAgIHJ1cGRhdGVJbnBsYWNlKHRhcmdldCwgX18sIHcpO1xuXHQgICAgZm9yICh2YXIga2V5IGluIHIxLmVudHJpZXMpIGV4YW1pbmVLZXkoa2V5KTtcblx0ICAgIGZvciAodmFyIGtleSBpbiByMi5lbnRyaWVzKSBleGFtaW5lS2V5KGtleSk7XG5cdH1cblxuXHQvLyBIZXJlLCB0aGUgdGFyZ2V0IGlzIGNvbXBsZXRlLiBJZiBpdCBoYXMgb25seSB0d28ga2V5cyxcblx0Ly8gb25lIHdpbGQgYW5kIG9uZSBpc19rZXlDbG9zZSwgYW5kIHdpbGQncyBjb250aW51YXRpb25cblx0Ly8gaXMgYSAkV2lsZGNhcmRTZXF1ZW5jZSBhbmQgdGhlIG90aGVyIGNvbnRpbnVhdGlvbiBpc1xuXHQvLyBpZGVudGljYWwgdG8gdGhlIHNlcXVlbmNlJ3MgY29udGludWF0aW9uLCB0aGVuIHJlcGxhY2Vcblx0Ly8gdGhlIHdob2xlIHRoaW5nIHdpdGggYSBuZXN0ZWQgJFdpbGRjYXJkU2VxdWVuY2UuXG5cdC8vIChXZSBrbm93IHcgPT09IHRhcmdldC5nZXQoX18pIGZyb20gYmVmb3JlLilcblx0Ly9cblx0Ly8gVE9ETzogSSBzdXNwZWN0IGFjdHVhbGx5IHRoaXMgYXBwbGllcyBldmVuIGlmIHRoZXJlIGFyZVxuXHQvLyBtb3JlIHRoYW4gdHdvIGtleXMsIHNvIGxvbmcgYXMgYWxsIHRoZWlyIGNvbnRpbnVhdGlvbnNcblx0Ly8gYXJlIGlkZW50aWNhbCBhbmQgdGhlcmUncyBhdCBsZWFzdCBvbmUgaXNfa2V5Q2xvc2Vcblx0Ly8gYWxvbmdzaWRlIGEgd2lsZC5cblx0aWYgKHRhcmdldC5sZW5ndGggPT09IDIpIHtcblx0ICAgIHZhciBmaW5hbFcgPSB0YXJnZXQuZ2V0KF9fKTtcblx0ICAgIGlmIChmaW5hbFcgaW5zdGFuY2VvZiAkV2lsZGNhcmRTZXF1ZW5jZSkge1xuXHRcdGZvciAodmFyIGtleSBpbiB0YXJnZXQuZW50cmllcykge1xuXHRcdCAgICBpZiAoKGtleSAhPT0gX18pICYmIGlzX2tleUNsb3NlKGtleSkpIHtcblx0XHRcdHZhciBrID0gdGFyZ2V0LmdldChrZXkpO1xuXHRcdFx0aWYgKG1hdGNoZXJFcXVhbHMoaywgZmluYWxXLm1hdGNoZXIpKSB7XG5cdFx0XHQgICAgcmV0dXJuIGZpbmFsVztcblx0XHRcdH1cblx0XHQgICAgfVxuXHRcdH1cblx0ICAgIH1cblx0fVxuXG5cdHJldHVybiB0YXJnZXQuZW1wdHlHdWFyZCgpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHdhbGtXaWxkKGtleSwgaywgdykge1xuXHRpZiAoaXNfZW1wdHlNYXRjaGVyKHcpKSByZXR1cm4gaztcblx0aWYgKGlzX2tleU9wZW4oa2V5KSkgcmV0dXJuIHdhbGsoaywgcndpbGRzZXEodykpO1xuXHRpZiAoaXNfa2V5Q2xvc2Uoa2V5KSkge1xuXHQgICAgaWYgKHcgaW5zdGFuY2VvZiAkV2lsZGNhcmRTZXF1ZW5jZSkgcmV0dXJuIHdhbGsoaywgdy5tYXRjaGVyKTtcblx0ICAgIHJldHVybiBrO1xuXHR9XG5cdHJldHVybiB3YWxrKGssIHcpO1xuICAgIH1cbn1cblxuLy8gUmV0dXJucyBudWxsIG9uIGZhaWxlZCBtYXRjaCwgb3RoZXJ3aXNlIHRoZSBhcHByb3ByaWF0ZSBzdWNjZXNzXG4vLyB2YWx1ZSBjb250YWluZWQgaW4gdGhlIG1hdGNoZXIgci5cbmZ1bmN0aW9uIG1hdGNoVmFsdWUociwgdikge1xuICAgIHZhciBmYWlsdXJlUmVzdWx0ID0gbnVsbDtcblxuICAgIHZhciB2cyA9IFt2XTtcbiAgICB2YXIgc3RhY2sgPSBbW11dO1xuXG4gICAgd2hpbGUgKCFpc19lbXB0eU1hdGNoZXIocikpIHtcblx0aWYgKHIgaW5zdGFuY2VvZiAkV2lsZGNhcmRTZXF1ZW5jZSkge1xuXHQgICAgaWYgKHN0YWNrLmxlbmd0aCA9PT0gMCkgcmV0dXJuIGZhaWx1cmVSZXN1bHQ7XG5cdCAgICB2cyA9IHN0YWNrLnBvcCgpO1xuXHQgICAgciA9IHIubWF0Y2hlcjtcblx0ICAgIGNvbnRpbnVlO1xuXHR9XG5cblx0aWYgKHIgaW5zdGFuY2VvZiAkU3VjY2Vzcykge1xuXHQgICAgaWYgKHZzLmxlbmd0aCA9PT0gMCAmJiBzdGFjay5sZW5ndGggPT09IDApIHJldHVybiByLnZhbHVlO1xuXHQgICAgcmV0dXJuIGZhaWx1cmVSZXN1bHQ7XG5cdH1cblxuXHRpZiAodnMubGVuZ3RoID09PSAwKSB7XG5cdCAgICBpZiAoc3RhY2subGVuZ3RoID09PSAwKSByZXR1cm4gZmFpbHVyZVJlc3VsdDtcblx0ICAgIHZzID0gc3RhY2sucG9wKCk7XG5cdCAgICByID0gci5nZXQoRU9BKTtcblx0ICAgIGNvbnRpbnVlO1xuXHR9XG5cblx0dmFyIHYgPSB2cy5zaGlmdCgpO1xuXG5cdGlmICh0eXBlb2YgdiA9PT0gJ3N0cmluZycgJiYgdi5zdWJzdHJpbmcoMCwgMikgPT09ICdfXycpIHtcblx0ICAgIGRpZShcIkNhbm5vdCBtYXRjaCBzcGVjaWFsIHN0cmluZyBzdGFydGluZyB3aXRoIF9fXCIpO1xuXHR9XG5cblx0aWYgKEFycmF5LmlzQXJyYXkodikpIHtcblx0ICAgIGlmIChTT0EgaW4gci5lbnRyaWVzKSB7XG5cdFx0ciA9IHIuZ2V0KFNPQSk7XG5cdFx0c3RhY2sucHVzaCh2cyk7XG5cdFx0dnMgPSBzaGFsbG93Q29weUFycmF5KHYpO1xuXHQgICAgfSBlbHNlIHtcblx0XHRyID0gci5nZXQoX18pO1xuXHQgICAgfVxuXHR9IGVsc2Uge1xuXHQgICAgdmFyIGtleTtcblx0ICAgIHRyeSB7XG5cdFx0a2V5ID0gSlNPTi5zdHJpbmdpZnkodik7XG5cdCAgICB9IGNhdGNoIChleG4pIHtcblx0XHQvLyBGb3IgZXhhbXBsZSwgdiBtaWdodCBiZSBjeWNsaWMsIGFzIGluIERPTSBldmVudHMuXG5cdFx0a2V5ID0gbnVsbDtcblx0ICAgIH1cblx0ICAgIGlmIChrZXkgaW4gci5lbnRyaWVzKSB7XG5cdFx0ciA9IHIuZ2V0KGtleSk7XG5cdCAgICB9IGVsc2Uge1xuXHRcdHIgPSByLmdldChfXyk7XG5cdCAgICB9XG5cdH1cbiAgICB9XG5cbiAgICByZXR1cm4gZmFpbHVyZVJlc3VsdDtcbn1cblxuLy8gVE9ETzogYmV0dGVyIG5hbWUgZm9yIHRoaXNcbmZ1bmN0aW9uIG1hdGNoTWF0Y2hlcihvMSwgbzIsIHNlZWQpIHtcbiAgICB2YXIgYWNjID0gdHlwZW9mIHNlZWQgPT09ICd1bmRlZmluZWQnID8ge30gOiBzZWVkOyAvLyB3aWxsIGJlIG1vZGlmaWVkIGluIHBsYWNlXG4gICAgd2FsayhvMSwgbzIpO1xuICAgIHJldHVybiBhY2M7XG5cbiAgICBmdW5jdGlvbiB3YWxrRmxpcHBlZChyMiwgcjEpIHsgcmV0dXJuIHdhbGsocjEsIHIyKTsgfVxuXG4gICAgZnVuY3Rpb24gd2FsayhyMSwgcjIpIHtcblx0aWYgKGlzX2VtcHR5TWF0Y2hlcihyMSkgfHwgaXNfZW1wdHlNYXRjaGVyKHIyKSkgcmV0dXJuO1xuXG5cdGlmIChyMSBpbnN0YW5jZW9mICRXaWxkY2FyZFNlcXVlbmNlKSB7XG5cdCAgICBpZiAocjIgaW5zdGFuY2VvZiAkV2lsZGNhcmRTZXF1ZW5jZSkge1xuXHRcdHdhbGsocjEubWF0Y2hlciwgcjIubWF0Y2hlcik7XG5cdFx0cmV0dXJuO1xuXHQgICAgfVxuXHQgICAgcjEgPSBleHBhbmRXaWxkc2VxKHIxLm1hdGNoZXIpO1xuXHR9IGVsc2UgaWYgKHIyIGluc3RhbmNlb2YgJFdpbGRjYXJkU2VxdWVuY2UpIHtcblx0ICAgIHIyID0gZXhwYW5kV2lsZHNlcShyMi5tYXRjaGVyKTtcblx0fVxuXG5cdGlmIChyMSBpbnN0YW5jZW9mICRTdWNjZXNzICYmIHIyIGluc3RhbmNlb2YgJFN1Y2Nlc3MpIHtcblx0ICAgIG1hdGNoTWF0Y2hlclN1Y2Nlc3NlcyhyMS52YWx1ZSwgcjIudmFsdWUsIGFjYyk7XG5cdCAgICByZXR1cm47XG5cdH1cblxuXHR2YXIgdzEgPSByMS5nZXQoX18pO1xuXHR2YXIgdzIgPSByMi5nZXQoX18pO1xuXHR3YWxrKHcxLCB3Mik7XG5cblx0ZnVuY3Rpb24gZXhhbWluZUtleShrZXkpIHtcblx0ICAgIGlmIChrZXkgIT09IF9fKSB7XG5cdFx0dmFyIGsxID0gcjEuZ2V0KGtleSk7XG5cdFx0dmFyIGsyID0gcjIuZ2V0KGtleSk7XG5cdFx0aWYgKGlzX2VtcHR5TWF0Y2hlcihrMSkpIHtcblx0XHQgICAgaWYgKGlzX2VtcHR5TWF0Y2hlcihrMikpIHtcblx0XHRcdHJldHVybjtcblx0XHQgICAgfSBlbHNlIHtcblx0XHRcdHdhbGtXaWxkKHdhbGssIHcxLCBrZXksIGsyKTtcblx0XHQgICAgfVxuXHRcdH0gZWxzZSB7XG5cdFx0ICAgIGlmIChpc19lbXB0eU1hdGNoZXIoazIpKSB7XG5cdFx0XHR3YWxrV2lsZCh3YWxrRmxpcHBlZCwgdzIsIGtleSwgazEpO1xuXHRcdCAgICB9IGVsc2Uge1xuXHRcdFx0d2FsayhrMSwgazIpO1xuXHRcdCAgICB9XG5cdFx0fVxuXHQgICAgfVxuXHR9XG5cblx0Ly8gT3B0aW1pemUgc2ltaWxhcmx5IHRvIGludGVyc2VjdCgpLlxuXHRpZiAoaXNfZW1wdHlNYXRjaGVyKHcxKSkge1xuXHQgICAgaWYgKGlzX2VtcHR5TWF0Y2hlcih3MikpIHtcblx0XHRmb3IgKHZhciBrZXkgaW4gKHIxLmxlbmd0aCA8IHIyLmxlbmd0aCA/IHIxIDogcjIpLmVudHJpZXMpIGV4YW1pbmVLZXkoa2V5KTtcblx0ICAgIH0gZWxzZSB7XG5cdFx0Zm9yICh2YXIga2V5IGluIHIxLmVudHJpZXMpIGV4YW1pbmVLZXkoa2V5KTtcblx0ICAgIH1cblx0fSBlbHNlIHtcblx0ICAgIGlmIChpc19lbXB0eU1hdGNoZXIodzIpKSB7XG5cdFx0Zm9yICh2YXIga2V5IGluIHIyLmVudHJpZXMpIGV4YW1pbmVLZXkoa2V5KTtcblx0ICAgIH0gZWxzZSB7XG5cdFx0Zm9yICh2YXIga2V5IGluIHIxLmVudHJpZXMpIGV4YW1pbmVLZXkoa2V5KTtcblx0XHRmb3IgKHZhciBrZXkgaW4gcjIuZW50cmllcykgZXhhbWluZUtleShrZXkpO1xuXHQgICAgfVxuXHR9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gd2Fsa1dpbGQod2Fsa2VyLCB3LCBrZXksIGspIHtcblx0aWYgKGlzX2VtcHR5TWF0Y2hlcih3KSkgcmV0dXJuO1xuXHRpZiAoaXNfa2V5T3BlbihrZXkpKSB7XG5cdCAgICB3YWxrZXIocndpbGRzZXEodyksIGspO1xuXHQgICAgcmV0dXJuO1xuXHR9XG5cdGlmIChpc19rZXlDbG9zZShrZXkpKSB7XG5cdCAgICBpZiAodyBpbnN0YW5jZW9mICRXaWxkY2FyZFNlcXVlbmNlKSB3YWxrZXIody5tYXRjaGVyLCBrKTtcblx0ICAgIHJldHVybjtcblx0fVxuXHR3YWxrZXIodywgayk7XG4gICAgfVxufVxuXG5mdW5jdGlvbiBhcHBlbmRNYXRjaGVyKG0sIG1UYWlsRm4pIHtcbiAgICByZXR1cm4gd2FsayhtKTtcblxuICAgIGZ1bmN0aW9uIHdhbGsobSkge1xuXHRpZiAoaXNfZW1wdHlNYXRjaGVyKG0pKSByZXR1cm4gZW1wdHlNYXRjaGVyO1xuXHRpZiAobSBpbnN0YW5jZW9mICRXaWxkY2FyZFNlcXVlbmNlKSByZXR1cm4gcndpbGRzZXEod2FsayhtLm1hdGNoZXIpKTtcblx0aWYgKG0gaW5zdGFuY2VvZiAkU3VjY2VzcykgZGllKFwiSWxsLWZvcm1lZCBtYXRjaGVyXCIpO1xuXG5cdHZhciB0YXJnZXQgPSBuZXcgJERpY3QoKTtcblx0Zm9yICh2YXIga2V5IGluIG0uZW50cmllcykge1xuXHQgICAgdmFyIGsgPSBtLmdldChrZXkpO1xuXHQgICAgaWYgKGlzX2tleUNsb3NlKGtleSkgJiYgKGsgaW5zdGFuY2VvZiAkU3VjY2VzcykpIHtcblx0XHR0YXJnZXQgPSB1bmlvbih0YXJnZXQsIG1UYWlsRm4oay52YWx1ZSkpO1xuXHQgICAgfSBlbHNlIHtcblx0XHRydXBkYXRlSW5wbGFjZSh0YXJnZXQsIGtleSwgd2FsayhrKSk7XG5cdCAgICB9XG5cdH1cblx0cmV0dXJuIHRhcmdldC5lbXB0eUd1YXJkKCk7XG4gICAgfVxufVxuXG5mdW5jdGlvbiByZWxhYmVsKG0sIGYpIHtcbiAgICByZXR1cm4gd2FsayhtKTtcblxuICAgIGZ1bmN0aW9uIHdhbGsobSkge1xuXHRpZiAoaXNfZW1wdHlNYXRjaGVyKG0pKSByZXR1cm4gZW1wdHlNYXRjaGVyO1xuXHRpZiAobSBpbnN0YW5jZW9mICRXaWxkY2FyZFNlcXVlbmNlKSByZXR1cm4gcndpbGRzZXEod2FsayhtLm1hdGNoZXIpKTtcblx0aWYgKG0gaW5zdGFuY2VvZiAkU3VjY2VzcykgcmV0dXJuIHJzdWNjZXNzKGYobS52YWx1ZSkpO1xuXG5cdHZhciB0YXJnZXQgPSBuZXcgJERpY3QoKTtcblx0Zm9yICh2YXIga2V5IGluIG0uZW50cmllcykge1xuXHQgICAgcnVwZGF0ZUlucGxhY2UodGFyZ2V0LCBrZXksIHdhbGsobS5nZXQoa2V5KSkpO1xuXHR9XG5cdHJldHVybiB0YXJnZXQuZW1wdHlHdWFyZCgpO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gY29tcGlsZVByb2plY3Rpb24oLyogcHJvamVjdGlvbiwgcHJvamVjdGlvbiwgLi4uICovKSB7XG4gICAgdmFyIG5hbWVzID0gW107XG4gICAgdmFyIGFjYyA9IFtdO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgYXJndW1lbnRzLmxlbmd0aDsgaSsrKSB7XG5cdHdhbGsoYXJndW1lbnRzW2ldKTtcbiAgICB9XG4gICAgYWNjLnB1c2goRU9BKTtcbiAgICByZXR1cm4ge25hbWVzOiBuYW1lcywgc3BlYzogYWNjfTtcblxuICAgIGZ1bmN0aW9uIHdhbGsocCkge1xuXHRpZiAoaXNDYXB0dXJlKHApKSB7XG5cdCAgICBuYW1lcy5wdXNoKGNhcHR1cmVOYW1lKHApKTtcblx0ICAgIGFjYy5wdXNoKFNPQyk7XG5cdCAgICB3YWxrKGNhcHR1cmVQYXR0ZXJuKHApKTtcblx0ICAgIGFjYy5wdXNoKEVPQyk7XG5cdCAgICByZXR1cm47XG5cdH1cblxuXHRpZiAoQXJyYXkuaXNBcnJheShwKSkge1xuXHQgICAgYWNjLnB1c2goU09BKTtcblx0ICAgIGZvciAodmFyIGkgPSAwOyBpIDwgcC5sZW5ndGg7IGkrKykge1xuXHRcdHdhbGsocFtpXSk7XG5cdCAgICB9XG5cdCAgICBhY2MucHVzaChFT0EpO1xuXHQgICAgcmV0dXJuO1xuXHR9XG5cblx0aWYgKHAgaW5zdGFuY2VvZiAkRW1iZWRkZWQpIHtcblx0ICAgIGRpZShcIkNhbm5vdCBlbWJlZCBtYXRjaGVyIGluIHByb2plY3Rpb25cIik7XG5cdH0gZWxzZSB7XG5cdCAgICBpZiAocCA9PT0gX18pIHtcblx0XHRhY2MucHVzaChwKTtcblx0ICAgIH0gZWxzZSB7XG5cdFx0YWNjLnB1c2goSlNPTi5zdHJpbmdpZnkocCkpO1xuXHQgICAgfVxuXHR9XG4gICAgfVxufVxuXG5mdW5jdGlvbiBwcm9qZWN0aW9uVG9QYXR0ZXJuKHApIHtcbiAgICByZXR1cm4gd2FsayhwKTtcblxuICAgIGZ1bmN0aW9uIHdhbGsocCkge1xuXHRpZiAoaXNDYXB0dXJlKHApKSByZXR1cm4gd2FsayhjYXB0dXJlUGF0dGVybihwKSk7XG5cblx0aWYgKEFycmF5LmlzQXJyYXkocCkpIHtcblx0ICAgIHZhciByZXN1bHQgPSBbXTtcblx0ICAgIGZvciAodmFyIGkgPSAwOyBpIDwgcC5sZW5ndGg7IGkrKykge1xuXHRcdHJlc3VsdC5wdXNoKHdhbGsocFtpXSkpO1xuXHQgICAgfVxuXHQgICAgcmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdGlmIChwIGluc3RhbmNlb2YgJEVtYmVkZGVkKSB7XG5cdCAgICByZXR1cm4gcC5tYXRjaGVyO1xuXHR9IGVsc2Uge1xuXHQgICAgcmV0dXJuIHA7XG5cdH1cbiAgICB9XG59XG5cbmZ1bmN0aW9uIHByb2plY3QobSwgY29tcGlsZWRQcm9qZWN0aW9uKSB7XG4gICAgdmFyIHNwZWMgPSBjb21waWxlZFByb2plY3Rpb24uc3BlYztcbiAgICByZXR1cm4gd2FsayhmYWxzZSwgbSwgMCk7XG5cbiAgICBmdW5jdGlvbiB3YWxrKGlzQ2FwdHVyaW5nLCBtLCBzcGVjSW5kZXgpIHtcblx0aWYgKHNwZWNJbmRleCA+PSBzcGVjLmxlbmd0aCkge1xuXHQgICAgaWYgKGlzQ2FwdHVyaW5nKSBkaWUoXCJCYWQgc3BlY2lmaWNhdGlvbjogdW5jbG9zZWQgY2FwdHVyZVwiKTtcblx0ICAgIGlmIChtIGluc3RhbmNlb2YgJFN1Y2Nlc3MpIHtcblx0XHRyZXR1cm4gcnNlcShFT0EsIHJzdWNjZXNzKHByb2plY3RTdWNjZXNzKG0udmFsdWUpKSk7XG5cdCAgICB9IGVsc2Uge1xuXHRcdHJldHVybiBlbXB0eU1hdGNoZXI7XG5cdCAgICB9XG5cdH1cblxuXHRpZiAoaXNfZW1wdHlNYXRjaGVyKG0pKSByZXR1cm4gZW1wdHlNYXRjaGVyO1xuXG5cdHZhciBpdGVtID0gc3BlY1tzcGVjSW5kZXhdO1xuXHR2YXIgbmV4dEluZGV4ID0gc3BlY0luZGV4ICsgMTtcblxuXHRpZiAoaXRlbSA9PT0gRU9DKSB7XG5cdCAgICBpZiAoIWlzQ2FwdHVyaW5nKSBkaWUoXCJCYWQgc3BlY2lmaWNhdGlvbjogdW5lcHhlY3RlZCBFT0NcIik7XG5cdCAgICByZXR1cm4gd2FsayhmYWxzZSwgbSwgbmV4dEluZGV4KTtcblx0fVxuXG5cdGlmIChpdGVtID09PSBTT0MpIHtcblx0ICAgIGlmIChpc0NhcHR1cmluZykgZGllKFwiQmFkIHNwZWNpZmljYXRpb246IG5lc3RlZCBjYXB0dXJlXCIpO1xuXHQgICAgcmV0dXJuIHdhbGsodHJ1ZSwgbSwgbmV4dEluZGV4KTtcblx0fVxuXG5cdGlmIChpdGVtID09PSBfXykge1xuXHQgICAgaWYgKG0gaW5zdGFuY2VvZiAkV2lsZGNhcmRTZXF1ZW5jZSkge1xuXHRcdGlmIChpc0NhcHR1cmluZykge1xuXHRcdCAgICByZXR1cm4gcndpbGQod2Fsayhpc0NhcHR1cmluZywgbSwgbmV4dEluZGV4KSk7XG5cdFx0fSBlbHNlIHtcblx0XHQgICAgcmV0dXJuIHdhbGsoaXNDYXB0dXJpbmcsIG0sIG5leHRJbmRleCk7XG5cdFx0fVxuXHQgICAgfVxuXG5cdCAgICBpZiAobSBpbnN0YW5jZW9mICRTdWNjZXNzKSB7XG5cdFx0cmV0dXJuIGVtcHR5TWF0Y2hlcjtcblx0ICAgIH1cblxuXHQgICAgdmFyIHRhcmdldDtcblx0ICAgIGlmIChpc0NhcHR1cmluZykge1xuXHRcdHRhcmdldCA9IG5ldyAkRGljdCgpO1xuXHRcdHJ1cGRhdGVJbnBsYWNlKHRhcmdldCwgX18sIHdhbGsoaXNDYXB0dXJpbmcsIG0uZ2V0KF9fKSwgbmV4dEluZGV4KSk7XG5cdFx0Zm9yICh2YXIga2V5IGluIG0uZW50cmllcykge1xuXHRcdCAgICBpZiAoa2V5ICE9PSBfXykge1xuXHRcdFx0dmFyIG1rID0gbS5nZXQoa2V5KTtcblx0XHRcdGlmIChpc19rZXlPcGVuKGtleSkpIHtcblx0XHRcdCAgICBmdW5jdGlvbiBjb250KG1rMikgeyByZXR1cm4gd2Fsayhpc0NhcHR1cmluZywgbWsyLCBuZXh0SW5kZXgpOyB9XG5cdFx0XHQgICAgcnVwZGF0ZUlucGxhY2UodGFyZ2V0LCBrZXksIGNhcHR1cmVOZXN0ZWQobWssIGNvbnQpKTtcblx0XHRcdH0gZWxzZSBpZiAoaXNfa2V5Q2xvc2Uoa2V5KSkge1xuXHRcdFx0ICAgIC8vIGRvIG5vdGhpbmdcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHQgICAgcnVwZGF0ZUlucGxhY2UodGFyZ2V0LCBrZXksIHdhbGsoaXNDYXB0dXJpbmcsIG1rLCBuZXh0SW5kZXgpKTtcblx0XHRcdH1cblx0XHQgICAgfVxuXHRcdH1cblx0ICAgIH0gZWxzZSB7XG5cdFx0dGFyZ2V0ID0gd2Fsayhpc0NhcHR1cmluZywgbS5nZXQoX18pLCBuZXh0SW5kZXgpO1xuXHRcdGZvciAodmFyIGtleSBpbiBtLmVudHJpZXMpIHtcblx0XHQgICAgaWYgKGtleSAhPT0gX18pIHtcblx0XHRcdHZhciBtayA9IG0uZ2V0KGtleSk7XG5cdFx0XHRpZiAoaXNfa2V5T3BlbihrZXkpKSB7XG5cdFx0XHQgICAgZnVuY3Rpb24gY29udChtazIpIHsgcmV0dXJuIHdhbGsoaXNDYXB0dXJpbmcsIG1rMiwgbmV4dEluZGV4KTsgfVxuXHRcdFx0ICAgIHRhcmdldCA9IHVuaW9uKHRhcmdldCwgc2tpcE5lc3RlZChtaywgY29udCkpO1xuXHRcdFx0fSBlbHNlIGlmIChpc19rZXlDbG9zZShrZXkpKSB7XG5cdFx0XHQgICAgLy8gZG8gbm90aGluZ1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdCAgICB0YXJnZXQgPSB1bmlvbih0YXJnZXQsIHdhbGsoaXNDYXB0dXJpbmcsIG1rLCBuZXh0SW5kZXgpKTtcblx0XHRcdH1cblx0XHQgICAgfVxuXHRcdH1cblx0ICAgIH1cblx0ICAgIHJldHVybiB0YXJnZXQ7XG5cdH1cblxuXHR2YXIgcmVzdWx0O1xuXHRpZiAobSBpbnN0YW5jZW9mICRXaWxkY2FyZFNlcXVlbmNlKSB7XG5cdCAgICBpZiAoaXNfa2V5T3BlbihpdGVtKSkge1xuXHRcdHJlc3VsdCA9IHdhbGsoaXNDYXB0dXJpbmcsIHJ3aWxkc2VxKG0pLCBuZXh0SW5kZXgpO1xuXHQgICAgfSBlbHNlIGlmIChpc19rZXlDbG9zZShpdGVtKSkge1xuXHRcdHJlc3VsdCA9IHdhbGsoaXNDYXB0dXJpbmcsIG0ubWF0Y2hlciwgbmV4dEluZGV4KTtcblx0ICAgIH0gZWxzZSB7XG5cdFx0cmVzdWx0ID0gd2Fsayhpc0NhcHR1cmluZywgbSwgbmV4dEluZGV4KTtcblx0ICAgIH1cblx0fSBlbHNlIGlmIChtIGluc3RhbmNlb2YgJFN1Y2Nlc3MpIHtcblx0ICAgIHJlc3VsdCA9IGVtcHR5TWF0Y2hlcjtcblx0fSBlbHNlIHtcblx0ICAgIGlmIChpc19rZXlPcGVuKGl0ZW0pKSB7XG5cdFx0cmVzdWx0ID0gd2Fsayhpc0NhcHR1cmluZywgcndpbGRzZXEobS5nZXQoX18pKSwgbmV4dEluZGV4KTtcblx0ICAgIH0gZWxzZSBpZiAoaXNfa2V5Q2xvc2UoaXRlbSkpIHtcblx0XHRyZXN1bHQgPSBlbXB0eU1hdGNoZXI7XG5cdCAgICB9IGVsc2Uge1xuXHRcdHJlc3VsdCA9IHdhbGsoaXNDYXB0dXJpbmcsIG0uZ2V0KF9fKSwgbmV4dEluZGV4KTtcblx0ICAgIH1cblx0ICAgIHJlc3VsdCA9IHVuaW9uKHJlc3VsdCwgd2Fsayhpc0NhcHR1cmluZywgbS5nZXQoaXRlbSksIG5leHRJbmRleCkpO1xuXHR9XG5cdGlmIChpc0NhcHR1cmluZykge1xuXHQgICAgcmVzdWx0ID0gcnNlcShpdGVtLCByZXN1bHQpO1xuXHR9XG5cdHJldHVybiByZXN1bHQ7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gY2FwdHVyZU5lc3RlZChtLCBjb250KSB7XG5cdGlmIChtIGluc3RhbmNlb2YgJFdpbGRjYXJkU2VxdWVuY2UpIHtcblx0ICAgIHJldHVybiByd2lsZHNlcShjb250KG0ubWF0Y2hlcikpO1xuXHR9XG5cblx0aWYgKGlzX2VtcHR5TWF0Y2hlcihtKSB8fCAobSBpbnN0YW5jZW9mICRTdWNjZXNzKSkge1xuXHQgICAgcmV0dXJuIGVtcHR5TWF0Y2hlcjtcblx0fVxuXG5cdHZhciB0YXJnZXQgPSBuZXcgJERpY3QoKTtcblx0cnVwZGF0ZUlucGxhY2UodGFyZ2V0LCBfXywgY2FwdHVyZU5lc3RlZChtLmdldChfXyksIGNvbnQpKTtcblx0Zm9yICh2YXIga2V5IGluIG0uZW50cmllcykge1xuXHQgICAgaWYgKGtleSAhPT0gX18pIHtcblx0XHR2YXIgbWsgPSBtLmdldChrZXkpO1xuXHRcdGlmIChpc19rZXlPcGVuKGtleSkpIHtcblx0XHQgICAgZnVuY3Rpb24gY29udDIobWsyKSB7IHJldHVybiBjYXB0dXJlTmVzdGVkKG1rMiwgY29udCk7IH1cblx0XHQgICAgcnVwZGF0ZUlucGxhY2UodGFyZ2V0LCBrZXksIGNhcHR1cmVOZXN0ZWQobWssIGNvbnQyKSk7XG5cdFx0fSBlbHNlIGlmIChpc19rZXlDbG9zZShrZXkpKSB7XG5cdFx0ICAgIHJ1cGRhdGVJbnBsYWNlKHRhcmdldCwga2V5LCBjb250KG1rKSk7XG5cdFx0fSBlbHNlIHtcblx0XHQgICAgcnVwZGF0ZUlucGxhY2UodGFyZ2V0LCBrZXksIGNhcHR1cmVOZXN0ZWQobWssIGNvbnQpKTtcblx0XHR9XG5cdCAgICB9XG5cdH1cblx0cmV0dXJuIHRhcmdldC5lbXB0eUd1YXJkKCk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gc2tpcE5lc3RlZChtLCBjb250KSB7XG5cdGlmIChtIGluc3RhbmNlb2YgJFdpbGRjYXJkU2VxdWVuY2UpIHtcblx0ICAgIHJldHVybiBjb250KG0ubWF0Y2hlcik7XG5cdH1cblxuXHRpZiAoaXNfZW1wdHlNYXRjaGVyKG0pIHx8IChtIGluc3RhbmNlb2YgJFN1Y2Nlc3MpKSB7XG5cdCAgICByZXR1cm4gZW1wdHlNYXRjaGVyO1xuXHR9XG5cblx0dmFyIHRhcmdldCA9IHNraXBOZXN0ZWQobS5nZXQoX18pLCBjb250KTtcblx0Zm9yICh2YXIga2V5IGluIG0uZW50cmllcykge1xuXHQgICAgaWYgKGtleSAhPT0gX18pIHtcblx0XHR2YXIgbWsgPSBtLmdldChrZXkpO1xuXHRcdGlmIChpc19rZXlPcGVuKGtleSkpIHtcblx0XHQgICAgZnVuY3Rpb24gY29udDIobWsyKSB7IHJldHVybiBza2lwTmVzdGVkKG1rMiwgY29udCk7IH1cblx0XHQgICAgdGFyZ2V0ID0gdW5pb24odGFyZ2V0LCBza2lwTmVzdGVkKG1rLCBjb250MikpO1xuXHRcdH0gZWxzZSBpZiAoaXNfa2V5Q2xvc2Uoa2V5KSkge1xuXHRcdCAgICB0YXJnZXQgPSB1bmlvbih0YXJnZXQsIGNvbnQobWspKTtcblx0XHR9IGVsc2Uge1xuXHRcdCAgICB0YXJnZXQgPSB1bmlvbih0YXJnZXQsIHNraXBOZXN0ZWQobWssIGNvbnQpKTtcblx0XHR9XG5cdCAgICB9XG5cdH1cblx0cmV0dXJuIHRhcmdldDtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIG1hdGNoZXJLZXlzKG0pIHtcbiAgICBpZiAoaXNfZW1wdHlNYXRjaGVyKG0pKSByZXR1cm4gW107XG4gICAgcmV0dXJuIHdhbGtTZXEobSwgZnVuY3Rpb24gKHZzcywgdnNrKSB7IHJldHVybiB2c3M7IH0pO1xuXG4gICAgZnVuY3Rpb24gd2FsayhtLCBrKSB7XG5cdGlmIChtIGluc3RhbmNlb2YgJFdpbGRjYXJkU2VxdWVuY2UpIHJldHVybiBudWxsO1xuXHRpZiAobSBpbnN0YW5jZW9mICRTdWNjZXNzKSByZXR1cm4gW107XG5cdGlmIChtLmhhcyhfXykpIHJldHVybiBudWxsO1xuXHR2YXIgYWNjID0gW107XG5cdGZvciAodmFyIGtleSBpbiBtLmVudHJpZXMpIHtcblx0ICAgIHZhciBtayA9IG0uZ2V0KGtleSk7XG5cdCAgICB2YXIgcGllY2U7XG5cdCAgICBpZiAoaXNfa2V5T3BlbihrZXkpKSB7XG5cdFx0ZnVuY3Rpb24gc2VxSyh2c3MsIHZzaykge1xuXHRcdCAgICB2YXIgYWNjID0gW107XG5cdFx0ICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdnNzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHR2YXIgdnMgPSB2c3NbaV07XG5cdFx0XHRhY2MgPSBhY2MuY29uY2F0KGsodHJhbnNmb3JtU2Vxcyh2cywga2V5KSwgdnNrKSk7XG5cdFx0ICAgIH1cblx0XHQgICAgcmV0dXJuIGFjYztcblx0XHR9XG5cdFx0cGllY2UgPSB3YWxrU2VxKG1rLCBzZXFLKTtcblx0ICAgIH0gZWxzZSBpZiAoaXNfa2V5Q2xvc2Uoa2V5KSkge1xuXHRcdGRpZShcIm1hdGNoZXJLZXlzOiBpbnRlcm5hbCBlcnJvcjogdW5leHBlY3RlZCBrZXktY2xvc2VcIik7XG5cdCAgICB9IGVsc2Uge1xuXHRcdHBpZWNlID0gayhKU09OLnBhcnNlKGtleSksIG1rKTtcblx0ICAgIH1cblx0ICAgIGlmIChwaWVjZSA9PSBudWxsKSByZXR1cm4gbnVsbDtcblx0ICAgIGFjYyA9IGFjYy5jb25jYXQocGllY2UpO1xuXHR9XG5cdHJldHVybiBhY2M7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gd2Fsa1NlcShtLCBrKSB7XG5cdGlmIChtIGluc3RhbmNlb2YgJFdpbGRjYXJkU2VxdWVuY2UpIHJldHVybiBudWxsO1xuXHRpZiAobSBpbnN0YW5jZW9mICRTdWNjZXNzKSByZXR1cm4gayhbXSwgZW1wdHlNYXRjaGVyKTsgLy8gVE9ETzogPz9cblx0aWYgKG0uaGFzKF9fKSkgcmV0dXJuIG51bGw7XG5cdHZhciBhY2MgPSBbXTtcblx0Zm9yICh2YXIga2V5IGluIG0uZW50cmllcykge1xuXHQgICAgdmFyIG1rID0gbS5nZXQoa2V5KTtcblx0ICAgIHZhciBwaWVjZTtcblx0ICAgIGlmIChpc19rZXlDbG9zZShrZXkpKSB7XG5cdFx0cGllY2UgPSBrKFtbXV0sIG1rKTtcblx0ICAgIH0gZWxzZSB7XG5cdFx0ZnVuY3Rpb24gb3V0ZXJLKHYsIHZrKSB7XG5cdFx0ICAgIHJldHVybiB3YWxrU2VxKHZrLCBpbm5lckspO1xuXHRcdCAgICBmdW5jdGlvbiBpbm5lcksodnNzLCB2c2spIHtcblx0XHRcdHZhciBhY2MgPSBbXTtcblx0XHRcdGZvciAodmFyIGkgPSAwOyBpIDwgdnNzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHQgICAgdmFyIHZzID0gc2hhbGxvd0NvcHlBcnJheSh2c3NbaV0pO1xuXHRcdFx0ICAgIHZzLnVuc2hpZnQodik7XG5cdFx0XHQgICAgYWNjLnB1c2godnMpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGsoYWNjLCB2c2spO1xuXHRcdCAgICB9XG5cdFx0fVxuXHRcdHBpZWNlID0gd2Fsayhyc2VxKGtleSwgbWspLCBvdXRlckspO1xuXHQgICAgfVxuXHQgICAgaWYgKHBpZWNlID09IG51bGwpIHJldHVybiBudWxsO1xuXHQgICAgYWNjID0gYWNjLmNvbmNhdChwaWVjZSk7XG5cdH1cblx0cmV0dXJuIGFjYztcbiAgICB9XG5cbiAgICBmdW5jdGlvbiB0cmFuc2Zvcm1TZXFzKHZzLCBvcGVuZXIpIHtcblx0aWYgKG9wZW5lciA9PT0gU09BKSByZXR1cm4gdnM7XG5cdGRpZShcIkludGVybmFsIGVycm9yOiB1bmtub3duIG9wZW5lciBcIiArIG9wZW5lcik7XG4gICAgfVxufVxuXG5mdW5jdGlvbiBtYXRjaGVyS2V5c1RvT2JqZWN0cyhtYXRjaGVyS2V5c1Jlc3VsdCwgY29tcGlsZWRQcm9qZWN0aW9uKSB7XG4gICAgaWYgKG1hdGNoZXJLZXlzUmVzdWx0ID09PSBudWxsKSByZXR1cm4gbnVsbDtcbiAgICB2YXIgcmVzdWx0ID0gW107XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBtYXRjaGVyS2V5c1Jlc3VsdC5sZW5ndGg7IGkrKykge1xuXHR2YXIgZSA9IG1hdGNoZXJLZXlzUmVzdWx0W2ldO1xuXHR2YXIgZCA9IHt9O1xuXHRmb3IgKHZhciBqID0gMDsgaiA8IGUubGVuZ3RoOyBqKyspIHtcblx0ICAgIGRbY29tcGlsZWRQcm9qZWN0aW9uLm5hbWVzW2pdIHx8ICgnJCcgKyBqKV0gPSBlW2pdO1xuXHR9XG5cdHJlc3VsdC5wdXNoKGQpO1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xufVxuXG5mdW5jdGlvbiBwcm9qZWN0T2JqZWN0cyhtLCBjb21waWxlZFByb2plY3Rpb24pIHtcbiAgICByZXR1cm4gbWF0Y2hlcktleXNUb09iamVjdHMobWF0Y2hlcktleXMocHJvamVjdChtLCBjb21waWxlZFByb2plY3Rpb24pKSwgY29tcGlsZWRQcm9qZWN0aW9uKTtcbn1cblxuZnVuY3Rpb24gcHJldHR5TWF0Y2hlcihtLCBpbml0aWFsSW5kZW50KSB7XG4gICAgdmFyIGFjYyA9IFtdO1xuICAgIHdhbGsoaW5pdGlhbEluZGVudCB8fCAwLCBtKTtcbiAgICByZXR1cm4gYWNjLmpvaW4oJycpO1xuXG4gICAgZnVuY3Rpb24gd2FsayhpLCBtKSB7XG5cdGlmIChpc19lbXB0eU1hdGNoZXIobSkpIHtcblx0ICAgIGFjYy5wdXNoKFwiOjo6IG5vIGZ1cnRoZXIgbWF0Y2hlcyBwb3NzaWJsZVwiKTtcblx0ICAgIHJldHVybjtcblx0fVxuXHRpZiAobSBpbnN0YW5jZW9mICRXaWxkY2FyZFNlcXVlbmNlKSB7XG5cdCAgICBhY2MucHVzaChcIi4uLj5cIik7XG5cdCAgICB3YWxrKGkgKyA0LCBtLm1hdGNoZXIpO1xuXHQgICAgcmV0dXJuO1xuXHR9XG5cdGlmIChtIGluc3RhbmNlb2YgJFN1Y2Nlc3MpIHtcblx0ICAgIHZhciB2cyA9IEpTT04uc3RyaW5naWZ5KHR5cGVvZiBtLnZhbHVlID09PSAnb2JqZWN0J1xuXHRcdFx0XHQgICAgPyBzZXRUb0FycmF5KG0udmFsdWUpXG5cdFx0XHRcdCAgICA6IG0udmFsdWUpO1xuXHQgICAgYWNjLnB1c2goXCJ7XCIgKyB2cyArIFwifVwiKTtcblx0ICAgIHJldHVybjtcblx0fVxuXG5cdGlmIChtLmxlbmd0aCA9PT0gMCkge1xuXHQgICAgYWNjLnB1c2goXCIgOjo6IGVtcHR5IGhhc2ghXCIpO1xuXHQgICAgcmV0dXJuO1xuXHR9XG5cblx0dmFyIG5lZWRTZXAgPSBmYWxzZTtcblx0dmFyIGtleXMgPSBtLnNvcnRlZEtleXMoKTtcblx0Zm9yICh2YXIga2V5aSA9IDA7IGtleWkgPCBrZXlzLmxlbmd0aDsga2V5aSsrKSB7XG5cdCAgICB2YXIga2V5ID0ga2V5c1trZXlpXTtcblx0ICAgIHZhciBrID0gbS5lbnRyaWVzW2tleV07XG5cdCAgICBpZiAobmVlZFNlcCkge1xuXHRcdGFjYy5wdXNoKFwiXFxuXCIpO1xuXHRcdGFjYy5wdXNoKGluZGVudFN0cihpKSk7XG5cdCAgICB9IGVsc2Uge1xuXHRcdG5lZWRTZXAgPSB0cnVlO1xuXHQgICAgfVxuXHQgICAgYWNjLnB1c2goXCIgXCIpO1xuXHQgICAgaWYgKGtleSA9PT0gX18pIGtleSA9ICfimIUnO1xuXHQgICAgaWYgKGtleSA9PT0gU09BKSBrZXkgPSAnPCc7XG5cdCAgICBpZiAoa2V5ID09PSBFT0EpIGtleSA9ICc+Jztcblx0ICAgIGFjYy5wdXNoKGtleSk7XG5cdCAgICB3YWxrKGkgKyBrZXkubGVuZ3RoICsgMSwgayk7XG5cdH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBpbmRlbnRTdHIoaSkge1xuXHRyZXR1cm4gbmV3IEFycmF5KGkgKyAxKS5qb2luKCcgJyk7IC8vIGV3d1xuICAgIH1cbn1cblxuZnVuY3Rpb24gc2VyaWFsaXplTWF0Y2hlcihtLCBzZXJpYWxpemVTdWNjZXNzKSB7XG4gICAgcmV0dXJuIHdhbGsobSk7XG4gICAgZnVuY3Rpb24gd2FsayhtKSB7XG5cdGlmIChpc19lbXB0eU1hdGNoZXIobSkpIHJldHVybiBbXTtcblx0aWYgKG0gaW5zdGFuY2VvZiAkV2lsZGNhcmRTZXF1ZW5jZSkge1xuXHQgICAgcmV0dXJuIFtcIi4uLilcIiwgd2FsayhtLm1hdGNoZXIpXTtcblx0fVxuXHRpZiAobSBpbnN0YW5jZW9mICRTdWNjZXNzKSB7XG5cdCAgICByZXR1cm4gW1wiXCIsIHNlcmlhbGl6ZVN1Y2Nlc3MobS52YWx1ZSldO1xuXHR9XG5cdHZhciBhY2MgPSBbXTtcblx0Zm9yICh2YXIga2V5IGluIG0uZW50cmllcykge1xuXHQgICAgdmFyIGsgPSBtLmVudHJpZXNba2V5XTtcblx0ICAgIGlmIChrZXkgPT09IF9fKSBrZXkgPSBbXCJfX1wiXTtcblx0ICAgIGVsc2UgaWYgKGtleSA9PT0gU09BKSBrZXkgPSBbXCIoXCJdO1xuXHQgICAgZWxzZSBpZiAoa2V5ID09PSBFT0EpIGtleSA9IFtcIilcIl07XG5cdCAgICBlbHNlIGtleSA9IEpTT04ucGFyc2Uoa2V5KTtcblx0ICAgIGFjYy5wdXNoKFtrZXksIHdhbGsoayldKTtcblx0fVxuXHRyZXR1cm4gYWNjO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gZGVzZXJpYWxpemVNYXRjaGVyKHIsIGRlc2VyaWFsaXplU3VjY2Vzcykge1xuICAgIHJldHVybiB3YWxrKHIpO1xuICAgIGZ1bmN0aW9uIHdhbGsocikge1xuXHRpZiAoci5sZW5ndGggPT09IDApIHJldHVybiBlbXB0eU1hdGNoZXI7XG5cdGlmIChyWzBdID09PSBcIi4uLilcIikgcmV0dXJuIHJ3aWxkc2VxKHdhbGsoclsxXSkpO1xuXHRpZiAoclswXSA9PT0gXCJcIikgcmV0dXJuIHJzdWNjZXNzKGRlc2VyaWFsaXplU3VjY2VzcyhyWzFdKSk7XG5cdHZhciBhY2MgPSBuZXcgJERpY3QoKTtcblx0Zm9yICh2YXIgaSA9IDA7IGkgPCByLmxlbmd0aDsgaSsrKSB7XG5cdCAgICB2YXIgcmtleSA9IHJbaV1bMF07XG5cdCAgICB2YXIgcmsgPSByW2ldWzFdO1xuXHQgICAgdmFyIGtleTtcblx0ICAgIGlmIChBcnJheS5pc0FycmF5KHJrZXkpKSB7XG5cdFx0c3dpdGNoIChya2V5WzBdKSB7XG5cdFx0Y2FzZSBcIl9fXCI6IGtleSA9IF9fOyBicmVhaztcblx0XHRjYXNlIFwiKFwiOiBrZXkgPSBTT0E7IGJyZWFrO1xuXHRcdGNhc2UgXCIpXCI6IGtleSA9IEVPQTsgYnJlYWs7XG5cdFx0ZGVmYXVsdDogZGllKFwiSW52YWxpZCBzZXJpYWxpemVkIHNwZWNpYWwga2V5OiBcIiArIHJrZXlbMF0pO1xuXHRcdH1cblx0ICAgIH0gZWxzZSB7XG5cdFx0a2V5ID0gSlNPTi5zdHJpbmdpZnkocmtleSk7XG5cdCAgICB9XG5cdCAgICBydXBkYXRlSW5wbGFjZShhY2MsIGtleSwgd2FsayhyaykpO1xuXHR9XG5cdHJldHVybiBhY2M7XG4gICAgfVxufVxuXG4vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cbi8vIEdlc3RhbHRzLlxuLy8gVE9ETzogc3VwcG9ydCBJbmZpbml0eSBhcyBhIGxldmVsIG51bWJlclxuXG5mdW5jdGlvbiBHZXN0YWx0TGV2ZWwoc3VicywgYWR2cykge1xuICAgIHRoaXMuc3Vic2NyaXB0aW9ucyA9IHN1YnM7XG4gICAgdGhpcy5hZHZlcnRpc2VtZW50cyA9IGFkdnM7XG59XG5cbkdlc3RhbHRMZXZlbC5wcm90b3R5cGUuaXNFbXB0eSA9IGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4gaXNfZW1wdHlNYXRjaGVyKHRoaXMuc3Vic2NyaXB0aW9ucykgJiYgaXNfZW1wdHlNYXRjaGVyKHRoaXMuYWR2ZXJ0aXNlbWVudHMpO1xufTtcblxuR2VzdGFsdExldmVsLnByb3RvdHlwZS5lcXVhbHMgPSBmdW5jdGlvbiAob3RoZXIpIHtcbiAgICByZXR1cm4gbWF0Y2hlckVxdWFscyh0aGlzLnN1YnNjcmlwdGlvbnMsIG90aGVyLnN1YnNjcmlwdGlvbnMpXG5cdCYmIG1hdGNoZXJFcXVhbHModGhpcy5hZHZlcnRpc2VtZW50cywgb3RoZXIuYWR2ZXJ0aXNlbWVudHMpO1xufTtcblxuR2VzdGFsdExldmVsLnByb3RvdHlwZS5wcmV0dHkgPSBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIGFjYyA9IFtdO1xuICAgIGlmICghaXNfZW1wdHlNYXRjaGVyKHRoaXMuc3Vic2NyaXB0aW9ucykpIHtcblx0YWNjLnB1c2goXCIgIC0gc3ViczpcIik7XG5cdGFjYy5wdXNoKHByZXR0eU1hdGNoZXIodGhpcy5zdWJzY3JpcHRpb25zLCA5KSk7XG5cdGFjYy5wdXNoKFwiXFxuXCIpO1xuICAgIH1cbiAgICBpZiAoIWlzX2VtcHR5TWF0Y2hlcih0aGlzLmFkdmVydGlzZW1lbnRzKSkge1xuXHRhY2MucHVzaChcIiAgLSBhZHZzOlwiKTtcblx0YWNjLnB1c2gocHJldHR5TWF0Y2hlcih0aGlzLmFkdmVydGlzZW1lbnRzLCA5KSk7XG5cdGFjYy5wdXNoKFwiXFxuXCIpO1xuICAgIH1cbiAgICByZXR1cm4gYWNjLmpvaW4oJycpO1xufTtcblxuZnVuY3Rpb24gc3RyYWlnaHRHZXN0YWx0TGV2ZWxPcChvcCkge1xuICAgIHJldHVybiBmdW5jdGlvbiAocDEsIHAyKSB7XG5cdHJldHVybiBuZXcgR2VzdGFsdExldmVsKG9wKHAxLnN1YnNjcmlwdGlvbnMsIHAyLnN1YnNjcmlwdGlvbnMpLFxuXHRcdFx0XHRvcChwMS5hZHZlcnRpc2VtZW50cywgcDIuYWR2ZXJ0aXNlbWVudHMpKTtcbiAgICB9O1xufTtcblxudmFyIGVtcHR5TGV2ZWwgPSBuZXcgR2VzdGFsdExldmVsKGVtcHR5TWF0Y2hlciwgZW1wdHlNYXRjaGVyKTtcbnZhciBlbXB0eU1ldGFMZXZlbCA9IFtdO1xuXG5mdW5jdGlvbiBHZXN0YWx0KG1ldGFMZXZlbHMpIHtcbiAgICB0aGlzLm1ldGFMZXZlbHMgPSBtZXRhTGV2ZWxzO1xufVxuXG5HZXN0YWx0LnByb3RvdHlwZS5nZXRNZXRhTGV2ZWwgPSBmdW5jdGlvbiAobikge1xuICAgIHJldHVybiB0aGlzLm1ldGFMZXZlbHNbbl0gfHwgZW1wdHlNZXRhTGV2ZWw7XG59O1xuXG5HZXN0YWx0LnByb3RvdHlwZS5nZXRMZXZlbCA9IGZ1bmN0aW9uIChtZXRhTGV2ZWwsIGxldmVsKSB7XG4gICAgcmV0dXJuIHRoaXMuZ2V0TWV0YUxldmVsKG1ldGFMZXZlbClbbGV2ZWxdIHx8IGVtcHR5TGV2ZWw7XG59O1xuXG5HZXN0YWx0LnByb3RvdHlwZS5tZXRhTGV2ZWxDb3VudCA9IGZ1bmN0aW9uICgpIHsgcmV0dXJuIHRoaXMubWV0YUxldmVscy5sZW5ndGg7IH07XG5HZXN0YWx0LnByb3RvdHlwZS5sZXZlbENvdW50ID0gZnVuY3Rpb24gKG4pIHsgcmV0dXJuIHRoaXMuZ2V0TWV0YUxldmVsKG4pLmxlbmd0aDsgfTtcblxuR2VzdGFsdC5wcm90b3R5cGUubWF0Y2hWYWx1ZSA9IGZ1bmN0aW9uIChib2R5LCBtZXRhTGV2ZWwsIGlzRmVlZGJhY2spIHtcbiAgICB2YXIgbGV2ZWxzID0gdGhpcy5nZXRNZXRhTGV2ZWwobWV0YUxldmVsKTtcbiAgICB2YXIgcGlkcyA9IHt9O1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbGV2ZWxzLmxlbmd0aDsgaSsrKSB7XG5cdHZhciBtYXRjaGVyID0gKGlzRmVlZGJhY2sgPyBsZXZlbHNbaV0uYWR2ZXJ0aXNlbWVudHMgOiBsZXZlbHNbaV0uc3Vic2NyaXB0aW9ucyk7XG5cdHNldFVuaW9uSW5wbGFjZShwaWRzLCBtYXRjaFZhbHVlKG1hdGNoZXIsIGJvZHkpKTtcbiAgICB9XG4gICAgcmV0dXJuIHNldFRvQXJyYXkocGlkcyk7XG59O1xuXG5HZXN0YWx0LnByb3RvdHlwZS5wcm9qZWN0ID0gZnVuY3Rpb24gKHNwZWMsIGdldEFkdmVydGlzZW1lbnRzLCBtZXRhTGV2ZWwsIGxldmVsKSB7XG4gICAgdmFyIGwgPSB0aGlzLmdldExldmVsKG1ldGFMZXZlbCB8IDAsIGxldmVsIHwgMCk7XG4gICAgdmFyIG1hdGNoZXIgPSAoZ2V0QWR2ZXJ0aXNlbWVudHMgPyBsLmFkdmVydGlzZW1lbnRzIDogbC5zdWJzY3JpcHRpb25zKTtcbiAgICByZXR1cm4gcHJvamVjdChtYXRjaGVyLCBzcGVjKTtcbn07XG5cbkdlc3RhbHQucHJvdG90eXBlLmRyb3AgPSBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIG1scyA9IHNoYWxsb3dDb3B5QXJyYXkodGhpcy5tZXRhTGV2ZWxzKTtcbiAgICBtbHMuc2hpZnQoKTtcbiAgICByZXR1cm4gbmV3IEdlc3RhbHQobWxzKTtcbn07XG5cbkdlc3RhbHQucHJvdG90eXBlLmxpZnQgPSBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIG1scyA9IHNoYWxsb3dDb3B5QXJyYXkodGhpcy5tZXRhTGV2ZWxzKTtcbiAgICBtbHMudW5zaGlmdChlbXB0eU1ldGFMZXZlbCk7XG4gICAgcmV0dXJuIG5ldyBHZXN0YWx0KG1scyk7XG59O1xuXG5HZXN0YWx0LnByb3RvdHlwZS5lcXVhbHMgPSBmdW5jdGlvbiAob3RoZXIpIHtcbiAgICBpZiAodGhpcy5tZXRhTGV2ZWxzLmxlbmd0aCAhPT0gb3RoZXIubWV0YUxldmVscy5sZW5ndGgpIHJldHVybiBmYWxzZTtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMubWV0YUxldmVscy5sZW5ndGg7IGkrKykge1xuXHR2YXIgbHMxID0gdGhpcy5tZXRhTGV2ZWxzW2ldO1xuXHR2YXIgbHMyID0gb3RoZXIubWV0YUxldmVsc1tpXTtcblx0aWYgKGxzMS5sZW5ndGggIT09IGxzMi5sZW5ndGgpIHJldHVybiBmYWxzZTtcblx0Zm9yICh2YXIgaiA9IDA7IGogPCBsczEubGVuZ3RoOyBqKyspIHtcblx0ICAgIHZhciBwMSA9IGxzMVtqXTtcblx0ICAgIHZhciBwMiA9IGxzMltqXTtcblx0ICAgIGlmICghcDEuZXF1YWxzKHAyKSkgcmV0dXJuIGZhbHNlO1xuXHR9XG4gICAgfVxuICAgIHJldHVybiB0cnVlO1xufTtcblxuZnVuY3Rpb24gc2ltcGxlR2VzdGFsdChpc0FkdiwgcGF0LCBtZXRhTGV2ZWwsIGxldmVsKSB7XG4gICAgbWV0YUxldmVsID0gbWV0YUxldmVsIHx8IDA7XG4gICAgbGV2ZWwgPSBsZXZlbCB8fCAwO1xuICAgIHZhciBtYXRjaGVyID0gY29tcGlsZVBhdHRlcm4odHJ1ZSwgcGF0KTtcbiAgICB2YXIgbCA9IG5ldyBHZXN0YWx0TGV2ZWwoaXNBZHYgPyBlbXB0eU1hdGNoZXIgOiBtYXRjaGVyLFxuXHRcdFx0ICAgICBpc0FkdiA/IG1hdGNoZXIgOiBlbXB0eU1hdGNoZXIpO1xuICAgIHZhciBsZXZlbHMgPSBbbF07XG4gICAgd2hpbGUgKGxldmVsLS0pIHsgbGV2ZWxzLnVuc2hpZnQoZW1wdHlMZXZlbCk7IH1cbiAgICB2YXIgbWV0YUxldmVscyA9IFtsZXZlbHNdO1xuICAgIHdoaWxlIChtZXRhTGV2ZWwtLSkgeyBtZXRhTGV2ZWxzLnVuc2hpZnQoZW1wdHlNZXRhTGV2ZWwpOyB9XG4gICAgcmV0dXJuIG5ldyBHZXN0YWx0KG1ldGFMZXZlbHMpO1xufVxuXG52YXIgZW1wdHlHZXN0YWx0ID0gbmV3IEdlc3RhbHQoW10pO1xuXG4vLyBOb3QgcXVpdGUgd2hhdCBpdCBzYXlzIG9uIHRoZSB0aW4gLSB0aGUgdHJ1ZSBmdWxsR2VzdGFsdFxuLy8gd291bGRuJ3QgYmUgcGFyYW1ldGVyaXplZCBvbiB0aGUgbnVtYmVyIG9mIGxldmVscyBhbmRcbi8vIG1ldGFsZXZlbHMsIGJ1dCBpbnN0ZWFkIHdvdWxkIGJlIGZ1bGwgYXQgKmFsbCogbGV2ZWxzIGFuZFxuLy8gbWV0YWxldmVscy4gT3VyIHJlcHJlc2VudGF0aW9uIGxlYWtzIHRocm91Z2ggaW50byB0aGUgaW50ZXJmYWNlXG4vLyBoZXJlIDotL1xuZnVuY3Rpb24gZnVsbEdlc3RhbHQobk1ldGFsZXZlbHMsIG5MZXZlbHMpIHtcbiAgICB2YXIgbWF0Y2hlciA9IGNvbXBpbGVQYXR0ZXJuKHRydWUsIF9fKTtcbiAgICB2YXIgbCA9IG5ldyBHZXN0YWx0TGV2ZWwobWF0Y2hlciwgbWF0Y2hlcik7XG4gICAgdmFyIGxldmVscyA9IFtdO1xuICAgIHdoaWxlIChuTGV2ZWxzLS0pIHsgbGV2ZWxzLnB1c2gobCk7IH1cbiAgICB2YXIgbWV0YUxldmVscyA9IFtdO1xuICAgIHdoaWxlIChuTWV0YWxldmVscy0tKSB7IG1ldGFMZXZlbHMucHVzaChsZXZlbHMpOyB9XG4gICAgcmV0dXJuIG5ldyBHZXN0YWx0KG1ldGFMZXZlbHMpO1xufVxuXG5HZXN0YWx0LnByb3RvdHlwZS5pc0VtcHR5ID0gZnVuY3Rpb24gKCkge1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5tZXRhTGV2ZWxzLmxlbmd0aDsgaSsrKSB7XG5cdHZhciBsZXZlbHMgPSB0aGlzLm1ldGFMZXZlbHNbaV07XG5cdGZvciAodmFyIGogPSAwOyBqIDwgbGV2ZWxzLmxlbmd0aDsgaisrKSB7XG5cdCAgICBpZiAoIWxldmVsc1tqXS5pc0VtcHR5KCkpIHJldHVybiBmYWxzZTtcblx0fVxuICAgIH1cbiAgICByZXR1cm4gdHJ1ZTtcbn07XG5cbmZ1bmN0aW9uIG1heWJlUHVzaExldmVsKGxldmVscywgaSwgbGV2ZWwpIHtcbiAgICBpZiAoIWxldmVsLmlzRW1wdHkoKSkge1xuXHR3aGlsZSAobGV2ZWxzLmxlbmd0aCA8IGkpIGxldmVscy5wdXNoKGVtcHR5TGV2ZWwpO1xuXHRsZXZlbHMucHVzaChsZXZlbCk7XG4gICAgfVxufVxuXG5mdW5jdGlvbiBtYXliZVB1c2hNZXRhTGV2ZWwobWV0YUxldmVscywgaSwgbWV0YUxldmVsKSB7XG4gICAgaWYgKG1ldGFMZXZlbC5sZW5ndGggPiAwKSB7XG5cdHdoaWxlIChtZXRhTGV2ZWxzLmxlbmd0aCA8IGkpIG1ldGFMZXZlbHMucHVzaChlbXB0eU1ldGFMZXZlbCk7XG5cdG1ldGFMZXZlbHMucHVzaChtZXRhTGV2ZWwpO1xuICAgIH1cbn1cblxuR2VzdGFsdC5wcm90b3R5cGUubWFwWmlwID0gZnVuY3Rpb24gKG90aGVyLCBsZW5ndGhDb21iaW5lciwgZikge1xuICAgIHZhciBtZXRhTGV2ZWxzID0gW107XG4gICAgdmFyIG1sczEgPSB0aGlzLm1ldGFMZXZlbHM7XG4gICAgdmFyIG1sczIgPSBvdGhlci5tZXRhTGV2ZWxzO1xuICAgIHZhciBubSA9IGxlbmd0aENvbWJpbmVyKG1sczEubGVuZ3RoLCBtbHMyLmxlbmd0aCk7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBubTsgaSsrKSB7XG5cdHZhciBsZXZlbHMgPSBbXTtcblx0dmFyIGxzMSA9IG1sczFbaV0gfHwgZW1wdHlNZXRhTGV2ZWw7XG5cdHZhciBsczIgPSBtbHMyW2ldIHx8IGVtcHR5TWV0YUxldmVsO1xuXHR2YXIgbmwgPSBsZW5ndGhDb21iaW5lcihsczEubGVuZ3RoLCBsczIubGVuZ3RoKTtcblx0Zm9yICh2YXIgaiA9IDA7IGogPCBubDsgaisrKSB7XG5cdCAgICB2YXIgcDEgPSBsczFbal0gfHwgZW1wdHlMZXZlbDtcblx0ICAgIHZhciBwMiA9IGxzMltqXSB8fCBlbXB0eUxldmVsO1xuXHQgICAgdmFyIHAgPSBmKHAxLCBwMik7XG5cdCAgICBtYXliZVB1c2hMZXZlbChsZXZlbHMsIGosIHApO1xuXHR9XG5cdG1heWJlUHVzaE1ldGFMZXZlbChtZXRhTGV2ZWxzLCBpLCBsZXZlbHMpO1xuICAgIH1cbiAgICByZXR1cm4gbmV3IEdlc3RhbHQobWV0YUxldmVscyk7XG59O1xuXG5HZXN0YWx0LnByb3RvdHlwZS51bmlvbjEgPSBmdW5jdGlvbiAob3RoZXIpIHtcbiAgICByZXR1cm4gdGhpcy5tYXBaaXAob3RoZXIsIE1hdGgubWF4LCBzdHJhaWdodEdlc3RhbHRMZXZlbE9wKHVuaW9uKSk7XG59O1xuXG5mdW5jdGlvbiBnZXN0YWx0VW5pb24oZ3MpIHtcbiAgICBpZiAoZ3MubGVuZ3RoID09PSAwKSByZXR1cm4gZW1wdHlHZXN0YWx0O1xuICAgIHZhciBhY2MgPSBnc1swXTtcbiAgICBmb3IgKHZhciBpID0gMTsgaSA8IGdzLmxlbmd0aDsgaSsrKSB7XG5cdGFjYyA9IGFjYy51bmlvbjEoZ3NbaV0pO1xuICAgIH1cbiAgICByZXR1cm4gYWNjO1xufVxuXG5HZXN0YWx0LnByb3RvdHlwZS51bmlvbiA9IGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4gYXJndW1lbnRzLmxlbmd0aCA+IDAgPyB0aGlzLnVuaW9uMShnZXN0YWx0VW5pb24oYXJndW1lbnRzKSkgOiB0aGlzO1xufTtcblxuLy8gQWNjdW11bGF0ZXMgbWF0Y2hlcnMgZnJvbSBoaWdoZXItbnVtYmVyZWQgbGV2ZWxzIGludG9cbi8vIGxvd2VyLW51bWJlcmVkIGxldmVscy5cbmZ1bmN0aW9uIHRlbGVzY29wZUxldmVscyhsZXZlbHMpIHtcbiAgICB2YXIgcmVzdWx0ID0gc2hhbGxvd0NvcHlBcnJheShsZXZlbHMpO1xuICAgIGZvciAodmFyIGkgPSByZXN1bHQubGVuZ3RoIC0gMjsgaSA+PSAwOyBpLS0pIHtcblx0cmVzdWx0W2ldID1cblx0ICAgIG5ldyBHZXN0YWx0TGV2ZWwodW5pb24ocmVzdWx0W2ldLnN1YnNjcmlwdGlvbnMsIHJlc3VsdFtpKzFdLnN1YnNjcmlwdGlvbnMpLFxuXHRcdFx0ICAgICB1bmlvbihyZXN1bHRbaV0uYWR2ZXJ0aXNlbWVudHMsIHJlc3VsdFtpKzFdLmFkdmVydGlzZW1lbnRzKSk7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG59O1xuXG5HZXN0YWx0LnByb3RvdHlwZS50ZWxlc2NvcGVkID0gZnVuY3Rpb24gKCkge1xuICAgIHZhciBtbHMgPSBbXTtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMubWV0YUxldmVscy5sZW5ndGg7IGkrKykge1xuXHRtbHMucHVzaCh0ZWxlc2NvcGVMZXZlbHModGhpcy5tZXRhTGV2ZWxzW2ldKSk7XG4gICAgfVxuICAgIHJldHVybiBuZXcgR2VzdGFsdChtbHMpO1xufTtcblxuR2VzdGFsdC5wcm90b3R5cGUuZmlsdGVyID0gZnVuY3Rpb24gKHBlcnNwZWN0aXZlKSB7XG4gICAgdmFyIG1ldGFMZXZlbHMgPSBbXTtcbiAgICB2YXIgbWxzMSA9IHRoaXMubWV0YUxldmVscztcbiAgICB2YXIgbWxzMiA9IHBlcnNwZWN0aXZlLm1ldGFMZXZlbHM7XG4gICAgdmFyIG5tID0gTWF0aC5taW4obWxzMS5sZW5ndGgsIG1sczIubGVuZ3RoKTtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IG5tOyBpKyspIHtcblx0dmFyIGxldmVscyA9IFtdO1xuXHR2YXIgbHMxID0gbWxzMVtpXSB8fCBlbXB0eU1ldGFMZXZlbDtcblx0dmFyIGxzMiA9IG1sczJbaV0gfHwgZW1wdHlNZXRhTGV2ZWw7XG5cdHZhciBubCA9IE1hdGgubWluKGxzMS5sZW5ndGgsIGxzMi5sZW5ndGggLSAxKTtcblx0Zm9yICh2YXIgaiA9IDA7IGogPCBubDsgaisrKSB7XG5cdCAgICB2YXIgcDEgPSBsczFbal0gfHwgZW1wdHlMZXZlbDtcblx0ICAgIHZhciBzdWJzID0gZW1wdHlNYXRjaGVyO1xuXHQgICAgdmFyIGFkdnMgPSBlbXB0eU1hdGNoZXI7XG5cdCAgICBmb3IgKHZhciBrID0gaiArIDE7IGsgPCBsczIubGVuZ3RoOyBrKyspIHtcblx0XHR2YXIgcDIgPSBsczJba10gfHwgZW1wdHlMZXZlbDtcblx0XHRzdWJzID0gdW5pb24oc3VicywgaW50ZXJzZWN0KHAxLnN1YnNjcmlwdGlvbnMsIHAyLmFkdmVydGlzZW1lbnRzKSk7XG5cdFx0YWR2cyA9IHVuaW9uKGFkdnMsIGludGVyc2VjdChwMS5hZHZlcnRpc2VtZW50cywgcDIuc3Vic2NyaXB0aW9ucykpO1xuXHQgICAgfVxuXHQgICAgbWF5YmVQdXNoTGV2ZWwobGV2ZWxzLCBqLCBuZXcgR2VzdGFsdExldmVsKHN1YnMsIGFkdnMpKTtcblx0fVxuXHRtYXliZVB1c2hNZXRhTGV2ZWwobWV0YUxldmVscywgaSwgbGV2ZWxzKTtcbiAgICB9XG4gICAgcmV0dXJuIG5ldyBHZXN0YWx0KG1ldGFMZXZlbHMpO1xufTtcblxuR2VzdGFsdC5wcm90b3R5cGUubWF0Y2ggPSBmdW5jdGlvbiAocGVyc3BlY3RpdmUpIHtcbiAgICB2YXIgcGlkcyA9IHt9O1xuICAgIHZhciBubSA9IE1hdGgubWluKHRoaXMubWV0YUxldmVscy5sZW5ndGgsIHBlcnNwZWN0aXZlLm1ldGFMZXZlbHMubGVuZ3RoKTtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IG5tOyBpKyspIHtcblx0dmFyIGxzMSA9IHRoaXMubWV0YUxldmVsc1tpXSB8fCBlbXB0eU1ldGFMZXZlbDtcblx0dmFyIGxzMiA9IHBlcnNwZWN0aXZlLm1ldGFMZXZlbHNbaV0gfHwgZW1wdHlNZXRhTGV2ZWw7XG5cdHZhciBubCA9IE1hdGgubWluKGxzMS5sZW5ndGgsIGxzMi5sZW5ndGggLSAxKTtcblx0Zm9yICh2YXIgaiA9IDA7IGogPCBubDsgaisrKSB7XG5cdCAgICB2YXIgcDEgPSBsczFbal0gfHwgZW1wdHlMZXZlbDtcblx0ICAgIGZvciAodmFyIGsgPSBqICsgMTsgayA8IGxzMi5sZW5ndGg7IGsrKykge1xuXHRcdHZhciBwMiA9IGxzMltrXSB8fCBlbXB0eUxldmVsO1xuXHRcdG1hdGNoTWF0Y2hlcihwMS5zdWJzY3JpcHRpb25zLCBwMi5hZHZlcnRpc2VtZW50cywgcGlkcyk7XG5cdFx0bWF0Y2hNYXRjaGVyKHAxLmFkdmVydGlzZW1lbnRzLCBwMi5zdWJzY3JpcHRpb25zLCBwaWRzKTtcblx0ICAgIH1cblx0fVxuICAgIH1cbiAgICByZXR1cm4gc2V0VG9BcnJheShwaWRzKTtcbn07XG5cbkdlc3RhbHQucHJvdG90eXBlLmVyYXNlUGF0aCA9IGZ1bmN0aW9uIChwYXRoKSB7XG4gICAgcmV0dXJuIHRoaXMubWFwWmlwKHBhdGgsIE1hdGgubWF4LCBzdHJhaWdodEdlc3RhbHRMZXZlbE9wKGVyYXNlUGF0aCkpO1xufTtcblxuZnVuY3Rpb24gbWFwTGV2ZWxzKGlucHV0TWV0YUxldmVscywgZiwgZW1wdHlDaGVjaywgaW5wdXRFbXB0eUxldmVsLCBvdXRwdXRFbXB0eUxldmVsKSB7XG4gICAgdmFyIG91dHB1dE1ldGFMZXZlbHMgPSBbXTtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGlucHV0TWV0YUxldmVscy5sZW5ndGg7IGkrKykge1xuXHR2YXIgbHMgPSBpbnB1dE1ldGFMZXZlbHNbaV07XG5cdHZhciBsZXZlbHMgPSBbXTtcblx0Zm9yICh2YXIgaiA9IDA7IGogPCBscy5sZW5ndGg7IGorKykge1xuXHQgICAgdmFyIHAgPSBmKGxzW2pdIHx8IGlucHV0RW1wdHlMZXZlbCwgaSwgaik7XG5cdCAgICBpZiAoIWVtcHR5Q2hlY2socCwgaSwgaikpIHtcblx0XHR3aGlsZSAobGV2ZWxzLmxlbmd0aCA8IGopIGxldmVscy5wdXNoKG91dHB1dEVtcHR5TGV2ZWwpO1xuXHRcdGxldmVscy5wdXNoKHApO1xuXHQgICAgfVxuXHR9XG5cdGlmIChsZXZlbHMubGVuZ3RoID4gMCkge1xuXHQgICAgd2hpbGUgKG91dHB1dE1ldGFMZXZlbHMubGVuZ3RoIDwgaSkgb3V0cHV0TWV0YUxldmVscy5wdXNoKGVtcHR5TWV0YUxldmVsKTtcblx0ICAgIG91dHB1dE1ldGFMZXZlbHMucHVzaChsZXZlbHMpO1xuXHR9XG4gICAgfVxuICAgIHJldHVybiBvdXRwdXRNZXRhTGV2ZWxzO1xufTtcblxuR2VzdGFsdC5wcm90b3R5cGUudHJhbnNmb3JtID0gZnVuY3Rpb24gKGYpIHtcbiAgICByZXR1cm4gbmV3IEdlc3RhbHQobWFwTGV2ZWxzKHRoaXMubWV0YUxldmVscywgZnVuY3Rpb24gKHAsIG1sLCBsKSB7XG5cdHJldHVybiBuZXcgR2VzdGFsdExldmVsKGYocC5zdWJzY3JpcHRpb25zLCBtbCwgbCwgZmFsc2UpLFxuXHRcdFx0XHRmKHAuYWR2ZXJ0aXNlbWVudHMsIG1sLCBsLCB0cnVlKSk7XG4gICAgfSwgZnVuY3Rpb24gKHApIHtcblx0cmV0dXJuIHAuaXNFbXB0eSgpO1xuICAgIH0sIGVtcHR5TGV2ZWwsIGVtcHR5TGV2ZWwpKTtcbn07XG5cbkdlc3RhbHQucHJvdG90eXBlLnN0cmlwTGFiZWwgPSBmdW5jdGlvbiAoKSB7XG4gICAgcmV0dXJuIHRoaXMudHJhbnNmb3JtKGZ1bmN0aW9uIChtKSB7IHJldHVybiByZWxhYmVsKG0sIGZ1bmN0aW9uICh2KSB7IHJldHVybiB0cnVlOyB9KTsgfSk7XG59O1xuXG5HZXN0YWx0LnByb3RvdHlwZS5sYWJlbCA9IGZ1bmN0aW9uIChwaWQpIHtcbiAgICB2YXIgcGlkcyA9IGFycmF5VG9TZXQoW3BpZF0pO1xuICAgIHJldHVybiB0aGlzLnRyYW5zZm9ybShmdW5jdGlvbiAobSkgeyByZXR1cm4gcmVsYWJlbChtLCBmdW5jdGlvbiAodikgeyByZXR1cm4gcGlkczsgfSk7IH0pO1xufTtcblxuR2VzdGFsdC5wcm90b3R5cGUucHJldHR5ID0gZnVuY3Rpb24gKCkge1xuICAgIHZhciBhY2MgPSBbXTtcbiAgICBpZiAodGhpcy5pc0VtcHR5KCkpIHtcblx0YWNjLnB1c2goXCJFTVBUWSBHRVNUQUxUXFxuXCIpO1xuICAgIH0gZWxzZSB7XG5cdGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5tZXRhTGV2ZWxzLmxlbmd0aDsgaSsrKSB7XG5cdCAgICB2YXIgbHMgPSB0aGlzLm1ldGFMZXZlbHNbaV07XG5cdCAgICBmb3IgKHZhciBqID0gMDsgaiA8IGxzLmxlbmd0aDsgaisrKSB7XG5cdFx0dmFyIHAgPSBsc1tqXTtcblx0XHRpZiAoIXAuaXNFbXB0eSgpKSB7XG5cdFx0ICAgIGFjYy5wdXNoKFwiR0VTVEFMVCBtZXRhbGV2ZWwgXCIgKyBpICsgXCIgbGV2ZWwgXCIgKyBqICsgXCI6XFxuXCIpO1xuXHRcdCAgICBhY2MucHVzaChwLnByZXR0eSgpKTtcblx0XHR9XG5cdCAgICB9XG5cdH1cbiAgICB9XG4gICAgcmV0dXJuIGFjYy5qb2luKCcnKTtcbn07XG5cbkdlc3RhbHQucHJvdG90eXBlLnNlcmlhbGl6ZSA9IGZ1bmN0aW9uIChzZXJpYWxpemVTdWNjZXNzKSB7XG4gICAgaWYgKHR5cGVvZiBzZXJpYWxpemVTdWNjZXNzID09PSAndW5kZWZpbmVkJykge1xuXHRzZXJpYWxpemVTdWNjZXNzID0gZnVuY3Rpb24gKHYpIHsgcmV0dXJuIHYgPT09IHRydWUgPyB0cnVlIDogc2V0VG9BcnJheSh2KTsgfTtcbiAgICB9XG4gICAgcmV0dXJuIFtcImdlc3RhbHRcIiwgbWFwTGV2ZWxzKHRoaXMubWV0YUxldmVscywgZnVuY3Rpb24gKHApIHtcblx0cmV0dXJuIFtzZXJpYWxpemVNYXRjaGVyKHAuc3Vic2NyaXB0aW9ucywgc2VyaWFsaXplU3VjY2VzcyksXG5cdFx0c2VyaWFsaXplTWF0Y2hlcihwLmFkdmVydGlzZW1lbnRzLCBzZXJpYWxpemVTdWNjZXNzKV07XG4gICAgfSwgZnVuY3Rpb24gKHByKSB7XG5cdHJldHVybiBwci5sZW5ndGggPT09IDIgJiYgcHJbMF0ubGVuZ3RoID09PSAwICYmIHByWzFdLmxlbmd0aCA9PT0gMDtcbiAgICB9LCBlbXB0eUxldmVsLCBbW10sW11dKV07XG59O1xuXG5mdW5jdGlvbiBkZXNlcmlhbGl6ZUdlc3RhbHQociwgZGVzZXJpYWxpemVTdWNjZXNzKSB7XG4gICAgaWYgKHR5cGVvZiBkZXNlcmlhbGl6ZVN1Y2Nlc3MgPT09ICd1bmRlZmluZWQnKSB7XG5cdGRlc2VyaWFsaXplU3VjY2VzcyA9IGZ1bmN0aW9uICh2KSB7IHJldHVybiB2ID09PSB0cnVlID8gdHJ1ZSA6IGFycmF5VG9TZXQodik7IH07XG4gICAgfVxuICAgIGlmIChyWzBdICE9PSBcImdlc3RhbHRcIikgZGllKFwiSW52YWxpZCBnZXN0YWx0IHNlcmlhbGl6YXRpb246IFwiICsgcik7XG4gICAgcmV0dXJuIG5ldyBHZXN0YWx0KG1hcExldmVscyhyWzFdLCBmdW5jdGlvbiAocHIpIHtcblx0cmV0dXJuIG5ldyBHZXN0YWx0TGV2ZWwoZGVzZXJpYWxpemVNYXRjaGVyKHByWzBdLCBkZXNlcmlhbGl6ZVN1Y2Nlc3MpLFxuXHRcdFx0XHRkZXNlcmlhbGl6ZU1hdGNoZXIocHJbMV0sIGRlc2VyaWFsaXplU3VjY2VzcykpO1xuICAgIH0sIGZ1bmN0aW9uIChwKSB7XG5cdHJldHVybiBwLmlzRW1wdHkoKTtcbiAgICB9LCBbW10sW11dLCBlbXB0eUxldmVsKSk7XG59XG5cbi8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuXG5tb2R1bGUuZXhwb3J0cy5fXyA9IF9fO1xubW9kdWxlLmV4cG9ydHMuYXJyYXlUb1NldCA9IGFycmF5VG9TZXQ7XG5tb2R1bGUuZXhwb3J0cy5zZXRUb0FycmF5ID0gc2V0VG9BcnJheTtcbm1vZHVsZS5leHBvcnRzLnNldFVuaW9uID0gc2V0VW5pb247XG5tb2R1bGUuZXhwb3J0cy5zZXRTdWJ0cmFjdCA9IHNldFN1YnRyYWN0O1xubW9kdWxlLmV4cG9ydHMuc2V0SW50ZXJzZWN0ID0gc2V0SW50ZXJzZWN0O1xubW9kdWxlLmV4cG9ydHMuc2V0RXF1YWwgPSBzZXRFcXVhbDtcbm1vZHVsZS5leHBvcnRzLmlzX2VtcHR5U2V0ID0gaXNfZW1wdHlTZXQ7XG5tb2R1bGUuZXhwb3J0cy4kQ2FwdHVyZSA9ICRDYXB0dXJlO1xubW9kdWxlLmV4cG9ydHMuXyQgPSBfJDtcbm1vZHVsZS5leHBvcnRzLmlzX2VtcHR5TWF0Y2hlciA9IGlzX2VtcHR5TWF0Y2hlcjtcbm1vZHVsZS5leHBvcnRzLmVtcHR5TWF0Y2hlciA9IGVtcHR5TWF0Y2hlcjtcbm1vZHVsZS5leHBvcnRzLmVtYmVkZGVkTWF0Y2hlciA9IGVtYmVkZGVkTWF0Y2hlcjtcbm1vZHVsZS5leHBvcnRzLmNvbXBpbGVQYXR0ZXJuID0gY29tcGlsZVBhdHRlcm47XG5tb2R1bGUuZXhwb3J0cy5tYXRjaFBhdHRlcm4gPSBtYXRjaFBhdHRlcm47XG5tb2R1bGUuZXhwb3J0cy51bmlvbiA9IHVuaW9uTjtcbm1vZHVsZS5leHBvcnRzLmludGVyc2VjdCA9IGludGVyc2VjdDtcbm1vZHVsZS5leHBvcnRzLmVyYXNlUGF0aCA9IGVyYXNlUGF0aDtcbm1vZHVsZS5leHBvcnRzLm1hdGNoVmFsdWUgPSBtYXRjaFZhbHVlO1xubW9kdWxlLmV4cG9ydHMubWF0Y2hNYXRjaGVyID0gbWF0Y2hNYXRjaGVyO1xubW9kdWxlLmV4cG9ydHMuYXBwZW5kTWF0Y2hlciA9IGFwcGVuZE1hdGNoZXI7XG5tb2R1bGUuZXhwb3J0cy5yZWxhYmVsID0gcmVsYWJlbDtcbm1vZHVsZS5leHBvcnRzLmNvbXBpbGVQcm9qZWN0aW9uID0gY29tcGlsZVByb2plY3Rpb247XG5tb2R1bGUuZXhwb3J0cy5wcm9qZWN0aW9uVG9QYXR0ZXJuID0gcHJvamVjdGlvblRvUGF0dGVybjtcbm1vZHVsZS5leHBvcnRzLnByb2plY3QgPSBwcm9qZWN0O1xubW9kdWxlLmV4cG9ydHMubWF0Y2hlcktleXMgPSBtYXRjaGVyS2V5cztcbm1vZHVsZS5leHBvcnRzLm1hdGNoZXJLZXlzVG9PYmplY3RzID0gbWF0Y2hlcktleXNUb09iamVjdHM7XG5tb2R1bGUuZXhwb3J0cy5wcm9qZWN0T2JqZWN0cyA9IHByb2plY3RPYmplY3RzO1xubW9kdWxlLmV4cG9ydHMubWF0Y2hlckVxdWFscyA9IG1hdGNoZXJFcXVhbHM7XG5tb2R1bGUuZXhwb3J0cy5wcmV0dHlNYXRjaGVyID0gcHJldHR5TWF0Y2hlcjtcbm1vZHVsZS5leHBvcnRzLnNlcmlhbGl6ZU1hdGNoZXIgPSBzZXJpYWxpemVNYXRjaGVyO1xubW9kdWxlLmV4cG9ydHMuZGVzZXJpYWxpemVNYXRjaGVyID0gZGVzZXJpYWxpemVNYXRjaGVyO1xuXG5tb2R1bGUuZXhwb3J0cy5HZXN0YWx0TGV2ZWwgPSBHZXN0YWx0TGV2ZWw7XG5tb2R1bGUuZXhwb3J0cy5HZXN0YWx0ID0gR2VzdGFsdDtcbm1vZHVsZS5leHBvcnRzLnNpbXBsZUdlc3RhbHQgPSBzaW1wbGVHZXN0YWx0O1xubW9kdWxlLmV4cG9ydHMuZW1wdHlHZXN0YWx0ID0gZW1wdHlHZXN0YWx0O1xubW9kdWxlLmV4cG9ydHMuZnVsbEdlc3RhbHQgPSBmdWxsR2VzdGFsdDtcbm1vZHVsZS5leHBvcnRzLmdlc3RhbHRVbmlvbiA9IGdlc3RhbHRVbmlvbjtcbm1vZHVsZS5leHBvcnRzLmRlc2VyaWFsaXplR2VzdGFsdCA9IGRlc2VyaWFsaXplR2VzdGFsdDtcbiIsInZhciBNaW5pbWFydCA9IHJlcXVpcmUoXCIuL21pbmltYXJ0LmpzXCIpO1xudmFyIFJvdXRlID0gTWluaW1hcnQuUm91dGU7XG52YXIgV29ybGQgPSBNaW5pbWFydC5Xb3JsZDtcbnZhciBzdWIgPSBNaW5pbWFydC5zdWI7XG52YXIgcHViID0gTWluaW1hcnQucHViO1xudmFyIF9fID0gTWluaW1hcnQuX187XG5cbmZ1bmN0aW9uIHNwYXduUm91dGluZ1RhYmxlV2lkZ2V0KHNlbGVjdG9yLCBmcmFnbWVudENsYXNzLCBkb21XcmFwLCBvYnNlcnZhdGlvbkxldmVsKSB7XG4gICAgb2JzZXJ2YXRpb25MZXZlbCA9IG9ic2VydmF0aW9uTGV2ZWwgfHwgMTA7XG4gICAgLy8gXiBhcmJpdHJhcnk6IHNob3VsZCBiZSBJbmZpbml0eSwgd2hlbiByb3V0ZS5qcyBzdXBwb3J0cyBpdC4gVE9ET1xuICAgIGRvbVdyYXAgPSBkb21XcmFwIHx8IE1pbmltYXJ0LkRPTS5kZWZhdWx0V3JhcEZ1bmN0aW9uO1xuXG4gICAgV29ybGQuc3Bhd24oe1xuXHRib290OiBmdW5jdGlvbiAoKSB7IHRoaXMudXBkYXRlU3RhdGUoKTsgfSxcblxuXHRzdGF0ZTogUm91dGUuZW1wdHlHZXN0YWx0LnNlcmlhbGl6ZSgpLFxuXHRuZXh0U3RhdGU6IFJvdXRlLmVtcHR5R2VzdGFsdC5zZXJpYWxpemUoKSxcblx0dGltZXI6IGZhbHNlLFxuXG5cdGxvY2FsR2VzdGFsdDogKHN1YiggICAgICAgZG9tV3JhcChzZWxlY3RvciwgZnJhZ21lbnRDbGFzcywgX18pLCAwLCAyKVxuXHRcdCAgICAgICAudW5pb24ocHViKGRvbVdyYXAoc2VsZWN0b3IsIGZyYWdtZW50Q2xhc3MsIF9fKSwgMCwgMikpXG5cdFx0ICAgICAgIC50ZWxlc2NvcGVkKCkpLFxuXG5cdGRpZ2VzdEdlc3RhbHQ6IGZ1bmN0aW9uIChnKSB7XG5cdCAgICByZXR1cm4gZy5zdHJpcExhYmVsKCkuZXJhc2VQYXRoKHRoaXMubG9jYWxHZXN0YWx0KS5zZXJpYWxpemUoKTtcblx0fSxcblxuXHR1cGRhdGVTdGF0ZTogZnVuY3Rpb24gKCkge1xuXHQgICAgdmFyIGVsdHMgPSBbXCJwcmVcIiwgUm91dGUuZGVzZXJpYWxpemVHZXN0YWx0KHRoaXMuc3RhdGUpLnByZXR0eSgpXTtcblx0ICAgIFdvcmxkLnVwZGF0ZVJvdXRlcyhbc3ViKF9fLCAwLCBvYnNlcnZhdGlvbkxldmVsKSxcblx0XHRcdFx0cHViKF9fLCAwLCBvYnNlcnZhdGlvbkxldmVsKSxcblx0XHRcdFx0cHViKGRvbVdyYXAoc2VsZWN0b3IsIGZyYWdtZW50Q2xhc3MsIGVsdHMpKV0pO1xuXHR9LFxuXG5cdGhhbmRsZUV2ZW50OiBmdW5jdGlvbiAoZSkge1xuXHQgICAgdmFyIHNlbGYgPSB0aGlzO1xuXHQgICAgaWYgKGUudHlwZSA9PT0gXCJyb3V0ZXNcIikge1xuXHRcdHNlbGYubmV4dFN0YXRlID0gc2VsZi5kaWdlc3RHZXN0YWx0KGUuZ2VzdGFsdCk7XG5cdFx0aWYgKHNlbGYudGltZXIpIHtcblx0XHQgICAgY2xlYXJUaW1lb3V0KHNlbGYudGltZXIpO1xuXHRcdCAgICBzZWxmLnRpbWVyID0gZmFsc2U7XG5cdFx0fVxuXHRcdHNlbGYudGltZXIgPSBzZXRUaW1lb3V0KFdvcmxkLndyYXAoZnVuY3Rpb24gKCkge1xuXHRcdCAgICBpZiAoSlNPTi5zdHJpbmdpZnkoc2VsZi5uZXh0U3RhdGUpICE9PSBKU09OLnN0cmluZ2lmeShzZWxmLnN0YXRlKSkge1xuXHRcdFx0c2VsZi5zdGF0ZSA9IHNlbGYubmV4dFN0YXRlO1xuXHRcdFx0c2VsZi51cGRhdGVTdGF0ZSgpO1xuXHRcdCAgICB9XG5cdFx0ICAgIHNlbGYudGltZXIgPSBmYWxzZTtcblx0XHR9KSwgNTApO1xuXHQgICAgfVxuXHR9XG4gICAgfSk7XG5cbn1cblxubW9kdWxlLmV4cG9ydHMuc3Bhd25Sb3V0aW5nVGFibGVXaWRnZXQgPSBzcGF3blJvdXRpbmdUYWJsZVdpZGdldDtcbiIsIi8vIEdlbmVyaWMgU3B5XG52YXIgTWluaW1hcnQgPSByZXF1aXJlKFwiLi9taW5pbWFydC5qc1wiKTtcbnZhciBXb3JsZCA9IE1pbmltYXJ0LldvcmxkO1xudmFyIHN1YiA9IE1pbmltYXJ0LnN1YjtcbnZhciBwdWIgPSBNaW5pbWFydC5wdWI7XG52YXIgX18gPSBNaW5pbWFydC5fXztcblxuZnVuY3Rpb24gU3B5KGxhYmVsLCB1c2VKc29uLCBvYnNlcnZhdGlvbkxldmVsKSB7XG4gICAgdGhpcy5sYWJlbCA9IGxhYmVsIHx8IFwiU1BZXCI7XG4gICAgdGhpcy5vYnNlcnZhdGlvbkxldmVsID0gb2JzZXJ2YXRpb25MZXZlbCB8fCAxMDsgLy8gYXJiaXRyYXJ5LiBTaG91bGQgYmUgSW5maW5pdHkuIFRPRE9cbiAgICB0aGlzLnVzZUpzb24gPSB1c2VKc29uO1xufVxuXG5TcHkucHJvdG90eXBlLmJvb3QgPSBmdW5jdGlvbiAoKSB7XG4gICAgV29ybGQudXBkYXRlUm91dGVzKFtzdWIoX18sIDAsIHRoaXMub2JzZXJ2YXRpb25MZXZlbCksIHB1YihfXywgMCwgdGhpcy5vYnNlcnZhdGlvbkxldmVsKV0pO1xufTtcblxuU3B5LnByb3RvdHlwZS5oYW5kbGVFdmVudCA9IGZ1bmN0aW9uIChlKSB7XG4gICAgc3dpdGNoIChlLnR5cGUpIHtcbiAgICBjYXNlIFwicm91dGVzXCI6XG5cdGNvbnNvbGUubG9nKHRoaXMubGFiZWwsIFwicm91dGVzXCIsIGUuZ2VzdGFsdC5wcmV0dHkoKSk7XG5cdGJyZWFrO1xuICAgIGNhc2UgXCJtZXNzYWdlXCI6XG5cdHZhciBtZXNzYWdlUmVwcjtcblx0dHJ5IHtcblx0ICAgIG1lc3NhZ2VSZXByID0gdGhpcy51c2VKc29uID8gSlNPTi5zdHJpbmdpZnkoZS5tZXNzYWdlKSA6IGUubWVzc2FnZTtcblx0fSBjYXRjaCAoZXhuKSB7XG5cdCAgICBtZXNzYWdlUmVwciA9IGUubWVzc2FnZTtcblx0fVxuXHRjb25zb2xlLmxvZyh0aGlzLmxhYmVsLCBcIm1lc3NhZ2VcIiwgbWVzc2FnZVJlcHIsIGUubWV0YUxldmVsLCBlLmlzRmVlZGJhY2spO1xuXHRicmVhaztcbiAgICBkZWZhdWx0OlxuXHRjb25zb2xlLmxvZyh0aGlzLmxhYmVsLCBcInVua25vd25cIiwgZSk7XG5cdGJyZWFrO1xuICAgIH1cbn07XG5cbm1vZHVsZS5leHBvcnRzLlNweSA9IFNweTtcbiIsIi8vIE1pbmltYWwgalF1ZXJ5aXNoIHV0aWxpdGllcy4gUmVpbXBsZW1lbnRlZCBiZWNhdXNlIGpRdWVyeSBuZWVkc1xuLy8gd2luZG93IHRvIGV4aXN0LCBhbmQgd2Ugd2FudCB0byBydW4gaW4gV2ViIFdvcmtlciBjb250ZXh0IGFzIHdlbGwuXG5cbmZ1bmN0aW9uIGV4dGVuZCh3aGF0LCBfd2l0aCkge1xuICBmb3IgKHZhciBwcm9wIGluIF93aXRoKSB7XG4gICAgaWYgKF93aXRoLmhhc093blByb3BlcnR5KHByb3ApKSB7XG4gICAgICB3aGF0W3Byb3BdID0gX3dpdGhbcHJvcF07XG4gICAgfVxuICB9XG4gIHJldHVybiB3aGF0O1xufVxuXG5tb2R1bGUuZXhwb3J0cy5leHRlbmQgPSBleHRlbmQ7XG4iLCIvLyBXYWtlIGRldGVjdG9yIC0gbm90aWNlcyB3aGVuIHNvbWV0aGluZyAoc3VjaCBhc1xuLy8gc3VzcGVuc2lvbi9zbGVlcGluZyEpIGhhcyBjYXVzZWQgcGVyaW9kaWMgYWN0aXZpdGllcyB0byBiZVxuLy8gaW50ZXJydXB0ZWQsIGFuZCB3YXJucyBvdGhlcnMgYWJvdXQgaXRcbi8vIEluc3BpcmVkIGJ5IGh0dHA6Ly9ibG9nLmFsZXhtYWNjYXcuY29tL2phdmFzY3JpcHQtd2FrZS1ldmVudFxudmFyIE1pbmltYXJ0ID0gcmVxdWlyZShcIi4vbWluaW1hcnQuanNcIik7XG52YXIgV29ybGQgPSBNaW5pbWFydC5Xb3JsZDtcbnZhciBzdWIgPSBNaW5pbWFydC5zdWI7XG52YXIgcHViID0gTWluaW1hcnQucHViO1xudmFyIF9fID0gTWluaW1hcnQuX187XG5cbmZ1bmN0aW9uIFdha2VEZXRlY3RvcihwZXJpb2QpIHtcbiAgICB0aGlzLm1lc3NhZ2UgPSBcIndha2VcIjtcbiAgICB0aGlzLnBlcmlvZCA9IHBlcmlvZCB8fCAxMDAwMDtcbiAgICB0aGlzLm1vc3RSZWNlbnRUcmlnZ2VyID0gKyhuZXcgRGF0ZSgpKTtcbiAgICB0aGlzLnRpbWVySWQgPSBudWxsO1xufVxuXG5XYWtlRGV0ZWN0b3IucHJvdG90eXBlLmJvb3QgPSBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIFdvcmxkLnVwZGF0ZVJvdXRlcyhbcHViKHRoaXMubWVzc2FnZSldKTtcbiAgICB0aGlzLnRpbWVySWQgPSBzZXRJbnRlcnZhbChXb3JsZC53cmFwKGZ1bmN0aW9uICgpIHsgc2VsZi50cmlnZ2VyKCk7IH0pLCB0aGlzLnBlcmlvZCk7XG59O1xuXG5XYWtlRGV0ZWN0b3IucHJvdG90eXBlLmhhbmRsZUV2ZW50ID0gZnVuY3Rpb24gKGUpIHt9O1xuXG5XYWtlRGV0ZWN0b3IucHJvdG90eXBlLnRyaWdnZXIgPSBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIG5vdyA9ICsobmV3IERhdGUoKSk7XG4gICAgaWYgKG5vdyAtIHRoaXMubW9zdFJlY2VudFRyaWdnZXIgPiB0aGlzLnBlcmlvZCAqIDEuNSkge1xuXHRXb3JsZC5zZW5kKHRoaXMubWVzc2FnZSk7XG4gICAgfVxuICAgIHRoaXMubW9zdFJlY2VudFRyaWdnZXIgPSBub3c7XG59O1xuXG5tb2R1bGUuZXhwb3J0cy5XYWtlRGV0ZWN0b3IgPSBXYWtlRGV0ZWN0b3I7XG4iLCJ2YXIgTWluaW1hcnQgPSByZXF1aXJlKFwiLi9taW5pbWFydC5qc1wiKTtcbnZhciBDb2RlYyA9IHJlcXVpcmUoXCIuL2NvZGVjLmpzXCIpO1xudmFyIFJvdXRlID0gTWluaW1hcnQuUm91dGU7XG52YXIgV29ybGQgPSBNaW5pbWFydC5Xb3JsZDtcbnZhciBzdWIgPSBNaW5pbWFydC5zdWI7XG52YXIgcHViID0gTWluaW1hcnQucHViO1xudmFyIF9fID0gTWluaW1hcnQuX187XG52YXIgXyQgPSBNaW5pbWFydC5fJDtcblxuLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXG4vLyBXZWJTb2NrZXQgY2xpZW50IGRyaXZlclxuXG52YXIgREVGQVVMVF9SRUNPTk5FQ1RfREVMQVkgPSAxMDA7XG52YXIgTUFYX1JFQ09OTkVDVF9ERUxBWSA9IDMwMDAwO1xudmFyIERFRkFVTFRfSURMRV9USU1FT1VUID0gMzAwMDAwOyAvLyA1IG1pbnV0ZXNcbnZhciBERUZBVUxUX1BJTkdfSU5URVJWQUwgPSBERUZBVUxUX0lETEVfVElNRU9VVCAtIDEwMDAwO1xuXG5mdW5jdGlvbiBXZWJTb2NrZXRDb25uZWN0aW9uKGxhYmVsLCB3c3VybCwgc2hvdWxkUmVjb25uZWN0KSB7XG4gICAgdGhpcy5sYWJlbCA9IGxhYmVsO1xuICAgIHRoaXMuc2VuZHNBdHRlbXB0ZWQgPSAwO1xuICAgIHRoaXMuc2VuZHNUcmFuc21pdHRlZCA9IDA7XG4gICAgdGhpcy5yZWNlaXZlQ291bnQgPSAwO1xuICAgIHRoaXMuc29jayA9IG51bGw7XG4gICAgdGhpcy53c3VybCA9IHdzdXJsO1xuICAgIHRoaXMuc2hvdWxkUmVjb25uZWN0ID0gc2hvdWxkUmVjb25uZWN0ID8gdHJ1ZSA6IGZhbHNlO1xuICAgIHRoaXMucmVjb25uZWN0RGVsYXkgPSBERUZBVUxUX1JFQ09OTkVDVF9ERUxBWTtcbiAgICB0aGlzLmxvY2FsR2VzdGFsdCA9IFJvdXRlLmVtcHR5R2VzdGFsdDtcbiAgICB0aGlzLnBlZXJHZXN0YWx0ID0gUm91dGUuZW1wdHlHZXN0YWx0O1xuICAgIHRoaXMucHJldkxvY2FsUm91dGVzTWVzc2FnZSA9IG51bGw7XG4gICAgdGhpcy5wcmV2UGVlclJvdXRlc01lc3NhZ2UgPSBudWxsO1xuICAgIHRoaXMuZGVkdXBsaWNhdG9yID0gbmV3IE1pbmltYXJ0LkRlZHVwbGljYXRvcigpO1xuICAgIHRoaXMuY29ubmVjdGlvbkNvdW50ID0gMDtcblxuICAgIHRoaXMuYWN0aXZpdHlUaW1lc3RhbXAgPSAwO1xuICAgIHRoaXMuaWRsZVRpbWVvdXQgPSBERUZBVUxUX0lETEVfVElNRU9VVDtcbiAgICB0aGlzLnBpbmdJbnRlcnZhbCA9IERFRkFVTFRfUElOR19JTlRFUlZBTDtcbiAgICB0aGlzLmlkbGVUaW1lciA9IG51bGw7XG4gICAgdGhpcy5waW5nVGltZXIgPSBudWxsO1xufVxuXG5XZWJTb2NrZXRDb25uZWN0aW9uLnByb3RvdHlwZS5jbGVhckhlYXJ0YmVhdFRpbWVycyA9IGZ1bmN0aW9uICgpIHtcbiAgICBpZiAodGhpcy5pZGxlVGltZXIpIHsgY2xlYXJUaW1lb3V0KHRoaXMuaWRsZVRpbWVyKTsgdGhpcy5pZGxlVGltZXIgPSBudWxsOyB9XG4gICAgaWYgKHRoaXMucGluZ1RpbWVyKSB7IGNsZWFyVGltZW91dCh0aGlzLnBpbmdUaW1lcik7IHRoaXMucGluZ1RpbWVyID0gbnVsbDsgfVxufTtcblxuV2ViU29ja2V0Q29ubmVjdGlvbi5wcm90b3R5cGUucmVjb3JkQWN0aXZpdHkgPSBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIHRoaXMuYWN0aXZpdHlUaW1lc3RhbXAgPSArKG5ldyBEYXRlKCkpO1xuICAgIHRoaXMuY2xlYXJIZWFydGJlYXRUaW1lcnMoKTtcbiAgICB0aGlzLmlkbGVUaW1lciA9IHNldFRpbWVvdXQoZnVuY3Rpb24gKCkgeyBzZWxmLmZvcmNlY2xvc2UoKTsgfSxcblx0XHRcdFx0dGhpcy5pZGxlVGltZW91dCk7XG4gICAgdGhpcy5waW5nVGltZXIgPSBzZXRUaW1lb3V0KGZ1bmN0aW9uICgpIHsgc2VsZi5zYWZlU2VuZChKU09OLnN0cmluZ2lmeShcInBpbmdcIikpIH0sXG5cdFx0XHRcdHRoaXMucGluZ0ludGVydmFsKTtcbn07XG5cbldlYlNvY2tldENvbm5lY3Rpb24ucHJvdG90eXBlLnN0YXR1c1JvdXRlID0gZnVuY3Rpb24gKHN0YXR1cykge1xuICAgIHJldHVybiBwdWIoW3RoaXMubGFiZWwgKyBcIl9zdGF0ZVwiLCBzdGF0dXNdKTtcbn07XG5cbldlYlNvY2tldENvbm5lY3Rpb24ucHJvdG90eXBlLnJlbGF5R2VzdGFsdCA9IGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4gdGhpcy5zdGF0dXNSb3V0ZSh0aGlzLmlzQ29ubmVjdGVkKCkgPyBcImNvbm5lY3RlZFwiIDogXCJkaXNjb25uZWN0ZWRcIilcblx0LnVuaW9uKHB1YihbdGhpcy5sYWJlbCwgX18sIF9fXSwgMCwgMTApKVxuXHQudW5pb24oc3ViKFt0aGlzLmxhYmVsLCBfXywgX19dLCAwLCAxMCkpO1xuICAgIC8vIFRPRE86IGxldmVsIDEwIGlzIGFkLWhvYzsgc3VwcG9ydCBpbmZpbml0eSBhdCBzb21lIHBvaW50IGluIGZ1dHVyZVxufTtcblxuV2ViU29ja2V0Q29ubmVjdGlvbi5wcm90b3R5cGUuYWdncmVnYXRlR2VzdGFsdCA9IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgcmV0dXJuIHRoaXMucGVlckdlc3RhbHQudHJhbnNmb3JtKGZ1bmN0aW9uIChtLCBtZXRhTGV2ZWwpIHtcblx0cmV0dXJuIFJvdXRlLmNvbXBpbGVQYXR0ZXJuKHRydWUsXG5cdFx0XHRcdCAgICBbc2VsZi5sYWJlbCwgbWV0YUxldmVsLCBSb3V0ZS5lbWJlZGRlZE1hdGNoZXIobSldKTtcbiAgICB9KS51bmlvbih0aGlzLnJlbGF5R2VzdGFsdCgpKTtcbn07XG5cbldlYlNvY2tldENvbm5lY3Rpb24ucHJvdG90eXBlLmJvb3QgPSBmdW5jdGlvbiAoKSB7XG4gICAgdGhpcy5yZWNvbm5lY3QoKTtcbn07XG5cbldlYlNvY2tldENvbm5lY3Rpb24ucHJvdG90eXBlLnRyYXBleGl0ID0gZnVuY3Rpb24gKCkge1xuICAgIHRoaXMuZm9yY2VjbG9zZSgpO1xufTtcblxuV2ViU29ja2V0Q29ubmVjdGlvbi5wcm90b3R5cGUuaXNDb25uZWN0ZWQgPSBmdW5jdGlvbiAoKSB7XG4gICAgcmV0dXJuIHRoaXMuc29jayAmJiB0aGlzLnNvY2sucmVhZHlTdGF0ZSA9PT0gdGhpcy5zb2NrLk9QRU47XG59O1xuXG5XZWJTb2NrZXRDb25uZWN0aW9uLnByb3RvdHlwZS5zYWZlU2VuZCA9IGZ1bmN0aW9uIChtKSB7XG4gICAgdHJ5IHtcblx0dGhpcy5zZW5kc0F0dGVtcHRlZCsrO1xuXHRpZiAodGhpcy5pc0Nvbm5lY3RlZCgpKSB7XG5cdCAgICB0aGlzLnNvY2suc2VuZChtKTtcblx0ICAgIHRoaXMuc2VuZHNUcmFuc21pdHRlZCsrO1xuXHR9XG4gICAgfSBjYXRjaCAoZSkge1xuXHRjb25zb2xlLndhcm4oXCJUcmFwcGVkIGV4biB3aGlsZSBzZW5kaW5nXCIsIGUpO1xuICAgIH1cbn07XG5cbldlYlNvY2tldENvbm5lY3Rpb24ucHJvdG90eXBlLnNlbmRMb2NhbFJvdXRlcyA9IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgbmV3TG9jYWxSb3V0ZXNNZXNzYWdlID1cblx0SlNPTi5zdHJpbmdpZnkoQ29kZWMuZW5jb2RlRXZlbnQoTWluaW1hcnQudXBkYXRlUm91dGVzKFt0aGlzLmxvY2FsR2VzdGFsdF0pKSk7XG4gICAgaWYgKHRoaXMucHJldkxvY2FsUm91dGVzTWVzc2FnZSAhPT0gbmV3TG9jYWxSb3V0ZXNNZXNzYWdlKSB7XG5cdHRoaXMucHJldkxvY2FsUm91dGVzTWVzc2FnZSA9IG5ld0xvY2FsUm91dGVzTWVzc2FnZTtcblx0dGhpcy5zYWZlU2VuZChuZXdMb2NhbFJvdXRlc01lc3NhZ2UpO1xuICAgIH1cbn07XG5cbldlYlNvY2tldENvbm5lY3Rpb24ucHJvdG90eXBlLmNvbGxlY3RNYXRjaGVycyA9IGZ1bmN0aW9uIChnZXRBZHZlcnRpc2VtZW50cywgbGV2ZWwsIGcpIHtcbiAgICB2YXIgZXh0cmFjdE1ldGFMZXZlbHMgPSBSb3V0ZS5jb21waWxlUHJvamVjdGlvbihbdGhpcy5sYWJlbCwgXyQsIF9fXSk7XG4gICAgdmFyIG1scyA9IFJvdXRlLm1hdGNoZXJLZXlzKGcucHJvamVjdChleHRyYWN0TWV0YUxldmVscywgZ2V0QWR2ZXJ0aXNlbWVudHMsIDAsIGxldmVsKSk7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBtbHMubGVuZ3RoOyBpKyspIHtcblx0dmFyIG1ldGFMZXZlbCA9IG1sc1tpXVswXTsgLy8gb25seSBvbmUgY2FwdHVyZSBpbiB0aGUgcHJvamVjdGlvblxuXHR2YXIgZXh0cmFjdE1hdGNoZXJzID0gUm91dGUuY29tcGlsZVByb2plY3Rpb24oW3RoaXMubGFiZWwsIG1ldGFMZXZlbCwgXyRdKTtcblx0dmFyIG0gPSBnLnByb2plY3QoZXh0cmFjdE1hdGNoZXJzLCBnZXRBZHZlcnRpc2VtZW50cywgMCwgbGV2ZWwpO1xuXHR0aGlzLmxvY2FsR2VzdGFsdCA9IHRoaXMubG9jYWxHZXN0YWx0LnVuaW9uKFJvdXRlLnNpbXBsZUdlc3RhbHQoZ2V0QWR2ZXJ0aXNlbWVudHMsXG5cdFx0XHRcdFx0XHRcdFx0XHRSb3V0ZS5lbWJlZGRlZE1hdGNoZXIobSksXG5cdFx0XHRcdFx0XHRcdFx0XHRtZXRhTGV2ZWwsXG5cdFx0XHRcdFx0XHRcdFx0XHRsZXZlbCkpO1xuICAgIH1cbn07XG5cbldlYlNvY2tldENvbm5lY3Rpb24ucHJvdG90eXBlLmhhbmRsZUV2ZW50ID0gZnVuY3Rpb24gKGUpIHtcbiAgICAvLyBjb25zb2xlLmxvZyhcIldlYlNvY2tldENvbm5lY3Rpb24uaGFuZGxlRXZlbnRcIiwgZSk7XG4gICAgc3dpdGNoIChlLnR5cGUpIHtcbiAgICBjYXNlIFwicm91dGVzXCI6XG5cdC8vIFRPRE86IEdST1NTIC0gZXJhc2luZyBieSBwaWQhXG5cdHZhciBuTGV2ZWxzID0gZS5nZXN0YWx0LmxldmVsQ291bnQoMCk7XG5cdHZhciByZWxheUdlc3RhbHQgPSBSb3V0ZS5mdWxsR2VzdGFsdCgxLCBuTGV2ZWxzKS5sYWJlbChXb3JsZC5hY3RpdmVQaWQoKSk7XG5cdHZhciBnID0gZS5nZXN0YWx0LmVyYXNlUGF0aChyZWxheUdlc3RhbHQpO1xuXHR0aGlzLmxvY2FsR2VzdGFsdCA9IFJvdXRlLmVtcHR5R2VzdGFsdDtcblx0Zm9yICh2YXIgbGV2ZWwgPSAwOyBsZXZlbCA8IG5MZXZlbHM7IGxldmVsKyspIHtcblx0ICAgIHRoaXMuY29sbGVjdE1hdGNoZXJzKGZhbHNlLCBsZXZlbCwgZyk7XG5cdCAgICB0aGlzLmNvbGxlY3RNYXRjaGVycyh0cnVlLCBsZXZlbCwgZyk7XG5cdH1cblxuXHR0aGlzLnNlbmRMb2NhbFJvdXRlcygpO1xuXHRicmVhaztcbiAgICBjYXNlIFwibWVzc2FnZVwiOlxuXHR2YXIgbSA9IGUubWVzc2FnZTtcblx0aWYgKG0ubGVuZ3RoICYmIG0ubGVuZ3RoID09PSAzICYmIG1bMF0gPT09IHRoaXMubGFiZWwpXG5cdHtcblx0ICAgIHZhciBlbmNvZGVkID0gSlNPTi5zdHJpbmdpZnkoQ29kZWMuZW5jb2RlRXZlbnQoXG5cdFx0TWluaW1hcnQuc2VuZE1lc3NhZ2UobVsyXSwgbVsxXSwgZS5pc0ZlZWRiYWNrKSkpO1xuXHQgICAgaWYgKHRoaXMuZGVkdXBsaWNhdG9yLmFjY2VwdChlbmNvZGVkKSkge1xuXHRcdHRoaXMuc2FmZVNlbmQoZW5jb2RlZCk7XG5cdCAgICB9XG5cdH1cblx0YnJlYWs7XG4gICAgfVxufTtcblxuV2ViU29ja2V0Q29ubmVjdGlvbi5wcm90b3R5cGUuZm9yY2VjbG9zZSA9IGZ1bmN0aW9uIChrZWVwUmVjb25uZWN0RGVsYXkpIHtcbiAgICBpZiAoIWtlZXBSZWNvbm5lY3REZWxheSkge1xuXHR0aGlzLnJlY29ubmVjdERlbGF5ID0gREVGQVVMVF9SRUNPTk5FQ1RfREVMQVk7XG4gICAgfVxuICAgIHRoaXMuY2xlYXJIZWFydGJlYXRUaW1lcnMoKTtcbiAgICBpZiAodGhpcy5zb2NrKSB7XG5cdGNvbnNvbGUubG9nKFwiV2ViU29ja2V0Q29ubmVjdGlvbi5mb3JjZWNsb3NlIGNhbGxlZFwiKTtcblx0dGhpcy5zb2NrLmNsb3NlKCk7XG5cdHRoaXMuc29jayA9IG51bGw7XG4gICAgfVxufTtcblxuV2ViU29ja2V0Q29ubmVjdGlvbi5wcm90b3R5cGUucmVjb25uZWN0ID0gZnVuY3Rpb24gKCkge1xuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICB0aGlzLmZvcmNlY2xvc2UodHJ1ZSk7XG4gICAgdGhpcy5jb25uZWN0aW9uQ291bnQrKztcbiAgICB0aGlzLnNvY2sgPSBuZXcgV2ViU29ja2V0KHRoaXMud3N1cmwpO1xuICAgIHRoaXMuc29jay5vbm9wZW4gPSBXb3JsZC53cmFwKGZ1bmN0aW9uIChlKSB7IHJldHVybiBzZWxmLm9ub3BlbihlKTsgfSk7XG4gICAgdGhpcy5zb2NrLm9ubWVzc2FnZSA9IFdvcmxkLndyYXAoZnVuY3Rpb24gKGUpIHtcblx0c2VsZi5yZWNlaXZlQ291bnQrKztcblx0cmV0dXJuIHNlbGYub25tZXNzYWdlKGUpO1xuICAgIH0pO1xuICAgIHRoaXMuc29jay5vbmNsb3NlID0gV29ybGQud3JhcChmdW5jdGlvbiAoZSkgeyByZXR1cm4gc2VsZi5vbmNsb3NlKGUpOyB9KTtcbn07XG5cbldlYlNvY2tldENvbm5lY3Rpb24ucHJvdG90eXBlLm9ub3BlbiA9IGZ1bmN0aW9uIChlKSB7XG4gICAgY29uc29sZS5sb2coXCJjb25uZWN0ZWQgdG8gXCIgKyB0aGlzLnNvY2sudXJsKTtcbiAgICB0aGlzLnJlY29ubmVjdERlbGF5ID0gREVGQVVMVF9SRUNPTk5FQ1RfREVMQVk7XG4gICAgdGhpcy5wcmV2TG9jYWxSb3V0ZXNNZXNzYWdlID0gbnVsbDtcbiAgICB0aGlzLnNlbmRMb2NhbFJvdXRlcygpO1xufTtcblxuV2ViU29ja2V0Q29ubmVjdGlvbi5wcm90b3R5cGUub25tZXNzYWdlID0gZnVuY3Rpb24gKHdzZSkge1xuICAgIC8vIGNvbnNvbGUubG9nKFwib25tZXNzYWdlXCIsIHdzZSk7XG4gICAgdGhpcy5yZWNvcmRBY3Rpdml0eSgpO1xuXG4gICAgdmFyIGogPSBKU09OLnBhcnNlKHdzZS5kYXRhKTtcbiAgICBpZiAoaiA9PT0gXCJwaW5nXCIpIHtcblx0dGhpcy5zYWZlU2VuZChKU09OLnN0cmluZ2lmeShcInBvbmdcIikpO1xuXHRyZXR1cm47XG4gICAgfSBlbHNlIGlmIChqID09PSBcInBvbmdcIikge1xuXHRyZXR1cm47IC8vIHJlY29yZEFjdGl2aXR5IGFscmVhZHkgdG9vayBjYXJlIG9mIG91ciB0aW1lcnNcbiAgICB9XG5cbiAgICB2YXIgZSA9IENvZGVjLmRlY29kZUFjdGlvbihqKTtcbiAgICBzd2l0Y2ggKGUudHlwZSkge1xuICAgIGNhc2UgXCJyb3V0ZXNcIjpcblx0aWYgKHRoaXMucHJldlBlZXJSb3V0ZXNNZXNzYWdlICE9PSB3c2UuZGF0YSkge1xuXHQgICAgdGhpcy5wcmV2UGVlclJvdXRlc01lc3NhZ2UgPSB3c2UuZGF0YTtcblx0ICAgIHRoaXMucGVlckdlc3RhbHQgPSBlLmdlc3RhbHQ7XG5cdCAgICBXb3JsZC51cGRhdGVSb3V0ZXMoW3RoaXMuYWdncmVnYXRlR2VzdGFsdCgpXSk7XG5cdH1cblx0YnJlYWs7XG4gICAgY2FzZSBcIm1lc3NhZ2VcIjpcblx0aWYgKHRoaXMuZGVkdXBsaWNhdG9yLmFjY2VwdCh3c2UuZGF0YSkpIHtcblx0ICAgIFdvcmxkLnNlbmQoW3RoaXMubGFiZWwsIGUubWV0YUxldmVsLCBlLm1lc3NhZ2VdLCAwLCBlLmlzRmVlZGJhY2spO1xuXHR9XG5cdGJyZWFrO1xuICAgIH1cbn07XG5cbldlYlNvY2tldENvbm5lY3Rpb24ucHJvdG90eXBlLm9uY2xvc2UgPSBmdW5jdGlvbiAoZSkge1xuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICBjb25zb2xlLmxvZyhcIm9uY2xvc2VcIiwgZSk7XG5cbiAgICAvLyBVcGRhdGUgcm91dGVzIHRvIGdpdmUgY2xpZW50cyBzb21lIGluZGljYXRpb24gb2YgdGhlIGRpc2NvbnRpbnVpdHlcbiAgICBXb3JsZC51cGRhdGVSb3V0ZXMoW3RoaXMuYWdncmVnYXRlR2VzdGFsdCgpXSk7XG5cbiAgICBpZiAodGhpcy5zaG91bGRSZWNvbm5lY3QpIHtcblx0Y29uc29sZS5sb2coXCJyZWNvbm5lY3RpbmcgdG8gXCIgKyB0aGlzLndzdXJsICsgXCIgaW4gXCIgKyB0aGlzLnJlY29ubmVjdERlbGF5ICsgXCJtc1wiKTtcblx0c2V0VGltZW91dChXb3JsZC53cmFwKGZ1bmN0aW9uICgpIHsgc2VsZi5yZWNvbm5lY3QoKTsgfSksIHRoaXMucmVjb25uZWN0RGVsYXkpO1xuXHR0aGlzLnJlY29ubmVjdERlbGF5ID0gdGhpcy5yZWNvbm5lY3REZWxheSAqIDEuNjE4ICsgKE1hdGgucmFuZG9tKCkgKiAxMDAwKTtcblx0dGhpcy5yZWNvbm5lY3REZWxheSA9XG5cdCAgICB0aGlzLnJlY29ubmVjdERlbGF5ID4gTUFYX1JFQ09OTkVDVF9ERUxBWVxuXHQgICAgPyBNQVhfUkVDT05ORUNUX0RFTEFZICsgKE1hdGgucmFuZG9tKCkgKiAxMDAwKVxuXHQgICAgOiB0aGlzLnJlY29ubmVjdERlbGF5O1xuICAgIH1cbn07XG5cbi8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuXG5tb2R1bGUuZXhwb3J0cy5XZWJTb2NrZXRDb25uZWN0aW9uID0gV2ViU29ja2V0Q29ubmVjdGlvbjtcbiIsIi8qIFdlYiBXb3JrZXIgaW50ZXJmYWNlICovXG52YXIgR3JvdW5kID0gcmVxdWlyZShcIi4vZ3JvdW5kLmpzXCIpLkdyb3VuZDtcbnZhciBVdGlsID0gcmVxdWlyZShcIi4vdXRpbC5qc1wiKTtcbnZhciBDb2RlYyA9IHJlcXVpcmUoXCIuL2NvZGVjLmpzXCIpO1xuXG52YXIgTWluaW1hcnQgPSByZXF1aXJlKFwiLi9taW5pbWFydC5qc1wiKTtcbnZhciBXb3JsZCA9IE1pbmltYXJ0LldvcmxkO1xudmFyIHN1YiA9IE1pbmltYXJ0LnN1YjtcbnZhciBwdWIgPSBNaW5pbWFydC5wdWI7XG52YXIgX18gPSBNaW5pbWFydC5fXztcblxudmFyIEJ1aWx0aW5Xb3JrZXIgPSB0eXBlb2Ygd2luZG93ICE9PSAndW5kZWZpbmVkJyAmJiB3aW5kb3cuV29ya2VyO1xuXG4vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cblxuZnVuY3Rpb24gV29ya2VyKHNjcmlwdFVybCkge1xuICB0aGlzLnNjcmlwdFVybCA9IHNjcmlwdFVybDtcbiAgdGhpcy53ID0gbmV3IEJ1aWx0aW5Xb3JrZXIoc2NyaXB0VXJsKTtcbn1cblxuV29ya2VyLnByb3RvdHlwZS5ib290ID0gZnVuY3Rpb24gKCkge1xuICB0aGlzLncub25tZXNzYWdlID0gV29ybGQud3JhcChmdW5jdGlvbiAoZSkge1xuICAgIGNvbnNvbGUubG9nKFwiUmVjZWl2ZWQgZnJvbSB3b3JrZXJcIiwgSlNPTi5zdHJpbmdpZnkoZS5kYXRhKSk7XG4gICAgV29ybGQuY3VycmVudCgpLmVucXVldWVBY3Rpb24oV29ybGQuYWN0aXZlUGlkKCksIENvZGVjLmRlY29kZUFjdGlvbihlLmRhdGEpKTtcbiAgfSk7XG59O1xuXG5Xb3JrZXIucHJvdG90eXBlLmhhbmRsZUV2ZW50ID0gZnVuY3Rpb24gKGUpIHtcbiAgY29uc29sZS5sb2coXCJTZW5kaW5nIHRvIHdvcmtlclwiLCBKU09OLnN0cmluZ2lmeShDb2RlYy5lbmNvZGVFdmVudChlKSkpO1xuICB0aGlzLncucG9zdE1lc3NhZ2UoQ29kZWMuZW5jb2RlRXZlbnQoZSkpO1xufTtcblxuLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXG5cbmZ1bmN0aW9uIFdvcmtlckdyb3VuZChib290Rm4pIHtcbiAgdmFyIHNlbGYgPSB0aGlzO1xuICBHcm91bmQuY2FsbCh0aGlzLCBib290Rm4pO1xuICBvbm1lc3NhZ2UgPSBmdW5jdGlvbiAoZSkge1xuICAgIGNvbnNvbGUubG9nKFwiUmVjZWl2ZWQgZnJvbSBtYWluIHBhZ2VcIiwgSlNPTi5zdHJpbmdpZnkoZS5kYXRhKSk7XG4gICAgc2VsZi53b3JsZC5oYW5kbGVFdmVudChDb2RlYy5kZWNvZGVFdmVudChlLmRhdGEpKTtcbiAgICBzZWxmLnN0YXJ0U3RlcHBpbmcoKTtcbiAgfTtcbn1cblxuV29ya2VyR3JvdW5kLnByb3RvdHlwZSA9IFV0aWwuZXh0ZW5kKHt9LCBHcm91bmQucHJvdG90eXBlKTtcblxuV29ya2VyR3JvdW5kLnByb3RvdHlwZS5lbnF1ZXVlQWN0aW9uID0gZnVuY3Rpb24gKHBpZCwgYWN0aW9uKSB7XG4gIGNvbnNvbGUubG9nKFwiU2VuZGluZyB0byBtYWluIHBhZ2VcIiwgSlNPTi5zdHJpbmdpZnkoQ29kZWMuZW5jb2RlQWN0aW9uKGFjdGlvbikpKTtcbiAgcG9zdE1lc3NhZ2UoQ29kZWMuZW5jb2RlQWN0aW9uKGFjdGlvbikpO1xuICBjb25zb2xlLmxvZyhcIlNlbnQgdG8gbWFpbiBwYWdlXCIpO1xufTtcblxuLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXG5cbm1vZHVsZS5leHBvcnRzLldvcmtlciA9IFdvcmtlcjtcbm1vZHVsZS5leHBvcnRzLldvcmtlckdyb3VuZCA9IFdvcmtlckdyb3VuZDtcbiJdfQ==
(6)
});
