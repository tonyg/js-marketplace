var expect = require('expect.js');
var util = require('util');
var r = require("../src/route.js");

function checkPrettyMatcher(m, expected) {
  expect(r.prettyMatcher(m)).to.equal(expected.join('\n'));
}

function checkPrettyGestalt(g, expected) {
  expect(g.pretty()).to.equal(expected.join('\n') + '\n');
}

describe("basic pattern compilation", function () {
  var sAny = r.arrayToSet(['mAny']);
  var sAAny = r.arrayToSet(['mAAny']);
  var mAny = r.compilePattern(sAny, r.__);
  var mAAny = r.compilePattern(sAAny, ['A', r.__]);

  it("should print as expected", function () {
    checkPrettyMatcher(mAny, [' ★ >{["mAny"]}']);
    checkPrettyMatcher(mAAny, [' < "A" ★ > >{["mAAny"]}']);
  });

  describe("of wildcard", function () {
    it("should match anything", function () {
      expect(r.matchValue(mAny, 'hi')).to.eql(sAny);
      expect(r.matchValue(mAny, ['A', 'hi'])).to.eql(sAny);
      expect(r.matchValue(mAny, ['B', 'hi'])).to.eql(sAny);
      expect(r.matchValue(mAny, ['A', [['hi']]])).to.eql(sAny);
    });
  });

  describe("of A followed by wildcard", function () {
    it("should match A followed by anything", function () {
      expect(r.matchValue(mAAny, 'hi')).to.be(null);
      expect(r.matchValue(mAAny, ['A', 'hi'])).to.eql(sAAny);
      expect(r.matchValue(mAAny, ['B', 'hi'])).to.be(null);
      expect(r.matchValue(mAAny, ['A', [['hi']]])).to.eql(sAAny);
    });
  });

  it("should observe basic (in)equivalences", function () {
    expect(r.matcherEquals(mAny, mAAny)).to.be(false);
    expect(r.matcherEquals(mAny, mAny)).to.be(true);
    expect(r.matcherEquals(mAAny, mAAny)).to.be(true);
  });
});

describe("unions", function () {
  it("should collapse common prefix wildcard", function () {
    checkPrettyMatcher(r.union(r.compilePattern(r.arrayToSet(['A']), [r.__, 'A']),
			       r.compilePattern(r.arrayToSet(['B']), [r.__, 'B'])),
		       [' < ★ "A" > >{["A"]}',
			'     "B" > >{["B"]}']);
  });

  it("should unroll wildcard unioned with nonwildcard", function () {
    checkPrettyMatcher(r.union(r.compilePattern(r.arrayToSet(['A']), [r.__, 'A']),
			       r.compilePattern(r.arrayToSet(['W']), r.__)),
		       [' ★ >{["W"]}',
			' < ★ "A" ★...> >{["W"]}',
			'         > >{["A","W"]}',
			'     ★...> >{["W"]}',
			'     > >{["W"]}',
			'   > >{["W"]}']);
  });

  it("should properly multiply out", function () {
    checkPrettyMatcher(r.union(r.compilePattern(r.arrayToSet(['A']), [r.__, 2]),
			       r.compilePattern(r.arrayToSet(['C']), [1, 3]),
			       r.compilePattern(r.arrayToSet(['B']), [3, 4])),
		       [' < 1 2 > >{["A"]}',
			'     3 > >{["C"]}',
			'   3 2 > >{["A"]}',
			'     4 > >{["B"]}',
			'   ★ 2 > >{["A"]}']);

    checkPrettyMatcher(r.union(r.compilePattern(r.arrayToSet(['C']), [1, 3]),
			       r.compilePattern(r.arrayToSet(['B']), [3, 4])),
		       [' < 1 3 > >{["C"]}',
			'   3 4 > >{["B"]}']);

    checkPrettyMatcher(r.union(r.compilePattern(r.arrayToSet(['A']), [r.__, 2]),
			       r.compilePattern(r.arrayToSet(['C']), [1, 3])),
		       [' < 1 2 > >{["A"]}',
			'     3 > >{["C"]}',
			'   ★ 2 > >{["A"]}']);

    checkPrettyMatcher(r.union(r.compilePattern(r.arrayToSet(['A']), [r.__, 2]),
			       r.compilePattern(r.arrayToSet(['B']), [3, 4])),
		       [' < 3 2 > >{["A"]}',
			'     4 > >{["B"]}',
			'   ★ 2 > >{["A"]}']);
  });

  it("should correctly construct intermediate values", function () {
    var MU = r.emptyMatcher;
    MU = r.union(MU, r.compilePattern(r.arrayToSet(['A']), [r.__, 2]));
    checkPrettyMatcher(MU, [' < ★ 2 > >{["A"]}']);
    MU = r.union(MU, r.compilePattern(r.arrayToSet(['C']), [1, 3]));
    checkPrettyMatcher(MU, [' < 1 2 > >{["A"]}',
			    '     3 > >{["C"]}',
			    '   ★ 2 > >{["A"]}']);
    MU = r.union(MU, r.compilePattern(r.arrayToSet(['B']), [3, 4]));
    checkPrettyMatcher(MU, [' < 1 2 > >{["A"]}',
			    '     3 > >{["C"]}',
			    '   3 2 > >{["A"]}',
			    '     4 > >{["B"]}',
			    '   ★ 2 > >{["A"]}']);
  });

  it("should handle identical patterns with different pids", function () {
    var m = r.union(r.compilePattern(r.arrayToSet('B'), [2]),
		    r.compilePattern(r.arrayToSet('C'), [3]));
    checkPrettyMatcher(m, [' < 2 > >{["B"]}',
			   '   3 > >{["C"]}']);
    m = r.union(r.compilePattern(r.arrayToSet('A'), [2]), m);
    checkPrettyMatcher(m, [' < 2 > >{["A","B"]}',
			   '   3 > >{["C"]}']);
  });
});

