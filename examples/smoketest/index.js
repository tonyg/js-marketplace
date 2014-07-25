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
	World.spawn(new Minimart.Spy("GROUND", true));

	World.spawn(new Actor(function () {
	    this.counter = 0;
	    this.step = function () {
		World.send(["beep", this.counter++]);
		return this.counter <= 10;
	    };

	    Actor.advertise(function () { return ["beep", __]; });
	}));

	World.spawn(new Actor(function () {
	    Actor.subscribe(
		function () { return ["beep", _$("counter")]; },
		function (counter) {
		    console.log("beep!", counter);
		});
	}));
    });
    G.startStepping();
});
