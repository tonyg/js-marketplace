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
    singleton: null,
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
		if (chunk.options.singleton) { this[chunk.options.singleton] = undefined; }
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
		    if (chunk.options.singleton) {
			this[chunk.options.singleton] = objs.length === 1 ? objs[0] : undefined;
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
    // spec ::== ["tag", [["attr", "value"], ...], spec, spec, ...]
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
    } else {
        throw new Error("Ill-formed DOM specification");
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
    delete this.processTable[pid];
    if (p) {
	if (p.behavior.trapexit) {
	  this.asChild(pid, function () { return p.behavior.trapexit(exn); }, true);
	}
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
    kids.sort(function (a, b) { return a[0] - b[0] });
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
	    var stringifiedState;
	    try {
	      var rawState = p.behavior.debugState ? p.behavior.debugState() : p.behavior;
	      stringifiedState = JSON.stringify(rawState, function (k, v) {
		return (k === 'name') ? undefined : v;
	      });
	    } catch (e) {
	      stringifiedState = "(cannot convert process state to JSON)";
	    }
	    lines.push(prefix + '-- ' + pid + ': ' + label + tombstoneString + stringifiedState);
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
	demandSideIsSubscription: false,
	supplyProjection: projection
    }, options);
    this.demandPattern = Route.projectionToPattern(projection);
    this.supplyPattern = Route.projectionToPattern(options.supplyProjection);
    this.demandProjectionSpec = Route.compileProjection(projection);
    this.supplyProjectionSpec = Route.compileProjection(options.supplyProjection);
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

DemandMatcher.prototype.debugState = function () {
  return {
    demandPattern: this.demandPattern,
    supplyPattern: this.supplyPattern,
    metaLevel: this.metaLevel,
    demandLevel: this.demandLevel,
    supplyLevel: this.supplyLevel,
    demandSideIsSubscription: this.demandSideIsSubscription

    // , currentDemand: this.currentDemand
    // , currentSupply: this.currentSupply
  };
};

DemandMatcher.prototype.boot = function () {
    var observerLevel = 1 + Math.max(this.demandLevel, this.supplyLevel);
    World.updateRoutes([sub(this.demandPattern, this.metaLevel, observerLevel),
			pub(this.supplyPattern, this.metaLevel, observerLevel)]);
};

DemandMatcher.prototype.handleEvent = function (e) {
    if (e.type === "routes") {
	this.handleGestalt(e.gestalt);
    }
};