describe("projections", function () {
  describe("with picky structure", function () {
    var proj = r.compileProjection(r._$("v", [[r.__]]));

    it("should include things that match as well as wildcards", function () {
      checkPrettyMatcher(r.project(r.union(r.compilePattern(r.arrayToSet(['A']), r.__),
					   r.compilePattern(r.arrayToSet(['B']), [['b']])),
				   proj),
			 [' < < "b" > > >{["B","A"]}',
			  '     ★ > > >{["A"]}']);
    });

    it("should exclude things that lack the required structure", function () {
      checkPrettyMatcher(r.project(r.union(r.compilePattern(r.arrayToSet(['A']), r.__),
					   r.compilePattern(r.arrayToSet(['B']), ['b'])),
				   proj),
			 [' < < ★ > > >{["A"]}']);
    });
  });

  describe("simple positional", function () {
    var proj = r.compileProjection([r._$, r._$]);

    it("should collapse common prefixes", function () {
      checkPrettyMatcher(r.project(r.union(r.compilePattern(r.arrayToSet(['A']), [1, 2]),
					   r.compilePattern(r.arrayToSet(['C']), [1, 3]),
					   r.compilePattern(r.arrayToSet(['B']), [3, 4])),
				   proj),
			 [' 1 2 >{["A"]}',
			  '   3 >{["C"]}',
			  ' 3 4 >{["B"]}']);
    });

    it("should yield a correct set of results", function () {
      expect(r.matcherKeys(r.project(r.union(r.compilePattern(r.arrayToSet(['A']), [1, 2]),
					     r.compilePattern(r.arrayToSet(['C']), [1, 3]),
					     r.compilePattern(r.arrayToSet(['B']), [3, 4])),
				     proj))).to.eql([[1, 2], [1, 3], [3, 4]]);
    });
  });
});

describe("erasePath after union", function () {
  var R1 = r.compilePattern(r.arrayToSet(['A']), [r.__, "B"]);
  var R2 = r.compilePattern(r.arrayToSet(['B']), ["A", r.__]);
  var R12 = r.union(R1, R2);

  it("should have sane preconditions", function () { // Am I doing this right?
    checkPrettyMatcher(R1, [' < ★ "B" > >{["A"]}']);
    checkPrettyMatcher(R2, [' < "A" ★ > >{["B"]}']);
    checkPrettyMatcher(R12, [' < "A" "B" > >{["B","A"]}',
			     '       ★ > >{["B"]}',
			     '   ★ "B" > >{["A"]}']);
  });

  it("should yield the remaining ingredients of the union", function () {
    expect(r.matcherEquals(r.erasePath(R12, R1), R2)).to.be(true);
    expect(r.matcherEquals(r.erasePath(R12, R2), R1)).to.be(true);
    expect(r.matcherEquals(r.erasePath(R12, R1), R1)).to.be(false);
  });
});

