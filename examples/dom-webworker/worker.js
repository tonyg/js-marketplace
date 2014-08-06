importScripts("../../dist/minimart.js");
var World = Minimart.World;
var Actor = Minimart.Actor;
var sub = Minimart.sub;
var pub = Minimart.pub;
var __ = Minimart.__;
var _$ = Minimart._$;

new Minimart.WorkerGround(function () {
  console.log('starting worker boot');

  World.spawn(new Actor(function () {
    this.counter = 0;

    Actor.subscribe(
      function () { return "bump_count"; },
      { metaLevel: 1},
      function () {
	this.counter++;
	this.updateRoutes();
      });

    Actor.advertise(
      function () {
	return ["DOM", "#counter-holder", "counter",
		["div",
		 ["p", "The current count is: ", this.counter]]];
      },
      { metaLevel: 1});
  }));
}).startStepping();
