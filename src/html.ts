namespace Yeeld {
    export type GeneratorComponent<TProps> = (props: TProps) => RenderIterator;

    export type RenderIterator = Iterator<TemplateResult | null>;

    export type EventHandler = (event: Event) => void;

    export type TemplateAttrValue = string | number | boolean | EventHandler;

    export type TemplateNodeValue =
        | string
        | number
        | boolean
        | TemplateResult
        | RenderIterator
        | (string | number | boolean | TemplateResult | RenderIterator)[];

    export type TemplateNodeValueArray = (
        | string
        | number
        | boolean
        | TemplateResult
        | RenderIterator)[];

    export type TemplateValue = TemplateAttrValue | TemplateNodeValue;

    export type TemplateCache = Map<TemplateStringsArray, Template>;

    export enum NodeValueType {
        TEXT,
        TEMPLATE_RESULT,
    }

    export enum AttrValueType {
        TEXT,
        FUNCTION,
    }
}

/* regex */

const markRegex = /\$\_(\d)\_\$/;

/* helper functions */

function toArray<T>(value: T | T[]): T[] {
    return Array.isArray(value) ? value : [value];
}

function escapeHTML(str: string) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function getNodeValueType(value) {
    const type = value.constructor;
    switch (type) {
        case Number:
        case String:
            return Yeeld.NodeValueType.TEXT;

        case TemplateResult:
            return Yeeld.NodeValueType.TEMPLATE_RESULT;

        default:
            throw new Error(`Cant render ${type} as NodeValue`);
    }
}

abstract class AttrBinding {
    private node = this.attr.ownerElement;
    private originalName = this.attr.name;
    private originalValue = this.attr.value;

    constructor(private attr: Attr) {}
}

class TextAttrBinding extends AttrBinding {
    setValue(value: Yeeld.TemplateAttrValue) {}

    commit() {}
}

class EventHandlerBinding extends AttrBinding {
    setValue(value: Yeeld.TemplateNodeValue) {}

    commit() {}
}

class TemplateInstance {
    private element: DocumentFragment = this.result.template.clone();

    private bindings = new Array(this.result.values.length).fill(null);

    constructor(private result: TemplateResult) {
        this.createBindings();
    }

    private createBindings() {
        /* NodeFilter.SHOW_{ELEMENT|COMMENT|TEXT} */
        const walker = document.createTreeWalker(
            this.element,
            133,
            null,
            false,
        );
        while (walker.nextNode()) {
            switch (walker.currentNode.nodeType) {
                // ELEMENT
                case 1:
                    this.bindAttributes(walker.currentNode as Element);
                    break;

                // COMMENT
                case 8:
                    this.bindNode(walker.currentNode as Comment);
                    break;
            }
        }
    }

    private bindAttributes(node: Element) {
        Array.prototype.forEach.call(node.attributes, attr => this.bindAttribute(attr))
    }

    private bindAttribute(attr: Attr) {
        const matches = attr.value.match(/\$\_(\d)\_\$/g);
        if (!matches) return;

        const node = attr.ownerElement;

        matches.forEach(match => {
            const index = parseInt(match[2], 10);

            if (attr.name.startsWith('on')) {
                this.bindings[index] = {
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
                node.removeAttribute(attr.name);
            } else {
                this.bindings[index] = {
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
    }

    private bindNode(node: Comment) {
        const match = node.nodeValue.match(markRegex);
        if (!match || match.length === 0) return;

        const index = parseInt(match[1], 10);
        this.bindings[index] = {
            setValue(value) {
                mountOrUpdateNodeValue(value, node);
            },
            commit() {},
        };
    }

    setValues(values: Yeeld.TemplateValue[]) {
        this.bindings.forEach((binding, i) => binding.setValue(values[i]));
        this.bindings.forEach((binding, i) => binding.commit());
    }

    toElement() {
        return this.element;
    }
}

export class TemplateResult {
    constructor(
        public template: Template,
        public values: Yeeld.TemplateValue[],
    ) {}
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

class NodeBinding {
    private element: Node;

    private instance: TemplateInstance;

    public type: Yeeld.NodeValueType = getNodeValueType(this.value);

    constructor(public value: Yeeld.TemplateNodeValue) {
        this.createNode();
    }

    createNode() {
        switch (this.type) {
            case Yeeld.NodeValueType.TEXT:
                this.element = document.createTextNode(
                    escapeHTML(String(this.value)),
                );
                break;

            case Yeeld.NodeValueType.TEMPLATE_RESULT:
                const templateResult = this.value as TemplateResult;
                this.instance = new TemplateInstance(templateResult);
                this.instance.setValues(templateResult.values);
                this.element = this.instance.toElement();
                break;
        }
    }

    setValue(value) {
        this.value = value;

        switch (this.type) {
            case Yeeld.NodeValueType.TEXT:
                this.element.textContent = escapeHTML(String(value));
                break;

            case Yeeld.NodeValueType.TEMPLATE_RESULT:
                this.instance.setValues(value.values);
                break;
        }
    }

    getNode(): Node {
        return this.element;
    }
}

/*
 * NodeFragment is a template value connected to the dom
 * It consists of NodeBindings
 */

class NodeFragment {
    private children: Yeeld.TemplateNodeValueArray;

    private bindings: NodeBinding[];

    private elementCounts = [];

    public isMounted = false;

    constructor(value: Yeeld.TemplateNodeValue) {
        this.children = toArray(value);
    }

    mount(markNode: Node) {
        this.bindings = this.children.map(
            value => new NodeBinding(value),
        );

        this.elementCounts = this.bindings.map(element => {
            return element instanceof DocumentFragment
                ? element.childElementCount
                : 1;
        });
        this.bindings.forEach(binding => {
            markNode.parentNode.insertBefore(binding.getNode(), markNode);
        });
        this.isMounted = true;
    }

    update(value: Yeeld.TemplateNodeValue) {
        const children = toArray(value);

        children.forEach((value, index) => {
            const binding = this.bindings[index];
            const type = getNodeValueType(value);

            if (binding.type === type) {
                binding.setValue(value);
            }
        });

    }
}

const connectedFragments: WeakMap<Comment, NodeFragment> = new WeakMap();

function mountOrUpdateNodeValue(
    nodeValue: Yeeld.TemplateNodeValue,
    markNode: Comment,
) {
    const nodeFragment =
        connectedFragments.get(markNode) || new NodeFragment(nodeValue);

    if (!nodeFragment.isMounted) {
        nodeFragment.mount(markNode);
        connectedFragments.set(markNode, nodeFragment);
    } else {
        nodeFragment.update(nodeValue);
    }
}

const renderMarks = new WeakMap<HTMLElement, Comment>();

export const render = (result, node) => {
    let markNode: Comment;

    if (renderMarks.has(node)) {
        markNode = renderMarks.get(node);
    } else {
        markNode = document.createComment('0');
        node.appendChild(markNode);
        renderMarks.set(node, markNode);
    }

    mountOrUpdateNodeValue(result, markNode);

    return node;
};

const cache: Yeeld.TemplateCache = new Map<TemplateStringsArray, Template>();

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