describe("basic gestalt construction", function () {
  it("should print as expected", function () {
    checkPrettyGestalt(r.simpleGestalt(false, "A", 0, 0),
		       ['GESTALT metalevel 0 level 0:',
			'  - subs: "A" >{true}']);
    checkPrettyGestalt(r.simpleGestalt(true, "B", 0, 0),
		       ['GESTALT metalevel 0 level 0:',
			'  - advs: "B" >{true}']);
    checkPrettyGestalt(r.simpleGestalt(false, "A", 0, 0).union(r.simpleGestalt(true, "B", 0, 0)),
		       ['GESTALT metalevel 0 level 0:',
			'  - subs: "A" >{true}',
			'  - advs: "B" >{true}']);

    checkPrettyGestalt(r.simpleGestalt(false, "A", 2, 2),
		       ['GESTALT metalevel 2 level 2:',
			'  - subs: "A" >{true}']);
    checkPrettyGestalt(r.simpleGestalt(true, "B", 2, 2),
		       ['GESTALT metalevel 2 level 2:',
			'  - advs: "B" >{true}']);
    checkPrettyGestalt(r.simpleGestalt(false, "A", 2, 2).union(r.simpleGestalt(true, "B", 2, 2)),
		       ['GESTALT metalevel 2 level 2:',
			'  - subs: "A" >{true}',
			'  - advs: "B" >{true}']);
  });
});

describe("matching", function () {
  function check1(gMetalevel, level, mMetalevel) {
    var g = r.simpleGestalt(false, "A", gMetalevel, level).label(123);
    var result = g.matchValue("A", mMetalevel, false);
    if (gMetalevel === mMetalevel) {
      it("should match at level "+level, function () {
	expect(result).to.eql([123]);
      });
    } else {
      it("should not match at level "+level, function () {
	expect(result).to.eql([]);
      });
    }
  }

  function gMetaLevelCheck(gMetalevel, mMetalevel) {
    describe("at gestalt metalevel "+gMetalevel+", message metalevel "+mMetalevel, function () {
      check1(gMetalevel, 0, mMetalevel);
      check1(gMetalevel, 1, mMetalevel);
      check1(gMetalevel, 2, mMetalevel);
    });
  }

  function mMetaLevelCheck(mMetalevel) {
    gMetaLevelCheck(0, mMetalevel);
    gMetaLevelCheck(2, mMetalevel);
  }

  mMetaLevelCheck(0);
  mMetaLevelCheck(1);
  mMetaLevelCheck(2);
});

describe("gestalt filtering", function () {
  function check1(metalevel, observedLevel, observerLevel) {
    var observer = r.simpleGestalt(true, r.__, metalevel, observerLevel).label("observer");
    var observed = r.simpleGestalt(false, "A", metalevel, observedLevel).label("observed");
    var resultM = observed.filter(observer);
    var resultL = observed.match(observer);
    if (observedLevel < observerLevel) {
      it("should be able to see gestalt at level "+observedLevel, function () {
	expect(resultM.isEmpty()).to.be(false);
	expect(resultL).to.eql(["observer"]);
      });
    } else {
      it("should not be able to see gestalt at level "+observedLevel, function () {
	expect(resultM.isEmpty()).to.be(true);
	expect(resultL).to.eql([]);
      });
    }
  }

  function metalevelCheck(metalevel, observerLevel) {
    describe("observer at level "+observerLevel+" in metalevel "+metalevel, function () {
      check1(metalevel, 0, observerLevel);
      check1(metalevel, 1, observerLevel);
      check1(metalevel, 2, observerLevel);
    });
  }

  function levelCheck(observerLevel) {
    metalevelCheck(0, observerLevel);
    metalevelCheck(2, observerLevel);
  }

  levelCheck(0);
  levelCheck(1);
  levelCheck(2);
});

describe("matcher equality", function () {
  it("should not rely on object identity", function () {
    expect(r.matcherEquals(r.union(r.compilePattern(r.arrayToSet(['A']), [r.__, 'A']),
				   r.compilePattern(r.arrayToSet(['B']), [r.__, 'B'])),
			   r.union(r.compilePattern(r.arrayToSet(['A']), [r.__, 'A']),
				   r.compilePattern(r.arrayToSet(['B']), [r.__, 'B']))))
      .to.be(true);
  });

  it("should respect commutativity of union", function () {
    expect(r.matcherEquals(r.union(r.compilePattern(r.arrayToSet(['A']), [r.__, 'A']),
				   r.compilePattern(r.arrayToSet(['B']), [r.__, 'B'])),
			   r.union(r.compilePattern(r.arrayToSet(['B']), [r.__, 'B']),
				   r.compilePattern(r.arrayToSet(['A']), [r.__, 'A']))))
      .to.be(true);
  });
});

