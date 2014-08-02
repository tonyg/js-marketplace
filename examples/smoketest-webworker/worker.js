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
    Actor.subscribe(
      function () { return ["beep", _$("counter")]; },
      { metaLevel: 1 },
      function (counter) {
	console.log("beep!", counter);
      });
  }));
}).startStepping();
