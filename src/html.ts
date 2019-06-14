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

export enum ValueType {
    ATTR,
    NODE,
}

export enum NodeValueType {
    NULL,
    TEXT,
    TEMPLATE_RESULT,
}

export enum AttrValueType {
    TEXT,
    FUNCTION,
}

/* regex */

const markRegex = /\$\_(\d)\_\$/;

/* registries */

const nodeFragmentRegistry: WeakMap<Comment, NodeFragment> = new WeakMap();
const renderRefNodeRegistry = new WeakMap<HTMLElement, Comment>();
const componentRegistry = new Map<string, any>();

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

function getNodeValueType(value): NodeValueType {
    const type = typeof value;
    if (value === null) return NodeValueType.TEXT;
    else if (type === 'boolean' || type === 'string' || type === 'number')
        return NodeValueType.TEXT;
    else if (value instanceof TemplateResult)
        return NodeValueType.TEMPLATE_RESULT;

    throw new Error(`Cant render type as NodeValue`);
}

// abstract class AttrBinding {
//     private node = this.attr.ownerElement;
//     private originalName = this.attr.name;
//     private originalValue = this.attr.value;

//     constructor(private attr: Attr) {}
// }

// class TextAttrBinding extends AttrBinding {
//     setValue(value: TemplateAttrValue) {}

//     commit() {}
// }

// class EventHandlerBinding extends AttrBinding {
//     setValue(value: TemplateNodeValue) {}

//     commit() {}
// }

class Template {
    private template!: HTMLTemplateElement;

