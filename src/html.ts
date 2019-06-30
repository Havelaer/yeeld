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
    TEXT,
    TEMPLATE_RESULT,
}

export enum AttrValueType {
    TEXT,
    FUNCTION,
}

/* regex */

const valueRegex = /\$v(\d)\$/;
const componentRegex = /\$c(\d)\$/;
const slotRegex = /\$s:([A-Za-z0-9]+)\$/;

/* registries */

const nodeFragmentRegistry = new WeakMap<Comment, NodeFragment>();
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

/*

html`
    <div>
        <ah-content>
            <h1>${title}</h1>
            <ah-button>${buttonText}</ah-button>
        </ah-content>
    </div>
`;

fragment =
    <div>
        <!--$c0$-->
    </div>

components
    - component: ah-content
      fragment:
            <h1>${title}</h1>
            <!--$c1$-->
    - component: ah-button
      fragment:
            <--$v0$-->


*/

class Template {
    private template!: HTMLTemplateElement;

    public components = [];

    public slotPlaceholders = {};

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
                    ? `${str}${commentStart}$v${i}$${commentEnd}`
                    : str;
            })
            .join('');

        this.template = template;

        const walker = document.createTreeWalker(
            this.template.content,
            1,
            null,
            false,
        );

        const nodeList = [];
        while (walker.nextNode()) {
            nodeList.push(walker.currentNode as Element);
        }

        const components = [];
        let index = 0;

        nodeList.reverse().forEach(node => {
            // slot
            if (node.nodeName === 'SLOT') {
                const name = node.getAttribute('name') || 'default';
                const refNode = document.createComment(`$s:${name}$`);
                node.parentNode.insertBefore(refNode, node);
                const fragment = document.createDocumentFragment();
                Array.prototype.forEach.call(node.childNodes, node => {
                    fragment.appendChild(node);
                });
                this.slotPlaceholders[name] = fragment;
                node.parentNode.removeChild(node);
                return;
            }

            if (!componentRegistry.has(node.nodeName)) return;

            // component
            const refNode = document.createComment(`$c${index}$`);
            node.parentNode.insertBefore(refNode, node);
            const slotTargets = {};
            Array.prototype.forEach.call(node.childNodes, node => {
                const slotName =
                    (node.getAttribute && node.getAttribute('slot')) ||
                    'default';
                if (!slotTargets[slotName])
                    slotTargets[slotName] = document.createDocumentFragment();
                slotTargets[slotName].appendChild(node);
            });
            node.parentNode.removeChild(node);
            components.push({
                slotTargets, // <span slot="target-name"
                component: componentRegistry.get(node.nodeName), // <test>
            });
            index++;
        });

        this.components = components;
    }

    clone() {
        return document.importNode(this.template.content, true);
    }
}

export class TemplateResult {
    static templates = new Map<TemplateStringsArray, Template>();

    public template: Template;

    public slots: any;

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

    attachSlots(slots: any) {
        this.slots = slots;
    }
}

class TemplateInstance {
    private prevCycle: SetValuesCycle | null = null;

    private element: DocumentFragment = this.result.template.clone();

    private valueBindings = new Array(this.result.values.length).fill(null);

    constructor(public result: TemplateResult) {
        this.createBindings(this.element);
    }

    private createBindings(root: Element | DocumentFragment) {
        const walker = document.createTreeWalker(root, 129, null, false); // 129: ELEMENT + COMMENT
        while (walker.nextNode()) {
            const current = walker.currentNode;
            const type = current.nodeType;
            if (type === 1) this.bindAttrMarkers(current as Element);
            else if (type === 8) this.bindNodeMarkers(current as Comment);
        }
        return root;
    }

    private bindAttrMarkers(node: Element) {
        const attrsTemplate = [];
        const cleanUp = [];

        Array.prototype.forEach.call(node.attributes, (attr: Attr, i) => {
            const match =
                attr.name.match(valueRegex) || attr.value.match(valueRegex);
            if (!match) return attrsTemplate.push({ [attr.name]: attr.value });

            const isSpread = match[0] === attr.name;
            const index = parseInt(match[1], 10);
            attrsTemplate.push(
                isSpread ? attr.name : { [attr.name]: attr.value },
            );
            this.valueBindings[index] = (cycle, value) => {
                cycle.setAttrValue(
                    node,
                    attrsTemplate,
                    i,
                    isSpread ? value : { [attr.name]: value },
                );
            };

            cleanUp.push(attr);
        });

        cleanUp.forEach(attr => node.attributes.removeNamedItem(attr.name));
    }

    private bindNodeMarkers(node: Comment) {
        const valueMatch = node.nodeValue.match(valueRegex);
        if (valueMatch && valueMatch[1]) {
            const index = parseInt(valueMatch[1], 10);
            this.valueBindings[index] = (cycle, value) => {
                cycle.setNodeValue(node, value);
            };
            return;
        }

        const componentMatch = node.nodeValue.match(componentRegex);
        if (componentMatch && componentMatch[1]) {
            const index = parseInt(componentMatch[1], 10);
            const component = this.result.template.components[index];
            const componentResult = component.component({});
            componentResult.attachSlots(component.slotTargets);
            mountNodeValue(componentResult, node);
        }

        const slotMatch = node.nodeValue.match(slotRegex);
        if (slotMatch && slotMatch[1]) {
            const slotName = slotMatch[1];
            const slotContent =
                (this.result.slots && this.result.slots[slotName]) ||
                this.result.template.slotPlaceholders[slotName];
            if (slotContent) {
                const boundSlotContent = this.createBindings(slotContent.cloneNode(true));
                node.parentNode.insertBefore(boundSlotContent, node);
            }
        }
    }

