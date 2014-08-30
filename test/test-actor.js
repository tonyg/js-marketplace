var expect = require('expect.js');

var Minimart = require('../src/main.js');

var World = Minimart.World;
var Actor = Minimart.Actor;
var sub = Minimart.sub;
var pub = Minimart.pub;
var __ = Minimart.__;
var _$ = Minimart._$;

function configurationTrace(bootConfiguration) {
  var eventLog = [];
  function trace(item) {
    eventLog.push(item);
  }

  var G = new Minimart.Ground(function () {
    bootConfiguration(trace);
  });

  while (G.step()) {
    // do nothing until G becomes inert
  }

  return eventLog;
}

function checkTrace(bootConfiguration, expected) {
  expect(configurationTrace(bootConfiguration)).to.eql(expected);
}

describe("configurationTrace", function() {
  describe("with an inert configuration", function () {
    it("should yield an empty trace", function () {
      checkTrace(function (trace) {}, []);
    });
  });

  describe("with a single trace in an inert configuration", function () {
    it("should yield that trace", function () {
      checkTrace(function (trace) { trace(1) }, [1]);
    });
  });

  describe("with some traced communication", function () {
    it("should yield an appropriate trace", function () {
      checkTrace(function (trace) {
	World.spawn({
	  handleEvent: function (e) {
	    trace(e);
	  }
	}, [sub(__)]);
	World.send(123);
	World.send(234);
      }, [Minimart.updateRoutes([]),
	  Minimart.sendMessage(123),
	  Minimart.sendMessage(234)]);
    });
  });
});
