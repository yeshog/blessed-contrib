'use strict';
var blessed = require('blessed')
    , Node = blessed.Node
    , Box = blessed.Box

function Inputbox(options) {
    if (!(this instanceof Node)) {
        return new Inputbox(options);
    }
    options = options || {};
    this.options = options;
    this.inputbox = blessed.textbox({
       inputOnFocus: true,
        input: true,
        keys: true,
        mouse: true,
       screen: this.screen
    });

    Box.call(this, options);
    this.append(this.inputbox);
}

Inputbox.prototype = Object.create(Box.prototype);

Inputbox.prototype.getTextbox = function() {
    return this.inputbox;
};

Inputbox.prototype.type = 'inputbox';

module.exports = Inputbox;
