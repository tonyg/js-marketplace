// JQuery event driver
var Minimart = require("./minimart.js");
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
