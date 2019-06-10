// Component types

type GeneratorComponent<TProps> = (props: TProps) => RenderIterator;

type RenderIterator = Iterator<TemplateResult | null>;

// Template types

type TemplateBinding = {
    setValue(value: TemplateValue): void;
    commit(): void;
};

type EventHandler = (event: Event) => void;

type TemplateValue =
    | string
    | number
    | boolean
    | EventHandler
    | TemplateResult
    | RenderIterator;

type TemplateCache = Map<TemplateStringsArray, Template>;

type RenderFn = (result: TemplateResult, node: HTMLElement) => TemplateInstance;

const domBindings = new WeakMap<HTMLElement, TemplateInstance>();

export const render: RenderFn = (result, node) => {
    let instance: TemplateInstance;

    if (domBindings.has(node)) {
        instance = domBindings.get(node);
        instance.setValues(result.values);
    } else {
        instance = new TemplateInstance(result);
        domBindings.set(node, instance);
        instance.setValues(result.values);
        node.appendChild(instance.toElement());
    }

    return instance;
};

enum TemplateBindingType {
    ATTR_TEXT,
    ATTR_EVENT_HANDLER,
    ATTR_STYLE,
    ATTRS,
    NODE,
}

enum NodeValueType {
    TEXT,
    TEMPLATE_RESULT,
}

enum AttrValueType {
    TEXT,
    FUNCTION,
}

abstract class AttrBinding {
    private node = this.attr.ownerElement;
    private originalName = this.attr.name;
    private originalValue = this.attr.value;

    constructor(private attr: Attr) {}
}

abstract class NodeBinding {
    constructor(private node: Node) {}
}

class TextAttrBinding extends AttrBinding implements TemplateBinding {
    setValue(value) {

    }

    commit() {

    }
}

class EventHandlerBinding extends AttrBinding implements TemplateBinding {
    setValue(value) {

    }

    commit() {

    }
}

const bindToNode = (node: Node, bindings: any[]) => {
    switch (node.nodeType) {
        // ELEMENT
        case 1: {
            const element = node as Element;
            Array.prototype.forEach.call(element.attributes, (attr: Attr) => {
                const matches = attr.value.match(/\$\_(\d)\_\$/g);
                if (!matches) return;

                matches.forEach(match => {
                    const index = parseInt(match[2], 10);

                    if (attr.name.startsWith('on')) {
                        bindings[index] = {
                            node: attr.ownerElement,
                            originalName: attr.name,
                            originalValue: attr.value,
                            eventName: attr.name.replace(/^on/, ''),
                            prevValue: null,
                            setValue(value) {
                                if (this.originalValue !== `$_${index}_$`) {
                                    throw new Error(
                                        'Cant handle interpolate function in string',
                                    );
                                }
                                if (this.prevValue) {
                                    node.removeEventListener(
                                        this.eventName,
                                        this.prevValue,
                                    );
                                }
                                node.addEventListener(this.eventName, value);
                                this.prevValue = value;
                            },
                            commit() {},
                        };
                        attr.ownerElement.removeAttribute(attr.name);
                    } else {
                        bindings[index] = {
                            node: attr.ownerElement,
                            originalName: attr.name,
                            originalValue: attr.value,
                            intermediateValue: null,
                            setValue(value) {
                                (attr as any)._value = (
                                    (attr as any)._value || this.originalValue
                                ).replace(`$_${index}_$`, value);
                                attr.value = (attr as any)._value;
                            },
                            commit() {
                                delete (attr as any)._value;
                            },
                        };
                    }
                });
            });
            break;
        }

        // node mark
        case 8:
            const match = node.nodeValue.match(/\$\_(\d)\_\$/);
            if (match) {
                const index = parseInt(match[1], 10);
                bindings[index] = {
                    prevType: null,
                    prevRef: null,
                    originalValue: node.nodeValue,
                    setValue(value) {
                        /* debug */ console.log('*** app:129 value', value);
                        const type = value.constructor.name;
                        switch (type) {
                            case 'String':
                                const text = this.originalValue.replace(
                                    `$_${index}_$`,
                                    value,
                                );
                                if (this.prevType === 'String') {
                                    this.prevRef.textContent = text;
                                } else {
                                    const textNode = document.createTextNode(
                                        text,
                                    );
                                    node.parentNode.insertBefore(
                                        textNode,
                                        node,
                                    );
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
                    commit() {},
                };
            }
            break;
    }
};

class TemplateInstance {
    private element: DocumentFragment = this.result.template.clone();

    private bindings = new Array(this.result.values.length);

    constructor(private result: TemplateResult) {
        this.createBindings();
    }

    toElement() {
        return this.element;
    }

    private createBindings() {
        const walker = document.createTreeWalker(
            this.element,
            133 /* NodeFilter.SHOW_{ELEMENT|COMMENT|TEXT} */,
            null,
            false,
        );

        const nodeList = [];
        let counter = 0;
        this.bindings.fill(null);

        while (walker.nextNode()) {
            nodeList.push(walker.currentNode);
            bindToNode(walker.currentNode, this.bindings);
            counter = counter + 1;
        }

        /* debug */ console.log('*** nodeList', nodeList);
    }

    setValues(values: TemplateValue[]) {
        this.bindings.forEach((binding, i) => {
            if (binding) {
                binding.setValue(values[i]);
            }
        });
        this.bindings.forEach((binding, i) => {
            if (binding) {
                binding.commit();
            }
        });
    }
}

export class TemplateResult {
    constructor(public template: Template, public values: TemplateValue[]) {}
}

class Template {
    private template!: HTMLTemplateElement;

    constructor(private strings: TemplateStringsArray) {
        const template = document.createElement('template');
        let state: 'ATTR' | 'NODE' = 'NODE';
        template.innerHTML = this.strings
            .map((str, i) => {
                const tagStart = str.lastIndexOf('<');
                const tagEnd = str.lastIndexOf('>');
                if (tagStart > tagEnd) state = 'ATTR';
                else if (tagEnd > tagStart) state = 'NODE';
                const [commentStart, commentEnd] =
                    state === 'NODE' ? ['<!--', '-->'] : ['', ''];
                return i < this.strings.length - 1
                    ? `${str}${commentStart}$_${i}_$${commentEnd}`
                    : str;
            })
            .join('');
        this.template = template;
    }

    clone() {
        return document.importNode(this.template.content, true);
    }
}

const cache: TemplateCache = new Map<TemplateStringsArray, Template>();

export function html(strings: TemplateStringsArray, ...values: any[]) {
    let template = cache.get(strings);

    if (!template) {
        template = new Template(strings);
        cache.set(strings, template);
    }

    return new TemplateResult(template, values);
}

const components = new Map<string, any>();

export function define(name: string, component: any) {
    components.set(name, component);
}
