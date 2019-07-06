import { html, render, TemplateResult, define } from './html';

function triggerEvent(elem, event) {
    const clickEvent = new Event(event); // Create the event.
    elem.dispatchEvent(clickEvent); // Dispatch the event.
}

describe('html', () => {
    it('should return TemplateResult', () => {
        const fn = x => html`
            <h1>${x}</h1>
        `;
        const result = fn(1);
        expect(result.constructor).toBe(TemplateResult);
        expect(result.values[0]).toBe(1);
    });

    it('should return the same template reference given identical string template', () => {
        const fn = x => html`
            <h1>${x}</h1>
        `;
        const result1 = fn(1);
        const result2 = fn(2);
        expect(result1.template).toBe(result2.template);
    });
});

describe('render', () => {
    describe('primitives', () => {
        let root;

        beforeEach(() => {
            root = document.createElement('div');
        });

        it('should render plain string value', () => {
            render('hello', root);
            expect(root.textContent).toBe('hello');
        });

        it('should render array of plain string values', () => {
            render(['hello', 'hello'], root);
            expect(root.textContent).toBe('hellohello');
        });

        it('should render plain number value as strins', () => {
            render(1, root);
            expect(root.textContent).toBe('1');
        });

        it('should render array of number values as strins', () => {
            render([1, 2], root);
            expect(root.textContent).toBe('12');
        });

        it('should render null as empty string', () => {
            render(null, root);
            expect(root.textContent).toBe('');
        });

        it('should render true as "true"', () => {
            render(true, root);
            expect(root.textContent).toBe('true');
        });

        it('should render false as empty string', () => {
            render(false, root);
            expect(root.textContent).toBe('');
        });
    });

    describe('html`` node values', () => {
        describe('string', () => {
            let root;

            beforeEach(() => {
                root = document.createElement('div');
            });

            it('should render string value', () => {
                const tmpl = title => html`
                    <h1>${title}</h1>
                `;
                render(tmpl('hello'), root);
                expect(root.querySelector('h1').textContent).toBe('hello');
            });

            it('should render multiline templates', () => {
                const tmpl = (title, subtitle) => html`
                    <h1>${title}</h1>
                    <h2>${subtitle}</h2>
                `;
                render(tmpl('hello', 'world'), root);
                expect(root.querySelector('h1').textContent).toBe('hello');
                expect(root.querySelector('h2').textContent).toBe('world');
            });

            it('should render partial string value', () => {
                const tmpl = title => html`
                    <h1>foo ${title} bar</h1>
                `;
                render(tmpl('hello'), root);
                expect(root.querySelector('h1').textContent).toBe(
                    'foo hello bar',
                );
            });

            it('should render array of strings', () => {
                const tmpl = title => html`
                    <h1>foo ${[title, '-', title]} bar</h1>
                `;
                render(tmpl('hello'), root);
                expect(root.querySelector('h1').textContent).toBe(
                    'foo hello-hello bar',
                );
            });

            it('should escape string value', () => {
                const tmpl = title => html`
                    <h1>${title}</h1>
                `;
                render(tmpl('<span>title</span>'), root);
                expect(root.querySelector('h1').textContent).toBe(
                    '&lt;span&gt;title&lt;/span&gt;',
                );
            });
        });

        describe('TemplateResult', () => {
            let root;

            beforeEach(() => {
                root = document.createElement('div');
            });

            it('should render plain single template result', () => {
                const tmpl = () => html`
                    <h1>
                        ${html`
                            <span>hallo</span>
                        `}
                    </h1>
                `;
                render(tmpl(), root);
                expect(root.querySelector('h1').textContent.trim()).toBe(
                    'hallo',
                );
                expect(root.querySelector('span').textContent.trim()).toBe(
                    'hallo',
                );
            });

            it('should render single template result with values', () => {
                const tmpl = title => html`
                    <h1>
                        ${html`
                            <span>${title}</span>
                        `}
                    </h1>
                `;
                render(tmpl('hello'), root);
                expect(root.querySelector('h1').textContent.trim()).toBe(
                    'hello',
                );
                expect(root.querySelector('span').textContent.trim()).toBe(
                    'hello',
                );
            });

            it('should render nested multiline templates', () => {
                const tmpl = title => html`
                    <h1>
                        ${html`
                            <strong>${title}</strong>
                            lorem
                            <span>ipsum</span>
                        `}
                    </h1>
                    <p>Paragraph</p>
                `;
                render(tmpl('hello'), root);
                expect(root.querySelector('strong').textContent.trim()).toBe(
                    'hello',
                );
                expect(root.querySelector('span').textContent.trim()).toBe(
                    'ipsum',
                );
                expect(root.querySelector('p').textContent.trim()).toBe(
                    'Paragraph',
                );
            });

            it('should render multiple template results', () => {
                const tmpl = title => html`
                    <ul>
                        ${['one', 'two'].map(
                            i =>
                                html`
                                    <li>${i}</li>
                                `,
                        )}
                    </ul>
                `;
                render(tmpl('hello'), root);
                const lis = root.querySelectorAll('li');
                expect(lis.length).toBe(2);
                expect(lis[0].textContent.trim()).toBe('one');
                expect(lis[1].textContent.trim()).toBe('two');
            });
        });
    });

    describe('html`` attribute values', () => {
        describe('spread attributes', () => {
            let root;

            beforeEach(() => {
                root = document.createElement('div');
            });

            it('should render spread attributes', () => {
                const tmpl = (val1, val2, val3) => html`
                    <div
                        attr1="foo"
                        attr2=${val1}
                        ${val2}
                        attr3="bar"
                        attr4=${val3}
                    />
                `;
                render(
                    tmpl('111', { attr1: 'qaz', attr3: 'baz' }, '333'),
                    root,
                );
                const div = root.querySelector('div');
                expect(div.getAttribute('attr1')).toBe('qaz');
                expect(div.getAttribute('attr2')).toBe('111');
                expect(div.getAttribute('attr3')).toBe('bar');
                expect(div.getAttribute('attr4')).toBe('333');
            });
        });

        describe('text attributes', () => {
            let root;

            beforeEach(() => {
                root = document.createElement('div');
            });

            it('should render title attribute', () => {
                const tmpl = title => html`
                    <h1 title=${title}>hello</h1>
                `;
                render(tmpl('hello'), root);
                expect(root.querySelector('h1').getAttribute('title')).toBe(
                    'hello',
                );
            });
        });

        describe('boolean attributes', () => {
            let root;

            beforeEach(() => {
                root = document.createElement('div');
            });

            it('should render boolean attribute true', () => {
                const tmpl = bool => html`
                    <input disabled=${bool} checked=${bool} />
                `;
                render(tmpl(true), root);
                const input = root.querySelector('input');
                expect(input.getAttribute('disabled')).toBe('disabled');
                expect(input.disabled).toBe(true);
                expect(input.getAttribute('checked')).toBe('checked');
                expect(input.checked).toBe(true);
            });

            it('should render boolean attribute false', () => {
                const tmpl = bool => html`
                    <input disabled=${bool} checked=${bool} />
                `;
                render(tmpl(false), root);
                const input = root.querySelector('input');
                expect(input.getAttribute('disabled')).toBe(null);
                expect(input.disabled).toBe(false);
                expect(input.getAttribute('checked')).toBe(null);
                expect(input.checked).toBe(false);
            });
        });

        describe('value (input) attribute', () => {
            let root;

            beforeEach(() => {
                root = document.createElement('div');
            });

            it('should render value attribute', () => {
                const tmpl = value => html`
                    <input value=${value} />
                `;
                render(tmpl('hello'), root);
                const input = root.querySelector('input');
                expect(input.getAttribute('value')).toBe('hello');
                expect(input.value).toBe('hello');

                render(tmpl('hello changed'), root);
                // value **attr** is initial value, value **property** is current value
                expect(input.getAttribute('value')).toBe('hello');
                expect(input.value).toBe('hello changed');
            });
        });

        describe('eventHandler', () => {
            let root;

            beforeEach(() => {
                root = document.createElement('div');
            });

            it('should attach event listener', () => {
                let counter = 0;
                const fn = () => counter++;
                const tmpl = fn => html`
                    <button onclick=${fn}>hello</button>
                `;
                render(tmpl(fn), root);
                const button = root.querySelector('button');
                triggerEvent(button, 'click');
                expect(counter).toBe(1);
            });
        });
    });

    describe('html`` components', () => {
        describe('text', () => {
            let root;

            beforeEach(() => {
                root = document.createElement('div');
            });

            it('should render component', () => {
                const Component = () =>
                    html`
                        <h1>hello</h1>
                    `;

                define('test1', Component);

                render(
                    html`
                        <test1 />
                    `,
                    root,
                );
                expect(root.textContent.trim()).toBe('hello');
            });

            it('should render component props with fixed values', () => {
                const Component = props =>
                    html`
                        <h1 class=${props.class}>hello</h1>
                    `;

                define('test2', Component);

                render(
                    html`
                        <test2 class="header"></test2>
                    `,
                    root,
                );
                expect(root.querySelector('h1').getAttribute('class')).toBe(
                    'header',
                );
            });

            it('should render component props with var values', () => {
                const Component = props =>
                    html`
                        <h1 class=${props.class}>hello</h1>
                    `;

                define('test2', Component);

                render(
                    html`
                        <test2 class=${'header'}></test2>
                    `,
                    root,
                );
                expect(root.querySelector('h1').getAttribute('class')).toBe(
                    'header',
                );
            });

            it('should render mixed slot placeholders', () => {
                const Component = () =>
                    html`
                        <div class="test">
                            <slot>default slot placeholder</slot>
                            <slot name="slot1">slot1 placeholder</slot>
                            <slot name="slot2">slot2 placeholder</slot>
                        </div>
                    `;

                define('test2', Component);

                render(
                    html`
                        <test2></test2>
                    `,
                    root,
                );
                const div = root.querySelector('div');
                expect(div.textContent).toContain('default slot placeholder');
                expect(div.textContent).toContain('slot1 placeholder');
                expect(div.textContent).toContain('slot2 placeholder');
            });

            it('should render mixed slot content', () => {
                const Component = () =>
                    html`
                        <div class="test">
                            <slot>default slot placeholder</slot>
                            <slot name="slot1">slot1 placeholder</slot>
                            <slot name="slot2">slot2 placeholder</slot>
                        </div>
                    `;

                define('test2', Component);

                render(
                    html`
                        <test2>
                            <div slot="slot1">override slot1</div>
                            <span slot="slot2">override slot2</span>
                            override default slot
                        </test2>
                    `,
                    root,
                );
                const div = root.querySelector('div');
                expect(div.textContent).toContain('override default slot');
                expect(div.textContent).toContain('override slot1');
                expect(div.textContent).toContain('override slot2');
            });

            it('should render slots in nested components', () => {
                const Component = () =>
                    html`
                        <div class="comp">
                            <slot>default slot placeholder</slot>
                        </div>
                    `;

                define('test2', Component);

                render(
                    html`
                        <test2>
                            <test2>override default slot</test2>
                        </test2>
                    `,
                    root,
                );
                const div = root.querySelector('div');
                expect(div.textContent).toContain('override default slot');
            });

            xit('should render dynamicly rendered slots', () => {
                const Component = () =>
                    html`
                        <div class="comp">
                            ${html`
                                <slot>default slot placeholder</slot>
                            `}
                        </div>
                    `;

                define('test2', Component);

                render(
                    html`
                        <test2>
                            override default slot
                        </test2>
                    `,
                    root,
                );
                const div = root.querySelector('div');
                expect(div.textContent).toContain('override default slot');
            });

            it('should render dynamicly named slots', () => {
                const Component = () => html`
                    <div class="comp">
                        <slot name="test-slot">default slot placeholder</slot>
                    </div>
                `;

                define('test2', Component);

                const slotName = 'test-slot';

                render(
                    html`
                        <test2>
                            <span slot=${slotName}>override default slot</span>
                        </test2>
                    `,
                    root,
                );
                const div = root.querySelector('div');
                expect(div.textContent).toContain('override default slot');
            });
        });
    });
});

