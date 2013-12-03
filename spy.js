// Generic Spy

function Spy() {
}

Spy.prototype.boot = function () {
    World.updateRoutes([sub(__, 0, Infinity), pub(__, 0, Infinity)]);
};

Spy.prototype.handleEvent = function (e) {
    switch (e.type) {
    case "routes": console.log("SPY", "routes", e.routes); break;
    case "message": console.log("SPY", "message", e.message, e.metaLevel, e.isFeedback); break;
    default: console.log("SPY", "unknown", e); break;
    }
};