DemandMatcher.prototype.handleGestalt = function (gestalt) {
    var newDemandMatcher = gestalt.project(this.demandProjectionSpec,
					   !this.demandSideIsSubscription,
					   this.metaLevel,
					   this.demandLevel);
    var newSupplyMatcher = gestalt.project(this.supplyProjectionSpec,
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

WebSocketConnection.prototype.debugState = function () {
  return {
    label: this.label,
    sendsAttempted: this.sendsAttempted,
    sendsTransmitted: this.sendsTransmitted,
    receiveCount: this.receiveCount,
    wsurl: this.wsurl,
    shouldReconnect: this.shouldReconnect,
    reconnectDelay: this.reconnectDelay,
    connectionCount: this.connectionCount,
    activityTimestamp: this.activityTimestamp
  };
};

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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi9Vc2Vycy90b255Zy9zcmMvanMtbWFya2V0cGxhY2Uvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXItcGFjay9fcHJlbHVkZS5qcyIsIi9Vc2Vycy90b255Zy9zcmMvanMtbWFya2V0cGxhY2Uvc3JjL2FjdG9yLmpzIiwiL1VzZXJzL3RvbnlnL3NyYy9qcy1tYXJrZXRwbGFjZS9zcmMvY29kZWMuanMiLCIvVXNlcnMvdG9ueWcvc3JjL2pzLW1hcmtldHBsYWNlL3NyYy9kb20tZHJpdmVyLmpzIiwiL1VzZXJzL3RvbnlnL3NyYy9qcy1tYXJrZXRwbGFjZS9zcmMvZ3JvdW5kLmpzIiwiL1VzZXJzL3RvbnlnL3NyYy9qcy1tYXJrZXRwbGFjZS9zcmMvanF1ZXJ5LWRyaXZlci5qcyIsIi9Vc2Vycy90b255Zy9zcmMvanMtbWFya2V0cGxhY2Uvc3JjL21haW4uanMiLCIvVXNlcnMvdG9ueWcvc3JjL2pzLW1hcmtldHBsYWNlL3NyYy9taW5pbWFydC5qcyIsIi9Vc2Vycy90b255Zy9zcmMvanMtbWFya2V0cGxhY2Uvc3JjL3JlZmxlY3QuanMiLCIvVXNlcnMvdG9ueWcvc3JjL2pzLW1hcmtldHBsYWNlL3NyYy9yb3V0ZS5qcyIsIi9Vc2Vycy90b255Zy9zcmMvanMtbWFya2V0cGxhY2Uvc3JjL3JvdXRpbmctdGFibGUtd2lkZ2V0LmpzIiwiL1VzZXJzL3RvbnlnL3NyYy9qcy1tYXJrZXRwbGFjZS9zcmMvc3B5LmpzIiwiL1VzZXJzL3RvbnlnL3NyYy9qcy1tYXJrZXRwbGFjZS9zcmMvdXRpbC5qcyIsIi9Vc2Vycy90b255Zy9zcmMvanMtbWFya2V0cGxhY2Uvc3JjL3dha2UtZGV0ZWN0b3IuanMiLCIvVXNlcnMvdG9ueWcvc3JjL2pzLW1hcmtldHBsYWNlL3NyYy93ZWJzb2NrZXQtZHJpdmVyLmpzIiwiL1VzZXJzL3RvbnlnL3NyYy9qcy1tYXJrZXRwbGFjZS9zcmMvd29ya2VyLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25SQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDckhBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDN0RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDckZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFnQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pqREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDYkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNsQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2UEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3Rocm93IG5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIil9dmFyIGY9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGYuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sZixmLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsInZhciBSZWZsZWN0ID0gcmVxdWlyZShcIi4vcmVmbGVjdC5qc1wiKTtcbnZhciBNaW5pbWFydCA9IHJlcXVpcmUoXCIuL21pbmltYXJ0LmpzXCIpO1xudmFyIFdvcmxkID0gTWluaW1hcnQuV29ybGQ7XG52YXIgUm91dGUgPSBNaW5pbWFydC5Sb3V0ZTtcblxuQWN0b3IuX2NodW5rcyA9IG51bGw7XG5cbmZ1bmN0aW9uIEFjdG9yKGN0b3IpIHtcbiAgICB2YXIgb2xkQ2h1bmtzID0gQWN0b3IuX2NodW5rcztcbiAgICB0cnkge1xuXHRBY3Rvci5fY2h1bmtzID0gW107XG5cdHZhciBiZWhhdmlvciA9IG5ldyBjdG9yKCk7XG5cdHJldHVybiBmaW5hbGl6ZUFjdG9yKGJlaGF2aW9yLCBBY3Rvci5fY2h1bmtzKTtcbiAgICB9IGNhdGNoIChlKSB7XG5cdEFjdG9yLl9jaHVua3MgPSBvbGRDaHVua3M7XG5cdHRocm93IGU7XG4gICAgfVxufVxuXG5mdW5jdGlvbiBjaGVja0NodW5rcyh0eXBlKSB7XG4gICAgaWYgKCFBY3Rvci5fY2h1bmtzKSB7XG5cdHRocm93IG5ldyBFcnJvcihcIkNhbGwgdG8gQWN0b3IuXCIrdHlwZStcIiBvdXRzaWRlIG9mIEFjdG9yIGNvbnN0cnVjdG9yXCIpO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gZXh0cmFjdENodW5rKHR5cGUsIGtpbmQsIGRlZmF1bHRPcHRpb25zLCBhcmdzKSB7XG4gICAgdmFyIHJhd1Byb2plY3Rpb25GbiA9IGFyZ3NbMF1cbiAgICB2YXIgb3B0aW9ucyA9IG51bGw7XG4gICAgdmFyIGhhbmRsZXIgPSBudWxsO1xuICAgIGlmICh0eXBlb2YgcmF3UHJvamVjdGlvbkZuICE9PSAnZnVuY3Rpb24nKSB7XG5cdHRocm93IG5ldyBFcnJvcihcIkFjdG9yLlwiK3R5cGUrXCIgZXhwZWN0cyBhIGZ1bmN0aW9uIHByb2R1Y2luZyBhIHBhdHRlcm4gYXMgZmlyc3QgYXJndW1lbnRcIik7XG4gICAgfVxuICAgIGZvciAodmFyIGkgPSAxOyBpIDwgYXJncy5sZW5ndGg7IGkrKykgeyAvLyBOQjogc2tpcCB0aGUgZmlyc3QgYXJnIC0gaXQncyByYXdQcm9qZWN0aW9uRm5cblx0aWYgKHR5cGVvZiBhcmdzW2ldID09PSAnZnVuY3Rpb24nKSB7XG5cdCAgICBpZiAoaGFuZGxlciAhPT0gbnVsbCkgeyB0aHJvdyBuZXcgRXJyb3IoXCJUb28gbWFueSBoYW5kbGVyIGZ1bmN0aW9ucyBpbiBBY3Rvci5cIit0eXBlKTsgfVxuXHQgICAgaGFuZGxlciA9IGFyZ3NbaV07XG5cdH0gZWxzZSBpZiAodHlwZW9mIGFyZ3NbaV0gPT09ICdvYmplY3QnKSB7XG5cdCAgICBpZiAob3B0aW9ucyAhPT0gbnVsbCkgeyB0aHJvdyBuZXcgRXJyb3IoXCJUb28gbWFueSBvcHRpb25zIGFyZ3VtZW50cyBpbiBBY3Rvci5cIit0eXBlKTsgfVxuXHQgICAgb3B0aW9ucyA9IGFyZ3NbaV07XG5cdH0gZWxzZSB7XG5cdCAgICB0aHJvdyBuZXcgRXJyb3IoXCJVbnJlY29nbmlzZWQgYXJndW1lbnQgaW4gQWN0b3IuXCIrdHlwZSk7XG5cdH1cbiAgICB9XG4gICAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG4gICAgZm9yICh2YXIgayBpbiBvcHRpb25zKSB7XG5cdGlmICghKGsgaW4gZGVmYXVsdE9wdGlvbnMpKSB7XG5cdCAgICB0aHJvdyBuZXcgRXJyb3IoXCJVbnJlY29nbmlzZWQgb3B0aW9uICdcIitrK1wiJyBpbiBBY3Rvci5cIit0eXBlKTtcblx0fVxuICAgIH1cbiAgICBmb3IgKHZhciBrIGluIGRlZmF1bHRPcHRpb25zKSB7XG5cdGlmICghKGsgaW4gb3B0aW9ucykpIHtcblx0ICAgIG9wdGlvbnNba10gPSBkZWZhdWx0T3B0aW9uc1trXTtcblx0fVxuICAgIH1cbiAgICByZXR1cm4ge1xuXHR0eXBlOiB0eXBlLFxuXHRraW5kOiBraW5kLFxuXHRyYXdQcm9qZWN0aW9uRm46IHJhd1Byb2plY3Rpb25Gbixcblx0b3B0aW9uczogb3B0aW9ucyxcblx0aGFuZGxlcjogaGFuZGxlclxuICAgIH07XG59XG5cbmZ1bmN0aW9uIHJlY29yZENodW5rKGNodW5rKSB7XG4gICAgQWN0b3IuX2NodW5rcy5wdXNoKGNodW5rKTtcbn1cblxuZnVuY3Rpb24gY2h1bmtFeHRyYWN0b3IodHlwZSwga2luZCwgZGVmYXVsdE9wdGlvbnMpIHtcbiAgICByZXR1cm4gZnVuY3Rpb24gKC8qIC4uLiAqLykge1xuXHRjaGVja0NodW5rcyh0eXBlKTtcblx0cmVjb3JkQ2h1bmsoZXh0cmFjdENodW5rKHR5cGUsXG5cdFx0XHRcdCBraW5kLFxuXHRcdFx0XHQgZGVmYXVsdE9wdGlvbnMsXG5cdFx0XHRcdCBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMpKSk7XG4gICAgfTtcbn1cblxudmFyIHBhcnRpY2lwYW50RGVmYXVsdHMgPSB7XG4gICAgbWV0YUxldmVsOiAwLFxuICAgIHdoZW46IGZ1bmN0aW9uICgpIHsgcmV0dXJuIHRydWU7IH1cbn07XG5cbnZhciBvYnNlcnZlckRlZmF1bHRzID0ge1xuICAgIG1ldGFMZXZlbDogMCxcbiAgICBsZXZlbDogMCxcbiAgICB3aGVuOiBmdW5jdGlvbiAoKSB7IHJldHVybiB0cnVlOyB9LFxuICAgIHByZXNlbmNlOiBudWxsLFxuICAgIG5hbWU6IG51bGwsXG4gICAgc2luZ2xldG9uOiBudWxsLFxuICAgIHNldDogbnVsbCxcbiAgICBhZGRlZDogbnVsbCxcbiAgICByZW1vdmVkOiBudWxsXG59O1xuXG5BY3Rvci5hZHZlcnRpc2UgPSBjaHVua0V4dHJhY3RvcignYWR2ZXJ0aXNlJywgJ3BhcnRpY2lwYW50JywgcGFydGljaXBhbnREZWZhdWx0cyk7XG5BY3Rvci5zdWJzY3JpYmUgPSBjaHVua0V4dHJhY3Rvcignc3Vic2NyaWJlJywgJ3BhcnRpY2lwYW50JywgcGFydGljaXBhbnREZWZhdWx0cyk7XG5cbkFjdG9yLm9ic2VydmVBZHZlcnRpc2VycyA9IGNodW5rRXh0cmFjdG9yKCdvYnNlcnZlQWR2ZXJ0aXNlcnMnLCAnb2JzZXJ2ZXInLCBvYnNlcnZlckRlZmF1bHRzKTtcbkFjdG9yLm9ic2VydmVTdWJzY3JpYmVycyA9IGNodW5rRXh0cmFjdG9yKCdvYnNlcnZlU3Vic2NyaWJlcnMnLCAnb2JzZXJ2ZXInLCBvYnNlcnZlckRlZmF1bHRzKTtcblxuQWN0b3Iub2JzZXJ2ZUdlc3RhbHQgPSBmdW5jdGlvbiAoZ2VzdGFsdEZuLCBldmVudEhhbmRsZXJGbikge1xuICAgIGNoZWNrQ2h1bmtzKCdvYnNlcnZlR2VzdGFsdCcpO1xuICAgIHJlY29yZENodW5rKHtcblx0dHlwZTogJ29ic2VydmVHZXN0YWx0Jyxcblx0a2luZDogJ3JhdycsXG5cdGdlc3RhbHRGbjogZ2VzdGFsdEZuLFxuXHRvcHRpb25zOiB7XG5cdCAgICB3aGVuOiBmdW5jdGlvbiAoKSB7IHJldHVybiB0cnVlOyB9XG5cdH0sXG5cdGV2ZW50SGFuZGxlckZuOiBldmVudEhhbmRsZXJGblxuICAgIH0pO1xufTtcblxuZnVuY3Rpb24gZmluYWxpemVBY3RvcihiZWhhdmlvciwgY2h1bmtzKSB7XG4gICAgdmFyIG9sZEJvb3QgPSBiZWhhdmlvci5ib290O1xuICAgIHZhciBvbGRIYW5kbGVFdmVudCA9IGJlaGF2aW9yLmhhbmRsZUV2ZW50O1xuICAgIHZhciBwcm9qZWN0aW9ucyA9IHt9O1xuICAgIHZhciBjb21waWxlZFByb2plY3Rpb25zID0ge307XG4gICAgdmFyIHByZXZpb3VzT2JqcyA9IHt9O1xuXG4gICAgYmVoYXZpb3IuYm9vdCA9IGZ1bmN0aW9uICgpIHtcblx0aWYgKG9sZEJvb3QpIHsgb2xkQm9vdC5jYWxsKHRoaXMpOyB9XG5cdGZvciAodmFyIGkgPSAwOyBpIDwgY2h1bmtzLmxlbmd0aDsgaSsrKSB7XG5cdCAgICB2YXIgY2h1bmsgPSBjaHVua3NbaV07XG5cdCAgICBpZiAoY2h1bmsua2luZCA9PT0gJ29ic2VydmVyJykge1xuXHRcdGlmIChjaHVuay5vcHRpb25zLnByZXNlbmNlKSB7IHRoaXNbY2h1bmsub3B0aW9ucy5wcmVzZW5jZV0gPSBmYWxzZTsgfVxuXHRcdGlmIChjaHVuay5vcHRpb25zLm5hbWUpIHsgdGhpc1tjaHVuay5vcHRpb25zLm5hbWVdID0gW107IH1cblx0XHRpZiAoY2h1bmsub3B0aW9ucy5zaW5nbGV0b24pIHsgdGhpc1tjaHVuay5vcHRpb25zLnNpbmdsZXRvbl0gPSB1bmRlZmluZWQ7IH1cblx0XHRpZiAoY2h1bmsub3B0aW9ucy5hZGRlZCkgeyB0aGlzW2NodW5rLm9wdGlvbnMuYWRkZWRdID0gW107IH1cblx0XHRpZiAoY2h1bmsub3B0aW9ucy5yZW1vdmVkKSB7IHRoaXNbY2h1bmsub3B0aW9ucy5yZW1vdmVkXSA9IFtdOyB9XG5cdCAgICB9XG5cdH1cblx0dGhpcy51cGRhdGVSb3V0ZXMoKTtcbiAgICB9O1xuXG4gICAgYmVoYXZpb3IudXBkYXRlUm91dGVzID0gZnVuY3Rpb24gKCkge1xuXHR2YXIgbmV3Um91dGVzID0gUm91dGUuZW1wdHlHZXN0YWx0O1xuXHRmb3IgKHZhciBpID0gMDsgaSA8IGNodW5rcy5sZW5ndGg7IGkrKykge1xuXHQgICAgdmFyIGNodW5rID0gY2h1bmtzW2ldO1xuXHQgICAgaWYgKGNodW5rLm9wdGlvbnMud2hlbi5jYWxsKHRoaXMpKSB7XG5cdFx0c3dpdGNoIChjaHVuay5raW5kKSB7XG5cdFx0Y2FzZSAncmF3Jzpcblx0XHQgICAgbmV3Um91dGVzID0gbmV3Um91dGVzLnVuaW9uKGNodW5rLmdlc3RhbHRGbi5jYWxsKHRoaXMpKTtcblx0XHQgICAgYnJlYWs7XG5cdFx0Y2FzZSAncGFydGljaXBhbnQnOlxuXHRcdCAgICB2YXIgcHJvaiA9IGNodW5rLnJhd1Byb2plY3Rpb25Gbi5jYWxsKHRoaXMpO1xuXHRcdCAgICBwcm9qZWN0aW9uc1tpXSA9IHByb2o7XG5cdFx0ICAgIHZhciBnID0gUm91dGUuc2ltcGxlR2VzdGFsdChjaHVuay50eXBlID09PSAnYWR2ZXJ0aXNlJyxcblx0XHRcdFx0XHRcdFJvdXRlLnByb2plY3Rpb25Ub1BhdHRlcm4ocHJvaiksXG5cdFx0XHRcdFx0XHRjaHVuay5vcHRpb25zLm1ldGFMZXZlbCxcblx0XHRcdFx0XHRcdDApO1xuXHRcdCAgICBuZXdSb3V0ZXMgPSBuZXdSb3V0ZXMudW5pb24oZyk7XG5cdFx0ICAgIGJyZWFrO1xuXHRcdGNhc2UgJ29ic2VydmVyJzpcblx0XHQgICAgdmFyIHByb2ogPSBjaHVuay5yYXdQcm9qZWN0aW9uRm4uY2FsbCh0aGlzKTtcblx0XHQgICAgcHJvamVjdGlvbnNbaV0gPSBwcm9qO1xuXHRcdCAgICBjb21waWxlZFByb2plY3Rpb25zW2ldID0gUm91dGUuY29tcGlsZVByb2plY3Rpb24ocHJvaik7XG5cdFx0ICAgIHZhciBnID0gUm91dGUuc2ltcGxlR2VzdGFsdChjaHVuay50eXBlID09PSAnb2JzZXJ2ZVN1YnNjcmliZXJzJyxcblx0XHRcdFx0XHRcdFJvdXRlLnByb2plY3Rpb25Ub1BhdHRlcm4ocHJvaiksXG5cdFx0XHRcdFx0XHRjaHVuay5vcHRpb25zLm1ldGFMZXZlbCxcblx0XHRcdFx0XHRcdGNodW5rLm9wdGlvbnMubGV2ZWwgKyAxKTtcblx0XHQgICAgbmV3Um91dGVzID0gbmV3Um91dGVzLnVuaW9uKGcpO1xuXHRcdCAgICBpZiAoY2h1bmsub3B0aW9ucy5hZGRlZCB8fCBjaHVuay5vcHRpb25zLnJlbW92ZWQpIHtcblx0XHRcdHByZXZpb3VzT2Jqc1tpXSA9IFJvdXRlLmFycmF5VG9TZXQoW10pO1xuXHRcdCAgICB9XG5cdFx0ICAgIGJyZWFrO1xuXHRcdGRlZmF1bHQ6XG5cdFx0ICAgIHRocm93IG5ldyBFcnJvcihcIlVuc3VwcG9ydGVkIGNodW5rIHR5cGUva2luZDogXCIrY2h1bmsudHlwZStcIi9cIitjaHVuay5raW5kKTtcblx0XHR9XG5cdCAgICB9XG5cdH1cblx0V29ybGQudXBkYXRlUm91dGVzKFtuZXdSb3V0ZXNdKTtcbiAgICB9O1xuXG4gICAgYmVoYXZpb3IuaGFuZGxlRXZlbnQgPSBmdW5jdGlvbiAoZSkge1xuXHRpZiAob2xkSGFuZGxlRXZlbnQpIHsgb2xkSGFuZGxlRXZlbnQuY2FsbCh0aGlzLCBlKTsgfVxuXHRmb3IgKHZhciBpID0gMDsgaSA8IGNodW5rcy5sZW5ndGg7IGkrKykge1xuXHQgICAgdmFyIGNodW5rID0gY2h1bmtzW2ldO1xuXHQgICAgc3dpdGNoIChjaHVuay5raW5kKSB7XG5cdCAgICBjYXNlICdyYXcnOlxuXHRcdGNodW5rLmV2ZW50SGFuZGxlckZuLmNhbGwodGhpcywgZSk7XG5cdFx0YnJlYWs7XG5cdCAgICBjYXNlICdwYXJ0aWNpcGFudCc6XG5cdFx0aWYgKGNodW5rLmhhbmRsZXJcblx0XHQgICAgJiYgKGUudHlwZSA9PT0gJ21lc3NhZ2UnKVxuXHRcdCAgICAmJiAoZS5tZXRhTGV2ZWwgPT09IGNodW5rLm9wdGlvbnMubWV0YUxldmVsKVxuXHRcdCAgICAmJiAoZS5pc0ZlZWRiYWNrID09PSAoY2h1bmsudHlwZSA9PT0gJ2FkdmVydGlzZScpKSlcblx0XHR7XG5cdFx0ICAgIHZhciBtYXRjaFJlc3VsdCA9IFJvdXRlLm1hdGNoUGF0dGVybihlLm1lc3NhZ2UsIHByb2plY3Rpb25zW2ldKTtcblx0XHQgICAgaWYgKG1hdGNoUmVzdWx0KSB7XG5cdFx0XHRrd0FwcGx5KGNodW5rLmhhbmRsZXIsIHRoaXMsIG1hdGNoUmVzdWx0KTtcblx0XHQgICAgfVxuXHRcdH1cblx0XHRicmVhaztcblx0ICAgIGNhc2UgJ29ic2VydmVyJzpcblx0XHRpZiAoZS50eXBlID09PSAncm91dGVzJykge1xuXHRcdCAgICB2YXIgcHJvamVjdGlvblJlc3VsdCA9IGUuZ2VzdGFsdC5wcm9qZWN0KGNvbXBpbGVkUHJvamVjdGlvbnNbaV0sXG5cdFx0XHRcdFx0XHRcdCAgICAgY2h1bmsudHlwZSAhPT0gJ29ic2VydmVTdWJzY3JpYmVycycsXG5cdFx0XHRcdFx0XHRcdCAgICAgY2h1bmsub3B0aW9ucy5tZXRhTGV2ZWwsXG5cdFx0XHRcdFx0XHRcdCAgICAgY2h1bmsub3B0aW9ucy5sZXZlbCk7XG5cblx0XHQgICAgdmFyIGlzUHJlc2VudCA9ICFSb3V0ZS5pc19lbXB0eU1hdGNoZXIocHJvamVjdGlvblJlc3VsdCk7XG5cdFx0ICAgIGlmIChjaHVuay5vcHRpb25zLnByZXNlbmNlKSB7XG5cdFx0XHR0aGlzW2NodW5rLm9wdGlvbnMucHJlc2VuY2VdID0gaXNQcmVzZW50O1xuXHRcdCAgICB9XG5cblx0XHQgICAgdmFyIG9ianMgPSBbXTtcblx0XHQgICAgaWYgKGlzUHJlc2VudCkge1xuXHRcdFx0dmFyIGtleXMgPSBSb3V0ZS5tYXRjaGVyS2V5cyhwcm9qZWN0aW9uUmVzdWx0KTtcblx0XHRcdGlmIChrZXlzID09PSBudWxsKSB7XG5cdFx0XHQgICAgY29uc29sZS53YXJuKFwiV2lsZGNhcmQgZGV0ZWN0ZWQgd2hpbGUgcHJvamVjdGluZyAoXCJcblx0XHRcdFx0XHQgK0pTT04uc3RyaW5naWZ5KGNodW5rLm9wdGlvbnMpK1wiKVwiKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHQgICAgb2JqcyA9IFJvdXRlLm1hdGNoZXJLZXlzVG9PYmplY3RzKGtleXMsIGNvbXBpbGVkUHJvamVjdGlvbnNbaV0pO1xuXHRcdFx0ICAgIGlmIChjaHVuay5vcHRpb25zLnNldCkge1xuXHRcdFx0XHRmb3IgKHZhciBqID0gMDsgaiA8IG9ianMubGVuZ3RoOyBqKyspIHtcblx0XHRcdFx0ICAgIG9ianNbal0gPSBjaHVuay5vcHRpb25zLnNldC5jYWxsKHRoaXMsIG9ianNbal0pO1xuXHRcdFx0XHR9XG5cdFx0XHQgICAgfVxuXHRcdFx0fVxuXHRcdCAgICB9XG5cdFx0ICAgIGlmIChjaHVuay5vcHRpb25zLm5hbWUpIHtcblx0XHRcdHRoaXNbY2h1bmsub3B0aW9ucy5uYW1lXSA9IG9ianM7XG5cdFx0ICAgIH1cblx0XHQgICAgaWYgKGNodW5rLm9wdGlvbnMuc2luZ2xldG9uKSB7XG5cdFx0XHR0aGlzW2NodW5rLm9wdGlvbnMuc2luZ2xldG9uXSA9IG9ianMubGVuZ3RoID09PSAxID8gb2Jqc1swXSA6IHVuZGVmaW5lZDtcblx0XHQgICAgfVxuXG5cdFx0ICAgIGlmIChjaHVuay5vcHRpb25zLmFkZGVkIHx8IGNodW5rLm9wdGlvbnMucmVtb3ZlZCkge1xuXHRcdFx0dmFyIG9ialNldCA9IFJvdXRlLmFycmF5VG9TZXQob2Jqcyk7XG5cblx0XHRcdGlmIChjaHVuay5vcHRpb25zLmFkZGVkKSB7XG5cdFx0XHQgICAgdGhpc1tjaHVuay5vcHRpb25zLmFkZGVkXSA9XG5cdFx0XHRcdFJvdXRlLnNldFRvQXJyYXkoUm91dGUuc2V0U3VidHJhY3Qob2JqU2V0LCBwcmV2aW91c09ianNbaV0pKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGNodW5rLm9wdGlvbnMucmVtb3ZlZCkge1xuXHRcdFx0ICAgIHRoaXNbY2h1bmsub3B0aW9ucy5yZW1vdmVkXSA9XG5cdFx0XHRcdFJvdXRlLnNldFRvQXJyYXkoUm91dGUuc2V0U3VidHJhY3QocHJldmlvdXNPYmpzW2ldLCBvYmpTZXQpKTtcblx0XHRcdH1cblxuXHRcdFx0cHJldmlvdXNPYmpzW2ldID0gb2JqU2V0O1xuXHRcdCAgICB9XG5cblx0XHQgICAgaWYgKGNodW5rLmhhbmRsZXIpIHtcblx0XHRcdGNodW5rLmhhbmRsZXIuY2FsbCh0aGlzKTtcblx0XHQgICAgfVxuXHRcdH1cblx0XHRicmVhaztcblx0ICAgIGRlZmF1bHQ6XG5cdFx0dGhyb3cgbmV3IEVycm9yKFwiVW5zdXBwb3J0ZWQgY2h1bmsgdHlwZS9raW5kOiBcIitjaHVuay50eXBlK1wiL1wiK2NodW5rLmtpbmQpO1xuXHQgICAgfVxuXHR9XG4gICAgfTtcblxuICAgIHJldHVybiBiZWhhdmlvcjtcbn1cblxuZnVuY3Rpb24ga3dBcHBseShmLCB0aGlzQXJnLCBhcmdzKSB7XG4gICAgdmFyIGZvcm1hbHMgPSBSZWZsZWN0LmZvcm1hbFBhcmFtZXRlcnMoZik7XG4gICAgdmFyIGFjdHVhbHMgPSBbXVxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgZm9ybWFscy5sZW5ndGg7IGkrKykge1xuXHR2YXIgZm9ybWFsID0gZm9ybWFsc1tpXTtcblx0aWYgKCEoZm9ybWFsIGluIGFyZ3MpKSB7XG5cdCAgICB0aHJvdyBuZXcgRXJyb3IoXCJGdW5jdGlvbiBwYXJhbWV0ZXIgJ1wiK2Zvcm1hbCtcIicgbm90IHByZXNlbnQgaW4gYXJnc1wiKTtcblx0fVxuXHRhY3R1YWxzLnB1c2goYXJnc1tmb3JtYWxdKTtcbiAgICB9XG4gICAgcmV0dXJuIGYuYXBwbHkodGhpc0FyZywgYWN0dWFscyk7XG59XG5cbi8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuXG5tb2R1bGUuZXhwb3J0cy5BY3RvciA9IEFjdG9yO1xubW9kdWxlLmV4cG9ydHMua3dBcHBseSA9IGt3QXBwbHk7XG4iLCIvLyBXaXJlIHByb3RvY29sIHJlcHJlc2VudGF0aW9uIG9mIGV2ZW50cyBhbmQgYWN0aW9uc1xuXG52YXIgUm91dGUgPSByZXF1aXJlKFwiLi9yb3V0ZS5qc1wiKTtcblxuZnVuY3Rpb24gX2VuY29kZShlKSB7XG4gICAgc3dpdGNoIChlLnR5cGUpIHtcbiAgICBjYXNlIFwicm91dGVzXCI6XG5cdHJldHVybiBbXCJyb3V0ZXNcIiwgZS5nZXN0YWx0LnNlcmlhbGl6ZShmdW5jdGlvbiAodikgeyByZXR1cm4gdHJ1ZTsgfSldO1xuICAgIGNhc2UgXCJtZXNzYWdlXCI6XG5cdHJldHVybiBbXCJtZXNzYWdlXCIsIGUubWVzc2FnZSwgZS5tZXRhTGV2ZWwsIGUuaXNGZWVkYmFja107XG4gICAgfVxufVxuXG5mdW5jdGlvbiBfZGVjb2RlKHdoYXQpIHtcbiAgcmV0dXJuIGZ1bmN0aW9uIChqKSB7XG4gICAgc3dpdGNoIChqWzBdKSB7XG4gICAgY2FzZSBcInJvdXRlc1wiOlxuICAgICAgcmV0dXJuIE1pbmltYXJ0LnVwZGF0ZVJvdXRlcyhbXG5cdFJvdXRlLmRlc2VyaWFsaXplR2VzdGFsdChqWzFdLCBmdW5jdGlvbiAodikgeyByZXR1cm4gdHJ1ZTsgfSldKTtcbiAgICBjYXNlIFwibWVzc2FnZVwiOlxuICAgICAgcmV0dXJuIE1pbmltYXJ0LnNlbmRNZXNzYWdlKGpbMV0sIGpbMl0sIGpbM10pO1xuICAgIGRlZmF1bHQ6XG4gICAgICB0aHJvdyB7IG1lc3NhZ2U6IFwiSW52YWxpZCBKU09OLWVuY29kZWQgXCIgKyB3aGF0ICsgXCI6IFwiICsgSlNPTi5zdHJpbmdpZnkoaikgfTtcbiAgICB9XG4gIH07XG59XG5cbi8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuXG5tb2R1bGUuZXhwb3J0cy5lbmNvZGVFdmVudCA9IF9lbmNvZGU7XG5tb2R1bGUuZXhwb3J0cy5kZWNvZGVFdmVudCA9IF9kZWNvZGUoXCJldmVudFwiKTtcbm1vZHVsZS5leHBvcnRzLmVuY29kZUFjdGlvbiA9IF9lbmNvZGU7XG5tb2R1bGUuZXhwb3J0cy5kZWNvZGVBY3Rpb24gPSBfZGVjb2RlKFwiYWN0aW9uXCIpO1xuIiwiLy8gRE9NIGZyYWdtZW50IGRpc3BsYXkgZHJpdmVyXG52YXIgTWluaW1hcnQgPSByZXF1aXJlKFwiLi9taW5pbWFydC5qc1wiKTtcbnZhciBXb3JsZCA9IE1pbmltYXJ0LldvcmxkO1xudmFyIHN1YiA9IE1pbmltYXJ0LnN1YjtcbnZhciBwdWIgPSBNaW5pbWFydC5wdWI7XG52YXIgX18gPSBNaW5pbWFydC5fXztcbnZhciBfJCA9IE1pbmltYXJ0Ll8kO1xuXG5mdW5jdGlvbiBzcGF3bkRPTURyaXZlcihkb21XcmFwRnVuY3Rpb24sIGpRdWVyeVdyYXBGdW5jdGlvbikge1xuICAgIGRvbVdyYXBGdW5jdGlvbiA9IGRvbVdyYXBGdW5jdGlvbiB8fCBkZWZhdWx0V3JhcEZ1bmN0aW9uO1xuICAgIHZhciBkID0gbmV3IE1pbmltYXJ0LkRlbWFuZE1hdGNoZXIoZG9tV3JhcEZ1bmN0aW9uKF8kLCBfJCwgXyQpKTtcbiAgICBkLm9uRGVtYW5kSW5jcmVhc2UgPSBmdW5jdGlvbiAoY2FwdHVyZXMpIHtcblx0dmFyIHNlbGVjdG9yID0gY2FwdHVyZXNbMF07XG5cdHZhciBmcmFnbWVudENsYXNzID0gY2FwdHVyZXNbMV07XG5cdHZhciBmcmFnbWVudFNwZWMgPSBjYXB0dXJlc1syXTtcblx0V29ybGQuc3Bhd24obmV3IERPTUZyYWdtZW50KHNlbGVjdG9yLFxuXHRcdFx0XHQgICAgZnJhZ21lbnRDbGFzcyxcblx0XHRcdFx0ICAgIGZyYWdtZW50U3BlYyxcblx0XHRcdFx0ICAgIGRvbVdyYXBGdW5jdGlvbixcblx0XHRcdFx0ICAgIGpRdWVyeVdyYXBGdW5jdGlvbiksXG5cdFx0ICAgIFtzdWIoZG9tV3JhcEZ1bmN0aW9uKHNlbGVjdG9yLCBmcmFnbWVudENsYXNzLCBmcmFnbWVudFNwZWMpKSxcblx0XHQgICAgIHN1Yihkb21XcmFwRnVuY3Rpb24oc2VsZWN0b3IsIGZyYWdtZW50Q2xhc3MsIGZyYWdtZW50U3BlYyksIDAsIDEpXSk7XG4gICAgfTtcbiAgICBXb3JsZC5zcGF3bihkKTtcbn1cblxuZnVuY3Rpb24gZGVmYXVsdFdyYXBGdW5jdGlvbihzZWxlY3RvciwgZnJhZ21lbnRDbGFzcywgZnJhZ21lbnRTcGVjKSB7XG4gICAgcmV0dXJuIFtcIkRPTVwiLCBzZWxlY3RvciwgZnJhZ21lbnRDbGFzcywgZnJhZ21lbnRTcGVjXTtcbn1cblxuZnVuY3Rpb24gRE9NRnJhZ21lbnQoc2VsZWN0b3IsIGZyYWdtZW50Q2xhc3MsIGZyYWdtZW50U3BlYywgZG9tV3JhcEZ1bmN0aW9uLCBqUXVlcnlXcmFwRnVuY3Rpb24pIHtcbiAgICB0aGlzLnNlbGVjdG9yID0gc2VsZWN0b3I7XG4gICAgdGhpcy5mcmFnbWVudENsYXNzID0gZnJhZ21lbnRDbGFzcztcbiAgICB0aGlzLmZyYWdtZW50U3BlYyA9IGZyYWdtZW50U3BlYztcbiAgICB0aGlzLmRvbVdyYXBGdW5jdGlvbiA9IGRvbVdyYXBGdW5jdGlvbjtcbiAgICB0aGlzLmpRdWVyeVdyYXBGdW5jdGlvbiA9IGpRdWVyeVdyYXBGdW5jdGlvbjtcbiAgICB0aGlzLm5vZGVzID0gdGhpcy5idWlsZE5vZGVzKCk7XG59XG5cbkRPTUZyYWdtZW50LnByb3RvdHlwZS5ib290ID0gZnVuY3Rpb24gKCkge1xuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICB2YXIgbW9uaXRvcmluZyA9XG5cdHN1Yih0aGlzLmRvbVdyYXBGdW5jdGlvbihzZWxmLnNlbGVjdG9yLCBzZWxmLmZyYWdtZW50Q2xhc3MsIHNlbGYuZnJhZ21lbnRTcGVjKSwgMSwgMik7XG4gICAgV29ybGQuc3Bhd24obmV3IFdvcmxkKGZ1bmN0aW9uICgpIHtcblx0TWluaW1hcnQuSlF1ZXJ5LnNwYXduSlF1ZXJ5RHJpdmVyKHNlbGYuc2VsZWN0b3IrXCIgPiAuXCIrc2VsZi5mcmFnbWVudENsYXNzLFxuXHRcdFx0XHRcdCAgMSxcblx0XHRcdFx0XHQgIHNlbGYualF1ZXJ5V3JhcEZ1bmN0aW9uKTtcblx0V29ybGQuc3Bhd24oe1xuXHQgICAgaGFuZGxlRXZlbnQ6IGZ1bmN0aW9uIChlKSB7XG5cdFx0aWYgKGUudHlwZSA9PT0gXCJyb3V0ZXNcIikge1xuXHRcdCAgICB2YXIgbGV2ZWwgPSBlLmdlc3RhbHQuZ2V0TGV2ZWwoMSwgMCk7IC8vIGZpbmQgcGFydGljaXBhbnQgcGVlcnNcblx0XHQgICAgaWYgKCFlLmdlc3RhbHQuaXNFbXB0eSgpICYmIGxldmVsLmlzRW1wdHkoKSkge1xuXHRcdFx0V29ybGQuc2h1dGRvd25Xb3JsZCgpO1xuXHRcdCAgICB9XG5cdFx0fVxuXHQgICAgfVxuXHR9LCBbbW9uaXRvcmluZ10pO1xuICAgIH0pKTtcbn07XG5cbkRPTUZyYWdtZW50LnByb3RvdHlwZS5oYW5kbGVFdmVudCA9IGZ1bmN0aW9uIChlKSB7XG4gICAgaWYgKGUudHlwZSA9PT0gXCJyb3V0ZXNcIiAmJiBlLmdlc3RhbHQuaXNFbXB0eSgpKSB7XG5cdGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5ub2Rlcy5sZW5ndGg7IGkrKykge1xuXHQgICAgdmFyIG4gPSB0aGlzLm5vZGVzW2ldO1xuXHQgICAgbi5wYXJlbnROb2RlLnJlbW92ZUNoaWxkKG4pO1xuXHR9XG5cdFdvcmxkLmV4aXQoKTtcbiAgICB9XG59O1xuXG5mdW5jdGlvbiBpc0F0dHJpYnV0ZXMoeCkge1xuICAgIHJldHVybiBBcnJheS5pc0FycmF5KHgpICYmICgoeC5sZW5ndGggPT09IDApIHx8IEFycmF5LmlzQXJyYXkoeFswXSkpO1xufVxuXG5ET01GcmFnbWVudC5wcm90b3R5cGUuaW50ZXJwcmV0U3BlYyA9IGZ1bmN0aW9uIChzcGVjKSB7XG4gICAgLy8gRnJhZ21lbnQgc3BlY3MgYXJlIHJvdWdobHkgSlNPTi1lcXVpdmFsZW50cyBvZiBTWE1MLlxuICAgIC8vIHNwZWMgOjo9PSBbXCJ0YWdcIiwgW1tcImF0dHJcIiwgXCJ2YWx1ZVwiXSwgLi4uXSwgc3BlYywgc3BlYywgLi4uXVxuICAgIC8vICAgICAgICAgfCBbXCJ0YWdcIiwgc3BlYywgc3BlYywgLi4uXVxuICAgIC8vICAgICAgICAgfCBcImNkYXRhXCJcbiAgICBpZiAodHlwZW9mKHNwZWMpID09PSBcInN0cmluZ1wiIHx8IHR5cGVvZihzcGVjKSA9PT0gXCJudW1iZXJcIikge1xuXHRyZXR1cm4gZG9jdW1lbnQuY3JlYXRlVGV4dE5vZGUoc3BlYyk7XG4gICAgfSBlbHNlIGlmICgkLmlzQXJyYXkoc3BlYykpIHtcblx0dmFyIHRhZ05hbWUgPSBzcGVjWzBdO1xuXHR2YXIgaGFzQXR0cnMgPSBpc0F0dHJpYnV0ZXMoc3BlY1sxXSk7XG5cdHZhciBhdHRycyA9IGhhc0F0dHJzID8gc3BlY1sxXSA6IHt9O1xuXHR2YXIga2lkSW5kZXggPSBoYXNBdHRycyA/IDIgOiAxO1xuXG5cdC8vIFdvdyEgU3VjaCBYU1MhIE1hbnkgaGFja3MhIFNvIHZ1bG5lcmFiaWxpdHkhIEFtYXplIVxuXHR2YXIgbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQodGFnTmFtZSk7XG5cdGZvciAodmFyIGkgPSAwOyBpIDwgYXR0cnMubGVuZ3RoOyBpKyspIHtcblx0ICAgIG4uc2V0QXR0cmlidXRlKGF0dHJzW2ldWzBdLCBhdHRyc1tpXVsxXSk7XG5cdH1cblx0Zm9yICh2YXIgaSA9IGtpZEluZGV4OyBpIDwgc3BlYy5sZW5ndGg7IGkrKykge1xuXHQgICAgbi5hcHBlbmRDaGlsZCh0aGlzLmludGVycHJldFNwZWMoc3BlY1tpXSkpO1xuXHR9XG5cdHJldHVybiBuO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIklsbC1mb3JtZWQgRE9NIHNwZWNpZmljYXRpb25cIik7XG4gICAgfVxufTtcblxuRE9NRnJhZ21lbnQucHJvdG90eXBlLmJ1aWxkTm9kZXMgPSBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIHZhciBub2RlcyA9IFtdO1xuICAgICQoc2VsZi5zZWxlY3RvcikuZWFjaChmdW5jdGlvbiAoaW5kZXgsIGRvbU5vZGUpIHtcblx0dmFyIG4gPSBzZWxmLmludGVycHJldFNwZWMoc2VsZi5mcmFnbWVudFNwZWMpO1xuXHRuLmNsYXNzTGlzdC5hZGQoc2VsZi5mcmFnbWVudENsYXNzKTtcblx0ZG9tTm9kZS5hcHBlbmRDaGlsZChuKTtcblx0bm9kZXMucHVzaChuKTtcbiAgICB9KTtcbiAgICByZXR1cm4gbm9kZXM7XG59O1xuXG4vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cblxubW9kdWxlLmV4cG9ydHMuc3Bhd25ET01Ecml2ZXIgPSBzcGF3bkRPTURyaXZlcjtcbm1vZHVsZS5leHBvcnRzLmRlZmF1bHRXcmFwRnVuY3Rpb24gPSBkZWZhdWx0V3JhcEZ1bmN0aW9uO1xuIiwiLyogR3JvdW5kIGludGVyZmFjZSAqL1xudmFyIE1pbmltYXJ0ID0gcmVxdWlyZShcIi4vbWluaW1hcnQuanNcIik7XG52YXIgV29ybGQgPSBNaW5pbWFydC5Xb3JsZDtcblxuZnVuY3Rpb24gR3JvdW5kKGJvb3RGbikge1xuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICB0aGlzLnN0ZXBwZXJJZCA9IG51bGw7XG4gICAgV29ybGQud2l0aFdvcmxkU3RhY2soW1t0aGlzLCAtMV1dLCBmdW5jdGlvbiAoKSB7XG5cdHNlbGYud29ybGQgPSBuZXcgV29ybGQoYm9vdEZuKTtcbiAgICB9KTtcbn1cblxuR3JvdW5kLnByb3RvdHlwZS5zdGVwID0gZnVuY3Rpb24gKCkge1xuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICByZXR1cm4gV29ybGQud2l0aFdvcmxkU3RhY2soW1t0aGlzLCAtMV1dLCBmdW5jdGlvbiAoKSB7XG5cdHJldHVybiBzZWxmLndvcmxkLnN0ZXAoKTtcbiAgICB9KTtcbn07XG5cbkdyb3VuZC5wcm90b3R5cGUuY2hlY2tQaWQgPSBmdW5jdGlvbiAocGlkKSB7XG4gICAgaWYgKHBpZCAhPT0gLTEpIGNvbnNvbGUuZXJyb3IoXCJXZWlyZCBwaWQgaW4gR3JvdW5kIG1hcmtQaWRSdW5uYWJsZVwiLCBwaWQpO1xufTtcblxuR3JvdW5kLnByb3RvdHlwZS5tYXJrUGlkUnVubmFibGUgPSBmdW5jdGlvbiAocGlkKSB7XG4gICAgdGhpcy5jaGVja1BpZChwaWQpO1xuICAgIHRoaXMuc3RhcnRTdGVwcGluZygpO1xufTtcblxuR3JvdW5kLnByb3RvdHlwZS5zdGFydFN0ZXBwaW5nID0gZnVuY3Rpb24gKCkge1xuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICBpZiAodGhpcy5zdGVwcGVySWQpIHJldHVybjtcbiAgICBpZiAodGhpcy5zdGVwKCkpIHtcblx0dGhpcy5zdGVwcGVySWQgPSBzZXRUaW1lb3V0KGZ1bmN0aW9uICgpIHtcblx0ICAgIHNlbGYuc3RlcHBlcklkID0gbnVsbDtcblx0ICAgIHNlbGYuc3RhcnRTdGVwcGluZygpO1xuXHR9LCAwKTtcbiAgICB9XG59O1xuXG5Hcm91bmQucHJvdG90eXBlLnN0b3BTdGVwcGluZyA9IGZ1bmN0aW9uICgpIHtcbiAgICBpZiAodGhpcy5zdGVwcGVySWQpIHtcblx0Y2xlYXJUaW1lb3V0KHRoaXMuc3RlcHBlcklkKTtcblx0dGhpcy5zdGVwcGVySWQgPSBudWxsO1xuICAgIH1cbn07XG5cbkdyb3VuZC5wcm90b3R5cGUuZW5xdWV1ZUFjdGlvbiA9IGZ1bmN0aW9uIChwaWQsIGFjdGlvbikge1xuICAgIHRoaXMuY2hlY2tQaWQocGlkKTtcbiAgICBpZiAoYWN0aW9uLnR5cGUgPT09ICdyb3V0ZXMnKSB7XG5cdGlmICghYWN0aW9uLmdlc3RhbHQuaXNFbXB0eSgpKSB7XG5cdCAgICBjb25zb2xlLmVycm9yKFwiWW91IGhhdmUgc3Vic2NyaWJlZCB0byBhIG5vbmV4aXN0ZW50IGV2ZW50IHNvdXJjZS5cIixcblx0XHRcdCAgYWN0aW9uLmdlc3RhbHQucHJldHR5KCkpO1xuXHR9XG4gICAgfSBlbHNlIHtcblx0Y29uc29sZS5lcnJvcihcIllvdSBoYXZlIHNlbnQgYSBtZXNzYWdlIGludG8gdGhlIG91dGVyIHZvaWQuXCIsIGFjdGlvbik7XG4gICAgfVxufTtcblxuLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXG5cbm1vZHVsZS5leHBvcnRzLkdyb3VuZCA9IEdyb3VuZDtcbiIsIi8vIEpRdWVyeSBldmVudCBkcml2ZXJcbnZhciBNaW5pbWFydCA9IHJlcXVpcmUoXCIuL21pbmltYXJ0LmpzXCIpO1xudmFyIFdvcmxkID0gTWluaW1hcnQuV29ybGQ7XG52YXIgc3ViID0gTWluaW1hcnQuc3ViO1xudmFyIHB1YiA9IE1pbmltYXJ0LnB1YjtcbnZhciBfXyA9IE1pbmltYXJ0Ll9fO1xudmFyIF8kID0gTWluaW1hcnQuXyQ7XG5cbmZ1bmN0aW9uIHNwYXduSlF1ZXJ5RHJpdmVyKGJhc2VTZWxlY3RvciwgbWV0YUxldmVsLCB3cmFwRnVuY3Rpb24pIHtcbiAgICBtZXRhTGV2ZWwgPSBtZXRhTGV2ZWwgfHwgMDtcbiAgICB3cmFwRnVuY3Rpb24gPSB3cmFwRnVuY3Rpb24gfHwgZGVmYXVsdFdyYXBGdW5jdGlvbjtcbiAgICB2YXIgZCA9IG5ldyBNaW5pbWFydC5EZW1hbmRNYXRjaGVyKHdyYXBGdW5jdGlvbihfJCwgXyQsIF9fKSwgbWV0YUxldmVsLFxuXHRcdFx0XHQgICAgICAge2RlbWFuZFNpZGVJc1N1YnNjcmlwdGlvbjogdHJ1ZX0pO1xuICAgIGQub25EZW1hbmRJbmNyZWFzZSA9IGZ1bmN0aW9uIChjYXB0dXJlcykge1xuXHR2YXIgc2VsZWN0b3IgPSBjYXB0dXJlc1swXTtcblx0dmFyIGV2ZW50TmFtZSA9IGNhcHR1cmVzWzFdO1xuXHRXb3JsZC5zcGF3bihuZXcgSlF1ZXJ5RXZlbnRSb3V0ZXIoYmFzZVNlbGVjdG9yLFxuXHRcdFx0XHRcdCAgc2VsZWN0b3IsXG5cdFx0XHRcdFx0ICBldmVudE5hbWUsXG5cdFx0XHRcdFx0ICBtZXRhTGV2ZWwsXG5cdFx0XHRcdFx0ICB3cmFwRnVuY3Rpb24pLFxuXHRcdCAgICBbcHViKHdyYXBGdW5jdGlvbihzZWxlY3RvciwgZXZlbnROYW1lLCBfXyksIG1ldGFMZXZlbCksXG5cdFx0ICAgICBwdWIod3JhcEZ1bmN0aW9uKHNlbGVjdG9yLCBldmVudE5hbWUsIF9fKSwgbWV0YUxldmVsLCAxKV0pO1xuICAgIH07XG4gICAgV29ybGQuc3Bhd24oZCk7XG59XG5cbmZ1bmN0aW9uIGRlZmF1bHRXcmFwRnVuY3Rpb24oc2VsZWN0b3IsIGV2ZW50TmFtZSwgZXZlbnRWYWx1ZSkge1xuICAgIHJldHVybiBbXCJqUXVlcnlcIiwgc2VsZWN0b3IsIGV2ZW50TmFtZSwgZXZlbnRWYWx1ZV07XG59XG5cbmZ1bmN0aW9uIEpRdWVyeUV2ZW50Um91dGVyKGJhc2VTZWxlY3Rvciwgc2VsZWN0b3IsIGV2ZW50TmFtZSwgbWV0YUxldmVsLCB3cmFwRnVuY3Rpb24pIHtcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgdGhpcy5iYXNlU2VsZWN0b3IgPSBiYXNlU2VsZWN0b3IgfHwgbnVsbDtcbiAgICB0aGlzLnNlbGVjdG9yID0gc2VsZWN0b3I7XG4gICAgdGhpcy5ldmVudE5hbWUgPSBldmVudE5hbWU7XG4gICAgdGhpcy5tZXRhTGV2ZWwgPSBtZXRhTGV2ZWwgfHwgMDtcbiAgICB0aGlzLndyYXBGdW5jdGlvbiA9IHdyYXBGdW5jdGlvbiB8fCBkZWZhdWx0V3JhcEZ1bmN0aW9uO1xuICAgIHRoaXMucHJldmVudERlZmF1bHQgPSAodGhpcy5ldmVudE5hbWUuY2hhckF0KDApICE9PSBcIitcIik7XG4gICAgdGhpcy5oYW5kbGVyID1cblx0V29ybGQud3JhcChmdW5jdGlvbiAoZSkge1xuXHQgICAgV29ybGQuc2VuZChzZWxmLndyYXBGdW5jdGlvbihzZWxmLnNlbGVjdG9yLCBzZWxmLmV2ZW50TmFtZSwgZSksIHNlbGYubWV0YUxldmVsKTtcblx0ICAgIGlmIChzZWxmLnByZXZlbnREZWZhdWx0KSBlLnByZXZlbnREZWZhdWx0KCk7XG5cdCAgICByZXR1cm4gIXNlbGYucHJldmVudERlZmF1bHQ7XG5cdH0pO1xuICAgIHRoaXMuY29tcHV0ZU5vZGVzKCkub24odGhpcy5wcmV2ZW50RGVmYXVsdCA/IHRoaXMuZXZlbnROYW1lIDogdGhpcy5ldmVudE5hbWUuc3Vic3RyaW5nKDEpLFxuXHRcdFx0ICAgdGhpcy5oYW5kbGVyKTtcbn1cblxuSlF1ZXJ5RXZlbnRSb3V0ZXIucHJvdG90eXBlLmhhbmRsZUV2ZW50ID0gZnVuY3Rpb24gKGUpIHtcbiAgICBpZiAoZS50eXBlID09PSBcInJvdXRlc1wiICYmIGUuZ2VzdGFsdC5pc0VtcHR5KCkpIHtcblx0dGhpcy5jb21wdXRlTm9kZXMoKS5vZmYodGhpcy5ldmVudE5hbWUsIHRoaXMuaGFuZGxlcik7XG5cdFdvcmxkLmV4aXQoKTtcbiAgICB9XG59O1xuXG5KUXVlcnlFdmVudFJvdXRlci5wcm90b3R5cGUuY29tcHV0ZU5vZGVzID0gZnVuY3Rpb24gKCkge1xuICAgIGlmICh0aGlzLmJhc2VTZWxlY3Rvcikge1xuXHRyZXR1cm4gJCh0aGlzLmJhc2VTZWxlY3RvcikuY2hpbGRyZW4odGhpcy5zZWxlY3RvcikuYWRkQmFjayh0aGlzLnNlbGVjdG9yKTtcbiAgICB9IGVsc2Uge1xuXHRyZXR1cm4gJCh0aGlzLnNlbGVjdG9yKTtcbiAgICB9XG59O1xuXG5mdW5jdGlvbiBzaW1wbGlmeURPTUV2ZW50KGUpIHtcbiAgICB2YXIga2V5cyA9IFtdO1xuICAgIGZvciAodmFyIGsgaW4gZSkge1xuXHR2YXIgdiA9IGVba107XG5cdGlmICh0eXBlb2YgdiA9PT0gJ29iamVjdCcpIGNvbnRpbnVlO1xuXHRpZiAodHlwZW9mIHYgPT09ICdmdW5jdGlvbicpIGNvbnRpbnVlO1xuXHRrZXlzLnB1c2goayk7XG4gICAgfVxuICAgIGtleXMuc29ydCgpO1xuICAgIHZhciBzaW1wbGlmaWVkID0gW107XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBrZXlzLmxlbmd0aDsgaSsrKSB7XG5cdHNpbXBsaWZpZWQucHVzaChba2V5c1tpXSwgZVtrZXlzW2ldXV0pO1xuICAgIH1cbiAgICByZXR1cm4gc2ltcGxpZmllZDtcbn1cblxuLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXG5cbm1vZHVsZS5leHBvcnRzLnNwYXduSlF1ZXJ5RHJpdmVyID0gc3Bhd25KUXVlcnlEcml2ZXI7XG5tb2R1bGUuZXhwb3J0cy5zaW1wbGlmeURPTUV2ZW50ID0gc2ltcGxpZnlET01FdmVudDtcbm1vZHVsZS5leHBvcnRzLmRlZmF1bHRXcmFwRnVuY3Rpb24gPSBkZWZhdWx0V3JhcEZ1bmN0aW9uO1xuIiwibW9kdWxlLmV4cG9ydHMgPSByZXF1aXJlKFwiLi9taW5pbWFydC5qc1wiKTtcblxubW9kdWxlLmV4cG9ydHMuRE9NID0gcmVxdWlyZShcIi4vZG9tLWRyaXZlci5qc1wiKTtcbm1vZHVsZS5leHBvcnRzLkpRdWVyeSA9IHJlcXVpcmUoXCIuL2pxdWVyeS1kcml2ZXIuanNcIik7XG5tb2R1bGUuZXhwb3J0cy5Sb3V0aW5nVGFibGVXaWRnZXQgPSByZXF1aXJlKFwiLi9yb3V0aW5nLXRhYmxlLXdpZGdldC5qc1wiKTtcbm1vZHVsZS5leHBvcnRzLldlYlNvY2tldCA9IHJlcXVpcmUoXCIuL3dlYnNvY2tldC1kcml2ZXIuanNcIik7XG5tb2R1bGUuZXhwb3J0cy5SZWZsZWN0ID0gcmVxdWlyZShcIi4vcmVmbGVjdC5qc1wiKTtcblxubW9kdWxlLmV4cG9ydHMuR3JvdW5kID0gcmVxdWlyZShcIi4vZ3JvdW5kLmpzXCIpLkdyb3VuZDtcbm1vZHVsZS5leHBvcnRzLkFjdG9yID0gcmVxdWlyZShcIi4vYWN0b3IuanNcIikuQWN0b3I7XG5tb2R1bGUuZXhwb3J0cy5TcHkgPSByZXF1aXJlKFwiLi9zcHkuanNcIikuU3B5O1xubW9kdWxlLmV4cG9ydHMuV2FrZURldGVjdG9yID0gcmVxdWlyZShcIi4vd2FrZS1kZXRlY3Rvci5qc1wiKS5XYWtlRGV0ZWN0b3I7XG5cbnZhciBXb3JrZXIgPSByZXF1aXJlKFwiLi93b3JrZXIuanNcIik7XG5tb2R1bGUuZXhwb3J0cy5Xb3JrZXIgPSBXb3JrZXIuV29ya2VyO1xubW9kdWxlLmV4cG9ydHMuV29ya2VyR3JvdW5kID0gV29ya2VyLldvcmtlckdyb3VuZDtcbiIsInZhciBSb3V0ZSA9IHJlcXVpcmUoXCIuL3JvdXRlLmpzXCIpO1xudmFyIFV0aWwgPSByZXF1aXJlKFwiLi91dGlsLmpzXCIpO1xuXG4vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cblxuLy8gVE9ETzogdHJpZ2dlci1ndWFyZHMgYXMgcGVyIG1pbmltYXJ0XG5cbi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cbi8qIEV2ZW50cyBhbmQgQWN0aW9ucyAqL1xuXG52YXIgX18gPSBSb3V0ZS5fXztcbnZhciBfJCA9IFJvdXRlLl8kO1xuXG5mdW5jdGlvbiBzdWIocGF0dGVybiwgbWV0YUxldmVsLCBsZXZlbCkge1xuICAgIHJldHVybiBSb3V0ZS5zaW1wbGVHZXN0YWx0KGZhbHNlLCBwYXR0ZXJuLCBtZXRhTGV2ZWwsIGxldmVsKTtcbn1cblxuZnVuY3Rpb24gcHViKHBhdHRlcm4sIG1ldGFMZXZlbCwgbGV2ZWwpIHtcbiAgICByZXR1cm4gUm91dGUuc2ltcGxlR2VzdGFsdCh0cnVlLCBwYXR0ZXJuLCBtZXRhTGV2ZWwsIGxldmVsKTtcbn1cblxuZnVuY3Rpb24gc3Bhd24oYmVoYXZpb3IsIGluaXRpYWxHZXN0YWx0cykge1xuICAgIHJldHVybiB7IHR5cGU6IFwic3Bhd25cIixcblx0ICAgICBiZWhhdmlvcjogYmVoYXZpb3IsXG5cdCAgICAgaW5pdGlhbEdlc3RhbHQ6IFJvdXRlLmdlc3RhbHRVbmlvbihpbml0aWFsR2VzdGFsdHMgfHwgW10pIH07XG59XG5cbmZ1bmN0aW9uIHVwZGF0ZVJvdXRlcyhnZXN0YWx0cykge1xuICAgIHJldHVybiB7IHR5cGU6IFwicm91dGVzXCIsIGdlc3RhbHQ6IFJvdXRlLmdlc3RhbHRVbmlvbihnZXN0YWx0cykgfTtcbn1cblxuZnVuY3Rpb24gcGVuZGluZ1JvdXRpbmdVcGRhdGUoYWdncmVnYXRlLCBhZmZlY3RlZFN1Ymdlc3RhbHQsIGtub3duVGFyZ2V0KSB7XG4gICAgcmV0dXJuIHsgdHlwZTogXCJwZW5kaW5nUm91dGluZ1VwZGF0ZVwiLFxuXHQgICAgIGFnZ3JlZ2F0ZTogYWdncmVnYXRlLFxuXHQgICAgIGFmZmVjdGVkU3ViZ2VzdGFsdDogYWZmZWN0ZWRTdWJnZXN0YWx0LFxuXHQgICAgIGtub3duVGFyZ2V0OiBrbm93blRhcmdldCB9O1xufVxuXG5mdW5jdGlvbiBzZW5kTWVzc2FnZShtLCBtZXRhTGV2ZWwsIGlzRmVlZGJhY2spIHtcbiAgICByZXR1cm4geyB0eXBlOiBcIm1lc3NhZ2VcIixcblx0ICAgICBtZXRhTGV2ZWw6IChtZXRhTGV2ZWwgPT09IHVuZGVmaW5lZCkgPyAwIDogbWV0YUxldmVsLFxuXHQgICAgIG1lc3NhZ2U6IG0sXG5cdCAgICAgaXNGZWVkYmFjazogKGlzRmVlZGJhY2sgPT09IHVuZGVmaW5lZCkgPyBmYWxzZSA6IGlzRmVlZGJhY2sgfTtcbn1cblxuZnVuY3Rpb24gc2h1dGRvd25Xb3JsZCgpIHtcbiAgICByZXR1cm4geyB0eXBlOiBcInNodXRkb3duV29ybGRcIiB9O1xufVxuXG4vKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG4vKiBDb25maWd1cmF0aW9ucyAqL1xuXG5mdW5jdGlvbiBXb3JsZChib290Rm4pIHtcbiAgICB0aGlzLmFsaXZlID0gdHJ1ZTtcbiAgICB0aGlzLmV2ZW50UXVldWUgPSBbXTtcbiAgICB0aGlzLnJ1bm5hYmxlUGlkcyA9IHt9O1xuICAgIHRoaXMucGFydGlhbEdlc3RhbHQgPSBSb3V0ZS5lbXB0eUdlc3RhbHQ7IC8vIE9ubHkgZ2VzdGFsdCBmcm9tIGxvY2FsIHByb2Nlc3Nlc1xuICAgIHRoaXMuZnVsbEdlc3RhbHQgPSBSb3V0ZS5lbXB0eUdlc3RhbHQgOzsgLy8gcGFydGlhbEdlc3RhbHQgdW5pb25lZCB3aXRoIGRvd253YXJkR2VzdGFsdFxuICAgIHRoaXMucHJvY2Vzc1RhYmxlID0ge307XG4gICAgdGhpcy50b21ic3RvbmVzID0ge307XG4gICAgdGhpcy5kb3dud2FyZEdlc3RhbHQgPSBSb3V0ZS5lbXB0eUdlc3RhbHQ7XG4gICAgdGhpcy5wcm9jZXNzQWN0aW9ucyA9IFtdO1xuICAgIHRoaXMuYXNDaGlsZCgtMSwgYm9vdEZuLCB0cnVlKTtcbn1cblxuLyogQ2xhc3Mgc3RhdGUgLyBtZXRob2RzICovXG5cbldvcmxkLm5leHRQaWQgPSAwO1xuXG5Xb3JsZC5zdGFjayA9IFtdO1xuXG5Xb3JsZC5jdXJyZW50ID0gZnVuY3Rpb24gKCkge1xuICAgIHJldHVybiBXb3JsZC5zdGFja1tXb3JsZC5zdGFjay5sZW5ndGggLSAxXVswXTtcbn07XG5cbldvcmxkLmFjdGl2ZVBpZCA9IGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4gV29ybGQuc3RhY2tbV29ybGQuc3RhY2subGVuZ3RoIC0gMV1bMV07XG59O1xuXG5Xb3JsZC5zZW5kID0gZnVuY3Rpb24gKG0sIG1ldGFMZXZlbCwgaXNGZWVkYmFjaykge1xuICAgIFdvcmxkLmN1cnJlbnQoKS5lbnF1ZXVlQWN0aW9uKFdvcmxkLmFjdGl2ZVBpZCgpLCBzZW5kTWVzc2FnZShtLCBtZXRhTGV2ZWwsIGlzRmVlZGJhY2spKTtcbn07XG5cbldvcmxkLnVwZGF0ZVJvdXRlcyA9IGZ1bmN0aW9uIChnZXN0YWx0cykge1xuICAgIFdvcmxkLmN1cnJlbnQoKS5lbnF1ZXVlQWN0aW9uKFdvcmxkLmFjdGl2ZVBpZCgpLCB1cGRhdGVSb3V0ZXMoZ2VzdGFsdHMpKTtcbn07XG5cbldvcmxkLnNwYXduID0gZnVuY3Rpb24gKGJlaGF2aW9yLCBpbml0aWFsR2VzdGFsdHMpIHtcbiAgICBXb3JsZC5jdXJyZW50KCkuZW5xdWV1ZUFjdGlvbihXb3JsZC5hY3RpdmVQaWQoKSwgc3Bhd24oYmVoYXZpb3IsIGluaXRpYWxHZXN0YWx0cykpO1xufTtcblxuV29ybGQuZXhpdCA9IGZ1bmN0aW9uIChleG4pIHtcbiAgICBXb3JsZC5jdXJyZW50KCkua2lsbChXb3JsZC5hY3RpdmVQaWQoKSwgZXhuKTtcbn07XG5cbldvcmxkLnNodXRkb3duV29ybGQgPSBmdW5jdGlvbiAoKSB7XG4gICAgV29ybGQuY3VycmVudCgpLmVucXVldWVBY3Rpb24oV29ybGQuYWN0aXZlUGlkKCksIHNodXRkb3duV29ybGQoKSk7XG59O1xuXG5Xb3JsZC53aXRoV29ybGRTdGFjayA9IGZ1bmN0aW9uIChzdGFjaywgZikge1xuICAgIHZhciBvbGRTdGFjayA9IFdvcmxkLnN0YWNrO1xuICAgIFdvcmxkLnN0YWNrID0gc3RhY2s7XG4gICAgdmFyIHJlc3VsdCA9IG51bGw7XG4gICAgdHJ5IHtcblx0cmVzdWx0ID0gZigpO1xuICAgIH0gY2F0Y2ggKGUpIHtcblx0V29ybGQuc3RhY2sgPSBvbGRTdGFjaztcblx0dGhyb3cgZTtcbiAgICB9XG4gICAgV29ybGQuc3RhY2sgPSBvbGRTdGFjaztcbiAgICByZXR1cm4gcmVzdWx0O1xufTtcblxuV29ybGQud3JhcCA9IGZ1bmN0aW9uIChmKSB7XG4gICAgdmFyIHNhdmVkU3RhY2sgPSBXb3JsZC5zdGFjay5zbGljZSgpO1xuICAgIHJldHVybiBmdW5jdGlvbiAoKSB7XG5cdHZhciBhY3R1YWxzID0gYXJndW1lbnRzO1xuXHRyZXR1cm4gV29ybGQud2l0aFdvcmxkU3RhY2soc2F2ZWRTdGFjaywgZnVuY3Rpb24gKCkge1xuXHQgICAgdmFyIHJlc3VsdCA9IFdvcmxkLmN1cnJlbnQoKS5hc0NoaWxkKFdvcmxkLmFjdGl2ZVBpZCgpLCBmdW5jdGlvbiAoKSB7XG5cdFx0cmV0dXJuIGYuYXBwbHkobnVsbCwgYWN0dWFscyk7XG5cdCAgICB9KTtcblx0ICAgIGZvciAodmFyIGkgPSBXb3JsZC5zdGFjay5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuXHRcdFdvcmxkLnN0YWNrW2ldWzBdLm1hcmtQaWRSdW5uYWJsZShXb3JsZC5zdGFja1tpXVsxXSk7XG5cdCAgICB9XG5cdCAgICByZXR1cm4gcmVzdWx0O1xuXHR9KTtcbiAgICB9O1xufTtcblxuLyogSW5zdGFuY2UgbWV0aG9kcyAqL1xuXG5Xb3JsZC5wcm90b3R5cGUuZW5xdWV1ZUFjdGlvbiA9IGZ1bmN0aW9uIChwaWQsIGFjdGlvbikge1xuICAgIHRoaXMucHJvY2Vzc0FjdGlvbnMucHVzaChbcGlkLCBhY3Rpb25dKTtcbn07XG5cbi8vIFRoZSBjb2RlIGlzIHdyaXR0ZW4gdG8gbWFpbnRhaW4gdGhlIHJ1bm5hYmxlUGlkcyBzZXQgY2FyZWZ1bGx5LCB0b1xuLy8gZW5zdXJlIHdlIGNhbiBsb2NhbGx5IGRlY2lkZSB3aGV0aGVyIHdlJ3JlIGluZXJ0IG9yIG5vdCB3aXRob3V0XG4vLyBoYXZpbmcgdG8gc2VhcmNoIHRoZSB3aG9sZSBkZWVwIHByb2Nlc3MgdHJlZS5cbldvcmxkLnByb3RvdHlwZS5pc0luZXJ0ID0gZnVuY3Rpb24gKCkge1xuICAgIHJldHVybiB0aGlzLmV2ZW50UXVldWUubGVuZ3RoID09PSAwXG5cdCYmIHRoaXMucHJvY2Vzc0FjdGlvbnMubGVuZ3RoID09PSAwXG5cdCYmIFJvdXRlLmlzX2VtcHR5U2V0KHRoaXMucnVubmFibGVQaWRzKTtcbn07XG5cbldvcmxkLnByb3RvdHlwZS5tYXJrUGlkUnVubmFibGUgPSBmdW5jdGlvbiAocGlkKSB7XG4gICAgdGhpcy5ydW5uYWJsZVBpZHNbcGlkXSA9IFtwaWRdO1xufTtcblxuV29ybGQucHJvdG90eXBlLnN0ZXAgPSBmdW5jdGlvbiAoKSB7XG4gICAgdGhpcy5kaXNwYXRjaEV2ZW50cygpO1xuICAgIHRoaXMucGVyZm9ybUFjdGlvbnMoKTtcbiAgICB0aGlzLnN0ZXBDaGlsZHJlbigpO1xuICAgIHJldHVybiB0aGlzLmFsaXZlICYmICF0aGlzLmlzSW5lcnQoKTtcbn07XG5cbldvcmxkLnByb3RvdHlwZS5hc0NoaWxkID0gZnVuY3Rpb24gKHBpZCwgZiwgb21pdExpdmVuZXNzQ2hlY2spIHtcbiAgICBpZiAoIShwaWQgaW4gdGhpcy5wcm9jZXNzVGFibGUpICYmICFvbWl0TGl2ZW5lc3NDaGVjaykge1xuXHRjb25zb2xlLndhcm4oXCJXb3JsZC5hc0NoaWxkIGVsaWRpbmcgaW52b2NhdGlvbiBvZiBkZWFkIHByb2Nlc3NcIiwgcGlkKTtcblx0cmV0dXJuO1xuICAgIH1cblxuICAgIFdvcmxkLnN0YWNrLnB1c2goW3RoaXMsIHBpZF0pO1xuICAgIHZhciByZXN1bHQgPSBudWxsO1xuICAgIHRyeSB7XG5cdHJlc3VsdCA9IGYoKTtcbiAgICB9IGNhdGNoIChlKSB7XG5cdHRoaXMua2lsbChwaWQsIGUpO1xuICAgIH1cbiAgICBpZiAoV29ybGQuc3RhY2sucG9wKClbMF0gIT09IHRoaXMpIHtcblx0dGhyb3cgbmV3IEVycm9yKFwiSW50ZXJuYWwgZXJyb3I6IFdvcmxkIHN0YWNrIGltYmFsYW5jZVwiKTtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbn07XG5cbldvcmxkLnByb3RvdHlwZS5raWxsID0gZnVuY3Rpb24gKHBpZCwgZXhuKSB7XG4gICAgaWYgKGV4biAmJiBleG4uc3RhY2spIHtcblx0Y29uc29sZS5sb2coXCJQcm9jZXNzIGV4aXRlZFwiLCBwaWQsIGV4biwgZXhuLnN0YWNrKTtcbiAgICB9IGVsc2Uge1xuXHRjb25zb2xlLmxvZyhcIlByb2Nlc3MgZXhpdGVkXCIsIHBpZCwgZXhuKTtcbiAgICB9XG4gICAgdmFyIHAgPSB0aGlzLnByb2Nlc3NUYWJsZVtwaWRdO1xuICAgIGRlbGV0ZSB0aGlzLnByb2Nlc3NUYWJsZVtwaWRdO1xuICAgIGlmIChwKSB7XG5cdGlmIChwLmJlaGF2aW9yLnRyYXBleGl0KSB7XG5cdCAgdGhpcy5hc0NoaWxkKHBpZCwgZnVuY3Rpb24gKCkgeyByZXR1cm4gcC5iZWhhdmlvci50cmFwZXhpdChleG4pOyB9LCB0cnVlKTtcblx0fVxuXHRpZiAoZXhuKSB7XG5cdCAgICBwLmV4aXRSZWFzb24gPSBleG47XG5cdCAgICB0aGlzLnRvbWJzdG9uZXNbcGlkXSA9IHA7XG5cdH1cblx0dGhpcy5hcHBseUFuZElzc3VlUm91dGluZ1VwZGF0ZShwLmdlc3RhbHQsIFJvdXRlLmVtcHR5R2VzdGFsdCk7XG4gICAgfVxufTtcblxuV29ybGQucHJvdG90eXBlLnN0ZXBDaGlsZHJlbiA9IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgcGlkcyA9IHRoaXMucnVubmFibGVQaWRzO1xuICAgIHRoaXMucnVubmFibGVQaWRzID0ge307XG4gICAgZm9yICh2YXIgcGlkIGluIHBpZHMpIHtcblx0dmFyIHAgPSB0aGlzLnByb2Nlc3NUYWJsZVtwaWRdO1xuXHRpZiAocCAmJiBwLmJlaGF2aW9yLnN0ZXAgLyogZXhpc3RzLCBoYXZlbid0IGNhbGxlZCBpdCB5ZXQgKi8pIHtcblx0ICAgIHZhciBjaGlsZEJ1c3kgPSB0aGlzLmFzQ2hpbGQocGlkIHwgMCwgZnVuY3Rpb24gKCkgeyByZXR1cm4gcC5iZWhhdmlvci5zdGVwKCkgfSk7XG5cdCAgICBpZiAoY2hpbGRCdXN5KSB0aGlzLm1hcmtQaWRSdW5uYWJsZShwaWQpO1xuXHR9XG4gICAgfVxufTtcblxuV29ybGQucHJvdG90eXBlLnBlcmZvcm1BY3Rpb25zID0gZnVuY3Rpb24gKCkge1xuICAgIHZhciBxdWV1ZSA9IHRoaXMucHJvY2Vzc0FjdGlvbnM7XG4gICAgdGhpcy5wcm9jZXNzQWN0aW9ucyA9IFtdO1xuICAgIHZhciBpdGVtO1xuICAgIHdoaWxlICgoaXRlbSA9IHF1ZXVlLnNoaWZ0KCkpICYmIHRoaXMuYWxpdmUpIHtcblx0dGhpcy5wZXJmb3JtQWN0aW9uKGl0ZW1bMF0sIGl0ZW1bMV0pO1xuICAgIH1cbn07XG5cbldvcmxkLnByb3RvdHlwZS5kaXNwYXRjaEV2ZW50cyA9IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgcXVldWUgPSB0aGlzLmV2ZW50UXVldWU7XG4gICAgdGhpcy5ldmVudFF1ZXVlID0gW107XG4gICAgdmFyIGl0ZW07XG4gICAgd2hpbGUgKChpdGVtID0gcXVldWUuc2hpZnQoKSkpIHtcblx0dGhpcy5kaXNwYXRjaEV2ZW50KGl0ZW0pO1xuICAgIH1cbn07XG5cbldvcmxkLnByb3RvdHlwZS5wZXJmb3JtQWN0aW9uID0gZnVuY3Rpb24gKHBpZCwgYWN0aW9uKSB7XG4gICAgc3dpdGNoIChhY3Rpb24udHlwZSkge1xuICAgIGNhc2UgXCJzcGF3blwiOlxuXHR2YXIgcGlkID0gV29ybGQubmV4dFBpZCsrO1xuXHR2YXIgbmV3R2VzdGFsdCA9IGFjdGlvbi5pbml0aWFsR2VzdGFsdC5sYWJlbChwaWQpO1xuXHR0aGlzLnByb2Nlc3NUYWJsZVtwaWRdID0geyBnZXN0YWx0OiBuZXdHZXN0YWx0LCBiZWhhdmlvcjogYWN0aW9uLmJlaGF2aW9yIH07XG5cdGlmIChhY3Rpb24uYmVoYXZpb3IuYm9vdCkge1xuXHQgICAgdGhpcy5hc0NoaWxkKHBpZCwgZnVuY3Rpb24gKCkgeyBhY3Rpb24uYmVoYXZpb3IuYm9vdCgpIH0pO1xuXHQgICAgdGhpcy5tYXJrUGlkUnVubmFibGUocGlkKTtcblx0fVxuXHR0aGlzLmFwcGx5QW5kSXNzdWVSb3V0aW5nVXBkYXRlKFJvdXRlLmVtcHR5R2VzdGFsdCwgbmV3R2VzdGFsdCwgcGlkKTtcblx0YnJlYWs7XG4gICAgY2FzZSBcInJvdXRlc1wiOlxuXHRpZiAocGlkIGluIHRoaXMucHJvY2Vzc1RhYmxlKSB7XG5cdCAgICAvLyBpdCBtYXkgbm90IGJlOiB0aGlzIG1pZ2h0IGJlIHRoZSByb3V0aW5nIHVwZGF0ZSBmcm9tIGFcblx0ICAgIC8vIGtpbGwgb2YgdGhlIHByb2Nlc3Ncblx0ICAgIHZhciBvbGRHZXN0YWx0ID0gdGhpcy5wcm9jZXNzVGFibGVbcGlkXS5nZXN0YWx0O1xuXHQgICAgdmFyIG5ld0dlc3RhbHQgPSBhY3Rpb24uZ2VzdGFsdC5sYWJlbChwaWR8MCk7XG5cdCAgICAvLyBeIHBpZHwwOiBjb252ZXJ0IHBpZCBmcm9tIHN0cmluZyAodGFibGUga2V5ISkgdG8gaW50ZWdlclxuXHQgICAgdGhpcy5wcm9jZXNzVGFibGVbcGlkXS5nZXN0YWx0ID0gbmV3R2VzdGFsdDtcblx0ICAgIHRoaXMuYXBwbHlBbmRJc3N1ZVJvdXRpbmdVcGRhdGUob2xkR2VzdGFsdCwgbmV3R2VzdGFsdCwgcGlkKTtcblx0fVxuXHRicmVhaztcbiAgICBjYXNlIFwibWVzc2FnZVwiOlxuXHRpZiAoYWN0aW9uLm1ldGFMZXZlbCA9PT0gMCkge1xuXHQgICAgdGhpcy5ldmVudFF1ZXVlLnB1c2goYWN0aW9uKTtcblx0fSBlbHNlIHtcblx0ICAgIFdvcmxkLnNlbmQoYWN0aW9uLm1lc3NhZ2UsIGFjdGlvbi5tZXRhTGV2ZWwgLSAxLCBhY3Rpb24uaXNGZWVkYmFjayk7XG5cdH1cblx0YnJlYWs7XG4gICAgY2FzZSBcInNodXRkb3duV29ybGRcIjpcblx0dGhpcy5hbGl2ZSA9IGZhbHNlOyAvLyBmb3JjZSB1cyB0byBzdG9wIGRvaW5nIHRoaW5ncyBpbW1lZGlhdGVseVxuXHRXb3JsZC5leGl0KCk7XG5cdGJyZWFrO1xuICAgIGRlZmF1bHQ6XG5cdHZhciBleG4gPSBuZXcgRXJyb3IoXCJBY3Rpb24gdHlwZSBcIiArIGFjdGlvbi50eXBlICsgXCIgbm90IHVuZGVyc3Rvb2RcIik7XG5cdGV4bi5hY3Rpb24gPSBhY3Rpb247XG5cdHRocm93IGV4bjtcbiAgICB9XG59O1xuXG5Xb3JsZC5wcm90b3R5cGUudXBkYXRlRnVsbEdlc3RhbHQgPSBmdW5jdGlvbiAoKSB7XG4gICAgdGhpcy5mdWxsR2VzdGFsdCA9IHRoaXMucGFydGlhbEdlc3RhbHQudW5pb24odGhpcy5kb3dud2FyZEdlc3RhbHQpO1xufTtcblxuV29ybGQucHJvdG90eXBlLmlzc3VlTG9jYWxSb3V0aW5nVXBkYXRlID0gZnVuY3Rpb24gKGFmZmVjdGVkU3ViZ2VzdGFsdCwga25vd25UYXJnZXQpIHtcbiAgICB0aGlzLmV2ZW50UXVldWUucHVzaChwZW5kaW5nUm91dGluZ1VwZGF0ZSh0aGlzLmZ1bGxHZXN0YWx0LFxuXHRcdFx0XHRcdCAgICAgIGFmZmVjdGVkU3ViZ2VzdGFsdCxcblx0XHRcdFx0XHQgICAgICBrbm93blRhcmdldCkpO1xufTtcblxuV29ybGQucHJvdG90eXBlLmFwcGx5QW5kSXNzdWVSb3V0aW5nVXBkYXRlID0gZnVuY3Rpb24gKG9sZGcsIG5ld2csIGtub3duVGFyZ2V0KSB7XG4gICAga25vd25UYXJnZXQgPSB0eXBlb2Yga25vd25UYXJnZXQgPT09ICd1bmRlZmluZWQnID8gbnVsbCA6IGtub3duVGFyZ2V0O1xuICAgIHRoaXMucGFydGlhbEdlc3RhbHQgPSB0aGlzLnBhcnRpYWxHZXN0YWx0LmVyYXNlUGF0aChvbGRnKS51bmlvbihuZXdnKTtcbiAgICB0aGlzLnVwZGF0ZUZ1bGxHZXN0YWx0KCk7XG4gICAgdGhpcy5pc3N1ZUxvY2FsUm91dGluZ1VwZGF0ZShvbGRnLnVuaW9uKG5ld2cpLCBrbm93blRhcmdldCk7XG4gICAgV29ybGQudXBkYXRlUm91dGVzKFt0aGlzLnBhcnRpYWxHZXN0YWx0LmRyb3AoKV0pO1xufTtcblxuV29ybGQucHJvdG90eXBlLmRpc3BhdGNoRXZlbnQgPSBmdW5jdGlvbiAoZSkge1xuICAgIHN3aXRjaCAoZS50eXBlKSB7XG4gICAgY2FzZSBcInBlbmRpbmdSb3V0aW5nVXBkYXRlXCI6XG5cdHZhciBwaWRzID0gZS5hZmZlY3RlZFN1Ymdlc3RhbHQubWF0Y2goZS5hZ2dyZWdhdGUpO1xuXHRpZiAoZS5rbm93blRhcmdldCAhPT0gbnVsbCkgcGlkcy51bnNoaWZ0KGUua25vd25UYXJnZXQpO1xuXHRmb3IgKHZhciBpID0gMDsgaSA8IHBpZHMubGVuZ3RoOyBpKyspIHtcblx0ICAgIHZhciBwaWQgPSBwaWRzW2ldO1xuXHQgICAgaWYgKHBpZCA9PT0gXCJvdXRcIikgY29uc29sZS53YXJuKFwiV291bGQgaGF2ZSBkZWxpdmVyZWQgYSByb3V0aW5nIHVwZGF0ZSB0byBlbnZpcm9ubWVudFwiKTtcblx0ICAgIHZhciBwID0gdGhpcy5wcm9jZXNzVGFibGVbcGlkXTtcblx0ICAgIGlmIChwKSB7XG5cdFx0dmFyIGcgPSBlLmFnZ3JlZ2F0ZS5maWx0ZXIocC5nZXN0YWx0KTtcblx0XHR0aGlzLmFzQ2hpbGQocGlkLCBmdW5jdGlvbiAoKSB7IHAuYmVoYXZpb3IuaGFuZGxlRXZlbnQodXBkYXRlUm91dGVzKFtnXSkpIH0pO1xuXHRcdHRoaXMubWFya1BpZFJ1bm5hYmxlKHBpZCk7XG5cdCAgICB9XG5cdH1cblx0YnJlYWs7XG5cbiAgICBjYXNlIFwibWVzc2FnZVwiOlxuXHR2YXIgcGlkcyA9IHRoaXMucGFydGlhbEdlc3RhbHQubWF0Y2hWYWx1ZShlLm1lc3NhZ2UsIGUubWV0YUxldmVsLCBlLmlzRmVlZGJhY2spO1xuXHRmb3IgKHZhciBpID0gMDsgaSA8IHBpZHMubGVuZ3RoOyBpKyspIHtcblx0ICAgIHZhciBwaWQgPSBwaWRzW2ldO1xuXHQgICAgdmFyIHAgPSB0aGlzLnByb2Nlc3NUYWJsZVtwaWRdO1xuXHQgICAgdGhpcy5hc0NoaWxkKHBpZCwgZnVuY3Rpb24gKCkgeyBwLmJlaGF2aW9yLmhhbmRsZUV2ZW50KGUpIH0pO1xuXHQgICAgdGhpcy5tYXJrUGlkUnVubmFibGUocGlkKTtcblx0fVxuXHRicmVhaztcblxuICAgIGRlZmF1bHQ6XG5cdHZhciBleG4gPSBuZXcgRXJyb3IoXCJFdmVudCB0eXBlIFwiICsgZS50eXBlICsgXCIgbm90IGRpc3BhdGNoYWJsZVwiKTtcblx0ZXhuLmV2ZW50ID0gZTtcblx0dGhyb3cgZXhuO1xuICAgIH1cbn07XG5cbldvcmxkLnByb3RvdHlwZS5oYW5kbGVFdmVudCA9IGZ1bmN0aW9uIChlKSB7XG4gICAgc3dpdGNoIChlLnR5cGUpIHtcbiAgICBjYXNlIFwicm91dGVzXCI6XG5cdHZhciBvbGREb3dud2FyZCA9IHRoaXMuZG93bndhcmRHZXN0YWx0O1xuXHR0aGlzLmRvd253YXJkR2VzdGFsdCA9IGUuZ2VzdGFsdC5sYWJlbChcIm91dFwiKS5saWZ0KCk7XG5cdHRoaXMudXBkYXRlRnVsbEdlc3RhbHQoKTtcblx0dGhpcy5pc3N1ZUxvY2FsUm91dGluZ1VwZGF0ZShvbGREb3dud2FyZC51bmlvbih0aGlzLmRvd253YXJkR2VzdGFsdCksIG51bGwpO1xuXHRicmVhaztcbiAgICBjYXNlIFwibWVzc2FnZVwiOlxuXHR0aGlzLmV2ZW50UXVldWUucHVzaChzZW5kTWVzc2FnZShlLm1lc3NhZ2UsIGUubWV0YUxldmVsICsgMSwgZS5pc0ZlZWRiYWNrKSk7XG5cdGJyZWFrO1xuICAgIGRlZmF1bHQ6XG5cdHZhciBleG4gPSBuZXcgRXJyb3IoXCJFdmVudCB0eXBlIFwiICsgZS50eXBlICsgXCIgbm90IHVuZGVyc3Rvb2RcIik7XG5cdGV4bi5ldmVudCA9IGU7XG5cdHRocm93IGV4bjtcbiAgICB9XG59O1xuXG4vKiBEZWJ1Z2dpbmcsIG1hbmFnZW1lbnQsIGFuZCBtb25pdG9yaW5nICovXG5cbldvcmxkLnByb3RvdHlwZS5wcm9jZXNzVHJlZSA9IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIga2lkcyA9IFtdO1xuICAgIGZvciAodmFyIHBpZCBpbiB0aGlzLnByb2Nlc3NUYWJsZSkge1xuXHR2YXIgcCA9IHRoaXMucHJvY2Vzc1RhYmxlW3BpZF07XG5cdGlmIChwLmJlaGF2aW9yIGluc3RhbmNlb2YgV29ybGQpIHtcblx0ICAgIGtpZHMucHVzaChbcGlkLCBwLmJlaGF2aW9yLnByb2Nlc3NUcmVlKCldKTtcblx0fSBlbHNlIHtcblx0ICAgIGtpZHMucHVzaChbcGlkLCBwXSk7XG5cdH1cbiAgICB9XG4gICAgZm9yICh2YXIgcGlkIGluIHRoaXMudG9tYnN0b25lcykge1xuXHRraWRzLnB1c2goW3BpZCwgdGhpcy50b21ic3RvbmVzW3BpZF1dKTtcbiAgICB9XG4gICAga2lkcy5zb3J0KGZ1bmN0aW9uIChhLCBiKSB7IHJldHVybiBhWzBdIC0gYlswXSB9KTtcbiAgICByZXR1cm4ga2lkcztcbn07XG5cbldvcmxkLnByb3RvdHlwZS50ZXh0UHJvY2Vzc1RyZWUgPSBmdW5jdGlvbiAob3duUGlkKSB7XG4gICAgdmFyIGxpbmVzID0gW107XG5cbiAgICBmdW5jdGlvbiBkdW1wUHJvY2VzcyhwcmVmaXgsIHBpZCwgcCkge1xuXHRpZiAoQXJyYXkuaXNBcnJheShwKSkge1xuXHQgICAgbGluZXMucHVzaChwcmVmaXggKyAnLS0rICcgKyBwaWQpO1xuXHQgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBwLmxlbmd0aDsgaSsrKSB7XG5cdFx0ZHVtcFByb2Nlc3MocHJlZml4ICsgJyAgfCcsIHBbaV1bMF0sIHBbaV1bMV0pO1xuXHQgICAgfVxuXHQgICAgbGluZXMucHVzaChwcmVmaXgpO1xuXHR9IGVsc2Uge1xuXHQgICAgdmFyIGxhYmVsID0gcC5iZWhhdmlvci5uYW1lIHx8IHAuYmVoYXZpb3IuY29uc3RydWN0b3IubmFtZSB8fCAnJztcblx0ICAgIHZhciB0b21ic3RvbmVTdHJpbmcgPSBwLmV4aXRSZWFzb24gPyAnIChFWElURUQ6ICcgKyBwLmV4aXRSZWFzb24gKyAnKSAnIDogJyc7XG5cdCAgICB2YXIgc3RyaW5naWZpZWRTdGF0ZTtcblx0ICAgIHRyeSB7XG5cdCAgICAgIHZhciByYXdTdGF0ZSA9IHAuYmVoYXZpb3IuZGVidWdTdGF0ZSA/IHAuYmVoYXZpb3IuZGVidWdTdGF0ZSgpIDogcC5iZWhhdmlvcjtcblx0ICAgICAgc3RyaW5naWZpZWRTdGF0ZSA9IEpTT04uc3RyaW5naWZ5KHJhd1N0YXRlLCBmdW5jdGlvbiAoaywgdikge1xuXHRcdHJldHVybiAoayA9PT0gJ25hbWUnKSA/IHVuZGVmaW5lZCA6IHY7XG5cdCAgICAgIH0pO1xuXHQgICAgfSBjYXRjaCAoZSkge1xuXHQgICAgICBzdHJpbmdpZmllZFN0YXRlID0gXCIoY2Fubm90IGNvbnZlcnQgcHJvY2VzcyBzdGF0ZSB0byBKU09OKVwiO1xuXHQgICAgfVxuXHQgICAgbGluZXMucHVzaChwcmVmaXggKyAnLS0gJyArIHBpZCArICc6ICcgKyBsYWJlbCArIHRvbWJzdG9uZVN0cmluZyArIHN0cmluZ2lmaWVkU3RhdGUpO1xuXHR9XG4gICAgfVxuXG4gICAgZHVtcFByb2Nlc3MoJycsIG93blBpZCB8fCAnJywgdGhpcy5wcm9jZXNzVHJlZSgpKTtcbiAgICByZXR1cm4gbGluZXMuam9pbignXFxuJyk7XG59O1xuXG5Xb3JsZC5wcm90b3R5cGUuY2xlYXJUb21ic3RvbmVzID0gZnVuY3Rpb24gKCkge1xuICAgIHRoaXMudG9tYnN0b25lcyA9IHt9O1xuICAgIGZvciAodmFyIHBpZCBpbiB0aGlzLnByb2Nlc3NUYWJsZSkge1xuXHR2YXIgcCA9IHRoaXMucHJvY2Vzc1RhYmxlW3BpZF07XG5cdGlmIChwLmJlaGF2aW9yIGluc3RhbmNlb2YgV29ybGQpIHtcblx0ICAgIHAuYmVoYXZpb3IuY2xlYXJUb21ic3RvbmVzKCk7XG5cdH1cbiAgICB9XG59O1xuXG4vKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG4vKiBVdGlsaXRpZXM6IG1hdGNoaW5nIGRlbWFuZCBmb3Igc29tZSBzZXJ2aWNlICovXG5cbmZ1bmN0aW9uIERlbWFuZE1hdGNoZXIocHJvamVjdGlvbiwgbWV0YUxldmVsLCBvcHRpb25zKSB7XG4gICAgb3B0aW9ucyA9IFV0aWwuZXh0ZW5kKHtcblx0ZGVtYW5kTGV2ZWw6IDAsXG5cdHN1cHBseUxldmVsOiAwLFxuXHRkZW1hbmRTaWRlSXNTdWJzY3JpcHRpb246IGZhbHNlLFxuXHRzdXBwbHlQcm9qZWN0aW9uOiBwcm9qZWN0aW9uXG4gICAgfSwgb3B0aW9ucyk7XG4gICAgdGhpcy5kZW1hbmRQYXR0ZXJuID0gUm91dGUucHJvamVjdGlvblRvUGF0dGVybihwcm9qZWN0aW9uKTtcbiAgICB0aGlzLnN1cHBseVBhdHRlcm4gPSBSb3V0ZS5wcm9qZWN0aW9uVG9QYXR0ZXJuKG9wdGlvbnMuc3VwcGx5UHJvamVjdGlvbik7XG4gICAgdGhpcy5kZW1hbmRQcm9qZWN0aW9uU3BlYyA9IFJvdXRlLmNvbXBpbGVQcm9qZWN0aW9uKHByb2plY3Rpb24pO1xuICAgIHRoaXMuc3VwcGx5UHJvamVjdGlvblNwZWMgPSBSb3V0ZS5jb21waWxlUHJvamVjdGlvbihvcHRpb25zLnN1cHBseVByb2plY3Rpb24pO1xuICAgIHRoaXMubWV0YUxldmVsID0gbWV0YUxldmVsIHwgMDtcbiAgICB0aGlzLmRlbWFuZExldmVsID0gb3B0aW9ucy5kZW1hbmRMZXZlbDtcbiAgICB0aGlzLnN1cHBseUxldmVsID0gb3B0aW9ucy5zdXBwbHlMZXZlbDtcbiAgICB0aGlzLmRlbWFuZFNpZGVJc1N1YnNjcmlwdGlvbiA9IG9wdGlvbnMuZGVtYW5kU2lkZUlzU3Vic2NyaXB0aW9uO1xuICAgIHRoaXMub25EZW1hbmRJbmNyZWFzZSA9IGZ1bmN0aW9uIChjYXB0dXJlcykge1xuXHRjb25zb2xlLmVycm9yKFwiVW5oYW5kbGVkIGluY3JlYXNlIGluIGRlbWFuZCBmb3Igcm91dGVcIiwgY2FwdHVyZXMpO1xuICAgIH07XG4gICAgdGhpcy5vblN1cHBseURlY3JlYXNlID0gZnVuY3Rpb24gKGNhcHR1cmVzKSB7XG5cdGNvbnNvbGUuZXJyb3IoXCJVbmhhbmRsZWQgZGVjcmVhc2UgaW4gc3VwcGx5IGZvciByb3V0ZVwiLCBjYXB0dXJlcyk7XG4gICAgfTtcbiAgICB0aGlzLmN1cnJlbnREZW1hbmQgPSB7fTtcbiAgICB0aGlzLmN1cnJlbnRTdXBwbHkgPSB7fTtcbn1cblxuRGVtYW5kTWF0Y2hlci5wcm90b3R5cGUuZGVidWdTdGF0ZSA9IGZ1bmN0aW9uICgpIHtcbiAgcmV0dXJuIHtcbiAgICBkZW1hbmRQYXR0ZXJuOiB0aGlzLmRlbWFuZFBhdHRlcm4sXG4gICAgc3VwcGx5UGF0dGVybjogdGhpcy5zdXBwbHlQYXR0ZXJuLFxuICAgIG1ldGFMZXZlbDogdGhpcy5tZXRhTGV2ZWwsXG4gICAgZGVtYW5kTGV2ZWw6IHRoaXMuZGVtYW5kTGV2ZWwsXG4gICAgc3VwcGx5TGV2ZWw6IHRoaXMuc3VwcGx5TGV2ZWwsXG4gICAgZGVtYW5kU2lkZUlzU3Vic2NyaXB0aW9uOiB0aGlzLmRlbWFuZFNpZGVJc1N1YnNjcmlwdGlvblxuXG4gICAgLy8gLCBjdXJyZW50RGVtYW5kOiB0aGlzLmN1cnJlbnREZW1hbmRcbiAgICAvLyAsIGN1cnJlbnRTdXBwbHk6IHRoaXMuY3VycmVudFN1cHBseVxuICB9O1xufTtcblxuRGVtYW5kTWF0Y2hlci5wcm90b3R5cGUuYm9vdCA9IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgb2JzZXJ2ZXJMZXZlbCA9IDEgKyBNYXRoLm1heCh0aGlzLmRlbWFuZExldmVsLCB0aGlzLnN1cHBseUxldmVsKTtcbiAgICBXb3JsZC51cGRhdGVSb3V0ZXMoW3N1Yih0aGlzLmRlbWFuZFBhdHRlcm4sIHRoaXMubWV0YUxldmVsLCBvYnNlcnZlckxldmVsKSxcblx0XHRcdHB1Yih0aGlzLnN1cHBseVBhdHRlcm4sIHRoaXMubWV0YUxldmVsLCBvYnNlcnZlckxldmVsKV0pO1xufTtcblxuRGVtYW5kTWF0Y2hlci5wcm90b3R5cGUuaGFuZGxlRXZlbnQgPSBmdW5jdGlvbiAoZSkge1xuICAgIGlmIChlLnR5cGUgPT09IFwicm91dGVzXCIpIHtcblx0dGhpcy5oYW5kbGVHZXN0YWx0KGUuZ2VzdGFsdCk7XG4gICAgfVxufTtcblxuRGVtYW5kTWF0Y2hlci5wcm90b3R5cGUuaGFuZGxlR2VzdGFsdCA9IGZ1bmN0aW9uIChnZXN0YWx0KSB7XG4gICAgdmFyIG5ld0RlbWFuZE1hdGNoZXIgPSBnZXN0YWx0LnByb2plY3QodGhpcy5kZW1hbmRQcm9qZWN0aW9uU3BlYyxcblx0XHRcdFx0XHQgICAhdGhpcy5kZW1hbmRTaWRlSXNTdWJzY3JpcHRpb24sXG5cdFx0XHRcdFx0ICAgdGhpcy5tZXRhTGV2ZWwsXG5cdFx0XHRcdFx0ICAgdGhpcy5kZW1hbmRMZXZlbCk7XG4gICAgdmFyIG5ld1N1cHBseU1hdGNoZXIgPSBnZXN0YWx0LnByb2plY3QodGhpcy5zdXBwbHlQcm9qZWN0aW9uU3BlYyxcblx0XHRcdFx0XHQgICB0aGlzLmRlbWFuZFNpZGVJc1N1YnNjcmlwdGlvbixcblx0XHRcdFx0XHQgICB0aGlzLm1ldGFMZXZlbCxcblx0XHRcdFx0XHQgICB0aGlzLnN1cHBseUxldmVsKTtcbiAgICB2YXIgbmV3RGVtYW5kID0gUm91dGUuYXJyYXlUb1NldChSb3V0ZS5tYXRjaGVyS2V5cyhuZXdEZW1hbmRNYXRjaGVyKSk7XG4gICAgdmFyIG5ld1N1cHBseSA9IFJvdXRlLmFycmF5VG9TZXQoUm91dGUubWF0Y2hlcktleXMobmV3U3VwcGx5TWF0Y2hlcikpO1xuICAgIHZhciBkZW1hbmREZWx0YSA9IFJvdXRlLnNldFN1YnRyYWN0KG5ld0RlbWFuZCwgdGhpcy5jdXJyZW50RGVtYW5kKTtcbiAgICB2YXIgc3VwcGx5RGVsdGEgPSBSb3V0ZS5zZXRTdWJ0cmFjdCh0aGlzLmN1cnJlbnRTdXBwbHksIG5ld1N1cHBseSk7XG4gICAgdmFyIGRlbWFuZEluY3IgPSBSb3V0ZS5zZXRTdWJ0cmFjdChkZW1hbmREZWx0YSwgbmV3U3VwcGx5KTtcbiAgICB2YXIgc3VwcGx5RGVjciA9IFJvdXRlLnNldEludGVyc2VjdChzdXBwbHlEZWx0YSwgbmV3RGVtYW5kKTtcbiAgICB0aGlzLmN1cnJlbnREZW1hbmQgPSBuZXdEZW1hbmQ7XG4gICAgdGhpcy5jdXJyZW50U3VwcGx5ID0gbmV3U3VwcGx5O1xuICAgIGZvciAodmFyIGsgaW4gZGVtYW5kSW5jcikgdGhpcy5vbkRlbWFuZEluY3JlYXNlKGRlbWFuZEluY3Jba10pO1xuICAgIGZvciAodmFyIGsgaW4gc3VwcGx5RGVjcikgdGhpcy5vblN1cHBseURlY3JlYXNlKHN1cHBseURlY3Jba10pO1xufTtcblxuLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuLyogVXRpbGl0aWVzOiBkZWR1cGxpY2F0b3IgKi9cblxuZnVuY3Rpb24gRGVkdXBsaWNhdG9yKHR0bF9tcykge1xuICAgIHRoaXMudHRsX21zID0gdHRsX21zIHx8IDEwMDAwO1xuICAgIHRoaXMucXVldWUgPSBbXTtcbiAgICB0aGlzLm1hcCA9IHt9O1xuICAgIHRoaXMudGltZXJJZCA9IG51bGw7XG59XG5cbkRlZHVwbGljYXRvci5wcm90b3R5cGUuYWNjZXB0ID0gZnVuY3Rpb24gKG0pIHtcbiAgICB2YXIgcyA9IEpTT04uc3RyaW5naWZ5KG0pO1xuICAgIGlmIChzIGluIHRoaXMubWFwKSByZXR1cm4gZmFsc2U7XG4gICAgdmFyIGVudHJ5ID0gWygrbmV3IERhdGUoKSkgKyB0aGlzLnR0bF9tcywgcywgbV07XG4gICAgdGhpcy5tYXBbc10gPSBlbnRyeTtcbiAgICB0aGlzLnF1ZXVlLnB1c2goZW50cnkpO1xuXG4gICAgaWYgKHRoaXMudGltZXJJZCA9PT0gbnVsbCkge1xuXHR2YXIgc2VsZiA9IHRoaXM7XG5cdHRoaXMudGltZXJJZCA9IHNldEludGVydmFsKGZ1bmN0aW9uICgpIHsgc2VsZi5leHBpcmVNZXNzYWdlcygpOyB9LFxuXHRcdFx0XHQgICB0aGlzLnR0bF9tcyA+IDEwMDAgPyAxMDAwIDogdGhpcy50dGxfbXMpO1xuICAgIH1cbiAgICByZXR1cm4gdHJ1ZTtcbn07XG5cbkRlZHVwbGljYXRvci5wcm90b3R5cGUuZXhwaXJlTWVzc2FnZXMgPSBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIG5vdyA9ICtuZXcgRGF0ZSgpO1xuICAgIHdoaWxlICh0aGlzLnF1ZXVlLmxlbmd0aCA+IDAgJiYgdGhpcy5xdWV1ZVswXVswXSA8PSBub3cpIHtcblx0dmFyIGVudHJ5ID0gdGhpcy5xdWV1ZS5zaGlmdCgpO1xuXHRkZWxldGUgdGhpcy5tYXBbZW50cnlbMV1dO1xuICAgIH1cbiAgICBpZiAodGhpcy5xdWV1ZS5sZW5ndGggPT09IDApIHtcblx0Y2xlYXJJbnRlcnZhbCh0aGlzLnRpbWVySWQpO1xuXHR0aGlzLnRpbWVySWQgPSBudWxsO1xuICAgIH1cbn07XG5cbi8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuXG5tb2R1bGUuZXhwb3J0cy5fXyA9IF9fO1xubW9kdWxlLmV4cG9ydHMuXyQgPSBfJDtcblxubW9kdWxlLmV4cG9ydHMuc3ViID0gc3ViO1xubW9kdWxlLmV4cG9ydHMucHViID0gcHViO1xubW9kdWxlLmV4cG9ydHMuc3Bhd24gPSBzcGF3bjtcbm1vZHVsZS5leHBvcnRzLnVwZGF0ZVJvdXRlcyA9IHVwZGF0ZVJvdXRlcztcbm1vZHVsZS5leHBvcnRzLnNlbmRNZXNzYWdlID0gc2VuZE1lc3NhZ2U7XG5tb2R1bGUuZXhwb3J0cy5zaHV0ZG93bldvcmxkID0gc2h1dGRvd25Xb3JsZDtcblxubW9kdWxlLmV4cG9ydHMuV29ybGQgPSBXb3JsZDtcbm1vZHVsZS5leHBvcnRzLkRlbWFuZE1hdGNoZXIgPSBEZW1hbmRNYXRjaGVyO1xubW9kdWxlLmV4cG9ydHMuRGVkdXBsaWNhdG9yID0gRGVkdXBsaWNhdG9yO1xubW9kdWxlLmV4cG9ydHMuUm91dGUgPSBSb3V0ZTtcbiIsIi8vIFJlZmxlY3Rpb24gb24gZnVuY3Rpb24gZm9ybWFsIHBhcmFtZXRlciBsaXN0cy5cbi8vIFRoaXMgbW9kdWxlIGlzIGJhc2VkIG9uIEFuZ3VsYXIncyBcImluamVjdG9yXCIgY29kZSxcbi8vIGh0dHBzOi8vZ2l0aHViLmNvbS9hbmd1bGFyL2FuZ3VsYXIuanMvYmxvYi9tYXN0ZXIvc3JjL2F1dG8vaW5qZWN0b3IuanMsXG4vLyBNSVQgbGljZW5zZWQsIGFuZCBoZW5jZTpcbi8vIENvcHlyaWdodCAoYykgMjAxMC0yMDE0IEdvb2dsZSwgSW5jLiBodHRwOi8vYW5ndWxhcmpzLm9yZ1xuLy8gQ29weXJpZ2h0IChjKSAyMDE0IFRvbnkgR2Fybm9jay1Kb25lc1xuXG52YXIgRk5fQVJHUyA9IC9eZnVuY3Rpb25cXHMqW15cXChdKlxcKFxccyooW15cXCldKilcXCkvbTtcbnZhciBGTl9BUkdfU1BMSVQgPSAvLC87XG52YXIgU1RSSVBfQ09NTUVOVFMgPSAvKChcXC9cXC8uKiQpfChcXC9cXCpbXFxzXFxTXSo/XFwqXFwvKSkvbWc7XG5cbmZ1bmN0aW9uIGZvcm1hbFBhcmFtZXRlcnMoZm4pIHtcbiAgICB2YXIgcmVzdWx0ID0gW107XG5cbiAgICB2YXIgZm5UZXh0ID0gZm4udG9TdHJpbmcoKS5yZXBsYWNlKFNUUklQX0NPTU1FTlRTLCAnJyk7XG4gICAgdmFyIGFyZ0RlY2wgPSBmblRleHQubWF0Y2goRk5fQVJHUyk7XG4gICAgdmFyIGFyZ3MgPSBhcmdEZWNsWzFdLnNwbGl0KEZOX0FSR19TUExJVCk7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBhcmdzLmxlbmd0aDsgaSsrKSB7XG5cdHZhciB0cmltbWVkID0gYXJnc1tpXS50cmltKCk7XG5cdGlmICh0cmltbWVkKSB7IHJlc3VsdC5wdXNoKHRyaW1tZWQpOyB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHJlc3VsdDtcbn1cblxubW9kdWxlLmV4cG9ydHMuZm9ybWFsUGFyYW1ldGVycyA9IGZvcm1hbFBhcmFtZXRlcnM7XG4iLCJ2YXIgX18gPSBcIl9fXCI7IC8qIHdpbGRjYXJkIG1hcmtlciAqL1xuXG52YXIgU09BID0gXCJfX1tcIjsgLy8gc3RhcnQgb2YgYXJyYXlcbnZhciBFT0EgPSBcIl9fXVwiOyAvLyBlbmQgb2YgYXJyYXlcblxuZnVuY3Rpb24gZGllKG1lc3NhZ2UpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IobWVzc2FnZSk7XG59XG5cbmZ1bmN0aW9uICRFbWJlZGRlZChtYXRjaGVyKSB7XG4gICAgdGhpcy5tYXRjaGVyID0gbWF0Y2hlcjtcbn1cblxuZnVuY3Rpb24gZW1iZWRkZWRNYXRjaGVyKG1hdGNoZXIpIHtcbiAgICByZXR1cm4gbmV3ICRFbWJlZGRlZChtYXRjaGVyKTtcbn1cblxuLy8gVGhlIG5hbWUgYXJndW1lbnQgc2hvdWxkIGJlIGEgc3RyaW5nIG9yIG51bGw7IGl0IGRlZmF1bHRzIHRvIG51bGwuXG4vLyBUaGUgcGF0dGVybiBhcmd1bWVudCBkZWZhdWx0cyB0byB3aWxkY2FyZCwgX18uXG5mdW5jdGlvbiAkQ2FwdHVyZShuYW1lLCBwYXR0ZXJuKSB7XG4gICAgdGhpcy5uYW1lID0gbmFtZSB8fCBudWxsO1xuICAgIHRoaXMucGF0dGVybiA9ICh0eXBlb2YgcGF0dGVybiA9PT0gJ3VuZGVmaW5lZCcgPyBfXyA6IHBhdHRlcm4pO1xufVxuXG4vLyBBYmJyZXZpYXRpb246IF8kKC4uLikgPD09PiBuZXcgJENhcHR1cmUoLi4uKVxuZnVuY3Rpb24gXyQobmFtZSwgcGF0dGVybikge1xuICAgIHJldHVybiBuZXcgJENhcHR1cmUobmFtZSwgcGF0dGVybik7XG59XG5cbmZ1bmN0aW9uIGlzQ2FwdHVyZSh4KSB7IHJldHVybiB4IGluc3RhbmNlb2YgJENhcHR1cmUgfHwgeCA9PT0gXyQ7IH1cbmZ1bmN0aW9uIGNhcHR1cmVOYW1lKHgpIHsgcmV0dXJuIHggaW5zdGFuY2VvZiAkQ2FwdHVyZSA/IHgubmFtZSA6IG51bGw7IH1cbmZ1bmN0aW9uIGNhcHR1cmVQYXR0ZXJuKHgpIHsgcmV0dXJuIHggaW5zdGFuY2VvZiAkQ2FwdHVyZSA/IHgucGF0dGVybiA6IF9fOyB9XG5cbnZhciBTT0MgPSBcIl9fe3tcIjsgLy8gc3RhcnQgb2YgY2FwdHVyZVxudmFyIEVPQyA9IFwiX199fVwiOyAvLyBlbmQgb2YgY2FwdHVyZVxuXG5mdW5jdGlvbiAkU3VjY2Vzcyh2YWx1ZSkge1xuICAgIHRoaXMudmFsdWUgPSB2YWx1ZTtcbn1cblxuZnVuY3Rpb24gJFdpbGRjYXJkU2VxdWVuY2UobWF0Y2hlcikge1xuICAgIHRoaXMubWF0Y2hlciA9IG1hdGNoZXI7XG59XG5cbmZ1bmN0aW9uICREaWN0KCkge1xuICAgIHRoaXMubGVuZ3RoID0gMDtcbiAgICB0aGlzLmVudHJpZXMgPSB7fTtcbn1cblxuJERpY3QucHJvdG90eXBlLmdldCA9IGZ1bmN0aW9uIChrZXkpIHtcbiAgICByZXR1cm4gdGhpcy5lbnRyaWVzW2tleV0gfHwgZW1wdHlNYXRjaGVyO1xufTtcblxuJERpY3QucHJvdG90eXBlLnNldCA9IGZ1bmN0aW9uIChrZXksIHZhbCkge1xuICAgIGlmICghKGtleSBpbiB0aGlzLmVudHJpZXMpKSB0aGlzLmxlbmd0aCsrO1xuICAgIHRoaXMuZW50cmllc1trZXldID0gdmFsO1xufTtcblxuJERpY3QucHJvdG90eXBlLmNsZWFyID0gZnVuY3Rpb24gKGtleSkge1xuICAgIGlmIChrZXkgaW4gdGhpcy5lbnRyaWVzKSB0aGlzLmxlbmd0aC0tO1xuICAgIGRlbGV0ZSB0aGlzLmVudHJpZXNba2V5XTtcbn07XG5cbiREaWN0LnByb3RvdHlwZS5pc0VtcHR5ID0gZnVuY3Rpb24gKCkge1xuICAgIHJldHVybiB0aGlzLmxlbmd0aCA9PT0gMDtcbn07XG5cbiREaWN0LnByb3RvdHlwZS5jb3B5ID0gZnVuY3Rpb24gKCkge1xuICAgIHZhciBvdGhlciA9IG5ldyAkRGljdCgpO1xuICAgIG90aGVyLmxlbmd0aCA9IHRoaXMubGVuZ3RoO1xuICAgIGZvciAodmFyIGtleSBpbiB0aGlzLmVudHJpZXMpIHtcblx0aWYgKHRoaXMuZW50cmllcy5oYXNPd25Qcm9wZXJ0eShrZXkpKSB7XG5cdCAgICBvdGhlci5lbnRyaWVzW2tleV0gPSB0aGlzLmVudHJpZXNba2V5XTtcblx0fVxuICAgIH1cbiAgICByZXR1cm4gb3RoZXI7XG59O1xuXG4kRGljdC5wcm90b3R5cGUuZW1wdHlHdWFyZCA9IGZ1bmN0aW9uICgpIHtcbiAgICBpZiAodGhpcy5pc0VtcHR5KCkpIHJldHVybiBlbXB0eU1hdGNoZXI7XG4gICAgcmV0dXJuIHRoaXM7XG59O1xuXG4kRGljdC5wcm90b3R5cGUuaGFzID0gZnVuY3Rpb24gKGtleSkge1xuICAgIHJldHVybiBrZXkgaW4gdGhpcy5lbnRyaWVzO1xufTtcblxuJERpY3QucHJvdG90eXBlLnNvcnRlZEtleXMgPSBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIGtzID0gW107XG4gICAgZm9yICh2YXIgayBpbiB0aGlzLmVudHJpZXMpIGtzLnB1c2goayk7XG4gICAga3Muc29ydCgpO1xuICAgIHJldHVybiBrcztcbn1cblxuZnVuY3Rpb24gaXNfZW1wdHlNYXRjaGVyKG0pIHtcbiAgICByZXR1cm4gKG0gPT09IGVtcHR5TWF0Y2hlcik7XG59XG5cbi8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuLy8gQ29uc3RydWN0b3JzXG5cbnZhciBlbXB0eU1hdGNoZXIgPSBudWxsO1xuXG5mdW5jdGlvbiByc3VjY2Vzcyh2KSB7XG4gICAgcmV0dXJuICh2ID09PSBlbXB0eU1hdGNoZXIpID8gZW1wdHlNYXRjaGVyIDogbmV3ICRTdWNjZXNzKHYpO1xufVxuXG5mdW5jdGlvbiByc2VxKGUsIHIpIHtcbiAgICBpZiAociA9PT0gZW1wdHlNYXRjaGVyKSByZXR1cm4gZW1wdHlNYXRjaGVyO1xuICAgIHZhciBzID0gbmV3ICREaWN0KCk7XG4gICAgcy5zZXQoZSwgcik7XG4gICAgcmV0dXJuIHM7XG59XG5cbmZ1bmN0aW9uIHJ3aWxkKHIpIHtcbiAgICByZXR1cm4gcnNlcShfXywgcik7XG59XG5cbmZ1bmN0aW9uIHJ3aWxkc2VxKHIpIHtcbiAgICByZXR1cm4gKHIgPT09IGVtcHR5TWF0Y2hlcikgPyBlbXB0eU1hdGNoZXIgOiBuZXcgJFdpbGRjYXJkU2VxdWVuY2Uocik7XG59XG5cbi8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuXG5mdW5jdGlvbiBjb21waWxlUGF0dGVybih2LCBwKSB7XG4gICAgaWYgKCFwKSBkaWUoXCJjb21waWxlUGF0dGVybjogbWlzc2luZyBwYXR0ZXJuXCIpO1xuICAgIHJldHVybiB3YWxrKHAsIHJzZXEoRU9BLCByc3VjY2Vzcyh2KSkpO1xuXG4gICAgZnVuY3Rpb24gd2FsayhwLCBhY2MpIHtcblx0aWYgKHAgPT09IF9fKSByZXR1cm4gcndpbGQoYWNjKTtcblxuXHRpZiAoQXJyYXkuaXNBcnJheShwKSkge1xuXHQgICAgYWNjID0gcnNlcShFT0EsIGFjYyk7XG5cdCAgICBmb3IgKHZhciBpID0gcC5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuXHRcdGFjYyA9IHdhbGsocFtpXSwgYWNjKTtcblx0ICAgIH1cblx0ICAgIHJldHVybiByc2VxKFNPQSwgYWNjKTtcblx0fVxuXG5cdGlmIChwIGluc3RhbmNlb2YgJEVtYmVkZGVkKSB7XG5cdCAgICByZXR1cm4gYXBwZW5kTWF0Y2hlcihwLm1hdGNoZXIsIGZ1bmN0aW9uICh2KSB7IHJldHVybiBhY2M7IH0pO1xuXHR9IGVsc2Uge1xuXHQgICAgcmV0dXJuIHJzZXEoSlNPTi5zdHJpbmdpZnkocCksIGFjYyk7XG5cdH1cbiAgICB9XG59XG5cbmZ1bmN0aW9uIG1hdGNoUGF0dGVybih2LCBwKSB7XG4gICAgdmFyIGNhcHR1cmVDb3VudCA9IDA7XG4gICAgdmFyIHJlc3VsdCA9IHt9O1xuICAgIHRyeSB7XG5cdHdhbGsodiwgcCk7XG4gICAgfSBjYXRjaCAoZSkge1xuXHRpZiAoZS5tYXRjaFBhdHRlcm5GYWlsZWQpIHJldHVybiBudWxsO1xuXHR0aHJvdyBlO1xuICAgIH1cbiAgICByZXN1bHQubGVuZ3RoID0gY2FwdHVyZUNvdW50O1xuICAgIHJldHVybiByZXN1bHQ7XG5cbiAgICBmdW5jdGlvbiB3YWxrKHYsIHApIHtcblx0aWYgKHAgPT09IHYpIHJldHVybjtcblxuXHRpZiAocCA9PT0gX18pIHJldHVybjtcblxuXHRpZiAoQXJyYXkuaXNBcnJheShwKSAmJiBBcnJheS5pc0FycmF5KHYpICYmIHAubGVuZ3RoID09PSB2Lmxlbmd0aCkge1xuXHQgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBwLmxlbmd0aDsgaSsrKSB7XG5cdFx0d2Fsayh2W2ldLCBwW2ldKTtcblx0ICAgIH1cblx0ICAgIHJldHVybjtcblx0fVxuXG5cdGlmIChpc0NhcHR1cmUocCkpIHtcblx0ICAgIHZhciB0aGlzQ2FwdHVyZSA9IGNhcHR1cmVDb3VudCsrO1xuXHQgICAgd2Fsayh2LCBjYXB0dXJlUGF0dGVybihwKSk7XG5cdCAgICByZXN1bHRbY2FwdHVyZU5hbWUocCkgfHwgKCckJyArIHRoaXNDYXB0dXJlKV0gPSB2O1xuXHQgICAgcmV0dXJuO1xuXHR9XG5cblx0aWYgKHAgaW5zdGFuY2VvZiAkRW1iZWRkZWQpIHtcblx0ICAgIGRpZShcIiRFbWJlZGRlZCBwYXR0ZXJucyBub3Qgc3VwcG9ydGVkIGluIG1hdGNoUGF0dGVybigpXCIpO1xuXHR9XG5cblx0dGhyb3cge21hdGNoUGF0dGVybkZhaWxlZDogdHJ1ZX07XG4gICAgfVxufVxuXG5mdW5jdGlvbiBzaGFsbG93Q29weUFycmF5KHMpIHtcbiAgICByZXR1cm4gcy5zbGljZSgpO1xufVxuXG5mdW5jdGlvbiBydXBkYXRlSW5wbGFjZShyLCBrZXksIGspIHtcbiAgICBpZiAoaXNfZW1wdHlNYXRjaGVyKGspKSB7XG5cdHIuY2xlYXIoa2V5KTtcbiAgICB9IGVsc2Uge1xuXHRyLnNldChrZXksIGspO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gbWF0Y2hlckVxdWFscyhhLCBiKSB7XG4gICAgaWYgKGEgPT09IG51bGwpIHtcblx0cmV0dXJuIChiID09PSBudWxsKTtcbiAgICB9XG4gICAgaWYgKGIgPT09IG51bGwpIHJldHVybiBmYWxzZTtcblxuICAgIGlmIChhIGluc3RhbmNlb2YgJFdpbGRjYXJkU2VxdWVuY2UpIHtcblx0aWYgKCEoYiBpbnN0YW5jZW9mICRXaWxkY2FyZFNlcXVlbmNlKSkgcmV0dXJuIGZhbHNlO1xuXHRhID0gYS5tYXRjaGVyO1xuXHRiID0gYi5tYXRjaGVyO1xuICAgIH0gZWxzZSBpZiAoYiBpbnN0YW5jZW9mICRXaWxkY2FyZFNlcXVlbmNlKSByZXR1cm4gZmFsc2U7XG5cbiAgICBpZiAoYSBpbnN0YW5jZW9mICRTdWNjZXNzKSB7XG5cdGlmICghKGIgaW5zdGFuY2VvZiAkU3VjY2VzcykpIHJldHVybiBmYWxzZTtcblx0cmV0dXJuIHZhbHVlc0VxdWFsKGEudmFsdWUsIGIudmFsdWUpO1xuICAgIH1cbiAgICBpZiAoYiBpbnN0YW5jZW9mICRTdWNjZXNzKSByZXR1cm4gZmFsc2U7XG5cbiAgICBmb3IgKHZhciBrZXkgaW4gYS5lbnRyaWVzKSB7XG5cdGlmICghYi5oYXMoa2V5KSkgcmV0dXJuIGZhbHNlO1xuXHRpZiAoIW1hdGNoZXJFcXVhbHMoYS5lbnRyaWVzW2tleV0sIGIuZW50cmllc1trZXldKSkgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICByZXR1cm4gdHJ1ZTtcbn1cblxuZnVuY3Rpb24gaXNfa2V5T3BlbihrKSB7XG4gICAgcmV0dXJuIGsgPT09IFNPQTtcbn1cblxuZnVuY3Rpb24gaXNfa2V5Q2xvc2Uoaykge1xuICAgIHJldHVybiBrID09PSBFT0E7XG59XG5cbmZ1bmN0aW9uIGlzX2tleU5vcm1hbChrKSB7XG4gICAgcmV0dXJuICEoaXNfa2V5T3BlbihrKSB8fCBpc19rZXlDbG9zZShrKSk7XG59XG5cbi8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuLy8gRW5vdWdoIG9mIHNldHMgdG8gZ2V0IGJ5IHdpdGhcblxuZnVuY3Rpb24gYXJyYXlUb1NldCh4cykge1xuICAgIHZhciBzID0ge307XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCB4cy5sZW5ndGg7IGkrKykge1xuXHRzW0pTT04uc3RyaW5naWZ5KHhzW2ldKV0gPSB4c1tpXTtcbiAgICB9XG4gICAgcmV0dXJuIHM7XG59XG5cbmZ1bmN0aW9uIHNldFRvQXJyYXkocykge1xuICAgIHZhciByID0gW107XG4gICAgZm9yICh2YXIgayBpbiBzKSByLnB1c2goc1trXSk7XG4gICAgcmV0dXJuIHI7XG59XG5cbmZ1bmN0aW9uIHNldFVuaW9uKHMxLCBzMikge1xuICAgIHZhciBzID0ge307XG4gICAgc2V0VW5pb25JbnBsYWNlKHMsIHMxKTtcbiAgICBzZXRVbmlvbklucGxhY2UocywgczIpO1xuICAgIHJldHVybiBzO1xufVxuXG5mdW5jdGlvbiBpc19lbXB0eVNldChzKSB7XG4gICAgZm9yICh2YXIgayBpbiBzKSB7XG5cdGlmIChzLmhhc093blByb3BlcnR5KGspKVxuXHQgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICByZXR1cm4gdHJ1ZTtcbn1cblxuZnVuY3Rpb24gc2V0U3VidHJhY3QoczEsIHMyKSB7XG4gICAgdmFyIHMgPSB7fTtcbiAgICBmb3IgKHZhciBrZXkgaW4gczEpIHtcblx0aWYgKHMxLmhhc093blByb3BlcnR5KGtleSkgJiYgIXMyLmhhc093blByb3BlcnR5KGtleSkpIHtcblx0ICAgIHNba2V5XSA9IHMxW2tleV07XG5cdH1cbiAgICB9XG4gICAgcmV0dXJuIHM7XG59XG5cbmZ1bmN0aW9uIHNldEludGVyc2VjdChzMSwgczIpIHtcbiAgICB2YXIgcyA9IHt9O1xuICAgIGZvciAodmFyIGtleSBpbiBzMSkge1xuXHRpZiAoczEuaGFzT3duUHJvcGVydHkoa2V5KSAmJiBzMi5oYXNPd25Qcm9wZXJ0eShrZXkpKSB7XG5cdCAgICBzW2tleV0gPSBzMVtrZXldO1xuXHR9XG4gICAgfVxuICAgIHJldHVybiBzO1xufVxuXG5mdW5jdGlvbiBzZXRVbmlvbklucGxhY2UoYWNjLCBzKSB7XG4gICAgZm9yICh2YXIga2V5IGluIHMpIHtcblx0aWYgKHMuaGFzT3duUHJvcGVydHkoa2V5KSkge1xuXHQgICAgYWNjW2tleV0gPSBzW2tleV07XG5cdH1cbiAgICB9XG59XG5cbmZ1bmN0aW9uIHNldEVxdWFsKHMxLCBzMikge1xuICAgIGZvciAodmFyIGtleSBpbiBzMSkge1xuXHRpZiAoczEuaGFzT3duUHJvcGVydHkoa2V5KSkge1xuXHQgICAgaWYgKHMxW2tleV0gIT09IHMyW2tleV0pIHJldHVybiBmYWxzZTtcblx0fVxuICAgIH1cbiAgICBmb3IgKHZhciBrZXkgaW4gczIpIHtcblx0aWYgKHMyLmhhc093blByb3BlcnR5KGtleSkpIHtcblx0ICAgIGlmIChzMVtrZXldICE9PSBzMltrZXldKSByZXR1cm4gZmFsc2U7XG5cdH1cbiAgICB9XG4gICAgcmV0dXJuIHRydWU7XG59XG5cbi8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuXG52YXIgdW5pb25TdWNjZXNzZXMgPSBmdW5jdGlvbiAodjEsIHYyKSB7XG4gICAgaWYgKHYxID09PSB0cnVlKSByZXR1cm4gdjI7XG4gICAgaWYgKHYyID09PSB0cnVlKSByZXR1cm4gdjE7XG4gICAgcmV0dXJuIHNldFVuaW9uKHYxLCB2Mik7XG59O1xuXG52YXIgaW50ZXJzZWN0U3VjY2Vzc2VzID0gZnVuY3Rpb24gKHYxLCB2Mikge1xuICAgIHJldHVybiB2MTtcbn07XG5cbnZhciBlcmFzZVBhdGhTdWNjZXNzZXMgPSBmdW5jdGlvbiAodjEsIHYyKSB7XG4gICAgdmFyIHIgPSBzZXRTdWJ0cmFjdCh2MSwgdjIpO1xuICAgIGlmIChpc19lbXB0eVNldChyKSkgcmV0dXJuIG51bGw7XG4gICAgcmV0dXJuIHI7XG59O1xuXG52YXIgbWF0Y2hNYXRjaGVyU3VjY2Vzc2VzID0gZnVuY3Rpb24gKHYxLCB2MiwgYWNjKSB7XG4gICAgc2V0VW5pb25JbnBsYWNlKGFjYywgdjIpO1xufTtcblxudmFyIHByb2plY3RTdWNjZXNzID0gZnVuY3Rpb24gKHYpIHtcbiAgICByZXR1cm4gdjtcbn07XG5cbnZhciB2YWx1ZXNFcXVhbCA9IGZ1bmN0aW9uIChhLCBiKSB7XG4gICAgcmV0dXJuIHNldEVxdWFsKGEsIGIpO1xufTtcblxuLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXG5cbmZ1bmN0aW9uIGV4cGFuZFdpbGRzZXEocikge1xuICAgIHJldHVybiB1bmlvbihyd2lsZChyd2lsZHNlcShyKSksIHJzZXEoRU9BLCByKSk7XG59XG5cbmZ1bmN0aW9uIHVuaW9uKG8xLCBvMikge1xuICAgIHJldHVybiBtZXJnZShvMSwgbzIpO1xuXG4gICAgZnVuY3Rpb24gbWVyZ2UobzEsIG8yKSB7XG5cdGlmIChpc19lbXB0eU1hdGNoZXIobzEpKSByZXR1cm4gbzI7XG5cdGlmIChpc19lbXB0eU1hdGNoZXIobzIpKSByZXR1cm4gbzE7XG5cdHJldHVybiB3YWxrKG8xLCBvMik7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gd2FsayhyMSwgcjIpIHtcblx0aWYgKHIxIGluc3RhbmNlb2YgJFdpbGRjYXJkU2VxdWVuY2UpIHtcblx0ICAgIGlmIChyMiBpbnN0YW5jZW9mICRXaWxkY2FyZFNlcXVlbmNlKSB7XG5cdFx0cmV0dXJuIHJ3aWxkc2VxKHdhbGsocjEubWF0Y2hlciwgcjIubWF0Y2hlcikpO1xuXHQgICAgfVxuXHQgICAgcjEgPSBleHBhbmRXaWxkc2VxKHIxLm1hdGNoZXIpO1xuXHR9IGVsc2UgaWYgKHIyIGluc3RhbmNlb2YgJFdpbGRjYXJkU2VxdWVuY2UpIHtcblx0ICAgIHIyID0gZXhwYW5kV2lsZHNlcShyMi5tYXRjaGVyKTtcblx0fVxuXG5cdGlmIChyMSBpbnN0YW5jZW9mICRTdWNjZXNzICYmIHIyIGluc3RhbmNlb2YgJFN1Y2Nlc3MpIHtcblx0ICAgIHJldHVybiByc3VjY2Vzcyh1bmlvblN1Y2Nlc3NlcyhyMS52YWx1ZSwgcjIudmFsdWUpKTtcblx0fVxuXG5cdHZhciB3ID0gbWVyZ2UocjEuZ2V0KF9fKSwgcjIuZ2V0KF9fKSk7XG5cdGlmIChpc19lbXB0eU1hdGNoZXIodykpIHtcblx0ICAgIHZhciBzbWFsbGVyID0gcjEubGVuZ3RoIDwgcjIubGVuZ3RoID8gcjEgOiByMjtcblx0ICAgIHZhciBsYXJnZXIgID0gcjEubGVuZ3RoIDwgcjIubGVuZ3RoID8gcjIgOiByMTtcblx0ICAgIHZhciB0YXJnZXQgPSBsYXJnZXIuY29weSgpO1xuXHQgICAgZm9yICh2YXIga2V5IGluIHNtYWxsZXIuZW50cmllcykge1xuXHRcdHZhciBrID0gbWVyZ2Uoc21hbGxlci5nZXQoa2V5KSwgbGFyZ2VyLmdldChrZXkpKTtcblx0XHRydXBkYXRlSW5wbGFjZSh0YXJnZXQsIGtleSwgayk7XG5cdCAgICB9XG5cdCAgICByZXR1cm4gdGFyZ2V0LmVtcHR5R3VhcmQoKTtcblx0fSBlbHNlIHtcblx0ICAgIGZ1bmN0aW9uIGV4YW1pbmVLZXkockEsIGtleSwgckIpIHtcblx0XHRpZiAoKGtleSAhPT0gX18pICYmICF0YXJnZXQuaGFzKGtleSkpIHtcblx0XHQgICAgdmFyIGsgPSBtZXJnZShyQS5nZXQoa2V5KSwgckIuZ2V0KGtleSkpO1xuXHRcdCAgICBpZiAoaXNfa2V5T3BlbihrZXkpKSB7XG5cdFx0XHRydXBkYXRlSW5wbGFjZSh0YXJnZXQsIGtleSwgbWVyZ2UocndpbGRzZXEodyksIGspKTtcblx0XHQgICAgfSBlbHNlIGlmIChpc19rZXlDbG9zZShrZXkpKSB7XG5cdFx0XHRpZiAodyBpbnN0YW5jZW9mICRXaWxkY2FyZFNlcXVlbmNlKSB7XG5cdFx0XHQgICAgcnVwZGF0ZUlucGxhY2UodGFyZ2V0LCBrZXksIG1lcmdlKHcubWF0Y2hlciwgaykpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdCAgICBydXBkYXRlSW5wbGFjZSh0YXJnZXQsIGtleSwgayk7XG5cdFx0XHR9XG5cdFx0ICAgIH0gZWxzZSB7XG5cdFx0XHRydXBkYXRlSW5wbGFjZSh0YXJnZXQsIGtleSwgbWVyZ2UodywgaykpO1xuXHRcdCAgICB9XG5cdFx0fVxuXHQgICAgfVxuXHQgICAgdmFyIHRhcmdldCA9IHJ3aWxkKHcpLmNvcHkoKTtcblx0ICAgIGZvciAodmFyIGtleSBpbiByMS5lbnRyaWVzKSB7IGV4YW1pbmVLZXkocjEsIGtleSwgcjIpOyB9XG5cdCAgICBmb3IgKHZhciBrZXkgaW4gcjIuZW50cmllcykgeyBleGFtaW5lS2V5KHIyLCBrZXksIHIxKTsgfVxuXHQgICAgcmV0dXJuIHRhcmdldDtcblx0fVxuICAgIH1cbn1cblxuZnVuY3Rpb24gdW5pb25OKCkge1xuICAgIHZhciBhY2MgPSBlbXB0eU1hdGNoZXI7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBhcmd1bWVudHMubGVuZ3RoOyBpKyspIHtcblx0YWNjID0gdW5pb24oYWNjLCBhcmd1bWVudHNbaV0pO1xuICAgIH1cbiAgICByZXR1cm4gYWNjO1xufVxuXG5mdW5jdGlvbiBpbnRlcnNlY3QobzEsIG8yKSB7XG4gICAgaWYgKGlzX2VtcHR5TWF0Y2hlcihvMSkpIHJldHVybiBlbXB0eU1hdGNoZXI7XG4gICAgaWYgKGlzX2VtcHR5TWF0Y2hlcihvMikpIHJldHVybiBlbXB0eU1hdGNoZXI7XG4gICAgcmV0dXJuIHdhbGsobzEsIG8yKTtcblxuICAgIGZ1bmN0aW9uIHdhbGtGbGlwcGVkKHIyLCByMSkgeyByZXR1cm4gd2FsayhyMSwgcjIpOyB9XG5cbiAgICBmdW5jdGlvbiB3YWxrKHIxLCByMikge1xuXHQvLyBJTlZBUklBTlQ6IHIxIGlzIGEgcGFydCBvZiB0aGUgb3JpZ2luYWwgbzEsIGFuZFxuXHQvLyBsaWtld2lzZSBmb3IgcjIuIFRoaXMgaXMgc28gdGhhdCB0aGUgZmlyc3QgYXJnIHRvXG5cdC8vIGludGVyc2VjdFN1Y2Nlc3NlcyBhbHdheXMgY29tZXMgZnJvbSByMSwgYW5kIHRoZSBzZWNvbmRcblx0Ly8gZnJvbSByMi5cblx0aWYgKGlzX2VtcHR5TWF0Y2hlcihyMSkpIHJldHVybiBlbXB0eU1hdGNoZXI7XG5cdGlmIChpc19lbXB0eU1hdGNoZXIocjIpKSByZXR1cm4gZW1wdHlNYXRjaGVyO1xuXG5cdGlmIChyMSBpbnN0YW5jZW9mICRXaWxkY2FyZFNlcXVlbmNlKSB7XG5cdCAgICBpZiAocjIgaW5zdGFuY2VvZiAkV2lsZGNhcmRTZXF1ZW5jZSkge1xuXHRcdHJldHVybiByd2lsZHNlcSh3YWxrKHIxLm1hdGNoZXIsIHIyLm1hdGNoZXIpKTtcblx0ICAgIH1cblx0ICAgIHIxID0gZXhwYW5kV2lsZHNlcShyMS5tYXRjaGVyKTtcblx0fSBlbHNlIGlmIChyMiBpbnN0YW5jZW9mICRXaWxkY2FyZFNlcXVlbmNlKSB7XG5cdCAgICByMiA9IGV4cGFuZFdpbGRzZXEocjIubWF0Y2hlcik7XG5cdH1cblxuXHRpZiAocjEgaW5zdGFuY2VvZiAkU3VjY2VzcyAmJiByMiBpbnN0YW5jZW9mICRTdWNjZXNzKSB7XG5cdCAgICByZXR1cm4gcnN1Y2Nlc3MoaW50ZXJzZWN0U3VjY2Vzc2VzKHIxLnZhbHVlLCByMi52YWx1ZSkpO1xuXHR9XG5cblx0dmFyIHcxID0gcjEuZ2V0KF9fKTtcblx0dmFyIHcyID0gcjIuZ2V0KF9fKTtcblx0dmFyIHcgPSB3YWxrKHcxLCB3Mik7XG5cblx0dmFyIHRhcmdldCA9IG5ldyAkRGljdCgpO1xuXG5cdGZ1bmN0aW9uIGV4YW1pbmVLZXkoa2V5KSB7XG5cdCAgICBpZiAoKGtleSAhPT0gX18pICYmICF0YXJnZXQuaGFzKGtleSkpIHtcblx0XHR2YXIgazEgPSByMS5nZXQoa2V5KTtcblx0XHR2YXIgazIgPSByMi5nZXQoa2V5KTtcblx0XHRpZiAoaXNfZW1wdHlNYXRjaGVyKGsxKSkge1xuXHRcdCAgICBpZiAoaXNfZW1wdHlNYXRjaGVyKGsyKSkge1xuXHRcdFx0cnVwZGF0ZUlucGxhY2UodGFyZ2V0LCBrZXksIGVtcHR5TWF0Y2hlcik7XG5cdFx0ICAgIH0gZWxzZSB7XG5cdFx0XHRydXBkYXRlSW5wbGFjZSh0YXJnZXQsIGtleSwgd2Fsa1dpbGQod2FsaywgdzEsIGtleSwgazIpKTtcblx0XHQgICAgfVxuXHRcdH0gZWxzZSB7XG5cdFx0ICAgIGlmIChpc19lbXB0eU1hdGNoZXIoazIpKSB7XG5cdFx0XHRydXBkYXRlSW5wbGFjZSh0YXJnZXQsIGtleSwgd2Fsa1dpbGQod2Fsa0ZsaXBwZWQsIHcyLCBrZXksIGsxKSk7XG5cdFx0ICAgIH0gZWxzZSB7XG5cdFx0XHRydXBkYXRlSW5wbGFjZSh0YXJnZXQsIGtleSwgd2FsayhrMSwgazIpKTtcblx0XHQgICAgfVxuXHRcdH1cblx0ICAgIH1cblx0fVxuXG5cdGlmIChpc19lbXB0eU1hdGNoZXIodzEpKSB7XG5cdCAgICBpZiAoaXNfZW1wdHlNYXRjaGVyKHcyKSkge1xuXHRcdGZvciAodmFyIGtleSBpbiAocjEubGVuZ3RoIDwgcjIubGVuZ3RoID8gcjEgOiByMikuZW50cmllcykgZXhhbWluZUtleShrZXkpO1xuXHQgICAgfSBlbHNlIHtcblx0XHRmb3IgKHZhciBrZXkgaW4gcjEuZW50cmllcykgZXhhbWluZUtleShrZXkpO1xuXHQgICAgfVxuXHR9IGVsc2Uge1xuXHQgICAgaWYgKGlzX2VtcHR5TWF0Y2hlcih3MikpIHtcblx0XHRmb3IgKHZhciBrZXkgaW4gcjIuZW50cmllcykgZXhhbWluZUtleShrZXkpO1xuXHQgICAgfSBlbHNlIHtcblx0XHRydXBkYXRlSW5wbGFjZSh0YXJnZXQsIF9fLCB3KTtcblx0XHRmb3IgKHZhciBrZXkgaW4gcjEuZW50cmllcykgZXhhbWluZUtleShrZXkpO1xuXHRcdGZvciAodmFyIGtleSBpbiByMi5lbnRyaWVzKSBleGFtaW5lS2V5KGtleSk7XG5cdCAgICB9XG5cdH1cblx0cmV0dXJuIHRhcmdldC5lbXB0eUd1YXJkKCk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gd2Fsa1dpbGQod2Fsa2VyLCB3LCBrZXksIGspIHtcblx0aWYgKGlzX2VtcHR5TWF0Y2hlcih3KSkgcmV0dXJuIGVtcHR5TWF0Y2hlcjtcblx0aWYgKGlzX2tleU9wZW4oa2V5KSkgcmV0dXJuIHdhbGtlcihyd2lsZHNlcSh3KSwgayk7XG5cdGlmIChpc19rZXlDbG9zZShrZXkpKSB7XG5cdCAgICBpZiAodyBpbnN0YW5jZW9mICRXaWxkY2FyZFNlcXVlbmNlKSByZXR1cm4gd2Fsa2VyKHcubWF0Y2hlciwgayk7XG5cdCAgICByZXR1cm4gZW1wdHlNYXRjaGVyO1xuXHR9XG5cdHJldHVybiB3YWxrZXIodywgayk7XG4gICAgfVxufVxuXG4vLyBSZW1vdmVzIHIyJ3MgbWFwcGluZ3MgZnJvbSByMS4gQXNzdW1lcyByMiBoYXMgcHJldmlvdXNseSBiZWVuXG4vLyB1bmlvbidkIGludG8gcjEuIFRoZSBlcmFzZVBhdGhTdWNjZXNzZXMgZnVuY3Rpb24gc2hvdWxkIHJldHVyblxuLy8gbnVsbCB0byBzaWduYWwgXCJubyByZW1haW5pbmcgc3VjY2VzcyB2YWx1ZXNcIi5cbmZ1bmN0aW9uIGVyYXNlUGF0aChvMSwgbzIpIHtcbiAgICByZXR1cm4gd2FsayhvMSwgbzIpO1xuXG4gICAgZnVuY3Rpb24gd2FsayhyMSwgcjIpIHtcblx0aWYgKGlzX2VtcHR5TWF0Y2hlcihyMSkpIHtcblx0ICAgIHJldHVybiBlbXB0eU1hdGNoZXI7XG5cdH0gZWxzZSB7XG5cdCAgICBpZiAoaXNfZW1wdHlNYXRjaGVyKHIyKSkge1xuXHRcdHJldHVybiByMTtcblx0ICAgIH1cblx0fVxuXG5cdGlmIChyMSBpbnN0YW5jZW9mICRXaWxkY2FyZFNlcXVlbmNlKSB7XG5cdCAgICBpZiAocjIgaW5zdGFuY2VvZiAkV2lsZGNhcmRTZXF1ZW5jZSkge1xuXHRcdHJldHVybiByd2lsZHNlcSh3YWxrKHIxLm1hdGNoZXIsIHIyLm1hdGNoZXIpKTtcblx0ICAgIH1cblx0ICAgIHIxID0gZXhwYW5kV2lsZHNlcShyMS5tYXRjaGVyKTtcblx0fSBlbHNlIGlmIChyMiBpbnN0YW5jZW9mICRXaWxkY2FyZFNlcXVlbmNlKSB7XG5cdCAgICByMiA9IGV4cGFuZFdpbGRzZXEocjIubWF0Y2hlcik7XG5cdH1cblxuXHRpZiAocjEgaW5zdGFuY2VvZiAkU3VjY2VzcyAmJiByMiBpbnN0YW5jZW9mICRTdWNjZXNzKSB7XG5cdCAgICByZXR1cm4gcnN1Y2Nlc3MoZXJhc2VQYXRoU3VjY2Vzc2VzKHIxLnZhbHVlLCByMi52YWx1ZSkpO1xuXHR9XG5cblx0dmFyIHcxID0gcjEuZ2V0KF9fKTtcblx0dmFyIHcyID0gcjIuZ2V0KF9fKTtcblx0dmFyIHcgPSB3YWxrKHcxLCB3Mik7XG5cdHZhciB0YXJnZXQ7XG5cblx0ZnVuY3Rpb24gZXhhbWluZUtleShrZXkpIHtcblx0ICAgIGlmIChrZXkgIT09IF9fKSB7XG5cdFx0dmFyIGsxID0gcjEuZ2V0KGtleSk7XG5cdFx0dmFyIGsyID0gcjIuZ2V0KGtleSk7XG5cdFx0dmFyIHVwZGF0ZWRLO1xuXHRcdGlmIChpc19lbXB0eU1hdGNoZXIoazIpKSB7XG5cdFx0ICAgIHVwZGF0ZWRLID0gd2Fsa1dpbGQoa2V5LCBrMSwgdzIpO1xuXHRcdH0gZWxzZSB7XG5cdFx0ICAgIHVwZGF0ZWRLID0gd2FsayhrMSwgazIpO1xuXHRcdH1cblx0XHQvLyBIZXJlIHdlIGVuc3VyZSBhIFwibWluaW1hbFwiIHJlbWFpbmRlciBpbiBjYXNlc1xuXHRcdC8vIHdoZXJlIGFmdGVyIGFuIGVyYXN1cmUsIGEgcGFydGljdWxhciBrZXknc1xuXHRcdC8vIGNvbnRpbnVhdGlvbiBpcyB0aGUgc2FtZSBhcyB0aGUgd2lsZGNhcmQnc1xuXHRcdC8vIGNvbnRpbnVhdGlvbi4gVE9ETzogdGhlIG1hdGNoZXJFcXVhbHMgY2hlY2sgbWF5XG5cdFx0Ly8gYmUgZXhwZW5zaXZlLiBJZiBzbywgaG93IGNhbiBpdCBiZSBtYWRlXG5cdFx0Ly8gY2hlYXBlcj9cblx0XHRpZiAoaXNfa2V5T3BlbihrZXkpKSB7XG5cdFx0ICAgIHJ1cGRhdGVJbnBsYWNlKHRhcmdldCwga2V5LFxuXHRcdFx0XHQgICAoKHVwZGF0ZWRLIGluc3RhbmNlb2YgJFdpbGRjYXJkU2VxdWVuY2UpICYmXG5cdFx0XHRcdCAgICBtYXRjaGVyRXF1YWxzKHVwZGF0ZWRLLm1hdGNoZXIsIHcpKVxuXHRcdFx0XHQgICA/IGVtcHR5TWF0Y2hlclxuXHRcdFx0XHQgICA6IHVwZGF0ZWRLKTtcblx0XHR9IGVsc2UgaWYgKGlzX2tleUNsb3NlKGtleSkpIHtcblx0XHQgICAgLy8gV2UgdGFrZSBjYXJlIG9mIHRoaXMgY2FzZSBsYXRlciwgYWZ0ZXIgdGhlXG5cdFx0ICAgIC8vIHRhcmdldCBpcyBmdWxseSBjb25zdHJ1Y3RlZC9yZWJ1aWx0LlxuXHRcdCAgICBydXBkYXRlSW5wbGFjZSh0YXJnZXQsIGtleSwgdXBkYXRlZEspO1xuXHRcdH0gZWxzZSB7XG5cdFx0ICAgIHJ1cGRhdGVJbnBsYWNlKHRhcmdldCwga2V5LFxuXHRcdFx0XHQgICAobWF0Y2hlckVxdWFscyh1cGRhdGVkSywgdykgPyBlbXB0eU1hdGNoZXIgOiB1cGRhdGVkSykpO1xuXHRcdH1cblx0ICAgIH1cblx0fVxuXG5cdGlmIChpc19lbXB0eU1hdGNoZXIodzIpKSB7XG5cdCAgICB0YXJnZXQgPSByMS5jb3B5KCk7XG5cdCAgICBmb3IgKHZhciBrZXkgaW4gcjIuZW50cmllcykgZXhhbWluZUtleShrZXkpO1xuXHR9IGVsc2Uge1xuXHQgICAgdGFyZ2V0ID0gbmV3ICREaWN0KCk7XG5cdCAgICBydXBkYXRlSW5wbGFjZSh0YXJnZXQsIF9fLCB3KTtcblx0ICAgIGZvciAodmFyIGtleSBpbiByMS5lbnRyaWVzKSBleGFtaW5lS2V5KGtleSk7XG5cdCAgICBmb3IgKHZhciBrZXkgaW4gcjIuZW50cmllcykgZXhhbWluZUtleShrZXkpO1xuXHR9XG5cblx0Ly8gSGVyZSwgdGhlIHRhcmdldCBpcyBjb21wbGV0ZS4gSWYgaXQgaGFzIG9ubHkgdHdvIGtleXMsXG5cdC8vIG9uZSB3aWxkIGFuZCBvbmUgaXNfa2V5Q2xvc2UsIGFuZCB3aWxkJ3MgY29udGludWF0aW9uXG5cdC8vIGlzIGEgJFdpbGRjYXJkU2VxdWVuY2UgYW5kIHRoZSBvdGhlciBjb250aW51YXRpb24gaXNcblx0Ly8gaWRlbnRpY2FsIHRvIHRoZSBzZXF1ZW5jZSdzIGNvbnRpbnVhdGlvbiwgdGhlbiByZXBsYWNlXG5cdC8vIHRoZSB3aG9sZSB0aGluZyB3aXRoIGEgbmVzdGVkICRXaWxkY2FyZFNlcXVlbmNlLlxuXHQvLyAoV2Uga25vdyB3ID09PSB0YXJnZXQuZ2V0KF9fKSBmcm9tIGJlZm9yZS4pXG5cdC8vXG5cdC8vIFRPRE86IEkgc3VzcGVjdCBhY3R1YWxseSB0aGlzIGFwcGxpZXMgZXZlbiBpZiB0aGVyZSBhcmVcblx0Ly8gbW9yZSB0aGFuIHR3byBrZXlzLCBzbyBsb25nIGFzIGFsbCB0aGVpciBjb250aW51YXRpb25zXG5cdC8vIGFyZSBpZGVudGljYWwgYW5kIHRoZXJlJ3MgYXQgbGVhc3Qgb25lIGlzX2tleUNsb3NlXG5cdC8vIGFsb25nc2lkZSBhIHdpbGQuXG5cdGlmICh0YXJnZXQubGVuZ3RoID09PSAyKSB7XG5cdCAgICB2YXIgZmluYWxXID0gdGFyZ2V0LmdldChfXyk7XG5cdCAgICBpZiAoZmluYWxXIGluc3RhbmNlb2YgJFdpbGRjYXJkU2VxdWVuY2UpIHtcblx0XHRmb3IgKHZhciBrZXkgaW4gdGFyZ2V0LmVudHJpZXMpIHtcblx0XHQgICAgaWYgKChrZXkgIT09IF9fKSAmJiBpc19rZXlDbG9zZShrZXkpKSB7XG5cdFx0XHR2YXIgayA9IHRhcmdldC5nZXQoa2V5KTtcblx0XHRcdGlmIChtYXRjaGVyRXF1YWxzKGssIGZpbmFsVy5tYXRjaGVyKSkge1xuXHRcdFx0ICAgIHJldHVybiBmaW5hbFc7XG5cdFx0XHR9XG5cdFx0ICAgIH1cblx0XHR9XG5cdCAgICB9XG5cdH1cblxuXHRyZXR1cm4gdGFyZ2V0LmVtcHR5R3VhcmQoKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiB3YWxrV2lsZChrZXksIGssIHcpIHtcblx0aWYgKGlzX2VtcHR5TWF0Y2hlcih3KSkgcmV0dXJuIGs7XG5cdGlmIChpc19rZXlPcGVuKGtleSkpIHJldHVybiB3YWxrKGssIHJ3aWxkc2VxKHcpKTtcblx0aWYgKGlzX2tleUNsb3NlKGtleSkpIHtcblx0ICAgIGlmICh3IGluc3RhbmNlb2YgJFdpbGRjYXJkU2VxdWVuY2UpIHJldHVybiB3YWxrKGssIHcubWF0Y2hlcik7XG5cdCAgICByZXR1cm4gaztcblx0fVxuXHRyZXR1cm4gd2FsayhrLCB3KTtcbiAgICB9XG59XG5cbi8vIFJldHVybnMgbnVsbCBvbiBmYWlsZWQgbWF0Y2gsIG90aGVyd2lzZSB0aGUgYXBwcm9wcmlhdGUgc3VjY2Vzc1xuLy8gdmFsdWUgY29udGFpbmVkIGluIHRoZSBtYXRjaGVyIHIuXG5mdW5jdGlvbiBtYXRjaFZhbHVlKHIsIHYpIHtcbiAgICB2YXIgZmFpbHVyZVJlc3VsdCA9IG51bGw7XG5cbiAgICB2YXIgdnMgPSBbdl07XG4gICAgdmFyIHN0YWNrID0gW1tdXTtcblxuICAgIHdoaWxlICghaXNfZW1wdHlNYXRjaGVyKHIpKSB7XG5cdGlmIChyIGluc3RhbmNlb2YgJFdpbGRjYXJkU2VxdWVuY2UpIHtcblx0ICAgIGlmIChzdGFjay5sZW5ndGggPT09IDApIHJldHVybiBmYWlsdXJlUmVzdWx0O1xuXHQgICAgdnMgPSBzdGFjay5wb3AoKTtcblx0ICAgIHIgPSByLm1hdGNoZXI7XG5cdCAgICBjb250aW51ZTtcblx0fVxuXG5cdGlmIChyIGluc3RhbmNlb2YgJFN1Y2Nlc3MpIHtcblx0ICAgIGlmICh2cy5sZW5ndGggPT09IDAgJiYgc3RhY2subGVuZ3RoID09PSAwKSByZXR1cm4gci52YWx1ZTtcblx0ICAgIHJldHVybiBmYWlsdXJlUmVzdWx0O1xuXHR9XG5cblx0aWYgKHZzLmxlbmd0aCA9PT0gMCkge1xuXHQgICAgaWYgKHN0YWNrLmxlbmd0aCA9PT0gMCkgcmV0dXJuIGZhaWx1cmVSZXN1bHQ7XG5cdCAgICB2cyA9IHN0YWNrLnBvcCgpO1xuXHQgICAgciA9IHIuZ2V0KEVPQSk7XG5cdCAgICBjb250aW51ZTtcblx0fVxuXG5cdHZhciB2ID0gdnMuc2hpZnQoKTtcblxuXHRpZiAodHlwZW9mIHYgPT09ICdzdHJpbmcnICYmIHYuc3Vic3RyaW5nKDAsIDIpID09PSAnX18nKSB7XG5cdCAgICBkaWUoXCJDYW5ub3QgbWF0Y2ggc3BlY2lhbCBzdHJpbmcgc3RhcnRpbmcgd2l0aCBfX1wiKTtcblx0fVxuXG5cdGlmIChBcnJheS5pc0FycmF5KHYpKSB7XG5cdCAgICBpZiAoU09BIGluIHIuZW50cmllcykge1xuXHRcdHIgPSByLmdldChTT0EpO1xuXHRcdHN0YWNrLnB1c2godnMpO1xuXHRcdHZzID0gc2hhbGxvd0NvcHlBcnJheSh2KTtcblx0ICAgIH0gZWxzZSB7XG5cdFx0ciA9IHIuZ2V0KF9fKTtcblx0ICAgIH1cblx0fSBlbHNlIHtcblx0ICAgIHZhciBrZXk7XG5cdCAgICB0cnkge1xuXHRcdGtleSA9IEpTT04uc3RyaW5naWZ5KHYpO1xuXHQgICAgfSBjYXRjaCAoZXhuKSB7XG5cdFx0Ly8gRm9yIGV4YW1wbGUsIHYgbWlnaHQgYmUgY3ljbGljLCBhcyBpbiBET00gZXZlbnRzLlxuXHRcdGtleSA9IG51bGw7XG5cdCAgICB9XG5cdCAgICBpZiAoa2V5IGluIHIuZW50cmllcykge1xuXHRcdHIgPSByLmdldChrZXkpO1xuXHQgICAgfSBlbHNlIHtcblx0XHRyID0gci5nZXQoX18pO1xuXHQgICAgfVxuXHR9XG4gICAgfVxuXG4gICAgcmV0dXJuIGZhaWx1cmVSZXN1bHQ7XG59XG5cbi8vIFRPRE86IGJldHRlciBuYW1lIGZvciB0aGlzXG5mdW5jdGlvbiBtYXRjaE1hdGNoZXIobzEsIG8yLCBzZWVkKSB7XG4gICAgdmFyIGFjYyA9IHR5cGVvZiBzZWVkID09PSAndW5kZWZpbmVkJyA/IHt9IDogc2VlZDsgLy8gd2lsbCBiZSBtb2RpZmllZCBpbiBwbGFjZVxuICAgIHdhbGsobzEsIG8yKTtcbiAgICByZXR1cm4gYWNjO1xuXG4gICAgZnVuY3Rpb24gd2Fsa0ZsaXBwZWQocjIsIHIxKSB7IHJldHVybiB3YWxrKHIxLCByMik7IH1cblxuICAgIGZ1bmN0aW9uIHdhbGsocjEsIHIyKSB7XG5cdGlmIChpc19lbXB0eU1hdGNoZXIocjEpIHx8IGlzX2VtcHR5TWF0Y2hlcihyMikpIHJldHVybjtcblxuXHRpZiAocjEgaW5zdGFuY2VvZiAkV2lsZGNhcmRTZXF1ZW5jZSkge1xuXHQgICAgaWYgKHIyIGluc3RhbmNlb2YgJFdpbGRjYXJkU2VxdWVuY2UpIHtcblx0XHR3YWxrKHIxLm1hdGNoZXIsIHIyLm1hdGNoZXIpO1xuXHRcdHJldHVybjtcblx0ICAgIH1cblx0ICAgIHIxID0gZXhwYW5kV2lsZHNlcShyMS5tYXRjaGVyKTtcblx0fSBlbHNlIGlmIChyMiBpbnN0YW5jZW9mICRXaWxkY2FyZFNlcXVlbmNlKSB7XG5cdCAgICByMiA9IGV4cGFuZFdpbGRzZXEocjIubWF0Y2hlcik7XG5cdH1cblxuXHRpZiAocjEgaW5zdGFuY2VvZiAkU3VjY2VzcyAmJiByMiBpbnN0YW5jZW9mICRTdWNjZXNzKSB7XG5cdCAgICBtYXRjaE1hdGNoZXJTdWNjZXNzZXMocjEudmFsdWUsIHIyLnZhbHVlLCBhY2MpO1xuXHQgICAgcmV0dXJuO1xuXHR9XG5cblx0dmFyIHcxID0gcjEuZ2V0KF9fKTtcblx0dmFyIHcyID0gcjIuZ2V0KF9fKTtcblx0d2Fsayh3MSwgdzIpO1xuXG5cdGZ1bmN0aW9uIGV4YW1pbmVLZXkoa2V5KSB7XG5cdCAgICBpZiAoa2V5ICE9PSBfXykge1xuXHRcdHZhciBrMSA9IHIxLmdldChrZXkpO1xuXHRcdHZhciBrMiA9IHIyLmdldChrZXkpO1xuXHRcdGlmIChpc19lbXB0eU1hdGNoZXIoazEpKSB7XG5cdFx0ICAgIGlmIChpc19lbXB0eU1hdGNoZXIoazIpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0ICAgIH0gZWxzZSB7XG5cdFx0XHR3YWxrV2lsZCh3YWxrLCB3MSwga2V5LCBrMik7XG5cdFx0ICAgIH1cblx0XHR9IGVsc2Uge1xuXHRcdCAgICBpZiAoaXNfZW1wdHlNYXRjaGVyKGsyKSkge1xuXHRcdFx0d2Fsa1dpbGQod2Fsa0ZsaXBwZWQsIHcyLCBrZXksIGsxKTtcblx0XHQgICAgfSBlbHNlIHtcblx0XHRcdHdhbGsoazEsIGsyKTtcblx0XHQgICAgfVxuXHRcdH1cblx0ICAgIH1cblx0fVxuXG5cdC8vIE9wdGltaXplIHNpbWlsYXJseSB0byBpbnRlcnNlY3QoKS5cblx0aWYgKGlzX2VtcHR5TWF0Y2hlcih3MSkpIHtcblx0ICAgIGlmIChpc19lbXB0eU1hdGNoZXIodzIpKSB7XG5cdFx0Zm9yICh2YXIga2V5IGluIChyMS5sZW5ndGggPCByMi5sZW5ndGggPyByMSA6IHIyKS5lbnRyaWVzKSBleGFtaW5lS2V5KGtleSk7XG5cdCAgICB9IGVsc2Uge1xuXHRcdGZvciAodmFyIGtleSBpbiByMS5lbnRyaWVzKSBleGFtaW5lS2V5KGtleSk7XG5cdCAgICB9XG5cdH0gZWxzZSB7XG5cdCAgICBpZiAoaXNfZW1wdHlNYXRjaGVyKHcyKSkge1xuXHRcdGZvciAodmFyIGtleSBpbiByMi5lbnRyaWVzKSBleGFtaW5lS2V5KGtleSk7XG5cdCAgICB9IGVsc2Uge1xuXHRcdGZvciAodmFyIGtleSBpbiByMS5lbnRyaWVzKSBleGFtaW5lS2V5KGtleSk7XG5cdFx0Zm9yICh2YXIga2V5IGluIHIyLmVudHJpZXMpIGV4YW1pbmVLZXkoa2V5KTtcblx0ICAgIH1cblx0fVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIHdhbGtXaWxkKHdhbGtlciwgdywga2V5LCBrKSB7XG5cdGlmIChpc19lbXB0eU1hdGNoZXIodykpIHJldHVybjtcblx0aWYgKGlzX2tleU9wZW4oa2V5KSkge1xuXHQgICAgd2Fsa2VyKHJ3aWxkc2VxKHcpLCBrKTtcblx0ICAgIHJldHVybjtcblx0fVxuXHRpZiAoaXNfa2V5Q2xvc2Uoa2V5KSkge1xuXHQgICAgaWYgKHcgaW5zdGFuY2VvZiAkV2lsZGNhcmRTZXF1ZW5jZSkgd2Fsa2VyKHcubWF0Y2hlciwgayk7XG5cdCAgICByZXR1cm47XG5cdH1cblx0d2Fsa2VyKHcsIGspO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gYXBwZW5kTWF0Y2hlcihtLCBtVGFpbEZuKSB7XG4gICAgcmV0dXJuIHdhbGsobSk7XG5cbiAgICBmdW5jdGlvbiB3YWxrKG0pIHtcblx0aWYgKGlzX2VtcHR5TWF0Y2hlcihtKSkgcmV0dXJuIGVtcHR5TWF0Y2hlcjtcblx0aWYgKG0gaW5zdGFuY2VvZiAkV2lsZGNhcmRTZXF1ZW5jZSkgcmV0dXJuIHJ3aWxkc2VxKHdhbGsobS5tYXRjaGVyKSk7XG5cdGlmIChtIGluc3RhbmNlb2YgJFN1Y2Nlc3MpIGRpZShcIklsbC1mb3JtZWQgbWF0Y2hlclwiKTtcblxuXHR2YXIgdGFyZ2V0ID0gbmV3ICREaWN0KCk7XG5cdGZvciAodmFyIGtleSBpbiBtLmVudHJpZXMpIHtcblx0ICAgIHZhciBrID0gbS5nZXQoa2V5KTtcblx0ICAgIGlmIChpc19rZXlDbG9zZShrZXkpICYmIChrIGluc3RhbmNlb2YgJFN1Y2Nlc3MpKSB7XG5cdFx0dGFyZ2V0ID0gdW5pb24odGFyZ2V0LCBtVGFpbEZuKGsudmFsdWUpKTtcblx0ICAgIH0gZWxzZSB7XG5cdFx0cnVwZGF0ZUlucGxhY2UodGFyZ2V0LCBrZXksIHdhbGsoaykpO1xuXHQgICAgfVxuXHR9XG5cdHJldHVybiB0YXJnZXQuZW1wdHlHdWFyZCgpO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gcmVsYWJlbChtLCBmKSB7XG4gICAgcmV0dXJuIHdhbGsobSk7XG5cbiAgICBmdW5jdGlvbiB3YWxrKG0pIHtcblx0aWYgKGlzX2VtcHR5TWF0Y2hlcihtKSkgcmV0dXJuIGVtcHR5TWF0Y2hlcjtcblx0aWYgKG0gaW5zdGFuY2VvZiAkV2lsZGNhcmRTZXF1ZW5jZSkgcmV0dXJuIHJ3aWxkc2VxKHdhbGsobS5tYXRjaGVyKSk7XG5cdGlmIChtIGluc3RhbmNlb2YgJFN1Y2Nlc3MpIHJldHVybiByc3VjY2VzcyhmKG0udmFsdWUpKTtcblxuXHR2YXIgdGFyZ2V0ID0gbmV3ICREaWN0KCk7XG5cdGZvciAodmFyIGtleSBpbiBtLmVudHJpZXMpIHtcblx0ICAgIHJ1cGRhdGVJbnBsYWNlKHRhcmdldCwga2V5LCB3YWxrKG0uZ2V0KGtleSkpKTtcblx0fVxuXHRyZXR1cm4gdGFyZ2V0LmVtcHR5R3VhcmQoKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGNvbXBpbGVQcm9qZWN0aW9uKC8qIHByb2plY3Rpb24sIHByb2plY3Rpb24sIC4uLiAqLykge1xuICAgIHZhciBuYW1lcyA9IFtdO1xuICAgIHZhciBhY2MgPSBbXTtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGFyZ3VtZW50cy5sZW5ndGg7IGkrKykge1xuXHR3YWxrKGFyZ3VtZW50c1tpXSk7XG4gICAgfVxuICAgIGFjYy5wdXNoKEVPQSk7XG4gICAgcmV0dXJuIHtuYW1lczogbmFtZXMsIHNwZWM6IGFjY307XG5cbiAgICBmdW5jdGlvbiB3YWxrKHApIHtcblx0aWYgKGlzQ2FwdHVyZShwKSkge1xuXHQgICAgbmFtZXMucHVzaChjYXB0dXJlTmFtZShwKSk7XG5cdCAgICBhY2MucHVzaChTT0MpO1xuXHQgICAgd2FsayhjYXB0dXJlUGF0dGVybihwKSk7XG5cdCAgICBhY2MucHVzaChFT0MpO1xuXHQgICAgcmV0dXJuO1xuXHR9XG5cblx0aWYgKEFycmF5LmlzQXJyYXkocCkpIHtcblx0ICAgIGFjYy5wdXNoKFNPQSk7XG5cdCAgICBmb3IgKHZhciBpID0gMDsgaSA8IHAubGVuZ3RoOyBpKyspIHtcblx0XHR3YWxrKHBbaV0pO1xuXHQgICAgfVxuXHQgICAgYWNjLnB1c2goRU9BKTtcblx0ICAgIHJldHVybjtcblx0fVxuXG5cdGlmIChwIGluc3RhbmNlb2YgJEVtYmVkZGVkKSB7XG5cdCAgICBkaWUoXCJDYW5ub3QgZW1iZWQgbWF0Y2hlciBpbiBwcm9qZWN0aW9uXCIpO1xuXHR9IGVsc2Uge1xuXHQgICAgaWYgKHAgPT09IF9fKSB7XG5cdFx0YWNjLnB1c2gocCk7XG5cdCAgICB9IGVsc2Uge1xuXHRcdGFjYy5wdXNoKEpTT04uc3RyaW5naWZ5KHApKTtcblx0ICAgIH1cblx0fVxuICAgIH1cbn1cblxuZnVuY3Rpb24gcHJvamVjdGlvblRvUGF0dGVybihwKSB7XG4gICAgcmV0dXJuIHdhbGsocCk7XG5cbiAgICBmdW5jdGlvbiB3YWxrKHApIHtcblx0aWYgKGlzQ2FwdHVyZShwKSkgcmV0dXJuIHdhbGsoY2FwdHVyZVBhdHRlcm4ocCkpO1xuXG5cdGlmIChBcnJheS5pc0FycmF5KHApKSB7XG5cdCAgICB2YXIgcmVzdWx0ID0gW107XG5cdCAgICBmb3IgKHZhciBpID0gMDsgaSA8IHAubGVuZ3RoOyBpKyspIHtcblx0XHRyZXN1bHQucHVzaCh3YWxrKHBbaV0pKTtcblx0ICAgIH1cblx0ICAgIHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRpZiAocCBpbnN0YW5jZW9mICRFbWJlZGRlZCkge1xuXHQgICAgcmV0dXJuIHAubWF0Y2hlcjtcblx0fSBlbHNlIHtcblx0ICAgIHJldHVybiBwO1xuXHR9XG4gICAgfVxufVxuXG5mdW5jdGlvbiBwcm9qZWN0KG0sIGNvbXBpbGVkUHJvamVjdGlvbikge1xuICAgIHZhciBzcGVjID0gY29tcGlsZWRQcm9qZWN0aW9uLnNwZWM7XG4gICAgcmV0dXJuIHdhbGsoZmFsc2UsIG0sIDApO1xuXG4gICAgZnVuY3Rpb24gd2Fsayhpc0NhcHR1cmluZywgbSwgc3BlY0luZGV4KSB7XG5cdGlmIChzcGVjSW5kZXggPj0gc3BlYy5sZW5ndGgpIHtcblx0ICAgIGlmIChpc0NhcHR1cmluZykgZGllKFwiQmFkIHNwZWNpZmljYXRpb246IHVuY2xvc2VkIGNhcHR1cmVcIik7XG5cdCAgICBpZiAobSBpbnN0YW5jZW9mICRTdWNjZXNzKSB7XG5cdFx0cmV0dXJuIHJzZXEoRU9BLCByc3VjY2Vzcyhwcm9qZWN0U3VjY2VzcyhtLnZhbHVlKSkpO1xuXHQgICAgfSBlbHNlIHtcblx0XHRyZXR1cm4gZW1wdHlNYXRjaGVyO1xuXHQgICAgfVxuXHR9XG5cblx0aWYgKGlzX2VtcHR5TWF0Y2hlcihtKSkgcmV0dXJuIGVtcHR5TWF0Y2hlcjtcblxuXHR2YXIgaXRlbSA9IHNwZWNbc3BlY0luZGV4XTtcblx0dmFyIG5leHRJbmRleCA9IHNwZWNJbmRleCArIDE7XG5cblx0aWYgKGl0ZW0gPT09IEVPQykge1xuXHQgICAgaWYgKCFpc0NhcHR1cmluZykgZGllKFwiQmFkIHNwZWNpZmljYXRpb246IHVuZXB4ZWN0ZWQgRU9DXCIpO1xuXHQgICAgcmV0dXJuIHdhbGsoZmFsc2UsIG0sIG5leHRJbmRleCk7XG5cdH1cblxuXHRpZiAoaXRlbSA9PT0gU09DKSB7XG5cdCAgICBpZiAoaXNDYXB0dXJpbmcpIGRpZShcIkJhZCBzcGVjaWZpY2F0aW9uOiBuZXN0ZWQgY2FwdHVyZVwiKTtcblx0ICAgIHJldHVybiB3YWxrKHRydWUsIG0sIG5leHRJbmRleCk7XG5cdH1cblxuXHRpZiAoaXRlbSA9PT0gX18pIHtcblx0ICAgIGlmIChtIGluc3RhbmNlb2YgJFdpbGRjYXJkU2VxdWVuY2UpIHtcblx0XHRpZiAoaXNDYXB0dXJpbmcpIHtcblx0XHQgICAgcmV0dXJuIHJ3aWxkKHdhbGsoaXNDYXB0dXJpbmcsIG0sIG5leHRJbmRleCkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0ICAgIHJldHVybiB3YWxrKGlzQ2FwdHVyaW5nLCBtLCBuZXh0SW5kZXgpO1xuXHRcdH1cblx0ICAgIH1cblxuXHQgICAgaWYgKG0gaW5zdGFuY2VvZiAkU3VjY2Vzcykge1xuXHRcdHJldHVybiBlbXB0eU1hdGNoZXI7XG5cdCAgICB9XG5cblx0ICAgIHZhciB0YXJnZXQ7XG5cdCAgICBpZiAoaXNDYXB0dXJpbmcpIHtcblx0XHR0YXJnZXQgPSBuZXcgJERpY3QoKTtcblx0XHRydXBkYXRlSW5wbGFjZSh0YXJnZXQsIF9fLCB3YWxrKGlzQ2FwdHVyaW5nLCBtLmdldChfXyksIG5leHRJbmRleCkpO1xuXHRcdGZvciAodmFyIGtleSBpbiBtLmVudHJpZXMpIHtcblx0XHQgICAgaWYgKGtleSAhPT0gX18pIHtcblx0XHRcdHZhciBtayA9IG0uZ2V0KGtleSk7XG5cdFx0XHRpZiAoaXNfa2V5T3BlbihrZXkpKSB7XG5cdFx0XHQgICAgZnVuY3Rpb24gY29udChtazIpIHsgcmV0dXJuIHdhbGsoaXNDYXB0dXJpbmcsIG1rMiwgbmV4dEluZGV4KTsgfVxuXHRcdFx0ICAgIHJ1cGRhdGVJbnBsYWNlKHRhcmdldCwga2V5LCBjYXB0dXJlTmVzdGVkKG1rLCBjb250KSk7XG5cdFx0XHR9IGVsc2UgaWYgKGlzX2tleUNsb3NlKGtleSkpIHtcblx0XHRcdCAgICAvLyBkbyBub3RoaW5nXG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0ICAgIHJ1cGRhdGVJbnBsYWNlKHRhcmdldCwga2V5LCB3YWxrKGlzQ2FwdHVyaW5nLCBtaywgbmV4dEluZGV4KSk7XG5cdFx0XHR9XG5cdFx0ICAgIH1cblx0XHR9XG5cdCAgICB9IGVsc2Uge1xuXHRcdHRhcmdldCA9IHdhbGsoaXNDYXB0dXJpbmcsIG0uZ2V0KF9fKSwgbmV4dEluZGV4KTtcblx0XHRmb3IgKHZhciBrZXkgaW4gbS5lbnRyaWVzKSB7XG5cdFx0ICAgIGlmIChrZXkgIT09IF9fKSB7XG5cdFx0XHR2YXIgbWsgPSBtLmdldChrZXkpO1xuXHRcdFx0aWYgKGlzX2tleU9wZW4oa2V5KSkge1xuXHRcdFx0ICAgIGZ1bmN0aW9uIGNvbnQobWsyKSB7IHJldHVybiB3YWxrKGlzQ2FwdHVyaW5nLCBtazIsIG5leHRJbmRleCk7IH1cblx0XHRcdCAgICB0YXJnZXQgPSB1bmlvbih0YXJnZXQsIHNraXBOZXN0ZWQobWssIGNvbnQpKTtcblx0XHRcdH0gZWxzZSBpZiAoaXNfa2V5Q2xvc2Uoa2V5KSkge1xuXHRcdFx0ICAgIC8vIGRvIG5vdGhpbmdcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHQgICAgdGFyZ2V0ID0gdW5pb24odGFyZ2V0LCB3YWxrKGlzQ2FwdHVyaW5nLCBtaywgbmV4dEluZGV4KSk7XG5cdFx0XHR9XG5cdFx0ICAgIH1cblx0XHR9XG5cdCAgICB9XG5cdCAgICByZXR1cm4gdGFyZ2V0O1xuXHR9XG5cblx0dmFyIHJlc3VsdDtcblx0aWYgKG0gaW5zdGFuY2VvZiAkV2lsZGNhcmRTZXF1ZW5jZSkge1xuXHQgICAgaWYgKGlzX2tleU9wZW4oaXRlbSkpIHtcblx0XHRyZXN1bHQgPSB3YWxrKGlzQ2FwdHVyaW5nLCByd2lsZHNlcShtKSwgbmV4dEluZGV4KTtcblx0ICAgIH0gZWxzZSBpZiAoaXNfa2V5Q2xvc2UoaXRlbSkpIHtcblx0XHRyZXN1bHQgPSB3YWxrKGlzQ2FwdHVyaW5nLCBtLm1hdGNoZXIsIG5leHRJbmRleCk7XG5cdCAgICB9IGVsc2Uge1xuXHRcdHJlc3VsdCA9IHdhbGsoaXNDYXB0dXJpbmcsIG0sIG5leHRJbmRleCk7XG5cdCAgICB9XG5cdH0gZWxzZSBpZiAobSBpbnN0YW5jZW9mICRTdWNjZXNzKSB7XG5cdCAgICByZXN1bHQgPSBlbXB0eU1hdGNoZXI7XG5cdH0gZWxzZSB7XG5cdCAgICBpZiAoaXNfa2V5T3BlbihpdGVtKSkge1xuXHRcdHJlc3VsdCA9IHdhbGsoaXNDYXB0dXJpbmcsIHJ3aWxkc2VxKG0uZ2V0KF9fKSksIG5leHRJbmRleCk7XG5cdCAgICB9IGVsc2UgaWYgKGlzX2tleUNsb3NlKGl0ZW0pKSB7XG5cdFx0cmVzdWx0ID0gZW1wdHlNYXRjaGVyO1xuXHQgICAgfSBlbHNlIHtcblx0XHRyZXN1bHQgPSB3YWxrKGlzQ2FwdHVyaW5nLCBtLmdldChfXyksIG5leHRJbmRleCk7XG5cdCAgICB9XG5cdCAgICByZXN1bHQgPSB1bmlvbihyZXN1bHQsIHdhbGsoaXNDYXB0dXJpbmcsIG0uZ2V0KGl0ZW0pLCBuZXh0SW5kZXgpKTtcblx0fVxuXHRpZiAoaXNDYXB0dXJpbmcpIHtcblx0ICAgIHJlc3VsdCA9IHJzZXEoaXRlbSwgcmVzdWx0KTtcblx0fVxuXHRyZXR1cm4gcmVzdWx0O1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGNhcHR1cmVOZXN0ZWQobSwgY29udCkge1xuXHRpZiAobSBpbnN0YW5jZW9mICRXaWxkY2FyZFNlcXVlbmNlKSB7XG5cdCAgICByZXR1cm4gcndpbGRzZXEoY29udChtLm1hdGNoZXIpKTtcblx0fVxuXG5cdGlmIChpc19lbXB0eU1hdGNoZXIobSkgfHwgKG0gaW5zdGFuY2VvZiAkU3VjY2VzcykpIHtcblx0ICAgIHJldHVybiBlbXB0eU1hdGNoZXI7XG5cdH1cblxuXHR2YXIgdGFyZ2V0ID0gbmV3ICREaWN0KCk7XG5cdHJ1cGRhdGVJbnBsYWNlKHRhcmdldCwgX18sIGNhcHR1cmVOZXN0ZWQobS5nZXQoX18pLCBjb250KSk7XG5cdGZvciAodmFyIGtleSBpbiBtLmVudHJpZXMpIHtcblx0ICAgIGlmIChrZXkgIT09IF9fKSB7XG5cdFx0dmFyIG1rID0gbS5nZXQoa2V5KTtcblx0XHRpZiAoaXNfa2V5T3BlbihrZXkpKSB7XG5cdFx0ICAgIGZ1bmN0aW9uIGNvbnQyKG1rMikgeyByZXR1cm4gY2FwdHVyZU5lc3RlZChtazIsIGNvbnQpOyB9XG5cdFx0ICAgIHJ1cGRhdGVJbnBsYWNlKHRhcmdldCwga2V5LCBjYXB0dXJlTmVzdGVkKG1rLCBjb250MikpO1xuXHRcdH0gZWxzZSBpZiAoaXNfa2V5Q2xvc2Uoa2V5KSkge1xuXHRcdCAgICBydXBkYXRlSW5wbGFjZSh0YXJnZXQsIGtleSwgY29udChtaykpO1xuXHRcdH0gZWxzZSB7XG5cdFx0ICAgIHJ1cGRhdGVJbnBsYWNlKHRhcmdldCwga2V5LCBjYXB0dXJlTmVzdGVkKG1rLCBjb250KSk7XG5cdFx0fVxuXHQgICAgfVxuXHR9XG5cdHJldHVybiB0YXJnZXQuZW1wdHlHdWFyZCgpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHNraXBOZXN0ZWQobSwgY29udCkge1xuXHRpZiAobSBpbnN0YW5jZW9mICRXaWxkY2FyZFNlcXVlbmNlKSB7XG5cdCAgICByZXR1cm4gY29udChtLm1hdGNoZXIpO1xuXHR9XG5cblx0aWYgKGlzX2VtcHR5TWF0Y2hlcihtKSB8fCAobSBpbnN0YW5jZW9mICRTdWNjZXNzKSkge1xuXHQgICAgcmV0dXJuIGVtcHR5TWF0Y2hlcjtcblx0fVxuXG5cdHZhciB0YXJnZXQgPSBza2lwTmVzdGVkKG0uZ2V0KF9fKSwgY29udCk7XG5cdGZvciAodmFyIGtleSBpbiBtLmVudHJpZXMpIHtcblx0ICAgIGlmIChrZXkgIT09IF9fKSB7XG5cdFx0dmFyIG1rID0gbS5nZXQoa2V5KTtcblx0XHRpZiAoaXNfa2V5T3BlbihrZXkpKSB7XG5cdFx0ICAgIGZ1bmN0aW9uIGNvbnQyKG1rMikgeyByZXR1cm4gc2tpcE5lc3RlZChtazIsIGNvbnQpOyB9XG5cdFx0ICAgIHRhcmdldCA9IHVuaW9uKHRhcmdldCwgc2tpcE5lc3RlZChtaywgY29udDIpKTtcblx0XHR9IGVsc2UgaWYgKGlzX2tleUNsb3NlKGtleSkpIHtcblx0XHQgICAgdGFyZ2V0ID0gdW5pb24odGFyZ2V0LCBjb250KG1rKSk7XG5cdFx0fSBlbHNlIHtcblx0XHQgICAgdGFyZ2V0ID0gdW5pb24odGFyZ2V0LCBza2lwTmVzdGVkKG1rLCBjb250KSk7XG5cdFx0fVxuXHQgICAgfVxuXHR9XG5cdHJldHVybiB0YXJnZXQ7XG4gICAgfVxufVxuXG5mdW5jdGlvbiBtYXRjaGVyS2V5cyhtKSB7XG4gICAgaWYgKGlzX2VtcHR5TWF0Y2hlcihtKSkgcmV0dXJuIFtdO1xuICAgIHJldHVybiB3YWxrU2VxKG0sIGZ1bmN0aW9uICh2c3MsIHZzaykgeyByZXR1cm4gdnNzOyB9KTtcblxuICAgIGZ1bmN0aW9uIHdhbGsobSwgaykge1xuXHRpZiAobSBpbnN0YW5jZW9mICRXaWxkY2FyZFNlcXVlbmNlKSByZXR1cm4gbnVsbDtcblx0aWYgKG0gaW5zdGFuY2VvZiAkU3VjY2VzcykgcmV0dXJuIFtdO1xuXHRpZiAobS5oYXMoX18pKSByZXR1cm4gbnVsbDtcblx0dmFyIGFjYyA9IFtdO1xuXHRmb3IgKHZhciBrZXkgaW4gbS5lbnRyaWVzKSB7XG5cdCAgICB2YXIgbWsgPSBtLmdldChrZXkpO1xuXHQgICAgdmFyIHBpZWNlO1xuXHQgICAgaWYgKGlzX2tleU9wZW4oa2V5KSkge1xuXHRcdGZ1bmN0aW9uIHNlcUsodnNzLCB2c2spIHtcblx0XHQgICAgdmFyIGFjYyA9IFtdO1xuXHRcdCAgICBmb3IgKHZhciBpID0gMDsgaSA8IHZzcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0dmFyIHZzID0gdnNzW2ldO1xuXHRcdFx0YWNjID0gYWNjLmNvbmNhdChrKHRyYW5zZm9ybVNlcXModnMsIGtleSksIHZzaykpO1xuXHRcdCAgICB9XG5cdFx0ICAgIHJldHVybiBhY2M7XG5cdFx0fVxuXHRcdHBpZWNlID0gd2Fsa1NlcShtaywgc2VxSyk7XG5cdCAgICB9IGVsc2UgaWYgKGlzX2tleUNsb3NlKGtleSkpIHtcblx0XHRkaWUoXCJtYXRjaGVyS2V5czogaW50ZXJuYWwgZXJyb3I6IHVuZXhwZWN0ZWQga2V5LWNsb3NlXCIpO1xuXHQgICAgfSBlbHNlIHtcblx0XHRwaWVjZSA9IGsoSlNPTi5wYXJzZShrZXkpLCBtayk7XG5cdCAgICB9XG5cdCAgICBpZiAocGllY2UgPT0gbnVsbCkgcmV0dXJuIG51bGw7XG5cdCAgICBhY2MgPSBhY2MuY29uY2F0KHBpZWNlKTtcblx0fVxuXHRyZXR1cm4gYWNjO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHdhbGtTZXEobSwgaykge1xuXHRpZiAobSBpbnN0YW5jZW9mICRXaWxkY2FyZFNlcXVlbmNlKSByZXR1cm4gbnVsbDtcblx0aWYgKG0gaW5zdGFuY2VvZiAkU3VjY2VzcykgcmV0dXJuIGsoW10sIGVtcHR5TWF0Y2hlcik7IC8vIFRPRE86ID8/XG5cdGlmIChtLmhhcyhfXykpIHJldHVybiBudWxsO1xuXHR2YXIgYWNjID0gW107XG5cdGZvciAodmFyIGtleSBpbiBtLmVudHJpZXMpIHtcblx0ICAgIHZhciBtayA9IG0uZ2V0KGtleSk7XG5cdCAgICB2YXIgcGllY2U7XG5cdCAgICBpZiAoaXNfa2V5Q2xvc2Uoa2V5KSkge1xuXHRcdHBpZWNlID0gayhbW11dLCBtayk7XG5cdCAgICB9IGVsc2Uge1xuXHRcdGZ1bmN0aW9uIG91dGVySyh2LCB2aykge1xuXHRcdCAgICByZXR1cm4gd2Fsa1NlcSh2aywgaW5uZXJLKTtcblx0XHQgICAgZnVuY3Rpb24gaW5uZXJLKHZzcywgdnNrKSB7XG5cdFx0XHR2YXIgYWNjID0gW107XG5cdFx0XHRmb3IgKHZhciBpID0gMDsgaSA8IHZzcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0ICAgIHZhciB2cyA9IHNoYWxsb3dDb3B5QXJyYXkodnNzW2ldKTtcblx0XHRcdCAgICB2cy51bnNoaWZ0KHYpO1xuXHRcdFx0ICAgIGFjYy5wdXNoKHZzKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBrKGFjYywgdnNrKTtcblx0XHQgICAgfVxuXHRcdH1cblx0XHRwaWVjZSA9IHdhbGsocnNlcShrZXksIG1rKSwgb3V0ZXJLKTtcblx0ICAgIH1cblx0ICAgIGlmIChwaWVjZSA9PSBudWxsKSByZXR1cm4gbnVsbDtcblx0ICAgIGFjYyA9IGFjYy5jb25jYXQocGllY2UpO1xuXHR9XG5cdHJldHVybiBhY2M7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gdHJhbnNmb3JtU2Vxcyh2cywgb3BlbmVyKSB7XG5cdGlmIChvcGVuZXIgPT09IFNPQSkgcmV0dXJuIHZzO1xuXHRkaWUoXCJJbnRlcm5hbCBlcnJvcjogdW5rbm93biBvcGVuZXIgXCIgKyBvcGVuZXIpO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gbWF0Y2hlcktleXNUb09iamVjdHMobWF0Y2hlcktleXNSZXN1bHQsIGNvbXBpbGVkUHJvamVjdGlvbikge1xuICAgIGlmIChtYXRjaGVyS2V5c1Jlc3VsdCA9PT0gbnVsbCkgcmV0dXJuIG51bGw7XG4gICAgdmFyIHJlc3VsdCA9IFtdO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbWF0Y2hlcktleXNSZXN1bHQubGVuZ3RoOyBpKyspIHtcblx0dmFyIGUgPSBtYXRjaGVyS2V5c1Jlc3VsdFtpXTtcblx0dmFyIGQgPSB7fTtcblx0Zm9yICh2YXIgaiA9IDA7IGogPCBlLmxlbmd0aDsgaisrKSB7XG5cdCAgICBkW2NvbXBpbGVkUHJvamVjdGlvbi5uYW1lc1tqXSB8fCAoJyQnICsgaildID0gZVtqXTtcblx0fVxuXHRyZXN1bHQucHVzaChkKTtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbn1cblxuZnVuY3Rpb24gcHJvamVjdE9iamVjdHMobSwgY29tcGlsZWRQcm9qZWN0aW9uKSB7XG4gICAgcmV0dXJuIG1hdGNoZXJLZXlzVG9PYmplY3RzKG1hdGNoZXJLZXlzKHByb2plY3QobSwgY29tcGlsZWRQcm9qZWN0aW9uKSksIGNvbXBpbGVkUHJvamVjdGlvbik7XG59XG5cbmZ1bmN0aW9uIHByZXR0eU1hdGNoZXIobSwgaW5pdGlhbEluZGVudCkge1xuICAgIHZhciBhY2MgPSBbXTtcbiAgICB3YWxrKGluaXRpYWxJbmRlbnQgfHwgMCwgbSk7XG4gICAgcmV0dXJuIGFjYy5qb2luKCcnKTtcblxuICAgIGZ1bmN0aW9uIHdhbGsoaSwgbSkge1xuXHRpZiAoaXNfZW1wdHlNYXRjaGVyKG0pKSB7XG5cdCAgICBhY2MucHVzaChcIjo6OiBubyBmdXJ0aGVyIG1hdGNoZXMgcG9zc2libGVcIik7XG5cdCAgICByZXR1cm47XG5cdH1cblx0aWYgKG0gaW5zdGFuY2VvZiAkV2lsZGNhcmRTZXF1ZW5jZSkge1xuXHQgICAgYWNjLnB1c2goXCIuLi4+XCIpO1xuXHQgICAgd2FsayhpICsgNCwgbS5tYXRjaGVyKTtcblx0ICAgIHJldHVybjtcblx0fVxuXHRpZiAobSBpbnN0YW5jZW9mICRTdWNjZXNzKSB7XG5cdCAgICB2YXIgdnMgPSBKU09OLnN0cmluZ2lmeSh0eXBlb2YgbS52YWx1ZSA9PT0gJ29iamVjdCdcblx0XHRcdFx0ICAgID8gc2V0VG9BcnJheShtLnZhbHVlKVxuXHRcdFx0XHQgICAgOiBtLnZhbHVlKTtcblx0ICAgIGFjYy5wdXNoKFwie1wiICsgdnMgKyBcIn1cIik7XG5cdCAgICByZXR1cm47XG5cdH1cblxuXHRpZiAobS5sZW5ndGggPT09IDApIHtcblx0ICAgIGFjYy5wdXNoKFwiIDo6OiBlbXB0eSBoYXNoIVwiKTtcblx0ICAgIHJldHVybjtcblx0fVxuXG5cdHZhciBuZWVkU2VwID0gZmFsc2U7XG5cdHZhciBrZXlzID0gbS5zb3J0ZWRLZXlzKCk7XG5cdGZvciAodmFyIGtleWkgPSAwOyBrZXlpIDwga2V5cy5sZW5ndGg7IGtleWkrKykge1xuXHQgICAgdmFyIGtleSA9IGtleXNba2V5aV07XG5cdCAgICB2YXIgayA9IG0uZW50cmllc1trZXldO1xuXHQgICAgaWYgKG5lZWRTZXApIHtcblx0XHRhY2MucHVzaChcIlxcblwiKTtcblx0XHRhY2MucHVzaChpbmRlbnRTdHIoaSkpO1xuXHQgICAgfSBlbHNlIHtcblx0XHRuZWVkU2VwID0gdHJ1ZTtcblx0ICAgIH1cblx0ICAgIGFjYy5wdXNoKFwiIFwiKTtcblx0ICAgIGlmIChrZXkgPT09IF9fKSBrZXkgPSAn4piFJztcblx0ICAgIGlmIChrZXkgPT09IFNPQSkga2V5ID0gJzwnO1xuXHQgICAgaWYgKGtleSA9PT0gRU9BKSBrZXkgPSAnPic7XG5cdCAgICBhY2MucHVzaChrZXkpO1xuXHQgICAgd2FsayhpICsga2V5Lmxlbmd0aCArIDEsIGspO1xuXHR9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gaW5kZW50U3RyKGkpIHtcblx0cmV0dXJuIG5ldyBBcnJheShpICsgMSkuam9pbignICcpOyAvLyBld3dcbiAgICB9XG59XG5cbmZ1bmN0aW9uIHNlcmlhbGl6ZU1hdGNoZXIobSwgc2VyaWFsaXplU3VjY2Vzcykge1xuICAgIHJldHVybiB3YWxrKG0pO1xuICAgIGZ1bmN0aW9uIHdhbGsobSkge1xuXHRpZiAoaXNfZW1wdHlNYXRjaGVyKG0pKSByZXR1cm4gW107XG5cdGlmIChtIGluc3RhbmNlb2YgJFdpbGRjYXJkU2VxdWVuY2UpIHtcblx0ICAgIHJldHVybiBbXCIuLi4pXCIsIHdhbGsobS5tYXRjaGVyKV07XG5cdH1cblx0aWYgKG0gaW5zdGFuY2VvZiAkU3VjY2Vzcykge1xuXHQgICAgcmV0dXJuIFtcIlwiLCBzZXJpYWxpemVTdWNjZXNzKG0udmFsdWUpXTtcblx0fVxuXHR2YXIgYWNjID0gW107XG5cdGZvciAodmFyIGtleSBpbiBtLmVudHJpZXMpIHtcblx0ICAgIHZhciBrID0gbS5lbnRyaWVzW2tleV07XG5cdCAgICBpZiAoa2V5ID09PSBfXykga2V5ID0gW1wiX19cIl07XG5cdCAgICBlbHNlIGlmIChrZXkgPT09IFNPQSkga2V5ID0gW1wiKFwiXTtcblx0ICAgIGVsc2UgaWYgKGtleSA9PT0gRU9BKSBrZXkgPSBbXCIpXCJdO1xuXHQgICAgZWxzZSBrZXkgPSBKU09OLnBhcnNlKGtleSk7XG5cdCAgICBhY2MucHVzaChba2V5LCB3YWxrKGspXSk7XG5cdH1cblx0cmV0dXJuIGFjYztcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGRlc2VyaWFsaXplTWF0Y2hlcihyLCBkZXNlcmlhbGl6ZVN1Y2Nlc3MpIHtcbiAgICByZXR1cm4gd2FsayhyKTtcbiAgICBmdW5jdGlvbiB3YWxrKHIpIHtcblx0aWYgKHIubGVuZ3RoID09PSAwKSByZXR1cm4gZW1wdHlNYXRjaGVyO1xuXHRpZiAoclswXSA9PT0gXCIuLi4pXCIpIHJldHVybiByd2lsZHNlcSh3YWxrKHJbMV0pKTtcblx0aWYgKHJbMF0gPT09IFwiXCIpIHJldHVybiByc3VjY2VzcyhkZXNlcmlhbGl6ZVN1Y2Nlc3MoclsxXSkpO1xuXHR2YXIgYWNjID0gbmV3ICREaWN0KCk7XG5cdGZvciAodmFyIGkgPSAwOyBpIDwgci5sZW5ndGg7IGkrKykge1xuXHQgICAgdmFyIHJrZXkgPSByW2ldWzBdO1xuXHQgICAgdmFyIHJrID0gcltpXVsxXTtcblx0ICAgIHZhciBrZXk7XG5cdCAgICBpZiAoQXJyYXkuaXNBcnJheShya2V5KSkge1xuXHRcdHN3aXRjaCAocmtleVswXSkge1xuXHRcdGNhc2UgXCJfX1wiOiBrZXkgPSBfXzsgYnJlYWs7XG5cdFx0Y2FzZSBcIihcIjoga2V5ID0gU09BOyBicmVhaztcblx0XHRjYXNlIFwiKVwiOiBrZXkgPSBFT0E7IGJyZWFrO1xuXHRcdGRlZmF1bHQ6IGRpZShcIkludmFsaWQgc2VyaWFsaXplZCBzcGVjaWFsIGtleTogXCIgKyBya2V5WzBdKTtcblx0XHR9XG5cdCAgICB9IGVsc2Uge1xuXHRcdGtleSA9IEpTT04uc3RyaW5naWZ5KHJrZXkpO1xuXHQgICAgfVxuXHQgICAgcnVwZGF0ZUlucGxhY2UoYWNjLCBrZXksIHdhbGsocmspKTtcblx0fVxuXHRyZXR1cm4gYWNjO1xuICAgIH1cbn1cblxuLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXG4vLyBHZXN0YWx0cy5cbi8vIFRPRE86IHN1cHBvcnQgSW5maW5pdHkgYXMgYSBsZXZlbCBudW1iZXJcblxuZnVuY3Rpb24gR2VzdGFsdExldmVsKHN1YnMsIGFkdnMpIHtcbiAgICB0aGlzLnN1YnNjcmlwdGlvbnMgPSBzdWJzO1xuICAgIHRoaXMuYWR2ZXJ0aXNlbWVudHMgPSBhZHZzO1xufVxuXG5HZXN0YWx0TGV2ZWwucHJvdG90eXBlLmlzRW1wdHkgPSBmdW5jdGlvbiAoKSB7XG4gICAgcmV0dXJuIGlzX2VtcHR5TWF0Y2hlcih0aGlzLnN1YnNjcmlwdGlvbnMpICYmIGlzX2VtcHR5TWF0Y2hlcih0aGlzLmFkdmVydGlzZW1lbnRzKTtcbn07XG5cbkdlc3RhbHRMZXZlbC5wcm90b3R5cGUuZXF1YWxzID0gZnVuY3Rpb24gKG90aGVyKSB7XG4gICAgcmV0dXJuIG1hdGNoZXJFcXVhbHModGhpcy5zdWJzY3JpcHRpb25zLCBvdGhlci5zdWJzY3JpcHRpb25zKVxuXHQmJiBtYXRjaGVyRXF1YWxzKHRoaXMuYWR2ZXJ0aXNlbWVudHMsIG90aGVyLmFkdmVydGlzZW1lbnRzKTtcbn07XG5cbkdlc3RhbHRMZXZlbC5wcm90b3R5cGUucHJldHR5ID0gZnVuY3Rpb24gKCkge1xuICAgIHZhciBhY2MgPSBbXTtcbiAgICBpZiAoIWlzX2VtcHR5TWF0Y2hlcih0aGlzLnN1YnNjcmlwdGlvbnMpKSB7XG5cdGFjYy5wdXNoKFwiICAtIHN1YnM6XCIpO1xuXHRhY2MucHVzaChwcmV0dHlNYXRjaGVyKHRoaXMuc3Vic2NyaXB0aW9ucywgOSkpO1xuXHRhY2MucHVzaChcIlxcblwiKTtcbiAgICB9XG4gICAgaWYgKCFpc19lbXB0eU1hdGNoZXIodGhpcy5hZHZlcnRpc2VtZW50cykpIHtcblx0YWNjLnB1c2goXCIgIC0gYWR2czpcIik7XG5cdGFjYy5wdXNoKHByZXR0eU1hdGNoZXIodGhpcy5hZHZlcnRpc2VtZW50cywgOSkpO1xuXHRhY2MucHVzaChcIlxcblwiKTtcbiAgICB9XG4gICAgcmV0dXJuIGFjYy5qb2luKCcnKTtcbn07XG5cbmZ1bmN0aW9uIHN0cmFpZ2h0R2VzdGFsdExldmVsT3Aob3ApIHtcbiAgICByZXR1cm4gZnVuY3Rpb24gKHAxLCBwMikge1xuXHRyZXR1cm4gbmV3IEdlc3RhbHRMZXZlbChvcChwMS5zdWJzY3JpcHRpb25zLCBwMi5zdWJzY3JpcHRpb25zKSxcblx0XHRcdFx0b3AocDEuYWR2ZXJ0aXNlbWVudHMsIHAyLmFkdmVydGlzZW1lbnRzKSk7XG4gICAgfTtcbn07XG5cbnZhciBlbXB0eUxldmVsID0gbmV3IEdlc3RhbHRMZXZlbChlbXB0eU1hdGNoZXIsIGVtcHR5TWF0Y2hlcik7XG52YXIgZW1wdHlNZXRhTGV2ZWwgPSBbXTtcblxuZnVuY3Rpb24gR2VzdGFsdChtZXRhTGV2ZWxzKSB7XG4gICAgdGhpcy5tZXRhTGV2ZWxzID0gbWV0YUxldmVscztcbn1cblxuR2VzdGFsdC5wcm90b3R5cGUuZ2V0TWV0YUxldmVsID0gZnVuY3Rpb24gKG4pIHtcbiAgICByZXR1cm4gdGhpcy5tZXRhTGV2ZWxzW25dIHx8IGVtcHR5TWV0YUxldmVsO1xufTtcblxuR2VzdGFsdC5wcm90b3R5cGUuZ2V0TGV2ZWwgPSBmdW5jdGlvbiAobWV0YUxldmVsLCBsZXZlbCkge1xuICAgIHJldHVybiB0aGlzLmdldE1ldGFMZXZlbChtZXRhTGV2ZWwpW2xldmVsXSB8fCBlbXB0eUxldmVsO1xufTtcblxuR2VzdGFsdC5wcm90b3R5cGUubWV0YUxldmVsQ291bnQgPSBmdW5jdGlvbiAoKSB7IHJldHVybiB0aGlzLm1ldGFMZXZlbHMubGVuZ3RoOyB9O1xuR2VzdGFsdC5wcm90b3R5cGUubGV2ZWxDb3VudCA9IGZ1bmN0aW9uIChuKSB7IHJldHVybiB0aGlzLmdldE1ldGFMZXZlbChuKS5sZW5ndGg7IH07XG5cbkdlc3RhbHQucHJvdG90eXBlLm1hdGNoVmFsdWUgPSBmdW5jdGlvbiAoYm9keSwgbWV0YUxldmVsLCBpc0ZlZWRiYWNrKSB7XG4gICAgdmFyIGxldmVscyA9IHRoaXMuZ2V0TWV0YUxldmVsKG1ldGFMZXZlbCk7XG4gICAgdmFyIHBpZHMgPSB7fTtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGxldmVscy5sZW5ndGg7IGkrKykge1xuXHR2YXIgbWF0Y2hlciA9IChpc0ZlZWRiYWNrID8gbGV2ZWxzW2ldLmFkdmVydGlzZW1lbnRzIDogbGV2ZWxzW2ldLnN1YnNjcmlwdGlvbnMpO1xuXHRzZXRVbmlvbklucGxhY2UocGlkcywgbWF0Y2hWYWx1ZShtYXRjaGVyLCBib2R5KSk7XG4gICAgfVxuICAgIHJldHVybiBzZXRUb0FycmF5KHBpZHMpO1xufTtcblxuR2VzdGFsdC5wcm90b3R5cGUucHJvamVjdCA9IGZ1bmN0aW9uIChzcGVjLCBnZXRBZHZlcnRpc2VtZW50cywgbWV0YUxldmVsLCBsZXZlbCkge1xuICAgIHZhciBsID0gdGhpcy5nZXRMZXZlbChtZXRhTGV2ZWwgfCAwLCBsZXZlbCB8IDApO1xuICAgIHZhciBtYXRjaGVyID0gKGdldEFkdmVydGlzZW1lbnRzID8gbC5hZHZlcnRpc2VtZW50cyA6IGwuc3Vic2NyaXB0aW9ucyk7XG4gICAgcmV0dXJuIHByb2plY3QobWF0Y2hlciwgc3BlYyk7XG59O1xuXG5HZXN0YWx0LnByb3RvdHlwZS5kcm9wID0gZnVuY3Rpb24gKCkge1xuICAgIHZhciBtbHMgPSBzaGFsbG93Q29weUFycmF5KHRoaXMubWV0YUxldmVscyk7XG4gICAgbWxzLnNoaWZ0KCk7XG4gICAgcmV0dXJuIG5ldyBHZXN0YWx0KG1scyk7XG59O1xuXG5HZXN0YWx0LnByb3RvdHlwZS5saWZ0ID0gZnVuY3Rpb24gKCkge1xuICAgIHZhciBtbHMgPSBzaGFsbG93Q29weUFycmF5KHRoaXMubWV0YUxldmVscyk7XG4gICAgbWxzLnVuc2hpZnQoZW1wdHlNZXRhTGV2ZWwpO1xuICAgIHJldHVybiBuZXcgR2VzdGFsdChtbHMpO1xufTtcblxuR2VzdGFsdC5wcm90b3R5cGUuZXF1YWxzID0gZnVuY3Rpb24gKG90aGVyKSB7XG4gICAgaWYgKHRoaXMubWV0YUxldmVscy5sZW5ndGggIT09IG90aGVyLm1ldGFMZXZlbHMubGVuZ3RoKSByZXR1cm4gZmFsc2U7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLm1ldGFMZXZlbHMubGVuZ3RoOyBpKyspIHtcblx0dmFyIGxzMSA9IHRoaXMubWV0YUxldmVsc1tpXTtcblx0dmFyIGxzMiA9IG90aGVyLm1ldGFMZXZlbHNbaV07XG5cdGlmIChsczEubGVuZ3RoICE9PSBsczIubGVuZ3RoKSByZXR1cm4gZmFsc2U7XG5cdGZvciAodmFyIGogPSAwOyBqIDwgbHMxLmxlbmd0aDsgaisrKSB7XG5cdCAgICB2YXIgcDEgPSBsczFbal07XG5cdCAgICB2YXIgcDIgPSBsczJbal07XG5cdCAgICBpZiAoIXAxLmVxdWFscyhwMikpIHJldHVybiBmYWxzZTtcblx0fVxuICAgIH1cbiAgICByZXR1cm4gdHJ1ZTtcbn07XG5cbmZ1bmN0aW9uIHNpbXBsZUdlc3RhbHQoaXNBZHYsIHBhdCwgbWV0YUxldmVsLCBsZXZlbCkge1xuICAgIG1ldGFMZXZlbCA9IG1ldGFMZXZlbCB8fCAwO1xuICAgIGxldmVsID0gbGV2ZWwgfHwgMDtcbiAgICB2YXIgbWF0Y2hlciA9IGNvbXBpbGVQYXR0ZXJuKHRydWUsIHBhdCk7XG4gICAgdmFyIGwgPSBuZXcgR2VzdGFsdExldmVsKGlzQWR2ID8gZW1wdHlNYXRjaGVyIDogbWF0Y2hlcixcblx0XHRcdCAgICAgaXNBZHYgPyBtYXRjaGVyIDogZW1wdHlNYXRjaGVyKTtcbiAgICB2YXIgbGV2ZWxzID0gW2xdO1xuICAgIHdoaWxlIChsZXZlbC0tKSB7IGxldmVscy51bnNoaWZ0KGVtcHR5TGV2ZWwpOyB9XG4gICAgdmFyIG1ldGFMZXZlbHMgPSBbbGV2ZWxzXTtcbiAgICB3aGlsZSAobWV0YUxldmVsLS0pIHsgbWV0YUxldmVscy51bnNoaWZ0KGVtcHR5TWV0YUxldmVsKTsgfVxuICAgIHJldHVybiBuZXcgR2VzdGFsdChtZXRhTGV2ZWxzKTtcbn1cblxudmFyIGVtcHR5R2VzdGFsdCA9IG5ldyBHZXN0YWx0KFtdKTtcblxuLy8gTm90IHF1aXRlIHdoYXQgaXQgc2F5cyBvbiB0aGUgdGluIC0gdGhlIHRydWUgZnVsbEdlc3RhbHRcbi8vIHdvdWxkbid0IGJlIHBhcmFtZXRlcml6ZWQgb24gdGhlIG51bWJlciBvZiBsZXZlbHMgYW5kXG4vLyBtZXRhbGV2ZWxzLCBidXQgaW5zdGVhZCB3b3VsZCBiZSBmdWxsIGF0ICphbGwqIGxldmVscyBhbmRcbi8vIG1ldGFsZXZlbHMuIE91ciByZXByZXNlbnRhdGlvbiBsZWFrcyB0aHJvdWdoIGludG8gdGhlIGludGVyZmFjZVxuLy8gaGVyZSA6LS9cbmZ1bmN0aW9uIGZ1bGxHZXN0YWx0KG5NZXRhbGV2ZWxzLCBuTGV2ZWxzKSB7XG4gICAgdmFyIG1hdGNoZXIgPSBjb21waWxlUGF0dGVybih0cnVlLCBfXyk7XG4gICAgdmFyIGwgPSBuZXcgR2VzdGFsdExldmVsKG1hdGNoZXIsIG1hdGNoZXIpO1xuICAgIHZhciBsZXZlbHMgPSBbXTtcbiAgICB3aGlsZSAobkxldmVscy0tKSB7IGxldmVscy5wdXNoKGwpOyB9XG4gICAgdmFyIG1ldGFMZXZlbHMgPSBbXTtcbiAgICB3aGlsZSAobk1ldGFsZXZlbHMtLSkgeyBtZXRhTGV2ZWxzLnB1c2gobGV2ZWxzKTsgfVxuICAgIHJldHVybiBuZXcgR2VzdGFsdChtZXRhTGV2ZWxzKTtcbn1cblxuR2VzdGFsdC5wcm90b3R5cGUuaXNFbXB0eSA9IGZ1bmN0aW9uICgpIHtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMubWV0YUxldmVscy5sZW5ndGg7IGkrKykge1xuXHR2YXIgbGV2ZWxzID0gdGhpcy5tZXRhTGV2ZWxzW2ldO1xuXHRmb3IgKHZhciBqID0gMDsgaiA8IGxldmVscy5sZW5ndGg7IGorKykge1xuXHQgICAgaWYgKCFsZXZlbHNbal0uaXNFbXB0eSgpKSByZXR1cm4gZmFsc2U7XG5cdH1cbiAgICB9XG4gICAgcmV0dXJuIHRydWU7XG59O1xuXG5mdW5jdGlvbiBtYXliZVB1c2hMZXZlbChsZXZlbHMsIGksIGxldmVsKSB7XG4gICAgaWYgKCFsZXZlbC5pc0VtcHR5KCkpIHtcblx0d2hpbGUgKGxldmVscy5sZW5ndGggPCBpKSBsZXZlbHMucHVzaChlbXB0eUxldmVsKTtcblx0bGV2ZWxzLnB1c2gobGV2ZWwpO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gbWF5YmVQdXNoTWV0YUxldmVsKG1ldGFMZXZlbHMsIGksIG1ldGFMZXZlbCkge1xuICAgIGlmIChtZXRhTGV2ZWwubGVuZ3RoID4gMCkge1xuXHR3aGlsZSAobWV0YUxldmVscy5sZW5ndGggPCBpKSBtZXRhTGV2ZWxzLnB1c2goZW1wdHlNZXRhTGV2ZWwpO1xuXHRtZXRhTGV2ZWxzLnB1c2gobWV0YUxldmVsKTtcbiAgICB9XG59XG5cbkdlc3RhbHQucHJvdG90eXBlLm1hcFppcCA9IGZ1bmN0aW9uIChvdGhlciwgbGVuZ3RoQ29tYmluZXIsIGYpIHtcbiAgICB2YXIgbWV0YUxldmVscyA9IFtdO1xuICAgIHZhciBtbHMxID0gdGhpcy5tZXRhTGV2ZWxzO1xuICAgIHZhciBtbHMyID0gb3RoZXIubWV0YUxldmVscztcbiAgICB2YXIgbm0gPSBsZW5ndGhDb21iaW5lcihtbHMxLmxlbmd0aCwgbWxzMi5sZW5ndGgpO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbm07IGkrKykge1xuXHR2YXIgbGV2ZWxzID0gW107XG5cdHZhciBsczEgPSBtbHMxW2ldIHx8IGVtcHR5TWV0YUxldmVsO1xuXHR2YXIgbHMyID0gbWxzMltpXSB8fCBlbXB0eU1ldGFMZXZlbDtcblx0dmFyIG5sID0gbGVuZ3RoQ29tYmluZXIobHMxLmxlbmd0aCwgbHMyLmxlbmd0aCk7XG5cdGZvciAodmFyIGogPSAwOyBqIDwgbmw7IGorKykge1xuXHQgICAgdmFyIHAxID0gbHMxW2pdIHx8IGVtcHR5TGV2ZWw7XG5cdCAgICB2YXIgcDIgPSBsczJbal0gfHwgZW1wdHlMZXZlbDtcblx0ICAgIHZhciBwID0gZihwMSwgcDIpO1xuXHQgICAgbWF5YmVQdXNoTGV2ZWwobGV2ZWxzLCBqLCBwKTtcblx0fVxuXHRtYXliZVB1c2hNZXRhTGV2ZWwobWV0YUxldmVscywgaSwgbGV2ZWxzKTtcbiAgICB9XG4gICAgcmV0dXJuIG5ldyBHZXN0YWx0KG1ldGFMZXZlbHMpO1xufTtcblxuR2VzdGFsdC5wcm90b3R5cGUudW5pb24xID0gZnVuY3Rpb24gKG90aGVyKSB7XG4gICAgcmV0dXJuIHRoaXMubWFwWmlwKG90aGVyLCBNYXRoLm1heCwgc3RyYWlnaHRHZXN0YWx0TGV2ZWxPcCh1bmlvbikpO1xufTtcblxuZnVuY3Rpb24gZ2VzdGFsdFVuaW9uKGdzKSB7XG4gICAgaWYgKGdzLmxlbmd0aCA9PT0gMCkgcmV0dXJuIGVtcHR5R2VzdGFsdDtcbiAgICB2YXIgYWNjID0gZ3NbMF07XG4gICAgZm9yICh2YXIgaSA9IDE7IGkgPCBncy5sZW5ndGg7IGkrKykge1xuXHRhY2MgPSBhY2MudW5pb24xKGdzW2ldKTtcbiAgICB9XG4gICAgcmV0dXJuIGFjYztcbn1cblxuR2VzdGFsdC5wcm90b3R5cGUudW5pb24gPSBmdW5jdGlvbiAoKSB7XG4gICAgcmV0dXJuIGFyZ3VtZW50cy5sZW5ndGggPiAwID8gdGhpcy51bmlvbjEoZ2VzdGFsdFVuaW9uKGFyZ3VtZW50cykpIDogdGhpcztcbn07XG5cbi8vIEFjY3VtdWxhdGVzIG1hdGNoZXJzIGZyb20gaGlnaGVyLW51bWJlcmVkIGxldmVscyBpbnRvXG4vLyBsb3dlci1udW1iZXJlZCBsZXZlbHMuXG5mdW5jdGlvbiB0ZWxlc2NvcGVMZXZlbHMobGV2ZWxzKSB7XG4gICAgdmFyIHJlc3VsdCA9IHNoYWxsb3dDb3B5QXJyYXkobGV2ZWxzKTtcbiAgICBmb3IgKHZhciBpID0gcmVzdWx0Lmxlbmd0aCAtIDI7IGkgPj0gMDsgaS0tKSB7XG5cdHJlc3VsdFtpXSA9XG5cdCAgICBuZXcgR2VzdGFsdExldmVsKHVuaW9uKHJlc3VsdFtpXS5zdWJzY3JpcHRpb25zLCByZXN1bHRbaSsxXS5zdWJzY3JpcHRpb25zKSxcblx0XHRcdCAgICAgdW5pb24ocmVzdWx0W2ldLmFkdmVydGlzZW1lbnRzLCByZXN1bHRbaSsxXS5hZHZlcnRpc2VtZW50cykpO1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xufTtcblxuR2VzdGFsdC5wcm90b3R5cGUudGVsZXNjb3BlZCA9IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgbWxzID0gW107XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLm1ldGFMZXZlbHMubGVuZ3RoOyBpKyspIHtcblx0bWxzLnB1c2godGVsZXNjb3BlTGV2ZWxzKHRoaXMubWV0YUxldmVsc1tpXSkpO1xuICAgIH1cbiAgICByZXR1cm4gbmV3IEdlc3RhbHQobWxzKTtcbn07XG5cbkdlc3RhbHQucHJvdG90eXBlLmZpbHRlciA9IGZ1bmN0aW9uIChwZXJzcGVjdGl2ZSkge1xuICAgIHZhciBtZXRhTGV2ZWxzID0gW107XG4gICAgdmFyIG1sczEgPSB0aGlzLm1ldGFMZXZlbHM7XG4gICAgdmFyIG1sczIgPSBwZXJzcGVjdGl2ZS5tZXRhTGV2ZWxzO1xuICAgIHZhciBubSA9IE1hdGgubWluKG1sczEubGVuZ3RoLCBtbHMyLmxlbmd0aCk7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBubTsgaSsrKSB7XG5cdHZhciBsZXZlbHMgPSBbXTtcblx0dmFyIGxzMSA9IG1sczFbaV0gfHwgZW1wdHlNZXRhTGV2ZWw7XG5cdHZhciBsczIgPSBtbHMyW2ldIHx8IGVtcHR5TWV0YUxldmVsO1xuXHR2YXIgbmwgPSBNYXRoLm1pbihsczEubGVuZ3RoLCBsczIubGVuZ3RoIC0gMSk7XG5cdGZvciAodmFyIGogPSAwOyBqIDwgbmw7IGorKykge1xuXHQgICAgdmFyIHAxID0gbHMxW2pdIHx8IGVtcHR5TGV2ZWw7XG5cdCAgICB2YXIgc3VicyA9IGVtcHR5TWF0Y2hlcjtcblx0ICAgIHZhciBhZHZzID0gZW1wdHlNYXRjaGVyO1xuXHQgICAgZm9yICh2YXIgayA9IGogKyAxOyBrIDwgbHMyLmxlbmd0aDsgaysrKSB7XG5cdFx0dmFyIHAyID0gbHMyW2tdIHx8IGVtcHR5TGV2ZWw7XG5cdFx0c3VicyA9IHVuaW9uKHN1YnMsIGludGVyc2VjdChwMS5zdWJzY3JpcHRpb25zLCBwMi5hZHZlcnRpc2VtZW50cykpO1xuXHRcdGFkdnMgPSB1bmlvbihhZHZzLCBpbnRlcnNlY3QocDEuYWR2ZXJ0aXNlbWVudHMsIHAyLnN1YnNjcmlwdGlvbnMpKTtcblx0ICAgIH1cblx0ICAgIG1heWJlUHVzaExldmVsKGxldmVscywgaiwgbmV3IEdlc3RhbHRMZXZlbChzdWJzLCBhZHZzKSk7XG5cdH1cblx0bWF5YmVQdXNoTWV0YUxldmVsKG1ldGFMZXZlbHMsIGksIGxldmVscyk7XG4gICAgfVxuICAgIHJldHVybiBuZXcgR2VzdGFsdChtZXRhTGV2ZWxzKTtcbn07XG5cbkdlc3RhbHQucHJvdG90eXBlLm1hdGNoID0gZnVuY3Rpb24gKHBlcnNwZWN0aXZlKSB7XG4gICAgdmFyIHBpZHMgPSB7fTtcbiAgICB2YXIgbm0gPSBNYXRoLm1pbih0aGlzLm1ldGFMZXZlbHMubGVuZ3RoLCBwZXJzcGVjdGl2ZS5tZXRhTGV2ZWxzLmxlbmd0aCk7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBubTsgaSsrKSB7XG5cdHZhciBsczEgPSB0aGlzLm1ldGFMZXZlbHNbaV0gfHwgZW1wdHlNZXRhTGV2ZWw7XG5cdHZhciBsczIgPSBwZXJzcGVjdGl2ZS5tZXRhTGV2ZWxzW2ldIHx8IGVtcHR5TWV0YUxldmVsO1xuXHR2YXIgbmwgPSBNYXRoLm1pbihsczEubGVuZ3RoLCBsczIubGVuZ3RoIC0gMSk7XG5cdGZvciAodmFyIGogPSAwOyBqIDwgbmw7IGorKykge1xuXHQgICAgdmFyIHAxID0gbHMxW2pdIHx8IGVtcHR5TGV2ZWw7XG5cdCAgICBmb3IgKHZhciBrID0gaiArIDE7IGsgPCBsczIubGVuZ3RoOyBrKyspIHtcblx0XHR2YXIgcDIgPSBsczJba10gfHwgZW1wdHlMZXZlbDtcblx0XHRtYXRjaE1hdGNoZXIocDEuc3Vic2NyaXB0aW9ucywgcDIuYWR2ZXJ0aXNlbWVudHMsIHBpZHMpO1xuXHRcdG1hdGNoTWF0Y2hlcihwMS5hZHZlcnRpc2VtZW50cywgcDIuc3Vic2NyaXB0aW9ucywgcGlkcyk7XG5cdCAgICB9XG5cdH1cbiAgICB9XG4gICAgcmV0dXJuIHNldFRvQXJyYXkocGlkcyk7XG59O1xuXG5HZXN0YWx0LnByb3RvdHlwZS5lcmFzZVBhdGggPSBmdW5jdGlvbiAocGF0aCkge1xuICAgIHJldHVybiB0aGlzLm1hcFppcChwYXRoLCBNYXRoLm1heCwgc3RyYWlnaHRHZXN0YWx0TGV2ZWxPcChlcmFzZVBhdGgpKTtcbn07XG5cbmZ1bmN0aW9uIG1hcExldmVscyhpbnB1dE1ldGFMZXZlbHMsIGYsIGVtcHR5Q2hlY2ssIGlucHV0RW1wdHlMZXZlbCwgb3V0cHV0RW1wdHlMZXZlbCkge1xuICAgIHZhciBvdXRwdXRNZXRhTGV2ZWxzID0gW107XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBpbnB1dE1ldGFMZXZlbHMubGVuZ3RoOyBpKyspIHtcblx0dmFyIGxzID0gaW5wdXRNZXRhTGV2ZWxzW2ldO1xuXHR2YXIgbGV2ZWxzID0gW107XG5cdGZvciAodmFyIGogPSAwOyBqIDwgbHMubGVuZ3RoOyBqKyspIHtcblx0ICAgIHZhciBwID0gZihsc1tqXSB8fCBpbnB1dEVtcHR5TGV2ZWwsIGksIGopO1xuXHQgICAgaWYgKCFlbXB0eUNoZWNrKHAsIGksIGopKSB7XG5cdFx0d2hpbGUgKGxldmVscy5sZW5ndGggPCBqKSBsZXZlbHMucHVzaChvdXRwdXRFbXB0eUxldmVsKTtcblx0XHRsZXZlbHMucHVzaChwKTtcblx0ICAgIH1cblx0fVxuXHRpZiAobGV2ZWxzLmxlbmd0aCA+IDApIHtcblx0ICAgIHdoaWxlIChvdXRwdXRNZXRhTGV2ZWxzLmxlbmd0aCA8IGkpIG91dHB1dE1ldGFMZXZlbHMucHVzaChlbXB0eU1ldGFMZXZlbCk7XG5cdCAgICBvdXRwdXRNZXRhTGV2ZWxzLnB1c2gobGV2ZWxzKTtcblx0fVxuICAgIH1cbiAgICByZXR1cm4gb3V0cHV0TWV0YUxldmVscztcbn07XG5cbkdlc3RhbHQucHJvdG90eXBlLnRyYW5zZm9ybSA9IGZ1bmN0aW9uIChmKSB7XG4gICAgcmV0dXJuIG5ldyBHZXN0YWx0KG1hcExldmVscyh0aGlzLm1ldGFMZXZlbHMsIGZ1bmN0aW9uIChwLCBtbCwgbCkge1xuXHRyZXR1cm4gbmV3IEdlc3RhbHRMZXZlbChmKHAuc3Vic2NyaXB0aW9ucywgbWwsIGwsIGZhbHNlKSxcblx0XHRcdFx0ZihwLmFkdmVydGlzZW1lbnRzLCBtbCwgbCwgdHJ1ZSkpO1xuICAgIH0sIGZ1bmN0aW9uIChwKSB7XG5cdHJldHVybiBwLmlzRW1wdHkoKTtcbiAgICB9LCBlbXB0eUxldmVsLCBlbXB0eUxldmVsKSk7XG59O1xuXG5HZXN0YWx0LnByb3RvdHlwZS5zdHJpcExhYmVsID0gZnVuY3Rpb24gKCkge1xuICAgIHJldHVybiB0aGlzLnRyYW5zZm9ybShmdW5jdGlvbiAobSkgeyByZXR1cm4gcmVsYWJlbChtLCBmdW5jdGlvbiAodikgeyByZXR1cm4gdHJ1ZTsgfSk7IH0pO1xufTtcblxuR2VzdGFsdC5wcm90b3R5cGUubGFiZWwgPSBmdW5jdGlvbiAocGlkKSB7XG4gICAgdmFyIHBpZHMgPSBhcnJheVRvU2V0KFtwaWRdKTtcbiAgICByZXR1cm4gdGhpcy50cmFuc2Zvcm0oZnVuY3Rpb24gKG0pIHsgcmV0dXJuIHJlbGFiZWwobSwgZnVuY3Rpb24gKHYpIHsgcmV0dXJuIHBpZHM7IH0pOyB9KTtcbn07XG5cbkdlc3RhbHQucHJvdG90eXBlLnByZXR0eSA9IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgYWNjID0gW107XG4gICAgaWYgKHRoaXMuaXNFbXB0eSgpKSB7XG5cdGFjYy5wdXNoKFwiRU1QVFkgR0VTVEFMVFxcblwiKTtcbiAgICB9IGVsc2Uge1xuXHRmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMubWV0YUxldmVscy5sZW5ndGg7IGkrKykge1xuXHQgICAgdmFyIGxzID0gdGhpcy5tZXRhTGV2ZWxzW2ldO1xuXHQgICAgZm9yICh2YXIgaiA9IDA7IGogPCBscy5sZW5ndGg7IGorKykge1xuXHRcdHZhciBwID0gbHNbal07XG5cdFx0aWYgKCFwLmlzRW1wdHkoKSkge1xuXHRcdCAgICBhY2MucHVzaChcIkdFU1RBTFQgbWV0YWxldmVsIFwiICsgaSArIFwiIGxldmVsIFwiICsgaiArIFwiOlxcblwiKTtcblx0XHQgICAgYWNjLnB1c2gocC5wcmV0dHkoKSk7XG5cdFx0fVxuXHQgICAgfVxuXHR9XG4gICAgfVxuICAgIHJldHVybiBhY2Muam9pbignJyk7XG59O1xuXG5HZXN0YWx0LnByb3RvdHlwZS5zZXJpYWxpemUgPSBmdW5jdGlvbiAoc2VyaWFsaXplU3VjY2Vzcykge1xuICAgIGlmICh0eXBlb2Ygc2VyaWFsaXplU3VjY2VzcyA9PT0gJ3VuZGVmaW5lZCcpIHtcblx0c2VyaWFsaXplU3VjY2VzcyA9IGZ1bmN0aW9uICh2KSB7IHJldHVybiB2ID09PSB0cnVlID8gdHJ1ZSA6IHNldFRvQXJyYXkodik7IH07XG4gICAgfVxuICAgIHJldHVybiBbXCJnZXN0YWx0XCIsIG1hcExldmVscyh0aGlzLm1ldGFMZXZlbHMsIGZ1bmN0aW9uIChwKSB7XG5cdHJldHVybiBbc2VyaWFsaXplTWF0Y2hlcihwLnN1YnNjcmlwdGlvbnMsIHNlcmlhbGl6ZVN1Y2Nlc3MpLFxuXHRcdHNlcmlhbGl6ZU1hdGNoZXIocC5hZHZlcnRpc2VtZW50cywgc2VyaWFsaXplU3VjY2VzcyldO1xuICAgIH0sIGZ1bmN0aW9uIChwcikge1xuXHRyZXR1cm4gcHIubGVuZ3RoID09PSAyICYmIHByWzBdLmxlbmd0aCA9PT0gMCAmJiBwclsxXS5sZW5ndGggPT09IDA7XG4gICAgfSwgZW1wdHlMZXZlbCwgW1tdLFtdXSldO1xufTtcblxuZnVuY3Rpb24gZGVzZXJpYWxpemVHZXN0YWx0KHIsIGRlc2VyaWFsaXplU3VjY2Vzcykge1xuICAgIGlmICh0eXBlb2YgZGVzZXJpYWxpemVTdWNjZXNzID09PSAndW5kZWZpbmVkJykge1xuXHRkZXNlcmlhbGl6ZVN1Y2Nlc3MgPSBmdW5jdGlvbiAodikgeyByZXR1cm4gdiA9PT0gdHJ1ZSA/IHRydWUgOiBhcnJheVRvU2V0KHYpOyB9O1xuICAgIH1cbiAgICBpZiAoclswXSAhPT0gXCJnZXN0YWx0XCIpIGRpZShcIkludmFsaWQgZ2VzdGFsdCBzZXJpYWxpemF0aW9uOiBcIiArIHIpO1xuICAgIHJldHVybiBuZXcgR2VzdGFsdChtYXBMZXZlbHMoclsxXSwgZnVuY3Rpb24gKHByKSB7XG5cdHJldHVybiBuZXcgR2VzdGFsdExldmVsKGRlc2VyaWFsaXplTWF0Y2hlcihwclswXSwgZGVzZXJpYWxpemVTdWNjZXNzKSxcblx0XHRcdFx0ZGVzZXJpYWxpemVNYXRjaGVyKHByWzFdLCBkZXNlcmlhbGl6ZVN1Y2Nlc3MpKTtcbiAgICB9LCBmdW5jdGlvbiAocCkge1xuXHRyZXR1cm4gcC5pc0VtcHR5KCk7XG4gICAgfSwgW1tdLFtdXSwgZW1wdHlMZXZlbCkpO1xufVxuXG4vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cblxubW9kdWxlLmV4cG9ydHMuX18gPSBfXztcbm1vZHVsZS5leHBvcnRzLmFycmF5VG9TZXQgPSBhcnJheVRvU2V0O1xubW9kdWxlLmV4cG9ydHMuc2V0VG9BcnJheSA9IHNldFRvQXJyYXk7XG5tb2R1bGUuZXhwb3J0cy5zZXRVbmlvbiA9IHNldFVuaW9uO1xubW9kdWxlLmV4cG9ydHMuc2V0U3VidHJhY3QgPSBzZXRTdWJ0cmFjdDtcbm1vZHVsZS5leHBvcnRzLnNldEludGVyc2VjdCA9IHNldEludGVyc2VjdDtcbm1vZHVsZS5leHBvcnRzLnNldEVxdWFsID0gc2V0RXF1YWw7XG5tb2R1bGUuZXhwb3J0cy5pc19lbXB0eVNldCA9IGlzX2VtcHR5U2V0O1xubW9kdWxlLmV4cG9ydHMuJENhcHR1cmUgPSAkQ2FwdHVyZTtcbm1vZHVsZS5leHBvcnRzLl8kID0gXyQ7XG5tb2R1bGUuZXhwb3J0cy5pc19lbXB0eU1hdGNoZXIgPSBpc19lbXB0eU1hdGNoZXI7XG5tb2R1bGUuZXhwb3J0cy5lbXB0eU1hdGNoZXIgPSBlbXB0eU1hdGNoZXI7XG5tb2R1bGUuZXhwb3J0cy5lbWJlZGRlZE1hdGNoZXIgPSBlbWJlZGRlZE1hdGNoZXI7XG5tb2R1bGUuZXhwb3J0cy5jb21waWxlUGF0dGVybiA9IGNvbXBpbGVQYXR0ZXJuO1xubW9kdWxlLmV4cG9ydHMubWF0Y2hQYXR0ZXJuID0gbWF0Y2hQYXR0ZXJuO1xubW9kdWxlLmV4cG9ydHMudW5pb24gPSB1bmlvbk47XG5tb2R1bGUuZXhwb3J0cy5pbnRlcnNlY3QgPSBpbnRlcnNlY3Q7XG5tb2R1bGUuZXhwb3J0cy5lcmFzZVBhdGggPSBlcmFzZVBhdGg7XG5tb2R1bGUuZXhwb3J0cy5tYXRjaFZhbHVlID0gbWF0Y2hWYWx1ZTtcbm1vZHVsZS5leHBvcnRzLm1hdGNoTWF0Y2hlciA9IG1hdGNoTWF0Y2hlcjtcbm1vZHVsZS5leHBvcnRzLmFwcGVuZE1hdGNoZXIgPSBhcHBlbmRNYXRjaGVyO1xubW9kdWxlLmV4cG9ydHMucmVsYWJlbCA9IHJlbGFiZWw7XG5tb2R1bGUuZXhwb3J0cy5jb21waWxlUHJvamVjdGlvbiA9IGNvbXBpbGVQcm9qZWN0aW9uO1xubW9kdWxlLmV4cG9ydHMucHJvamVjdGlvblRvUGF0dGVybiA9IHByb2plY3Rpb25Ub1BhdHRlcm47XG5tb2R1bGUuZXhwb3J0cy5wcm9qZWN0ID0gcHJvamVjdDtcbm1vZHVsZS5leHBvcnRzLm1hdGNoZXJLZXlzID0gbWF0Y2hlcktleXM7XG5tb2R1bGUuZXhwb3J0cy5tYXRjaGVyS2V5c1RvT2JqZWN0cyA9IG1hdGNoZXJLZXlzVG9PYmplY3RzO1xubW9kdWxlLmV4cG9ydHMucHJvamVjdE9iamVjdHMgPSBwcm9qZWN0T2JqZWN0cztcbm1vZHVsZS5leHBvcnRzLm1hdGNoZXJFcXVhbHMgPSBtYXRjaGVyRXF1YWxzO1xubW9kdWxlLmV4cG9ydHMucHJldHR5TWF0Y2hlciA9IHByZXR0eU1hdGNoZXI7XG5tb2R1bGUuZXhwb3J0cy5zZXJpYWxpemVNYXRjaGVyID0gc2VyaWFsaXplTWF0Y2hlcjtcbm1vZHVsZS5leHBvcnRzLmRlc2VyaWFsaXplTWF0Y2hlciA9IGRlc2VyaWFsaXplTWF0Y2hlcjtcblxubW9kdWxlLmV4cG9ydHMuR2VzdGFsdExldmVsID0gR2VzdGFsdExldmVsO1xubW9kdWxlLmV4cG9ydHMuR2VzdGFsdCA9IEdlc3RhbHQ7XG5tb2R1bGUuZXhwb3J0cy5zaW1wbGVHZXN0YWx0ID0gc2ltcGxlR2VzdGFsdDtcbm1vZHVsZS5leHBvcnRzLmVtcHR5R2VzdGFsdCA9IGVtcHR5R2VzdGFsdDtcbm1vZHVsZS5leHBvcnRzLmZ1bGxHZXN0YWx0ID0gZnVsbEdlc3RhbHQ7XG5tb2R1bGUuZXhwb3J0cy5nZXN0YWx0VW5pb24gPSBnZXN0YWx0VW5pb247XG5tb2R1bGUuZXhwb3J0cy5kZXNlcmlhbGl6ZUdlc3RhbHQgPSBkZXNlcmlhbGl6ZUdlc3RhbHQ7XG4iLCJ2YXIgTWluaW1hcnQgPSByZXF1aXJlKFwiLi9taW5pbWFydC5qc1wiKTtcbnZhciBSb3V0ZSA9IE1pbmltYXJ0LlJvdXRlO1xudmFyIFdvcmxkID0gTWluaW1hcnQuV29ybGQ7XG52YXIgc3ViID0gTWluaW1hcnQuc3ViO1xudmFyIHB1YiA9IE1pbmltYXJ0LnB1YjtcbnZhciBfXyA9IE1pbmltYXJ0Ll9fO1xuXG5mdW5jdGlvbiBzcGF3blJvdXRpbmdUYWJsZVdpZGdldChzZWxlY3RvciwgZnJhZ21lbnRDbGFzcywgZG9tV3JhcCwgb2JzZXJ2YXRpb25MZXZlbCkge1xuICAgIG9ic2VydmF0aW9uTGV2ZWwgPSBvYnNlcnZhdGlvbkxldmVsIHx8IDEwO1xuICAgIC8vIF4gYXJiaXRyYXJ5OiBzaG91bGQgYmUgSW5maW5pdHksIHdoZW4gcm91dGUuanMgc3VwcG9ydHMgaXQuIFRPRE9cbiAgICBkb21XcmFwID0gZG9tV3JhcCB8fCBNaW5pbWFydC5ET00uZGVmYXVsdFdyYXBGdW5jdGlvbjtcblxuICAgIFdvcmxkLnNwYXduKHtcblx0Ym9vdDogZnVuY3Rpb24gKCkgeyB0aGlzLnVwZGF0ZVN0YXRlKCk7IH0sXG5cblx0c3RhdGU6IFJvdXRlLmVtcHR5R2VzdGFsdC5zZXJpYWxpemUoKSxcblx0bmV4dFN0YXRlOiBSb3V0ZS5lbXB0eUdlc3RhbHQuc2VyaWFsaXplKCksXG5cdHRpbWVyOiBmYWxzZSxcblxuXHRsb2NhbEdlc3RhbHQ6IChzdWIoICAgICAgIGRvbVdyYXAoc2VsZWN0b3IsIGZyYWdtZW50Q2xhc3MsIF9fKSwgMCwgMilcblx0XHQgICAgICAgLnVuaW9uKHB1Yihkb21XcmFwKHNlbGVjdG9yLCBmcmFnbWVudENsYXNzLCBfXyksIDAsIDIpKVxuXHRcdCAgICAgICAudGVsZXNjb3BlZCgpKSxcblxuXHRkaWdlc3RHZXN0YWx0OiBmdW5jdGlvbiAoZykge1xuXHQgICAgcmV0dXJuIGcuc3RyaXBMYWJlbCgpLmVyYXNlUGF0aCh0aGlzLmxvY2FsR2VzdGFsdCkuc2VyaWFsaXplKCk7XG5cdH0sXG5cblx0dXBkYXRlU3RhdGU6IGZ1bmN0aW9uICgpIHtcblx0ICAgIHZhciBlbHRzID0gW1wicHJlXCIsIFJvdXRlLmRlc2VyaWFsaXplR2VzdGFsdCh0aGlzLnN0YXRlKS5wcmV0dHkoKV07XG5cdCAgICBXb3JsZC51cGRhdGVSb3V0ZXMoW3N1YihfXywgMCwgb2JzZXJ2YXRpb25MZXZlbCksXG5cdFx0XHRcdHB1YihfXywgMCwgb2JzZXJ2YXRpb25MZXZlbCksXG5cdFx0XHRcdHB1Yihkb21XcmFwKHNlbGVjdG9yLCBmcmFnbWVudENsYXNzLCBlbHRzKSldKTtcblx0fSxcblxuXHRoYW5kbGVFdmVudDogZnVuY3Rpb24gKGUpIHtcblx0ICAgIHZhciBzZWxmID0gdGhpcztcblx0ICAgIGlmIChlLnR5cGUgPT09IFwicm91dGVzXCIpIHtcblx0XHRzZWxmLm5leHRTdGF0ZSA9IHNlbGYuZGlnZXN0R2VzdGFsdChlLmdlc3RhbHQpO1xuXHRcdGlmIChzZWxmLnRpbWVyKSB7XG5cdFx0ICAgIGNsZWFyVGltZW91dChzZWxmLnRpbWVyKTtcblx0XHQgICAgc2VsZi50aW1lciA9IGZhbHNlO1xuXHRcdH1cblx0XHRzZWxmLnRpbWVyID0gc2V0VGltZW91dChXb3JsZC53cmFwKGZ1bmN0aW9uICgpIHtcblx0XHQgICAgaWYgKEpTT04uc3RyaW5naWZ5KHNlbGYubmV4dFN0YXRlKSAhPT0gSlNPTi5zdHJpbmdpZnkoc2VsZi5zdGF0ZSkpIHtcblx0XHRcdHNlbGYuc3RhdGUgPSBzZWxmLm5leHRTdGF0ZTtcblx0XHRcdHNlbGYudXBkYXRlU3RhdGUoKTtcblx0XHQgICAgfVxuXHRcdCAgICBzZWxmLnRpbWVyID0gZmFsc2U7XG5cdFx0fSksIDUwKTtcblx0ICAgIH1cblx0fVxuICAgIH0pO1xuXG59XG5cbm1vZHVsZS5leHBvcnRzLnNwYXduUm91dGluZ1RhYmxlV2lkZ2V0ID0gc3Bhd25Sb3V0aW5nVGFibGVXaWRnZXQ7XG4iLCIvLyBHZW5lcmljIFNweVxudmFyIE1pbmltYXJ0ID0gcmVxdWlyZShcIi4vbWluaW1hcnQuanNcIik7XG52YXIgV29ybGQgPSBNaW5pbWFydC5Xb3JsZDtcbnZhciBzdWIgPSBNaW5pbWFydC5zdWI7XG52YXIgcHViID0gTWluaW1hcnQucHViO1xudmFyIF9fID0gTWluaW1hcnQuX187XG5cbmZ1bmN0aW9uIFNweShsYWJlbCwgdXNlSnNvbiwgb2JzZXJ2YXRpb25MZXZlbCkge1xuICAgIHRoaXMubGFiZWwgPSBsYWJlbCB8fCBcIlNQWVwiO1xuICAgIHRoaXMub2JzZXJ2YXRpb25MZXZlbCA9IG9ic2VydmF0aW9uTGV2ZWwgfHwgMTA7IC8vIGFyYml0cmFyeS4gU2hvdWxkIGJlIEluZmluaXR5LiBUT0RPXG4gICAgdGhpcy51c2VKc29uID0gdXNlSnNvbjtcbn1cblxuU3B5LnByb3RvdHlwZS5ib290ID0gZnVuY3Rpb24gKCkge1xuICAgIFdvcmxkLnVwZGF0ZVJvdXRlcyhbc3ViKF9fLCAwLCB0aGlzLm9ic2VydmF0aW9uTGV2ZWwpLCBwdWIoX18sIDAsIHRoaXMub2JzZXJ2YXRpb25MZXZlbCldKTtcbn07XG5cblNweS5wcm90b3R5cGUuaGFuZGxlRXZlbnQgPSBmdW5jdGlvbiAoZSkge1xuICAgIHN3aXRjaCAoZS50eXBlKSB7XG4gICAgY2FzZSBcInJvdXRlc1wiOlxuXHRjb25zb2xlLmxvZyh0aGlzLmxhYmVsLCBcInJvdXRlc1wiLCBlLmdlc3RhbHQucHJldHR5KCkpO1xuXHRicmVhaztcbiAgICBjYXNlIFwibWVzc2FnZVwiOlxuXHR2YXIgbWVzc2FnZVJlcHI7XG5cdHRyeSB7XG5cdCAgICBtZXNzYWdlUmVwciA9IHRoaXMudXNlSnNvbiA/IEpTT04uc3RyaW5naWZ5KGUubWVzc2FnZSkgOiBlLm1lc3NhZ2U7XG5cdH0gY2F0Y2ggKGV4bikge1xuXHQgICAgbWVzc2FnZVJlcHIgPSBlLm1lc3NhZ2U7XG5cdH1cblx0Y29uc29sZS5sb2codGhpcy5sYWJlbCwgXCJtZXNzYWdlXCIsIG1lc3NhZ2VSZXByLCBlLm1ldGFMZXZlbCwgZS5pc0ZlZWRiYWNrKTtcblx0YnJlYWs7XG4gICAgZGVmYXVsdDpcblx0Y29uc29sZS5sb2codGhpcy5sYWJlbCwgXCJ1bmtub3duXCIsIGUpO1xuXHRicmVhaztcbiAgICB9XG59O1xuXG5tb2R1bGUuZXhwb3J0cy5TcHkgPSBTcHk7XG4iLCIvLyBNaW5pbWFsIGpRdWVyeWlzaCB1dGlsaXRpZXMuIFJlaW1wbGVtZW50ZWQgYmVjYXVzZSBqUXVlcnkgbmVlZHNcbi8vIHdpbmRvdyB0byBleGlzdCwgYW5kIHdlIHdhbnQgdG8gcnVuIGluIFdlYiBXb3JrZXIgY29udGV4dCBhcyB3ZWxsLlxuXG5mdW5jdGlvbiBleHRlbmQod2hhdCwgX3dpdGgpIHtcbiAgZm9yICh2YXIgcHJvcCBpbiBfd2l0aCkge1xuICAgIGlmIChfd2l0aC5oYXNPd25Qcm9wZXJ0eShwcm9wKSkge1xuICAgICAgd2hhdFtwcm9wXSA9IF93aXRoW3Byb3BdO1xuICAgIH1cbiAgfVxuICByZXR1cm4gd2hhdDtcbn1cblxubW9kdWxlLmV4cG9ydHMuZXh0ZW5kID0gZXh0ZW5kO1xuIiwiLy8gV2FrZSBkZXRlY3RvciAtIG5vdGljZXMgd2hlbiBzb21ldGhpbmcgKHN1Y2ggYXNcbi8vIHN1c3BlbnNpb24vc2xlZXBpbmchKSBoYXMgY2F1c2VkIHBlcmlvZGljIGFjdGl2aXRpZXMgdG8gYmVcbi8vIGludGVycnVwdGVkLCBhbmQgd2FybnMgb3RoZXJzIGFib3V0IGl0XG4vLyBJbnNwaXJlZCBieSBodHRwOi8vYmxvZy5hbGV4bWFjY2F3LmNvbS9qYXZhc2NyaXB0LXdha2UtZXZlbnRcbnZhciBNaW5pbWFydCA9IHJlcXVpcmUoXCIuL21pbmltYXJ0LmpzXCIpO1xudmFyIFdvcmxkID0gTWluaW1hcnQuV29ybGQ7XG52YXIgc3ViID0gTWluaW1hcnQuc3ViO1xudmFyIHB1YiA9IE1pbmltYXJ0LnB1YjtcbnZhciBfXyA9IE1pbmltYXJ0Ll9fO1xuXG5mdW5jdGlvbiBXYWtlRGV0ZWN0b3IocGVyaW9kKSB7XG4gICAgdGhpcy5tZXNzYWdlID0gXCJ3YWtlXCI7XG4gICAgdGhpcy5wZXJpb2QgPSBwZXJpb2QgfHwgMTAwMDA7XG4gICAgdGhpcy5tb3N0UmVjZW50VHJpZ2dlciA9ICsobmV3IERhdGUoKSk7XG4gICAgdGhpcy50aW1lcklkID0gbnVsbDtcbn1cblxuV2FrZURldGVjdG9yLnByb3RvdHlwZS5ib290ID0gZnVuY3Rpb24gKCkge1xuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICBXb3JsZC51cGRhdGVSb3V0ZXMoW3B1Yih0aGlzLm1lc3NhZ2UpXSk7XG4gICAgdGhpcy50aW1lcklkID0gc2V0SW50ZXJ2YWwoV29ybGQud3JhcChmdW5jdGlvbiAoKSB7IHNlbGYudHJpZ2dlcigpOyB9KSwgdGhpcy5wZXJpb2QpO1xufTtcblxuV2FrZURldGVjdG9yLnByb3RvdHlwZS5oYW5kbGVFdmVudCA9IGZ1bmN0aW9uIChlKSB7fTtcblxuV2FrZURldGVjdG9yLnByb3RvdHlwZS50cmlnZ2VyID0gZnVuY3Rpb24gKCkge1xuICAgIHZhciBub3cgPSArKG5ldyBEYXRlKCkpO1xuICAgIGlmIChub3cgLSB0aGlzLm1vc3RSZWNlbnRUcmlnZ2VyID4gdGhpcy5wZXJpb2QgKiAxLjUpIHtcblx0V29ybGQuc2VuZCh0aGlzLm1lc3NhZ2UpO1xuICAgIH1cbiAgICB0aGlzLm1vc3RSZWNlbnRUcmlnZ2VyID0gbm93O1xufTtcblxubW9kdWxlLmV4cG9ydHMuV2FrZURldGVjdG9yID0gV2FrZURldGVjdG9yO1xuIiwidmFyIE1pbmltYXJ0ID0gcmVxdWlyZShcIi4vbWluaW1hcnQuanNcIik7XG52YXIgQ29kZWMgPSByZXF1aXJlKFwiLi9jb2RlYy5qc1wiKTtcbnZhciBSb3V0ZSA9IE1pbmltYXJ0LlJvdXRlO1xudmFyIFdvcmxkID0gTWluaW1hcnQuV29ybGQ7XG52YXIgc3ViID0gTWluaW1hcnQuc3ViO1xudmFyIHB1YiA9IE1pbmltYXJ0LnB1YjtcbnZhciBfXyA9IE1pbmltYXJ0Ll9fO1xudmFyIF8kID0gTWluaW1hcnQuXyQ7XG5cbi8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuLy8gV2ViU29ja2V0IGNsaWVudCBkcml2ZXJcblxudmFyIERFRkFVTFRfUkVDT05ORUNUX0RFTEFZID0gMTAwO1xudmFyIE1BWF9SRUNPTk5FQ1RfREVMQVkgPSAzMDAwMDtcbnZhciBERUZBVUxUX0lETEVfVElNRU9VVCA9IDMwMDAwMDsgLy8gNSBtaW51dGVzXG52YXIgREVGQVVMVF9QSU5HX0lOVEVSVkFMID0gREVGQVVMVF9JRExFX1RJTUVPVVQgLSAxMDAwMDtcblxuZnVuY3Rpb24gV2ViU29ja2V0Q29ubmVjdGlvbihsYWJlbCwgd3N1cmwsIHNob3VsZFJlY29ubmVjdCkge1xuICAgIHRoaXMubGFiZWwgPSBsYWJlbDtcbiAgICB0aGlzLnNlbmRzQXR0ZW1wdGVkID0gMDtcbiAgICB0aGlzLnNlbmRzVHJhbnNtaXR0ZWQgPSAwO1xuICAgIHRoaXMucmVjZWl2ZUNvdW50ID0gMDtcbiAgICB0aGlzLnNvY2sgPSBudWxsO1xuICAgIHRoaXMud3N1cmwgPSB3c3VybDtcbiAgICB0aGlzLnNob3VsZFJlY29ubmVjdCA9IHNob3VsZFJlY29ubmVjdCA/IHRydWUgOiBmYWxzZTtcbiAgICB0aGlzLnJlY29ubmVjdERlbGF5ID0gREVGQVVMVF9SRUNPTk5FQ1RfREVMQVk7XG4gICAgdGhpcy5sb2NhbEdlc3RhbHQgPSBSb3V0ZS5lbXB0eUdlc3RhbHQ7XG4gICAgdGhpcy5wZWVyR2VzdGFsdCA9IFJvdXRlLmVtcHR5R2VzdGFsdDtcbiAgICB0aGlzLnByZXZMb2NhbFJvdXRlc01lc3NhZ2UgPSBudWxsO1xuICAgIHRoaXMucHJldlBlZXJSb3V0ZXNNZXNzYWdlID0gbnVsbDtcbiAgICB0aGlzLmRlZHVwbGljYXRvciA9IG5ldyBNaW5pbWFydC5EZWR1cGxpY2F0b3IoKTtcbiAgICB0aGlzLmNvbm5lY3Rpb25Db3VudCA9IDA7XG5cbiAgICB0aGlzLmFjdGl2aXR5VGltZXN0YW1wID0gMDtcbiAgICB0aGlzLmlkbGVUaW1lb3V0ID0gREVGQVVMVF9JRExFX1RJTUVPVVQ7XG4gICAgdGhpcy5waW5nSW50ZXJ2YWwgPSBERUZBVUxUX1BJTkdfSU5URVJWQUw7XG4gICAgdGhpcy5pZGxlVGltZXIgPSBudWxsO1xuICAgIHRoaXMucGluZ1RpbWVyID0gbnVsbDtcbn1cblxuV2ViU29ja2V0Q29ubmVjdGlvbi5wcm90b3R5cGUuZGVidWdTdGF0ZSA9IGZ1bmN0aW9uICgpIHtcbiAgcmV0dXJuIHtcbiAgICBsYWJlbDogdGhpcy5sYWJlbCxcbiAgICBzZW5kc0F0dGVtcHRlZDogdGhpcy5zZW5kc0F0dGVtcHRlZCxcbiAgICBzZW5kc1RyYW5zbWl0dGVkOiB0aGlzLnNlbmRzVHJhbnNtaXR0ZWQsXG4gICAgcmVjZWl2ZUNvdW50OiB0aGlzLnJlY2VpdmVDb3VudCxcbiAgICB3c3VybDogdGhpcy53c3VybCxcbiAgICBzaG91bGRSZWNvbm5lY3Q6IHRoaXMuc2hvdWxkUmVjb25uZWN0LFxuICAgIHJlY29ubmVjdERlbGF5OiB0aGlzLnJlY29ubmVjdERlbGF5LFxuICAgIGNvbm5lY3Rpb25Db3VudDogdGhpcy5jb25uZWN0aW9uQ291bnQsXG4gICAgYWN0aXZpdHlUaW1lc3RhbXA6IHRoaXMuYWN0aXZpdHlUaW1lc3RhbXBcbiAgfTtcbn07XG5cbldlYlNvY2tldENvbm5lY3Rpb24ucHJvdG90eXBlLmNsZWFySGVhcnRiZWF0VGltZXJzID0gZnVuY3Rpb24gKCkge1xuICAgIGlmICh0aGlzLmlkbGVUaW1lcikgeyBjbGVhclRpbWVvdXQodGhpcy5pZGxlVGltZXIpOyB0aGlzLmlkbGVUaW1lciA9IG51bGw7IH1cbiAgICBpZiAodGhpcy5waW5nVGltZXIpIHsgY2xlYXJUaW1lb3V0KHRoaXMucGluZ1RpbWVyKTsgdGhpcy5waW5nVGltZXIgPSBudWxsOyB9XG59O1xuXG5XZWJTb2NrZXRDb25uZWN0aW9uLnByb3RvdHlwZS5yZWNvcmRBY3Rpdml0eSA9IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgdGhpcy5hY3Rpdml0eVRpbWVzdGFtcCA9ICsobmV3IERhdGUoKSk7XG4gICAgdGhpcy5jbGVhckhlYXJ0YmVhdFRpbWVycygpO1xuICAgIHRoaXMuaWRsZVRpbWVyID0gc2V0VGltZW91dChmdW5jdGlvbiAoKSB7IHNlbGYuZm9yY2VjbG9zZSgpOyB9LFxuXHRcdFx0XHR0aGlzLmlkbGVUaW1lb3V0KTtcbiAgICB0aGlzLnBpbmdUaW1lciA9IHNldFRpbWVvdXQoZnVuY3Rpb24gKCkgeyBzZWxmLnNhZmVTZW5kKEpTT04uc3RyaW5naWZ5KFwicGluZ1wiKSkgfSxcblx0XHRcdFx0dGhpcy5waW5nSW50ZXJ2YWwpO1xufTtcblxuV2ViU29ja2V0Q29ubmVjdGlvbi5wcm90b3R5cGUuc3RhdHVzUm91dGUgPSBmdW5jdGlvbiAoc3RhdHVzKSB7XG4gICAgcmV0dXJuIHB1YihbdGhpcy5sYWJlbCArIFwiX3N0YXRlXCIsIHN0YXR1c10pO1xufTtcblxuV2ViU29ja2V0Q29ubmVjdGlvbi5wcm90b3R5cGUucmVsYXlHZXN0YWx0ID0gZnVuY3Rpb24gKCkge1xuICAgIHJldHVybiB0aGlzLnN0YXR1c1JvdXRlKHRoaXMuaXNDb25uZWN0ZWQoKSA/IFwiY29ubmVjdGVkXCIgOiBcImRpc2Nvbm5lY3RlZFwiKVxuXHQudW5pb24ocHViKFt0aGlzLmxhYmVsLCBfXywgX19dLCAwLCAxMCkpXG5cdC51bmlvbihzdWIoW3RoaXMubGFiZWwsIF9fLCBfX10sIDAsIDEwKSk7XG4gICAgLy8gVE9ETzogbGV2ZWwgMTAgaXMgYWQtaG9jOyBzdXBwb3J0IGluZmluaXR5IGF0IHNvbWUgcG9pbnQgaW4gZnV0dXJlXG59O1xuXG5XZWJTb2NrZXRDb25uZWN0aW9uLnByb3RvdHlwZS5hZ2dyZWdhdGVHZXN0YWx0ID0gZnVuY3Rpb24gKCkge1xuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICByZXR1cm4gdGhpcy5wZWVyR2VzdGFsdC50cmFuc2Zvcm0oZnVuY3Rpb24gKG0sIG1ldGFMZXZlbCkge1xuXHRyZXR1cm4gUm91dGUuY29tcGlsZVBhdHRlcm4odHJ1ZSxcblx0XHRcdFx0ICAgIFtzZWxmLmxhYmVsLCBtZXRhTGV2ZWwsIFJvdXRlLmVtYmVkZGVkTWF0Y2hlcihtKV0pO1xuICAgIH0pLnVuaW9uKHRoaXMucmVsYXlHZXN0YWx0KCkpO1xufTtcblxuV2ViU29ja2V0Q29ubmVjdGlvbi5wcm90b3R5cGUuYm9vdCA9IGZ1bmN0aW9uICgpIHtcbiAgICB0aGlzLnJlY29ubmVjdCgpO1xufTtcblxuV2ViU29ja2V0Q29ubmVjdGlvbi5wcm90b3R5cGUudHJhcGV4aXQgPSBmdW5jdGlvbiAoKSB7XG4gICAgdGhpcy5mb3JjZWNsb3NlKCk7XG59O1xuXG5XZWJTb2NrZXRDb25uZWN0aW9uLnByb3RvdHlwZS5pc0Nvbm5lY3RlZCA9IGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4gdGhpcy5zb2NrICYmIHRoaXMuc29jay5yZWFkeVN0YXRlID09PSB0aGlzLnNvY2suT1BFTjtcbn07XG5cbldlYlNvY2tldENvbm5lY3Rpb24ucHJvdG90eXBlLnNhZmVTZW5kID0gZnVuY3Rpb24gKG0pIHtcbiAgICB0cnkge1xuXHR0aGlzLnNlbmRzQXR0ZW1wdGVkKys7XG5cdGlmICh0aGlzLmlzQ29ubmVjdGVkKCkpIHtcblx0ICAgIHRoaXMuc29jay5zZW5kKG0pO1xuXHQgICAgdGhpcy5zZW5kc1RyYW5zbWl0dGVkKys7XG5cdH1cbiAgICB9IGNhdGNoIChlKSB7XG5cdGNvbnNvbGUud2FybihcIlRyYXBwZWQgZXhuIHdoaWxlIHNlbmRpbmdcIiwgZSk7XG4gICAgfVxufTtcblxuV2ViU29ja2V0Q29ubmVjdGlvbi5wcm90b3R5cGUuc2VuZExvY2FsUm91dGVzID0gZnVuY3Rpb24gKCkge1xuICAgIHZhciBuZXdMb2NhbFJvdXRlc01lc3NhZ2UgPVxuXHRKU09OLnN0cmluZ2lmeShDb2RlYy5lbmNvZGVFdmVudChNaW5pbWFydC51cGRhdGVSb3V0ZXMoW3RoaXMubG9jYWxHZXN0YWx0XSkpKTtcbiAgICBpZiAodGhpcy5wcmV2TG9jYWxSb3V0ZXNNZXNzYWdlICE9PSBuZXdMb2NhbFJvdXRlc01lc3NhZ2UpIHtcblx0dGhpcy5wcmV2TG9jYWxSb3V0ZXNNZXNzYWdlID0gbmV3TG9jYWxSb3V0ZXNNZXNzYWdlO1xuXHR0aGlzLnNhZmVTZW5kKG5ld0xvY2FsUm91dGVzTWVzc2FnZSk7XG4gICAgfVxufTtcblxuV2ViU29ja2V0Q29ubmVjdGlvbi5wcm90b3R5cGUuY29sbGVjdE1hdGNoZXJzID0gZnVuY3Rpb24gKGdldEFkdmVydGlzZW1lbnRzLCBsZXZlbCwgZykge1xuICAgIHZhciBleHRyYWN0TWV0YUxldmVscyA9IFJvdXRlLmNvbXBpbGVQcm9qZWN0aW9uKFt0aGlzLmxhYmVsLCBfJCwgX19dKTtcbiAgICB2YXIgbWxzID0gUm91dGUubWF0Y2hlcktleXMoZy5wcm9qZWN0KGV4dHJhY3RNZXRhTGV2ZWxzLCBnZXRBZHZlcnRpc2VtZW50cywgMCwgbGV2ZWwpKTtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IG1scy5sZW5ndGg7IGkrKykge1xuXHR2YXIgbWV0YUxldmVsID0gbWxzW2ldWzBdOyAvLyBvbmx5IG9uZSBjYXB0dXJlIGluIHRoZSBwcm9qZWN0aW9uXG5cdHZhciBleHRyYWN0TWF0Y2hlcnMgPSBSb3V0ZS5jb21waWxlUHJvamVjdGlvbihbdGhpcy5sYWJlbCwgbWV0YUxldmVsLCBfJF0pO1xuXHR2YXIgbSA9IGcucHJvamVjdChleHRyYWN0TWF0Y2hlcnMsIGdldEFkdmVydGlzZW1lbnRzLCAwLCBsZXZlbCk7XG5cdHRoaXMubG9jYWxHZXN0YWx0ID0gdGhpcy5sb2NhbEdlc3RhbHQudW5pb24oUm91dGUuc2ltcGxlR2VzdGFsdChnZXRBZHZlcnRpc2VtZW50cyxcblx0XHRcdFx0XHRcdFx0XHRcdFJvdXRlLmVtYmVkZGVkTWF0Y2hlcihtKSxcblx0XHRcdFx0XHRcdFx0XHRcdG1ldGFMZXZlbCxcblx0XHRcdFx0XHRcdFx0XHRcdGxldmVsKSk7XG4gICAgfVxufTtcblxuV2ViU29ja2V0Q29ubmVjdGlvbi5wcm90b3R5cGUuaGFuZGxlRXZlbnQgPSBmdW5jdGlvbiAoZSkge1xuICAgIC8vIGNvbnNvbGUubG9nKFwiV2ViU29ja2V0Q29ubmVjdGlvbi5oYW5kbGVFdmVudFwiLCBlKTtcbiAgICBzd2l0Y2ggKGUudHlwZSkge1xuICAgIGNhc2UgXCJyb3V0ZXNcIjpcblx0Ly8gVE9ETzogR1JPU1MgLSBlcmFzaW5nIGJ5IHBpZCFcblx0dmFyIG5MZXZlbHMgPSBlLmdlc3RhbHQubGV2ZWxDb3VudCgwKTtcblx0dmFyIHJlbGF5R2VzdGFsdCA9IFJvdXRlLmZ1bGxHZXN0YWx0KDEsIG5MZXZlbHMpLmxhYmVsKFdvcmxkLmFjdGl2ZVBpZCgpKTtcblx0dmFyIGcgPSBlLmdlc3RhbHQuZXJhc2VQYXRoKHJlbGF5R2VzdGFsdCk7XG5cdHRoaXMubG9jYWxHZXN0YWx0ID0gUm91dGUuZW1wdHlHZXN0YWx0O1xuXHRmb3IgKHZhciBsZXZlbCA9IDA7IGxldmVsIDwgbkxldmVsczsgbGV2ZWwrKykge1xuXHQgICAgdGhpcy5jb2xsZWN0TWF0Y2hlcnMoZmFsc2UsIGxldmVsLCBnKTtcblx0ICAgIHRoaXMuY29sbGVjdE1hdGNoZXJzKHRydWUsIGxldmVsLCBnKTtcblx0fVxuXG5cdHRoaXMuc2VuZExvY2FsUm91dGVzKCk7XG5cdGJyZWFrO1xuICAgIGNhc2UgXCJtZXNzYWdlXCI6XG5cdHZhciBtID0gZS5tZXNzYWdlO1xuXHRpZiAobS5sZW5ndGggJiYgbS5sZW5ndGggPT09IDMgJiYgbVswXSA9PT0gdGhpcy5sYWJlbClcblx0e1xuXHQgICAgdmFyIGVuY29kZWQgPSBKU09OLnN0cmluZ2lmeShDb2RlYy5lbmNvZGVFdmVudChcblx0XHRNaW5pbWFydC5zZW5kTWVzc2FnZShtWzJdLCBtWzFdLCBlLmlzRmVlZGJhY2spKSk7XG5cdCAgICBpZiAodGhpcy5kZWR1cGxpY2F0b3IuYWNjZXB0KGVuY29kZWQpKSB7XG5cdFx0dGhpcy5zYWZlU2VuZChlbmNvZGVkKTtcblx0ICAgIH1cblx0fVxuXHRicmVhaztcbiAgICB9XG59O1xuXG5XZWJTb2NrZXRDb25uZWN0aW9uLnByb3RvdHlwZS5mb3JjZWNsb3NlID0gZnVuY3Rpb24gKGtlZXBSZWNvbm5lY3REZWxheSkge1xuICAgIGlmICgha2VlcFJlY29ubmVjdERlbGF5KSB7XG5cdHRoaXMucmVjb25uZWN0RGVsYXkgPSBERUZBVUxUX1JFQ09OTkVDVF9ERUxBWTtcbiAgICB9XG4gICAgdGhpcy5jbGVhckhlYXJ0YmVhdFRpbWVycygpO1xuICAgIGlmICh0aGlzLnNvY2spIHtcblx0Y29uc29sZS5sb2coXCJXZWJTb2NrZXRDb25uZWN0aW9uLmZvcmNlY2xvc2UgY2FsbGVkXCIpO1xuXHR0aGlzLnNvY2suY2xvc2UoKTtcblx0dGhpcy5zb2NrID0gbnVsbDtcbiAgICB9XG59O1xuXG5XZWJTb2NrZXRDb25uZWN0aW9uLnByb3RvdHlwZS5yZWNvbm5lY3QgPSBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIHRoaXMuZm9yY2VjbG9zZSh0cnVlKTtcbiAgICB0aGlzLmNvbm5lY3Rpb25Db3VudCsrO1xuICAgIHRoaXMuc29jayA9IG5ldyBXZWJTb2NrZXQodGhpcy53c3VybCk7XG4gICAgdGhpcy5zb2NrLm9ub3BlbiA9IFdvcmxkLndyYXAoZnVuY3Rpb24gKGUpIHsgcmV0dXJuIHNlbGYub25vcGVuKGUpOyB9KTtcbiAgICB0aGlzLnNvY2sub25tZXNzYWdlID0gV29ybGQud3JhcChmdW5jdGlvbiAoZSkge1xuXHRzZWxmLnJlY2VpdmVDb3VudCsrO1xuXHRyZXR1cm4gc2VsZi5vbm1lc3NhZ2UoZSk7XG4gICAgfSk7XG4gICAgdGhpcy5zb2NrLm9uY2xvc2UgPSBXb3JsZC53cmFwKGZ1bmN0aW9uIChlKSB7IHJldHVybiBzZWxmLm9uY2xvc2UoZSk7IH0pO1xufTtcblxuV2ViU29ja2V0Q29ubmVjdGlvbi5wcm90b3R5cGUub25vcGVuID0gZnVuY3Rpb24gKGUpIHtcbiAgICBjb25zb2xlLmxvZyhcImNvbm5lY3RlZCB0byBcIiArIHRoaXMuc29jay51cmwpO1xuICAgIHRoaXMucmVjb25uZWN0RGVsYXkgPSBERUZBVUxUX1JFQ09OTkVDVF9ERUxBWTtcbiAgICB0aGlzLnByZXZMb2NhbFJvdXRlc01lc3NhZ2UgPSBudWxsO1xuICAgIHRoaXMuc2VuZExvY2FsUm91dGVzKCk7XG59O1xuXG5XZWJTb2NrZXRDb25uZWN0aW9uLnByb3RvdHlwZS5vbm1lc3NhZ2UgPSBmdW5jdGlvbiAod3NlKSB7XG4gICAgLy8gY29uc29sZS5sb2coXCJvbm1lc3NhZ2VcIiwgd3NlKTtcbiAgICB0aGlzLnJlY29yZEFjdGl2aXR5KCk7XG5cbiAgICB2YXIgaiA9IEpTT04ucGFyc2Uod3NlLmRhdGEpO1xuICAgIGlmIChqID09PSBcInBpbmdcIikge1xuXHR0aGlzLnNhZmVTZW5kKEpTT04uc3RyaW5naWZ5KFwicG9uZ1wiKSk7XG5cdHJldHVybjtcbiAgICB9IGVsc2UgaWYgKGogPT09IFwicG9uZ1wiKSB7XG5cdHJldHVybjsgLy8gcmVjb3JkQWN0aXZpdHkgYWxyZWFkeSB0b29rIGNhcmUgb2Ygb3VyIHRpbWVyc1xuICAgIH1cblxuICAgIHZhciBlID0gQ29kZWMuZGVjb2RlQWN0aW9uKGopO1xuICAgIHN3aXRjaCAoZS50eXBlKSB7XG4gICAgY2FzZSBcInJvdXRlc1wiOlxuXHRpZiAodGhpcy5wcmV2UGVlclJvdXRlc01lc3NhZ2UgIT09IHdzZS5kYXRhKSB7XG5cdCAgICB0aGlzLnByZXZQZWVyUm91dGVzTWVzc2FnZSA9IHdzZS5kYXRhO1xuXHQgICAgdGhpcy5wZWVyR2VzdGFsdCA9IGUuZ2VzdGFsdDtcblx0ICAgIFdvcmxkLnVwZGF0ZVJvdXRlcyhbdGhpcy5hZ2dyZWdhdGVHZXN0YWx0KCldKTtcblx0fVxuXHRicmVhaztcbiAgICBjYXNlIFwibWVzc2FnZVwiOlxuXHRpZiAodGhpcy5kZWR1cGxpY2F0b3IuYWNjZXB0KHdzZS5kYXRhKSkge1xuXHQgICAgV29ybGQuc2VuZChbdGhpcy5sYWJlbCwgZS5tZXRhTGV2ZWwsIGUubWVzc2FnZV0sIDAsIGUuaXNGZWVkYmFjayk7XG5cdH1cblx0YnJlYWs7XG4gICAgfVxufTtcblxuV2ViU29ja2V0Q29ubmVjdGlvbi5wcm90b3R5cGUub25jbG9zZSA9IGZ1bmN0aW9uIChlKSB7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIGNvbnNvbGUubG9nKFwib25jbG9zZVwiLCBlKTtcblxuICAgIC8vIFVwZGF0ZSByb3V0ZXMgdG8gZ2l2ZSBjbGllbnRzIHNvbWUgaW5kaWNhdGlvbiBvZiB0aGUgZGlzY29udGludWl0eVxuICAgIFdvcmxkLnVwZGF0ZVJvdXRlcyhbdGhpcy5hZ2dyZWdhdGVHZXN0YWx0KCldKTtcblxuICAgIGlmICh0aGlzLnNob3VsZFJlY29ubmVjdCkge1xuXHRjb25zb2xlLmxvZyhcInJlY29ubmVjdGluZyB0byBcIiArIHRoaXMud3N1cmwgKyBcIiBpbiBcIiArIHRoaXMucmVjb25uZWN0RGVsYXkgKyBcIm1zXCIpO1xuXHRzZXRUaW1lb3V0KFdvcmxkLndyYXAoZnVuY3Rpb24gKCkgeyBzZWxmLnJlY29ubmVjdCgpOyB9KSwgdGhpcy5yZWNvbm5lY3REZWxheSk7XG5cdHRoaXMucmVjb25uZWN0RGVsYXkgPSB0aGlzLnJlY29ubmVjdERlbGF5ICogMS42MTggKyAoTWF0aC5yYW5kb20oKSAqIDEwMDApO1xuXHR0aGlzLnJlY29ubmVjdERlbGF5ID1cblx0ICAgIHRoaXMucmVjb25uZWN0RGVsYXkgPiBNQVhfUkVDT05ORUNUX0RFTEFZXG5cdCAgICA/IE1BWF9SRUNPTk5FQ1RfREVMQVkgKyAoTWF0aC5yYW5kb20oKSAqIDEwMDApXG5cdCAgICA6IHRoaXMucmVjb25uZWN0RGVsYXk7XG4gICAgfVxufTtcblxuLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXG5cbm1vZHVsZS5leHBvcnRzLldlYlNvY2tldENvbm5lY3Rpb24gPSBXZWJTb2NrZXRDb25uZWN0aW9uO1xuIiwiLyogV2ViIFdvcmtlciBpbnRlcmZhY2UgKi9cbnZhciBHcm91bmQgPSByZXF1aXJlKFwiLi9ncm91bmQuanNcIikuR3JvdW5kO1xudmFyIFV0aWwgPSByZXF1aXJlKFwiLi91dGlsLmpzXCIpO1xudmFyIENvZGVjID0gcmVxdWlyZShcIi4vY29kZWMuanNcIik7XG5cbnZhciBNaW5pbWFydCA9IHJlcXVpcmUoXCIuL21pbmltYXJ0LmpzXCIpO1xudmFyIFdvcmxkID0gTWluaW1hcnQuV29ybGQ7XG52YXIgc3ViID0gTWluaW1hcnQuc3ViO1xudmFyIHB1YiA9IE1pbmltYXJ0LnB1YjtcbnZhciBfXyA9IE1pbmltYXJ0Ll9fO1xuXG52YXIgQnVpbHRpbldvcmtlciA9IHR5cGVvZiB3aW5kb3cgIT09ICd1bmRlZmluZWQnICYmIHdpbmRvdy5Xb3JrZXI7XG5cbi8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuXG5mdW5jdGlvbiBXb3JrZXIoc2NyaXB0VXJsKSB7XG4gIHRoaXMuc2NyaXB0VXJsID0gc2NyaXB0VXJsO1xuICB0aGlzLncgPSBuZXcgQnVpbHRpbldvcmtlcihzY3JpcHRVcmwpO1xufVxuXG5Xb3JrZXIucHJvdG90eXBlLmJvb3QgPSBmdW5jdGlvbiAoKSB7XG4gIHRoaXMudy5vbm1lc3NhZ2UgPSBXb3JsZC53cmFwKGZ1bmN0aW9uIChlKSB7XG4gICAgY29uc29sZS5sb2coXCJSZWNlaXZlZCBmcm9tIHdvcmtlclwiLCBKU09OLnN0cmluZ2lmeShlLmRhdGEpKTtcbiAgICBXb3JsZC5jdXJyZW50KCkuZW5xdWV1ZUFjdGlvbihXb3JsZC5hY3RpdmVQaWQoKSwgQ29kZWMuZGVjb2RlQWN0aW9uKGUuZGF0YSkpO1xuICB9KTtcbn07XG5cbldvcmtlci5wcm90b3R5cGUuaGFuZGxlRXZlbnQgPSBmdW5jdGlvbiAoZSkge1xuICBjb25zb2xlLmxvZyhcIlNlbmRpbmcgdG8gd29ya2VyXCIsIEpTT04uc3RyaW5naWZ5KENvZGVjLmVuY29kZUV2ZW50KGUpKSk7XG4gIHRoaXMudy5wb3N0TWVzc2FnZShDb2RlYy5lbmNvZGVFdmVudChlKSk7XG59O1xuXG4vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cblxuZnVuY3Rpb24gV29ya2VyR3JvdW5kKGJvb3RGbikge1xuICB2YXIgc2VsZiA9IHRoaXM7XG4gIEdyb3VuZC5jYWxsKHRoaXMsIGJvb3RGbik7XG4gIG9ubWVzc2FnZSA9IGZ1bmN0aW9uIChlKSB7XG4gICAgY29uc29sZS5sb2coXCJSZWNlaXZlZCBmcm9tIG1haW4gcGFnZVwiLCBKU09OLnN0cmluZ2lmeShlLmRhdGEpKTtcbiAgICBzZWxmLndvcmxkLmhhbmRsZUV2ZW50KENvZGVjLmRlY29kZUV2ZW50KGUuZGF0YSkpO1xuICAgIHNlbGYuc3RhcnRTdGVwcGluZygpO1xuICB9O1xufVxuXG5Xb3JrZXJHcm91bmQucHJvdG90eXBlID0gVXRpbC5leHRlbmQoe30sIEdyb3VuZC5wcm90b3R5cGUpO1xuXG5Xb3JrZXJHcm91bmQucHJvdG90eXBlLmVucXVldWVBY3Rpb24gPSBmdW5jdGlvbiAocGlkLCBhY3Rpb24pIHtcbiAgY29uc29sZS5sb2coXCJTZW5kaW5nIHRvIG1haW4gcGFnZVwiLCBKU09OLnN0cmluZ2lmeShDb2RlYy5lbmNvZGVBY3Rpb24oYWN0aW9uKSkpO1xuICBwb3N0TWVzc2FnZShDb2RlYy5lbmNvZGVBY3Rpb24oYWN0aW9uKSk7XG4gIGNvbnNvbGUubG9nKFwiU2VudCB0byBtYWluIHBhZ2VcIik7XG59O1xuXG4vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cblxubW9kdWxlLmV4cG9ydHMuV29ya2VyID0gV29ya2VyO1xubW9kdWxlLmV4cG9ydHMuV29ya2VyR3JvdW5kID0gV29ya2VyR3JvdW5kO1xuIl19
(6)
});