    setValues(values: TemplateValue[]) {
        const cycle = new SetValuesCycle(this.prevCycle);
        this.valueBindings.forEach((binding, i) => binding(cycle, values[i]));
        cycle.commit();
        this.prevCycle = cycle;
    }

    toElement() {
        return this.element;
    }
}

class SetValuesCycle {
    private map = new WeakMap<Element, Record<string, TemplateAttrValue>[]>();

    private attrNodes = [];

    constructor(private prevCycle: SetValuesCycle) {}

    setNodeValue(node: Comment, value: TemplateNodeValue) {
        mountNodeValue(value, node);
    }

    setAttrValue(
        node: Element,
        attrsTemplate: any[],
        index: number,
        value: Record<string, TemplateAttrValue>,
    ) {
        if (!this.map.has(node)) {
            const attrs = attrsTemplate.concat();
            this.attrNodes.push(node);
            this.map.set(node, attrs);
        }
        const attrs = this.map.get(node);
        attrs.splice(index, 1, value);
    }

    commit() {
        this.attrNodes.forEach(node => {
            const attrs = this.map.get(node);
            const attrsSquashed = Object.assign({}, ...attrs);
            const attrsSquashedPrev = this.prevCycle
                ? this.prevCycle.map.get(node)
                : {};
            this.map.set(node, attrsSquashed);

            Object.keys(attrsSquashed).forEach(attr => {
                updateAttrValue(
                    node,
                    attr,
                    attrsSquashed[attr],
                    attrsSquashedPrev[attr],
                );
            });
        });

        delete this.prevCycle;
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
        this.mountedNodeRefs = Array.prototype.map.call(
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

class StringNodeBinding implements NodeBinding {
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
        // let lastNode: Node = refNode;

        // Update existing bindings
        values.slice(0, curr.length).forEach((value, index) => {
            const binding = curr[index];

            if (binding.isSame(value)) {
                binding.setValue(value);
                next.push(binding);
                // lastNode =
                //     binding.mountedNodeRefs[binding.mountedNodeRefs.length - 1];
            } else {
                const newBinding = createNodeBinding(value, index);
                const markNode = binding.mountedNodeRefs[0];
                const parentNode = markNode.parentNode;
                parentNode.insertBefore(newBinding.getNode(), markNode);
                binding.mountedNodeRefs.forEach(node =>
                    parentNode.removeChild(node),
                );
                next.push(newBinding);
                // lastNode =
                //     newBinding.mountedNodeRefs[
                //         newBinding.mountedNodeRefs.length - 1
                //     ];
            }
        });

        // Add new bindings
        values.slice(curr.length).forEach((value, index) => {
            const binding = createNodeBinding(value, index);
            fragment.appendChild(binding.getNode());
            next.push(binding);
        });
        refNode.parentNode.insertBefore(
            fragment,
            refNode /* lastNode.nextSibling */,
        );

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

function updateAttrEventHandlerValue(
    node: Element,
    key: string,
    value: EventHandler,
    prevValue?: EventHandler,
) {
    const eventName = key.replace(/^on/, '');
    if (prevValue) node.removeEventListener(eventName, prevValue);
    node.addEventListener(eventName, value);
}

function updateAttrTextValue(
    node: Element,
    key: string,
    value: string,
    prevValue?: string,
) {
    node.setAttribute(key, value);
}

function updateAttrInputValueValue(
    node: Element,
    key: string,
    value: string,
    prevValue?: string,
) {
    if (!prevValue) node.setAttribute(key, value);
    else (node as any).value = value;
}

const booleanAttrs = ['checked', 'disabled']; // TODO add more
function updateAttrBooleanValue(
    node: Element,
    key: string,
    value: boolean,
    prevValue?: boolean,
) {
    if (value) {
        node.setAttribute(key, key); // eg. disabled="disabled"
    } else {
        node.removeAttribute(key);
    }
}

function updateAttrValue(
    node: Element,
    key: string,
    value: TemplateAttrValue,
    prevValue?: TemplateAttrValue,
) {
    if (key.startsWith('on')) {
        updateAttrEventHandlerValue(
            node,
            key,
            value as EventHandler,
            prevValue as EventHandler,
        );
    } else if (key === 'value') {
        updateAttrInputValueValue(
            node,
            key,
            value as string,
            prevValue as string,
        );
    } else if (booleanAttrs.indexOf(key) > -1) {
        updateAttrBooleanValue(
            node,
            key,
            value as boolean,
            prevValue as boolean,
        );
    } else {
        updateAttrTextValue(node, key, value as string);
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

export function html(
    strings: TemplateStringsArray,
    ...values: TemplateValue[]
) {
    return new TemplateResult(strings, values);
}

export function define(name: string, component: Function | Generator) {
    componentRegistry.set(name.toUpperCase(), component);
}
