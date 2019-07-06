export type GeneratorComponent<TProps> = (props: TProps) => RenderIterator;

export type RenderIterator = Iterator<TemplateResult | null>;

export type EventHandler = (event: Event) => void;

export type TemplateAttrValue = string | number | boolean | EventHandler;

export type TemplateAttrSpreadValue = Record<string, TemplateAttrValue>;

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

export enum TemplateNodeType {
    SLOT,
    COMPONENT,
    ELEMENT,
}

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

type AttrsDescriptor = (string | Record<string, string>)[];

/* regex */

const valueRegex = /\$v(\d)\$/;
const componentRegex = /\$c(\d)\$/;
const slotNameRegex = /^([A-Za-z0-9\_\-]+)$/;
const slotRegex = /\$s:([A-Za-z0-9\_\-]+)\$/;

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

function getTemplateNodeType(node): TemplateNodeType {
    if (componentRegistry.has(node.nodeName)) return TemplateNodeType.COMPONENT;
    else if (node.nodeName === 'SLOT') return TemplateNodeType.SLOT;
    else return TemplateNodeType.ELEMENT;
}

function assertValidSlotName(slotName: string) {
    if (valueRegex.test(slotName))
        throw new Error('Slot name can`t be variable');
    if (!slotNameRegex.test(slotName)) throw new Error('Invalid slot name');
}

function getValueIndex(str: string): number {
    const match = str.match(valueRegex);
    if (!match || !match[1]) return;
    return parseInt(match[1], 10);
}

function getComponentIndex(str: string): number {
    const match = str.match(componentRegex);
    if (!match || !match[1]) return;
    return parseInt(match[1], 10);
}

function getAttrValueIndex(attr: Record<string, string> | string): number {
    const isSpread = typeof attr === 'string';
    const valName = isSpread ? attr : attr[Object.keys(attr)[0]];
    return getValueIndex(valName);
}

function toSpread(
    descriptor: TemplateAttrSpreadValue | string,
    value: TemplateAttrValue | TemplateAttrSpreadValue,
): TemplateAttrSpreadValue {
    return (typeof descriptor === 'string'
        ? value
        : { [Object.keys(descriptor)[0]]: value }) as TemplateAttrSpreadValue;
}

function toChildNodes(fragment: DocumentFragment): Node[] {
    return Array.from(fragment.childNodes);
}

function noop() {}

/*
 * Transform attributes of node
 * 1. Create descriptor of attributes:
 *      eg: <tag attr1="foo" attr2=${val1} ${val2} />
 *      ->  [{ attr1: 'foo' }, { attr2: '$v0$'}, '$v1$']
 * 2. Remove value attributes (values and spreads) from node
 */
function transformAttrs(node: Element): AttrsDescriptor {
    const descriptor = [];
    const toRemove = [];

    Array.prototype.forEach.call(node.attributes, (attr: Attr, i) => {
        const match =
            attr.name.match(valueRegex) || attr.value.match(valueRegex);
        if (!match) return descriptor.push({ [attr.name]: attr.value });

        const isSpread = match[0] === attr.name;
        descriptor.push(isSpread ? attr.name : { [attr.name]: attr.value });

        toRemove.push(attr);
    });

    toRemove.forEach(attr => node.attributes.removeNamedItem(attr.name));

    return descriptor;
}

function debugFragment(fragment: any) {
    const div = document.createElement('div');
    div.appendChild(fragment.cloneNode(true));
    return div.innerHTML;
}

class ComponentTemplate {
    public attrsDescriptors: AttrsDescriptor[] = [];

    public slotPlaceholders: Record<string, DocumentFragment> = {};

    public subComponents: ComponentTemplate[] = [];

    public htmlOriginal: string = debugFragment(this.fragment.cloneNode(true));
    public htmlCurrent: string;

    constructor(
        public fragment: DocumentFragment,
        public name?: string,
        public propsDescriptor?: AttrsDescriptor,
    ) {
        this.process();
        this.htmlCurrent = debugFragment(this.fragment);
    }