    constructor(private strings: TemplateStringsArray) {
        const template = document.createElement('template');
        let state: ValueType = ValueType.NODE;

        template.innerHTML = this.strings
            .map((str, i) => {
                const tagStart = str.lastIndexOf('<');
                const tagEnd = str.lastIndexOf('>');

                if (tagStart > tagEnd) state = ValueType.ATTR;
                else if (tagEnd > tagStart) state = ValueType.NODE;

                const commentStart = state === ValueType.NODE ? '<!--' : '';
                const commentEnd = state === ValueType.NODE ? '-->' : '';

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

export class TemplateResult {
    static templates = new Map<TemplateStringsArray, Template>();

    public template: Template;

    constructor(
        public strings: TemplateStringsArray,
        public values: TemplateValue[],
        public key?: any,
    ) {
        let template = TemplateResult.templates.get(strings);

        if (!template) {
            template = new Template(strings);
            TemplateResult.templates.set(strings, template);
        }

        this.template = template;
    }
}

class TemplateInstance {
    private element: DocumentFragment = this.result.template.clone();

    private bindings = new Array(this.result.values.length).fill(null);

    constructor(public result: TemplateResult) {
        this.createBindings();
    }

    private createBindings() {
        const walker = document.createTreeWalker(
            this.element,
            129, // ELEMENT + COMMENT
            null,
            false,
        );
        while (walker.nextNode()) {
            const type = walker.currentNode.nodeType;
            if (type === 1)
                this.resolveAttrMarkers(walker.currentNode as Element);
            else if (type === 8)
                this.resolveNodeMarkers(walker.currentNode as Comment);
        }
    }

    private resolveAttrMarkers(node: Element) {
        Array.prototype.forEach.call(node.attributes, attr =>
            this.resolveAttr(attr),
        );
    }

    private resolveAttr(attr: Attr) {
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

    private resolveNodeMarkers(node: Comment) {
        const match = node.nodeValue.match(markRegex);
        if (!match || match.length === 0) return;

        const index = parseInt(match[1], 10);
        this.bindings[index] = {
            setValue(value) {
                mountNodeValue(value, node);
            },
            commit() {},
        };
    }

    setValues(values: TemplateValue[]) {
        this.bindings.forEach((binding, i) => binding.setValue(values[i]));
        this.bindings.forEach((binding, i) => binding.commit());
    }

    toElement() {
        return this.element;
    }
}

interface NodeBinding {
    mountedNodeRefs: Node[];
    value: TemplateNodeValue;
    createNode(): void;
    getKey(): {};
    setValue(value: TemplateNodeValue): void;
    isSame(value): boolean;
    getNode(): Node;
    // insertBefore(markNode: Element | Comment): void;
    // replace(binding: NodeBinding): void;
}

class TemplateResultNodeBinding implements NodeBinding {
    private element: DocumentFragment;

    public mountedNodeRefs: Node[];

    private instance: TemplateInstance | null;

    constructor(public value: TemplateResult, private index: number) {
        this.createNode();
    }

    createNode() {
        const templateResult = this.value as TemplateResult;
        this.instance = new TemplateInstance(templateResult);
        this.instance.setValues(templateResult.values);
        this.element = this.instance.toElement();
        this.mountedNodeRefs = [].map.call(
            this.element.children,
            child => child,
        );
    }

    getKey() {
        return this.value.key || this.index;
    }

    setValue(value) {
        this.instance.setValues(value.values);
        this.value = value;
    }

    isSame(value) {
        const type = getNodeValueType(value);

        if (type !== NodeValueType.TEMPLATE_RESULT) return false;

        if (this.instance.result.template !== value.template) return false;

        return true;
    }

    getNode(): DocumentFragment {
        return this.element;
    }
}

class StringNodeBinding {
    private element: Text;

    public mountedNodeRefs: Node[];

    constructor(public value: TemplateNodeValue, private index: number) {
        this.createNode();
    }

    createNode() {
        const value =
            this.value === null || this.value === false
                ? ''
                : escapeHTML(String(this.value));
        this.element = document.createTextNode(value);
        this.mountedNodeRefs = [this.element];
    }

    getKey() {
        return this.index;
    }

    setValue(value) {
        if (value === this.value) return;
        this.element.textContent = escapeHTML(String(value));
        this.value = value;
    }

    isSame(value) {
        const type = getNodeValueType(value);

        if (type !== NodeValueType.TEXT) return false;

        return true;
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
    private values: TemplateNodeValueArray = [];

    private bindings: NodeBinding[] = [];

    reconcile(refNode: Comment, value: TemplateNodeValue) {
        const values = toArray(value);
        const curr = this.bindings;
        const next = [];
        const fragment = document.createDocumentFragment();

        // Update existing bindings
        values.slice(0, curr.length).forEach((value, index) => {
            const binding = curr[index];

            if (binding.isSame(value)) {
                binding.setValue(value);
                next.push(binding);
            } else {
                const newBinding = createNodeBinding(value, index);
                const markNode = binding.mountedNodeRefs[0];
                const parentNode = markNode.parentNode;
                parentNode.insertBefore(newBinding.getNode(), markNode);
                binding.mountedNodeRefs.forEach(node =>
                    parentNode.removeChild(node),
                );
                next.push(newBinding);
            }
        });

        // Add new bindings
        values.slice(curr.length).forEach((value, index) => {
            const binding = createNodeBinding(value, index);
            fragment.appendChild(binding.getNode());
            next.push(binding);
        });
        refNode.parentNode.insertBefore(fragment, refNode);

        // Remove old bindings
        const parentNode = refNode.parentNode;
        curr.slice(values.length).forEach(binding => {
            binding.mountedNodeRefs.forEach(node =>
                parentNode.removeChild(node),
            );
        });

        // Set new state
        this.values = values;
        this.bindings = next;
    }
}

function createNodeBinding(
    value: TemplateNodeValue,
    index: number,
): NodeBinding {
    switch (getNodeValueType(value)) {
        case NodeValueType.TEMPLATE_RESULT:
            return new TemplateResultNodeBinding(
                value as TemplateResult,
                index,
            );
        case NodeValueType.TEXT:
            return new StringNodeBinding(value as string | number, index);
    }
}

function mountNodeValue(nodeValue: TemplateNodeValue, refNode: Comment) {
    const nodeFragment =
        nodeFragmentRegistry.get(refNode) || new NodeFragment();

    nodeFragment.reconcile(refNode, nodeValue);
    if (!nodeFragmentRegistry.has(refNode)) {
        nodeFragmentRegistry.set(refNode, nodeFragment);
    }
}

export const render = (result, node) => {
    let refNode: Comment;

    if (renderRefNodeRegistry.has(node)) {
        refNode = renderRefNodeRegistry.get(node);
    } else {
        refNode = document.createComment('root');
        node.appendChild(refNode);
        renderRefNodeRegistry.set(node, refNode);
    }

    mountNodeValue(result, refNode);

    return node;
};

export function html(strings: TemplateStringsArray, ...values: any[]) {
    return new TemplateResult(strings, values);
}

export function define(name: string, component: any) {
    componentRegistry.set(name, component);
}
