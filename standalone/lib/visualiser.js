"use strict"

var VERT_ALIGNMENT = false;
var LEFT_TO_RIGHT = true;
var ACTIVE = "#2653c9";
var NORMAL = "#7fa2ff";
var FANCY = "#cc22fc";
var POS_COLOR = "#afa2ff";
var ST_COLOR = "#bcd2ff"
var LOW_DIGITS = {0: "₀", 1: "₁", 2: "₂", 3: "₃", 4: "₄", 5: "₅",
6: "₆", 7: "₇", 8: "₈", 9: "₉", "-": "₋", "(" : "₍", ")" : "₎"};
var TREE_ = {}; // This map allows us to address the Token object given an ID

// require lib for CoNLL-U parsing
var conllu = require("conllu");

function conlluDraw(content) {
    /* Draw the tree. */
    var sent = new conllu.Sentence();
    sent.serial = content;
    changeBoxSize(sent);
    changeEdgeStyle();
    var layout = formLayout();

    var cy = window.cy = cytoscape({
        container: document.getElementById("cy"),

        boxSelectionEnabled: false,
        autounselectify: true,
        autoungrabify: true,
        userZoomingEnabled: false,
        layout: layout, 
        style: CY_STYLE,
        elements: conllu2cy(sent)
    });
}


function changeBoxSize(sent) {
    var length = sent.tokens.length;
    if (VERT_ALIGNMENT) {
        $("#cy").css("width", "1500px");
        $("#cy").css("height", (length * 50) + "px");
    } else {
        var width = getWidth(length); 
        $("#cy").css("width", width + "px");
        $("#cy").css("height", "400px");
    }
}


function getWidth(length) {
    var minWidth = 500;
    var maxWidth = 1500;
    var width = length * 200;
    if (width < minWidth) {
        width = minWidth;
    } else if (width > maxWidth) {
        width = maxWidth;
    }
    return width;
}


function formLayout() {
    var layout = {name: "grid", condense: true};
    if (VERT_ALIGNMENT) {
        layout.cols = 2;
        layout.sort = vertAlSort;
    } else {
        layout.rows = 2;
        if (LEFT_TO_RIGHT) {
            layout.sort = simpleIdSorting;
        } else {
            layout.sort = rtlSorting;
        }
    }
    return layout;
}


function changeEdgeStyle() {
    var depEdgeStyle = CY_STYLE[11]["style"];
    if (VERT_ALIGNMENT) {
        depEdgeStyle["text-margin-y"] = 0;
        depEdgeStyle["text-background-opacity"] = 1;
        depEdgeStyle["text-background-color"] = "white";
        depEdgeStyle["text-background-shape"] = "roundrectangle";
        depEdgeStyle["text-border-color"] = "black";
        depEdgeStyle["text-border-width"] = 1;
        depEdgeStyle["text-border-opacity"] = 1;
        depEdgeStyle["control-point-weights"] = "0.15 0.45 0.55 0.85";
        depEdgeStyle["text-margin-x"] = "data(length)";
        depEdgeStyle["source-distance-from-node"] = 10;
        depEdgeStyle["target-distance-from-node"] = 10;
    } else {
        depEdgeStyle["text-margin-y"] = -10;
        depEdgeStyle["text-margin-x"] = 0;
        depEdgeStyle["text-background-opacity"] = 0;
        depEdgeStyle["text-border-opacity"] = 0;
        depEdgeStyle["control-point-weights"] = "0 0.25 0.75 1";
        depEdgeStyle["source-distance-from-node"] = 0;
        depEdgeStyle["target-distance-from-node"] = 0;
    }
}

function conllu2cy(sent) {
    var graph = [];
    TREE_ = {};
    $.each(sent.tokens, function(n, token) {
        if (token instanceof conllu.MultiwordToken){
            // ns = supertoken
            var spId = "ns" + strWithZero(n);
            var id = toSubscript(" (" + findSupTokId(token.tokens) + ")");
            var MultiwordToken = {
                "data": {"id": spId,"label": token.form + id},
                "classes": "MultiwordToken"
            };
            graph.push(MultiwordToken);
            $.each(token.tokens, function(n, subTok) {
                graph = createToken(graph, subTok, spId);
            });
        } else {
            graph = createToken(graph, token);
        }
    })

    return graph;
}


function findSupTokId(subtokens) {
    return subtokens[0].id + "-" + subtokens[subtokens.length - 1].id;
}


function toSubscript(str) {
    var substr = "";
//  This causes some error about jquery and "in" and length stuff.
//    $.each(str, function(n, char) {
//        var newChar = (LOW_DIGITS[char]) ? LOW_DIGITS[char] : char;
//        substr += newChar;
//    })
    for(var i = 0; i < str.length; i++) {
        var newChar = str[i];
        if(newChar in LOW_DIGITS) {
            newChar = LOW_DIGITS[newChar];
        }
        substr += newChar;
    }
    return substr;
}


function createToken(graph, token, spId) {
    console.log('createToken() '+spId + ' / ' + token.form + ' / ' + token.upostag);
    /* Takes the tree graph, a token object and the id of the supertoken.
    Creates the wf node, the POS node and dependencies. Returns the graph. */

    // handling empty form
    // if (spId) {token.form = token.lemma};
    if (token.form == undefined) {token.form = " "};
 
    // TODO: We shouldn't need to hold information in multiple places
    // at least not like this.
    TREE_[token.id] = token;

    var nodeId = strWithZero(token.id);
    // token number
    graph.push({
        "data": {
            "id": "num" + nodeId,
            "label": +nodeId,
            "parent": spId
        },
        "classes": "tokenNumber"
    })

    var nodeWF = token;
    // nodeWF.parent = spId;
    nodeWF.length = nodeWF.form.length + "em";
    nodeWF.id = "nf" + nodeId;
    nodeWF.label = nodeWF.form;
    nodeWF.state = "normal";

    nodeWF.parent = "num" + nodeId;
    graph.push({"data": nodeWF, "classes": "wf"});

    graph = makePOS(token, nodeId, graph);
    graph = makeDependencies(token, nodeId, graph);
    return graph;
}