    process() {
        const walker = document.createTreeWalker(this.fragment, 1, null, false);
        let postProcess: Function = noop;

        while (walker.nextNode()) {
            postProcess();
            const node = walker.currentNode as Element;

            switch (getTemplateNodeType(node)) {
                case TemplateNodeType.COMPONENT:
                    postProcess = this.processComponent(node);
                    break;

                case TemplateNodeType.SLOT:
                    postProcess = this.processSlot(node);
                    break;

                case TemplateNodeType.ELEMENT:
                    postProcess = this.processElement(node);
                    break;
            }
        }

        postProcess();
    }

    processComponent(node: Element) {
        const refNode = document.createComment(
            `$c${this.subComponents.length}$`,
        );
        const attrsDescriptor = transformAttrs(node);
        const fragment = document.createDocumentFragment(); // with <div slot="name"
        Array.from(node.childNodes).forEach(node => fragment.appendChild(node));
        node.parentNode.insertBefore(refNode, node);
        this.subComponents.push(
            new ComponentTemplate(fragment, node.nodeName, attrsDescriptor),
        );
        return () => node.parentNode.removeChild(node);
    }

    processSlot(node: Element) {
        const name = node.getAttribute('name') || 'default';
        /* debug */ console.log('name', name);
        assertValidSlotName(name);
        const refNode = document.createComment(`$s:${name}$`);
        const fragment = document.createDocumentFragment();
        Array.from(node.childNodes).forEach(node => fragment.appendChild(node));
        if (this.slotPlaceholders[name])
            throw new Error(`Slot ${name} allready exists`);
        this.slotPlaceholders[name] = fragment;
        node.parentNode.insertBefore(refNode, node);
        return () => node.parentNode.removeChild(node);
    }

    processElement(node: Element) {
        const attrsDescriptor = transformAttrs(node);
        this.attrsDescriptors.push(attrsDescriptor);
        return noop;
    }
}

class Template {
    private template!: HTMLTemplateElement;

    public rootComponent: ComponentTemplate;

    constructor(private strings: TemplateStringsArray) {
        this.process();
    }

    process() {
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
        this.rootComponent = new ComponentTemplate(this.template.content);
    }

    clone() {
        return document.importNode(this.template.content, true);
    }
}

export class TemplateResult {
    static templates = new Map<TemplateStringsArray, Template>();

    public template: Template;

    public childNodes: Node[];

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

    attachChildNodes(childNodes: Node[]) {
        this.childNodes = childNodes;
    }
}

interface TemplateInstancePartial {
    node: Comment;
    component: ComponentTemplate;
    childNodes: Node[];
}

class TemplateInstance {
    private prevCycle: SetValuesCycle | null = null;

    private element: DocumentFragment;

    public partials: TemplateInstancePartial[] = [];

    private valueBindings = new Array(this.result.values.length).fill(null);

    constructor(public result: TemplateResult) {
        this.element = this.createBindings(this.result.template.rootComponent);
    }

    private createBindings(component: ComponentTemplate) {
        const root = component.fragment.cloneNode(true) as DocumentFragment;
        const walker = document.createTreeWalker(root, 129, null, false); // 129: ELEMENT + COMMENT
        let elementIndex = 0;
        while (walker.nextNode()) {
            const current = walker.currentNode;
            const type = current.nodeType;
            if (type === 1)
                this.bindElementMarkers(
                    component,
                    current as Element,
                    elementIndex++,
                );
            else if (type === 8)
                this.bindCommentMarkers(component, current as Comment);
        }
        return root;
    }

    private bindElementMarkers(
        component: ComponentTemplate,
        node: Element,
        nodeIndex: number,
    ) {
        /* debug */ console.log('nodeIndex', nodeIndex);
        /* debug */ console.log('component', component);
        /* debug */ console.log('node.nodeName', node.nodeName);
        const attrsDescriptor = component.attrsDescriptors[nodeIndex];
        attrsDescriptor.forEach((attr, index) => {
            const valueIndex = getAttrValueIndex(attr);
            this.valueBindings[valueIndex] = (cycle, value) => {
                cycle.setElementAttrValue(node, attrsDescriptor, index, value);
            };
        });
    }

