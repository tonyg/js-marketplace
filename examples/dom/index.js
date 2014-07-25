var G;
$(document).ready(function () {
    var World = Minimart.World;
    var Actor = Minimart.Actor;
    var sub = Minimart.sub;
    var pub = Minimart.pub;
    var __ = Minimart.__;
    var _$ = Minimart._$;

    G = new Minimart.Ground(function () {
	console.log('starting ground boot');
	// World.spawn(new Spy("GROUND", true));
	Minimart.DOM.spawnDOMDriver();
	Minimart.RoutingTableWidget.spawnRoutingTableWidget("#spy-holder", "spy");

	World.spawn(new Actor(function () {
	    Actor.subscribe(
		function () { return ["jQuery", "button.clicker", "click", __]; },
		function () {
		    World.send("bump_count");
		});

	    Actor.advertise(
		function () { return "bump_count"; });
	    Actor.advertise(
		function () {
		    return ["DOM", "#clicker-holder", "clicker",
			    ["button", ["span", [["style", "font-style: italic"]], "Click me!"]]];
		});
	}));

	World.spawn(new Actor(function () {
	    this.counter = 0;

	    Actor.subscribe(
		function () { return "bump_count"; },
		function () {
		    this.counter++;
		    this.updateRoutes();
		});

	    Actor.advertise(
		function () {
		    return ["DOM", "#counter-holder", "counter",
			    ["div",
			     ["p", "The current count is: ", this.counter]]];
		});
	}));
    });
    G.startStepping();
});
