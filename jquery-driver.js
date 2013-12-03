// JQuery event driver

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

function JQueryEventRouter(selector, eventName) {
    var self = this;
    this.selector = selector;
    this.eventName = eventName;
    this.handler =
	World.wrap(function (e) {
	    World.send(["jQuery", self.selector, self.eventName, e]);
	    e.preventDefault();
	    return false;
	});
    $(this.selector).on(this.eventName, this.handler);
}

JQueryEventRouter.prototype.handleEvent = function (e) {
    if (e.type === "routes" && e.routes.length === 0) {
	$(this.selector).off(this.eventName, this.handler);
	World.exit();
    }
};