describe("gestalt equality", function () {
  it("should distinguish emptyGestalt reliably", function () {
    expect(r.simpleGestalt(false, r.__, 0, 10)
	   .union(r.simpleGestalt(true, r.__, 0, 10))
	   .equals(r.emptyGestalt))
      .to.be(false);
  });

  it("should not rely on object identity", function () {
    expect(r.simpleGestalt(false, "A", 0, 0).union(r.simpleGestalt(true, "B", 0, 0))
	   .equals(r.simpleGestalt(false, "A", 0, 0).union(r.simpleGestalt(true, "B", 0, 0))))
      .to.be(true);
  });

  it("should respect commutativity of union", function () {
    expect(r.simpleGestalt(false, "A", 0, 0).union(r.simpleGestalt(true, "B", 0, 0))
	   .equals(r.simpleGestalt(true, "B", 0, 0).union(r.simpleGestalt(false, "A", 0, 0))))
      .to.be(true);
  });

  it("should discriminate between advs and subs", function () {
    expect(r.simpleGestalt(false, "A", 0, 0).union(r.simpleGestalt(true, "B", 0, 0))
	   .equals(r.simpleGestalt(false, "B", 0, 0).union(r.simpleGestalt(true, "A", 0, 0))))
      .to.be(false);
  });
});

describe("matcherKeys on wild matchers", function () {
  var M = r.union(r.compilePattern(r.arrayToSet(['A']), [r.__, 2]),
		  r.compilePattern(r.arrayToSet(['C']), [1, 3]),
		  r.compilePattern(r.arrayToSet(['B']), [3, 4]));

  it("should yield null to signal an infinite result", function () {
    expect(r.matcherKeys(r.project(M, r.compileProjection([r._$, r._$])))).to.be(null);
  });

  it("should extract just the second array element successfully", function () {
    expect(r.matcherKeys(r.project(M, r.compileProjection([r.__, r._$])))).to.eql([[2],[3],[4]]);
  });

  var M2 = r.project(M, r.compileProjection([r._$, r._$]));

  it("should survive double-projection", function () {
    expect(r.matcherKeys(r.project(M2, r.compileProjection(r.__, r._$)))).to.eql([[2],[3],[4]]);
  });

  it("should survive embedding and reprojection", function () {
    expect(r.matcherKeys(r.project(r.compilePattern(true, [r.embeddedMatcher(M2)]),
				   r.compileProjection([r.__, r._$])))).to.eql([[2],[3],[4]]);
    expect(r.matcherKeys(r.project(r.compilePattern(true, [[r.embeddedMatcher(M2)]]),
				   r.compileProjection([[r.__, r._$]])))).to.eql([[2],[3],[4]]);
  });
});

describe("matcherKeys using multiple-values in projections", function () {
  var M = r.union(r.compilePattern(r.arrayToSet(['A']), [1, 2]),
		  r.compilePattern(r.arrayToSet(['C']), [1, 3]),
		  r.compilePattern(r.arrayToSet(['B']), [3, 4]));
  var proj = r.compileProjection([r._$, r._$]);
  var M2 = r.project(M, proj);

  it("should be able to extract ordinary values", function () {
    expect(r.matcherKeys(M2))
      .to.eql([[1,2],[1,3],[3,4]]);
  });

  it("should be able to be reprojected as a sequence of more than one value", function () {
    expect(r.matcherKeys(r.project(M2, r.compileProjection(r._$, r._$))))
      .to.eql([[1,2],[1,3],[3,4]]);
  });

  it("should be convertible into objects with $-indexed fields", function () {
    expect(r.matcherKeysToObjects(r.matcherKeys(M2), proj))
      .to.eql([{'$0': 1, '$1': 2}, {'$0': 1, '$1': 3}, {'$0': 3, '$1': 4}]);
    expect(r.projectObjects(M, proj))
      .to.eql([{'$0': 1, '$1': 2}, {'$0': 1, '$1': 3}, {'$0': 3, '$1': 4}]);
  });
});