    private bindCommentMarkers(component: ComponentTemplate, node: Comment) {
        // TemplateValue
        const valueIndex = getValueIndex(node.nodeValue);
        if (valueIndex !== undefined) {
            this.valueBindings[valueIndex] = (cycle, value) => {
                if (value instanceof TemplateResult) {
                    value.attachChildNodes(this.result.childNodes);
                }
                cycle.setNodeValue(node, value);
            };
            return;
        }

        // Component
        const componentIndex = getComponentIndex(node.nodeValue);
        if (componentIndex !== undefined) {
            const subComponent = component.subComponents[componentIndex];

            // bind component props
            const attrsDescriptor = subComponent.propsDescriptor;
            attrsDescriptor.forEach((attr, index: number) => {
                const valueIndex = getAttrValueIndex(attr);
                this.valueBindings[valueIndex] = (cycle, value) => {
                    cycle.setComponentPropValue(
                        node,
                        attrsDescriptor,
                        index,
                        value,
                    );
                };
            });

            this.partials.push({
                node,
                component: subComponent,
                childNodes: toChildNodes(this.createBindings(subComponent)),
            });
            return;
        }

        // Slot
        const slotMatch = node.nodeValue.match(slotRegex);
        if (slotMatch && slotMatch[1]) {
            const slotName = slotMatch[1];
            const slotContent =
                // component.fragment ||
                component.slotPlaceholders[slotName];

            if (slotContent) {
                node.parentNode.insertBefore(slotContent, node);
            }
        }
    }

    setValues(values: TemplateValue[]) {
        const cycle = new SetValuesCycle(this, this.prevCycle);
        this.valueBindings.forEach((binding, i) => binding(cycle, values[i]));
        cycle.commit();
        this.prevCycle = cycle;
    }

    toElement() {
        return this.element;
    }
}

class SetValuesCycle {
    private nodesMap = new WeakMap<Element | Comment, any>();

    private elementNodes = [];

    private componentNodes = [];

    constructor(
        private instance: TemplateInstance,
        private prevCycle: SetValuesCycle,
    ) {}

    setNodeValue(node: Comment, value: TemplateNodeValue) {
        mountNodeValue(value, node);
    }

    setElementAttrValue(
        node: Element,
        attrsDescriptor: AttrsDescriptor,
        attrsDescriptorIndex: number,
        value: TemplateAttrValue | TemplateAttrSpreadValue,
    ) {
        if (!this.nodesMap.get(node)) {
            this.nodesMap.set(node, attrsDescriptor.concat());
            this.elementNodes.push(node);
        }
        const attrs = this.nodesMap.get(node);
        const descriptor = attrsDescriptor[attrsDescriptorIndex];
        const spread = toSpread(descriptor, value);
        attrs.splice(attrsDescriptorIndex, 1, spread);
    }

    setComponentPropValue(
        node: Comment,
        attrsDescriptor: AttrsDescriptor,
        attrsDescriptorIndex: number,
        value: TemplateAttrValue & TemplateNodeValue,
    ) {
        if (!this.nodesMap.get(node)) {
            this.nodesMap.set(node, attrsDescriptor.concat());
            this.componentNodes.push(node);
        }
        const attrs = this.nodesMap.get(node);
        const descriptor = attrsDescriptor[attrsDescriptorIndex];
        const spread = toSpread(descriptor, value);
        attrs.splice(attrsDescriptorIndex, 1, spread);
    }

    commit() {
        this.elementNodes.forEach(node => {
            const attrs = this.nodesMap.get(node);
            const attrsSquashed = Object.assign({}, ...attrs);
            const attrsSquashedPrev = this.prevCycle
                ? this.prevCycle.nodesMap.get(node)
                : {};
            this.nodesMap.set(node, attrsSquashed);

            Object.keys(attrsSquashed).forEach(attr => {
                updateAttrValue(
                    node,
                    attr,
                    attrsSquashed[attr],
                    attrsSquashedPrev[attr],
                );
            });
        });

        this.instance.partials.forEach(partial => {
            const attrs =
                this.nodesMap.get(partial.node) ||
                partial.component.propsDescriptor.concat();
            /* debug */ console.log('attrs', attrs);
            const props = Object.assign({}, ...attrs);
            const component = componentRegistry.get(partial.component.name);
            const componentResult = component(props);
            componentResult.attachChildNodes(partial.childNodes);
            mountNodeValue(componentResult, partial.node);
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