function makeDependencies(token, nodeId, graph) {
    /* if there is head, create an edge for dependency */
    var deprel = (token.deprel) ? token.deprel : "";
    var head = token.head; // The id of the head

    var validDep = true;

//    console.log(TREE_);
//    console.log(TREE_[head]);

    if(head in TREE_) { // for some reason we need this part
      // if the pos tag of the head is in the list of leaf nodes, then
      // mark it as an error.
      if(is_leaf(TREE_[head].upostag)) {
        console.log('[1] writeDeprel @valid=false ' + deprel);
        validDep = false;
      }
    }

    if(!is_udeprel(deprel) && deprel != "") {
      // if the deprel is not valid, mark it as an error, but 
      // don't mark it as an error if it's blank. TODO: mark 
      // arcs in grey if the deprel is blank.
      console.log('[2] writeDeprel @valid=false ' + deprel);
      validDep = false;
    }

    // Append ⊲ or ⊳ to indicate direction of the arc (helpful if 
    // there are many arcs.
    var deprelLabel = deprel;
    if(parseInt(head) < parseInt(nodeId) && LEFT_TO_RIGHT) {
      deprelLabel = deprelLabel + '⊳';
    } else if(parseInt(head) > parseInt(nodeId) && LEFT_TO_RIGHT) {
      deprelLabel = '⊲' + deprelLabel;
    } else if(parseInt(head) < parseInt(nodeId) && !LEFT_TO_RIGHT) {
      deprelLabel = '⊲' + deprelLabel;
    } else if(parseInt(head) > parseInt(nodeId) && !LEFT_TO_RIGHT) {
      deprelLabel = deprelLabel + '⊳';
    }

    if (token.head && token.head != 0) {
        var headId = strWithZero(head);
        var edgeDep = {
            "id": "ed" + nodeId,
            "source": "nf" + headId,
            "target": "nf" + nodeId,
            "length": (deprelLabel.length / 3) + "em",
            "label": deprelLabel,
            "ctrl": [55, 55, 55, 55]
        }
        var coef = (head - nodeId);
        if (!LEFT_TO_RIGHT) {coef *= -1}; // support for RTL
        if (VERT_ALIGNMENT) {edgeDep.ctrl = [90, 90, 90, 90]};
        if (Math.abs(coef) != 1) {coef *= 0.7};
        edgeDep.ctrl = edgeDep.ctrl.map(function(el){ return el*coef; });
        // if it's not valid, mark it as an error (see cy-style.js)
        if(validDep && deprel != "" && deprel != undefined) {
          graph.push({"data": edgeDep, "classes": "dependency"});
          console.log("makeDependencies(): valid @" + deprel);
        } else if (deprel == "" || deprel == undefined) {
          graph.push({"data": edgeDep, "classes": "dependency, incomplete"});
          console.log("makeDependencies(): incomplete @" + deprel);
        }else{
          graph.push({"data": edgeDep, "classes": "dependency, error"});
          console.log("makeDependencies(): error @" + deprel);
        }
        
    };

    if(is_cyclic(TREE_)) {
        console.log('[3] writeDeprel is_cyclic=true');
    }

    return graph;
}


function makePOS(token, nodeId, graph) {
    /* Creates nodes for POS and edges between wf and POS nodes */

    var pos = "";
    if (token.upostag != undefined) {
        pos = token.upostag;
    } else if (token.xpostag != undefined) {
        pos = token.xpostag;
    };

    // creating pos node
    var nodePOS = {
        "id": "np" + nodeId,
        "label": pos,
        "length": (pos.length + 1) + "em"
    }
    graph.push({"data": nodePOS, "classes": "pos"});

    // the edge from token to POS
    var edgePOS = {
        "id": "ep" + nodeId,
        "source": "nf" + nodeId,
        "target": nodePOS.id
    }
    graph.push({"data": edgePOS, "classes": "pos"});

    return graph;
}


function simpleIdSorting(n1, n2) {
    if( n1.id() < n2.id() ){
        return -1;
    } else if( n1.id() > n2.id() ){
        return 1;
    } else {
        return 0;
    }
}


function rtlSorting(n1, n2) {
    if ((n1.hasClass("wf") && n2.hasClass("wf")) // if the nodes have the same class
        || (n1.hasClass("pos") && n2.hasClass("pos"))) {
        return simpleIdSorting(n1, n2) * -1;
    } else if (n1.hasClass("wf") && n2.hasClass("pos")) {
        return -1;
    } else if (n1.hasClass("pos") && n2.hasClass("wf")) {
        return 1;
    } else {
        return 0;
    }
}


function vertAlSort(n1, n2) {
    var num1 = +n1.id().slice(2);
    var num2 = +n2.id().slice(2);
    if (num1 != num2) {
        return num1 - num2;
    } else {
        if (n1.hasClass("wf") && n2.hasClass("pos")) {
            return 1;
        } else if (n1.hasClass("pos") && n2.hasClass("wf")) {
            return -1
        } else {
            return 0;
        }
    }
}


function strWithZero(num) {
    return (String(num).length > 1) ? "" + num : "0" + num;
}


/* TODO:

var nodeWF = Object.create(token);
...
nodePOS = Object.create(token);
...

*/