describe("matcherKeys using multiple-values in projections, with names", function () {
  var M = r.union(r.compilePattern(r.arrayToSet(['A']), [1, 2]),
		  r.compilePattern(r.arrayToSet(['C']), [1, 3]),
		  r.compilePattern(r.arrayToSet(['B']), [3, 4]));

  it("should yield named fields", function () {
    expect(r.projectObjects(M, r.compileProjection([r._$("fst"), r._$("snd")])))
      .to.eql([{'fst': 1, 'snd': 2}, {'fst': 1, 'snd': 3}, {'fst': 3, 'snd': 4}]);
  });

  it("should yield numbered fields where names are missing", function () {
    expect(r.projectObjects(M, r.compileProjection([r._$, r._$("snd")])))
      .to.eql([{'$0': 1, 'snd': 2}, {'$0': 1, 'snd': 3}, {'$0': 3, 'snd': 4}]);
    expect(r.projectObjects(M, r.compileProjection([r._$("fst"), r._$])))
      .to.eql([{'fst': 1, '$1': 2}, {'fst': 1, '$1': 3}, {'fst': 3, '$1': 4}]);
  });
});

describe("serializeMatcher", function () {
  var M = r.union(r.compilePattern(r.arrayToSet(['A']), [r.__, 2]),
		  r.compilePattern(r.arrayToSet(['C']), [1, 3]),
		  r.compilePattern(r.arrayToSet(['D']), [r.__, 3]),
		  r.compilePattern(r.arrayToSet(['B']), [3, 4]));
  var S = r.serializeMatcher(M, r.setToArray);

  it("should basically work", function () {
    expect(S).to.eql(
      [ [ [ '(' ],
	  [ [ 1,
              [ [ 2, [ [ [ ')' ], [ [ [ ')' ], [ '', [ 'A' ] ] ] ] ] ] ],
		[ 3, [ [ [ ')' ], [ [ [ ')' ], [ '', [ 'C', 'D' ] ] ] ] ] ] ] ] ],
	    [ 3,
              [ [ 2, [ [ [ ')' ], [ [ [ ')' ], [ '', [ 'A' ] ] ] ] ] ] ],
		[ 3, [ [ [ ')' ], [ [ [ ')' ], [ '', [ 'D' ] ] ] ] ] ] ],
		[ 4, [ [ [ ')' ], [ [ [ ')' ], [ '', [ 'B' ] ] ] ] ] ] ] ] ],
	    [ [ '__' ],
              [ [ 2, [ [ [ ')' ], [ [ [ ')' ], [ '', [ 'A' ] ] ] ] ] ] ],
		[ 3, [ [ [ ')' ], [ [ [ ')' ], [ '', [ 'D' ] ] ] ] ] ] ] ] ] ] ] ]);
  });

  it("should deserialize to something equivalent", function () {
    expect(r.matcherEquals(M, r.deserializeMatcher(S, r.arrayToSet))).to.be(true);
  });
});

describe("serialize Gestalts", function () {
  var G = r.simpleGestalt(false, "A", 0, 0).union(r.simpleGestalt(true, "B", 2, 2));
  var S = G.serialize();

  it("should basically work", function () {
    expect(S).to.eql(
      [ 'gestalt',
	[ [ [ [ [ 'A', [ [ [ ')' ], [ '', true ] ] ] ] ], [] ] ],
	  [],
	  [ [ [], [] ],
	    [ [], [] ],
	    [ [], [ [ 'B', [ [ [ ')' ], [ '', true ] ] ] ] ] ] ] ] ]);
  });

  it("should deserialize to something equivalent", function () {
    expect(G.equals(r.deserializeGestalt(S))).to.be(true);
  });
});

describe("complex erasure", function () {
  var A = r.compilePattern(r.arrayToSet(['A']), r.__);
  var B = r.union(r.compilePattern(r.arrayToSet(['B']), [[[["foo"]]]]),
		  r.compilePattern(r.arrayToSet(['B']), [[[["bar"]]]]));
  describe("after a union", function () {
    var R0 = r.union(A, B);
    var R1a = r.erasePath(R0, B);
    var R1b = r.erasePath(R0, A);

    it("should yield the other parts of the union", function () {
      expect(r.matcherEquals(R1a, A)).to.be(true);
      expect(r.matcherEquals(R1b, B)).to.be(true);
    });
  });
});

describe("embedding matchers in patterns", function () {
  var M1a =
    r.compilePattern(r.arrayToSet(['A']),
		     [1, r.embeddedMatcher(r.compilePattern(r.arrayToSet(['B']), [2, 3])), 4]);
  var M1b =
    r.compilePattern(r.arrayToSet(['A']), [1, [2, 3], 4]);
  var M2a =
    r.compilePattern(r.arrayToSet(['A']),
		     [r.embeddedMatcher(r.compilePattern(r.arrayToSet(['B']), [1, 2])),
		      r.embeddedMatcher(r.compilePattern(r.arrayToSet(['C']), [3, 4]))]);
  var M2b =
    r.compilePattern(r.arrayToSet(['A']), [[1, 2], [3, 4]]);

  it("should yield matchers equivalent to the original patterns", function () {
    expect(r.matcherEquals(M1a, M1b)).to.be(true);
    expect(r.matcherEquals(M2a, M2b)).to.be(true);
  });
});

