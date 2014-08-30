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

	World.spawn({
	    name: 'GestaltDisplay',
	    boot: function () {
	      return [sub(__, 0, 10), pub(__, 0, 10)];
	    },
	    handleEvent: function (e) {
		if (e.type === "routes") {
		    var gd = document.getElementById('gestalt-display');
		    var t = document.createTextNode(G.world.textProcessTree() + '\n' +
						    e.gestalt.pretty());
		    gd.innerHTML = '';
		    gd.appendChild(t);
		}
	    }
	});

        World.spawn(new Actor(function () {
	    this.counter = 0;
	    this.step = function () {
	      if (this.listenerExists && this.counter < 10) {
	        World.send(["beep", this.counter++]);
	        return true;
	      } else {
		return false;
	      }
	    };

	    Actor.advertise(function () { return ["beep", __]; });
	    Actor.observeSubscribers(
	      function () { return ["beep", __]; },
	      { presence: "listenerExists" });
	}));

        World.spawn(new Minimart.Worker("worker.js"));
    });
    G.startStepping();
});
