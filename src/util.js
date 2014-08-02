// Minimal jQueryish utilities. Reimplemented because jQuery needs
// window to exist, and we want to run in Web Worker context as well.

function extend(what, _with) {
  for (var prop in _with) {
    if (_with.hasOwnProperty(prop)) {
      what[prop] = _with[prop];
    }
  }
  return what;
}

module.exports.extend = extend;