describe("calls to matchPattern", function () {
  it("should yield appropriately-named/-numbered fields", function () {
    expect(r.matchPattern([1, 2, 3], [r.__, 2, r._$])).to.eql({'$0': 3, 'length': 1});
    expect(r.matchPattern([1, 2, 3], [r.__, 2, r._$("three")])).to.eql({'three': 3, 'length': 1});
    expect(r.matchPattern([1, 2, 3], [r._$, 2, r._$("three")]))
      .to.eql({'$0': 1, 'three': 3, 'length': 2});
    expect(r.matchPattern([1, 2, 3], [r._$("one"), 2, r._$]))
      .to.eql({'one': 1, '$1': 3, 'length': 2});
    expect(r.matchPattern([1, 2, 3], [r._$("one"), 2, r._$("three")]))
      .to.eql({'one': 1, 'three': 3, 'length': 2});
  });

  it("should fail on value mismatch", function () {
    expect(r.matchPattern([1, 2, 3], [r.__, 999, r._$("three")])).to.be(null);
  });

  it("should fail on array length mismatch", function () {
    expect(r.matchPattern([1, 2, 3], [r.__, 2, r._$("three"), 4])).to.be(null);
  });

  it("matches substructure", function () {
    expect(r.matchPattern([1, [2, 999], 3], [r._$("one"), r._$(null, [2, r.__]), r._$("three")]))
      .to.eql({ one: 1, '$1': [ 2, 999 ], three: 3, length: 3 });
    expect(r.matchPattern([1, [2, 999], 3], [r._$("one"), r._$("two", [2, r.__]), r._$("three")]))
      .to.eql({ one: 1, two: [ 2, 999 ], three: 3, length: 3 });
    expect(r.matchPattern([1, [999, 2], 3], [r._$("one"), r._$(null, [2, r.__]), r._$("three")]))
      .to.be(null);
    expect(r.matchPattern([1, [999, 2], 3], [r._$("one"), r._$("two", [2, r.__]), r._$("three")]))
      .to.be(null);
  });

  it("matches nested captures", function () {
    expect(r.matchPattern([1, [2, 999], 3], [r._$("one"), r._$(null, [2, r._$]), r._$("three")]))
      .to.eql({ one: 1, '$2': 999, '$1': [ 2, 999 ], three: 3, length: 4 });
    expect(r.matchPattern([1, [2, 999], 3], [r._$("one"), r._$("two", [2, r._$]), r._$("three")]))
      .to.eql({ one: 1, '$2': 999, two: [ 2, 999 ], three: 3, length: 4 });
  });
});

describe("Projection with no captures", function () {
  it("should yield the empty sequence when there's a match", function () {
    var emptySequence = [' >{["A"]}'];

    checkPrettyMatcher(r.project(r.compilePattern(r.arrayToSet(['A']), ["X", r.__]),
				 r.compileProjection(r.__)),
		       emptySequence);
    checkPrettyMatcher(r.project(r.compilePattern(r.arrayToSet(['A']), ["X", r.__]),
				 r.compileProjection([r.__, r.__])),
		       emptySequence);
    checkPrettyMatcher(r.project(r.compilePattern(r.arrayToSet(['A']), ["X", r.__]),
				 r.compileProjection(["X", r.__])),
		       emptySequence);
  });

  it("should yield null when there's no match", function () {
    expect(r.project(r.compilePattern(r.arrayToSet(['A']), ["X", r.__]),
		     r.compileProjection(["Y", r.__]))).to.be(null);
  });

  it("should yield nonempty sequences when there are captures after all", function () {
    checkPrettyMatcher(r.project(r.compilePattern(r.arrayToSet(['A']), ["X", r.__]),
				 r.compileProjection([r.__, r._$])),
		       [' ★ >{["A"]}']);
    checkPrettyMatcher(r.project(r.compilePattern(r.arrayToSet(['A']), ["X", r.__]),
				 r.compileProjection([r._$, r._$])),
		       [' "X" ★ >{["A"]}']);
  });
});
