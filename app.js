// Component types
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
var domBindings = new WeakMap();
export var render = function (result, node) {
    var instance;
    if (domBindings.has(node)) {
        instance = domBindings.get(node);
        instance.setValues(result.values);
    }
    else {
        instance = new TemplateInstance(result);
        domBindings.set(node, instance);
        instance.setValues(result.values);
        node.appendChild(instance.toElement());
    }
    return instance;
};
var TemplateBindingType;
(function (TemplateBindingType) {
    TemplateBindingType[TemplateBindingType["ATTR_TEXT"] = 0] = "ATTR_TEXT";
    TemplateBindingType[TemplateBindingType["ATTR_EVENT_HANDLER"] = 1] = "ATTR_EVENT_HANDLER";
    TemplateBindingType[TemplateBindingType["ATTR_STYLE"] = 2] = "ATTR_STYLE";
    TemplateBindingType[TemplateBindingType["ATTRS"] = 3] = "ATTRS";
    TemplateBindingType[TemplateBindingType["NODE"] = 4] = "NODE";
})(TemplateBindingType || (TemplateBindingType = {}));
var NodeValueType;
(function (NodeValueType) {
    NodeValueType[NodeValueType["TEXT"] = 0] = "TEXT";
    NodeValueType[NodeValueType["TEMPLATE_RESULT"] = 1] = "TEMPLATE_RESULT";
})(NodeValueType || (NodeValueType = {}));
var AttrValueType;
(function (AttrValueType) {
    AttrValueType[AttrValueType["TEXT"] = 0] = "TEXT";
    AttrValueType[AttrValueType["FUNCTION"] = 1] = "FUNCTION";
})(AttrValueType || (AttrValueType = {}));
var AttrBinding = /** @class */ (function () {
    function AttrBinding(attr) {
        this.attr = attr;
        this.node = this.attr.ownerElement;
        this.originalName = this.attr.name;
        this.originalValue = this.attr.value;
    }
    return AttrBinding;
}());
var NodeBinding = /** @class */ (function () {
    function NodeBinding(node) {
        this.node = node;
    }
    return NodeBinding;
}());
var TextAttrBinding = /** @class */ (function (_super) {
    __extends(TextAttrBinding, _super);
    function TextAttrBinding() {
        return _super !== null && _super.apply(this, arguments) || this;
    }
    TextAttrBinding.prototype.setValue = function (value) {
    };
    TextAttrBinding.prototype.commit = function () {
    };
    return TextAttrBinding;
}(AttrBinding));
var EventHandlerBinding = /** @class */ (function (_super) {
    __extends(EventHandlerBinding, _super);
    function EventHandlerBinding() {
        return _super !== null && _super.apply(this, arguments) || this;
    }
    EventHandlerBinding.prototype.setValue = function (value) {
    };
    EventHandlerBinding.prototype.commit = function () {
    };
    return EventHandlerBinding;
}(AttrBinding));
var bindToNode = function (node, bindings) {
    switch (node.nodeType) {
        // ELEMENT
        case 1: {
            var element = node;
            Array.prototype.forEach.call(element.attributes, function (attr) {
                var matches = attr.value.match(/\$\_(\d)\_\$/g);
                if (!matches)
                    return;
                matches.forEach(function (match) {
                    var index = parseInt(match[2], 10);
                    if (attr.name.startsWith('on')) {
                        bindings[index] = {
                            node: attr.ownerElement,
                            originalName: attr.name,
                            originalValue: attr.value,
                            eventName: attr.name.replace(/^on/, ''),
                            prevValue: null,
                            setValue: function (value) {
                                if (this.originalValue !== "$_" + index + "_$") {
                                    throw new Error('Cant handle interpolate function in string');
                                }
                                if (this.prevValue) {
                                    node.removeEventListener(this.eventName, this.prevValue);
                                }
                                node.addEventListener(this.eventName, value);
                                this.prevValue = value;
                            },
                            commit: function () { }
                        };
                        attr.ownerElement.removeAttribute(attr.name);
                    }
                    else {
                        bindings[index] = {
                            node: attr.ownerElement,
                            originalName: attr.name,
                            originalValue: attr.value,
                            intermediateValue: null,
                            setValue: function (value) {
                                attr._value = (attr._value || this.originalValue).replace("$_" + index + "_$", value);
                                attr.value = attr._value;
                            },
                            commit: function () {
                                delete attr._value;
                            }
                        };
                    }
                });
            });
            break;
        }
        // node mark
        case 8:
            var match = node.nodeValue.match(/\$\_(\d)\_\$/);
            if (match) {
                var index_1 = parseInt(match[1], 10);
                bindings[index_1] = {
                    prevType: null,
                    prevRef: null,
                    originalValue: node.nodeValue,
                    setValue: function (value) {
                        /* debug */ console.log('*** app:129 value', value);
                        var type = value.constructor.name;
                        switch (type) {
                            case 'String':
                                var text = this.originalValue.replace("$_" + index_1 + "_$", value);
                                if (this.prevType === 'String') {
                                    this.prevRef.textContent = text;
                                }
                                else {
                                    var textNode = document.createTextNode(text);
                                    node.parentNode.insertBefore(textNode, node);
                                    this.prevType = 'String';
                                    this.prevRef = textNode;
                                }
                                break;
                            case 'TemplateResult':
                                /* debug */ console.log('*** app value', value);
                                this.prevType = 'TemplateResult';
                                render(value, node.parentElement);
                                break;
                        }
                    },
                    commit: function () { }
                };
            }
            break;
    }
};
var TemplateInstance = /** @class */ (function () {
    function TemplateInstance(result) {
        this.result = result;
        this.element = this.result.template.clone();
        this.bindings = new Array(this.result.values.length);
        this.createBindings();
    }
    TemplateInstance.prototype.toElement = function () {
        return this.element;
    };
    TemplateInstance.prototype.createBindings = function () {
        var walker = document.createTreeWalker(this.element, 133 /* NodeFilter.SHOW_{ELEMENT|COMMENT|TEXT} */, null, false);
        var nodeList = [];
        var counter = 0;
        this.bindings.fill(null);
        while (walker.nextNode()) {
            nodeList.push(walker.currentNode);
            bindToNode(walker.currentNode, this.bindings);
            counter = counter + 1;
        }
        /* debug */ console.log('*** nodeList', nodeList);
    };
    TemplateInstance.prototype.setValues = function (values) {
        this.bindings.forEach(function (binding, i) {
            if (binding) {
                binding.setValue(values[i]);
            }
        });
        this.bindings.forEach(function (binding, i) {
            if (binding) {
                binding.commit();
            }
        });
    };
    return TemplateInstance;
}());
var TemplateResult = /** @class */ (function () {
    function TemplateResult(template, values) {
        this.template = template;
        this.values = values;
    }
    return TemplateResult;
}());
export { TemplateResult };
var Template = /** @class */ (function () {
    function Template(strings) {
        var _this = this;
        this.strings = strings;
        var template = document.createElement('template');
        var state = 'NODE';
        template.innerHTML = this.strings
            .map(function (str, i) {
            var tagStart = str.lastIndexOf('<');
            var tagEnd = str.lastIndexOf('>');
            if (tagStart > tagEnd)
                state = 'ATTR';
            else if (tagEnd > tagStart)
                state = 'NODE';
            var _a = state === 'NODE' ? ['<!--', '-->'] : ['', ''], commentStart = _a[0], commentEnd = _a[1];
            return i < _this.strings.length - 1
                ? "" + str + commentStart + "$_" + i + "_$" + commentEnd
                : str;
        })
            .join('');
        this.template = template;
    }
    Template.prototype.clone = function () {
        return document.importNode(this.template.content, true);
    };
    return Template;
}());
var cache = new Map();
export function html(strings) {
    var values = [];
    for (var _i = 1; _i < arguments.length; _i++) {
        values[_i - 1] = arguments[_i];
    }
    var template = cache.get(strings);
    if (!template) {
        template = new Template(strings);
        cache.set(strings, template);
    }
    return new TemplateResult(template, values);
}
var components = new Map();
export function define(name, component) {
    components.set(name, component);
}
