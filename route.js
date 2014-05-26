/* Routing */

function Routing(exports) {

    var __ = "__"; /* wildcard marker */

    var SOA = "__["; // start of array
    var EOA = "__]"; // end of array

    function die(message) {
	throw new Error(message);
    }

    // The pattern argument defaults to wildcard, __.
    function $Capture(pattern) {
	this.pattern = (typeof pattern === 'undefined' ? __ : pattern);
    }

    // Abbreviation: _$(x) <==> new $Capture(x)
    function _$(pattern) {
	return new $Capture(pattern);
    }

    function isCapture(x) { return x instanceof $Capture || x === _$; }
    function capturePattern(x) { return x instanceof $Capture ? x.pattern : __; }

    var SOC = "__{{"; // start of capture
    var EOC = "__}}"; // end of capture

    function $Success(value) {
	this.value = value;
    }

    function $WildcardSequence(matcher) {
	this.matcher = matcher;
    }

    function $Dict() {
	this.length = 0;
	this.entries = {};
    }

    $Dict.prototype.get = function (key) {
	return this.entries[key] || emptyMatcher;
    };

    $Dict.prototype.set = function (key, val) {
	if (!(key in this.entries)) this.length++;
	this.entries[key] = val;
    };

    $Dict.prototype.clear = function (key) {
	if (key in this.entries) this.length--;
	delete this.entries[key];
    };

    $Dict.prototype.isEmpty = function () {
	return this.length === 0;
    };

    $Dict.prototype.copy = function () {
	var other = new $Dict();
	other.length = this.length;
	for (var key in this.entries) {
	    if (this.entries.hasOwnProperty(key)) {
		other.entries[key] = this.entries[key];
	    }
	}
	return other;
    };

    $Dict.prototype.emptyGuard = function () {
	if (this.isEmpty()) return emptyMatcher;
	return this;
    };

    $Dict.prototype.has = function (key) {
	return key in this.entries;
    };

    function is_emptyMatcher(m) {
	return (m === emptyMatcher);
    }

    ///////////////////////////////////////////////////////////////////////////
    // Constructors

    var emptyMatcher = null;

    function rsuccess(v) {
	return (v === emptyMatcher) ? emptyMatcher : new $Success(v);
    }

    function rseq(e, r) {
	if (r === emptyMatcher) return emptyMatcher;
	var s = new $Dict();
	s.set(e, r);
	return s;
    }

    function rwild(r) {
	return rseq(__, r);
    }

    function rwildseq(r) {
	return (r === emptyMatcher) ? emptyMatcher : new $WildcardSequence(r);
    }

    ///////////////////////////////////////////////////////////////////////////

    function compilePattern(v, p) {
	if (!p) die("compilePattern: missing pattern");
	return walk(p, rseq(EOA, rsuccess(v)));

	function walk(p, acc) {
	    if (p === __) return rwild(acc);

	    if (Array.isArray(p)) {
		acc = rseq(EOA, acc);
		for (var i = p.length - 1; i >= 0; i--) {
		    acc = walk(p[i], acc);
		}
		return rseq(SOA, acc);
	    }

	    return rseq(JSON.stringify(p), acc);
	}
    }

    function shallowCopyArray(s) {
	return s.slice();
    }

    function rupdate(r, key, k) {
	if (is_emptyMatcher(k)) {
	    if (is_emptyMatcher(r)) return r;
	    r = r.copy();
	    r.clear(key);
	    return r.emptyGuard();
	} else {
	    r = (is_emptyMatcher(r) ? new $Dict() : r.copy());
	    r.set(key, k);
	    return r;
	}
    }

    function rupdateInplace(r, key, k) {
	if (is_emptyMatcher(k)) {
	    r.clear(key);
	} else {
	    r.set(key, k);
	}
    }

    function matcherEquals(a, b) {
	if (a === null) {
	    return (b === null);
	}
	if (b === null) return false;

	if (a instanceof $WildcardSequence) {
	    if (!(b instanceof $WildcardSequence)) return false;
	    a = a.matcher;
	    b = b.matcher;
	} else if (b instanceof $WildcardSequence) return false;

	if (a instanceof $Success) {
	    if (!(b instanceof $Success)) return false;
	    return valuesEqual(a.value, b.value);
	}
	if (b instanceof $Success) return false;

	for (var key in a.entries) {
	    if (!b.has(key)) return false;
	    if (!matcherEquals(a.entries[key], b.entries[key])) return false;
	}
	return true;
    }

    function is_keyOpen(k) {
	return k === SOA;
    }

    function is_keyClose(k) {
	return k === EOA;
    }

    function is_keyNormal(k) {
	return !(is_keyOpen(k) || is_keyClose(k));
    }

    ///////////////////////////////////////////////////////////////////////////
    // Enough of sets to get by with

    function arrayToSet(xs) {
	var s = {};
	for (var i = 0; i < xs.length; i++) {
	    s[JSON.stringify(xs[i])] = xs[i];
	}
	return s;
    }

    function setToArray(s) {
	var r = [];
	for (var k in s) r.push(s[k]);
	return r;
    }

    function setUnion(s1, s2) {
	var s = {};
	setUnionInplace(s, s1);
	setUnionInplace(s, s2);
	return s;
    }

    function is_emptySet(s) {
	for (var k in s) {
	    if (s.hasOwnProperty(k))
		return false;
	}
	return true;
    }

    function setSubtract(s1, s2) {
	var s = {};
	for (var key in s1) {
	    if (s1.hasOwnProperty(key) && !s2.hasOwnProperty(key)) {
		s[key] = s1[key];
	    }
	}
	return s;
    }

    function setIntersect(s1, s2) {
	var s = {};
	for (var key in s1) {
	    if (s1.hasOwnProperty(key) && s2.hasOwnProperty(key)) {
		s[key] = s1[key];
	    }
	}
	return s;
    }

    function setUnionInplace(acc, s) {
	for (var key in s) {
	    if (s.hasOwnProperty(key)) {
		acc[key] = s[key];
	    }
	}
    }

    function setEqual(s1, s2) {
	for (var key in s1) {
	    if (s1.hasOwnProperty(key)) {
		if (s1[key] !== s2[key]) return false;
	    }
	}
	for (var key in s2) {
	    if (s2.hasOwnProperty(key)) {
		if (s1[key] !== s2[key]) return false;
	    }
	}
	return true;
    }

    ///////////////////////////////////////////////////////////////////////////

    var unionSuccesses = function (v1, v2) {
	if (v1 === true) return v2;
	if (v2 === true) return v1;
	return setUnion(v1, v2);
    };

    var intersectSuccesses = function (v1, v2) {
	return v1;
    };

    var erasePathSuccesses = function (v1, v2) {
	var r = setSubtract(v1, v2);
	if (is_emptySet(r)) return null;
	return r;
    };

    var matchMatcherSuccesses = function (v1, v2, acc) {
	setUnionInplace(acc, v2);
    };

    var projectSuccess = function (v) {
	return v;
    };

    var valuesEqual = function (a, b) {
	return setEqual(a, b);
    };

    ///////////////////////////////////////////////////////////////////////////

    function expandWildseq(r) {
	return union(rwild(rwildseq(r)), rseq(EOA, r));
    }

    function union(o1, o2) {
	return merge(o1, o2);

	function merge(o1, o2) {
	    if (is_emptyMatcher(o1)) return o2;
	    if (is_emptyMatcher(o2)) return o1;
	    return walk(o1, o2);
	}

	function walk(r1, r2) {
	    if (r1 instanceof $WildcardSequence) {
		if (r2 instanceof $WildcardSequence) {
		    return rwildseq(walk(r1.matcher, r2.matcher));
		}
		r1 = expandWildseq(r1.matcher);
	    } else if (r2 instanceof $WildcardSequence) {
		r2 = expandWildseq(r2.matcher);
	    }

	    if (r1 instanceof $Success && r2 instanceof $Success) {
		return rsuccess(unionSuccesses(r1.value, r2.value));
	    }

	    var w = merge(r1.get(__), r2.get(__));
	    if (is_emptyMatcher(w)) {
		var smaller = r1.length < r2.length ? r1 : r2;
		var larger  = r1.length < r2.length ? r2 : r1;
		var target = larger.copy();
		for (var key in smaller.entries) {
		    var k = merge(smaller.get(key), larger.get(key));
		    rupdateInplace(target, key, k);
		}
		return target.emptyGuard();
	    } else {
		function examineKey(rA, key, rB) {
		    if ((key !== __) && !target.has(key)) {
			var k = merge(rA.get(key), rB.get(key));
			if (is_keyOpen(key)) {
			    rupdateInplace(target, key, merge(rwildseq(w), k));
			} else if (is_keyClose(key)) {
			    if (w instanceof $WildcardSequence) {
				rupdateInplace(target, key, merge(w.matcher, k));
			    } else {
				rupdateInplace(target, key, k);
			    }
			} else {
			    rupdateInplace(target, key, merge(w, k));
			}
		    }
		}
		var target = rwild(w).copy();
		for (var key in r1.entries) { examineKey(r1, key, r2); }
		for (var key in r2.entries) { examineKey(r2, key, r1); }
		return target;
	    }
	}
    }

    function unionN() {
	var acc = emptyMatcher;
	for (var i = 0; i < arguments.length; i++) {
	    acc = union(acc, arguments[i]);
	}
	return acc;
    }

    function intersect(o1, o2) {
	if (is_emptyMatcher(o1)) return emptyMatcher;
	if (is_emptyMatcher(o2)) return emptyMatcher;
	return walk(o1, o2);

	function walkFlipped(r2, r1) { return walk(r1, r2); }

	function walk(r1, r2) {
	    // INVARIANT: r1 is a part of the original o1, and
	    // likewise for r2. This is so that the first arg to
	    // intersectSuccesses always comes from r1, and the second
	    // from r2.
	    if (is_emptyMatcher(r1)) return emptyMatcher;
	    if (is_emptyMatcher(r2)) return emptyMatcher;

	    if (r1 instanceof $WildcardSequence) {
		if (r2 instanceof $WildcardSequence) {
		    return rwildseq(walk(r1.matcher, r2.matcher));
		}
		r1 = expandWildseq(r1.matcher);
	    } else if (r2 instanceof $WildcardSequence) {
		r2 = expandWildseq(r2.matcher);
	    }

	    if (r1 instanceof $Success && r2 instanceof $Success) {
		return rsuccess(intersectSuccesses(r1.value, r2.value));
	    }

	    var w1 = r1.get(__);
	    var w2 = r2.get(__);
	    var w = walk(w1, w2);

	    var target = new $Dict();

	    function examineKey(key) {
		if ((key !== __) && !target.has(key)) {
		    var k1 = r1.get(key);
		    var k2 = r2.get(key);
		    if (is_emptyMatcher(k1)) {
			if (is_emptyMatcher(k2)) {
			    rupdateInplace(target, key, emptyMatcher);
			} else {
			    rupdateInplace(target, key, walkWild(walk, w1, key, k2));
			}
		    } else {
			if (is_emptyMatcher(k2)) {
			    rupdateInplace(target, key, walkWild(walkFlipped, w2, key, k1));
			} else {
			    rupdateInplace(target, key, walk(k1, k2));
			}
		    }
		}
	    }

	    if (is_emptyMatcher(w1)) {
		if (is_emptyMatcher(w2)) {
		    for (var key in (r1.length < r2.length ? r1 : r2).entries) examineKey(key);
		} else {
		    for (var key in r1.entries) examineKey(key);
		}
	    } else {
		if (is_emptyMatcher(w2)) {
		    for (var key in r2.entries) examineKey(key);
		} else {
		    rupdateInplace(target, __, w);
		    for (var key in r1.entries) examineKey(key);
		    for (var key in r2.entries) examineKey(key);
		}
	    }
	    return target.emptyGuard();
	}

	function walkWild(walker, w, key, k) {
	    if (is_emptyMatcher(w)) return emptyMatcher;
	    if (is_keyOpen(key)) return walker(rwildseq(w), k);
	    if (is_keyClose(key)) {
		if (w instanceof $WildcardSequence) return walker(w.matcher, k);
		return emptyMatcher;
	    }
	    return walker(w, k);
	}
    }

    // Removes r2's mappings from r1. Assumes r2 has previously been
    // union'd into r1. The erasePathSuccesses function should return
    // null to signal "no remaining success values".
    function erasePath(o1, o2) {
	return walk(o1, o2);

	function cofinitePattern() {
	    die("Cofinite pattern required");
	}

	function walk(r1, r2) {
	    if (is_emptyMatcher(r1)) {
		if (is_emptyMatcher(r2)) {
		    return emptyMatcher;
		} else {
		    cofinitePattern();
		}
	    } else {
		if (is_emptyMatcher(r2)) {
		    return r1;
		}
	    }

	    if (r1 instanceof $WildcardSequence) {
		if (r2 instanceof $WildcardSequence) {
		    return rwildseq(walk(r1.matcher, r2.matcher));
		}
		cofinitePattern();
	    } else if (r2 instanceof $WildcardSequence) {
		r2 = expandWildseq(r2.matcher);
	    }

	    if (r1 instanceof $Success && r2 instanceof $Success) {
		return rsuccess(erasePathSuccesses(r1.value, r2.value));
	    }

	    var w1 = r1.get(__);
	    var w2 = r2.get(__);
	    var w = walk(w1, w2);
	    var target;

	    function examineKey(key) {
		if (key !== __) {
		    var k1 = r1.get(key);
		    var k2 = r2.get(key);
		    var updatedK;
		    if (is_emptyMatcher(k1)) {
			if (is_emptyMatcher(k2)) {
			    updatedK = emptyMatcher;
			} else {
			    cofinitePattern();
			}
		    } else {
			if (is_emptyMatcher(k2)) {
			    updatedK = walkWild(key, k1, w2);
			} else {
			    updatedK = walk(k1, k2);
			}
		    }
		    // Here we ensure a "minimal" remainder in cases
		    // where after an erasure, a particular key's
		    // continuation is the same as the wildcard's
		    // continuation. TODO: the matcherEquals check may
		    // be expensive. If so, how can it be made
		    // cheaper?
		    if (is_keyOpen(key) || is_keyClose(key)) {
			// The continuation, even if syntactically
			// identical to the wildcard, doesn't act the
			// same way, so we shouldn't merge it.
			rupdateInplace(target, key, updatedK);
		    } else {
			rupdateInplace(target, key,
				       (matcherEquals(updatedK, w) ? emptyMatcher : updatedK));
		    }
		}
	    }

	    if (is_emptyMatcher(w2)) {
		target = r1.copy();
		for (var key in r2.entries) examineKey(key);
	    } else {
		target = new $Dict();
		rupdateInplace(target, __, w);
		for (var key in r1.entries) examineKey(key);
		for (var key in r2.entries) examineKey(key);
	    }

	    // Here, the target is complete. If it has only two keys,
	    // one wild and one is_keyClose, and wild's continuation
	    // is a $WildcardSequence and the other continuation is
	    // identical to the sequence's continuation, then replace
	    // the whole thing with a nested $WildcardSequence.
	    // (We know w === target.get(__) from before.)
	    //
	    // TODO: I suspect actually this applies even if there are
	    // more than two keys, so long as all their continuations
	    // are identical and there's at least one is_keyClose
	    // alongside a wild.
	    if (target.length === 2) {
		var finalW = target.get(__);
		if (finalW instanceof $WildcardSequence) {
		    for (var key in target.entries) {
			if ((key !== __) && is_keyClose(key)) {
			    var k = target.get(key);
			    if (matcherEquals(k, finalW.matcher)) {
				return finalW;
			    }
			}
		    }
		}
	    }

	    return target.emptyGuard();
	}

	function walkWild(key, k, w) {
	    if (is_emptyMatcher(w)) return k;
	    if (is_keyOpen(key)) return walk(k, rwildseq(w));
	    if (is_keyClose(key)) {
		if (w instanceof $WildcardSequence) return walk(k, w.matcher);
		return k;
	    }
	    return walk(k, w);
	}
    }

    // Returns null on failed match, otherwise the appropriate success
    // value contained in the matcher r.
    function matchValue(r, v) {
	var failureResult = null;

	var vs = [v];
	var stack = [[]];

	while (!is_emptyMatcher(r)) {
	    if (r instanceof $WildcardSequence) {
		if (stack.length === 0) return failureResult;
		vs = stack.pop();
		r = r.matcher;
		continue;
	    }

	    if (r instanceof $Success) {
		if (vs.length === 0 && stack.length === 0) return r.value;
		return failureResult;
	    }

	    if (vs.length === 0) {
		if (stack.length === 0) return failureResult;
		vs = stack.pop();
		r = r.get(EOA);
		continue;
	    }

	    var v = vs.shift();

	    if (typeof v === 'string' && v.substring(0, 2) === '__') {
		die("Cannot match special string starting with __");
	    }

	    if (Array.isArray(v)) {
		if (SOA in r.entries) {
		    r = r.get(SOA);
		    stack.push(vs);
		    vs = shallowCopyArray(v);
		} else {
		    r = r.get(__);
		}
	    } else {
		var key = JSON.stringify(v);
		if (key in r.entries) {
		    r = r.get(key);
		} else {
		    r = r.get(__);
		}
	    }
	}

	return failureResult;
    }

    // TODO: better name for this
    function matchMatcher(o1, o2, seed) {
	var acc = seed || {}; // will be modified in place
	walk(o1, o2);
	return acc;

	function walkFlipped(r2, r1) { return walk(r1, r2); }

	function walk(r1, r2) {
	    if (is_emptyMatcher(r1) || is_emptyMatcher(r2)) return;

	    if (r1 instanceof $WildcardSequence) {
		if (r2 instanceof $WildcardSequence) {
		    walk(r1.matcher, r2.matcher);
		    return;
		}
		r1 = expandWildseq(r1.matcher);
	    } else if (r2 instanceof $WildcardSequence) {
		r2 = expandWildseq(r2.matcher);
	    }

	    if (r1 instanceof $Success && r2 instanceof $Success) {
		matchMatcherSuccesses(r1.value, r2.value, acc);
		return;
	    }

	    var w1 = r1.get(__);
	    var w2 = r2.get(__);
	    walk(w1, w2);

	    function examineKey(key) {
		if (key !== __) {
		    var k1 = r1.get(key);
		    var k2 = r2.get(key);
		    if (is_emptyMatcher(k1)) {
			if (is_emptyMatcher(k2)) {
			    return;
			} else {
			    walkWild(walk, w1, key, k2);
			}
		    } else {
			if (is_emptyMatcher(k2)) {
			    walkWild(walkFlipped, w2, key, k1);
			} else {
			    walk(k1, k2);
			}
		    }
		}
	    }

	    // Optimize similarly to intersect().
	    if (is_emptyMatcher(w1)) {
		if (is_emptyMatcher(w2)) {
		    for (var key in (r1.length < r2.length ? r1 : r2).entries) examineKey(key);
		} else {
		    for (var key in r1.entries) examineKey(key);
		}
	    } else {
		if (is_emptyMatcher(w2)) {
		    for (var key in r2.entries) examineKey(key);
		} else {
		    for (var key in r1.entries) examineKey(key);
		    for (var key in r2.entries) examineKey(key);
		}
	    }
	}

	function walkWild(walker, w, key, k) {
	    if (is_emptyMatcher(w)) return;
	    if (is_keyOpen(key)) {
		walker(rwildseq(w), k);
		return;
	    }
	    if (is_keyClose(key)) {
		if (w instanceof $WildcardSequence) walker(w.matcher, k);
		return;
	    }
	    walker(w, k);
	}
    }

    function relabel(m, f) {
	return walk(m);

	function walk(m) {
	    if (is_emptyMatcher(m)) return emptyMatcher;
	    if (m instanceof $WildcardSequence) return rwildseq(walk(m.matcher));
	    if (m instanceof $Success) return rsuccess(f(m.value));

	    var target = new $Dict();
	    for (var key in m.entries) {
		rupdateInplace(target, key, walk(m.get(key)));
	    }
	    return target.emptyGuard();
	}
    }

    function compileProjection(p) {
	var acc = [];
	walk(p);
	acc.push(EOA);
	return acc;

	function walk(p) {
	    if (isCapture(p)) {
		acc.push(SOC);
		walk(capturePattern(p));
		acc.push(EOC);
		return;
	    }

	    if (Array.isArray(p)) {
		acc.push(SOA);
		for (var i = 0; i < p.length; i++) {
		    walk(p[i]);
		}
		acc.push(EOA);
		return;
	    }

	    if (p === __) {
		acc.push(p);
	    } else {
		acc.push(JSON.stringify(p));
	    }
	}
    }

    function projectionToPattern(p) {
	return walk(p);

	function walk(p) {
	    if (isCapture(p)) return walk(capturePattern(p));

	    if (Array.isArray(p)) {
		var result = [];
		for (var i = 0; i < p.length; i++) {
		    result.push(walk(p[i]));
		}
		return result;
	    }

	    return p;
	}
    }

    function project(m, spec) {
	return rseq(SOA, walk(false, m, 0));

	function walk(isCapturing, m, specIndex) {
	    if (specIndex >= spec.length) {
		if (isCapturing) die("Bad specification: unclosed capture");
		if (m instanceof $Success) {
		    return rseq(EOA, rseq(EOA, rsuccess(projectSuccess(m.value))));
		} else {
		    return emptyMatcher;
		}
	    }

	    if (is_emptyMatcher(m)) return emptyMatcher;

	    var item = spec[specIndex];
	    var nextIndex = specIndex + 1;

	    if (item === EOC) {
		if (!isCapturing) die("Bad specification: unepxected EOC");
		return walk(false, m, nextIndex);
	    }

	    if (item === SOC) {
		if (isCapturing) die("Bad specification: nested capture");
		return walk(true, m, nextIndex);
	    }

	    if (item === __) {
		if (m instanceof $WildcardSequence) {
		    if (isCapturing) {
			return rwild(walk(isCapturing, m, nextIndex));
		    } else {
			return walk(isCapturing, m, nextIndex);
		    }
		}

		if (m instanceof $Success) {
		    return emptyMatcher;
		}

		var target;
		if (isCapturing) {
		    target = new $Dict();
		    rupdateInplace(target, __, walk(isCapturing, m.get(__), nextIndex));
		    for (var key in m.entries) {
			if (key !== __) {
			    var mk = m.get(key);
			    if (is_keyOpen(key)) {
				function cont(mk2) { return walk(isCapturing, mk2, nextIndex); }
				rupdateInplace(target, key, captureNested(mk, cont));
			    } else if (is_keyClose(key)) {
				// do nothing
			    } else {
				rupdateInplace(target, key, walk(isCapturing, mk, nextIndex));
			    }
			}
		    }
		} else {
		    target = walk(isCapturing, m.get(__), nextIndex);
		    for (var key in m.entries) {
			if (key !== __) {
			    var mk = m.get(key);
			    if (is_keyOpen(key)) {
				function cont(mk2) { return walk(isCapturing, mk2, nextIndex); }
				target = union(target, skipNested(mk, cont));
			    } else if (is_keyClose(key)) {
				// do nothing
			    } else {
				target = union(target, walk(isCapturing, mk, nextIndex));
			    }
			}
		    }
		}
		return target;
	    }

	    var result;
	    if (m instanceof $WildcardSequence) {
		if (is_keyOpen(item)) {
		    result = walk(isCapturing, rwildseq(m), nextIndex);
		} else if (is_keyClose(item)) {
		    result = walk(isCapturing, m.matcher, nextIndex);
		} else {
		    result = walk(isCapturing, m, nextIndex);
		}
	    } else if (m instanceof $Success) {
		result = emptyMatcher;
	    } else {
		if (is_keyOpen(item)) {
		    result = walk(isCapturing, rwildseq(m.get(__)), nextIndex);
		} else if (is_keyClose(item)) {
		    result = emptyMatcher;
		} else {
		    result = walk(isCapturing, m.get(__), nextIndex);
		}
		result = union(result, walk(isCapturing, m.get(item), nextIndex));
	    }
	    if (isCapturing) {
		result = rseq(item, result);
	    }
	    return result;
	}

	function captureNested(m, cont) {
	    if (m instanceof $WildcardSequence) {
		return rwildseq(cont(m.matcher));
	    }

	    if (is_emptyMatcher(m) || (m instanceof $Success)) {
		return emptyMatcher;
	    }

	    var target = new $Dict();
	    rupdateInplace(target, __, captureNested(m.get(__), cont));
	    for (var key in m.entries) {
		if (key !== __) {
		    var mk = m.get(key);
		    if (is_keyOpen(key)) {
			function cont2(mk2) { return captureNested(mk2, cont); }
			rupdateInplace(target, key, captureNested(mk, cont2));
		    } else if (is_keyClose(key)) {
			rupdateInplace(target, key, cont(mk));
		    } else {
			rupdateInplace(target, key, captureNested(mk, cont));
		    }
		}
	    }
	    return target.emptyGuard();
	}

	function skipNested(m, cont) {
	    if (m instanceof $WildcardSequence) {
		return cont(m.matcher);
	    }

	    if (is_emptyMatcher(m) || (m instanceof $Success)) {
		return emptyMatcher;
	    }

	    var target = skipNested(m.get(__), cont);
	    for (var key in m.entries) {
		if (key !== __) {
		    var mk = m.get(key);
		    if (is_keyOpen(key)) {
			function cont2(mk2) { return skipNested(mk2, cont); }
			target = union(target, skipNested(mk, cont2));
		    } else if (is_keyClose(key)) {
			target = union(target, cont(mk));
		    } else {
			target = union(target, skipNested(mk, cont));
		    }
		}
	    }
	    return target;
	}
    }

    function matcherKeys(m) {
	return walk(m, function (v, k) { return [v]; });

	function walk(m, k) {
	    if (m instanceof $WildcardSequence) return null;
	    if (m instanceof $Success) return [];
	    if (m.has(__)) return null;
	    var acc = [];
	    for (var key in m.entries) {
		var mk = m.get(key);
		var piece;
		if (is_keyOpen(key)) {
		    function seqK(vss, vsk) {
			var acc = [];
			for (var i = 0; i < vss.length; i++) {
			    var vs = vss[i];
			    acc = acc.concat(k(transformSeqs(vs, key), vsk));
			}
			return acc;
		    }
		    piece = walkSeq(mk, seqK);
		} else if (is_keyClose(key)) {
		    die("matcherKeys: internal error: unexpected key-close");
		} else {
		    piece = k(JSON.parse(key), mk);
		}
		if (piece == null) return null;
		acc = acc.concat(piece);
	    }
	    return acc;
	}

	function walkSeq(m, k) {
	    if (m instanceof $WildcardSequence) return null;
	    if (m instanceof $Success) return k([], emptyMatcher); // TODO: ??
	    if (m.has(__)) return null;
	    var acc = [];
	    for (var key in m.entries) {
		var mk = m.get(key);
		var piece;
		if (is_keyClose(key)) {
		    piece = k([[]], mk);
		} else {
		    function outerK(v, vk) {
			return walkSeq(vk, innerK);
			function innerK(vss, vsk) {
			    var acc = [];
			    for (var i = 0; i < vss.length; i++) {
				var vs = shallowCopyArray(vss[i]);
				vs.unshift(v);
				acc.push(vs);
			    }
			    return k(acc, vsk);
			}
		    }
		    piece = walk(rseq(key, mk), outerK);
		}
		if (piece == null) return null;
		acc = acc.concat(piece);
	    }
	    return acc;
	}

	function transformSeqs(vs, opener) {
	    if (opener === SOA) return vs;
	    die("Internal error: unknown opener " + opener);
	}
    }

    function prettyMatcher(m, initialIndent) {
	var acc = [];
	walk(initialIndent || 0, m);
	return acc.join('');

	function walk(i, m) {
	    if (is_emptyMatcher(m)) {
		acc.push("::: no further matches possible");
		return;
	    }
	    if (m instanceof $WildcardSequence) {
		acc.push("...>");
		walk(i + 4, m.matcher);
		return;
	    }
	    if (m instanceof $Success) {
		var vs = JSON.stringify(typeof m.value === 'object'
					? setToArray(m.value)
					: m.value);
		acc.push("{" + vs + "}");
		return;
	    }

	    if (m.length === 0) {
		acc.push(" ::: empty hash!");
		return;
	    }

	    var needSep = false;
	    for (var key in m.entries) {
		var k = m.entries[key];
		if (needSep) {
		    acc.push("\n");
		    acc.push(indentStr(i));
		} else {
		    needSep = true;
		}
		acc.push(" ");
		if (key === __) key = '★';
		if (key === SOA) key = '<';
		if (key === EOA) key = '>';
		acc.push(key);
		walk(i + key.length + 1, k);
	    }
	}

	function indentStr(i) {
	    return new Array(i + 1).join(' '); // eww
	}
    }

    function serializeMatcher(m, serializeSuccess) {
	return walk(m);
	function walk(m) {
	    if (is_emptyMatcher(m)) return [];
	    if (m instanceof $WildcardSequence) {
		return ["...)", m.matcher];
	    }
	    if (m instanceof $Success) {
		return ["", serializeSuccess(m.value)];
	    }
	    var acc = [];
	    for (var key in m.entries) {
		var k = m.entries[key];
		if (key === __) key = ["__"];
		else if (key === SOA) key = ["("];
		else if (key === EOA) key = [")"];
		else key = JSON.parse(key);
		acc.push([key, walk(k)]);
	    }
	    return acc;
	}
    }

    function deserializeMatcher(r, deserializeSuccess) {
	return walk(r);
	function walk(r) {
	    if (r.length === 0) return emptyMatcher;
	    if (r[0] === "...)") return rwildseq(walk(r[1]));
	    if (r[0] === "") return rsuccess(deserializeSuccess(r[1]));
	    var acc = new $Dict();
	    for (var i = 0; i < r.length; i++) {
		var rkey = r[i][0];
		var rk = r[i][1];
		var key;
		if (Array.isArray(rkey)) {
		    switch (rkey[0]) {
		    case "__": key = __; break;
		    case "(": key = SOA; break;
		    case ")": key = EOA; break;
		    default: die("Invalid serialized special key: " + rkey[0]);
		    }
		} else {
		    key = JSON.stringify(rkey);
		}
		rupdateInplace(acc, key, walk(rk));
	    }
	    return acc;
	}
    }

    ///////////////////////////////////////////////////////////////////////////
    // Gestalts.
    // TODO: support Infinity as a level number

    function GestaltLevel(subs, advs) {
	this.subscriptions = subs;
	this.advertisements = advs;
    }

    GestaltLevel.prototype.isEmpty = function () {
	return is_emptyMatcher(this.subscriptions) && is_emptyMatcher(this.advertisements);
    };

    GestaltLevel.prototype.equals = function (other) {
	return matcherEquals(this.subscriptions, other.subscriptions)
	    && matcherEquals(this.advertisements, other.advertisements);
    };

    function straightGestaltLevelOp(op) {
	return function (p1, p2) {
	    return new GestaltLevel(op(p1.subscriptions, p2.subscriptions),
				    op(p1.advertisements, p2.advertisements));
	};
    };

    function crossedGestaltLevelOp(op) {
	return function (p1, p2) {
	    return new GestaltLevel(op(p1.subscriptions, p2.advertisements),
				    op(p2.subscriptions, p1.advertisements));
	};
    };

    var emptyLevel = new GestaltLevel(emptyMatcher, emptyMatcher);
    var emptyMetaLevel = [];

    function Gestalt(metaLevels) {
	this.metaLevels = metaLevels;
    }

    Gestalt.prototype.getMetaLevel = function (n) {
	return this.metaLevels[n] || emptyMetaLevel;
    };

    Gestalt.prototype.getLevel = function (metaLevel, level) {
	return this.getMetaLevel(metaLevel)[level] || emptyLevel;
    };

    Gestalt.prototype.matchValue = function (body, metaLevel, isFeedback) {
	var levels = this.getMetaLevel(metaLevel);
	var pids = {};
	for (var i = 0; i < levels.length; i++) {
	    var matcher = (isFeedback ? levels[i].advertisements : levels[i].subscriptions);
	    setUnionInplace(pids, matchValue(matcher, body));
	}
	return setToArray(pids);
    };

    Gestalt.prototype.project = function (metaLevel, level, getAdvertisements, spec) {
	var l = this.getLevel(metaLevel, level);
	var matcher = (getAdvertisements ? l.advertisements : l.subscriptions);
	return project(matcher, spec);
    };

    Gestalt.prototype.drop = function () {
	var mls = shallowCopyArray(this.metaLevels);
	mls.shift();
	return new Gestalt(mls);
    };

    Gestalt.prototype.lift = function () {
	var mls = shallowCopyArray(this.metaLevels);
	mls.unshift(emptyMetaLevel);
	return new Gestalt(mls);
    };

    Gestalt.prototype.equals = function (other) {
	if (this.metaLevels.length !== other.metaLevels.length) return false;
	for (var i = 0; i < this.metaLevels.length; i++) {
	    var ls1 = this.metaLevels[i];
	    var ls2 = other.metaLevels[i];
	    if (ls1.length !== ls2.length) return false;
	    for (var j = 0; j < ls1.length; j++) {
		var p1 = ls1[j];
		var p2 = ls2[j];
		if (!p1.equals(p2)) return false;
	    }
	}
	return true;
    };

    function simpleGestalt(isAdv, pat, metaLevel, level) {
	metaLevel = metaLevel || 0;
	level = level || 0;
	var matcher = compilePattern(true, pat);
	var l = new GestaltLevel(isAdv ? emptyMatcher : matcher,
				 isAdv ? matcher : emptyMatcher);
	var levels = [l];
	while (level--) { levels.unshift(emptyLevel); }
	var metaLevels = [levels];
	while (metaLevel--) { metaLevels.unshift(emptyMetaLevel); }
	return new Gestalt(metaLevels);
    }

    var emptyGestalt = new Gestalt([]);

    Gestalt.prototype.isEmpty = function () {
	for (var i = 0; i < this.metaLevels.length; i++) {
	    var levels = this.metaLevels[i];
	    for (var j = 0; j < levels.length; j++) {
		if (!is_emptyMatcher(levels[i].subscriptions)) return false;
		if (!is_emptyMatcher(levels[i].advertisements)) return false;
	    }
	}
	return true;
    };

    Gestalt.prototype.mapZip = function (other, lengthCombiner, f,
					 levelsTransformer1, levelsTransformer2)
    {
	var metaLevels = [];
	var mls1 = this.metaLevels;
	var mls2 = other.metaLevels;
	var nm = lengthCombiner(mls1.length, mls2.length);
	for (var i = 0; i < nm; i++) {
	    var levels = [];
	    var ls1 = mls1[i] || emptyMetaLevel;
	    var ls2 = mls2[i] || emptyMetaLevel;
	    if (levelsTransformer1) ls1 = levelsTransformer1(ls1);
	    if (levelsTransformer2) ls2 = levelsTransformer2(ls2);
	    var nl = lengthCombiner(ls1.length, ls2.length);
	    for (var j = 0; j < nl; j++) {
		var p1 = ls1[j] || emptyLevel;
		var p2 = ls2[j] || emptyLevel;
		var p = f(p1, p2);
		if (!p.isEmpty()) {
		    while (levels.length < j) levels.push(emptyLevel);
		    levels.push(p);
		}
	    }
	    if (levels.length > 0) {
		while (metaLevels.length < i) metaLevels.push(emptyMetaLevel);
		metaLevels.push(levels);
	    }
	}
	return new Gestalt(metaLevels);
    };

    Gestalt.prototype.union1 = function (other) {
	return this.mapZip(other, Math.max, straightGestaltLevelOp(union));
    };

    function gestaltUnion(gs) {
	if (gs.length === 0) return emptyGestalt;
	var acc = gs[0];
	for (var i = 1; i < gs.length; i++) {
	    acc = acc.union1(gs[i]);
	}
	return acc;
    }

    Gestalt.prototype.union = function () {
	return arguments.length > 0 ? this.union1(gestaltUnion(arguments)) : this;
    };

    // Returns ls, with one level dropped, and with the remaining
    // matchers "smeared" across lower levels. This could end up being
    // reasonably expensive - possibly cache it?
    function smearLevels(levels) {
	var result = shallowCopyArray(levels);
	for (var i = result.length - 2; i >= 0; i--) {
	    result[i].subscriptions = union(result[i].subscriptions, result[i+1].subscriptions);
	    result[i].advertisements = union(result[i].advertisements, result[i+1].advertisements);
	}
	return result;
    };

    Gestalt.prototype.filter = function (perspective) {
	return this.mapZip(perspective, Math.min, crossedGestaltLevelOp(intersect),
			   null,
			   smearLevels);
    };

    Gestalt.prototype.match = function (perspective) {
	var pids = {};
	var nm = Math.min(this.metaLevels.length, perspective.metaLevels.length);
	for (var i = 0; i < nm; i++) {
	    var ls1 = mls1[i] || emptyMetaLevel;
	    var ls2 = smearLevels(mls2[i] || emptyMetaLevel);
	    var nl = Math.min(ls1.length, ls2.length);
	    for (var j = 0; j < nl; j++) {
		var p1 = ls1[j] || emptyLevel;
		var p2 = ls2[j] || emptyLevel;
		matchMatcher(p1.subscriptions, p2.advertisements, pids);
		matchMatcher(p1.advertisements, p2.subscriptions, pids);
	    }
	}
	return setToArray(pids);
    };

    Gestalt.prototype.erasePath = function (path) {
	return this.mapZip(path, Math.max, straightGestaltLevelOp(erasePath));
    };

    function mapLevels(inputMetaLevels, f, emptyCheck, emptyLevel) {
	var outputMetaLevels = [];
	for (var i = 0; i < inputMetaLevels.length; i++) {
	    var ls = inputMetaLevels[i];
	    var levels = [];
	    for (var j = 0; j < ls.length; j++) {
		var p = f(ls[j] || emptyLevel);
		if (!emptyCheck(p)) {
		    while (levels.length < j) levels.push(emptyLevel);
		    levels.push(p);
		}
	    }
	    if (levels.length > 0) {
		while (outputMetaLevels.length < i) outputMetaLevels.push(emptyMetaLevel);
		outputMetaLevels.push(levels);
	    }
	}
	return outputMetaLevels;
    };

    Gestalt.prototype.transform = function (f) {
	return new Gestalt(mapLevels(this.metaLevels, function (p) {
	    return new GestaltLevel(f(p.subscriptions), f(p.advertisements));
	}, function (p) {
	    return p.isEmpty();
	}, emptyLevel));
    };

    Gestalt.prototype.stripLabel = function () {
	return this.transform(function (m) { return relabel(m, function (v) { return true; }); });
    };

    Gestalt.prototype.label = function (pid) {
	var pids = arrayToSet([pid]);
	return this.transform(function (m) { return relabel(m, function (v) { return pids; }); });
    };

    Gestalt.prototype.pretty = function () {
	var acc = [];
	if (this.isEmpty()) {
	    acc.push("EMPTY GESTALT\n");
	} else {
	    for (var i = 0; i < this.metaLevels.length; i++) {
		var ls = this.metaLevels[i];
		for (var j = 0; j < ls.length; j++) {
		    var p = ls[j];
		    if (!p.isEmpty()) {
			acc.push("GESTALT metalevel " + i + " level " + j + ":\n");
			if (!is_emptyMatcher(p.subscriptions)) {
			    acc.push("  - subs:");
			    acc.push(prettyMatcher(p.subscriptions, 9));
			    acc.push("\n");
			}
			if (!is_emptyMatcher(p.advertisements)) {
			    acc.push("  - advs:");
			    acc.push(prettyMatcher(p.advertisements, 9));
			    acc.push("\n");
			}
		    }
		}
	    }
	}
	return acc.join('');
    };

    Gestalt.prototype.serialize = function () {
	function serializeSuccess(v) { return v === true ? true : setToArray(v); }
	return ["gestalt", mapLevels(this.metaLevels, function (p) {
	    return [serializeMatcher(p.subscriptions, serializeSuccess),
		    serializeMatcher(p.advertisements, serializeSuccess)];
	}, function (pr) {
	    return pr.length === 2 && pr[0].length === 0 && pr[1].length === 0;
	}, [[],[]])];
    };

    function deserializeGestalt(r) {
	if (r[0] !== "gestalt") die("Invalid gestalt serialization: " + r);
	function deserializeSuccess(v) { return v === true ? true : arrayToSet(v); }
	return new Gestalt(mapLevels(r[1], function (pr) {
	    return new GestaltLevel(deserializeMatcher(pr[0], deserializeSuccess),
				    deserializeMatcher(pr[1], deserializeSuccess));
	}, function (p) {
	    return p.isEmpty();
	}, emptyLevel));
    }

    ///////////////////////////////////////////////////////////////////////////

    exports.__ = __;
    exports.arrayToSet = arrayToSet;
    exports.setToArray = setToArray;
    exports.setUnion = setUnion;
    exports.setSubtract = setSubtract;
    exports.setIntersect = setIntersect;
    exports.setEqual = setEqual;
    exports.is_emptySet = is_emptySet;
    exports.$Capture = $Capture;
    exports._$ = _$;
    exports.is_emptyMatcher = is_emptyMatcher;
    exports.emptyMatcher = emptyMatcher;
    exports.compilePattern = compilePattern;
    exports.union = unionN;
    exports.intersect = intersect;
    exports.erasePath = erasePath;
    exports.matchValue = matchValue;
    exports.matchMatcher = matchMatcher;
    exports.relabel = relabel;
    exports.compileProjection = compileProjection;
    exports.projectionToPattern = projectionToPattern;
    exports.project = project;
    exports.matcherKeys = matcherKeys;
    exports.matcherEquals = matcherEquals;
    exports.prettyMatcher = prettyMatcher;
    exports.serializeMatcher = serializeMatcher;
    exports.deserializeMatcher = deserializeMatcher;

    exports.GestaltLevel = GestaltLevel;
    exports.Gestalt = Gestalt;
    exports.simpleGestalt = simpleGestalt;
    exports.emptyGestalt = emptyGestalt;
    exports.gestaltUnion = gestaltUnion;
    exports.deserializeGestalt = deserializeGestalt;
}

if (typeof module !== 'undefined' && module.exports) {
    Routing(module.exports);
} else if (window) {
    window.route = {};
    Routing(window.route);
}