xdescribe('update', () => {
    let root;

    beforeEach(() => {
        root = document.createElement('div');
    });

    describe('string', () => {
        it('should only update string values, not the text node', () => {
            const fn = title => title;

            render(fn('hello1'), root);
            const textNode1 = root.firstChild;
            expect(root.textContent).toBe('hello1');

            render(fn('hello2'), root);
            const textNode2 = root.firstChild;
            expect(root.textContent).toBe('hello2');
            expect(textNode1).toBe(textNode2);
        });
    });

    describe('html`` node values', () => {
        describe('string', () => {
            it('should only update template result values', () => {
                const fn = title => html`
                    <h1>${title}</h1>
                `;

                render(fn('hello'), root);
                const node1 = root.querySelector('h1');

                render(fn('hello2'), root);
                const node2 = root.querySelector('h1');

                expect(node1).toBe(node2);
                expect(node2.textContent).toBe('hello2');
            });
        });
    });

    describe('varrying template values', () => {
        it('should handle updating different value types', () => {
            render('one', root);
            expect(root.textContent).toBe('one');

            render(
                html`
                    <span>two</span>
                `,
                root,
            );
            expect(root.textContent.trim()).toBe('two');

            render('three', root);
            expect(root.textContent.trim()).toBe('three');

            render(
                html`
                    <span>four</span><span>five</span>
                `,
                root,
            );
            expect(root.textContent.trim()).toBe('fourfive');

            render('six', root);
            expect(root.textContent.trim()).toBe('six');

            render(
                html`
                    ${[
                        html`
                            <span>seven</span>
                        `,
                        html`
                            <span>eight</span>
                        `,
                    ]}
                `,
                root,
            );
            expect(root.textContent.replace(/\s/g, '')).toBe('seveneight');

            render('nine', root);
            expect(root.textContent.trim()).toBe('nine');
        });

        it('should handle updating different value types lengths', () => {
            const fn = items => html`
                <ul>
                    ${items.map(
                        item =>
                            html`
                                <li>${item}</li>
                            `,
                    )}
                </ul>
            `;

            render(fn(['one']), root);
            const lis1 = root.querySelectorAll('li');
            expect(lis1[0].textContent).toBe('one');

            render(fn(['one', 'two', 'three']), root);
            const lis2 = root.querySelectorAll('li');
            expect(lis2[0].textContent).toBe('one');
            expect(lis2[1].textContent).toBe('two');
            expect(lis2[2].textContent).toBe('three');
            expect(lis1[0]).toBe(lis2[0]);

            render(fn(['one', 'two']), root);
            const lis3 = root.querySelectorAll('li');
            expect(lis2[0]).toBe(lis3[0]);
            expect(lis2[1]).toBe(lis3[1]);
            expect(lis3[0].textContent).toBe('one');
            expect(lis3[1].textContent).toBe('two');
        });
    });
});
