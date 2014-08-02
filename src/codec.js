// Wire protocol representation of events and actions

var Route = require("./route.js");

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
