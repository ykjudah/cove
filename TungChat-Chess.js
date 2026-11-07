"use strict";
var TungChess = (() => {
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __commonJS = (cb, mod) => function __require() {
    try {
      return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
    } catch (e) {
      throw mod = 0, e;
    }
  };

  // node_modules/chess.js/dist/cjs/chess.js
  var require_chess = __commonJS({
    "node_modules/chess.js/dist/cjs/chess.js"(exports) {
      "use strict";
      function rootNode(comment) {
        return comment !== null ? { comment, variations: [] } : { variations: [] };
      }
      function node(move, suffix, nag, comment, variations) {
        const node2 = { move, variations };
        if (suffix) {
          node2.suffix = suffix;
        }
        if (nag) {
          node2.nag = nag;
        }
        if (comment !== null) {
          node2.comment = comment;
        }
        return node2;
      }
      function lineToTree(...nodes) {
        const [root, ...rest] = nodes;
        let parent = root;
        for (const child of rest) {
          if (child !== null) {
            parent.variations = [child, ...child.variations];
            child.variations = [];
            parent = child;
          }
        }
        return root;
      }
      function pgn(headers, game) {
        if (game.marker && game.marker.comment) {
          let node2 = game.root;
          while (true) {
            const next = node2.variations[0];
            if (!next) {
              node2.comment = game.marker.comment;
              break;
            }
            node2 = next;
          }
        }
        return {
          headers,
          root: game.root,
          result: (game.marker && game.marker.result) ?? void 0
        };
      }
      function peg$subclass(child, parent) {
        function C() {
          this.constructor = child;
        }
        C.prototype = parent.prototype;
        child.prototype = new C();
      }
      function peg$SyntaxError(message, expected, found, location) {
        var self = Error.call(this, message);
        if (Object.setPrototypeOf) {
          Object.setPrototypeOf(self, peg$SyntaxError.prototype);
        }
        self.expected = expected;
        self.found = found;
        self.location = location;
        self.name = "SyntaxError";
        return self;
      }
      peg$subclass(peg$SyntaxError, Error);
      function peg$padEnd(str, targetLength, padString) {
        padString = padString || " ";
        if (str.length > targetLength) {
          return str;
        }
        targetLength -= str.length;
        padString += padString.repeat(targetLength);
        return str + padString.slice(0, targetLength);
      }
      peg$SyntaxError.prototype.format = function(sources) {
        var str = "Error: " + this.message;
        if (this.location) {
          var src = null;
          var k;
          for (k = 0; k < sources.length; k++) {
            if (sources[k].source === this.location.source) {
              src = sources[k].text.split(/\r\n|\n|\r/g);
              break;
            }
          }
          var s = this.location.start;
          var offset_s = this.location.source && typeof this.location.source.offset === "function" ? this.location.source.offset(s) : s;
          var loc = this.location.source + ":" + offset_s.line + ":" + offset_s.column;
          if (src) {
            var e = this.location.end;
            var filler = peg$padEnd("", offset_s.line.toString().length, " ");
            var line = src[s.line - 1];
            var last = s.line === e.line ? e.column : line.length + 1;
            var hatLen = last - s.column || 1;
            str += "\n --> " + loc + "\n" + filler + " |\n" + offset_s.line + " | " + line + "\n" + filler + " | " + peg$padEnd("", s.column - 1, " ") + peg$padEnd("", hatLen, "^");
          } else {
            str += "\n at " + loc;
          }
        }
        return str;
      };
      peg$SyntaxError.buildMessage = function(expected, found) {
        var DESCRIBE_EXPECTATION_FNS = {
          literal: function(expectation) {
            return '"' + literalEscape(expectation.text) + '"';
          },
          class: function(expectation) {
            var escapedParts = expectation.parts.map(function(part) {
              return Array.isArray(part) ? classEscape(part[0]) + "-" + classEscape(part[1]) : classEscape(part);
            });
            return "[" + (expectation.inverted ? "^" : "") + escapedParts.join("") + "]";
          },
          any: function() {
            return "any character";
          },
          end: function() {
            return "end of input";
          },
          other: function(expectation) {
            return expectation.description;
          }
        };
        function hex(ch) {
          return ch.charCodeAt(0).toString(16).toUpperCase();
        }
        function literalEscape(s) {
          return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\0/g, "\\0").replace(/\t/g, "\\t").replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/[\x00-\x0F]/g, function(ch) {
            return "\\x0" + hex(ch);
          }).replace(/[\x10-\x1F\x7F-\x9F]/g, function(ch) {
            return "\\x" + hex(ch);
          });
        }
        function classEscape(s) {
          return s.replace(/\\/g, "\\\\").replace(/\]/g, "\\]").replace(/\^/g, "\\^").replace(/-/g, "\\-").replace(/\0/g, "\\0").replace(/\t/g, "\\t").replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/[\x00-\x0F]/g, function(ch) {
            return "\\x0" + hex(ch);
          }).replace(/[\x10-\x1F\x7F-\x9F]/g, function(ch) {
            return "\\x" + hex(ch);
          });
        }
        function describeExpectation(expectation) {
          return DESCRIBE_EXPECTATION_FNS[expectation.type](expectation);
        }
        function describeExpected(expected2) {
          var descriptions = expected2.map(describeExpectation);
          var i, j;
          descriptions.sort();
          if (descriptions.length > 0) {
            for (i = 1, j = 1; i < descriptions.length; i++) {
              if (descriptions[i - 1] !== descriptions[i]) {
                descriptions[j] = descriptions[i];
                j++;
              }
            }
            descriptions.length = j;
          }
          switch (descriptions.length) {
            case 1:
              return descriptions[0];
            case 2:
              return descriptions[0] + " or " + descriptions[1];
            default:
              return descriptions.slice(0, -1).join(", ") + ", or " + descriptions[descriptions.length - 1];
          }
        }
        function describeFound(found2) {
          return found2 ? '"' + literalEscape(found2) + '"' : "end of input";
        }
        return "Expected " + describeExpected(expected) + " but " + describeFound(found) + " found.";
      };
      function peg$parse(input, options) {
        options = options !== void 0 ? options : {};
        var peg$FAILED = {};
        var peg$source = options.grammarSource;
        var peg$startRuleFunctions = { pgn: peg$parsepgn };
        var peg$startRuleFunction = peg$parsepgn;
        var peg$c0 = "[";
        var peg$c1 = '"';
        var peg$c2 = "]";
        var peg$c3 = ".";
        var peg$c4 = "O-O-O";
        var peg$c5 = "O-O";
        var peg$c6 = "0-0-0";
        var peg$c7 = "0-0";
        var peg$c8 = "$";
        var peg$c9 = "{";
        var peg$c10 = "}";
        var peg$c11 = ";";
        var peg$c12 = "(";
        var peg$c13 = ")";
        var peg$c14 = "1-0";
        var peg$c15 = "0-1";
        var peg$c16 = "1/2-1/2";
        var peg$c17 = "*";
        var peg$r0 = /^[a-zA-Z]/;
        var peg$r1 = /^[^"]/;
        var peg$r2 = /^[0-9]/;
        var peg$r3 = /^[.]/;
        var peg$r4 = /^[a-zA-Z1-8\-=]/;
        var peg$r5 = /^[+#]/;
        var peg$r6 = /^[!?]/;
        var peg$r7 = /^[^}]/;
        var peg$r8 = /^[^\r\n]/;
        var peg$r9 = /^[ \t\r\n]/;
        var peg$e0 = peg$otherExpectation("tag pair");
        var peg$e1 = peg$literalExpectation("[", false);
        var peg$e2 = peg$literalExpectation('"', false);
        var peg$e3 = peg$literalExpectation("]", false);
        var peg$e4 = peg$otherExpectation("tag name");
        var peg$e5 = peg$classExpectation([["a", "z"], ["A", "Z"]], false, false);
        var peg$e6 = peg$otherExpectation("tag value");
        var peg$e7 = peg$classExpectation(['"'], true, false);
        var peg$e8 = peg$otherExpectation("move number");
        var peg$e9 = peg$classExpectation([["0", "9"]], false, false);
        var peg$e10 = peg$literalExpectation(".", false);
        var peg$e11 = peg$classExpectation(["."], false, false);
        var peg$e12 = peg$otherExpectation("standard algebraic notation");
        var peg$e13 = peg$literalExpectation("O-O-O", false);
        var peg$e14 = peg$literalExpectation("O-O", false);
        var peg$e15 = peg$literalExpectation("0-0-0", false);
        var peg$e16 = peg$literalExpectation("0-0", false);
        var peg$e17 = peg$classExpectation([["a", "z"], ["A", "Z"], ["1", "8"], "-", "="], false, false);
        var peg$e18 = peg$classExpectation(["+", "#"], false, false);
        var peg$e19 = peg$otherExpectation("suffix annotation");
        var peg$e20 = peg$classExpectation(["!", "?"], false, false);
        var peg$e21 = peg$otherExpectation("NAG");
        var peg$e22 = peg$literalExpectation("$", false);
        var peg$e23 = peg$otherExpectation("brace comment");
        var peg$e24 = peg$literalExpectation("{", false);
        var peg$e25 = peg$classExpectation(["}"], true, false);
        var peg$e26 = peg$literalExpectation("}", false);
        var peg$e27 = peg$otherExpectation("rest of line comment");
        var peg$e28 = peg$literalExpectation(";", false);
        var peg$e29 = peg$classExpectation(["\r", "\n"], true, false);
        var peg$e30 = peg$otherExpectation("variation");
        var peg$e31 = peg$literalExpectation("(", false);
        var peg$e32 = peg$literalExpectation(")", false);
        var peg$e33 = peg$otherExpectation("game termination marker");
        var peg$e34 = peg$literalExpectation("1-0", false);
        var peg$e35 = peg$literalExpectation("0-1", false);
        var peg$e36 = peg$literalExpectation("1/2-1/2", false);
        var peg$e37 = peg$literalExpectation("*", false);
        var peg$e38 = peg$otherExpectation("whitespace");
        var peg$e39 = peg$classExpectation([" ", "	", "\r", "\n"], false, false);
        var peg$f0 = function(headers, game) {
          return pgn(headers, game);
        };
        var peg$f1 = function(tagPairs) {
          return Object.fromEntries(tagPairs);
        };
        var peg$f2 = function(tagName, tagValue) {
          return [tagName, tagValue];
        };
        var peg$f3 = function(root, marker) {
          return { root, marker };
        };
        var peg$f4 = function(comment, moves) {
          return lineToTree(rootNode(comment), ...moves.flat());
        };
        var peg$f5 = function(san, suffix, nag, comment, variations) {
          return node(san, suffix, nag, comment, variations);
        };
        var peg$f6 = function(nag) {
          return nag;
        };
        var peg$f7 = function(comment) {
          return comment.replace(/[\r\n]+/g, " ");
        };
        var peg$f8 = function(comment) {
          return comment.trim();
        };
        var peg$f9 = function(line) {
          return line;
        };
        var peg$f10 = function(result, comment) {
          return { result, comment };
        };
        var peg$currPos = options.peg$currPos | 0;
        var peg$posDetailsCache = [{ line: 1, column: 1 }];
        var peg$maxFailPos = peg$currPos;
        var peg$maxFailExpected = options.peg$maxFailExpected || [];
        var peg$silentFails = options.peg$silentFails | 0;
        var peg$result;
        if (options.startRule) {
          if (!(options.startRule in peg$startRuleFunctions)) {
            throw new Error(`Can't start parsing from rule "` + options.startRule + '".');
          }
          peg$startRuleFunction = peg$startRuleFunctions[options.startRule];
        }
        function peg$literalExpectation(text, ignoreCase) {
          return { type: "literal", text, ignoreCase };
        }
        function peg$classExpectation(parts, inverted, ignoreCase) {
          return { type: "class", parts, inverted, ignoreCase };
        }
        function peg$endExpectation() {
          return { type: "end" };
        }
        function peg$otherExpectation(description) {
          return { type: "other", description };
        }
        function peg$computePosDetails(pos) {
          var details = peg$posDetailsCache[pos];
          var p;
          if (details) {
            return details;
          } else {
            if (pos >= peg$posDetailsCache.length) {
              p = peg$posDetailsCache.length - 1;
            } else {
              p = pos;
              while (!peg$posDetailsCache[--p]) {
              }
            }
            details = peg$posDetailsCache[p];
            details = {
              line: details.line,
              column: details.column
            };
            while (p < pos) {
              if (input.charCodeAt(p) === 10) {
                details.line++;
                details.column = 1;
              } else {
                details.column++;
              }
              p++;
            }
            peg$posDetailsCache[pos] = details;
            return details;
          }
        }
        function peg$computeLocation(startPos, endPos, offset) {
          var startPosDetails = peg$computePosDetails(startPos);
          var endPosDetails = peg$computePosDetails(endPos);
          var res = {
            source: peg$source,
            start: {
              offset: startPos,
              line: startPosDetails.line,
              column: startPosDetails.column
            },
            end: {
              offset: endPos,
              line: endPosDetails.line,
              column: endPosDetails.column
            }
          };
          return res;
        }
        function peg$fail(expected) {
          if (peg$currPos < peg$maxFailPos) {
            return;
          }
          if (peg$currPos > peg$maxFailPos) {
            peg$maxFailPos = peg$currPos;
            peg$maxFailExpected = [];
          }
          peg$maxFailExpected.push(expected);
        }
        function peg$buildStructuredError(expected, found, location) {
          return new peg$SyntaxError(
            peg$SyntaxError.buildMessage(expected, found),
            expected,
            found,
            location
          );
        }
        function peg$parsepgn() {
          var s0, s1, s2;
          s0 = peg$currPos;
          s1 = peg$parsetagPairSection();
          s2 = peg$parsemoveTextSection();
          s0 = peg$f0(s1, s2);
          return s0;
        }
        function peg$parsetagPairSection() {
          var s0, s1, s2;
          s0 = peg$currPos;
          s1 = [];
          s2 = peg$parsetagPair();
          while (s2 !== peg$FAILED) {
            s1.push(s2);
            s2 = peg$parsetagPair();
          }
          s2 = peg$parse_();
          s0 = peg$f1(s1);
          return s0;
        }
        function peg$parsetagPair() {
          var s0, s2, s4, s6, s7, s8, s10;
          peg$silentFails++;
          s0 = peg$currPos;
          peg$parse_();
          if (input.charCodeAt(peg$currPos) === 91) {
            s2 = peg$c0;
            peg$currPos++;
          } else {
            s2 = peg$FAILED;
            if (peg$silentFails === 0) {
              peg$fail(peg$e1);
            }
          }
          if (s2 !== peg$FAILED) {
            peg$parse_();
            s4 = peg$parsetagName();
            if (s4 !== peg$FAILED) {
              peg$parse_();
              if (input.charCodeAt(peg$currPos) === 34) {
                s6 = peg$c1;
                peg$currPos++;
              } else {
                s6 = peg$FAILED;
                if (peg$silentFails === 0) {
                  peg$fail(peg$e2);
                }
              }
              if (s6 !== peg$FAILED) {
                s7 = peg$parsetagValue();
                if (input.charCodeAt(peg$currPos) === 34) {
                  s8 = peg$c1;
                  peg$currPos++;
                } else {
                  s8 = peg$FAILED;
                  if (peg$silentFails === 0) {
                    peg$fail(peg$e2);
                  }
                }
                if (s8 !== peg$FAILED) {
                  peg$parse_();
                  if (input.charCodeAt(peg$currPos) === 93) {
                    s10 = peg$c2;
                    peg$currPos++;
                  } else {
                    s10 = peg$FAILED;
                    if (peg$silentFails === 0) {
                      peg$fail(peg$e3);
                    }
                  }
                  if (s10 !== peg$FAILED) {
                    s0 = peg$f2(s4, s7);
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
          peg$silentFails--;
          if (s0 === peg$FAILED) {
            if (peg$silentFails === 0) {
              peg$fail(peg$e0);
            }
          }
          return s0;
        }
        function peg$parsetagName() {
          var s0, s1, s2;
          peg$silentFails++;
          s0 = peg$currPos;
          s1 = [];
          s2 = input.charAt(peg$currPos);
          if (peg$r0.test(s2)) {
            peg$currPos++;
          } else {
            s2 = peg$FAILED;
            if (peg$silentFails === 0) {
              peg$fail(peg$e5);
            }
          }
          if (s2 !== peg$FAILED) {
            while (s2 !== peg$FAILED) {
              s1.push(s2);
              s2 = input.charAt(peg$currPos);
              if (peg$r0.test(s2)) {
                peg$currPos++;
              } else {
                s2 = peg$FAILED;
                if (peg$silentFails === 0) {
                  peg$fail(peg$e5);
                }
              }
            }
          } else {
            s1 = peg$FAILED;
          }
          if (s1 !== peg$FAILED) {
            s0 = input.substring(s0, peg$currPos);
          } else {
            s0 = s1;
          }
          peg$silentFails--;
          if (s0 === peg$FAILED) {
            s1 = peg$FAILED;
            if (peg$silentFails === 0) {
              peg$fail(peg$e4);
            }
          }
          return s0;
        }
        function peg$parsetagValue() {
          var s0, s1, s2;
          peg$silentFails++;
          s0 = peg$currPos;
          s1 = [];
          s2 = input.charAt(peg$currPos);
          if (peg$r1.test(s2)) {
            peg$currPos++;
          } else {
            s2 = peg$FAILED;
            if (peg$silentFails === 0) {
              peg$fail(peg$e7);
            }
          }
          while (s2 !== peg$FAILED) {
            s1.push(s2);
            s2 = input.charAt(peg$currPos);
            if (peg$r1.test(s2)) {
              peg$currPos++;
            } else {
              s2 = peg$FAILED;
              if (peg$silentFails === 0) {
                peg$fail(peg$e7);
              }
            }
          }
          s0 = input.substring(s0, peg$currPos);
          peg$silentFails--;
          s1 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$e6);
          }
          return s0;
        }
        function peg$parsemoveTextSection() {
          var s0, s1, s3;
          s0 = peg$currPos;
          s1 = peg$parseline();
          peg$parse_();
          s3 = peg$parsegameTerminationMarker();
          if (s3 === peg$FAILED) {
            s3 = null;
          }
          peg$parse_();
          s0 = peg$f3(s1, s3);
          return s0;
        }
        function peg$parseline() {
          var s0, s1, s2, s3;
          s0 = peg$currPos;
          s1 = peg$parsecomment();
          if (s1 === peg$FAILED) {
            s1 = null;
          }
          s2 = [];
          s3 = peg$parsemove();
          while (s3 !== peg$FAILED) {
            s2.push(s3);
            s3 = peg$parsemove();
          }
          s0 = peg$f4(s1, s2);
          return s0;
        }
        function peg$parsemove() {
          var s0, s4, s5, s6, s7, s8, s9, s10;
          s0 = peg$currPos;
          peg$parse_();
          peg$parsemoveNumber();
          peg$parse_();
          s4 = peg$parsesan();
          if (s4 !== peg$FAILED) {
            s5 = peg$parsesuffixAnnotation();
            if (s5 === peg$FAILED) {
              s5 = null;
            }
            s6 = [];
            s7 = peg$parsenag();
            while (s7 !== peg$FAILED) {
              s6.push(s7);
              s7 = peg$parsenag();
            }
            s7 = peg$parse_();
            s8 = peg$parsecomment();
            if (s8 === peg$FAILED) {
              s8 = null;
            }
            s9 = [];
            s10 = peg$parsevariation();
            while (s10 !== peg$FAILED) {
              s9.push(s10);
              s10 = peg$parsevariation();
            }
            s0 = peg$f5(s4, s5, s6, s8, s9);
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
          return s0;
        }
        function peg$parsemoveNumber() {
          var s0, s1, s2, s3, s4, s5;
          peg$silentFails++;
          s0 = peg$currPos;
          s1 = [];
          s2 = input.charAt(peg$currPos);
          if (peg$r2.test(s2)) {
            peg$currPos++;
          } else {
            s2 = peg$FAILED;
            if (peg$silentFails === 0) {
              peg$fail(peg$e9);
            }
          }
          while (s2 !== peg$FAILED) {
            s1.push(s2);
            s2 = input.charAt(peg$currPos);
            if (peg$r2.test(s2)) {
              peg$currPos++;
            } else {
              s2 = peg$FAILED;
              if (peg$silentFails === 0) {
                peg$fail(peg$e9);
              }
            }
          }
          if (input.charCodeAt(peg$currPos) === 46) {
            s2 = peg$c3;
            peg$currPos++;
          } else {
            s2 = peg$FAILED;
            if (peg$silentFails === 0) {
              peg$fail(peg$e10);
            }
          }
          if (s2 !== peg$FAILED) {
            s3 = peg$parse_();
            s4 = [];
            s5 = input.charAt(peg$currPos);
            if (peg$r3.test(s5)) {
              peg$currPos++;
            } else {
              s5 = peg$FAILED;
              if (peg$silentFails === 0) {
                peg$fail(peg$e11);
              }
            }
            while (s5 !== peg$FAILED) {
              s4.push(s5);
              s5 = input.charAt(peg$currPos);
              if (peg$r3.test(s5)) {
                peg$currPos++;
              } else {
                s5 = peg$FAILED;
                if (peg$silentFails === 0) {
                  peg$fail(peg$e11);
                }
              }
            }
            s1 = [s1, s2, s3, s4];
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
          peg$silentFails--;
          if (s0 === peg$FAILED) {
            s1 = peg$FAILED;
            if (peg$silentFails === 0) {
              peg$fail(peg$e8);
            }
          }
          return s0;
        }
        function peg$parsesan() {
          var s0, s1, s2, s3, s4, s5;
          peg$silentFails++;
          s0 = peg$currPos;
          s1 = peg$currPos;
          if (input.substr(peg$currPos, 5) === peg$c4) {
            s2 = peg$c4;
            peg$currPos += 5;
          } else {
            s2 = peg$FAILED;
            if (peg$silentFails === 0) {
              peg$fail(peg$e13);
            }
          }
          if (s2 === peg$FAILED) {
            if (input.substr(peg$currPos, 3) === peg$c5) {
              s2 = peg$c5;
              peg$currPos += 3;
            } else {
              s2 = peg$FAILED;
              if (peg$silentFails === 0) {
                peg$fail(peg$e14);
              }
            }
            if (s2 === peg$FAILED) {
              if (input.substr(peg$currPos, 5) === peg$c6) {
                s2 = peg$c6;
                peg$currPos += 5;
              } else {
                s2 = peg$FAILED;
                if (peg$silentFails === 0) {
                  peg$fail(peg$e15);
                }
              }
              if (s2 === peg$FAILED) {
                if (input.substr(peg$currPos, 3) === peg$c7) {
                  s2 = peg$c7;
                  peg$currPos += 3;
                } else {
                  s2 = peg$FAILED;
                  if (peg$silentFails === 0) {
                    peg$fail(peg$e16);
                  }
                }
                if (s2 === peg$FAILED) {
                  s2 = peg$currPos;
                  s3 = input.charAt(peg$currPos);
                  if (peg$r0.test(s3)) {
                    peg$currPos++;
                  } else {
                    s3 = peg$FAILED;
                    if (peg$silentFails === 0) {
                      peg$fail(peg$e5);
                    }
                  }
                  if (s3 !== peg$FAILED) {
                    s4 = [];
                    s5 = input.charAt(peg$currPos);
                    if (peg$r4.test(s5)) {
                      peg$currPos++;
                    } else {
                      s5 = peg$FAILED;
                      if (peg$silentFails === 0) {
                        peg$fail(peg$e17);
                      }
                    }
                    if (s5 !== peg$FAILED) {
                      while (s5 !== peg$FAILED) {
                        s4.push(s5);
                        s5 = input.charAt(peg$currPos);
                        if (peg$r4.test(s5)) {
                          peg$currPos++;
                        } else {
                          s5 = peg$FAILED;
                          if (peg$silentFails === 0) {
                            peg$fail(peg$e17);
                          }
                        }
                      }
                    } else {
                      s4 = peg$FAILED;
                    }
                    if (s4 !== peg$FAILED) {
                      s3 = [s3, s4];
                      s2 = s3;
                    } else {
                      peg$currPos = s2;
                      s2 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s2;
                    s2 = peg$FAILED;
                  }
                }
              }
            }
          }
          if (s2 !== peg$FAILED) {
            s3 = input.charAt(peg$currPos);
            if (peg$r5.test(s3)) {
              peg$currPos++;
            } else {
              s3 = peg$FAILED;
              if (peg$silentFails === 0) {
                peg$fail(peg$e18);
              }
            }
            if (s3 === peg$FAILED) {
              s3 = null;
            }
            s2 = [s2, s3];
            s1 = s2;
          } else {
            peg$currPos = s1;
            s1 = peg$FAILED;
          }
          if (s1 !== peg$FAILED) {
            s0 = input.substring(s0, peg$currPos);
          } else {
            s0 = s1;
          }
          peg$silentFails--;
          if (s0 === peg$FAILED) {
            s1 = peg$FAILED;
            if (peg$silentFails === 0) {
              peg$fail(peg$e12);
            }
          }
          return s0;
        }
        function peg$parsesuffixAnnotation() {
          var s0, s1, s2;
          peg$silentFails++;
          s0 = peg$currPos;
          s1 = [];
          s2 = input.charAt(peg$currPos);
          if (peg$r6.test(s2)) {
            peg$currPos++;
          } else {
            s2 = peg$FAILED;
            if (peg$silentFails === 0) {
              peg$fail(peg$e20);
            }
          }
          while (s2 !== peg$FAILED) {
            s1.push(s2);
            if (s1.length >= 2) {
              s2 = peg$FAILED;
            } else {
              s2 = input.charAt(peg$currPos);
              if (peg$r6.test(s2)) {
                peg$currPos++;
              } else {
                s2 = peg$FAILED;
                if (peg$silentFails === 0) {
                  peg$fail(peg$e20);
                }
              }
            }
          }
          if (s1.length < 1) {
            peg$currPos = s0;
            s0 = peg$FAILED;
          } else {
            s0 = s1;
          }
          peg$silentFails--;
          if (s0 === peg$FAILED) {
            s1 = peg$FAILED;
            if (peg$silentFails === 0) {
              peg$fail(peg$e19);
            }
          }
          return s0;
        }
        function peg$parsenag() {
          var s0, s2, s3, s4, s5;
          peg$silentFails++;
          s0 = peg$currPos;
          peg$parse_();
          if (input.charCodeAt(peg$currPos) === 36) {
            s2 = peg$c8;
            peg$currPos++;
          } else {
            s2 = peg$FAILED;
            if (peg$silentFails === 0) {
              peg$fail(peg$e22);
            }
          }
          if (s2 !== peg$FAILED) {
            s3 = peg$currPos;
            s4 = [];
            s5 = input.charAt(peg$currPos);
            if (peg$r2.test(s5)) {
              peg$currPos++;
            } else {
              s5 = peg$FAILED;
              if (peg$silentFails === 0) {
                peg$fail(peg$e9);
              }
            }
            if (s5 !== peg$FAILED) {
              while (s5 !== peg$FAILED) {
                s4.push(s5);
                s5 = input.charAt(peg$currPos);
                if (peg$r2.test(s5)) {
                  peg$currPos++;
                } else {
                  s5 = peg$FAILED;
                  if (peg$silentFails === 0) {
                    peg$fail(peg$e9);
                  }
                }
              }
            } else {
              s4 = peg$FAILED;
            }
            if (s4 !== peg$FAILED) {
              s3 = input.substring(s3, peg$currPos);
            } else {
              s3 = s4;
            }
            if (s3 !== peg$FAILED) {
              s0 = peg$f6(s3);
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
          peg$silentFails--;
          if (s0 === peg$FAILED) {
            if (peg$silentFails === 0) {
              peg$fail(peg$e21);
            }
          }
          return s0;
        }
        function peg$parsecomment() {
          var s0;
          s0 = peg$parsebraceComment();
          if (s0 === peg$FAILED) {
            s0 = peg$parserestOfLineComment();
          }
          return s0;
        }
        function peg$parsebraceComment() {
          var s0, s1, s2, s3, s4;
          peg$silentFails++;
          s0 = peg$currPos;
          if (input.charCodeAt(peg$currPos) === 123) {
            s1 = peg$c9;
            peg$currPos++;
          } else {
            s1 = peg$FAILED;
            if (peg$silentFails === 0) {
              peg$fail(peg$e24);
            }
          }
          if (s1 !== peg$FAILED) {
            s2 = peg$currPos;
            s3 = [];
            s4 = input.charAt(peg$currPos);
            if (peg$r7.test(s4)) {
              peg$currPos++;
            } else {
              s4 = peg$FAILED;
              if (peg$silentFails === 0) {
                peg$fail(peg$e25);
              }
            }
            while (s4 !== peg$FAILED) {
              s3.push(s4);
              s4 = input.charAt(peg$currPos);
              if (peg$r7.test(s4)) {
                peg$currPos++;
              } else {
                s4 = peg$FAILED;
                if (peg$silentFails === 0) {
                  peg$fail(peg$e25);
                }
              }
            }
            s2 = input.substring(s2, peg$currPos);
            if (input.charCodeAt(peg$currPos) === 125) {
              s3 = peg$c10;
              peg$currPos++;
            } else {
              s3 = peg$FAILED;
              if (peg$silentFails === 0) {
                peg$fail(peg$e26);
              }
            }
            if (s3 !== peg$FAILED) {
              s0 = peg$f7(s2);
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
          peg$silentFails--;
          if (s0 === peg$FAILED) {
            s1 = peg$FAILED;
            if (peg$silentFails === 0) {
              peg$fail(peg$e23);
            }
          }
          return s0;
        }
        function peg$parserestOfLineComment() {
          var s0, s1, s2, s3, s4;
          peg$silentFails++;
          s0 = peg$currPos;
          if (input.charCodeAt(peg$currPos) === 59) {
            s1 = peg$c11;
            peg$currPos++;
          } else {
            s1 = peg$FAILED;
            if (peg$silentFails === 0) {
              peg$fail(peg$e28);
            }
          }
          if (s1 !== peg$FAILED) {
            s2 = peg$currPos;
            s3 = [];
            s4 = input.charAt(peg$currPos);
            if (peg$r8.test(s4)) {
              peg$currPos++;
            } else {
              s4 = peg$FAILED;
              if (peg$silentFails === 0) {
                peg$fail(peg$e29);
              }
            }
            while (s4 !== peg$FAILED) {
              s3.push(s4);
              s4 = input.charAt(peg$currPos);
              if (peg$r8.test(s4)) {
                peg$currPos++;
              } else {
                s4 = peg$FAILED;
                if (peg$silentFails === 0) {
                  peg$fail(peg$e29);
                }
              }
            }
            s2 = input.substring(s2, peg$currPos);
            s0 = peg$f8(s2);
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
          peg$silentFails--;
          if (s0 === peg$FAILED) {
            s1 = peg$FAILED;
            if (peg$silentFails === 0) {
              peg$fail(peg$e27);
            }
          }
          return s0;
        }
        function peg$parsevariation() {
          var s0, s2, s3, s5;
          peg$silentFails++;
          s0 = peg$currPos;
          peg$parse_();
          if (input.charCodeAt(peg$currPos) === 40) {
            s2 = peg$c12;
            peg$currPos++;
          } else {
            s2 = peg$FAILED;
            if (peg$silentFails === 0) {
              peg$fail(peg$e31);
            }
          }
          if (s2 !== peg$FAILED) {
            s3 = peg$parseline();
            if (s3 !== peg$FAILED) {
              peg$parse_();
              if (input.charCodeAt(peg$currPos) === 41) {
                s5 = peg$c13;
                peg$currPos++;
              } else {
                s5 = peg$FAILED;
                if (peg$silentFails === 0) {
                  peg$fail(peg$e32);
                }
              }
              if (s5 !== peg$FAILED) {
                s0 = peg$f9(s3);
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
          peg$silentFails--;
          if (s0 === peg$FAILED) {
            if (peg$silentFails === 0) {
              peg$fail(peg$e30);
            }
          }
          return s0;
        }
        function peg$parsegameTerminationMarker() {
          var s0, s1, s3;
          peg$silentFails++;
          s0 = peg$currPos;
          if (input.substr(peg$currPos, 3) === peg$c14) {
            s1 = peg$c14;
            peg$currPos += 3;
          } else {
            s1 = peg$FAILED;
            if (peg$silentFails === 0) {
              peg$fail(peg$e34);
            }
          }
          if (s1 === peg$FAILED) {
            if (input.substr(peg$currPos, 3) === peg$c15) {
              s1 = peg$c15;
              peg$currPos += 3;
            } else {
              s1 = peg$FAILED;
              if (peg$silentFails === 0) {
                peg$fail(peg$e35);
              }
            }
            if (s1 === peg$FAILED) {
              if (input.substr(peg$currPos, 7) === peg$c16) {
                s1 = peg$c16;
                peg$currPos += 7;
              } else {
                s1 = peg$FAILED;
                if (peg$silentFails === 0) {
                  peg$fail(peg$e36);
                }
              }
              if (s1 === peg$FAILED) {
                if (input.charCodeAt(peg$currPos) === 42) {
                  s1 = peg$c17;
                  peg$currPos++;
                } else {
                  s1 = peg$FAILED;
                  if (peg$silentFails === 0) {
                    peg$fail(peg$e37);
                  }
                }
              }
            }
          }
          if (s1 !== peg$FAILED) {
            peg$parse_();
            s3 = peg$parsecomment();
            if (s3 === peg$FAILED) {
              s3 = null;
            }
            s0 = peg$f10(s1, s3);
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
          peg$silentFails--;
          if (s0 === peg$FAILED) {
            s1 = peg$FAILED;
            if (peg$silentFails === 0) {
              peg$fail(peg$e33);
            }
          }
          return s0;
        }
        function peg$parse_() {
          var s0, s1;
          peg$silentFails++;
          s0 = [];
          s1 = input.charAt(peg$currPos);
          if (peg$r9.test(s1)) {
            peg$currPos++;
          } else {
            s1 = peg$FAILED;
            if (peg$silentFails === 0) {
              peg$fail(peg$e39);
            }
          }
          while (s1 !== peg$FAILED) {
            s0.push(s1);
            s1 = input.charAt(peg$currPos);
            if (peg$r9.test(s1)) {
              peg$currPos++;
            } else {
              s1 = peg$FAILED;
              if (peg$silentFails === 0) {
                peg$fail(peg$e39);
              }
            }
          }
          peg$silentFails--;
          s1 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$e38);
          }
          return s0;
        }
        peg$result = peg$startRuleFunction();
        if (options.peg$library) {
          return (
            /** @type {any} */
            {
              peg$result,
              peg$currPos,
              peg$FAILED,
              peg$maxFailExpected,
              peg$maxFailPos
            }
          );
        }
        if (peg$result !== peg$FAILED && peg$currPos === input.length) {
          return peg$result;
        } else {
          if (peg$result !== peg$FAILED && peg$currPos < input.length) {
            peg$fail(peg$endExpectation());
          }
          throw peg$buildStructuredError(
            peg$maxFailExpected,
            peg$maxFailPos < input.length ? input.charAt(peg$maxFailPos) : null,
            peg$maxFailPos < input.length ? peg$computeLocation(peg$maxFailPos, peg$maxFailPos + 1) : peg$computeLocation(peg$maxFailPos, peg$maxFailPos)
          );
        }
      }
      var MASK64 = 0xffffffffffffffffn;
      function rotl(x, k) {
        return (x << k | x >> 64n - k) & 0xffffffffffffffffn;
      }
      function wrappingMul(x, y) {
        return x * y & MASK64;
      }
      function xoroshiro128(state) {
        return function() {
          let s0 = BigInt(state & MASK64);
          let s1 = BigInt(state >> 64n & MASK64);
          const result = wrappingMul(rotl(wrappingMul(s0, 5n), 7n), 9n);
          s1 ^= s0;
          s0 = (rotl(s0, 24n) ^ s1 ^ s1 << 16n) & MASK64;
          s1 = rotl(s1, 37n);
          state = s1 << 64n | s0;
          return result;
        };
      }
      var rand = xoroshiro128(0xa187eb39cdcaed8f31c4b365b102e01en);
      var PIECE_KEYS = Array.from({ length: 2 }, () => Array.from({ length: 6 }, () => Array.from({ length: 128 }, () => rand())));
      var EP_KEYS = Array.from({ length: 8 }, () => rand());
      var CASTLING_KEYS = Array.from({ length: 16 }, () => rand());
      var SIDE_KEY = rand();
      var WHITE = "w";
      var BLACK = "b";
      var PAWN = "p";
      var KNIGHT = "n";
      var BISHOP = "b";
      var ROOK = "r";
      var QUEEN = "q";
      var KING = "k";
      var DEFAULT_POSITION = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
      var Move = class {
        color;
        from;
        to;
        piece;
        captured;
        promotion;
        /**
         * @deprecated This field is deprecated and will be removed in version 2.0.0.
         * Please use move descriptor functions instead: `isCapture`, `isPromotion`,
         * `isEnPassant`, `isKingsideCastle`, `isQueensideCastle`, `isCastle`, and
         * `isBigPawn`
         */
        flags;
        san;
        lan;
        before;
        after;
        constructor(chess, internal) {
          const { color, piece, from, to, flags, captured, promotion } = internal;
          const fromAlgebraic = algebraic(from);
          const toAlgebraic = algebraic(to);
          this.color = color;
          this.piece = piece;
          this.from = fromAlgebraic;
          this.to = toAlgebraic;
          this.san = chess["_moveToSan"](internal, chess["_moves"]({ legal: true }));
          this.lan = fromAlgebraic + toAlgebraic;
          this.before = chess.fen();
          chess["_makeMove"](internal);
          this.after = chess.fen();
          chess["_undoMove"]();
          this.flags = "";
          for (const flag in BITS) {
            if (BITS[flag] & flags) {
              this.flags += FLAGS[flag];
            }
          }
          if (captured) {
            this.captured = captured;
          }
          if (promotion) {
            this.promotion = promotion;
            this.lan += promotion;
          }
        }
        isCapture() {
          return this.flags.indexOf(FLAGS["CAPTURE"]) > -1;
        }
        isPromotion() {
          return this.flags.indexOf(FLAGS["PROMOTION"]) > -1;
        }
        isEnPassant() {
          return this.flags.indexOf(FLAGS["EP_CAPTURE"]) > -1;
        }
        isKingsideCastle() {
          return this.flags.indexOf(FLAGS["KSIDE_CASTLE"]) > -1;
        }
        isQueensideCastle() {
          return this.flags.indexOf(FLAGS["QSIDE_CASTLE"]) > -1;
        }
        isBigPawn() {
          return this.flags.indexOf(FLAGS["BIG_PAWN"]) > -1;
        }
      };
      var EMPTY = -1;
      var FLAGS = {
        NORMAL: "n",
        CAPTURE: "c",
        BIG_PAWN: "b",
        EP_CAPTURE: "e",
        PROMOTION: "p",
        KSIDE_CASTLE: "k",
        QSIDE_CASTLE: "q",
        NULL_MOVE: "-"
      };
      var SQUARES = [
        "a8",
        "b8",
        "c8",
        "d8",
        "e8",
        "f8",
        "g8",
        "h8",
        "a7",
        "b7",
        "c7",
        "d7",
        "e7",
        "f7",
        "g7",
        "h7",
        "a6",
        "b6",
        "c6",
        "d6",
        "e6",
        "f6",
        "g6",
        "h6",
        "a5",
        "b5",
        "c5",
        "d5",
        "e5",
        "f5",
        "g5",
        "h5",
        "a4",
        "b4",
        "c4",
        "d4",
        "e4",
        "f4",
        "g4",
        "h4",
        "a3",
        "b3",
        "c3",
        "d3",
        "e3",
        "f3",
        "g3",
        "h3",
        "a2",
        "b2",
        "c2",
        "d2",
        "e2",
        "f2",
        "g2",
        "h2",
        "a1",
        "b1",
        "c1",
        "d1",
        "e1",
        "f1",
        "g1",
        "h1"
      ];
      var BITS = {
        NORMAL: 1,
        CAPTURE: 2,
        BIG_PAWN: 4,
        EP_CAPTURE: 8,
        PROMOTION: 16,
        KSIDE_CASTLE: 32,
        QSIDE_CASTLE: 64,
        NULL_MOVE: 128
      };
      var SEVEN_TAG_ROSTER = {
        Event: "?",
        Site: "?",
        Date: "????.??.??",
        Round: "?",
        White: "?",
        Black: "?",
        Result: "*"
      };
      var SUPLEMENTAL_TAGS = {
        WhiteTitle: null,
        BlackTitle: null,
        WhiteElo: null,
        BlackElo: null,
        WhiteUSCF: null,
        BlackUSCF: null,
        WhiteNA: null,
        BlackNA: null,
        WhiteType: null,
        BlackType: null,
        EventDate: null,
        EventSponsor: null,
        Section: null,
        Stage: null,
        Board: null,
        Opening: null,
        Variation: null,
        SubVariation: null,
        ECO: null,
        NIC: null,
        Time: null,
        UTCTime: null,
        UTCDate: null,
        TimeControl: null,
        SetUp: null,
        FEN: null,
        Termination: null,
        Annotator: null,
        Mode: null,
        PlyCount: null
      };
      var HEADER_TEMPLATE = {
        ...SEVEN_TAG_ROSTER,
        ...SUPLEMENTAL_TAGS
      };
      var Ox88 = {
        a8: 0,
        b8: 1,
        c8: 2,
        d8: 3,
        e8: 4,
        f8: 5,
        g8: 6,
        h8: 7,
        a7: 16,
        b7: 17,
        c7: 18,
        d7: 19,
        e7: 20,
        f7: 21,
        g7: 22,
        h7: 23,
        a6: 32,
        b6: 33,
        c6: 34,
        d6: 35,
        e6: 36,
        f6: 37,
        g6: 38,
        h6: 39,
        a5: 48,
        b5: 49,
        c5: 50,
        d5: 51,
        e5: 52,
        f5: 53,
        g5: 54,
        h5: 55,
        a4: 64,
        b4: 65,
        c4: 66,
        d4: 67,
        e4: 68,
        f4: 69,
        g4: 70,
        h4: 71,
        a3: 80,
        b3: 81,
        c3: 82,
        d3: 83,
        e3: 84,
        f3: 85,
        g3: 86,
        h3: 87,
        a2: 96,
        b2: 97,
        c2: 98,
        d2: 99,
        e2: 100,
        f2: 101,
        g2: 102,
        h2: 103,
        a1: 112,
        b1: 113,
        c1: 114,
        d1: 115,
        e1: 116,
        f1: 117,
        g1: 118,
        h1: 119
      };
      var PAWN_OFFSETS = {
        b: [16, 32, 17, 15],
        w: [-16, -32, -17, -15]
      };
      var PIECE_OFFSETS = {
        n: [-18, -33, -31, -14, 18, 33, 31, 14],
        b: [-17, -15, 17, 15],
        r: [-16, 1, 16, -1],
        q: [-17, -16, -15, 1, 17, 16, 15, -1],
        k: [-17, -16, -15, 1, 17, 16, 15, -1]
      };
      var ATTACKS = [
        20,
        0,
        0,
        0,
        0,
        0,
        0,
        24,
        0,
        0,
        0,
        0,
        0,
        0,
        20,
        0,
        0,
        20,
        0,
        0,
        0,
        0,
        0,
        24,
        0,
        0,
        0,
        0,
        0,
        20,
        0,
        0,
        0,
        0,
        20,
        0,
        0,
        0,
        0,
        24,
        0,
        0,
        0,
        0,
        20,
        0,
        0,
        0,
        0,
        0,
        0,
        20,
        0,
        0,
        0,
        24,
        0,
        0,
        0,
        20,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        20,
        0,
        0,
        24,
        0,
        0,
        20,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        20,
        2,
        24,
        2,
        20,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        2,
        53,
        56,
        53,
        2,
        0,
        0,
        0,
        0,
        0,
        0,
        24,
        24,
        24,
        24,
        24,
        24,
        56,
        0,
        56,
        24,
        24,
        24,
        24,
        24,
        24,
        0,
        0,
        0,
        0,
        0,
        0,
        2,
        53,
        56,
        53,
        2,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        20,
        2,
        24,
        2,
        20,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        20,
        0,
        0,
        24,
        0,
        0,
        20,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        20,
        0,
        0,
        0,
        24,
        0,
        0,
        0,
        20,
        0,
        0,
        0,
        0,
        0,
        0,
        20,
        0,
        0,
        0,
        0,
        24,
        0,
        0,
        0,
        0,
        20,
        0,
        0,
        0,
        0,
        20,
        0,
        0,
        0,
        0,
        0,
        24,
        0,
        0,
        0,
        0,
        0,
        20,
        0,
        0,
        20,
        0,
        0,
        0,
        0,
        0,
        0,
        24,
        0,
        0,
        0,
        0,
        0,
        0,
        20
      ];
      var RAYS = [
        17,
        0,
        0,
        0,
        0,
        0,
        0,
        16,
        0,
        0,
        0,
        0,
        0,
        0,
        15,
        0,
        0,
        17,
        0,
        0,
        0,
        0,
        0,
        16,
        0,
        0,
        0,
        0,
        0,
        15,
        0,
        0,
        0,
        0,
        17,
        0,
        0,
        0,
        0,
        16,
        0,
        0,
        0,
        0,
        15,
        0,
        0,
        0,
        0,
        0,
        0,
        17,
        0,
        0,
        0,
        16,
        0,
        0,
        0,
        15,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        17,
        0,
        0,
        16,
        0,
        0,
        15,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        17,
        0,
        16,
        0,
        15,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        17,
        16,
        15,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        0,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        -1,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        -15,
        -16,
        -17,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        -15,
        0,
        -16,
        0,
        -17,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        -15,
        0,
        0,
        -16,
        0,
        0,
        -17,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        -15,
        0,
        0,
        0,
        -16,
        0,
        0,
        0,
        -17,
        0,
        0,
        0,
        0,
        0,
        0,
        -15,
        0,
        0,
        0,
        0,
        -16,
        0,
        0,
        0,
        0,
        -17,
        0,
        0,
        0,
        0,
        -15,
        0,
        0,
        0,
        0,
        0,
        -16,
        0,
        0,
        0,
        0,
        0,
        -17,
        0,
        0,
        -15,
        0,
        0,
        0,
        0,
        0,
        0,
        -16,
        0,
        0,
        0,
        0,
        0,
        0,
        -17
      ];
      var PIECE_MASKS = { p: 1, n: 2, b: 4, r: 8, q: 16, k: 32 };
      var SYMBOLS = "pnbrqkPNBRQK";
      var PROMOTIONS = [KNIGHT, BISHOP, ROOK, QUEEN];
      var RANK_1 = 7;
      var RANK_2 = 6;
      var RANK_7 = 1;
      var RANK_8 = 0;
      var SIDES = {
        [KING]: BITS.KSIDE_CASTLE,
        [QUEEN]: BITS.QSIDE_CASTLE
      };
      var ROOKS = {
        w: [
          { square: Ox88.a1, flag: BITS.QSIDE_CASTLE },
          { square: Ox88.h1, flag: BITS.KSIDE_CASTLE }
        ],
        b: [
          { square: Ox88.a8, flag: BITS.QSIDE_CASTLE },
          { square: Ox88.h8, flag: BITS.KSIDE_CASTLE }
        ]
      };
      var SECOND_RANK = { b: RANK_7, w: RANK_2 };
      var SAN_NULLMOVE = "--";
      function rank(square) {
        return square >> 4;
      }
      function file(square) {
        return square & 15;
      }
      function isDigit(c) {
        return "0123456789".indexOf(c) !== -1;
      }
      function algebraic(square) {
        const f = file(square);
        const r = rank(square);
        return "abcdefgh".substring(f, f + 1) + "87654321".substring(r, r + 1);
      }
      function swapColor(color) {
        return color === WHITE ? BLACK : WHITE;
      }
      function validateFen(fen) {
        const tokens = fen.split(/\s+/);
        if (tokens.length !== 6) {
          return {
            ok: false,
            error: "Invalid FEN: must contain six space-delimited fields"
          };
        }
        const moveNumber = parseInt(tokens[5], 10);
        if (isNaN(moveNumber) || moveNumber <= 0) {
          return {
            ok: false,
            error: "Invalid FEN: move number must be a positive integer"
          };
        }
        const halfMoves = parseInt(tokens[4], 10);
        if (isNaN(halfMoves) || halfMoves < 0) {
          return {
            ok: false,
            error: "Invalid FEN: half move counter number must be a non-negative integer"
          };
        }
        if (!/^(-|[abcdefgh][36])$/.test(tokens[3])) {
          return { ok: false, error: "Invalid FEN: en-passant square is invalid" };
        }
        if (/[^kKqQ-]/.test(tokens[2])) {
          return { ok: false, error: "Invalid FEN: castling availability is invalid" };
        }
        if (!/^(w|b)$/.test(tokens[1])) {
          return { ok: false, error: "Invalid FEN: side-to-move is invalid" };
        }
        const rows = tokens[0].split("/");
        if (rows.length !== 8) {
          return {
            ok: false,
            error: "Invalid FEN: piece data does not contain 8 '/'-delimited rows"
          };
        }
        for (let i = 0; i < rows.length; i++) {
          let sumFields = 0;
          let previousWasNumber = false;
          for (let k = 0; k < rows[i].length; k++) {
            if (isDigit(rows[i][k])) {
              if (previousWasNumber) {
                return {
                  ok: false,
                  error: "Invalid FEN: piece data is invalid (consecutive number)"
                };
              }
              sumFields += parseInt(rows[i][k], 10);
              previousWasNumber = true;
            } else {
              if (!/^[prnbqkPRNBQK]$/.test(rows[i][k])) {
                return {
                  ok: false,
                  error: "Invalid FEN: piece data is invalid (invalid piece)"
                };
              }
              sumFields += 1;
              previousWasNumber = false;
            }
          }
          if (sumFields !== 8) {
            return {
              ok: false,
              error: "Invalid FEN: piece data is invalid (too many squares in rank)"
            };
          }
        }
        if (tokens[3][1] == "3" && tokens[1] == "w" || tokens[3][1] == "6" && tokens[1] == "b") {
          return { ok: false, error: "Invalid FEN: illegal en-passant square" };
        }
        const kings = [
          { color: "white", regex: /K/g },
          { color: "black", regex: /k/g }
        ];
        for (const { color, regex } of kings) {
          if (!regex.test(tokens[0])) {
            return { ok: false, error: `Invalid FEN: missing ${color} king` };
          }
          if ((tokens[0].match(regex) || []).length > 1) {
            return { ok: false, error: `Invalid FEN: too many ${color} kings` };
          }
        }
        if (Array.from(rows[0] + rows[7]).some((char) => char.toUpperCase() === "P")) {
          return {
            ok: false,
            error: "Invalid FEN: some pawns are on the edge rows"
          };
        }
        return { ok: true };
      }
      function getDisambiguator(move, moves) {
        const from = move.from;
        const to = move.to;
        const piece = move.piece;
        let ambiguities = 0;
        let sameRank = 0;
        let sameFile = 0;
        for (let i = 0, len = moves.length; i < len; i++) {
          const ambigFrom = moves[i].from;
          const ambigTo = moves[i].to;
          const ambigPiece = moves[i].piece;
          if (piece === ambigPiece && from !== ambigFrom && to === ambigTo) {
            ambiguities++;
            if (rank(from) === rank(ambigFrom)) {
              sameRank++;
            }
            if (file(from) === file(ambigFrom)) {
              sameFile++;
            }
          }
        }
        if (ambiguities > 0) {
          if (sameRank > 0 && sameFile > 0) {
            return algebraic(from);
          } else if (sameFile > 0) {
            return algebraic(from).charAt(1);
          } else {
            return algebraic(from).charAt(0);
          }
        }
        return "";
      }
      function addMove(moves, color, from, to, piece, captured = void 0, flags = BITS.NORMAL) {
        const r = rank(to);
        if (piece === PAWN && (r === RANK_1 || r === RANK_8)) {
          for (let i = 0; i < PROMOTIONS.length; i++) {
            const promotion = PROMOTIONS[i];
            moves.push({
              color,
              from,
              to,
              piece,
              captured,
              promotion,
              flags: flags | BITS.PROMOTION
            });
          }
        } else {
          moves.push({
            color,
            from,
            to,
            piece,
            captured,
            flags
          });
        }
      }
      function inferPieceType(san) {
        let pieceType = san.charAt(0);
        if (pieceType >= "a" && pieceType <= "h") {
          const matches = san.match(/[a-h]\d.*[a-h]\d/);
          if (matches) {
            return void 0;
          }
          return PAWN;
        }
        pieceType = pieceType.toLowerCase();
        if (pieceType === "o") {
          return KING;
        }
        return pieceType;
      }
      function strippedSan(move) {
        return move.replace(/=/, "").replace(/[+#]?[?!]*$/, "");
      }
      var Chess = class {
        _board = new Array(128);
        _turn = WHITE;
        _header = {};
        _kings = { w: EMPTY, b: EMPTY };
        _epSquare = -1;
        _halfMoves = 0;
        _moveNumber = 0;
        _history = [];
        _comments = {};
        _castling = { w: 0, b: 0 };
        _hash = 0n;
        // tracks number of times a position has been seen for repetition checking
        _positionCount = /* @__PURE__ */ new Map();
        constructor(fen = DEFAULT_POSITION, { skipValidation = false } = {}) {
          this.load(fen, { skipValidation });
        }
        clear({ preserveHeaders = false } = {}) {
          this._board = new Array(128);
          this._kings = { w: EMPTY, b: EMPTY };
          this._turn = WHITE;
          this._castling = { w: 0, b: 0 };
          this._epSquare = EMPTY;
          this._halfMoves = 0;
          this._moveNumber = 1;
          this._history = [];
          this._comments = {};
          this._header = preserveHeaders ? this._header : { ...HEADER_TEMPLATE };
          this._hash = this._computeHash();
          this._positionCount = /* @__PURE__ */ new Map();
          this._header["SetUp"] = null;
          this._header["FEN"] = null;
        }
        load(fen, { skipValidation = false, preserveHeaders = false } = {}) {
          let tokens = fen.split(/\s+/);
          if (tokens.length >= 2 && tokens.length < 6) {
            const adjustments = ["-", "-", "0", "1"];
            fen = tokens.concat(adjustments.slice(-(6 - tokens.length))).join(" ");
          }
          tokens = fen.split(/\s+/);
          if (!skipValidation) {
            const { ok, error } = validateFen(fen);
            if (!ok) {
              throw new Error(error);
            }
          }
          const position = tokens[0];
          let square = 0;
          this.clear({ preserveHeaders });
          for (let i = 0; i < position.length; i++) {
            const piece = position.charAt(i);
            if (piece === "/") {
              square += 8;
            } else if (isDigit(piece)) {
              square += parseInt(piece, 10);
            } else {
              const color = piece < "a" ? WHITE : BLACK;
              this._put({ type: piece.toLowerCase(), color }, algebraic(square));
              square++;
            }
          }
          this._turn = tokens[1];
          if (tokens[2].indexOf("K") > -1) {
            this._castling.w |= BITS.KSIDE_CASTLE;
          }
          if (tokens[2].indexOf("Q") > -1) {
            this._castling.w |= BITS.QSIDE_CASTLE;
          }
          if (tokens[2].indexOf("k") > -1) {
            this._castling.b |= BITS.KSIDE_CASTLE;
          }
          if (tokens[2].indexOf("q") > -1) {
            this._castling.b |= BITS.QSIDE_CASTLE;
          }
          this._epSquare = tokens[3] === "-" ? EMPTY : Ox88[tokens[3]];
          this._halfMoves = parseInt(tokens[4], 10);
          this._moveNumber = parseInt(tokens[5], 10);
          this._hash = this._computeHash();
          this._updateSetup(fen);
          this._incPositionCount();
        }
        fen({ forceEnpassantSquare = false } = {}) {
          let empty = 0;
          let fen = "";
          for (let i = Ox88.a8; i <= Ox88.h1; i++) {
            if (this._board[i]) {
              if (empty > 0) {
                fen += empty;
                empty = 0;
              }
              const { color, type: piece } = this._board[i];
              fen += color === WHITE ? piece.toUpperCase() : piece.toLowerCase();
            } else {
              empty++;
            }
            if (i + 1 & 136) {
              if (empty > 0) {
                fen += empty;
              }
              if (i !== Ox88.h1) {
                fen += "/";
              }
              empty = 0;
              i += 8;
            }
          }
          let castling = "";
          if (this._castling[WHITE] & BITS.KSIDE_CASTLE) {
            castling += "K";
          }
          if (this._castling[WHITE] & BITS.QSIDE_CASTLE) {
            castling += "Q";
          }
          if (this._castling[BLACK] & BITS.KSIDE_CASTLE) {
            castling += "k";
          }
          if (this._castling[BLACK] & BITS.QSIDE_CASTLE) {
            castling += "q";
          }
          castling = castling || "-";
          let epSquare = "-";
          if (this._epSquare !== EMPTY) {
            if (forceEnpassantSquare) {
              epSquare = algebraic(this._epSquare);
            } else {
              const bigPawnSquare = this._epSquare + (this._turn === WHITE ? 16 : -16);
              const squares = [bigPawnSquare + 1, bigPawnSquare - 1];
              for (const square of squares) {
                if (square & 136) {
                  continue;
                }
                const color = this._turn;
                if (this._board[square]?.color === color && this._board[square]?.type === PAWN) {
                  this._makeMove({
                    color,
                    from: square,
                    to: this._epSquare,
                    piece: PAWN,
                    captured: PAWN,
                    flags: BITS.EP_CAPTURE
                  });
                  const isLegal = !this._isKingAttacked(color);
                  this._undoMove();
                  if (isLegal) {
                    epSquare = algebraic(this._epSquare);
                    break;
                  }
                }
              }
            }
          }
          return [
            fen,
            this._turn,
            castling,
            epSquare,
            this._halfMoves,
            this._moveNumber
          ].join(" ");
        }
        _pieceKey(i) {
          if (!this._board[i]) {
            return 0n;
          }
          const { color, type } = this._board[i];
          const colorIndex = {
            w: 0,
            b: 1
          }[color];
          const typeIndex = {
            p: 0,
            n: 1,
            b: 2,
            r: 3,
            q: 4,
            k: 5
          }[type];
          return PIECE_KEYS[colorIndex][typeIndex][i];
        }
        _epKey() {
          return this._epSquare === EMPTY ? 0n : EP_KEYS[this._epSquare & 7];
        }
        _castlingKey() {
          const index = this._castling.w >> 5 | this._castling.b >> 3;
          return CASTLING_KEYS[index];
        }
        _computeHash() {
          let hash = 0n;
          for (let i = Ox88.a8; i <= Ox88.h1; i++) {
            if (i & 136) {
              i += 7;
              continue;
            }
            if (this._board[i]) {
              hash ^= this._pieceKey(i);
            }
          }
          hash ^= this._epKey();
          hash ^= this._castlingKey();
          if (this._turn === "b") {
            hash ^= SIDE_KEY;
          }
          return hash;
        }
        /*
         * Called when the initial board setup is changed with put() or remove().
         * modifies the SetUp and FEN properties of the header object. If the FEN
         * is equal to the default position, the SetUp and FEN are deleted the setup
         * is only updated if history.length is zero, ie moves haven't been made.
         */
        _updateSetup(fen) {
          if (this._history.length > 0)
            return;
          if (fen !== DEFAULT_POSITION) {
            this._header["SetUp"] = "1";
            this._header["FEN"] = fen;
          } else {
            this._header["SetUp"] = null;
            this._header["FEN"] = null;
          }
        }
        reset() {
          this.load(DEFAULT_POSITION);
        }
        get(square) {
          return this._board[Ox88[square]];
        }
        findPiece(piece) {
          const squares = [];
          for (let i = Ox88.a8; i <= Ox88.h1; i++) {
            if (i & 136) {
              i += 7;
              continue;
            }
            if (!this._board[i] || this._board[i]?.color !== piece.color) {
              continue;
            }
            if (this._board[i].color === piece.color && this._board[i].type === piece.type) {
              squares.push(algebraic(i));
            }
          }
          return squares;
        }
        put({ type, color }, square) {
          if (this._put({ type, color }, square)) {
            this._updateCastlingRights();
            this._updateEnPassantSquare();
            this._updateSetup(this.fen());
            return true;
          }
          return false;
        }
        _set(sq, piece) {
          this._hash ^= this._pieceKey(sq);
          this._board[sq] = piece;
          this._hash ^= this._pieceKey(sq);
        }
        _put({ type, color }, square) {
          if (SYMBOLS.indexOf(type.toLowerCase()) === -1) {
            return false;
          }
          if (!(square in Ox88)) {
            return false;
          }
          const sq = Ox88[square];
          if (type == KING && !(this._kings[color] == EMPTY || this._kings[color] == sq)) {
            return false;
          }
          const currentPieceOnSquare = this._board[sq];
          if (currentPieceOnSquare && currentPieceOnSquare.type === KING) {
            this._kings[currentPieceOnSquare.color] = EMPTY;
          }
          this._set(sq, { type, color });
          if (type === KING) {
            this._kings[color] = sq;
          }
          return true;
        }
        _clear(sq) {
          this._hash ^= this._pieceKey(sq);
          delete this._board[sq];
        }
        remove(square) {
          const piece = this.get(square);
          this._clear(Ox88[square]);
          if (piece && piece.type === KING) {
            this._kings[piece.color] = EMPTY;
          }
          this._updateCastlingRights();
          this._updateEnPassantSquare();
          this._updateSetup(this.fen());
          return piece;
        }
        _updateCastlingRights() {
          this._hash ^= this._castlingKey();
          const whiteKingInPlace = this._board[Ox88.e1]?.type === KING && this._board[Ox88.e1]?.color === WHITE;
          const blackKingInPlace = this._board[Ox88.e8]?.type === KING && this._board[Ox88.e8]?.color === BLACK;
          if (!whiteKingInPlace || this._board[Ox88.a1]?.type !== ROOK || this._board[Ox88.a1]?.color !== WHITE) {
            this._castling.w &= -65;
          }
          if (!whiteKingInPlace || this._board[Ox88.h1]?.type !== ROOK || this._board[Ox88.h1]?.color !== WHITE) {
            this._castling.w &= -33;
          }
          if (!blackKingInPlace || this._board[Ox88.a8]?.type !== ROOK || this._board[Ox88.a8]?.color !== BLACK) {
            this._castling.b &= -65;
          }
          if (!blackKingInPlace || this._board[Ox88.h8]?.type !== ROOK || this._board[Ox88.h8]?.color !== BLACK) {
            this._castling.b &= -33;
          }
          this._hash ^= this._castlingKey();
        }
        _updateEnPassantSquare() {
          if (this._epSquare === EMPTY) {
            return;
          }
          const startSquare = this._epSquare + (this._turn === WHITE ? -16 : 16);
          const currentSquare = this._epSquare + (this._turn === WHITE ? 16 : -16);
          const attackers = [currentSquare + 1, currentSquare - 1];
          if (this._board[startSquare] !== null || this._board[this._epSquare] !== null || this._board[currentSquare]?.color !== swapColor(this._turn) || this._board[currentSquare]?.type !== PAWN) {
            this._hash ^= this._epKey();
            this._epSquare = EMPTY;
            return;
          }
          const canCapture = (square) => !(square & 136) && this._board[square]?.color === this._turn && this._board[square]?.type === PAWN;
          if (!attackers.some(canCapture)) {
            this._hash ^= this._epKey();
            this._epSquare = EMPTY;
          }
        }
        _attacked(color, square, verbose) {
          const attackers = [];
          for (let i = Ox88.a8; i <= Ox88.h1; i++) {
            if (i & 136) {
              i += 7;
              continue;
            }
            if (this._board[i] === void 0 || this._board[i].color !== color) {
              continue;
            }
            const piece = this._board[i];
            const difference = i - square;
            if (difference === 0) {
              continue;
            }
            const index = difference + 119;
            if (ATTACKS[index] & PIECE_MASKS[piece.type]) {
              if (piece.type === PAWN) {
                if (difference > 0 && piece.color === WHITE || difference <= 0 && piece.color === BLACK) {
                  if (!verbose) {
                    return true;
                  } else {
                    attackers.push(algebraic(i));
                  }
                }
                continue;
              }
              if (piece.type === "n" || piece.type === "k") {
                if (!verbose) {
                  return true;
                } else {
                  attackers.push(algebraic(i));
                  continue;
                }
              }
              const offset = RAYS[index];
              let j = i + offset;
              let blocked = false;
              while (j !== square) {
                if (this._board[j] != null) {
                  blocked = true;
                  break;
                }
                j += offset;
              }
              if (!blocked) {
                if (!verbose) {
                  return true;
                } else {
                  attackers.push(algebraic(i));
                  continue;
                }
              }
            }
          }
          if (verbose) {
            return attackers;
          } else {
            return false;
          }
        }
        attackers(square, attackedBy) {
          if (!attackedBy) {
            return this._attacked(this._turn, Ox88[square], true);
          } else {
            return this._attacked(attackedBy, Ox88[square], true);
          }
        }
        _isKingAttacked(color) {
          const square = this._kings[color];
          return square === -1 ? false : this._attacked(swapColor(color), square);
        }
        hash() {
          return this._hash.toString(16);
        }
        isAttacked(square, attackedBy) {
          return this._attacked(attackedBy, Ox88[square]);
        }
        isCheck() {
          return this._isKingAttacked(this._turn);
        }
        inCheck() {
          return this.isCheck();
        }
        isCheckmate() {
          return this.isCheck() && this._moves().length === 0;
        }
        isStalemate() {
          return !this.isCheck() && this._moves().length === 0;
        }
        isInsufficientMaterial() {
          const pieces = {
            b: 0,
            n: 0,
            r: 0,
            q: 0,
            k: 0,
            p: 0
          };
          const bishops = [];
          let numPieces = 0;
          let squareColor = 0;
          for (let i = Ox88.a8; i <= Ox88.h1; i++) {
            squareColor = (squareColor + 1) % 2;
            if (i & 136) {
              i += 7;
              continue;
            }
            const piece = this._board[i];
            if (piece) {
              pieces[piece.type] = piece.type in pieces ? pieces[piece.type] + 1 : 1;
              if (piece.type === BISHOP) {
                bishops.push(squareColor);
              }
              numPieces++;
            }
          }
          if (numPieces === 2) {
            return true;
          } else if (
            // k vs. kn .... or .... k vs. kb
            numPieces === 3 && (pieces[BISHOP] === 1 || pieces[KNIGHT] === 1)
          ) {
            return true;
          } else if (numPieces === pieces[BISHOP] + 2) {
            let sum = 0;
            const len = bishops.length;
            for (let i = 0; i < len; i++) {
              sum += bishops[i];
            }
            if (sum === 0 || sum === len) {
              return true;
            }
          }
          return false;
        }
        isThreefoldRepetition() {
          return this._getPositionCount(this._hash) >= 3;
        }
        isDrawByFiftyMoves() {
          return this._halfMoves >= 100;
        }
        isDraw() {
          return this.isDrawByFiftyMoves() || this.isStalemate() || this.isInsufficientMaterial() || this.isThreefoldRepetition();
        }
        isGameOver() {
          return this.isCheckmate() || this.isDraw();
        }
        moves({ verbose = false, square = void 0, piece = void 0 } = {}) {
          const moves = this._moves({ square, piece });
          if (verbose) {
            return moves.map((move) => new Move(this, move));
          } else {
            return moves.map((move) => this._moveToSan(move, moves));
          }
        }
        _moves({ legal = true, piece = void 0, square = void 0 } = {}) {
          const forSquare = square ? square.toLowerCase() : void 0;
          const forPiece = piece?.toLowerCase();
          const moves = [];
          const us = this._turn;
          const them = swapColor(us);
          let firstSquare = Ox88.a8;
          let lastSquare = Ox88.h1;
          let singleSquare = false;
          if (forSquare) {
            if (!(forSquare in Ox88)) {
              return [];
            } else {
              firstSquare = lastSquare = Ox88[forSquare];
              singleSquare = true;
            }
          }
          for (let from = firstSquare; from <= lastSquare; from++) {
            if (from & 136) {
              from += 7;
              continue;
            }
            if (!this._board[from] || this._board[from].color === them) {
              continue;
            }
            const { type } = this._board[from];
            let to;
            if (type === PAWN) {
              if (forPiece && forPiece !== type)
                continue;
              to = from + PAWN_OFFSETS[us][0];
              if (!this._board[to]) {
                addMove(moves, us, from, to, PAWN);
                to = from + PAWN_OFFSETS[us][1];
                if (SECOND_RANK[us] === rank(from) && !this._board[to]) {
                  addMove(moves, us, from, to, PAWN, void 0, BITS.BIG_PAWN);
                }
              }
              for (let j = 2; j < 4; j++) {
                to = from + PAWN_OFFSETS[us][j];
                if (to & 136)
                  continue;
                if (this._board[to]?.color === them) {
                  addMove(moves, us, from, to, PAWN, this._board[to].type, BITS.CAPTURE);
                } else if (to === this._epSquare) {
                  addMove(moves, us, from, to, PAWN, PAWN, BITS.EP_CAPTURE);
                }
              }
            } else {
              if (forPiece && forPiece !== type)
                continue;
              for (let j = 0, len = PIECE_OFFSETS[type].length; j < len; j++) {
                const offset = PIECE_OFFSETS[type][j];
                to = from;
                while (true) {
                  to += offset;
                  if (to & 136)
                    break;
                  if (!this._board[to]) {
                    addMove(moves, us, from, to, type);
                  } else {
                    if (this._board[to].color === us)
                      break;
                    addMove(moves, us, from, to, type, this._board[to].type, BITS.CAPTURE);
                    break;
                  }
                  if (type === KNIGHT || type === KING)
                    break;
                }
              }
            }
          }
          if (forPiece === void 0 || forPiece === KING) {
            if (!singleSquare || lastSquare === this._kings[us]) {
              if (this._castling[us] & BITS.KSIDE_CASTLE) {
                const castlingFrom = this._kings[us];
                const castlingTo = castlingFrom + 2;
                if (!this._board[castlingFrom + 1] && !this._board[castlingTo] && !this._attacked(them, this._kings[us]) && !this._attacked(them, castlingFrom + 1) && !this._attacked(them, castlingTo)) {
                  addMove(moves, us, this._kings[us], castlingTo, KING, void 0, BITS.KSIDE_CASTLE);
                }
              }
              if (this._castling[us] & BITS.QSIDE_CASTLE) {
                const castlingFrom = this._kings[us];
                const castlingTo = castlingFrom - 2;
                if (!this._board[castlingFrom - 1] && !this._board[castlingFrom - 2] && !this._board[castlingFrom - 3] && !this._attacked(them, this._kings[us]) && !this._attacked(them, castlingFrom - 1) && !this._attacked(them, castlingTo)) {
                  addMove(moves, us, this._kings[us], castlingTo, KING, void 0, BITS.QSIDE_CASTLE);
                }
              }
            }
          }
          if (!legal || this._kings[us] === -1) {
            return moves;
          }
          const legalMoves = [];
          for (let i = 0, len = moves.length; i < len; i++) {
            this._makeMove(moves[i]);
            if (!this._isKingAttacked(us)) {
              legalMoves.push(moves[i]);
            }
            this._undoMove();
          }
          return legalMoves;
        }
        move(move, { strict = false } = {}) {
          let moveObj = null;
          if (typeof move === "string") {
            moveObj = this._moveFromSan(move, strict);
          } else if (move === null) {
            moveObj = this._moveFromSan(SAN_NULLMOVE, strict);
          } else if (typeof move === "object") {
            const moves = this._moves();
            for (let i = 0, len = moves.length; i < len; i++) {
              if (move.from === algebraic(moves[i].from) && move.to === algebraic(moves[i].to) && (!("promotion" in moves[i]) || move.promotion === moves[i].promotion)) {
                moveObj = moves[i];
                break;
              }
            }
          }
          if (!moveObj) {
            if (typeof move === "string") {
              throw new Error(`Invalid move: ${move}`);
            } else {
              throw new Error(`Invalid move: ${JSON.stringify(move)}`);
            }
          }
          if (this.isCheck() && moveObj.flags & BITS.NULL_MOVE) {
            throw new Error("Null move not allowed when in check");
          }
          const prettyMove = new Move(this, moveObj);
          this._makeMove(moveObj);
          this._incPositionCount();
          return prettyMove;
        }
        _push(move) {
          this._history.push({
            move,
            kings: { b: this._kings.b, w: this._kings.w },
            turn: this._turn,
            castling: { b: this._castling.b, w: this._castling.w },
            epSquare: this._epSquare,
            halfMoves: this._halfMoves,
            moveNumber: this._moveNumber
          });
        }
        _movePiece(from, to) {
          this._hash ^= this._pieceKey(from);
          this._board[to] = this._board[from];
          delete this._board[from];
          this._hash ^= this._pieceKey(to);
        }
        _makeMove(move) {
          const us = this._turn;
          const them = swapColor(us);
          this._push(move);
          if (move.flags & BITS.NULL_MOVE) {
            if (us === BLACK) {
              this._moveNumber++;
            }
            this._halfMoves++;
            this._turn = them;
            this._epSquare = EMPTY;
            return;
          }
          this._hash ^= this._epKey();
          this._hash ^= this._castlingKey();
          if (move.captured) {
            this._hash ^= this._pieceKey(move.to);
          }
          this._movePiece(move.from, move.to);
          if (move.flags & BITS.EP_CAPTURE) {
            if (this._turn === BLACK) {
              this._clear(move.to - 16);
            } else {
              this._clear(move.to + 16);
            }
          }
          if (move.promotion) {
            this._clear(move.to);
            this._set(move.to, { type: move.promotion, color: us });
          }
          if (this._board[move.to].type === KING) {
            this._kings[us] = move.to;
            if (move.flags & BITS.KSIDE_CASTLE) {
              const castlingTo = move.to - 1;
              const castlingFrom = move.to + 1;
              this._movePiece(castlingFrom, castlingTo);
            } else if (move.flags & BITS.QSIDE_CASTLE) {
              const castlingTo = move.to + 1;
              const castlingFrom = move.to - 2;
              this._movePiece(castlingFrom, castlingTo);
            }
            this._castling[us] = 0;
          }
          if (this._castling[us]) {
            for (let i = 0, len = ROOKS[us].length; i < len; i++) {
              if (move.from === ROOKS[us][i].square && this._castling[us] & ROOKS[us][i].flag) {
                this._castling[us] ^= ROOKS[us][i].flag;
                break;
              }
            }
          }
          if (this._castling[them]) {
            for (let i = 0, len = ROOKS[them].length; i < len; i++) {
              if (move.to === ROOKS[them][i].square && this._castling[them] & ROOKS[them][i].flag) {
                this._castling[them] ^= ROOKS[them][i].flag;
                break;
              }
            }
          }
          this._hash ^= this._castlingKey();
          if (move.flags & BITS.BIG_PAWN) {
            let epSquare;
            if (us === BLACK) {
              epSquare = move.to - 16;
            } else {
              epSquare = move.to + 16;
            }
            if (!(move.to - 1 & 136) && this._board[move.to - 1]?.type === PAWN && this._board[move.to - 1]?.color === them || !(move.to + 1 & 136) && this._board[move.to + 1]?.type === PAWN && this._board[move.to + 1]?.color === them) {
              this._epSquare = epSquare;
              this._hash ^= this._epKey();
            } else {
              this._epSquare = EMPTY;
            }
          } else {
            this._epSquare = EMPTY;
          }
          if (move.piece === PAWN) {
            this._halfMoves = 0;
          } else if (move.flags & (BITS.CAPTURE | BITS.EP_CAPTURE)) {
            this._halfMoves = 0;
          } else {
            this._halfMoves++;
          }
          if (us === BLACK) {
            this._moveNumber++;
          }
          this._turn = them;
          this._hash ^= SIDE_KEY;
        }
        undo() {
          const hash = this._hash;
          const move = this._undoMove();
          if (move) {
            const prettyMove = new Move(this, move);
            this._decPositionCount(hash);
            return prettyMove;
          }
          return null;
        }
        _undoMove() {
          const old = this._history.pop();
          if (old === void 0) {
            return null;
          }
          this._hash ^= this._epKey();
          this._hash ^= this._castlingKey();
          const move = old.move;
          this._kings = old.kings;
          this._turn = old.turn;
          this._castling = old.castling;
          this._epSquare = old.epSquare;
          this._halfMoves = old.halfMoves;
          this._moveNumber = old.moveNumber;
          this._hash ^= this._epKey();
          this._hash ^= this._castlingKey();
          this._hash ^= SIDE_KEY;
          const us = this._turn;
          const them = swapColor(us);
          if (move.flags & BITS.NULL_MOVE) {
            return move;
          }
          this._movePiece(move.to, move.from);
          if (move.piece) {
            this._clear(move.from);
            this._set(move.from, { type: move.piece, color: us });
          }
          if (move.captured) {
            if (move.flags & BITS.EP_CAPTURE) {
              let index;
              if (us === BLACK) {
                index = move.to - 16;
              } else {
                index = move.to + 16;
              }
              this._set(index, { type: PAWN, color: them });
            } else {
              this._set(move.to, { type: move.captured, color: them });
            }
          }
          if (move.flags & (BITS.KSIDE_CASTLE | BITS.QSIDE_CASTLE)) {
            let castlingTo, castlingFrom;
            if (move.flags & BITS.KSIDE_CASTLE) {
              castlingTo = move.to + 1;
              castlingFrom = move.to - 1;
            } else {
              castlingTo = move.to - 2;
              castlingFrom = move.to + 1;
            }
            this._movePiece(castlingFrom, castlingTo);
          }
          return move;
        }
        pgn({ newline = "\n", maxWidth = 0 } = {}) {
          const result = [];
          let headerExists = false;
          for (const i in this._header) {
            const headerTag = this._header[i];
            if (headerTag)
              result.push(`[${i} "${this._header[i]}"]` + newline);
            headerExists = true;
          }
          if (headerExists && this._history.length) {
            result.push(newline);
          }
          const appendComment = (moveString2) => {
            const comment = this._comments[this.fen()];
            if (typeof comment !== "undefined") {
              const delimiter = moveString2.length > 0 ? " " : "";
              moveString2 = `${moveString2}${delimiter}{${comment}}`;
            }
            return moveString2;
          };
          const reversedHistory = [];
          while (this._history.length > 0) {
            reversedHistory.push(this._undoMove());
          }
          const moves = [];
          let moveString = "";
          if (reversedHistory.length === 0) {
            moves.push(appendComment(""));
          }
          while (reversedHistory.length > 0) {
            moveString = appendComment(moveString);
            const move = reversedHistory.pop();
            if (!move) {
              break;
            }
            if (!this._history.length && move.color === "b") {
              const prefix = `${this._moveNumber}. ...`;
              moveString = moveString ? `${moveString} ${prefix}` : prefix;
            } else if (move.color === "w") {
              if (moveString.length) {
                moves.push(moveString);
              }
              moveString = this._moveNumber + ".";
            }
            moveString = moveString + " " + this._moveToSan(move, this._moves({ legal: true }));
            this._makeMove(move);
          }
          if (moveString.length) {
            moves.push(appendComment(moveString));
          }
          moves.push(this._header.Result || "*");
          if (maxWidth === 0) {
            return result.join("") + moves.join(" ");
          }
          const strip = function() {
            if (result.length > 0 && result[result.length - 1] === " ") {
              result.pop();
              return true;
            }
            return false;
          };
          const wrapComment = function(width, move) {
            for (const token of move.split(" ")) {
              if (!token) {
                continue;
              }
              if (width + token.length > maxWidth) {
                while (strip()) {
                  width--;
                }
                result.push(newline);
                width = 0;
              }
              result.push(token);
              width += token.length;
              result.push(" ");
              width++;
            }
            if (strip()) {
              width--;
            }
            return width;
          };
          let currentWidth = 0;
          for (let i = 0; i < moves.length; i++) {
            if (currentWidth + moves[i].length > maxWidth) {
              if (moves[i].includes("{")) {
                currentWidth = wrapComment(currentWidth, moves[i]);
                continue;
              }
            }
            if (currentWidth + moves[i].length > maxWidth && i !== 0) {
              if (result[result.length - 1] === " ") {
                result.pop();
              }
              result.push(newline);
              currentWidth = 0;
            } else if (i !== 0) {
              result.push(" ");
              currentWidth++;
            }
            result.push(moves[i]);
            currentWidth += moves[i].length;
          }
          return result.join("");
        }
        /**
         * @deprecated Use `setHeader` and `getHeaders` instead. This method will return null header tags (which is not what you want)
         */
        header(...args) {
          for (let i = 0; i < args.length; i += 2) {
            if (typeof args[i] === "string" && typeof args[i + 1] === "string") {
              this._header[args[i]] = args[i + 1];
            }
          }
          return this._header;
        }
        // TODO: value validation per spec
        setHeader(key, value) {
          this._header[key] = value ?? SEVEN_TAG_ROSTER[key] ?? null;
          return this.getHeaders();
        }
        removeHeader(key) {
          if (key in this._header) {
            this._header[key] = SEVEN_TAG_ROSTER[key] || null;
            return true;
          }
          return false;
        }
        // return only non-null headers (omit placemarker nulls)
        getHeaders() {
          const nonNullHeaders = {};
          for (const [key, value] of Object.entries(this._header)) {
            if (value !== null) {
              nonNullHeaders[key] = value;
            }
          }
          return nonNullHeaders;
        }
        loadPgn(pgn2, { strict = false, newlineChar = "\r?\n" } = {}) {
          if (newlineChar !== "\r?\n") {
            pgn2 = pgn2.replace(new RegExp(newlineChar, "g"), "\n");
          }
          const parsedPgn = peg$parse(pgn2);
          this.reset();
          const headers = parsedPgn.headers;
          let fen = "";
          for (const key in headers) {
            if (key.toLowerCase() === "fen") {
              fen = headers[key];
            }
            this.header(key, headers[key]);
          }
          if (!strict) {
            if (fen) {
              this.load(fen, { preserveHeaders: true });
            }
          } else {
            if (headers["SetUp"] === "1") {
              if (!("FEN" in headers)) {
                throw new Error("Invalid PGN: FEN tag must be supplied with SetUp tag");
              }
              this.load(headers["FEN"], { preserveHeaders: true });
            }
          }
          let node2 = parsedPgn.root;
          while (node2) {
            if (node2.move) {
              const move = this._moveFromSan(node2.move, strict);
              if (move == null) {
                throw new Error(`Invalid move in PGN: ${node2.move}`);
              } else {
                this._makeMove(move);
                this._incPositionCount();
              }
            }
            if (node2.comment !== void 0) {
              this._comments[this.fen()] = node2.comment;
            }
            node2 = node2.variations[0];
          }
          const result = parsedPgn.result;
          if (result && Object.keys(this._header).length && this._header["Result"] !== result) {
            this.setHeader("Result", result);
          }
        }
        /*
         * Convert a move from 0x88 coordinates to Standard Algebraic Notation
         * (SAN)
         *
         * @param {boolean} strict Use the strict SAN parser. It will throw errors
         * on overly disambiguated moves (see below):
         *
         * r1bqkbnr/ppp2ppp/2n5/1B1pP3/4P3/8/PPPP2PP/RNBQK1NR b KQkq - 2 4
         * 4. ... Nge7 is overly disambiguated because the knight on c6 is pinned
         * 4. ... Ne7 is technically the valid SAN
         */
        _moveToSan(move, moves) {
          let output = "";
          if (move.flags & BITS.KSIDE_CASTLE) {
            output = "O-O";
          } else if (move.flags & BITS.QSIDE_CASTLE) {
            output = "O-O-O";
          } else if (move.flags & BITS.NULL_MOVE) {
            return SAN_NULLMOVE;
          } else {
            if (move.piece !== PAWN) {
              const disambiguator = getDisambiguator(move, moves);
              output += move.piece.toUpperCase() + disambiguator;
            }
            if (move.flags & (BITS.CAPTURE | BITS.EP_CAPTURE)) {
              if (move.piece === PAWN) {
                output += algebraic(move.from)[0];
              }
              output += "x";
            }
            output += algebraic(move.to);
            if (move.promotion) {
              output += "=" + move.promotion.toUpperCase();
            }
          }
          this._makeMove(move);
          if (this.isCheck()) {
            if (this.isCheckmate()) {
              output += "#";
            } else {
              output += "+";
            }
          }
          this._undoMove();
          return output;
        }
        // convert a move from Standard Algebraic Notation (SAN) to 0x88 coordinates
        _moveFromSan(move, strict = false) {
          let cleanMove = strippedSan(move);
          if (!strict) {
            if (cleanMove === "0-0") {
              cleanMove = "O-O";
            } else if (cleanMove === "0-0-0") {
              cleanMove = "O-O-O";
            }
          }
          if (cleanMove == SAN_NULLMOVE) {
            const res = {
              color: this._turn,
              from: 0,
              to: 0,
              piece: "k",
              flags: BITS.NULL_MOVE
            };
            return res;
          }
          let pieceType = inferPieceType(cleanMove);
          let moves = this._moves({ legal: true, piece: pieceType });
          for (let i = 0, len = moves.length; i < len; i++) {
            if (cleanMove === strippedSan(this._moveToSan(moves[i], moves))) {
              return moves[i];
            }
          }
          if (strict) {
            return null;
          }
          let piece = void 0;
          let matches = void 0;
          let from = void 0;
          let to = void 0;
          let promotion = void 0;
          let overlyDisambiguated = false;
          matches = cleanMove.match(/([pnbrqkPNBRQK])?([a-h][1-8])x?-?([a-h][1-8])([qrbnQRBN])?/);
          if (matches) {
            piece = matches[1];
            from = matches[2];
            to = matches[3];
            promotion = matches[4];
            if (from.length == 1) {
              overlyDisambiguated = true;
            }
          } else {
            matches = cleanMove.match(/([pnbrqkPNBRQK])?([a-h]?[1-8]?)x?-?([a-h][1-8])([qrbnQRBN])?/);
            if (matches) {
              piece = matches[1];
              from = matches[2];
              to = matches[3];
              promotion = matches[4];
              if (from.length == 1) {
                overlyDisambiguated = true;
              }
            }
          }
          pieceType = inferPieceType(cleanMove);
          moves = this._moves({
            legal: true,
            piece: piece ? piece : pieceType
          });
          if (!to) {
            return null;
          }
          for (let i = 0, len = moves.length; i < len; i++) {
            if (!from) {
              if (cleanMove === strippedSan(this._moveToSan(moves[i], moves)).replace("x", "")) {
                return moves[i];
              }
            } else if ((!piece || piece.toLowerCase() == moves[i].piece) && Ox88[from] == moves[i].from && Ox88[to] == moves[i].to && (!promotion || promotion.toLowerCase() == moves[i].promotion)) {
              return moves[i];
            } else if (overlyDisambiguated) {
              const square = algebraic(moves[i].from);
              if ((!piece || piece.toLowerCase() == moves[i].piece) && Ox88[to] == moves[i].to && (from == square[0] || from == square[1]) && (!promotion || promotion.toLowerCase() == moves[i].promotion)) {
                return moves[i];
              }
            }
          }
          return null;
        }
        ascii() {
          let s = "   +------------------------+\n";
          for (let i = Ox88.a8; i <= Ox88.h1; i++) {
            if (file(i) === 0) {
              s += " " + "87654321"[rank(i)] + " |";
            }
            if (this._board[i]) {
              const piece = this._board[i].type;
              const color = this._board[i].color;
              const symbol = color === WHITE ? piece.toUpperCase() : piece.toLowerCase();
              s += " " + symbol + " ";
            } else {
              s += " . ";
            }
            if (i + 1 & 136) {
              s += "|\n";
              i += 8;
            }
          }
          s += "   +------------------------+\n";
          s += "     a  b  c  d  e  f  g  h";
          return s;
        }
        perft(depth) {
          const moves = this._moves({ legal: false });
          let nodes = 0;
          const color = this._turn;
          for (let i = 0, len = moves.length; i < len; i++) {
            this._makeMove(moves[i]);
            if (!this._isKingAttacked(color)) {
              if (depth - 1 > 0) {
                nodes += this.perft(depth - 1);
              } else {
                nodes++;
              }
            }
            this._undoMove();
          }
          return nodes;
        }
        setTurn(color) {
          if (this._turn == color) {
            return false;
          }
          this.move("--");
          return true;
        }
        turn() {
          return this._turn;
        }
        board() {
          const output = [];
          let row = [];
          for (let i = Ox88.a8; i <= Ox88.h1; i++) {
            if (this._board[i] == null) {
              row.push(null);
            } else {
              row.push({
                square: algebraic(i),
                type: this._board[i].type,
                color: this._board[i].color
              });
            }
            if (i + 1 & 136) {
              output.push(row);
              row = [];
              i += 8;
            }
          }
          return output;
        }
        squareColor(square) {
          if (square in Ox88) {
            const sq = Ox88[square];
            return (rank(sq) + file(sq)) % 2 === 0 ? "light" : "dark";
          }
          return null;
        }
        history({ verbose = false } = {}) {
          const reversedHistory = [];
          const moveHistory = [];
          while (this._history.length > 0) {
            reversedHistory.push(this._undoMove());
          }
          while (true) {
            const move = reversedHistory.pop();
            if (!move) {
              break;
            }
            if (verbose) {
              moveHistory.push(new Move(this, move));
            } else {
              moveHistory.push(this._moveToSan(move, this._moves()));
            }
            this._makeMove(move);
          }
          return moveHistory;
        }
        /*
         * Keeps track of position occurrence counts for the purpose of repetition
         * checking. Old positions are removed from the map if their counts are reduced to 0.
         */
        _getPositionCount(hash) {
          return this._positionCount.get(hash) ?? 0;
        }
        _incPositionCount() {
          this._positionCount.set(this._hash, (this._positionCount.get(this._hash) ?? 0) + 1);
        }
        _decPositionCount(hash) {
          const currentCount = this._positionCount.get(hash) ?? 0;
          if (currentCount === 1) {
            this._positionCount.delete(hash);
          } else {
            this._positionCount.set(hash, currentCount - 1);
          }
        }
        _pruneComments() {
          const reversedHistory = [];
          const currentComments = {};
          const copyComment = (fen) => {
            if (fen in this._comments) {
              currentComments[fen] = this._comments[fen];
            }
          };
          while (this._history.length > 0) {
            reversedHistory.push(this._undoMove());
          }
          copyComment(this.fen());
          while (true) {
            const move = reversedHistory.pop();
            if (!move) {
              break;
            }
            this._makeMove(move);
            copyComment(this.fen());
          }
          this._comments = currentComments;
        }
        getComment() {
          return this._comments[this.fen()];
        }
        setComment(comment) {
          this._comments[this.fen()] = comment.replace("{", "[").replace("}", "]");
        }
        /**
         * @deprecated Renamed to `removeComment` for consistency
         */
        deleteComment() {
          return this.removeComment();
        }
        removeComment() {
          const comment = this._comments[this.fen()];
          delete this._comments[this.fen()];
          return comment;
        }
        getComments() {
          this._pruneComments();
          return Object.keys(this._comments).map((fen) => {
            return { fen, comment: this._comments[fen] };
          });
        }
        /**
         * @deprecated Renamed to `removeComments` for consistency
         */
        deleteComments() {
          return this.removeComments();
        }
        removeComments() {
          this._pruneComments();
          return Object.keys(this._comments).map((fen) => {
            const comment = this._comments[fen];
            delete this._comments[fen];
            return { fen, comment };
          });
        }
        setCastlingRights(color, rights) {
          for (const side of [KING, QUEEN]) {
            if (rights[side] !== void 0) {
              if (rights[side]) {
                this._castling[color] |= SIDES[side];
              } else {
                this._castling[color] &= ~SIDES[side];
              }
            }
          }
          this._updateCastlingRights();
          const result = this.getCastlingRights(color);
          return (rights[KING] === void 0 || rights[KING] === result[KING]) && (rights[QUEEN] === void 0 || rights[QUEEN] === result[QUEEN]);
        }
        getCastlingRights(color) {
          return {
            [KING]: (this._castling[color] & SIDES[KING]) !== 0,
            [QUEEN]: (this._castling[color] & SIDES[QUEEN]) !== 0
          };
        }
        moveNumber() {
          return this._moveNumber;
        }
      };
      exports.BISHOP = BISHOP;
      exports.BLACK = BLACK;
      exports.Chess = Chess;
      exports.DEFAULT_POSITION = DEFAULT_POSITION;
      exports.KING = KING;
      exports.KNIGHT = KNIGHT;
      exports.Move = Move;
      exports.PAWN = PAWN;
      exports.QUEEN = QUEEN;
      exports.ROOK = ROOK;
      exports.SEVEN_TAG_ROSTER = SEVEN_TAG_ROSTER;
      exports.SQUARES = SQUARES;
      exports.WHITE = WHITE;
      exports.validateFen = validateFen;
      exports.xoroshiro128 = xoroshiro128;
    }
  });

  // src/chess-game.cjs
  var require_chess_game = __commonJS({
    "src/chess-game.cjs"(exports, module) {
      var { Chess, DEFAULT_POSITION } = require_chess();
      var clone = (x) => JSON.parse(JSON.stringify(x));
      var CONTROLS = [60, 300, 600, 1800, 0];
      function position(game) {
        return Object.fromEntries(game.board().flat().filter(Boolean).map((p) => [p.square, { type: p.type, color: p.color }]));
      }
      function metadata(game) {
        const [board, turn, castling, enPassant, halfmove, fullmove] = game.fen().split(" ");
        return { fen: game.fen(), position: position(game), turn, castling, enPassant, halfmove: +halfmove, fullmove: +fullmove };
      }
      function initial(players, seconds = 0, now = 0, fen = DEFAULT_POSITION) {
        if (!players?.w || !players?.b || players.w === players.b || !CONTROLS.includes(seconds)) throw Error("Invalid chess setup");
        const game = new Chess(fen);
        return { version: 1, players, initialFen: fen, ...metadata(game), moves: [], history: [game.fen()], clocks: { w: seconds ? seconds * 1e3 : null, b: seconds ? seconds * 1e3 : null, activeSince: seconds ? now : null }, result: null, drawOffer: null };
      }
      function engine(state) {
        if (state?.version !== 1 || !Array.isArray(state.moves) || state.moves.length > 12e3 || !Array.isArray(state.history) || state.history.length !== state.moves.length + 1) throw Error("Invalid chess save");
        const game = new Chess(state.initialFen);
        if (state.history[0] !== game.fen()) throw Error("Invalid starting position");
        for (let i = 0; i < state.moves.length; i++) {
          const m = state.moves[i], made = game.move({ from: m.from, to: m.to, ...m.promotion ? { promotion: m.promotion } : {} });
          if (m.san !== made.san || state.history[i + 1] !== game.fen()) throw Error("Invalid move history");
        }
        const data = metadata(game);
        for (const key of ["fen", "turn", "castling", "enPassant", "halfmove", "fullmove"]) if (data[key] !== state[key]) throw Error("Invalid position data");
        if (JSON.stringify(Object.entries(data.position).map(([s, p]) => [s, p.type, p.color]).sort()) !== JSON.stringify(Object.entries(state.position || {}).map(([s, p]) => [s, p.type, p.color]).sort())) throw Error("Invalid pieces");
        const terminal = boardResult(game);
        if (state.moves.length && terminal && (state.result?.winner !== terminal?.winner || state.result?.reason !== terminal?.reason)) throw Error("Incorrect game result");
        if (state.result && ["checkmate", "stalemate", "insufficient material", "threefold repetition", "fifty-move rule"].includes(state.result.reason) && (state.result?.winner !== terminal?.winner || state.result?.reason !== terminal?.reason)) throw Error("Incorrect game result");
        return game;
      }
      function boardResult(game) {
        if (game.isCheckmate()) return { winner: game.turn() === "w" ? "b" : "w", reason: "checkmate" };
        if (game.isStalemate()) return { winner: null, reason: "stalemate" };
        if (game.isInsufficientMaterial()) return { winner: null, reason: "insufficient material" };
        if (game.isThreefoldRepetition()) return { winner: null, reason: "threefold repetition" };
        if (game.isDrawByFiftyMoves()) return { winner: null, reason: "fifty-move rule" };
        return null;
      }
      function applyMove(state, move, player) {
        if (state.result || state.players[state.turn] !== player) throw Error("It is not your turn");
        const game = engine(state), made = game.move(move);
        const next = { ...clone(state), ...metadata(game) };
        next.moves.push({ from: made.from, to: made.to, ...made.promotion ? { promotion: made.promotion } : {}, san: made.san });
        next.history.push(game.fen());
        next.result = boardResult(game);
        if (next.drawOffer && next.drawOffer !== player) next.drawOffer = null;
        return next;
      }
      function matingMaterial(state, color) {
        const ps = Object.entries(state.position).filter(([sq, p]) => p.color === color && p.type !== "k");
        if (ps.some(([sq, p]) => "pqr".includes(p.type))) return true;
        const n = ps.filter(([sq, p]) => p.type === "n").length, b = ps.filter(([sq, p]) => p.type === "b");
        return n >= 2 || n > 0 && b.length > 0 || new Set(b.map(([sq]) => (sq.charCodeAt(0) + Number(sq[1])) % 2)).size > 1;
      }
      function timeoutResult(state, loser) {
        const other = loser === "w" ? "b" : "w";
        return matingMaterial(state, other) ? { winner: other, reason: "timeout" } : { winner: null, reason: "timeout vs insufficient material" };
      }
      function clockLeft(state, color, serverNow) {
        const left = state.clocks[color];
        if (left === null) return null;
        return Math.max(0, left - (!state.result && state.turn === color && state.clocks.activeSince !== null ? Math.max(0, serverNow - state.clocks.activeSince) : 0));
      }
      function resultText(r) {
        return r ? r.winner ? (r.winner === "w" ? "White" : "Black") + " wins by " + r.reason : "Draw by " + r.reason : "";
      }
      function timeLabel(seconds) {
        return seconds ? seconds / 60 + " min per player" : "No time limit";
      }
      var PATHS = {
        p: "M28 29 C15 20 23 8 32 8 C43 8 49 22 37 29 L41 34 L38 38 L35 38 C36 46 42 48 46 52 L47 57 H17 L18 52 C22 48 28 46 29 38 H25 L22 34 Z",
        r: "M15 12 L23 10 L24 19 H29 V10 H36 V19 H41 L42 10 L50 12 L48 27 L43 30 L45 48 L49 51 V57 H15 V51 L19 48 L21 30 L17 27 Z",
        n: "M18 48 C22 40 35 39 38 29 C33 33 29 34 25 31 L21 35 L14 32 L13 28 L20 17 L24 8 L29 13 C44 14 49 27 46 40 L43 49 L48 52 V57 H16 V52 Z",
        b: "M24 46 C13 35 21 24 29 16 L29 12 C24 7 30 3 34 6 C39 9 34 14 34 16 C46 27 49 36 39 46 L45 50 L48 53 V57 H16 V53 L19 50 Z",
        q: "M18 47 L10 24 C4 22 8 14 13 17 C16 18 16 22 14 24 L24 35 L24 16 C17 10 25 4 29 9 C31 12 29 15 28 16 L32 34 L37 16 C32 10 39 5 43 10 C46 14 42 17 41 17 L41 35 L50 24 C45 18 52 14 56 19 C59 24 54 27 53 26 L46 47 L49 52 V57 H15 V52 Z",
        k: "M28 6 H36 V12 H42 V19 H36 V24 C52 19 57 31 49 40 L42 48 L48 52 V57 H16 V52 L22 48 L15 40 C7 31 13 19 28 24 V19 H22 V12 H28 Z"
      };
      var svgId = 0;
      function pieceSVG(type, color) {
        const id = "chess-piece-" + ++svgId, white = color === "w", fill = white ? ["#fffef9", "#d9d8d2"] : ["#696966", "#41413f"], outline = white ? "#454744" : "#222522";
        let detail = type === "n" ? '<path d="M25 20l4-2" stroke-linecap="round"/><path d="M36 28c-2 5-6 8-10 9" fill="none"/>' : type === "b" ? '<path d="M33 17l-5 16" fill="none" stroke-width="3" stroke-linecap="round"/>' : type === "k" ? '<path d="M25 31c-9-6-10 2-3 8l4 3zm14 0c9-6 10 2 3 8l-4 3z" fill="' + (white ? "#a5a6a0" : "#30332f") + '" stroke="none"/>' : "";
        return '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs><linearGradient id="' + id + '" x1="0" y1="0" x2=".8" y2="1"><stop stop-color="' + fill[0] + '"/><stop offset="1" stop-color="' + fill[1] + '"/></linearGradient></defs><ellipse cx="32" cy="58" rx="20" ry="3" fill="#000" opacity=".16"/><g stroke="' + outline + '" stroke-width="1.7" stroke-linejoin="round" fill="url(#' + id + ')"><path d="' + PATHS[type] + '"/>' + detail + (["r", "n", "b", "q", "k"].includes(type) ? '<path d="M18 50q14-4 28 0" fill="none" opacity=".6"/>' : "") + "</g></svg>";
      }
      var STYLE = `
.chess-shell{--chess-accent:var(--accent,#b9ef87);--chess-light:#f1efdf;--chess-dark:color-mix(in srgb,var(--chess-accent) 65%,#384534);font-family:"Avenir Next","Segoe UI",sans-serif;width:min(660px,94vw,calc(100dvh - 245px));padding:16px;color:#eeeee7;background:#252622;border-radius:17px}
.chess-head,.chess-person,.chess-tools,.chess-review{display:flex;align-items:center;justify-content:space-between;gap:8px}.chess-head{margin-bottom:10px;position:sticky;top:0;z-index:30;background:#252622;padding:2px 0}.chess-shell .chess-head button{display:grid;place-items:center;flex:0 0 36px;width:36px;height:36px;padding:0}.chess-head button svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round}.chess-win-total{display:block;font-size:10px;color:#b6bcae;margin-top:3px}.chess-head strong{letter-spacing:3px;font-size:12px}.chess-shell button{font:inherit;border:0;border-radius:7px;background:#373a33;color:#eee;padding:8px 11px}.chess-shell button:disabled{opacity:.45;cursor:default}.chess-shell button:focus-visible{outline:2px solid var(--chess-accent)}
.chess-person{padding:9px 0}.chess-person-info{display:flex;align-items:center;gap:9px;min-width:0}.chess-avatar{width:34px;height:34px;object-fit:cover;border-radius:7px;background:#41463c;display:grid;place-items:center}.chess-person-name{font-size:13px;overflow:hidden;text-overflow:ellipsis;max-width:180px;white-space:nowrap}.chess-captured{display:flex;align-items:center;height:18px;font-size:11px}.chess-captured svg{width:18px;height:18px;margin-right:-5px}.chess-captured span{margin-left:8px}
.chess-clock{font-size:22px;font-variant-numeric:tabular-nums;font-weight:700;min-width:85px;text-align:center;padding:6px 9px;background:#161814;color:#aaa;border-radius:5px}.chess-clock.active{background:var(--chess-accent);color:var(--accent-ink,#10140e)}.chess-clock.low{box-shadow:inset 0 0 0 2px #dd705d}
.chess-board{position:relative;display:grid;grid-template-columns:repeat(8,1fr);aspect-ratio:1;touch-action:none;user-select:none;overflow:hidden;border-radius:4px;background:#eeeddd}
.chess-square{position:relative;aspect-ratio:1;background:var(--chess-light);border:1px solid #00000010}.chess-square.dark{background:var(--chess-dark)}.chess-square.last::after,.chess-square.selected::after,.chess-square.check::after{content:"";position:absolute;inset:0;background:color-mix(in srgb,var(--chess-accent) 55%,#dfbb40);opacity:.6}.chess-square.selected::after{background:#62c2e4;box-shadow:none;opacity:.55;animation:chess-select-pulse 280ms ease-out}.chess-square.check::after{background:radial-gradient(ellipse,#ef5845cc,#e84c2a00);opacity:1}
.chess-square .coordinate{position:absolute;z-index:2;bottom:1px;right:3px;font-size:9px;color:var(--chess-dark);background:transparent;padding:0;pointer-events:none}.chess-square.dark .coordinate{color:var(--chess-light)}.chess-square .rank{top:1px;left:2px;bottom:auto;right:auto}
.chess-square.premove::before{content:"";position:absolute;inset:0;background:#cf648a80;z-index:1;pointer-events:none}.chess-dot{position:absolute;inset:36%;border-radius:50%;background:#1527134d;z-index:4;pointer-events:none}.chess-dot.capture{inset:4%;background:transparent;border:5px solid #15271355}
.chess-piece{position:absolute;width:12.5%;height:12.5%;z-index:3;display:grid;place-items:center;pointer-events:none;will-change:transform}.chess-piece svg{width:94%;height:94%;filter:drop-shadow(0 1px 1px #0004)}.chess-piece.dragging{z-index:9;filter:drop-shadow(0 7px 4px #0005)}
.chess-status{font-size:12px;text-align:center;min-height:22px;margin:6px 0;color:#d7dbc9}.chess-status.error{color:#ffb5a5}.chess-tools{flex-wrap:wrap;justify-content:center}.chess-tools button{font-size:11px}.chess-tools button:first-child{background:var(--chess-accent);color:var(--accent-ink,#10140e)}.chess-review{margin:10px 0 5px}.chess-review span{font-size:11px;color:#b6bcae}
.chess-moves{max-height:100px;overflow:auto;display:grid;grid-template-columns:32px 1fr 1fr;gap:2px;font-size:12px}.chess-moves b{padding:7px;color:#939b8a;font-weight:400}.chess-moves button{text-align:left;padding:6px;background:#30332c;font-size:12px}.chess-moves button.current{box-shadow:inset 3px 0 var(--chess-accent)}
.chess-promotion{position:absolute;inset:0;background:#111b;display:flex;align-items:center;justify-content:center;z-index:20;gap:5px}.chess-promotion button{width:20%;padding:4px;background:#f1efdf}.chess-promotion svg{display:block;width:100%}.chess-promotion[hidden]{display:none}
.chess-offer{font-size:12px;text-align:center;padding:6px}.chess-offer button{margin:4px}.chess-thumbnail{display:block;width:100%;height:140px;background:#252622;border-radius:10px;margin-bottom:10px}.chess-time-label{display:block;margin:8px 0;font-size:12px}
@media(max-height:760px){.chess-shell{padding:10px;width:min(540px,94vw,calc(100dvh - 205px))}.chess-person{padding:5px 0}.chess-moves{max-height:70px}}
@keyframes chess-select-pulse{0%{opacity:.9;transform:scale(.86)}65%{opacity:.65;transform:scale(1)}100%{opacity:.55;transform:scale(1)}}
@media(prefers-reduced-motion:reduce){.chess-piece,.chess-square.selected::after{animation:none!important}}
`;
      function mount(root, { state, player, serverNow = Date.now(), profiles = [], onMove, onAction, onClose, injectStyles = true }) {
        let saved = clone(state), game = engine(saved), review = null, selected = null, premove = null, promotion = null, busy = false, disposed = false, drag = null, pieces = /* @__PURE__ */ new Map(), timer, clockBase = serverNow, localBase = performance.now(), clockRequested = false, lastTimeoutCheck = 0;
        const el = (tag, cls, text) => {
          const e = document.createElement(tag);
          e.className = cls;
          if (text) e.textContent = text;
          return e;
        };
        root.replaceChildren();
        const style = el("style", "");
        style.textContent = STYLE;
        const shell = el("div", "chess-shell");
        if (injectStyles) root.append(style);
        root.append(shell);
        const head = el("div", "chess-head"), title = el("strong", "", "CHESS"), close = el("button", "", "\xD7");
        close.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>';
        close.setAttribute("aria-label", "Close chess");
        close.onclick = onClose;
        head.append(title, close);
        const top = el("div", "chess-person"), board = el("div", "chess-board"), bottom = el("div", "chess-person"), status = el("div", "chess-status"), offer = el("div", "chess-offer"), tools = el("div", "chess-tools"), nav = el("div", "chess-review"), list = el("div", "chess-moves");
        board.setAttribute("role", "group");
        board.setAttribute("aria-label", "Chess board");
        status.setAttribute("role", "status");
        const btn = (text, fn) => {
          const b = el("button", "", text);
          b.type = "button";
          b.onclick = fn;
          return b;
        };
        const resign = btn("Resign", () => confirmAction("Resign this game?", "resign")), draw = btn("Offer draw", () => act("offer")), first = btn("\u23EE", () => showReview(0)), prev = btn("\u2039", () => showReview(Math.max(0, (review ?? saved.moves.length) - 1))), next = btn("\u203A", () => showReview(Math.min(saved.moves.length, (review ?? saved.moves.length) + 1))), live = btn("Live", () => showReview(null)), reviewLabel = el("span", "", "Live position");
        const cancelPremove = btn("Cancel premove", () => {
          premove = null;
          selected = null;
          render();
        });
        cancelPremove.hidden = true;
        tools.append(draw, resign, cancelPremove);
        nav.append(first, prev, reviewLabel, next, live);
        shell.append(head, top, board, bottom, status, offer, tools, nav, list);
        const orientation = saved.players.b === player ? "b" : "w", bottomColor = orientation, topColor = orientation === "w" ? "b" : "w", squares = [];
        const order = [];
        for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) order.push(String.fromCharCode(97 + (orientation === "w" ? c : 7 - c)) + (orientation === "w" ? 8 - r : r + 1));
        const xy = (sq) => ({ x: order.indexOf(sq) % 8, y: Math.floor(order.indexOf(sq) / 8) });
        for (const [i, sq] of order.entries()) {
          const cell = el("div", "chess-square" + ((sq.charCodeAt(0) + Number(sq[1])) % 2 === 0 ? " dark" : ""));
          cell.dataset.square = sq;
          cell.tabIndex = 0;
          cell.setAttribute("role", "button");
          cell.setAttribute("aria-label", sq);
          if (i >= 56) cell.append(el("small", "coordinate", sq[0]));
          if (i % 8 === 0) cell.append(el("small", "coordinate rank", sq[1]));
          cell.onkeydown = (e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              pick(sq);
            }
          };
          board.append(cell);
          squares.push(cell);
        }
        const picker = el("div", "chess-promotion");
        picker.hidden = true;
        board.append(picker);
        function now() {
          return clockBase + performance.now() - localBase;
        }
        function canMove() {
          return !busy && !promotion && review === null && !saved.result && saved.players[saved.turn] === player && (clockLeft(saved, saved.turn, now()) ?? 1) > 0;
        }
        function canPremove() {
          return !busy && !promotion && review === null && !saved.result && saved.players[orientation] === player && saved.turn !== orientation;
        }
        function canSelect() {
          return canMove() || canPremove();
        }
        function queuePremove(move) {
          premove = move;
          selected = null;
          render();
        }
        function displayGame() {
          return review === null ? game : new Chess(saved.history[review]);
        }
        function coord(sq) {
          const p = xy(sq);
          return "translate(" + p.x * 100 + "%," + p.y * 100 + "%)";
        }
        function renderBoard(animation) {
          const shown = displayGame(), pos = position(shown), last = review === 0 ? null : saved.moves[(review ?? saved.moves.length) - 1], available = selected && canMove() ? game.moves({ square: selected, verbose: true }) : [];
          for (const cell of squares) {
            const sq = cell.dataset.square;
            cell.classList.toggle("last", !!last && (sq === last.from || sq === last.to));
            cell.classList.toggle("selected", sq === selected);
            cell.classList.toggle("premove", !!premove && (sq === premove.from || sq === premove.to));
            cell.classList.toggle("check", shown.isCheck() && shown.get(sq)?.type === "k" && shown.get(sq)?.color === shown.turn());
            cell.querySelector(".chess-dot")?.remove();
            const legal = available.find((m) => m.to === sq);
            if (legal) cell.append(el("span", "chess-dot" + (legal.captured ? " capture" : "")));
            cell.setAttribute("aria-label", sq + (pos[sq] ? " " + (pos[sq].color === "w" ? "White " : "Black ") + { p: "pawn", r: "rook", n: "knight", b: "bishop", q: "queen", k: "king" }[pos[sq].type] : " empty"));
          }
          if (animation && review === null) {
            const moving = pieces.get(animation.from);
            if (moving) {
              pieces.get(animation.to)?.remove();
              pieces.delete(animation.to);
              pieces.delete(animation.from);
              pieces.set(animation.to, moving);
              moving.dataset.square = animation.to;
              const old = moving.style.transform;
              moving.style.transform = coord(animation.to);
              moving.animate([{ transform: old }, { transform: coord(animation.to) }], { duration: 180, easing: "ease-out" });
            }
            if (animation.san.startsWith("O-O")) {
              const rank = animation.from[1], from = animation.to[0] === "g" ? "h" + rank : "a" + rank, to = animation.to[0] === "g" ? "f" + rank : "d" + rank, r = pieces.get(from);
              if (r) {
                pieces.delete(from);
                pieces.set(to, r);
                const old = r.style.transform;
                r.style.transform = coord(to);
                r.animate([{ transform: old }, { transform: coord(to) }], { duration: 180, easing: "ease-out" });
              }
            }
          }
          for (const [sq, piece] of pieces) if (!pos[sq]) {
            piece.remove();
            pieces.delete(sq);
          }
          for (const [sq, p] of Object.entries(pos)) {
            let piece = pieces.get(sq);
            if (!piece) {
              piece = el("div", "chess-piece");
              pieces.set(sq, piece);
              board.insertBefore(piece, picker);
            }
            if (piece.dataset.kind !== p.color + p.type) {
              piece.innerHTML = pieceSVG(p.type, p.color);
              piece.dataset.kind = p.color + p.type;
            }
            piece.dataset.square = sq;
            piece.style.transform = coord(sq);
          }
        }
        function playerRow(row, color) {
          row.replaceChildren();
          const id = saved.players[color], profile = profiles.find((p) => p.id === id) || {}, info = el("div", "chess-person-info"), avatar = profile.avatar ? el("img", "chess-avatar") : el("span", "chess-avatar", (profile.name || "Player")[0]);
          avatar.dataset.presenceId = id;
          if (profile.avatar) {
            avatar.src = profile.avatar;
            avatar.alt = "";
          }
          const detail = el("div", ""), name = el("strong", "chess-person-name", profile.name || (id === player ? "You" : color === "w" ? "White" : "Black")), captured = el("div", "chess-captured");
          const history = new Chess(saved.initialFen), counts = { w: 0, b: 0 }, caps = [];
          for (const m of saved.moves.slice(0, review ?? saved.moves.length)) {
            const made = history.move(m);
            if (made.captured) {
              const value = { p: 1, n: 3, b: 3, r: 5, q: 9 }[made.captured];
              counts[made.color] += value;
              if (made.color === color) caps.push(made.captured);
            }
            if (made.promotion) counts[made.color] += { n: 2, b: 2, r: 4, q: 8 }[made.promotion];
          }
          for (const type of caps) {
            const icon = el("span", "");
            icon.innerHTML = pieceSVG(type, color === "w" ? "b" : "w");
            captured.append(icon);
          }
          const diff = counts[color] - counts[color === "w" ? "b" : "w"];
          if (diff > 0) captured.append(el("span", "", "+" + diff));
          detail.append(name);
          if (Number.isFinite(profile.wins)) detail.append(el("small", "chess-win-total", profile.wins + " wins"));
          detail.append(captured);
          info.append(avatar, detail);
          const clock = el("div", "chess-clock");
          clock.dataset.color = color;
          row.append(info, clock);
        }
        function clocks() {
          if (disposed) return;
          for (const clock of shell.querySelectorAll(".chess-clock")) {
            const color = clock.dataset.color, left = clockLeft(saved, color, now());
            clock.textContent = left === null ? "\u221E" : Math.floor(Math.ceil(left / 1e3) / 60) + ":" + String(Math.ceil(left / 1e3) % 60).padStart(2, "0");
            clock.classList.toggle("active", !saved.result && saved.turn === color);
            clock.classList.toggle("low", left !== null && left < 1e4);
          }
          if (!saved.result && !clockRequested && performance.now() - lastTimeoutCheck > 1e3 && (clockLeft(saved, saved.turn, now()) ?? 1) <= 0) {
            clockRequested = true;
            lastTimeoutCheck = performance.now();
            act("refresh").finally(() => {
              clockRequested = false;
            });
          }
        }
        function render(animation) {
          cancelPremove.hidden = !premove;
          renderBoard(animation);
          playerRow(top, topColor);
          playerRow(bottom, bottomColor);
          clocks();
          status.classList.remove("error");
          status.textContent = saved.result ? resultText(saved.result) : review !== null ? "Reviewing move " + review : busy ? "Saving move\u2026" : game.isCheck() ? "Check \u2014 " + (saved.players[saved.turn] === player ? "your move" : "their move") : saved.players[saved.turn] === player ? "Your move" : premove ? "Premove queued \u2014 plays if legal" : "Their move";
          draw.disabled = resign.disabled = busy || !!saved.result || !Object.values(saved.players).includes(player);
          offer.replaceChildren();
          if (saved.drawOffer && !saved.result) {
            offer.append(el("span", "", saved.drawOffer === player ? "Draw offered" : "Your opponent offers a draw"));
            if (saved.drawOffer !== player && Object.values(saved.players).includes(player)) offer.append(btn("Accept", () => act("accept_draw")), btn("Decline", () => act("decline_draw")));
            draw.disabled = true;
          }
          reviewLabel.textContent = review === null ? "Live position" : "Move " + review + " / " + saved.moves.length;
          list.replaceChildren();
          saved.moves.forEach((m, i) => {
            if (i % 2 === 0) list.append(el("b", "", String(Math.floor(i / 2) + 1) + "."));
            const b = btn(m.san, () => showReview(i + 1));
            if ((review ?? saved.moves.length) === i + 1) b.classList.add("current");
            list.append(b);
          });
          if (review === null) list.scrollTop = list.scrollHeight;
        }
        function showReview(index) {
          if (busy) return;
          premove = null;
          review = index === saved.moves.length ? null : index;
          selected = null;
          promotion = null;
          picker.hidden = true;
          render();
        }
        function confirmAction(text, action) {
          offer.replaceChildren(el("span", "", text), btn("Confirm", () => act(action)), btn("Cancel", () => render()));
        }
        async function act(action) {
          if (disposed || busy) return;
          busy = true;
          try {
            const packet = await onAction(action);
            if (!disposed) {
              busy = false;
              receive(packet);
            }
          } catch (e) {
            if (!disposed) {
              status.textContent = e.message;
              status.classList.add("error");
            }
          } finally {
            busy = false;
            if (!disposed) {
              draw.disabled = resign.disabled = !!saved.result || !Object.values(saved.players).includes(player);
            }
          }
        }
        async function submit(move) {
          if (!canMove()) return;
          const base = saved.moves.length;
          let next2;
          try {
            next2 = applyMove(saved, move, player);
          } catch (e) {
            status.textContent = e.message;
            return;
          }
          busy = true;
          selected = null;
          render();
          try {
            const packet = await onMove(move, next2, base);
            if (!disposed) {
              busy = false;
              receive(packet);
            }
          } catch (e) {
            if (!disposed) {
              status.textContent = e.message;
              status.classList.add("error");
            }
          } finally {
            busy = false;
            if (!disposed) {
              renderBoard();
              draw.disabled = resign.disabled = !!saved.result || !Object.values(saved.players).includes(player);
            }
          }
        }
        function pulseSelection() {
          const cell = squares.find((c) => c.dataset.square === selected);
          if (cell) {
            cell.classList.remove("selected");
            void cell.offsetWidth;
            cell.classList.add("selected");
          }
        }
        function pick(sq) {
          if (!canSelect()) return;
          if (canPremove()) {
            if (selected && sq !== selected && game.get(sq)?.color !== orientation) {
              const piece = game.get(selected);
              if (piece?.type === "p" && (sq[1] === "8" || sq[1] === "1")) {
                promotion = { from: selected, to: sq };
                picker.replaceChildren();
                for (const type of ["q", "r", "b", "n"]) {
                  const b = btn("", () => {
                    const move = { ...promotion, promotion: type };
                    promotion = null;
                    picker.hidden = true;
                    queuePremove(move);
                  });
                  b.setAttribute("aria-label", "Premove promotion " + type);
                  b.innerHTML = pieceSVG(type, orientation);
                  picker.append(b);
                }
                picker.hidden = false;
              } else queuePremove({ from: selected, to: sq });
              return;
            }
            selected = game.get(sq)?.color === orientation ? sq : null;
            renderBoard();
            pulseSelection();
            return;
          }
          if (selected) {
            const options = game.moves({ square: selected, verbose: true }).filter((m) => m.to === sq);
            if (options.length) {
              if (options.some((m) => m.promotion)) {
                promotion = { from: selected, to: sq };
                picker.replaceChildren();
                for (const type of ["q", "r", "b", "n"]) {
                  const b = btn("", () => {
                    const m = { ...promotion, promotion: type };
                    promotion = null;
                    picker.hidden = true;
                    submit(m);
                  });
                  b.setAttribute("aria-label", "Promote to " + { q: "queen", r: "rook", b: "bishop", n: "knight" }[type]);
                  b.innerHTML = pieceSVG(type, saved.turn);
                  picker.append(b);
                }
                picker.hidden = false;
                return;
              }
              submit({ from: selected, to: sq });
              return;
            }
          }
          selected = game.get(sq)?.color === saved.turn ? sq : null;
          renderBoard();
          pulseSelection();
        }
        function squareAt(e) {
          const r = board.getBoundingClientRect(), x = Math.floor((e.clientX - r.left) / r.width * 8), y = Math.floor((e.clientY - r.top) / r.height * 8);
          return x >= 0 && x < 8 && y >= 0 && y < 8 ? order[y * 8 + x] : null;
        }
        board.onpointerdown = (e) => {
          if (!canSelect() || e.target.closest(".chess-promotion")) return;
          const sq = squareAt(e);
          if (!sq) return;
          const own = game.get(sq)?.color === orientation;
          if (!own) {
            pick(sq);
            return;
          }
          selected = sq;
          renderBoard();
          pulseSelection();
          drag = { from: sq, x: e.clientX, y: e.clientY, moved: false };
          board.setPointerCapture(e.pointerId);
        };
        board.onpointermove = (e) => {
          if (!drag) return;
          if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 5 && !drag.moved) return;
          drag.moved = true;
          const r = board.getBoundingClientRect(), piece = pieces.get(drag.from);
          piece.classList.add("dragging");
          piece.style.transform = "translate(" + (e.clientX - r.left - r.width / 16) + "px," + (e.clientY - r.top - r.height / 16) + "px)";
        };
        board.onpointerup = (e) => {
          if (!drag) return;
          const d = drag;
          drag = null;
          pieces.get(d.from)?.classList.remove("dragging");
          if (d.moved) {
            const sq = squareAt(e);
            if (sq && sq !== d.from) pick(sq);
            renderBoard();
          }
        };
        board.oncontextmenu = (e) => {
          e.preventDefault();
          premove = null;
          selected = null;
          render();
        };
        board.onkeydown = (e) => {
          if (e.key === "Escape") {
            premove = null;
            selected = null;
            render();
          }
        };
        board.onpointercancel = () => {
          if (drag) pieces.get(drag.from)?.classList.remove("dragging");
          drag = null;
          renderBoard();
        };
        function receive(packet) {
          if (disposed) return;
          const next2 = packet.state || packet, oldCount = saved.moves.length;
          if (next2.moves.length < oldCount) return;
          const validated = engine(next2);
          if (next2.players.w !== saved.players.w || next2.players.b !== saved.players.b) throw Error("Players changed");
          if (next2.moves.length === oldCount + 1) {
            const expected = applyMove({ ...saved, result: null }, next2.moves.at(-1), saved.players[saved.turn]);
            if (expected.fen !== next2.fen) throw Error("Opponent move did not validate");
          }
          const sameBoard = next2.moves.length === oldCount && next2.fen === saved.fen, sameResult = next2.result?.winner === saved.result?.winner && next2.result?.reason === saved.result?.reason, sameOffer = next2.drawOffer === saved.drawOffer;
          saved = clone(next2);
          game = validated;
          clockBase = packet.serverNow ?? now();
          localBase = performance.now();
          if (sameBoard && sameResult && sameOffer) {
            clocks();
            if (status.classList.contains("error")) {
              status.classList.remove("error");
              status.textContent = saved.result ? resultText(saved.result) : review !== null ? "Reviewing move " + review : game.isCheck() ? "Check" : saved.players[saved.turn] === player ? "Your move" : "Their move";
            }
            return;
          }
          if (!sameBoard || saved.result) {
            selected = null;
            promotion = null;
            picker.hidden = true;
            drag = null;
          }
          if (saved.result) premove = null;
          render(next2.moves.length === oldCount + 1 ? next2.moves.at(-1) : null);
          if (premove && canMove()) {
            const move = premove;
            premove = null;
            cancelPremove.hidden = true;
            try {
              applyMove(saved, move, player);
              queueMicrotask(() => {
                if (!disposed) submit(move);
              });
            } catch {
              render();
              status.textContent = "Premove cancelled: move is no longer legal.";
            }
          }
        }
        render();
        timer = setInterval(clocks, 100);
        return { receive, setWins(totals) {
          for (const p of profiles) if (totals[p.id]) p.wins = totals[p.id].chess;
          playerRow(top, topColor);
          playerRow(bottom, bottomColor);
          clocks();
        }, networkError(message) {
          status.textContent = "Connection interrupted \u2014 clocks continue. " + message;
          status.classList.add("error");
        }, getState: () => clone(saved), isBusy: () => busy, destroy() {
          disposed = true;
          clearInterval(timer);
          root.replaceChildren();
        } };
      }
      function thumbnail() {
        const div = document.createElement("div");
        div.className = "chess-thumbnail";
        div.style.cssText = "display:grid;grid-template-columns:repeat(4,1fr);overflow:hidden";
        for (let i = 0; i < 8; i++) {
          const s = document.createElement("div");
          s.style.background = (i + Math.floor(i / 4)) % 2 ? "var(--accent)" : "#f1efdf";
          s.style.display = "grid";
          s.style.placeItems = "center";
          if ([1, 2, 5, 6].includes(i)) {
            s.innerHTML = pieceSVG(i % 2 ? "n" : "k", i < 4 ? "b" : "w");
            s.firstChild.style.height = "60px";
          }
          div.append(s);
        }
        return div;
      }
      module.exports = { Chess, DEFAULT_POSITION, CONTROLS, initial, engine, applyMove, boardResult, matingMaterial, timeoutResult, clockLeft, resultText, timeLabel, pieceSVG, mount, thumbnail, STYLE };
    }
  });
  return require_chess_game();
})();
/*! Bundled license information:

chess.js/dist/cjs/chess.js:
  (**
   * @license
   * Copyright (c) 2025, Jeff Hlywa (jhlywa@gmail.com)
   * All rights reserved.
   *
   * Redistribution and use in source and binary forms, with or without
   * modification, are permitted provided that the following conditions are met:
   *
   * 1. Redistributions of source code must retain the above copyright notice,
   *    this list of conditions and the following disclaimer.
   * 2. Redistributions in binary form must reproduce the above copyright notice,
   *    this list of conditions and the following disclaimer in the documentation
   *    and/or other materials provided with the distribution.
   *
   * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
   * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
   * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
   * ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE
   * LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
   * CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
   * SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
   * INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
   * CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
   * ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
   * POSSIBILITY OF SUCH DAMAGE.
   *)
*/
